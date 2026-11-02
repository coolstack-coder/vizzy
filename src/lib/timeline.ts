"use client";

import { drawKenBurns, drawLettering, letteringFont, loadBitmap } from "./render";
import { imageUrl } from "./storage";
import type { Balloon, LetteringStyle, Project } from "./types";

// A timeline turns locked pages into timed segments. The live player and the
// MP4 exporter both call renderFrame(t), so what you preview is exactly what
// you export.

export const FADE = 0.9;
const TITLE_SEC = 3.2;
const END_SEC = 2.6;

type Segment =
  | { kind: "title"; dur: number }
  | { kind: "end"; dur: number }
  | {
      kind: "page";
      dur: number;
      bmp: ImageBitmap;
      balloons: Balloon[];
      focus: { x: number; y: number };
      index: number;
    };

export interface Timeline {
  segments: Segment[];
  starts: number[];
  total: number;
  title: string;
  logline: string;
  lettering: LetteringStyle;
  accent: string;
  ink: string;
  paper: string;
}

export async function buildTimeline(p: Project, secondsPerPage?: number): Promise<Timeline> {
  const segments: Segment[] = [{ kind: "title", dur: TITLE_SEC }];
  let index = 0;
  for (const page of p.pages) {
    const opt = page.options.find((o) => o.id === (page.lockedOptionId ?? page.selectedId));
    if (!opt?.imageId) continue;
    const url = await imageUrl(opt.imageId);
    if (!url) continue;
    const dur = secondsPerPage ?? Math.max(4, Math.min(8, 3.2 + page.balloons.length * 1.1));
    segments.push({ kind: "page", dur, bmp: await loadBitmap(url), balloons: page.balloons, focus: page.focus, index: index++ });
  }
  segments.push({ kind: "end", dur: END_SEC });
  const starts: number[] = [];
  let t = 0;
  for (const s of segments) {
    starts.push(t);
    t += s.dur;
  }
  const byLum = [...p.bible.palette].sort((a, b) => lum(a.hex) - lum(b.hex));
  return {
    segments,
    starts,
    total: t,
    title: p.brief.title || p.title,
    logline: p.brief.logline,
    lettering: p.bible.lettering,
    accent: p.bible.palette.find((c) => c.role === "accent")?.hex ?? "#e8a33d",
    ink: byLum[0]?.hex ?? "#0f0e0c",
    paper: byLum[byLum.length - 1]?.hex ?? "#efe6d2",
  };
}

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

export function pageCount(tl: Timeline) {
  return tl.segments.filter((s) => s.kind === "page").length;
}

/** Which segment is on screen at time t. */
export function segmentAt(tl: Timeline, t: number) {
  let i = tl.starts.findIndex((s, k) => t >= s && t < s + tl.segments[k].dur);
  if (i < 0) i = tl.segments.length - 1;
  return i;
}

export function renderFrame(ctx: CanvasRenderingContext2D, W: number, H: number, tl: Timeline, t: number) {
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const i = segmentAt(tl, t);
  const local = t - tl.starts[i];
  const seg = tl.segments[i];
  drawSegment(ctx, W, H, tl, seg, local, 1);
  // Crossfade into the next segment during the last FADE seconds.
  const next = tl.segments[i + 1];
  if (next && local > seg.dur - FADE) {
    const a = (local - (seg.dur - FADE)) / FADE;
    drawSegment(ctx, W, H, tl, next, 0, easeInOut(a));
  }
}

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function drawSegment(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tl: Timeline,
  seg: Segment,
  local: number,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (seg.kind === "page") {
    // Letterbox the page into the frame, with a blurred copy behind it.
    const pr = seg.bmp.width / seg.bmp.height;
    const fr = W / H;
    ctx.filter = "blur(28px) brightness(0.45)";
    drawKenBurns(ctx, seg.bmp, W, H, 0, seg.focus);
    ctx.filter = "none";
    const pw = pr > fr ? W : H * pr;
    const ph = pr > fr ? W / pr : H;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    ctx.translate(px, py);
    const progress = Math.min(1, local / seg.dur);
    drawKenBurns(ctx, seg.bmp, pw, ph, progress, seg.focus, seg.index % 2 ? -1 : 1);
    drawLettering(ctx, seg.balloons, pw, ph, tl.lettering, (k) => (local - (0.7 + k * 0.9)) / 0.45);
    ctx.restore();
  } else {
    ctx.fillStyle = tl.ink;
    ctx.fillRect(0, 0, W, H);
    const u = Math.min(W, H);
    const reveal = Math.min(1, local / 1.2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = tl.paper;
    if (seg.kind === "title") {
      ctx.globalAlpha = alpha * reveal;
      ctx.font = `600 ${u * 0.09}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-display") || "serif"}`;
      ctx.fillText(tl.title, W / 2, H * 0.44, W * 0.86);
      ctx.fillStyle = tl.accent;
      ctx.fillRect(W / 2 - u * 0.06 * reveal, H * 0.52, u * 0.12 * reveal, Math.max(2, u * 0.004));
      ctx.fillStyle = tl.paper;
      ctx.globalAlpha = alpha * Math.max(0, Math.min(1, (local - 0.6) / 1));
      ctx.font = `${u * 0.03}px ${letteringFont(tl.lettering)}`;
      wrapCentered(ctx, tl.logline, W / 2, H * 0.6, W * 0.7, u * 0.042);
    } else {
      ctx.globalAlpha = alpha * reveal;
      ctx.font = `600 ${u * 0.05}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-display") || "serif"}`;
      ctx.fillText("The End", W / 2, H * 0.46);
      ctx.globalAlpha = alpha * reveal * 0.6;
      ctx.font = `${u * 0.024}px system-ui, sans-serif`;
      ctx.fillText("made with Vizzy", W / 2, H * 0.56);
    }
  }
  ctx.restore();
}

function wrapCentered(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}
