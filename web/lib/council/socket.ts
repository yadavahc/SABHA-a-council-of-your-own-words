import { wsUrl } from "../api";
import type { ServerEvent } from "../types";

let ws: WebSocket | null = null;

export function send(msg: Record<string, unknown>) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

/** Connect to /ws and keep reconnecting until the returned function is called. */
export function connectSocket(onEvent: (ev: ServerEvent) => void): () => void {
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    const sock = new WebSocket(wsUrl());
    ws = sock;
    sock.onmessage = (e) => onEvent(JSON.parse(e.data) as ServerEvent);
    sock.onclose = () => {
      if (ws === sock) ws = null;
      if (!stopped) retry = setTimeout(open, 1500);
    };
  };
  open();

  return () => {
    stopped = true;
    clearTimeout(retry);
    ws?.close();
    ws = null;
  };
}

export const nextRound = () => send({ type: "next_round" });
