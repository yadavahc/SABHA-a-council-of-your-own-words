"""Qdrant-backed memory: memories, decisions and advisors collections.

Every piece of text is embedded locally with fastembed (BAAI/bge-small-en-v1.5, 384-d)
so nothing but vectors + payload ever reaches Qdrant.
"""
from __future__ import annotations

import contextlib
import json
import re
import warnings
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

from qdrant_client import QdrantClient, models

from . import config

warnings.filterwarnings("ignore", message=".*Payload indexes have no effect.*")
warnings.filterwarnings("ignore", message=".*symlinks on Windows.*")

MEM, DEC, ADV = "memories", "decisions", "advisors"
DIM = 384
KINDS = ["goal", "value", "fear", "plan", "fact", "past_decision"]

# --------------------------------------------------------------------------- redaction

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PHONE_RE = re.compile(r"(?<![\w])(?:\+|00)?\d[\d\s\-().]{7,}\d(?![\w])")


def redact(text: str) -> tuple[str, bool]:
    """Replace emails and phone numbers (10-15 digits) with [REDACTED]."""
    hit = False

    def _phone(m: re.Match) -> str:
        nonlocal hit
        digits = re.sub(r"\D", "", m.group(0))
        if 10 <= len(digits) <= 15:
            hit = True
            return "[REDACTED]"
        return m.group(0)

    out = PHONE_RE.sub(_phone, text)
    out2 = EMAIL_RE.sub("[REDACTED]", out)
    return out2, hit or out2 != out


# --------------------------------------------------------------------------- labelling

_RULES: list[tuple[str, re.Pattern]] = [
    ("past_decision", re.compile(r"\b(i (decided|chose|picked|went with|dropped|quit|switched|turned down|accepted)|last (year|summer|semester) i|back then i)\b")),
    ("fear", re.compile(r"\b(scared|afraid|worr(y|ied|ies)|anxious|fear|nervous|what if|terrified|stress(ed)?|keeps me up|panic)\b")),
    ("goal", re.compile(r"\b(i want to|i'd like to|i would like to|my goal|i dream|someday|in (five|5|ten|10) years|i hope to|i aim to|eventually)\b")),
    ("value", re.compile(r"\b(i believe|matters? to me|important to me|i value|i (really )?care about|doesn'?t (really )?matter|i'd rather|i would rather|don'?t want to|believe in)\b")),
    ("plan", re.compile(r"\b(i will|i'll|i'm going to|i am going to|going to|planning|plan to|next week|tomorrow|this weekend|gonna)\b")),
]
_FILLER = re.compile(r"^(um+|uh+|hmm+|okay|ok|yeah|yes|no|hello|hi|testing|test|one|two|three|so|right|like|and)$")


def classify(text: str) -> str:
    """Label a memory. Returns one of KINDS or 'noise' (skip)."""
    t = text.lower().strip()
    words = re.findall(r"[a-z']+", t)
    content = [w for w in words if not _FILLER.match(w)]
    if len(words) < 4 or len(content) < 3:
        return "noise"
    for kind, rx in _RULES:
        if rx.search(t):
            return kind
    return "fact"


# --------------------------------------------------------------------------- helpers

def fmt_date(ts: float) -> str:
    return datetime.fromtimestamp(ts, config.IST).strftime("%b %d").replace(" 0", " ")


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()


class Embedder:
    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()

    def _load(self):
        if self._model is None:
            from fastembed import TextEmbedding
            self._model = TextEmbedding(config.EMBED_MODEL, cache_dir=str(config.DATA / "models"))
        return self._model

    def embed(self, texts: list[str]) -> list[list[float]]:
        with self._lock:
            return [v.tolist() for v in self._load().embed(texts)]

    def one(self, text: str) -> list[float]:
        return self.embed([text])[0]


# --------------------------------------------------------------------------- store

