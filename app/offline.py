"""Offline fallback: template reasoning over the user's Qdrant memories.

Used when LYZR_API_KEY is missing or a Lyzr call fails, so a live demo never dies mid-debate.
"""
from __future__ import annotations

import math
import re

GROWTHY = re.compile(r"startup|found|build|own|abroad|master|research|new|risk|venture|creative|freelanc", re.I)
SAFE = re.compile(r"mnc|corporate|job|stable|government|psu|big|stay|safe|bank|tcs|infosys|google|microsoft", re.I)


def clean_label(p: str) -> str:
    p = p.strip(" ,.?!")
    p = re.sub(r"^(should i|shall i|do i|to|i)\s+", "", p, flags=re.I)
    p = re.sub(r"^(join|take|accept|go (?:with|for)|pick|choose|do|stay (?:at|with|in)|go to|work (?:at|for)|move to)\s+",
               "", p, flags=re.I)
    p = re.sub(r"^(the|a|an|my)\s+", "", p, flags=re.I)
    p = re.sub(r"\s+(offer|one|option|job offer)$", "", p, flags=re.I)
    p = p[:32].strip()
    return p[:1].upper() + p[1:] if p else p


def parse_options(question: str) -> list[str]:
    s = re.sub(r"^\W*(sabha)\W*", "", question.strip(), flags=re.I).rstrip("?.! ")
    m = re.search(r"(?:should i|shall i|do i|should we|would it be better to|is it better to|whether to)\s+(.*)", s, re.I)
    body = m.group(1) if m else s
    parts = [clean_label(p) for p in re.split(r",?\s+or\s+(?:should i\s+)?", body, flags=re.I) if p.strip()]
    parts = [p for p in parts if p]
    if len(parts) < 2:
        return ["Yes", "No"]
    return parts[:4]


def match_option(vote, options: list[str]) -> str:
    v = str(vote or "").strip().lower()
    for o in options:
        if v == o.lower():
            return o
    for o in options:
        if v and (v in o.lower() or o.lower() in v):
            return o
    if len(v) == 1 and v in "abcd" and "abcd".index(v) < len(options):
        return options["abcd".index(v)]
    if v.isdigit() and 0 < int(v) <= len(options):
        return options[int(v) - 1]
    return options[0]


def cos(a, b) -> float:
    return sum(x * y for x, y in zip(a, b)) / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)) + 1e-9)


def snip(m: dict, n: int = 13) -> str:
    words = m["text"].split()
    return " ".join(words[:n]).rstrip(",.") + ("…" if len(words) > n else "")


def _public(mems):
    return [m for m in mems if not m["sealed"]]


def _lean_option(options, pattern) -> str | None:
    hits = [o for o in options if pattern.search(o)]
    return hits[0] if len(hits) == 1 else None


PREFER = {
    "mentor": (("goal", "past_decision", "value"), re.compile(r"learn|grow|mentor|people|build|zero to one|skill", re.I)),
    "skeptic": (("fear", "value"), re.compile(r"safe|afraid|relatives|runs out|wasted|fail", re.I)),
    "future_you": (("goal",), re.compile(r".", re.I)),
    "strategist": (("fact", "fear"), re.compile(r"loan|emi|salary|lpa|rent|runway|money|savings", re.I)),
    "guardian": (("value",), re.compile(r".", re.I)),
}


def _best(pub: list[dict], key: str) -> dict | None:
    kinds, rx = PREFER[key]
    for m in pub:
        if m["kind"] in kinds and rx.search(m["text"]):
            return m
    return pub[0] if pub else None


def pick_favourite(options, memories) -> str:
    counts = {o: 0 for o in options}
    for m in memories:
        if m["kind"] in ("goal", "value"):
            for o in options:
                if o.lower().split()[0] in m["text"].lower():
                    counts[o] += 1
    best = max(counts, key=counts.get)
    return best if counts[best] else options[0]


def moderator(question: str, memories: list[dict]) -> dict:
    options = parse_options(question)
    fav = pick_favourite(options, memories)
    return {"question": question.strip().rstrip("?") + "?", "options": options, "favourite": fav,
            "favourite_reason": "most mentioned in your goals and values",
            "intro": f"The council is in session. The question: {' or '.join(options)}. "
                     f"You've spoken about this for weeks — let's hear what your own words say."}


