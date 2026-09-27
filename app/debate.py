"""The council: debate orchestration, weighted voting, verdicts, and outcome learning."""
from __future__ import annotations

import asyncio
import re
import time
import traceback
import uuid
from datetime import datetime

from . import config, offline
from .agents import ADVISOR_KEYS, ADVISORS, BY_KEY, EXTRA
from .hub import hub
from .lyzr import lyzr
from .memory import Store, fmt_date
from .omi_api import write_back

WORD_RE = re.compile(r"[a-z0-9']+")


def _ngrams(text: str, n: int = 4) -> set[tuple]:
    w = WORD_RE.findall(text.lower())
    return {tuple(w[i:i + n]) for i in range(len(w) - n + 1)}


def guard_say(say: str, sealed_texts: list[str], used_memory: bool, max_words: int = 60) -> str:
    """Enforce: no quoting sealed memories, <= max_words, and 'guess' when nothing backs the claim."""
    say = " ".join(str(say or "").split())
    if sealed_texts:
        grams = set().union(*(_ngrams(t) for t in sealed_texts))
        parts = re.split(r"(?<=[.!?])\s+", say)
        say = " ".join(p if not (_ngrams(p) & grams) else "(I'm drawing on a private memory here.)" for p in parts)
    words = say.split()
    if len(words) > max_words:
        say = " ".join(words[:max_words]).rstrip(",;") + "…"
    if not used_memory and "guess" not in say.lower():
        say += " (That's my guess.)"
    return say


def tipping_point(votes: dict, totals: dict, winner: str) -> dict:
    """What would have flipped the verdict? (one advisor switching sides, or a weight change)."""
    others = sorted((o for o in totals if o != winner), key=lambda o: -totals[o])
    if not others:
        return {"label": "unanimous", "flips": [], "text": "Unanimous: nothing short of new evidence flips this."}
    runner = others[0]
    gap = totals[winner] - totals[runner]
    total = sum(totals.values()) or 1
    flips = []
    for k, v in sorted(votes.items(), key=lambda kv: -kv[1]["value"]):
        name = BY_KEY[k]["name"] if k == "future_you" else f"the {BY_KEY[k]['name']}"
        if v["option"] == winner and 2 * v["value"] > gap:
            flips.append({"advisor": k, "kind": "switch", "text": f"If {name} switched to {runner}, {runner} would win."})
        elif v["option"] == runner and v["confidence"] > 0:
            need = v["weight"] + gap / v["confidence"] + 0.01
            if need <= 3.0:
                flips.append({"advisor": k, "kind": "weight",
                              "text": f"If {name}'s weight rose from {v['weight']:.2f} to {need:.2f}, {runner} would win."})
    margin = gap / total
    label = "close call" if margin < 0.15 else ("clear lean" if margin < 0.4 else "strong consensus")
    text = flips[0]["text"] if flips else f"No single advisor could flip this: {winner} leads by {gap:.2f} votes."
    return {"runner_up": runner, "gap": round(gap, 2), "margin": round(margin, 2), "label": label,
            "flips": flips[:3], "text": text}


class Debate:
    def __init__(self, question: str) -> None:
        self.id = str(uuid.uuid4())
        self.question = question
        self.options: list[str] = []
        self.favourite: str | None = None
        self.phase = "starting"
        self.statements: dict[int, dict[str, dict]] = {1: {}, 2: {}}
        self.interjections: list[dict] = []
        self.biases: list[dict] = []
        self.short: dict[str, dict] = {}      # "m3" -> memory
        self.short_of: dict[str, str] = {}    # memory id -> "m3"
        self.votes: dict[str, dict] = {}
        self.result: dict | None = None
        self.started = time.time()
        self.past: list[dict] = []

    def tag(self, mems: list[dict]) -> list[dict]:
        out = []
        for m in mems:
            if m["id"] not in self.short_of:
                s = f"m{len(self.short) + 1}"
                self.short_of[m["id"]] = s
                self.short[s] = m
            out.append({**m, "short": self.short_of[m["id"]]})
        return out

    def snapshot(self) -> dict:
        return {"id": self.id, "question": self.question, "options": self.options, "favourite": self.favourite,
                "phase": self.phase, "statements": self.statements, "votes": self.votes, "result": self.result,
                "biases": self.biases}


