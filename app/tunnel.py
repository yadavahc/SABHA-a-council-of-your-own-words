"""Expose the local server publicly (cloudflared quick tunnel or ngrok) so Omi can reach the webhooks."""
from __future__ import annotations

import re
import shutil
import subprocess
import threading
import time

import httpx

from . import config

URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


class Tunnel:
    def __init__(self) -> None:
        self.proc: subprocess.Popen | None = None
        self.url: str | None = config.PUBLIC_URL or None
        self.status = "manual" if self.url else "off"

    def start(self, on_url) -> None:
        if self.url:
            on_url(self.url)
            return
        kind = config.TUNNEL
        if kind == "none":
            return
        exe = shutil.which(kind) or shutil.which(f"{kind}.exe")
        if not exe and kind == "cloudflared":
            for p in (r"C:\Program Files (x86)\cloudflared\cloudflared.exe", r"C:\Program Files\cloudflared\cloudflared.exe"):
                if shutil.os.path.exists(p):
                    exe = p
        if not exe:
            self.status = f"{kind} not found"
            print(f"[tunnel] {kind} not found on PATH - set TUNNEL=none or PUBLIC_URL")
            return
        local = f"http://127.0.0.1:{config.PORT}"
        args = [exe, "tunnel", "--no-autoupdate", "--url", local] if kind == "cloudflared" else [exe, "http", str(config.PORT), "--log", "stdout"]
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        self.proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                     encoding="utf-8", errors="ignore", creationflags=flags)
        self.status = "starting"
        threading.Thread(target=self._watch, args=(kind, on_url), daemon=True).start()

    def _watch(self, kind: str, on_url) -> None:
        if kind == "cloudflared":
            for line in self.proc.stdout:
                m = URL_RE.search(line)
                if m and not self.url:
                    self.url, self.status = m.group(0), "up"
                    on_url(self.url)
            return
        for _ in range(40):  # ngrok: poll local API
            try:
                tunnels = httpx.get("http://127.0.0.1:4040/api/tunnels", timeout=2).json()["tunnels"]
                https = [t["public_url"] for t in tunnels if t["public_url"].startswith("https")]
                if https:
                    self.url, self.status = https[0], "up"
                    on_url(self.url)
                    break
            except Exception:
                pass
            time.sleep(1)
        for _ in self.proc.stdout:  # drain
            pass

    def stop(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()


def webhook_urls(base: str) -> dict:
    q = f"?key={config.WEBHOOK_KEY}" if config.WEBHOOK_KEY else ""
    return {"realtime": f"{base}/omi/realtime{q}", "memory_created": f"{base}/omi/memory-created{q}",
            "day_summary": f"{base}/omi/day-summary{q}", "app": base}
