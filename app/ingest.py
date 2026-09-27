"""Speech ingestion shared by Omi webhooks, the web mic, the text box and /simulate.

"Sabha, ..." => command.  Anything else => memory (redact -> label -> Qdrant), unless off the record.
"""
from __future__ import annotations

import asyncio
import re
import time
from collections import OrderedDict

from .debate import Council
from .hub import hub
from .memory import Store, _norm, classify, redact

WAKE_RE = re.compile(
    r"\b(?:hey\s+|okay\s+|ok\s+)?(?:sabha+|sabah|saba|sabbha|sabbah|sobha|subha|sahba|sabra|sabhaa)\b[\s,.:;!?-]*",
    re.I)
SENT_RE = re.compile(r"(?<=[.!?])(?<!\bProf\.)(?<!\bDr\.)(?<!\bMr\.)(?<!\bMs\.)(?<!\bMrs\.)(?<!\bSt\.)(?<!\bvs\.)\s+")


def parse_command(text: str) -> tuple[str, str]:
    t = text.strip().strip(" ,.!").strip()
    low = t.lower()
    if re.search(r"\b(off the record|go private|stop recording)\b", low):
        return "off", ""
    if re.search(r"\b(back on|on the record|resume recording)\b", low):
        return "on", ""
    if re.search(r"\b(seal (that|it|this|the last)|make (that|it) private|keep (that|it) private)\b", low):
        return "seal", ""
    if re.match(r"^(should|shall|would|is it better|what should|which)\b", low):
        return "ask", t
    if re.search(r"\b(next round|continue|go on|proceed|move on)\b", low):
        return "next", ""
    if re.search(r"\b(track record|my record|scoreboard|how (have|are) you (been )?doing)\b", low):
        return "track", ""
    if re.search(r"\b(stop|cancel|end) (the )?(debate|discussion|session)\b", low):
        return "stop", ""
    m = re.search(r"\bi (?:also |really )?care (?:a lot )?about (.+)", t, re.I)
    if m:
        return "care", m.group(1).strip(" .")
    if re.search(r"\b(went|turned out|worked out|is going|was)\s+(really\s+)?(well|badly|great|good|bad|terribl\w*|amazing|awful|fine|poorly)\b", low):
        return "outcome", t
    if " or " in low or re.match(r"^(do i|can i)\b", low):
        return "ask", t
    return "unknown", t


