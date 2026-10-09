/**
 * Advisor voices (Web Speech API) and the playback queue.
 *
 * Everything the council says goes through one FIFO queue so speeches never overlap. `epoch` is bumped to
 * cancel whatever is in flight (new debate, "skip speaker"): every await checks it and bails out early.
 */
import { ADV_ORDER } from "../types";
import { council } from "./store";

const VOICE_CFG: Record<string, { pitch: number; rate: number }> = {
  mentor: { pitch: 0.8, rate: 0.95 }, skeptic: { pitch: 1.15, rate: 1.08 }, future_you: { pitch: 1.0, rate: 1.0 },
  strategist: { pitch: 0.95, rate: 1.12 }, guardian: { pitch: 1.25, rate: 0.93 }, moderator: { pitch: 0.9, rate: 1.0 },
  bias_radar: { pitch: 1.35, rate: 1.1 }, scribe: { pitch: 0.75, rate: 0.95 },
};
const VOICE_KEYS = [...ADV_ORDER, "moderator", "bias_radar", "scribe"];

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const hasSpeech = () => typeof window !== "undefined" && "speechSynthesis" in window;

let voices: SpeechSynthesisVoice[] = [];
let epoch = 0;
export const currentEpoch = () => epoch;

export function initVoices() {
  if (!hasSpeech()) return;
  const load = () => {
    const all = speechSynthesis.getVoices();
    const en = all.filter((v) => /^en/i.test(v.lang));
    voices = en.length ? en : all;
  };
  load();
  speechSynthesis.onvoiceschanged = load;
}

/** Browsers only allow speech after a user gesture: speak one silent utterance from a click. */
export function unlockSpeech() {
  if (!hasSpeech()) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {}
}

function voiceFor(who: string) {
  if (!voices.length) return null;
  if (who === "future_you") {
    const ind = voices.find((v) => /en-IN/i.test(v.lang));
    if (ind) return ind;
  }
  return voices[Math.max(0, VOICE_KEYS.indexOf(who as never)) % voices.length];
}

/** Rough speaking time, used to pace typing and as a timeout when speech never reports "end". */
export const estimate = (text: string) =>
  Math.max(1800, (String(text).split(/\s+/).length / (2.6 * council.get().speed)) * 1000);

function speakPart(text: string, who: string, onWord: (() => void) | undefined, ep: number) {
  return new Promise<void>((res) => {
    if (ep !== epoch) return res();
    const u = new SpeechSynthesisUtterance(text);
    const c = VOICE_CFG[who] ?? { pitch: 1, rate: 1 };
    const v = voiceFor(who);
    if (v) u.voice = v;
    u.pitch = c.pitch;
    u.rate = Math.min(2, c.rate * council.get().speed);
    u.onboundary = () => onWord?.();
    let done = false;
    const fin = () => {
      if (!done) {
        done = true;
        res();
      }
    };
    u.onend = fin;
    u.onerror = fin;
    speechSynthesis.speak(u);
    setTimeout(fin, estimate(text) * 2.2 + 2500);
  });
}

export async function speakText(text: string, who: string, onWord?: () => void) {
  const ep = epoch;
  if (council.get().muted || !hasSpeech()) return sleep(estimate(text));
  // sentence by sentence: long utterances get cut off in Chrome
  const parts = String(text).match(/[^.!?…]+[.!?…]*["”]?\s*/g) ?? [text];
  for (const p of parts) {
    if (ep !== epoch) return;
    await speakPart(p.trim(), who, onWord, ep);
  }
}

export async function typeText(el: HTMLElement, text: string, ms: number) {
  const ep = epoch;
  el.textContent = "";
  const n = text.length;
  const step = Math.max(10, ms / n);
  for (let i = 1; i <= n; i += 2) {
    if (ep !== epoch) break;
    el.textContent = text.slice(0, i);
    await sleep(step * 2);
  }
  el.textContent = text;
}

export function stopSpeaking() {
  epoch++;
  try {
    speechSynthesis.cancel();
  } catch {}
}

// ---------------------------------------------------------------- playback queue
const queue: (() => Promise<unknown> | void)[] = [];
let running = false;

export function enqueue(fn: () => Promise<unknown> | void) {
  queue.push(fn);
  if (!running) void run();
}

async function run() {
  running = true;
  while (queue.length) {
    const f = queue.shift()!;
    try {
      await f();
    } catch (e) {
      console.error(e);
    }
  }
  running = false;
}

export function clearQueue() {
  queue.length = 0;
  stopSpeaking();
}
