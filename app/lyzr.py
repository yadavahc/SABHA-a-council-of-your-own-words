"""Thin async client for Lyzr Agent API (create agents + chat inference)."""
from __future__ import annotations

import asyncio
import json
import re
import time
import uuid

import httpx

from . import config
from .agents import ALL_AGENTS, SYSTEM_PROMPTS
from .hub import hub


def parse_json(text: str) -> dict | None:
    if not text:
        return None
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        v = json.loads(text)
        return v if isinstance(v, dict) else None
    except Exception:
        pass
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
    return None


class Lyzr:
    def __init__(self) -> None:
        self.key = config.LYZR_API_KEY
        self.agents: dict[str, str] = {}
        self.status = "offline (no LYZR_API_KEY)" if not self.key else "starting"
        self._client = httpx.AsyncClient(base_url=config.LYZR_BASE_URL, timeout=60,
                                         headers={"x-api-key": self.key, "accept": "application/json"})

    @property
    def enabled(self) -> bool:
        return bool(self.key) and len(self.agents) == len(ALL_AGENTS)

    async def setup(self) -> None:
        """Load agent ids from env / data/lyzr_agents.json, creating any that are missing."""
        if not self.key:
            return
        saved = {}
        if config.LYZR_AGENTS_FILE.exists():
            saved = json.loads(config.LYZR_AGENTS_FILE.read_text(encoding="utf-8"))
        for key, _ in ALL_AGENTS:
            env_id = config.env(f"LYZR_AGENT_{key.upper()}")
            if env_id or saved.get(key):
                self.agents[key] = env_id or saved[key]
        missing = [(k, n) for k, n in ALL_AGENTS if k not in self.agents]
        for key, name in missing:
            try:
                self.agents[key] = await self.create_agent(key, name)
                await hub.emit("agent_log", agent=key, phase="setup", ok=True, mode="lyzr", ms=0,
                               preview=f"Created Lyzr agent {self.agents[key]}")
            except Exception as e:  # keep going; offline fallback covers the gap
                self.status = f"agent create failed: {e}"
                print(f"[lyzr] could not create {name}: {e}")
        config.LYZR_AGENTS_FILE.write_text(json.dumps(self.agents, indent=2), encoding="utf-8")
        self.status = "online" if self.enabled else self.status

    async def create_agent(self, key: str, name: str) -> str:
        # Lyzr v3 stores the prompt in agent_role / agent_instructions / agent_goal (system_prompt is ignored).
        body = {
            "name": f"SABHA {name}", "description": f"SABHA council member: {name}",
            "agent_role": SYSTEM_PROMPTS[key].splitlines()[0],
            "agent_instructions": SYSTEM_PROMPTS[key],
            "agent_goal": "Help the user decide using only their own remembered words; reply with a single JSON object.",
            "system_prompt": SYSTEM_PROMPTS[key], "features": [], "tools": [],
            "llm_credential_id": config.LYZR_CREDENTIAL_ID, "provider_id": config.LYZR_PROVIDER,
            "model": config.LYZR_MODEL, "top_p": 0.9, "temperature": 0.7,
            "response_format": {"type": "json_object"},
        }
        r = await self._client.post("/v3/agents/", json=body)
        if r.status_code >= 400:  # some accounts reject response_format; retry plain
            body["response_format"] = {}
            r = await self._client.post("/v3/agents/", json=body)
        r.raise_for_status()
        data = r.json()
        agent_id = data.get("agent_id") or data.get("_id") or data.get("id")
        if not agent_id:
            raise RuntimeError(f"unexpected create response: {data}")
        return agent_id

    async def chat(self, key: str, payload: dict, session: str, phase: str) -> dict | None:
        """Send a JSON payload to an agent; returns parsed JSON or None (caller falls back offline)."""
        if key not in self.agents:
            return None
        # Rules travel with every message too, so behaviour holds even for agents configured in Studio.
        message = json.dumps({"INSTRUCTIONS": SYSTEM_PROMPTS[key], **payload}, ensure_ascii=False)
        t0 = time.time()
        body = {"user_id": config.LYZR_USER_ID, "agent_id": self.agents[key],
                "session_id": f"{self.agents[key]}-{session}-{uuid.uuid4().hex[:6]}", "message": message}
        err, out, raw = None, None, ""
        for attempt in range(2):
            try:
                r = await self._client.post("/v3/inference/chat/", json=body)
                r.raise_for_status()
                raw = r.json().get("response", "")
                out = parse_json(raw)
                if out:
                    break
                err = "non-JSON reply"
            except Exception as e:
                err = str(e)[:160]
                await asyncio.sleep(0.5)
        ms = int((time.time() - t0) * 1000)
        await hub.emit("agent_log", agent=key, phase=phase, ok=bool(out), mode="lyzr", ms=ms,
                       chars=len(message), preview=(raw or err or "")[:220])
        return out


lyzr = Lyzr()
