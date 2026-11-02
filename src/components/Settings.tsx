"use client";

import { KeyRound, X } from "lucide-react";
import { useState } from "react";
import { useVizzy, type DirectorMode, type ImageProviderId } from "@/lib/store";
import { Btn } from "./ui";

export function Settings({ onClose }: { onClose: () => void }) {
  const { config, keys, directorMode, imageProvider, set, setKeys } = useVizzy();
  const [draft, setDraft] = useState(keys);
  const hasDirector = !!config?.director || !!draft.anthropic;
  const hasGemini = !!config?.gemini || !!draft.gemini;
  const hasOpenai = !!config?.openai || !!draft.openai;

  const Option = <T extends string>({ value, current, onPick, label, sub, enabled = true }: { value: T; current: T; onPick: (v: T) => void; label: string; sub: string; enabled?: boolean }) => (
    <button
      disabled={!enabled}
      onClick={() => onPick(value)}
      className={`flex-1 rounded-lg border p-3 text-left transition disabled:opacity-40 ${current === value ? "border-accent bg-accent/5" : "border-line hover:border-line-strong"}`}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted">{sub}</div>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center">
          <h2 className="font-title text-xl">Settings</h2>
          <button className="ml-auto text-muted hover:text-ink" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-faint">Director</h3>
          <div className="flex gap-2">
            <Option<DirectorMode> value="claude" current={directorMode} onPick={(v) => set({ directorMode: v })} label="Claude" sub={config?.directorModel ?? "claude-opus-5-5"} enabled={hasDirector} />
            <Option<DirectorMode> value="demo" current={directorMode} onPick={(v) => set({ directorMode: v })} label="Offline" sub="Scripted director, no key" />
          </div>
        </section>

        <section className="mt-4 space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-faint">Images</h3>
          <div className="flex gap-2">
            <Option<ImageProviderId> value="gemini" current={imageProvider} onPick={(v) => set({ imageProvider: v })} label="Gemini" sub={config?.geminiModel ?? "gemini"} enabled={hasGemini} />
            <Option<ImageProviderId> value="openai" current={imageProvider} onPick={(v) => set({ imageProvider: v })} label="OpenAI" sub={config?.openaiModel ?? "gpt-image"} enabled={hasOpenai} />
            <Option<ImageProviderId> value="sketch" current={imageProvider} onPick={(v) => set({ imageProvider: v })} label="Sketch" sub="Offline renderer" />
          </div>
        </section>

        <section className="mt-5 space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-faint">
            <KeyRound size={12} /> Bring your own keys
          </h3>
          <p className="text-xs text-muted">Stored only in this browser and sent per request. Leave empty to use the server&apos;s keys.</p>
          {(["anthropic", "gemini", "openai"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <span className="w-20 capitalize text-muted">{k}</span>
              <input
                type="password"
                autoComplete="off"
                value={draft[k] ?? ""}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value || undefined })}
                placeholder={config?.[k === "anthropic" ? "director" : k] ? "set on server" : "not set"}
                className="flex-1 rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-xs outline-none focus:border-accent"
              />
            </label>
          ))}
        </section>

        <div className="mt-5 flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            onClick={() => {
              setKeys(draft);
              // Newly added keys switch the matching capability on.
              if (draft.anthropic && !keys.anthropic) set({ directorMode: "claude" });
              if (draft.gemini && !keys.gemini) set({ imageProvider: "gemini" });
              else if (draft.openai && !keys.openai && imageProvider === "sketch") set({ imageProvider: "openai" });
              onClose();
            }}
          >
            Save
          </Btn>
        </div>
      </div>
    </div>
  );
}
