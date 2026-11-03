"use client";

import { ChevronLeft, Film, Save, Settings2 } from "lucide-react";
import { exportBackup } from "@/lib/backup";
import { useState } from "react";
import { useVizzy } from "@/lib/store";
import { PHASES } from "@/lib/types";
import { Canvas } from "./Canvas";
import { Chat } from "./Chat";
import { Player } from "./Player";
import { Settings } from "./Settings";
import { Btn } from "./ui";

export function Studio() {
  const project = useVizzy((s) => s.project!);
  const playerOpen = useVizzy((s) => s.playerOpen);
  const { directorMode, imageProvider } = useVizzy();
  const [settings, setSettings] = useState(false);
  const phaseIndex = PHASES.findIndex((p) => p.id === project.phase);
  const locked = project.pages.filter((p) => p.status === "locked").length;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-panel px-3 py-2">
        <button onClick={() => useVizzy.getState().close()} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-muted hover:text-ink" title="All projects">
          <ChevronLeft size={16} />
          <span className="font-title text-lg font-semibold text-accent">Vizzy</span>
        </button>
        <span className="h-5 w-px bg-line" />
        <input
          value={project.title}
          onChange={(e) =>
            useVizzy.getState().mutate((p) => {
              p.title = e.target.value;
              p.brief.title = e.target.value;
            })
          }
          className="min-w-0 max-w-[16rem] bg-transparent font-title text-lg outline-none focus:text-accent"
          aria-label="Project title"
        />

        <ol className="mx-auto hidden items-center gap-1 md:flex">
          {PHASES.map((ph, i) => (
            <li key={ph.id} className="flex items-center gap-1">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs transition ${
                  i === phaseIndex ? "bg-accent text-accent-ink" : i < phaseIndex ? "text-ink" : "text-faint"
                }`}
              >
                {ph.label}
                {ph.id === "pages" && project.pages.length > 0 && ` ${locked}/${project.pages.length}`}
              </span>
              {i < PHASES.length - 1 && <span className={`h-px w-3 ${i < phaseIndex ? "bg-ink/40" : "bg-line"}`} />}
            </li>
          ))}
        </ol>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setSettings(true)}
            className="hidden items-center gap-2 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted hover:border-line-strong sm:flex"
            title="Director and image provider"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${directorMode === "claude" ? "bg-good" : "bg-warn"}`} />
            {directorMode === "claude" ? "Claude" : "Offline director"}
            <span className="text-faint">·</span>
            {imageProvider === "sketch" ? "Sketch renderer" : imageProvider === "gemini" ? "Gemini" : "OpenAI"}
          </button>
          <span className="hidden text-[11px] tabular-nums text-faint lg:inline" title={`${project.usage.inputTokens.toLocaleString()} in · ${project.usage.outputTokens.toLocaleString()} out · ${project.usage.images} images`}>
            ${project.usage.costUsd.toFixed(2)} · {project.usage.images} img
          </span>
          <Btn variant="ghost" onClick={() => void exportBackup(project)} title="Download a backup of this book (.vizzy.json)">
            <Save size={16} />
          </Btn>
          <Btn variant="ghost" onClick={() => setSettings(true)} title="Settings">
            <Settings2 size={16} />
          </Btn>
          <Btn variant="primary" onClick={() => useVizzy.getState().set({ playerOpen: true })} disabled={!project.pages.some((p) => p.selectedId || p.lockedOptionId)}>
            <Film size={14} /> Play
          </Btn>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section className="flex min-h-0 flex-[1_1_50%] flex-col border-line bg-panel md:max-w-[440px] md:flex-none md:basis-[400px] md:border-r xl:basis-[440px]">
          <Chat />
        </section>
        <section className="min-h-0 flex-[1_1_50%] md:flex-1">
          <Canvas />
        </section>
      </div>

      {playerOpen && <Player />}
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}
