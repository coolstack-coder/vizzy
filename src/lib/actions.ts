"use client";

import { recordEvent } from "./director/run";
import { getProject, useVizzy } from "./store";
import type { Balloon } from "./types";

// Direct-manipulation actions from the UI. They change state immediately and
// leave a note for the director, so the conversation stays in sync without
// spending a model turn on every click.

export function selectOption(pageId: string, optionId: string) {
  const p = getProject();
  const n = p.pages.findIndex((x) => x.id === pageId) + 1;
  const opt = p.pages[n - 1]?.options.find((o) => o.id === optionId);
  if (!opt || opt.status !== "ready") return;
  useVizzy.getState().mutate((d) => {
    const pg = d.pages.find((x) => x.id === pageId)!;
    pg.selectedId = optionId;
    d.currentPageId = pageId;
  });
  useVizzy.getState().set({ view: "page" });
  recordEvent(`selected option "${opt.label}" on page ${n}`);
}

export function focusPage(pageId: string) {
  useVizzy.getState().mutate((d) => {
    d.currentPageId = pageId;
  });
  useVizzy.getState().set({ view: "page" });
}

export function updateBalloon(pageId: string, balloonId: string, patch: Partial<Balloon>, note?: string) {
  const p = getProject();
  const n = p.pages.findIndex((x) => x.id === pageId) + 1;
  useVizzy.getState().mutate((d) => {
    const b = d.pages.find((x) => x.id === pageId)?.balloons.find((x) => x.id === balloonId);
    if (b) Object.assign(b, patch);
  });
  if (note) recordEvent(`edited lettering on page ${n}: ${note}`);
}

export function removeBalloon(pageId: string, balloonId: string) {
  useVizzy.getState().mutate((d) => {
    const pg = d.pages.find((x) => x.id === pageId);
    if (pg) pg.balloons = pg.balloons.filter((b) => b.id !== balloonId);
  });
}

export function setFocusPoint(pageId: string, x: number, y: number) {
  useVizzy.getState().mutate((d) => {
    const pg = d.pages.find((p) => p.id === pageId);
    if (pg) pg.focus = { x, y };
  });
}

export function movePage(from: number, to: number) {
  if (from === to) return;
  useVizzy.getState().mutate((d) => {
    const [pg] = d.pages.splice(from, 1);
    d.pages.splice(to, 0, pg);
  });
  recordEvent(`moved page ${from + 1} to position ${to + 1}`);
}
