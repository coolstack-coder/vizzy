"use client";

import { ArrowRight, BookOpen, Clapperboard, Palette, Trash2, Users, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { renderSketchSvg } from "@/lib/art/sketch";
import { send } from "@/lib/director/run";
import { deleteProject } from "@/lib/storage";
import { useVizzy } from "@/lib/store";
import type { Project } from "@/lib/types";
import { PageImage } from "./ui";

const EXAMPLES = [
  {
    label: "D-Day graphic novel",
    text: "A graphic novel about D-Day in World War II, told through one young medic landing on Omaha Beach. Muted, gritty colours with a single red accent.",
  },
  {
    label: "Lighthouse picture book",
    text: "A picture book about an old lighthouse keeper and the stray dog who keeps him company on his last night before the lamp is automated. Warm blues and lantern orange.",
  },
  {
    label: "Heist storyboard",
    text: "A film storyboard for the opening of a rain-soaked heist thriller in a neon city at night. Teal and magenta.",
  },
];

const COLLAGE = [
  { prompt: "wide beach landing craft smoke soldiers dawn", palette: ["#d9cfbd", "#b3261e", "#1c1b1a", "#f4efe6"] },
  { prompt: "close-up soldier helmet face", palette: ["#8a9a8c", "#c7883a", "#2e3330", "#e6dccb"] },
  { prompt: "night city street rain figure", palette: ["#24325f", "#ff4fa3", "#0b0c10", "#7ff3e8"] },
  { prompt: "lighthouse sea night moon dog", palette: ["#3d5a80", "#ee6c4d", "#1b263b", "#e0fbfc"] },
  { prompt: "forest field figures walking low angle", palette: ["#f2e8cf", "#ff6b4a", "#24325f", "#fffaf0"] },
  { prompt: "aircraft paratrooper sky high angle", palette: ["#2f3e46", "#e9c46a", "#0b0c0d", "#edf2f4"] },
];

export function Home() {
  const library = useVizzy((s) => s.library);
  const [text, setText] = useState("");
  const collage = useMemo(
    () =>
      COLLAGE.map((c, i) => `data:image/svg+xml;utf8,${encodeURIComponent(renderSketchSvg({ ...c, width: 400, height: 600, seed: `home${i}`, figures: 2 }))}`),
    [],
  );

  useEffect(() => {
    void useVizzy.getState().refreshLibrary();
  }, []);

  const start = (story: string) => {
    if (!story.trim()) return;
    useVizzy.getState().createProject("Untitled story");
    void send(story);
  };

  return (
    <div className="h-dvh overflow-y-auto">
      <div className="relative overflow-hidden border-b border-line">
        <div className="pointer-events-none absolute inset-0 flex -rotate-6 scale-110 gap-3 opacity-25 [mask-image:linear-gradient(to_bottom,black,transparent)]">
          {collage.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" className="h-[520px] w-auto shrink-0 rounded-sm" style={{ marginTop: (i % 2) * 60 }} />
          ))}
        </div>
        <div className="relative mx-auto max-w-3xl px-6 pb-14 pt-16">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-title text-lg font-semibold text-accent-ink">V</div>
            <span className="font-title text-2xl">Vizzy</span>
          </div>
          <h1 className="font-title text-5xl leading-[1.05] tracking-tight sm:text-6xl">
            Direct your story,
            <br />
            <span className="text-accent">page by page.</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Chat with an AI creative director to build a graphic novel, picture book or film storyboard. Set the look once, choose and refine every frame, then play it as a film.
          </p>

          <form
            className="mt-8 rounded-2xl border border-line-strong bg-panel/90 p-3 shadow-2xl shadow-black/40 backdrop-blur"
            onSubmit={(e) => {
              e.preventDefault();
              start(text);
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start(text);
              }}
              rows={4}
              placeholder="What's your story? Paste a script, rough notes, or just one line…"
              className="w-full resize-none bg-transparent p-2 text-base outline-none placeholder:text-faint"
            />
            <div className="flex flex-wrap items-center gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex.label} type="button" onClick={() => setText(ex.text)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent">
                  {ex.label}
                </button>
              ))}
              <button type="submit" disabled={!text.trim()} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-40">
                Start creating <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { icon: <Palette size={16} />, title: "Style bible", body: "One locked look (palette, light, texture) compiled into every prompt." },
            { icon: <Users size={16} />, title: "Consistent cast", body: "Reference sheets travel with each page so faces stay the same." },
            { icon: <Wand2 size={16} />, title: "Choose & refine", body: "Deliberately different takes per page, then targeted edits." },
            { icon: <Clapperboard size={16} />, title: "Play & export", body: "Ken Burns film with lettering, exported as MP4, PDF, PNGs or HTML." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-line bg-panel/60 p-4">
              <div className="mb-2 text-accent">{f.icon}</div>
              <div className="text-sm font-medium">{f.title}</div>
              <p className="mt-1 text-xs text-muted">{f.body}</p>
            </div>
          ))}
        </div>

        {library.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-4 flex items-center gap-2 text-sm uppercase tracking-widest text-faint">
              <BookOpen size={14} /> Your books
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              {library.map((p) => (
                <LibraryItem key={p.id} p={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryItem({ p }: { p: Project }) {
  const cover = p.pages.map((pg) => pg.options.find((o) => o.id === (pg.lockedOptionId ?? pg.selectedId))?.imageId).find(Boolean);
  const locked = p.pages.filter((x) => x.status === "locked").length;
  return (
    <div className="group relative">
      <button onClick={() => useVizzy.getState().open(p.id)} className="block w-full text-left">
        <PageImage imageId={cover} aspect={p.bible.aspect} className="rounded-sm ring-1 ring-line transition group-hover:ring-accent">
          {!cover && <div className="absolute inset-0 flex items-center justify-center p-3 text-center font-title text-lg text-faint">{p.title}</div>}
        </PageImage>
        <div className="mt-1.5 truncate text-sm">{p.title}</div>
        <div className="text-[11px] text-faint">
          {p.pages.length ? `${locked}/${p.pages.length} pages` : p.phase} · {new Date(p.updatedAt).toLocaleDateString()}
        </div>
      </button>
      <button
        onClick={async () => {
          if (!confirm(`Delete "${p.title}"?`)) return;
          await deleteProject(p.id);
          void useVizzy.getState().refreshLibrary();
        }}
        className="absolute right-1.5 top-1.5 hidden rounded-full bg-black/70 p-1.5 text-white/80 hover:text-bad group-hover:block"
        aria-label="Delete project"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
