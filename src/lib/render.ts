"use client";

import type { Balloon, LetteringStyle } from "./types";

// Canvas rendering shared by the player, MP4 export, PDF export and PNG export,
// so every output letters pages identically.

export function letteringFont(style: LetteringStyle) {
  const css = getComputedStyle(document.documentElement);
  const v =
    style === "serif" ? "--font-serif-lettering" : style === "typewriter" ? "--font-typewriter" : "--font-comic";
  return css.getPropertyValue(v).trim() || "sans-serif";
}

export function sfxFont() {
  return getComputedStyle(document.documentElement).getPropertyValue("--font-sfx").trim() || "Impact, sans-serif";
}

/** Draw an image cover-fitted into (W,H), zoomed toward a focal point. */
export function drawKenBurns(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  W: number,
  H: number,
  progress: number,
  focus: { x: number; y: number },
  direction: 1 | -1 = 1,
) {
  const zoom = direction === 1 ? 1 + 0.1 * progress : 1.1 - 0.1 * progress;
  const base = Math.max(W / img.width, H / img.height) * zoom;
  const w = img.width * base;
  const h = img.height * base;
  // Drift the frame so the focal point moves toward the centre as we push in.
  const fx = (focus.x - 0.5) * (w - W);
  const fy = (focus.y - 0.5) * (h - H);
  const x = (W - w) / 2 - fx * progress;
  const y = (H - h) / 2 - fy * progress;
  ctx.drawImage(img, x, y, w, h);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Draw lettering in page space. `reveal` (0..1 per balloon index) lets the
 * player pop balloons in one after another; captions type on.
 */
export function drawLettering(
  ctx: CanvasRenderingContext2D,
  balloons: Balloon[],
  W: number,
  H: number,
  style: LetteringStyle,
  reveal: (i: number) => number = () => 1,
) {
  const font = letteringFont(style);
  const unit = Math.min(W, H);
  balloons.forEach((b, i) => {
    const a = Math.max(0, Math.min(1, reveal(i)));
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    const x = b.x * W;
    const y = b.y * H;
    const w = b.w * W;

    if (b.kind === "sfx") {
      const size = unit * 0.085;
      ctx.font = `${size}px ${sfxFont()}`;
      ctx.translate(x + w / 2, y + size);
      ctx.rotate(-0.08);
      ctx.scale(0.8 + 0.2 * a, 0.8 + 0.2 * a);
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = "#111";
      ctx.strokeText(b.text, 0, 0, w * 1.4);
      ctx.fillStyle = "#ffd447";
      ctx.fillText(b.text, 0, 0, w * 1.4);
      ctx.restore();
      return;
    }

    const size = unit * (b.kind === "caption" ? 0.03 : 0.032);
    ctx.font = `${b.kind === "caption" ? "" : "600 "}${size}px ${font}`;
    const text = b.kind === "caption" ? b.text.slice(0, Math.ceil(b.text.length * a)) : b.text;
    const pad = size * 0.7;
    const lines = wrap(ctx, b.kind === "caption" ? b.text : text, w - pad * 2);
    const lh = size * 1.25;
    const h = lines.length * lh + pad * 1.6;
    const shownLines = b.kind === "caption" ? wrap(ctx, text, w - pad * 2) : lines;

    ctx.lineWidth = Math.max(2, unit * 0.004);
    ctx.strokeStyle = "#141210";
    if (b.kind === "caption") {
      ctx.fillStyle = "#f3e9cf";
      ctx.shadowColor = "rgba(0,0,0,.35)";
      ctx.shadowBlur = unit * 0.01;
      ctx.fillRect(x, y, w, h);
      ctx.shadowBlur = 0;
      ctx.strokeRect(x, y, w, h);
    } else {
      // Tail first so the balloon body covers its root.
      if (b.tail) {
        const tx = b.tail.x * W;
        const ty = b.tail.y * H;
        const cx = x + w / 2;
        const cy = y + h / 2;
        if (b.kind === "thought") {
          ctx.fillStyle = "#fff";
          for (let k = 1; k <= 3; k++) {
            const t = k / 4;
            ctx.beginPath();
            ctx.arc(cx + (tx - cx) * t, cy + h / 2 + (ty - cy - h / 2) * t, unit * (0.016 - k * 0.003), 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        } else {
          const spread = w * 0.08;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.moveTo(cx - spread, cy);
          ctx.lineTo(tx, ty);
          ctx.lineTo(cx + spread, cy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      if (b.kind === "thought") ctx.ellipse(x + w / 2, y + h / 2, w / 2 + pad * 0.4, h / 2 + pad * 0.4, 0, 0, Math.PI * 2);
      else ctx.roundRect(x, y, w, h, Math.min(h / 2, unit * 0.05));
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = "#141210";
    ctx.textBaseline = "top";
    ctx.textAlign = b.kind === "caption" ? "left" : "center";
    shownLines.forEach((ln, k) => {
      const tx = b.kind === "caption" ? x + pad : x + w / 2;
      ctx.fillText(ln, tx, y + pad * 0.8 + k * lh);
    });
    ctx.restore();
  });
}

/** Load a blob/object URL into an ImageBitmap for canvas work. */
export async function loadBitmap(url: string) {
  const blob = await (await fetch(url)).blob();
  return createImageBitmap(blob);
}
