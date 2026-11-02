"use client";

import type Anthropic from "@anthropic-ai/sdk";
import { getProject, useVizzy } from "../store";
import type { Card } from "../types";
import { demoTurn } from "./demo";
import { executeTool } from "./execute";
import { snapshot } from "./system";

// Client-side agent loop. One user message → up to MAX_STEPS director turns:
// stream text into a chat bubble, execute tool calls locally, send results
// back, repeat until the director ends its turn.

const MAX_STEPS = 8;
// Opus 5.5 list price, per token; used for the live cost meter.
const PRICE_IN = 4 / 1e6;
const PRICE_OUT = 20 / 1e6;

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlock;

function stateBlock(): string {
  const p = getProject();
  const events = p.pendingEvents.length
    ? `<ui_events>\n${p.pendingEvents.map((e) => `- ${e}`).join("\n")}\n</ui_events>\n`
    : "";
  return `${events}<project_state>\n${snapshot(p)}\n</project_state>`;
}

function takeEvents(): string[] {
  const events = getProject().pendingEvents;
  useVizzy.getState().mutate((p) => {
    p.pendingEvents = [];
  });
  return events;
}

/** Record a UI action (select, lock, lettering edit) for the director's next turn. */
export function recordEvent(e: string) {
  useVizzy.getState().mutate((p) => {
    p.pendingEvents.push(e);
  });
}

export async function send(text: string) {
  const store = useVizzy.getState();
  if (store.busy || !store.project) return;
  const clean = text.trim();
  if (clean) store.pushChat({ role: "user", text: clean });
  store.set({ busy: true, activity: "Thinking…" });
  try {
    if (store.directorMode === "claude") await claudeTurn(clean);
    else await demoTurns(clean);
  } catch (e) {
    store.pushChat({ role: "vizzy", cards: [{ kind: "note", tone: "error", text: (e as Error).message }] });
  } finally {
    useVizzy.getState().set({ busy: false, activity: undefined });
  }
}

// ------------------------------------------------------------------ Claude

async function claudeTurn(text: string) {
  const store = useVizzy.getState();
  const content: Anthropic.Beta.BetaTextBlockParam[] = [];
  if (text) content.push({ type: "text", text });
  content.push({ type: "text", text: stateBlock() });
  takeEvents();
  appendTranscript({ role: "user", content });

  for (let step = 0; step < MAX_STEPS; step++) {
    const bubble = store.pushChat({ role: "vizzy", text: "", streaming: true });
    const message = await streamTurn(bubble);
    appendTranscript({ role: "assistant", content: message.content as Anthropic.Beta.BetaContentBlockParam[] });

    const toolUses = message.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (message.stop_reason === "refusal") {
      addCards(bubble, [{ kind: "note", tone: "warn", text: "Vizzy declined that request. Try rephrasing it with less graphic detail." }]);
      break;
    }
    if (!toolUses.length || message.stop_reason !== "tool_use") break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      useVizzy.getState().set({ activity: activityFor(tu.name) });
      const out = await executeTool(tu.name, tu.input);
      addCards(bubble, out.cards);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out.result, is_error: out.isError });
    }
    appendTranscript({ role: "user", content: [...results, { type: "text", text: stateBlock() }] });
    takeEvents();
  }
}

