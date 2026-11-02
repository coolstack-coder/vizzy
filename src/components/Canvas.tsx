"use client";

import { Code2, Crosshair, Lock, MessageSquarePlus, Plus, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { focusPage, movePage, removeBalloon, selectOption, setFocusPoint, updateBalloon } from "@/lib/actions";
import { send } from "@/lib/director/run";
import { uid } from "@/lib/defaults";
import { useVizzy } from "@/lib/store";
import type { Balloon, BalloonKind, Page, Project } from "@/lib/types";
import { BalloonView, Btn, Kbd, PageImage, Swatches, Tails, formatMs, useImageUrl } from "./ui";
import { ASPECT_RATIO } from "@/lib/defaults";

export function Canvas() {
  const view = useVizzy((s) => s.view);
  const set = useVizzy((s) => s.set);
  const tabs: { id: typeof view; label: string }[] = [
    { id: "page", label: "Page" },
    { id: "plan", label: "Plan" },
    { id: "bible", label: "Style bible" },
    { id: "cast", label: "Cast" },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => set({ view: t.id })}
            className={`rounded-md px-3 py-1 text-sm transition ${view === t.id ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto hidden items-center gap-2 text-[11px] text-faint lg:flex">
          <Kbd>1-4</Kbd> pick <Kbd>←→</Kbd> pages <Kbd>L</Kbd> lock <Kbd>P</Kbd> play <Kbd>/</Kbd> chat
        </div>
      </div>
      <div className="grain min-h-0 flex-1 overflow-y-auto">
        {view === "page" && <PageEditor />}
        {view === "plan" && <PlanView />}
        {view === "bible" && <BibleView />}
        {view === "cast" && <CastView />}
      </div>
      <Filmstrip />
      <PromptDrawer />
    </div>
  );
}

function useCurrentPage(): [Project, Page | undefined, number] {
  const project = useVizzy((s) => s.project!);
  const page = project.pages.find((p) => p.id === project.currentPageId) ?? project.pages[0];
  return [project, page, page ? project.pages.indexOf(page) : -1];
}

function PageEditor() {
  const [project, page, index] = useCurrentPage();
  const busy = useVizzy((s) => s.busy);
  const frame = useRef<HTMLDivElement>(null);
  const [aiming, setAiming] = useState(false);

  // Keyboard shortcuts for the page loop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return;
      if (!page) return;
      const ready = page.options.filter((o) => o.status === "ready");
      const latest = ready.slice(-4);
      if (/^[1-9]$/.test(e.key)) {
        const o = latest[Number(e.key) - 1];
        if (o) selectOption(page.id, o.id);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const next = project.pages[index + (e.key === "ArrowRight" ? 1 : -1)];
        if (next) focusPage(next.id);
      } else if (e.key.toLowerCase() === "l" && page.selectedId && page.status !== "locked" && !busy) {
        void send(`Lock page ${index + 1}.`);
      } else if (e.key.toLowerCase() === "p") {
        useVizzy.getState().set({ playerOpen: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, project.pages, index, busy]);

  if (!page)
    return (
      <EmptyState
        title="Your pages will appear here"
        body="Start in the chat. Once the style bible and page plan are agreed, each page is drawn, chosen and refined here."
      />
    );

  const shown = page.options.find((o) => o.id === (page.selectedId ?? page.lockedOptionId)) ?? page.options.filter((o) => o.status === "ready").slice(-1)[0];
  const ratio = ASPECT_RATIO[project.bible.aspect];

  const startDrag = (b: Balloon) => (e: React.PointerEvent) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const ox = e.clientX;
    const oy = e.clientY;
    const bx = b.x;
    const by = b.y;
    const move = (ev: PointerEvent) => {
      const x = Math.max(0, Math.min(1 - b.w, bx + (ev.clientX - ox) / box.width));
      const y = Math.max(0, Math.min(0.95, by + (ev.clientY - oy) / box.height));
      updateBalloon(page.id, b.id, { x, y, tail: b.tail ? { x: b.tail.x + (x - bx), y: b.tail.y + (y - by) } : undefined });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const addBalloon = (kind: BalloonKind) => {
    const b: Balloon = { id: uid("b_"), kind, text: kind === "sfx" ? "BOOM" : kind === "caption" ? "Meanwhile…" : "…", x: 0.3, y: 0.06, w: kind === "caption" ? 0.42 : 0.34 };
    if (kind === "speech" || kind === "thought") b.tail = { x: 0.48, y: 0.3 };
    useVizzy.getState().mutate((p) => {
      p.pages.find((x) => x.id === page.id)!.balloons.push(b);
    });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-5 xl:flex-row">
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <div className="mb-2 flex w-full items-baseline gap-2">
          <span className="font-mono text-xs text-faint">PAGE {index + 1}/{project.pages.length}</span>
          <h2 className="font-title text-2xl">{page.title}</h2>
          <StatusPill status={page.status} />
        </div>
        <div
          ref={frame}
          className={`relative w-full overflow-hidden rounded-sm shadow-2xl shadow-black/60 ring-1 ring-line ${aiming ? "cursor-crosshair" : ""}`}
          style={{ maxWidth: `calc(68vh * ${ratio})`, aspectRatio: ratio, containerType: "size" }}
          onClick={(e) => {
            if (!aiming) return;
            const r = e.currentTarget.getBoundingClientRect();
            setFocusPoint(page.id, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
            setAiming(false);
          }}
        >
          {shown?.imageId ? <FullImage id={shown.imageId} /> : <div className={`absolute inset-0 ${page.status === "generating" ? "shimmer" : "bg-panel-2"}`} />}
          {!shown && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="font-title text-lg text-ink/80">{page.status === "generating" ? "Rendering options…" : "Not drawn yet"}</p>
              <p className="max-w-sm text-xs text-muted">{page.beat}</p>
            </div>
          )}
          <Tails balloons={page.balloons} />
          {page.balloons.map((b) => (
            <div key={b.id} className="group">
              <BalloonView
                b={b}
                lettering={project.bible.lettering}
                editable
                onChange={(text) => updateBalloon(page.id, b.id, { text }, `"${text}"`)}
                onDragStart={startDrag(b)}
              />
              <button
                onClick={() => removeBalloon(page.id, b.id)}
                className="absolute hidden rounded-full bg-black/70 p-1 text-white group-hover:block"
                style={{ left: `calc(${(b.x + b.w) * 100}% - 10px)`, top: `calc(${b.y * 100}% - 10px)` }}
                aria-label="Remove lettering"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          <span
            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent/80"
            style={{ left: `${page.focus.x * 100}%`, top: `${page.focus.y * 100}%`, opacity: aiming ? 1 : 0.35 }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
          <Btn onClick={() => addBalloon("speech")} title="Add speech balloon">
            <MessageSquarePlus size={14} /> Speech
          </Btn>
          <Btn onClick={() => addBalloon("caption")} title="Add caption">
            <Plus size={14} /> Caption
          </Btn>
          <Btn onClick={() => addBalloon("sfx")} title="Add sound effect">
            <Plus size={14} /> SFX
          </Btn>
          <Btn onClick={() => setAiming((a) => !a)} title="Set where the camera pushes in during playback" className={aiming ? "text-accent" : ""}>
            <Crosshair size={14} /> Camera focus
          </Btn>
        </div>
      </div>

      <aside className="w-full shrink-0 space-y-3 xl:w-64">
        <div className="rounded-xl border border-line bg-panel/80 p-3">
          <div className="text-[11px] uppercase tracking-wider text-faint">Beat</div>
          <p className="mt-1 text-sm text-muted">{page.beat}</p>
          <div className="mt-2 text-[11px] text-faint">
            {page.shot.type} · {page.shot.angle}
          </div>
        </div>
        {page.options.length > 0 && (
          <div className="rounded-xl border border-line bg-panel/80 p-3">
            <div className="mb-2 flex items-center text-[11px] uppercase tracking-wider text-faint">
              Takes <span className="ml-auto normal-case tracking-normal">{page.options.length}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5 xl:grid-cols-3">
              {page.options.map((o) => (
                <button
                  key={o.id}
                  title={o.label}
                  disabled={o.status !== "ready"}
                  onClick={() => selectOption(page.id, o.id)}
                  className={`relative overflow-hidden rounded ring-2 ${o.id === page.selectedId ? "ring-accent" : "ring-transparent hover:ring-line-strong"}`}
                >
                  {o.status === "error" ? (
                    <div className="flex items-center justify-center bg-bad/10 text-[10px] text-bad" style={{ aspectRatio: ratio }}>
                      failed
                    </div>
                  ) : (
                    <PageImage imageId={o.imageId} aspect={project.bible.aspect} />
                  )}
                  <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 font-mono text-[9px] text-white">{o.label.split(" · ")[0]}</span>
                </button>
              ))}
            </div>
            {shown && (
              <div className="mt-2 space-y-0.5 text-[11px] text-faint">
                <div className="line-clamp-2 text-muted">{shown.label}</div>
                <div>
                  {shown.model}
                  {shown.ms ? ` · ${formatMs(shown.ms)}` : ""}
                  {shown.costUsd ? ` · $${shown.costUsd.toFixed(3)}` : ""}
                </div>
                <button className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => useVizzy.getState().set({ promptDrawer: { pageId: page.id, optionId: shown.id } })}>
                  <Code2 size={11} /> Show compiled prompt
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {page.status !== "locked" && page.selectedId && (
            <Btn variant="primary" disabled={busy} onClick={() => send(`Lock page ${index + 1}.`)} className="justify-center">
              <Lock size={14} /> Lock this page
            </Btn>
          )}
          <Btn
            variant="outline"
            disabled={busy}
            className="justify-center"
            onClick={() => send(page.options.length ? `Give me fresh options for page ${index + 1}.` : `Draw page ${index + 1}.`)}
          >
            <RefreshCw size={14} /> {page.options.length ? "More takes" : "Draw this page"}
          </Btn>
        </div>
      </aside>
    </div>
  );
}

function FullImage({ id }: { id: string }) {
  const url = useImageUrl(id);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" /> : <div className="shimmer absolute inset-0" />;
}

function StatusPill({ status }: { status: Page["status"] }) {
  const map = {
    draft: "text-faint border-line",
    generating: "text-accent border-accent/40",
    choosing: "text-warn border-warn/40",
    locked: "text-good border-good/40",
  } as const;
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${map[status]}`}>{status}</span>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center p-10 text-center">
      <div className="mb-4 grid grid-cols-3 gap-1.5 opacity-40">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 w-12 rounded-sm border border-dashed border-line-strong" />
        ))}
      </div>
      <h3 className="font-title text-xl">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
    </div>
  );
}

