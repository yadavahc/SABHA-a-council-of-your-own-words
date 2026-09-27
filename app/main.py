"""SABHA server: Omi webhooks + WebSocket UI + Qdrant memory + Lyzr council."""
from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .agents import ADVISORS, EXTRA
from .debate import Council
from .hub import hub
from .ingest import Ingest
from .lyzr import lyzr
from .memory import Store
from .tunnel import Tunnel, webhook_urls

store: Store
council: Council
ingest: Ingest
tunnel = Tunnel()
LOOP: asyncio.AbstractEventLoop | None = None


def banner(url: str | None) -> None:
    line = "=" * 72
    print(f"\n{line}\n  SABHA is running  ->  http://localhost:{config.PORT}")
    print(f"  Qdrant: {store.mode} | memories: {store.count()} | Lyzr: {lyzr.status} | "
          f"Omi write-back: {'on' if config.OMI_API_KEY else 'off (no OMI_API_KEY)'}")
    if url:
        u = webhook_urls(url)
        print(f"  Public URL: {url}\n\n  Paste into Omi app -> Settings -> Developer Mode -> Developer Settings:")
        print(f"    Real-Time Transcript Webhook : {u['realtime']}")
        print(f"    Memory Creation Webhook      : {u['memory_created']}   (\"Conversation events\")")
        print(f"    Day Summary Webhook          : {u['day_summary']}   (optional)")
    else:
        print(f"  Tunnel: {tunnel.status} (webhooks reachable only locally)")
    print(f"{line}\n", flush=True)


def on_tunnel_url(url: str) -> None:
    banner(url)
    if LOOP:
        asyncio.run_coroutine_threadsafe(hub.emit("tunnel", url=url, webhooks=webhook_urls(url)), LOOP)


async def status_loop() -> None:
    last = None
    while True:
        await asyncio.sleep(3)
        s = ingest.link_status()
        if s["state"] != last:
            last = s["state"]
            await hub.emit("omi_status", **s)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global store, council, ingest, LOOP
    LOOP = asyncio.get_running_loop()
    store = Store()
    store.ensure_advisors(ADVISORS)
    if config.SEED_ON_START and store.count() == 0 and config.SEED_FILE.exists():
        print(f"[seed] loaded {store.seed()} demo memories")
    council = Council(store)
    ingest = Ingest(store, council)
    await lyzr.setup()
    banner(tunnel.url)
    tunnel.start(on_tunnel_url)
    task = asyncio.create_task(status_loop())
    yield
    task.cancel()
    tunnel.stop()
    store.close()


app = FastAPI(title="SABHA", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=config.STATIC), name="static")


def check_key(request: Request) -> None:
    if config.WEBHOOK_KEY and request.query_params.get("key") != config.WEBHOOK_KEY:
        raise HTTPException(401, "bad key")


def spawn(coro) -> None:
    """Fire-and-forget with error logging (webhooks must answer 200 fast)."""
    async def run():
        try:
            await coro
        except Exception as e:
            import traceback
            traceback.print_exc()
            await hub.emit("error", text=str(e))
    asyncio.create_task(run())


# ------------------------------------------------------------------ pages / ws
@app.get("/")
async def landing():
    return FileResponse(config.STATIC / "landing.html")


@app.get("/council")
async def council_page():
    return FileResponse(config.STATIC / "council.html")


@app.get("/health")
async def health():
    return {"ok": True, "memories": await asyncio.to_thread(store.count), "lyzr": lyzr.status}


def state() -> dict:
    return {
        "advisors": council.advisor_list(), "extra": EXTRA,
        "omi": ingest.link_status(), "tunnel": tunnel.url and webhook_urls(tunnel.url),
        "tunnel_status": tunnel.status, "lyzr": lyzr.status, "lyzr_online": lyzr.enabled,
        "omi_writeback": bool(config.OMI_API_KEY), "qdrant": store.mode,
        "memories": store.list_memories(), "decisions": store.list_decisions(),
        "agent_log": list(hub.agent_log), "phone": list(hub.phone),
        "debate": council.current.snapshot() if council.current else None,
        "user": config.USER_NAME,
    }


@app.get("/api/state")
async def api_state():
    return JSONResponse(json.loads(json.dumps(await asyncio.to_thread(state), default=str)))


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await hub.connect(ws)
    await hub.send(ws, json.loads(json.dumps({"type": "state", **(await asyncio.to_thread(state))}, default=str)))
    try:
        while True:
            msg = await ws.receive_json()
            t = msg.get("type")
            if t == "playback_done":
                hub.playback_done(int(msg.get("token", 0)))
            elif t == "next_round":
                await council.next_round()
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        hub.disconnect(ws)


# ------------------------------------------------------------------ Omi webhooks
@app.post("/omi/realtime")
async def omi_realtime(request: Request):
    check_key(request)
    body = await request.json()
    session_id = request.query_params.get("session_id") or "default"
    segments = body if isinstance(body, list) else body.get("segments", [])
    if isinstance(body, dict):
        session_id = body.get("session_id", session_id)
    source = "simulate" if request.query_params.get("sim") else "phone"
    spawn(ingest.realtime(session_id, segments, source))
    return {"status": "ok"}


