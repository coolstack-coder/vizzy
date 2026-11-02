"use client";

import { Check, Film, Lock, Palette, RefreshCw, Sparkles, TriangleAlert, Users } from "lucide-react";
import { send } from "@/lib/director/run";
import { retryOption } from "@/lib/images";
import { focusPage, selectOption } from "@/lib/actions";
import { useVizzy } from "@/lib/store";
import type { Card, StyleDirection } from "@/lib/types";
import { Btn, PageImage, Swatches, formatMs, useImageUrl } from "./ui";

export function CardView({ card, latest }: { card: Card; latest: boolean }) {
  switch (card.kind) {
    case "question":
      return <QuestionCard card={card} latest={latest} />;
    case "brief":
      return <BriefCard />;
    case "style-directions":
      return <DirectionsCard directions={card.directions} latest={latest} />;
    case "style-bible":
      return <BibleCard />;
    case "cast":
      return <CastCard />;
    case "plan":
      return <PlanCard latest={latest} />;
    case "options":
      return <OptionsCard pageId={card.pageId} optionIds={card.optionIds} />;
    case "locked":
      return <LockedCard pageId={card.pageId} />;
    case "player":
      return (
        <Shell icon={<Film size={14} />} title="Your book is ready">
          <Btn variant="primary" onClick={() => useVizzy.getState().set({ playerOpen: true })}>
            <Film size={14} /> Play it
          </Btn>
        </Shell>
      );
    case "note":
      return (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
            card.tone === "error" ? "border-bad/40 bg-bad/10 text-bad" : card.tone === "warn" ? "border-warn/40 bg-warn/10 text-warn" : "border-line bg-panel-2 text-muted"
          }`}
        >
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>{card.text}</span>
        </div>
      );
  }
}

function Shell({ icon, title, children, aside }: { icon: React.ReactNode; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel-2/60">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted">
        <span className="text-accent">{icon}</span>
        {title}
        <span className="ml-auto normal-case tracking-normal">{aside}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function QuestionCard({ card, latest }: { card: Extract<Card, { kind: "question" }>; latest: boolean }) {
  const busy = useVizzy((s) => s.busy);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">{card.question}</p>
      <div className="flex flex-wrap gap-1.5">
        {card.chips.map((c) => (
          <button
            key={c.label}
            disabled={!latest || busy}
            onClick={() => send(c.value ?? c.label)}
            className="rounded-full border border-line-strong px-3 py-1 text-xs text-ink transition hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BriefCard() {
  const brief = useVizzy((s) => s.project!.brief);
  return (
    <Shell icon={<Sparkles size={14} />} title="Brief" aside={`${brief.pageCount} pages · ${brief.format.replace("-", " ")}`}>
      <h3 className="font-title text-xl leading-tight">{brief.title}</h3>
      <p className="mt-1 text-sm text-muted">{brief.logline}</p>
      <p className="mt-2 text-xs text-faint">Tone: {brief.tone}</p>
    </Shell>
  );
}

function DirectionsCard({ directions, latest }: { directions: StyleDirection[]; latest: boolean }) {
  const busy = useVizzy((s) => s.busy);
  const chosen = useVizzy((s) => s.project!.bible.name);
  return (
    <div className="grid gap-2">
      {directions.map((d) => {
        const picked = chosen === d.name;
        return (
          <button
            key={d.name}
            disabled={!latest || busy}
            onClick={() => send(`Let's go with "${d.name}".`)}
            className={`group relative overflow-hidden rounded-xl border p-3 text-left transition disabled:cursor-default ${
              picked ? "border-accent bg-accent/5" : "border-line bg-panel-2/60 hover:border-line-strong"
            }`}
          >
            <div className="absolute inset-y-0 right-0 flex w-24 opacity-80">
              {d.palette.map((c, i) => (
                <span key={i} className="flex-1" style={{ background: c.hex }} />
              ))}
            </div>
            <div className="relative mr-24 pr-2">
              <div className="flex items-center gap-2">
                <span className="font-title text-lg">{d.name}</span>
                {picked && <Check size={14} className="text-accent" />}
              </div>
              <p className="text-xs text-muted">{d.pitch}</p>
              <p className="mt-1 text-[11px] text-faint">{d.medium}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function BibleCard() {
  const bible = useVizzy((s) => s.project!.bible);
  return (
    <Shell
      icon={<Palette size={14} />}
      title="Style bible"
      aside={
        <span className={bible.locked ? "text-good" : "text-warn"}>
          v{bible.version} {bible.locked ? "· locked" : "· draft"}
        </span>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-title text-lg">{bible.name}</h3>
          <p className="text-xs text-muted">{bible.medium}</p>
        </div>
        <Swatches colors={bible.palette} size={22} />
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-faint">Light</dt>
        <dd className="text-muted">{bible.lighting}</dd>
        <dt className="text-faint">Texture</dt>
        <dd className="text-muted">{bible.texture}</dd>
        <dt className="text-faint">Mood</dt>
        <dd className="text-muted">{bible.moodWords.join(" · ")}</dd>
        <dt className="text-faint">Frame</dt>
        <dd className="text-muted">
          {bible.aspect} · {bible.lettering} lettering
        </dd>
      </dl>
    </Shell>
  );
}

function CastCard() {
  const characters = useVizzy((s) => s.project!.characters);
  return (
    <Shell icon={<Users size={14} />} title="Cast" aside={`${characters.length} principal${characters.length === 1 ? "" : "s"}`}>
      <div className="space-y-2">
        {characters.map((c) => (
          <CastRow key={c.id} name={c.name} role={c.role} look={c.look} refImageId={c.refImageId} />
        ))}
      </div>
    </Shell>
  );
}

function CastRow({ name, role, look, refImageId }: { name: string; role: string; look: string; refImageId?: string }) {
  const url = useImageUrl(refImageId);
  return (
    <div className="flex gap-3">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-panel">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-title text-xl text-faint">{name[0]}</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">
          {name} <span className="font-normal text-faint">· {role}</span>
        </div>
        <p className="line-clamp-2 text-xs text-muted">{look}</p>
      </div>
    </div>
  );
}

function PlanCard({ latest }: { latest: boolean }) {
  const pages = useVizzy((s) => s.project!.pages);
  const phase = useVizzy((s) => s.project!.phase);
  const busy = useVizzy((s) => s.busy);
  return (
    <Shell icon={<Film size={14} />} title="Page plan" aside={`${pages.length} pages`}>
      <ol className="space-y-1.5">
        {pages.map((p, i) => (
          <li key={p.id}>
            <button onClick={() => focusPage(p.id)} className="flex w-full gap-2 rounded-md px-1 py-0.5 text-left hover:bg-panel">
              <span className="w-5 shrink-0 text-right font-mono text-xs text-faint">{i + 1}</span>
              <span className="min-w-0">
                <span className="text-sm font-medium">{p.title}</span>
                <span className="ml-2 text-[11px] text-faint">
                  {p.shot.type}, {p.shot.angle}
                </span>
                <span className="line-clamp-1 text-xs text-muted">{p.beat}</span>
              </span>
              {p.status === "locked" && <Lock size={12} className="ml-auto mt-1 shrink-0 text-good" />}
            </button>
          </li>
        ))}
      </ol>
      {latest && phase === "plan" && (
        <div className="mt-3 flex gap-2">
          <Btn variant="primary" disabled={busy} onClick={() => send("The plan looks good. Let's start drawing page 1.")}>
            <Check size={14} /> Approve plan
          </Btn>
        </div>
      )}
    </Shell>
  );
}

function OptionsCard({ pageId, optionIds }: { pageId: string; optionIds: string[] }) {
  const project = useVizzy((s) => s.project!);
  const page = project.pages.find((p) => p.id === pageId);
  if (!page) return null;
  const n = project.pages.indexOf(page) + 1;
  const options = optionIds.map((id) => page.options.find((o) => o.id === id)).filter((o) => !!o);
  return (
    <Shell icon={<Sparkles size={14} />} title={`Page ${n} · ${page.title}`} aside={page.status === "locked" ? <span className="text-good">locked</span> : undefined}>
      <div className={`grid gap-2 ${options.length === 1 ? "grid-cols-2" : options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {options.map((o, i) => {
          const selected = page.selectedId === o.id;
          return (
            <button
              key={o.id}
              onClick={() => selectOption(page.id, o.id)}
              disabled={o.status !== "ready"}
              className={`group relative overflow-hidden rounded-lg text-left ring-2 transition ${selected ? "ring-accent" : "ring-transparent hover:ring-line-strong"}`}
            >
              {o.status === "error" ? (
                <div className="flex flex-col items-center justify-center gap-2 bg-panel p-3 text-center text-xs text-bad" style={{ aspectRatio: "2/3" }}>
                  <TriangleAlert size={16} />
                  <span className="line-clamp-4">{o.error}</span>
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      retryOption(page.id, o.id);
                    }}
                    className="inline-flex items-center gap-1 rounded border border-bad/40 px-2 py-0.5 text-[11px] hover:bg-bad/10"
                  >
                    <RefreshCw size={11} /> Retry
                  </span>
                </div>
              ) : (
                <PageImage imageId={o.imageId} aspect={project.bible.aspect} />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-5 text-[11px] leading-tight text-white">
                <span className="mr-1 inline-flex h-4 min-w-4 items-center justify-center rounded bg-white/15 px-1 font-mono text-[10px]">{optionIds.length > 1 ? i + 1 : "↻"}</span>
                {o.label.split(" · ").slice(1).join(" · ") || o.label}
                {o.status === "pending" && <span className="ml-1 text-white/60">rendering…</span>}
                {o.ms ? <span className="ml-1 text-white/40">{formatMs(o.ms)}</span> : null}
              </div>
              {selected && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-accent p-0.5 text-accent-ink">
                  <Check size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Shell>
  );
}

function LockedCard({ pageId }: { pageId: string }) {
  const project = useVizzy((s) => s.project!);
  const page = project.pages.find((p) => p.id === pageId);
  if (!page) return null;
  const n = project.pages.indexOf(page) + 1;
  const opt = page.options.find((o) => o.id === page.lockedOptionId);
  return (
    <button onClick={() => focusPage(page.id)} className="flex w-full items-center gap-3 rounded-xl border border-good/30 bg-good/5 p-2 text-left">
      <div className="w-12 shrink-0 overflow-hidden rounded">
        <PageImage imageId={opt?.imageId} aspect={project.bible.aspect} />
      </div>
      <div className="text-sm">
        <div className="flex items-center gap-1.5 font-medium text-good">
          <Lock size={13} /> Page {n} locked
        </div>
        <div className="text-xs text-muted">{page.title}</div>
      </div>
    </button>
  );
}
