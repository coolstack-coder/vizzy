"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { send } from "@/lib/director/run";
import { useVizzy } from "@/lib/store";
import type { ChatItem } from "@/lib/types";
import { CardView } from "./Cards";

const PLACEHOLDER: Record<string, string> = {
  brief: "Tell Vizzy your story: a script, notes or a one-line idea…",
  style: "Pick a direction, or describe the look you want…",
  cast: "Adjust a character, or say go…",
  plan: "Tweak the plan (\"make page 3 a close-up\") or approve it…",
  pages: "Describe the page, ask for changes, or say \"lock it\"…",
  assemble: "Ask for changes, or open the player…",
};

export function Chat() {
  const chat = useVizzy((s) => s.project!.chat);
  const phase = useVizzy((s) => s.project!.phase);
  const busy = useVizzy((s) => s.busy);
  const activity = useVizzy((s) => s.activity);
  const scroller = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  const last = chat[chat.length - 1];
  const lastText = last?.text;
  const lastCards = last?.cards?.length;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.length, lastText, lastCards]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "TEXTAREA" && !(document.activeElement as HTMLElement)?.isContentEditable) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    if (!text.trim() || busy) return;
    void send(text);
    setText("");
  };

  const lastCardMsg = [...chat].reverse().find((m) => m.cards?.length)?.id;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {chat.length === 0 && <Welcome />}
        {chat.map((m) => (
          <Message key={m.id} m={m} latest={m.id === lastCardMsg} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 pl-9 text-xs text-muted">
            <Loader2 size={13} className="animate-spin text-accent" /> {activity ?? "Thinking…"}
          </div>
        )}
      </div>
      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-panel-2 p-2 focus-within:border-accent/60">
          <textarea
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={Math.min(6, Math.max(1, text.split("\n").length))}
            placeholder={PLACEHOLDER[phase]}
            className="max-h-40 min-h-[1.5rem] flex-1 resize-none bg-transparent px-1 py-1 text-sm text-ink outline-none placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={!text.trim() || busy}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink transition hover:brightness-110 disabled:opacity-30"
            aria-label="Send"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}

function Avatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent font-title text-sm font-semibold text-accent-ink">V</div>
  );
}

function Message({ m, latest }: { m: ChatItem; latest: boolean }) {
  if (m.role === "user")
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-panel-2 px-3.5 py-2 text-sm text-ink">{m.text}</div>
      </div>
    );
  if (!m.text && !m.cards?.length && !m.streaming) return null;
  return (
    <div className="flex gap-2">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-2">
        {(m.text || m.streaming) && (
          <p className={`whitespace-pre-wrap pt-1 text-sm leading-relaxed text-ink/90 ${m.streaming ? "caret" : ""}`}>{m.text}</p>
        )}
        {m.cards?.map((c, i) => (
          <CardView key={i} card={c} latest={latest} />
        ))}
      </div>
    </div>
  );
}

function Welcome() {
  return (
    <div className="flex gap-2">
      <Avatar />
      <div className="space-y-2 pt-1 text-sm leading-relaxed text-ink/90">
        <p>Hi, I&apos;m Vizzy, your creative director. Tell me the story you want to make. A full script, rough notes or one line all work.</p>
        <p className="text-muted">
          We&apos;ll lock a style bible, cast your characters, plan the pages, then draw them one by one. You choose and refine every image. At the end I&apos;ll stitch it into a film.
        </p>
      </div>
    </div>
  );
}