function PlanView() {
  const project = useVizzy((s) => s.project!);
  if (!project.pages.length) return <EmptyState title="No page plan yet" body="Vizzy proposes a page-by-page plan after the style bible and cast are set." />;
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 p-5 md:grid-cols-3 lg:grid-cols-4">
      {project.pages.map((p, i) => {
        const opt = p.options.find((o) => o.id === (p.lockedOptionId ?? p.selectedId));
        return (
          <button key={p.id} onClick={() => focusPage(p.id)} className="group text-left">
            <PageImage imageId={opt?.imageId} aspect={project.bible.aspect} balloons={p.balloons} lettering={project.bible.lettering} scale={1} className="rounded-sm ring-1 ring-line transition group-hover:ring-accent">
              {!opt && <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] text-faint">{p.beat}</div>}
            </PageImage>
            <div className="mt-1.5 flex items-center gap-1.5 text-sm">
              <span className="font-mono text-xs text-faint">{i + 1}</span>
              <span className="truncate">{p.title}</span>
              {p.status === "locked" && <Lock size={11} className="ml-auto text-good" />}
            </div>
            <div className="text-[11px] text-faint">{p.shot.type}</div>
          </button>
        );
      })}
    </div>
  );
}

function BibleView() {
  const bible = useVizzy((s) => s.project!.bible);
  if (!bible.medium) return <EmptyState title="No style bible yet" body="Vizzy will offer a few visual directions. The one you pick is locked into every image prompt." />;
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-accent">Style bible · v{bible.version}</div>
        <h2 className="font-title text-4xl">{bible.name}</h2>
        <p className="mt-1 text-muted">{bible.medium}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {bible.palette.map((c) => (
          <div key={c.hex + c.role} className="overflow-hidden rounded-lg border border-line">
            <div className="h-20" style={{ background: c.hex }} />
            <div className="p-2 text-xs">
              <div className="font-medium">{c.name}</div>
              <div className="font-mono text-faint">
                {c.hex} · {c.role}
              </div>
            </div>
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
        <dt className="text-faint">Lighting</dt>
        <dd>{bible.lighting}</dd>
        <dt className="text-faint">Texture</dt>
        <dd>{bible.texture}</dd>
        <dt className="text-faint">Mood</dt>
        <dd>{bible.moodWords.join(" · ")}</dd>
        <dt className="text-faint">Aspect</dt>
        <dd>{bible.aspect}</dd>
        <dt className="text-faint">Lettering</dt>
        <dd className="capitalize">{bible.lettering}</dd>
        <dt className="text-faint">Never</dt>
        <dd>{bible.negative.join(", ") || "n/a"}</dd>
      </dl>
      <p className="text-xs text-faint">Ask Vizzy in the chat to change anything here. The version number goes up and every following page uses the new bible.</p>
    </div>
  );
}

function CastView() {
  const project = useVizzy((s) => s.project!);
  if (!project.characters.length) return <EmptyState title="No cast yet" body="Principal characters get a frozen visual description and a reference sheet, so they look the same on every page." />;
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {project.characters.map((c) => (
          <div key={c.id} className="overflow-hidden rounded-xl border border-line bg-panel/80">
            <PageImage imageId={c.refImageId} aspect="1:1">
              {!c.refImageId && <div className="absolute inset-0 flex items-center justify-center font-title text-6xl text-faint">{c.name[0]}</div>}
            </PageImage>
            <div className="p-3">
              <div className="font-title text-xl">{c.name}</div>
              <div className="text-xs text-accent">{c.role}</div>
              <p className="mt-2 text-sm text-muted">{c.look}</p>
              <p className="mt-1 text-xs text-faint">Wears {c.wardrobe}</p>
            </div>
          </div>
        ))}
      </div>
      {project.locations.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs uppercase tracking-widest text-faint">Locations</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {project.locations.map((l) => (
              <div key={l.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted">{l.look}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-faint">
        <Swatches colors={project.bible.palette} size={14} /> Reference sheets are drawn in the locked style.
      </div>
    </div>
  );
}

function Filmstrip() {
  const project = useVizzy((s) => s.project!);
  const [drag, setDrag] = useState<number | null>(null);
  if (!project.pages.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto border-t border-line bg-panel/60 px-3 py-2">
      {project.pages.map((p, i) => {
        const opt = p.options.find((o) => o.id === (p.lockedOptionId ?? p.selectedId));
        const current = p.id === (project.currentPageId ?? project.pages[0].id);
        return (
          <button
            key={p.id}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag !== null) movePage(drag, i);
              setDrag(null);
            }}
            onClick={() => focusPage(p.id)}
            className={`relative w-14 shrink-0 overflow-hidden rounded-sm ring-2 transition ${current ? "ring-accent" : "ring-transparent hover:ring-line-strong"}`}
            title={`${i + 1}. ${p.title}`}
          >
            <PageImage imageId={opt?.imageId} aspect={project.bible.aspect} className={p.status === "generating" ? "pulse-ring" : ""} />
            <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 font-mono text-[9px] text-white">{i + 1}</span>
            <span
              className={`absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full ${
                p.status === "locked" ? "bg-good" : p.status === "choosing" ? "bg-warn" : p.status === "generating" ? "bg-accent" : "bg-faint"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

function PromptDrawer() {
  const drawer = useVizzy((s) => s.promptDrawer);
  const project = useVizzy((s) => s.project!);
  if (!drawer) return null;
  const page = project.pages.find((p) => p.id === drawer.pageId);
  const opt = page?.options.find((o) => o.id === drawer.optionId);
  if (!opt) return null;
  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-line bg-panel shadow-2xl">
      <div className="flex items-center border-b border-line px-4 py-3">
        <Code2 size={15} className="mr-2 text-accent" />
        <span className="font-medium">Compiled prompt</span>
        <button className="ml-auto text-muted hover:text-ink" onClick={() => useVizzy.getState().set({ promptDrawer: undefined })}>
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <p className="text-xs text-muted">
          Vizzy writes the beat. Code compiles the rest from the style bible and the cast, so every page gets the same constraints, and you can see exactly what the model was told.
        </p>
        <pre className="whitespace-pre-wrap rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-ink/90">{opt.prompt}</pre>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
          <dt className="text-faint">Visual refs</dt>
          <dd>{opt.refsUsed.length ? opt.refsUsed.join(", ") : "none"}</dd>
          <dt className="text-faint">Provider</dt>
          <dd>{opt.provider}</dd>
          <dt className="text-faint">Model</dt>
          <dd>{opt.model}</dd>
          <dt className="text-faint">Latency</dt>
          <dd>{formatMs(opt.ms) || "n/a"}</dd>
          <dt className="text-faint">Cost</dt>
          <dd>${(opt.costUsd ?? 0).toFixed(3)}</dd>
          {opt.instruction && (
            <>
              <dt className="text-faint">Refinement</dt>
              <dd>{opt.instruction}</dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