def card(m: dict) -> dict:
    return {"id": m["id"], "short": m.get("short"), "date": m["date"], "kind": m["kind"], "sealed": m["sealed"],
            "text": None if m["sealed"] else m["text"]}


def llm_mem(m: dict) -> dict:
    return {"id": m["short"], "date": m["date"], "kind": m["kind"], "sealed": m["sealed"], "text": m["text"]}


class Council:
    def __init__(self, store: Store) -> None:
        self.store = store
        self.current: Debate | None = None
        self.task: asyncio.Task | None = None
        self.advance = asyncio.Event()

    # ------------------------------------------------------------------ controls
    async def ask(self, question: str) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
            await hub.emit("toast", text="Previous debate stopped — new question on the table.")
        self.advance = asyncio.Event()
        self.current = Debate(question)
        self.task = asyncio.create_task(self._run(self.current))

    async def next_round(self) -> None:
        self.advance.set()
        await hub.emit("toast", text="Moving to the next round.")

    async def stop(self) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
            await hub.emit("debate_stopped")

    async def interject(self, mem: dict) -> None:
        d = self.current
        if d and self.task and not self.task.done():
            d.interjections.append(mem)
            await hub.emit("interjection", text=mem["text"], memory=card(mem), phase=d.phase)
        else:
            await hub.emit("toast", text=f"Noted as a value: {mem['text']}")

    # ------------------------------------------------------------------ helpers
    def _mems(self, query: str, k: int, kinds=None) -> list[dict]:
        return self.store.search_memories(query, k=k, kinds=kinds)

    async def _retrieve(self, d: Debate, adv: dict) -> list[dict]:
        q = f"{d.question} {' '.join(d.options)} {adv['focus']}"
        mems = await asyncio.to_thread(self._mems, q, 6, adv["kinds"])
        if adv["kinds"]:
            mems += await asyncio.to_thread(self._mems, d.question, 2)
        mems += d.interjections
        seen, out = set(), []
        for m in mems:
            if m["id"] not in seen:
                seen.add(m["id"])
                out.append(m)
        return d.tag(out[:9])

    def _past_decisions(self) -> list[dict]:
        return [{"question": x["question"], "verdict": x.get("verdict"), "outcome": x.get("outcome")}
                for x in self.store.list_decisions()[:5]]

    # ------------------------------------------------------------------ agents
    async def _moderate(self, d: Debate) -> dict:
        mems = d.tag(await asyncio.to_thread(self._mems, d.question, 10))
        payload = {"QUESTION": d.question, "MEMORIES": [llm_mem(m) for m in mems], "USER": config.USER_NAME}
        out = await lyzr.chat("moderator", payload, d.id, "moderate") if lyzr.enabled else None
        fallback = offline.moderator(d.question, mems)
        if not out or not isinstance(out.get("options"), list) or len(out["options"]) < 2:
            if lyzr.enabled:
                await hub.emit("agent_log", agent="moderator", phase="moderate", ok=True, mode="offline", ms=0,
                               preview="fallback: parsed options locally")
            out = fallback
        out["options"] = [str(o)[:32] for o in out["options"][:4]]
        out["favourite"] = offline.match_option(out.get("favourite"), out["options"]) if out.get("favourite") \
            else fallback["favourite"]
        return out

    async def _advisor_turn(self, d: Debate, adv: dict, rnd: int) -> dict:
        key = adv["key"]
        mems = await self._retrieve(d, adv)
        new = d.tag(d.interjections) if rnd == 2 else []
        t0 = time.time()
        out = None
        if lyzr.enabled:
            payload = {
                "ROUND": rnd, "QUESTION": d.question, "OPTIONS": d.options, "FAVOURITE": d.favourite,
                "TODAY": fmt_date(time.time()), "USER": config.USER_NAME,
                "MEMORIES": [llm_mem(m) for m in mems],
                "PAST_DECISIONS": d.past,
            }
            if rnd == 2:
                payload["ROUND_1"] = [{"advisor": k, "say": s["say"], "vote": s["vote"]} for k, s in d.statements[1].items()]
                payload["BIAS_RADAR"] = d.biases
                if new:
                    payload["NEW_FROM_USER"] = [llm_mem(m) for m in new]
            out = await lyzr.chat(key, payload, d.id, f"round {rnd}")
        mode = "lyzr"
        if not out or "say" not in out:
            mode = "offline"
            out = offline.advisor(adv, rnd, d.options, d.favourite, mems, self.store.emb.one, d.statements[1], new)
            await hub.emit("agent_log", agent=key, phase=f"round {rnd}", ok=True, mode="offline",
                           ms=int((time.time() - t0) * 1000), preview=out["say"][:200])
        used = [d.short[s] for s in (out.get("memory_ids") or []) if isinstance(s, str) and s in d.short]
        sealed_texts = [m["text"] for m in mems if m["sealed"]]
        try:
            conf = float(out.get("confidence", 0.6))
        except (TypeError, ValueError):
            conf = 0.6
        replies_to = out.get("replies_to")
        if rnd == 2 and (replies_to not in ADVISOR_KEYS or replies_to == key):
            opp = [k for k, s in d.statements[1].items() if k != key and s["vote"] != out.get("vote")]
            replies_to = (opp or [k for k in ADVISOR_KEYS if k != key])[0]
        return {
            "advisor": key, "round": rnd, "mode": mode,
            "say": guard_say(out["say"], sealed_texts, bool(used)),
            "vote": offline.match_option(out.get("vote"), d.options),
            "confidence": round(max(0.3, min(conf, 1.0)), 2),
            "memories": [card({**m, "short": d.short_of.get(m["id"])}) for m in used],
            "replies_to": replies_to if rnd == 2 else None,
        }

    async def _bias(self, d: Debate) -> dict:
        mems = await asyncio.to_thread(self._mems, d.question, 8)
        mems += await asyncio.to_thread(self._mems, "money loan EMI worry afraid already paid everyone relatives", 6)
        mems += await asyncio.to_thread(self._mems, d.question, 4, ["past_decision", "value"])
        uniq = {m["id"]: m for m in mems}
        mems = d.tag(list(uniq.values()))
        out = None
        if lyzr.enabled:
            payload = {"QUESTION": d.question, "OPTIONS": d.options, "MEMORIES": [llm_mem(m) for m in mems],
                       "ROUND_1": [{"advisor": k, "say": s["say"], "vote": s["vote"]} for k, s in d.statements[1].items()]}
            out = await lyzr.chat("bias_radar", payload, d.id, "bias scan")
        if not out or not isinstance(out.get("biases"), list):
            out = offline.bias(mems)
            await hub.emit("agent_log", agent="bias_radar", phase="bias scan", ok=True, mode="offline", ms=0,
                           preview=out["say"][:200])
        sealed_texts = [m["text"] for m in mems if m["sealed"]]
        biases = []
        for b in out["biases"][:3]:
            if not isinstance(b, dict):
                continue
            used = [d.short[s] for s in (b.get("memory_ids") or []) if isinstance(s, str) and s in d.short]
            biases.append({"name": str(b.get("name", "Bias"))[:40],
                           "evidence": guard_say(b.get("evidence", ""), sealed_texts, True, 30),
                           "memories": [card({**m, "short": d.short_of[m["id"]]}) for m in used]})
        return {"biases": biases, "say": guard_say(out.get("say", ""), sealed_texts, True)}

    async def _scribe(self, d: Debate, winner: str, confidence: float, final: dict) -> dict:
        out = None
        if lyzr.enabled:
            payload = {"QUESTION": d.question, "OPTIONS": d.options, "WINNER": winner,
                       "CONFIDENCE": round(confidence, 2),
                       "STATEMENTS": [{"advisor": k, "round": s["round"], "say": s["say"], "vote": s["vote"]}
                                      for k, s in final.items()],
                       "BIASES": d.biases, "NEW_FROM_USER": [m["text"] for m in d.interjections]}
            out = await lyzr.chat("scribe", payload, d.id, "verdict")
        if not out or "summary" not in out:
            out = offline.scribe(d.question, d.options, winner, confidence, final, d.biases)
            await hub.emit("agent_log", agent="scribe", phase="verdict", ok=True, mode="offline", ms=0,
                           preview=out["summary"][:200])
        return out

    # ------------------------------------------------------------------ flow
    async def _set_phase(self, d: Debate, phase: str, label: str) -> None:
        d.phase = phase
        await hub.emit("phase", phase=phase, label=label, debate_id=d.id)

    async def _run(self, d: Debate) -> None:
        try:
            await hub.emit("debate_start", debate_id=d.id, question=d.question)
            await self._set_phase(d, "moderate", "The Moderator frames the question")
            mod = await self._moderate(d)
            d.options, d.favourite = mod["options"], mod["favourite"]
            d.past = await asyncio.to_thread(self._past_decisions)
            await hub.emit("moderator", text=mod.get("intro") or f"Options: {' or '.join(d.options)}.",
                           options=d.options, favourite=d.favourite, question=mod.get("question", d.question))
            await hub.wait_playback()

            # Round 1
            await self._set_phase(d, "round1", "Round 1 · Opening views")
            for s in await asyncio.gather(*(self._advisor_turn(d, a, 1) for a in ADVISORS)):
                d.statements[1][s["advisor"]] = s
                await hub.emit("advisor_say", **s)
            await hub.wait_playback()

            # Bias Radar
            await self._set_phase(d, "bias", "Bias Radar scans your reasoning")
            b = await self._bias(d)
            d.biases = b["biases"]
            await hub.emit("bias", **b)
            await hub.wait_playback()

            # Pause for "Sabha, next round" / interjections
            if not self.advance.is_set():
                wait = config.AUTO_ADVANCE_SECONDS
                await self._set_phase(d, "awaiting", "Add a thought, or say “Sabha, next round”")
                await hub.emit("awaiting_next", seconds=wait)
                try:
                    await asyncio.wait_for(self.advance.wait(), wait if wait > 0 else None)
                except asyncio.TimeoutError:
                    pass

            # Round 2
            await self._set_phase(d, "round2", "Round 2 · The advisors answer each other")
            line = "Round two. Answer each other."
            if d.interjections:
                line = f"Round two. You've added something new — {d.interjections[-1]['text']}. Advisors, weigh it."
            await hub.emit("moderator", text=line, options=d.options, favourite=d.favourite)
            for s in await asyncio.gather(*(self._advisor_turn(d, a, 2) for a in ADVISORS)):
                d.statements[2][s["advisor"]] = s
                await hub.emit("advisor_say", **s)
            await hub.wait_playback()

            # Vote
            await self._set_phase(d, "vote", "The council votes")
            weights = await asyncio.to_thread(self.store.get_advisors)
            totals = {o: 0.0 for o in d.options}
            final = {k: d.statements[2].get(k) or d.statements[1][k] for k in ADVISOR_KEYS}
            for k in ADVISOR_KEYS:
                s = final[k]
                w = float(weights.get(k, {}).get("weight", 1.0))
                val = round(w * s["confidence"], 3)
                totals[s["vote"]] = round(totals[s["vote"]] + val, 3)
                d.votes[k] = {"option": s["vote"], "confidence": s["confidence"], "weight": w, "value": val}
                await hub.emit("vote", advisor=k, option=s["vote"], weight=w, confidence=s["confidence"],
                               value=val, totals=dict(totals), options=d.options)
            winner = max(totals, key=totals.get)
            confidence = totals[winner] / (sum(totals.values()) or 1)
            await hub.wait_playback()

            # Verdict
            await self._set_phase(d, "verdict", "The Scribe writes the verdict")
            sc = await self._scribe(d, winner, confidence, final)
            tip = tipping_point(d.votes, totals, winner)
            d.result = {"winner": winner, "confidence": round(confidence, 3), "totals": totals, "tipping": tip,
                        "verdict": sc.get("verdict", winner), "summary": sc.get("summary", ""),
                        "action_item": sc.get("action_item", ""), "dissent": sc.get("dissent", "")}
            await hub.emit("verdict", debate_id=d.id, question=d.question, options=d.options, **d.result)
            record = {"id": d.id, "question": d.question, "options": d.options, "favourite": d.favourite,
                      "votes": d.votes, "verdict": winner, "verdict_text": d.result["verdict"],
                      "confidence": d.result["confidence"], "summary": d.result["summary"],
                      "action_item": d.result["action_item"], "biases": [b["name"] for b in d.biases],
                      "interjections": [m["text"] for m in d.interjections],
                      "tipping": tip, "outcome": None, "time": time.time(), "date": datetime.now(config.IST).strftime("%b %d, %H:%M")}
            await asyncio.to_thread(self.store.save_decision, record)
            await hub.emit("decisions", decisions=await asyncio.to_thread(self.store.list_decisions))
            await self._set_phase(d, "done", "Verdict delivered")
            memo = (f"SABHA verdict: {d.question} -> {winner} ({round(confidence * 100)}% council confidence). "
                    f"{d.result['summary']}")
            await write_back(memo, d.result["action_item"], ["sabha", "decision"])
        except asyncio.CancelledError:
            pass
        except Exception as e:
            traceback.print_exc()
            await hub.emit("error", text=f"Debate error: {e}")

    # ------------------------------------------------------------------ learning
    async def record_outcome(self, text: str = "", decision_id: str | None = None,
                             good: bool | None = None, chosen: str | None = None) -> None:
        decs = await asyncio.to_thread(self.store.list_decisions)
        dec = next((x for x in decs if x["id"] == decision_id), None) if decision_id else \
            await asyncio.to_thread(self.store.find_decision, text or "decision")
        if not dec:
            await hub.emit("toast", text="I couldn't find a past decision to update. Ask the council first.")
            return
        low = text.lower()
        if good is None:
            good = not re.search(r"\b(badly|bad|terribl\w*|poor\w*|wrong|awful|horribl\w*|not well|regret)\b", low)
        if not chosen:
            chosen = next((o for o in dec["options"] if o.lower().split()[0] in low), dec["verdict"])
        advisors = await asyncio.to_thread(self.store.get_advisors)
        changes = []
        for k, v in dec["votes"].items():
            right = (v["option"] == chosen) == good
            a = advisors[k]
            old = float(a["weight"])
            factor = 1 + 0.35 * v["confidence"] if right else 1 - 0.25 * v["confidence"]
            new = round(max(0.3, min(old * factor, 3.0)), 2)
            await asyncio.to_thread(self.store.update_advisor, k, {"weight": new, "times_right": a["times_right"] + int(right),
                                          "total": a["total"] + 1})
            changes.append({"advisor": k, "name": BY_KEY[k]["name"], "old": old, "new": new, "right": right,
                            "voted": v["option"]})
        await asyncio.to_thread(self.store.update_decision, dec["id"], {"outcome": "good" if good else "bad", "chosen": chosen,
                                               "outcome_time": time.time()})
        how = "went well" if good else "went badly"
        mem = await asyncio.to_thread(self.store.add_memory,
                                      f"I decided {chosen} on '{dec['question']}' and it {how}.",
                                      kind="past_decision", source="sabha", check_dup=False)
        if mem:
            await hub.emit("memory_added", memory=mem)
        winners = [c["name"] for c in changes if c["right"]]
        line = (f"Noted: {chosen} {how}. " +
                (f"{', '.join(winners)} called it — their voices grow stronger." if winners
                 else "Nobody called it. Every voice loses a little weight."))
        await hub.emit("weights_update", changes=changes, decision=dec["question"], outcome="good" if good else "bad",
                       chosen=chosen, text=line, advisors=await asyncio.to_thread(self.advisor_list))
        await hub.emit("decisions", decisions=await asyncio.to_thread(self.store.list_decisions))
        await write_back(f"SABHA outcome: '{dec['question']}' -> chose {chosen}, it {how}. {line}", None,
                         ["sabha", "outcome"])

    def advisor_list(self) -> list[dict]:
        w = self.store.get_advisors()
        return [{**{k: a[k] for k in ("key", "name", "title", "color")}, **{
            "weight": w.get(a["key"], {}).get("weight", 1.0), "times_right": w.get(a["key"], {}).get("times_right", 0),
            "total": w.get(a["key"], {}).get("total", 0)}} for a in ADVISORS]

    async def track_record(self) -> None:
        adv = await asyncio.to_thread(self.advisor_list)
        decs = await asyncio.to_thread(self.store.list_decisions)
        scored = [a for a in adv if a["total"]]
        if scored:
            best = max(scored, key=lambda a: (a["times_right"] / a["total"], a["weight"]))
            line = (f"Across {sum(1 for x in decs if x.get('outcome'))} decisions with known outcomes, "
                    f"{best['name']} has been right {best['times_right']} of {best['total']} times. " +
                    " ".join(f"{a['name']} {a['weight']:.2f}." for a in adv))
        else:
            line = f"{len(decs)} decisions so far, no outcomes reported yet. Tell me how one went and I'll learn."
        await hub.emit("track_record", advisors=adv, decisions=decs, text=line)


EXTRA_NAMES = {k: v["name"] for k, v in EXTRA.items()}
