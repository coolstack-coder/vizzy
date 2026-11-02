import type { Brief, Page, Project, StyleBible } from "./types";

export const uid = (prefix = "") =>
  prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const DEFAULT_BRIEF: Brief = {
  title: "Untitled story",
  logline: "",
  format: "graphic-novel",
  pageCount: 6,
  tone: "",
  audience: "",
  notes: "",
};

export const DEFAULT_BIBLE: StyleBible = {
  version: 0,
  locked: false,
  name: "",
  medium: "",
  palette: [],
  lighting: "",
  texture: "",
  moodWords: [],
  aspect: "2:3",
  negative: [],
  lettering: "comic",
};

export function newProject(title = "Untitled story"): Project {
  const now = Date.now();
  return {
    id: uid("p_"),
    title,
    createdAt: now,
    updatedAt: now,
    phase: "brief",
    brief: { ...DEFAULT_BRIEF, title },
    bible: { ...DEFAULT_BIBLE },
    characters: [],
    locations: [],
    pages: [],
    usage: { inputTokens: 0, outputTokens: 0, images: 0, costUsd: 0 },
    chat: [],
    transcript: [],
    pendingEvents: [],
  };
}

export function newPage(partial: Partial<Page> & { beat: string }): Page {
  return {
    id: uid("pg_"),
    title: "",
    shot: { type: "medium shot", angle: "eye level" },
    characterIds: [],
    negativeSpace: "upper third",
    balloons: [],
    status: "draft",
    options: [],
    focus: { x: 0.5, y: 0.45 },
    durationSec: 5,
    ...partial,
  };
}

export const ASPECT_RATIO: Record<StyleBible["aspect"], number> = {
  "2:3": 2 / 3,
  "3:4": 3 / 4,
  "1:1": 1,
  "16:9": 16 / 9,
};

/** Pixel size used for offline renders and video export per aspect. */
export function aspectSize(aspect: StyleBible["aspect"], long = 1280) {
  const r = ASPECT_RATIO[aspect];
  return r >= 1
    ? { w: long, h: Math.round(long / r) }
    : { w: Math.round(long * r), h: long };
}