async function streamTurn(bubbleId: string) {
  const store = useVizzy.getState();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (store.keys.anthropic) headers["x-anthropic-key"] = store.keys.anthropic;
  const res = await fetch("/api/director", {
    method: "POST",
    headers,
    body: JSON.stringify({ messages: getProject().transcript }),
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    rollbackTranscript();
    throw new Error(`Director unavailable: ${err.error}. Switch to the offline director in Settings to keep going.`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let final: { content: Block[]; stop_reason: string; usage: Anthropic.Beta.BetaUsage } | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      const ev = JSON.parse(line);
      if (ev.t === "text") {
        text += ev.d;
        useVizzy.getState().patchChat(bubbleId, { text });
      } else if (ev.t === "tool") {
        useVizzy.getState().set({ activity: activityFor(ev.name) });
      } else if (ev.t === "done") {
        final = ev.message;
      } else if (ev.t === "error") {
        useVizzy.getState().patchChat(bubbleId, { streaming: false });
        rollbackTranscript();
        throw new Error(ev.message);
      }
    }
  }
  useVizzy.getState().patchChat(bubbleId, { streaming: false });
  if (!final) throw new Error("The director stream ended unexpectedly.");
  const u = final.usage;
  useVizzy.getState().mutate((p) => {
    const inTok = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    p.usage.inputTokens += inTok;
    p.usage.outputTokens += u.output_tokens ?? 0;
    p.usage.costUsd +=
      (u.input_tokens ?? 0) * PRICE_IN +
      (u.cache_read_input_tokens ?? 0) * PRICE_IN * 0.05 +
      (u.cache_creation_input_tokens ?? 0) * PRICE_IN * 1.25 +
      (u.output_tokens ?? 0) * PRICE_OUT;
  });
  return final;
}

function appendTranscript(m: Msg) {
  useVizzy.getState().mutate((p) => {
    p.transcript.push(m);
  });
}

/**
 * After a failed request, trim the transcript back to the last complete
 * assistant turn (no dangling user turn, no unanswered tool calls) so the
 * conversation stays valid and the user can simply try again.
 */
function rollbackTranscript() {
  useVizzy.getState().mutate((p) => {
    for (;;) {
      const last = p.transcript[p.transcript.length - 1] as Msg | undefined;
      if (!last) break;
      const pendingTools =
        last.role === "assistant" &&
        Array.isArray(last.content) &&
        last.content.some((b) => b.type === "tool_use");
      if (last.role === "user" || pendingTools) p.transcript.pop();
      else break;
    }
  });
}

function addCards(bubbleId: string, cards: Card[]) {
  if (!cards.length) return;
  useVizzy.getState().mutate((p) => {
    const m = p.chat.find((c) => c.id === bubbleId);
    if (!m) return;
    // Summary cards (cast, plan…) render live state, so one per message is enough.
    const singleton = new Set(["brief", "style-bible", "cast", "plan"]);
    const fresh = cards.filter((c) => !singleton.has(c.kind) || !m.cards?.some((x) => x.kind === c.kind));
    m.cards = [...(m.cards ?? []), ...fresh];
  });
}

function activityFor(tool: string) {
  const map: Record<string, string> = {
    propose_style_directions: "Sketching style directions…",
    update_style_bible: "Updating the style bible…",
    upsert_character: "Casting…",
    generate_character_sheets: "Drawing reference sheets…",
    propose_page_plan: "Breaking the story into pages…",
    generate_page_options: "Setting up the shots…",
    refine_option: "Refining…",
    lock_page: "Locking the page…",
  };
  return map[tool] ?? "Working…";
}

// ------------------------------------------------------------------ offline

async function demoTurns(text: string) {
  const events = takeEvents();
  const steps = demoTurn(getProject(), text, events);
  for (const step of steps) {
    let bubble: string | undefined;
    if (step.say) {
      bubble = useVizzy.getState().pushChat({ role: "vizzy", text: "", streaming: true });
      // Type the reply out so the offline director feels alive.
      const words = step.say.split(" ");
      for (let i = 1; i <= words.length; i++) {
        useVizzy.getState().patchChat(bubble, { text: words.slice(0, i).join(" ") });
        await new Promise((r) => setTimeout(r, 18));
      }
      useVizzy.getState().patchChat(bubble, { streaming: false });
    }
    for (const call of step.calls) {
      useVizzy.getState().set({ activity: activityFor(call.name) });
      const out = await executeTool(call.name, call.input);
      if (!bubble && out.cards.length) bubble = useVizzy.getState().pushChat({ role: "vizzy" });
      if (bubble) addCards(bubble, out.cards);
      if (out.isError) {
        bubble ??= useVizzy.getState().pushChat({ role: "vizzy" });
        addCards(bubble, [{ kind: "note", tone: "warn", text: out.result }]);
      }
    }
  }
}