class Store:
    def __init__(self) -> None:
        if config.QDRANT_URL:
            self.client = QdrantClient(url=config.QDRANT_URL, api_key=config.QDRANT_API_KEY or None, timeout=20)
            self.mode = f"server ({config.QDRANT_URL})"
        else:
            Path(config.QDRANT_PATH).mkdir(parents=True, exist_ok=True)
            self.client = QdrantClient(path=config.QDRANT_PATH)
            self.mode = f"embedded ({config.QDRANT_PATH})"
        self.emb = Embedder()
        # Embedded Qdrant is single-threaded; the HTTP client is safe to call concurrently.
        self.lock = contextlib.nullcontext() if config.QDRANT_URL else threading.RLock()
        self.last_memory_id: str | None = None
        self.ensure_collections()

    # ---- setup
    def ensure_collections(self) -> None:
        with self.lock:
            for name in (MEM, DEC, ADV):
                if not self.client.collection_exists(name):
                    self.client.create_collection(
                        name, vectors_config=models.VectorParams(size=DIM, distance=models.Distance.COSINE)
                    )
            for field, schema in (("kind", models.PayloadSchemaType.KEYWORD),
                                  ("sealed", models.PayloadSchemaType.BOOL),
                                  ("time", models.PayloadSchemaType.FLOAT)):
                try:
                    self.client.create_payload_index(MEM, field, field_schema=schema)
                except Exception:
                    pass  # embedded mode ignores indexes

    def reset(self) -> None:
        # Delete points rather than collections: embedded Qdrant on Windows can resurrect a
        # dropped collection from disk when it is re-created in the same process.
        with self.lock:
            self.ensure_collections()
            for name in (MEM, DEC, ADV):
                self.client.delete(name, points_selector=models.FilterSelector(filter=models.Filter()))
            self.last_memory_id = None

    def close(self) -> None:
        try:
            self.client.close()
        except Exception:
            pass

    def count(self, name: str = MEM) -> int:
        return self.client.count(name, exact=True).count

    # ---- memories
    def add_memory(self, text: str, *, kind: str | None = None, ts: float | None = None,
                   sealed: bool = False, source: str = "omi", check_dup: bool = True) -> dict | None:
        text = " ".join(text.split())
        clean, was_redacted = redact(text)
        label = kind or classify(clean)
        if label == "noise":
            return None
        vec = self.emb.one(clean)
        with self.lock:
            if check_dup:
                near = self.client.query_points(MEM, query=vec, limit=1, score_threshold=0.97).points
                if near:
                    return None
            mid = str(uuid.uuid4())
            ts = ts or time.time()
            payload = {"text": clean, "kind": label, "time": ts, "sealed": sealed,
                       "source": source, "redacted": was_redacted}
            self.client.upsert(MEM, [models.PointStruct(id=mid, vector=vec, payload=payload)])
            self.last_memory_id = mid
        return self._mem(mid, payload)

    @staticmethod
    def _mem(mid, p: dict, score: float | None = None) -> dict:
        d = {"id": str(mid), "text": p["text"], "kind": p["kind"], "time": p["time"],
             "date": fmt_date(p["time"]), "sealed": p.get("sealed", False),
             "source": p.get("source", ""), "redacted": p.get("redacted", False)}
        if score is not None:
            d["score"] = round(score, 3)
        return d

    def list_memories(self, limit: int = 500) -> list[dict]:
        with self.lock:
            pts, _ = self.client.scroll(MEM, limit=limit, with_payload=True)
        out = [self._mem(p.id, p.payload) for p in pts]
        return sorted(out, key=lambda m: m["time"], reverse=True)

    def memory_vectors(self, limit: int = 500) -> list[tuple]:
        with self.lock:
            pts, _ = self.client.scroll(MEM, limit=limit, with_payload=True, with_vectors=True)
        return [(str(p.id), p.vector, p.payload) for p in pts]

    def search_memories(self, query: str, k: int = 6, kinds: list[str] | None = None,
                        include_sealed: bool = True) -> list[dict]:
        must = []
        if kinds:
            must.append(models.FieldCondition(key="kind", match=models.MatchAny(any=kinds)))
        if not include_sealed:
            must.append(models.FieldCondition(key="sealed", match=models.MatchValue(value=False)))
        vec = self.emb.one(query)
        with self.lock:
            pts = self.client.query_points(MEM, query=vec, limit=k, with_payload=True,
                                           query_filter=models.Filter(must=must) if must else None).points
        return [self._mem(p.id, p.payload, p.score) for p in pts]

    def get_memory(self, mid: str) -> dict | None:
        with self.lock:
            pts = self.client.retrieve(MEM, [mid], with_payload=True)
        return self._mem(pts[0].id, pts[0].payload) if pts else None

    def set_sealed(self, mid: str, sealed: bool) -> dict | None:
        with self.lock:
            self.client.set_payload(MEM, {"sealed": sealed}, points=[mid])
        return self.get_memory(mid)

    def delete_memory(self, mid: str) -> None:
        with self.lock:
            self.client.delete(MEM, points_selector=models.PointIdsList(points=[mid]))

    def seed(self, path: Path = config.SEED_FILE, reset: bool = False) -> int:
        if reset:
            self.reset()
        items = json.loads(Path(path).read_text(encoding="utf-8"))
        n = 0
        for it in items:
            ts = datetime.fromisoformat(it["time"]).timestamp()
            if self.add_memory(it["text"], kind=it.get("kind"), ts=ts, sealed=it.get("sealed", False),
                               source="seed", check_dup=False):
                n += 1
        self.last_memory_id = None
        return n

    # ---- decisions
    def save_decision(self, d: dict) -> str:
        did = d.get("id") or str(uuid.uuid4())
        d["id"] = did
        vec = self.emb.one(d["question"])
        with self.lock:
            self.client.upsert(DEC, [models.PointStruct(id=did, vector=vec, payload=d)])
        return did

    def update_decision(self, did: str, fields: dict) -> None:
        with self.lock:
            self.client.set_payload(DEC, fields, points=[did])

    def list_decisions(self) -> list[dict]:
        with self.lock:
            pts, _ = self.client.scroll(DEC, limit=200, with_payload=True)
        return sorted([p.payload for p in pts], key=lambda d: d.get("time", 0), reverse=True)

    def find_decision(self, text: str) -> dict | None:
        """Best semantic match, preferring decisions without an outcome yet."""
        if not self.count(DEC):
            return None
        with self.lock:
            pts = self.client.query_points(DEC, query=self.emb.one(text), limit=5, with_payload=True).points
        open_ = [p for p in pts if not p.payload.get("outcome") and p.score > 0.55]
        if open_:
            return open_[0].payload
        good = [p for p in pts if p.score > 0.6]
        if good:
            return good[0].payload
        pending = [d for d in self.list_decisions() if not d.get("outcome")]
        return pending[0] if pending else None

    # ---- advisors
    @staticmethod
    def _adv_id(key: str) -> str:
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"sabha-advisor-{key}"))

    def ensure_advisors(self, defs: list[dict]) -> None:
        with self.lock:
            existing = {p.payload["key"] for p in self.client.scroll(ADV, limit=50, with_payload=True)[0]}
        missing = [a for a in defs if a["key"] not in existing]
        if not missing:
            return
        vecs = self.emb.embed([a["persona"] for a in missing])
        with self.lock:
            self.client.upsert(ADV, [
                models.PointStruct(id=self._adv_id(a["key"]), vector=v, payload={
                    "key": a["key"], "name": a["name"], "weight": 1.0, "times_right": 0, "total": 0})
                for a, v in zip(missing, vecs)])

    def get_advisors(self) -> dict[str, dict]:
        with self.lock:
            pts, _ = self.client.scroll(ADV, limit=50, with_payload=True)
        return {p.payload["key"]: p.payload for p in pts}

    def update_advisor(self, key: str, fields: dict) -> None:
        with self.lock:
            self.client.set_payload(ADV, fields, points=[self._adv_id(key)])