@app.post("/omi/day-summary")
async def omi_day_summary(request: Request):
    check_key(request)
    spawn(ingest.day_summary(await request.json()))
    return {"status": "ok"}


@app.post("/omi/memory-created")
async def omi_memory_created(request: Request):
    check_key(request)
    conv = await request.json()
    if conv.get("discarded"):
        return {"status": "ignored"}
    spawn(ingest.conversation(conv))
    return {"status": "ok"}


# ------------------------------------------------------------------ web UI actions
@app.post("/api/speech")
async def api_speech(request: Request):
    """Web mic / text box. Same pipeline as Omi speech."""
    body = await request.json()
    text = str(body.get("text", "")).strip()
    source = body.get("source", "web")
    if text:
        await hub.emit("phone", text=text, source=source, is_user=True)
        spawn(ingest.handle_text(text, source))
    return {"status": "ok"}


@app.get("/api/memories")
async def api_memories(q: str = "", k: int = 12):
    if q:
        return await asyncio.to_thread(store.search_memories, q, k)
    return await asyncio.to_thread(store.list_memories)


@app.get("/api/constellation")
async def api_constellation():
    """Memory vectors projected to 3D with PCA, for the Three.js constellation."""
    import numpy as np
    pts = await asyncio.to_thread(store.memory_vectors)
    if len(pts) < 4:
        return []
    X = np.array([v for _, v, _ in pts], dtype=float)
    X -= X.mean(axis=0)
    _, _, vt = np.linalg.svd(X, full_matrices=False)
    Y = X @ vt[:3].T
    Y /= np.abs(Y).max(axis=0) + 1e-9
    out = []
    for (pid, _, pl), pos in zip(pts, Y):
        m = Store._mem(pid, pl)
        if m["sealed"]:
            m["text"] = None
        out.append({**m, "pos": [round(float(c), 4) for c in pos]})
    return out


@app.post("/api/memories/{mid}/seal")
async def api_seal(mid: str, request: Request):
    body = await request.json()
    mem = await asyncio.to_thread(store.set_sealed, mid, bool(body.get("sealed", True)))
    await hub.emit("memory_updated", memory=mem)
    return mem


@app.delete("/api/memories/{mid}")
async def api_delete_memory(mid: str):
    await asyncio.to_thread(store.delete_memory, mid)
    await hub.emit("memory_deleted", id=mid)
    return {"ok": True}


@app.post("/api/next")
async def api_next():
    await council.next_round()
    return {"ok": True}


@app.post("/api/outcome")
async def api_outcome(request: Request):
    b = await request.json()
    spawn(council.record_outcome(text=b.get("text", ""), decision_id=b.get("decision_id"),
                                 good=b.get("good"), chosen=b.get("chosen")))
    return {"ok": True}


@app.post("/api/reset")
async def api_reset():
    if council.task and not council.task.done():
        council.task.cancel()
    await asyncio.to_thread(store.seed, config.SEED_FILE, True)
    store.ensure_advisors(ADVISORS)
    council.current = None
    await hub.emit("state", **json.loads(json.dumps(await asyncio.to_thread(state), default=str)))
    return {"ok": True, "memories": await asyncio.to_thread(store.count)}


# ------------------------------------------------------------------ /simulate (Omi-format replay)
SIM_FILE = config.DATA / "demo_omi_session.json"


async def replay(name: str) -> None:
    data = json.loads(SIM_FILE.read_text(encoding="utf-8"))
    sc = data["scenarios"][name]
    if isinstance(sc, list):  # composite
        for sub in sc:
            await replay(sub)
            await asyncio.sleep(2.5)
        return
    base = f"http://127.0.0.1:{config.PORT}"
    key = f"&key={config.WEBHOOK_KEY}" if config.WEBHOOK_KEY else ""
    sid = f"{sc['session_id']}-{int(time.time())}"
    async with httpx.AsyncClient(base_url=base, timeout=10) as c:
        for ev in sc["events"]:
            await asyncio.sleep(ev.get("delay", 1))
            if "realtime" in ev:
                await c.post(f"/omi/realtime?session_id={sid}&uid={data['uid']}&sim=1{key}",
                             json=ev["realtime"])
            elif "day_summary" in ev:
                await c.post(f"/omi/day-summary?uid={data['uid']}{key}", json=ev["day_summary"])
            elif "memory_created" in ev:
                await c.post(f"/omi/memory-created?uid={data['uid']}{key}", json=ev["memory_created"])


@app.api_route("/simulate", methods=["GET", "POST"])
async def simulate(scenario: str = "full"):
    data = json.loads(SIM_FILE.read_text(encoding="utf-8"))
    if scenario not in data["scenarios"]:
        raise HTTPException(404, f"scenarios: {list(data['scenarios'])}")
    spawn(replay(scenario))
    return {"status": "replaying", "scenario": scenario}
