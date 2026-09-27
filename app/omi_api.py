"""Omi Developer API write-back: verdict -> Omi memory + action item (shows up in the phone app)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx

from . import config
from .hub import hub


async def _post(client: httpx.AsyncClient, path: str, body: dict) -> tuple[bool, str]:
    try:
        r = await client.post(path, json=body)
        if r.status_code < 300:
            return True, "ok"
        return False, f"{r.status_code}: {r.text[:160]}"
    except Exception as e:
        return False, str(e)[:160]


async def write_back(memory: str, action_item: str | None = None, tags: list[str] | None = None) -> dict:
    if not config.OMI_API_KEY:
        result = {"ok": False, "detail": "OMI_API_KEY not set - skipped write-back"}
        await hub.emit("omi_writeback", **result)
        return result
    headers = {"Authorization": f"Bearer {config.OMI_API_KEY}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(base_url=config.OMI_BASE_URL, headers=headers, timeout=20) as c:
        ok_m, d_m = await _post(c, "/v1/dev/user/memories",
                                {"content": memory[:1000], "category": "manual", "tags": tags or ["sabha"]})
        ok_a, d_a = True, "none"
        if action_item:
            due = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
            ok_a, d_a = await _post(c, "/v1/dev/user/action-items", {"description": action_item[:500], "due_at": due})
    result = {"ok": ok_m and ok_a, "memory": d_m, "action_item": d_a,
              "detail": "Saved to your Omi app" if ok_m and ok_a else f"memory: {d_m} | action: {d_a}"}
    await hub.emit("omi_writeback", **result)
    await hub.emit("agent_log", agent="omi", phase="write-back", ok=result["ok"], mode="omi-api", ms=0,
                   preview=result["detail"])
    return result