def advisor(adv: dict, rnd: int, options: list[str], favourite: str, mems: list[dict],
            embed, round1: dict, new_from_user: list[dict]) -> dict:
    key = adv["key"]
    pub = _public(mems)
    top = _best(pub, key)
    other = lambda o: next((x for x in options if x != o), o)  # noqa: E731

    # --- choose a vote
    if key == "skeptic":
        vote = other(favourite)
    elif key == "mentor":
        vote = _lean_option(options, GROWTHY) or options[0]
    elif key == "strategist":
        vote = _lean_option(options, SAFE) or options[-1]
    else:
        pool = [m for m in pub if m["kind"] in (("goal", "plan") if key == "future_you" else ("value", "fear"))] or pub
        if pool:
            ref = embed(" ".join(m["text"] for m in pool[:4]))
            vote = max(options, key=lambda o: cos(embed(o), ref))
        else:
            vote = options[0]
        grow = _lean_option(options, GROWTHY)
        if grow and pool:
            ref = embed(" ".join(m["text"] for m in pool[:4]))
            scores = {o: cos(embed(o), ref) + (0.04 if o == grow else 0) for o in options}
            vote = max(scores, key=scores.get)
    if new_from_user and rnd == 2 and key in ("guardian", "future_you", "mentor"):
        nm = new_from_user[-1]
        ref = embed(nm["text"])
        vote = max(options, key=lambda o: cos(embed(o), ref))
        top = nm
    conf = 0.55 + 0.3 * (1 if top else 0) * (0.5 + 0.5 * (hash(key + str(rnd)) % 10) / 10)

    # --- say something grounded
    q = f'On {top["date"]} you said "{snip(top)}".' if top else ""
    lines = {
        "mentor": f"{q} {vote} puts you next to people who will stretch you. That compounding matters more than year-one pay.",
        "skeptic": f"You're leaning {favourite}. {q or 'My guess:'} So are you choosing {favourite}, or running from {vote}? I'll argue {vote} to test you.",
        "future_you": f"It's me, five years on. {q} {vote} is the path where that actually happened for us.",
        "strategist": f"Numbers first. {q} {vote} keeps your downside small and the loan covered; the other path is harder to undo.",
        "guardian": f"{q} {vote} honours what you told me matters. The other option asks you to bend that.",
    }
    say = lines[key].strip()
    replies_to = None
    if rnd == 2:
        opp = [k for k, s in round1.items() if k != key and s["vote"] != vote]
        same = [k for k, s in round1.items() if k != key and s["vote"] == vote]
        replies_to = (opp or same or [None])[0]
        if replies_to:
            nm = replies_to.replace("_", "-").title()
            lead = f"{nm}, I hear you, but" if replies_to in opp else f"{nm} is right, and"
            if new_from_user and key in ("guardian", "future_you", "mentor"):
                say = f"{lead} you just told us \"{snip(new_from_user[-1], 12)}\". That tips it to {vote}."
            else:
                say = f"{lead} {say[0].lower()}{say[1:]}"
    return {"say": say, "vote": vote, "confidence": round(min(conf, 0.9), 2),
            "memory_ids": [top["short"]] if top and "short" in top else [], "replies_to": replies_to}


BIAS_RULES = [
    ("Sunk cost", re.compile(r"already (paid|spent|invested)|because i had already|wasted|put so much", re.I)),
    ("Stated vs revealed preference", re.compile(r"money doesn'?t (really )?matter", re.I)),
    ("Social proof", re.compile(r"relatives|everyone|people will think|my batch|what others", re.I)),
    ("Loss aversion", re.compile(r"feels safe|scared|afraid|runs out of money|wasted my", re.I)),
]


def bias(all_mems: list[dict]) -> dict:
    found = []
    pub = _public(all_mems)
    for name, rx in BIAS_RULES:
        hits = [m for m in pub if rx.search(m["text"])]
        if not hits:
            continue
        m = hits[0]
        ev = f'{m["date"]}: "{snip(m, 10)}"'
        if name.startswith("Stated"):
            loan = next((x for x in pub if re.search(r"loan|emi", x["text"], re.I) and x["kind"] == "fear"), None)
            if not loan:
                continue
            ev = f'{m["date"]} you said money doesn\'t matter; {loan["date"]} you worried about the loan.'
            m = loan if "short" in loan else m
        found.append({"name": name, "evidence": ev, "memory_ids": [m["short"]] if "short" in m else []})
    found = found[:3]
    say = ("Careful. " + " ".join(f"{b['name']}: {b['evidence']}" for b in found[:2])) if found \
        else "No strong biases detected — that's a guess, based on limited memories."
    return {"biases": found, "say": " ".join(say.split()[:60])}


BY_NAME = {"mentor": "the Mentor", "skeptic": "the Skeptic", "future_you": "Future-You",
           "strategist": "the Strategist", "guardian": "the Guardian"}


def _first(say: str, max_words: int = 26) -> str:
    """Last complete sentence that isn't just an address like 'Mentor, I hear you, but'."""
    sents = [x for x in re.split(r"(?<=[.!?])\s+", say) if len(x.split()) > 5]
    pick = sents[-1] if sents else say
    words = pick.split()
    return " ".join(words[:max_words]) + ("…" if len(words) > max_words else "")


def scribe(question, options, winner, confidence, statements: dict, biases: list[dict]) -> dict:
    pro = next((s for s in statements.values() if s["vote"] == winner), None)
    con = next((s for s in statements.values() if s["vote"] != winner), None)
    b = biases[0]["name"].lower() if biases else "overconfidence"
    summary = (f"The council leans {winner} with {round(confidence * 100)} percent of the weighted vote. "
               f"For it, {BY_NAME.get(pro['advisor'], 'an advisor') if pro else 'your goals'}: {_first(pro['say']) if pro else ''} "
               f"Against it, {BY_NAME.get(con['advisor'], 'an advisor') if con else 'nobody'}: {_first(con['say']) if con else 'no strong dissent.'} "
               f"Watch for {b}.")
    return {"verdict": f"{winner}, with your eyes open",
            "summary": " ".join(summary.split()[:80]),
            "action_item": f"Write down three conditions under which {winner} would fail, then check them.",
            "dissent": (_first(con["say"]) if con else "No dissent.")}