class Ingest:
    def __init__(self, store: Store, council: Council) -> None:
        self.store = store
        self.council = council
        self.off_record = False
        self.sessions: dict[str, dict] = {}
        self.recent: OrderedDict[str, float] = OrderedDict()   # normalised text -> ts (for memory-created dedupe)
        self.last_phone_at = 0.0
        self.last_source = ""
        self.ever_phone = False

    # ------------------------------------------------------------------ status
    def link_status(self) -> dict:
        age = time.time() - self.last_phone_at
        state = "waiting" if not self.ever_phone else ("live" if age < 30 else "idle")
        return {"state": state, "source": self.last_source, "age": round(age) if self.ever_phone else None,
                "off_record": self.off_record}

    def _remember(self, norm: str) -> None:
        self.recent[norm] = time.time()
        while len(self.recent) > 500:
            self.recent.popitem(last=False)

    # ------------------------------------------------------------------ realtime segments
    async def realtime(self, session_id: str, segments: list[dict], source: str = "phone") -> int:
        sess = self.sessions.setdefault(session_id, {"segs": OrderedDict(), "done": {}, "norms": set(), "timer": None})
        fresh = 0
        for seg in segments:
            text = " ".join(str(seg.get("text", "")).split())
            if not text:
                continue
            try:
                key = round(float(seg.get("start", 0)) * 2) / 2
            except (TypeError, ValueError):
                key = time.time()
            norm = _norm(text)
            if sess["segs"].get(key) == text or norm in sess["norms"]:
                continue  # duplicate delivery
            sess["segs"][key] = text
            sess["norms"].add(norm)
            self._remember(norm)
            fresh += 1
            shown, _ = redact(text)
            await hub.emit("phone", text=shown, speaker=seg.get("speaker", ""), is_user=seg.get("is_user", True),
                           source=source, session_id=session_id)
        if fresh:
            self.last_phone_at = time.time()
            self.last_source = source
            if source in ("phone", "simulate"):
                self.ever_phone = True
            await hub.emit("omi_status", **self.link_status())
            if sess["timer"]:
                sess["timer"].cancel()
            sess["timer"] = asyncio.create_task(self._flush_later(session_id, source))
        return fresh

    async def _flush_later(self, session_id: str, source: str, delay: float = 1.6) -> None:
        await asyncio.sleep(delay)
        sess = self.sessions[session_id]
        parts = []
        for key, text in sess["segs"].items():
            done = sess["done"].get(key)
            if done == text:
                continue
            parts.append(text[len(done):] if done and text.startswith(done) else text)
            sess["done"][key] = text
        if parts:
            await self.handle_text(" ".join(parts), source)

    # ------------------------------------------------------------------ text => commands / memories
    def split(self, text: str) -> list[tuple[str, str]]:
        """-> [("memory", text) | ("command", text)] in spoken order."""
        out: list[tuple[str, str]] = []
        matches = list(WAKE_RE.finditer(text))
        if not matches:
            return [("memory", text)]
        if matches[0].start() > 0:
            out.append(("memory", text[:matches[0].start()]))
        for i, m in enumerate(matches):
            region = text[m.end(): matches[i + 1].start() if i + 1 < len(matches) else len(text)].strip()
            sents = [s for s in SENT_RE.split(region) if s.strip(" .,!?")]
            if not sents:
                continue
            out.append(("command", sents[0]))
            if len(sents) > 1:
                out.append(("memory", " ".join(sents[1:])))
        return out

    async def handle_text(self, text: str, source: str, allow_commands: bool = True) -> None:
        for kind, chunk in self.split(text):
            if kind == "command":
                if allow_commands:
                    await self.command(chunk, source)
            else:
                await self.store_memories(chunk, source)

    async def store_memories(self, text: str, source: str, dup_threshold_note: str = "") -> list[dict]:
        sents = [s.strip() for s in SENT_RE.split(text) if s.strip()]
        merged: list[str] = []
        for s in sents:
            if merged and len(s.split()) < 5:
                merged[-1] += " " + s
            else:
                merged.append(s)
        saved = []
        for s in merged:
            if self.off_record:
                await hub.emit("memory_skipped", text="(off the record)", reason="off_record")
                continue
            if classify(redact(s)[0]) == "noise":
                await hub.emit("memory_skipped", text=s, reason="noise")
                continue
            mem = await asyncio.to_thread(self.store.add_memory, s, source=source)
            if mem:
                saved.append(mem)
                await hub.emit("memory_added", memory=mem)
        return saved

    async def command(self, text: str, source: str) -> None:
        cmd, arg = parse_command(text)
        await hub.emit("command", cmd=cmd, text=text, source=source)
        if cmd == "ask":
            await self.council.ask(arg)
        elif cmd == "next":
            await self.council.next_round()
        elif cmd == "stop":
            await self.council.stop()
        elif cmd == "care":
            line = f"I also care about {arg}."
            if self.off_record:
                mem = {"id": f"tmp-{time.time()}", "text": line, "kind": "value", "time": time.time(),
                       "date": "now", "sealed": False, "source": source, "redacted": False}
            else:
                mem = await asyncio.to_thread(self.store.add_memory, line, kind="value", source=source, check_dup=False)
                await hub.emit("memory_added", memory=mem)
            await self.council.interject(mem)
        elif cmd == "seal":
            mid = self.store.last_memory_id
            if not mid:
                await hub.emit("toast", text="Nothing recent to seal.")
                return
            mem = await asyncio.to_thread(self.store.set_sealed, mid, True)
            await hub.emit("memory_updated", memory=mem)
            await hub.emit("toast", text=f"🔒 Sealed: advisors may reason with it but never quote it.")
        elif cmd in ("off", "on"):
            self.off_record = cmd == "off"
            await hub.emit("omi_status", **self.link_status())
            await hub.emit("toast", text="Off the record — nothing is being saved." if self.off_record
                           else "Back on the record.")
        elif cmd == "outcome":
            await self.council.record_outcome(arg)
        elif cmd == "track":
            await self.council.track_record()
        else:
            await hub.emit("toast", text=f"Didn't catch a command in: “{text}”")

    # ------------------------------------------------------------------ day summary (daily recap)
    async def day_summary(self, body: dict) -> dict:
        sj = body.get("summary_json")
        if not isinstance(sj, dict):
            try:
                import ast
                sj = ast.literal_eval(body.get("summary") or "{}")
            except Exception:
                sj = {}
        day = sj.get("date", "today")
        items: list[tuple[str, str]] = []
        if sj.get("headline"):
            items.append((f"Day recap ({day}): {sj['headline']}", "fact"))
        for x in sj.get("decisions_made") or []:
            if x.get("decision"):
                items.append((f"On {day} I decided: {x['decision']}", "past_decision"))
        for x in sj.get("unresolved_questions") or []:
            if x.get("question"):
                items.append((f"Still unresolved ({day}): {x['question']}", "plan"))
        for x in (sj.get("highlights") or [])[:4]:
            if x.get("summary"):
                items.append((f"{x.get('topic', 'Highlight')} ({day}): {x['summary']}", "fact"))
        saved = []
        if not self.off_record:
            for text, kind in items:
                mem = await asyncio.to_thread(self.store.add_memory, text, kind=kind, source="omi-day-summary")
                if mem:
                    saved.append(mem)
                    await hub.emit("memory_added", memory=mem)
        await hub.emit("toast", text=f"🌙 Omi day summary for {day}: {len(saved)} memories saved")
        return {"saved": len(saved)}

    # ------------------------------------------------------------------ memory-created (full conversation)
    async def conversation(self, conv: dict) -> dict:
        segs = conv.get("transcript_segments") or []
        new_texts = []
        for s in segs:
            t = " ".join(str(s.get("text", "")).split())
            n = _norm(t)
            if not t or n in self.recent:
                continue
            self._remember(n)
            new_texts.append(t)
        saved = []
        if new_texts:
            for kind, chunk in self.split(" ".join(new_texts)):
                if kind == "memory":   # commands were (or should have been) handled live
                    saved += await self.store_memories(chunk, "omi-conversation")
        title = (conv.get("structured") or {}).get("title") or "conversation"
        await hub.emit("toast", text=f"Omi synced “{title}”: {len(segs)} segments, {len(saved)} new memories "
                                     f"({len(segs) - len(new_texts)} duplicates skipped).")
        return {"segments": len(segs), "new": len(saved)}
