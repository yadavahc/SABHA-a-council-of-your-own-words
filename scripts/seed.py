"""Reset Qdrant and load data/seed_memories.json.  Usage: python -m scripts.seed"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.agents import ADVISORS  # noqa: E402
from app.memory import Store  # noqa: E402

if __name__ == "__main__":
    store = Store()
    print(f"Qdrant: {store.mode}")
    n = store.seed(reset=True)
    store.ensure_advisors(ADVISORS)
    print(f"Seeded {n} memories, {len(store.get_advisors())} advisors.")
    for m in store.search_memories("should I join the startup or the MNC?", k=5):
        print(f"  {m['score']:.2f} [{m['kind']}] {m['date']}: {m['text'][:80]}")
    print("Redacted:", [m["text"] for m in store.list_memories() if m["redacted"]])
    print("Sealed:", sum(m["sealed"] for m in store.list_memories()))
    store.close()
