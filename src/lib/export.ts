"use client";

import { aspectSize } from "./defaults";
import { drawLettering, loadBitmap } from "./render";
import { imageUrl } from "./storage";
import { buildTimeline, renderFrame } from "./timeline";
import type { Project } from "./types";

// Exports: MP4 (WebCodecs via mediabunny), PDF (jsPDF), PNG zip (JSZip) and a
// self-contained HTML player. Everything runs in the browser; nothing uploads.

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "vizzy";

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Final pages as lettered canvases at full resolution. */
export async function letteredPages(p: Project) {
  const out: HTMLCanvasElement[] = [];
  for (const page of p.pages) {
    const opt = page.options.find((o) => o.id === (page.lockedOptionId ?? page.selectedId));
    if (!opt?.imageId) continue;
    const url = await imageUrl(opt.imageId);
    if (!url) continue;
    const bmp = await loadBitmap(url);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    drawLettering(ctx, page.balloons, bmp.width, bmp.height, p.bible.lettering);
    out.push(canvas);
  }
  return out;
}

export async function exportMp4(p: Project, onProgress: (f: number) => void) {
  const { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH, getFirstEncodableVideoCodec } =
    await import("mediabunny");
  const W = 1280;
  const H = 720;
  const FPS = 30;
  const tl = await buildTimeline(p);

  let format: InstanceType<typeof Mp4OutputFormat> | InstanceType<typeof WebMOutputFormat> = new Mp4OutputFormat({ fastStart: "in-memory" });
  let codec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width: W, height: H });
  if (!codec) {
    format = new WebMOutputFormat();
    codec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width: W, height: H });
  }
  if (!codec) throw new Error("This browser can't encode video. Try Chrome, Edge or Safari 17+.");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const output = new Output({ format, target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();

  const frames = Math.ceil(tl.total * FPS);
  for (let f = 0; f < frames; f++) {
    renderFrame(ctx, W, H, tl, f / FPS);
    await source.add(f / FPS, 1 / FPS);
    if (f % 15 === 0) onProgress(f / frames);
  }
  await output.finalize();
  onProgress(1);
  const ext = format instanceof Mp4OutputFormat ? "mp4" : "webm";
  download(new Blob([output.target.buffer!], { type: `video/${ext}` }), `${slug(p.title)}.${ext}`);
}

export async function exportPdf(p: Project) {
  const { jsPDF } = await import("jspdf");
  const pages = await letteredPages(p);
  if (!pages.length) throw new Error("Lock at least one page first.");
  const { w, h } = aspectSize(p.bible.aspect, 1000);
  const doc = new jsPDF({ orientation: w > h ? "landscape" : "portrait", unit: "pt", format: [w, h] });
  // Title page
  doc.setFillColor(15, 14, 12);
  doc.rect(0, 0, w, h, "F");
  doc.setTextColor(239, 230, 210);
  doc.setFontSize(Math.min(w, h) * 0.07);
  doc.text(p.brief.title || p.title, w / 2, h * 0.45, { align: "center", maxWidth: w * 0.85 });
  doc.setFontSize(Math.min(w, h) * 0.024);
  doc.text(p.brief.logline || "", w / 2, h * 0.55, { align: "center", maxWidth: w * 0.7 });
  for (const c of pages) {
    doc.addPage([w, h], w > h ? "landscape" : "portrait");
    doc.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, w, h);
  }
  doc.save(`${slug(p.title)}.pdf`);
}

export async function exportZip(p: Project) {
  const JSZip = (await import("jszip")).default;
  const pages = await letteredPages(p);
  if (!pages.length) throw new Error("Lock at least one page first.");
  const zip = new JSZip();
  await Promise.all(
    pages.map(
      (c, i) =>
        new Promise<void>((res) =>
          c.toBlob((b) => {
            zip.file(`${String(i + 1).padStart(2, "0")}.png`, b!);
            res();
          }, "image/png"),
        ),
    ),
  );
  zip.file(
    "project.json",
    JSON.stringify({ title: p.title, brief: p.brief, bible: p.bible, characters: p.characters, pages: p.pages.map(({ options, ...rest }) => ({ ...rest, options: options.map(({ prompt, label, model }) => ({ label, model, prompt })) })) }, null, 2),
  );
  download(await zip.generateAsync({ type: "blob" }), `${slug(p.title)}-pages.zip`);
}

/** A single offline HTML file: auto-playing, looping Ken Burns slideshow. */
export async function exportHtml(p: Project) {
  const pages = await letteredPages(p);
  if (!pages.length) throw new Error("Lock at least one page first.");
  const imgs = pages.map((c) => c.toDataURL("image/jpeg", 0.86));
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.brief.title || p.title)}</title><style>
html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:Georgia,serif}
.s{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 1.1s ease}
.s.on{opacity:1}.s img{max-width:100%;max-height:100%;animation:kb 7s ease-out both}
.s:nth-child(odd) img{animation-name:kb2}
@keyframes kb{from{transform:scale(1)}to{transform:scale(1.08)}}@keyframes kb2{from{transform:scale(1.08)}to{transform:scale(1)}}
.t{color:#efe6d2;text-align:center;padding:8vmin}.t h1{font-size:8vmin;margin:0 0 2vmin}.t p{font-size:2.6vmin;opacity:.8}
.c{position:fixed;bottom:2vmin;right:2vmin;color:#fff8;font:12px system-ui}
</style></head><body>
<div class="s on"><div class="t"><h1>${esc(p.brief.title || p.title)}</h1><p>${esc(p.brief.logline)}</p></div></div>
${imgs.map((src) => `<div class="s"><img src="${src}" alt=""></div>`).join("\n")}
<div class="c">made with Vizzy · click to pause</div>
<script>
const s=[...document.querySelectorAll('.s')];let i=0,paused=false;
setInterval(()=>{if(paused)return;s[i].classList.remove('on');i=(i+1)%s.length;const img=s[i].querySelector('img');
if(img){img.style.animation='none';img.offsetHeight;img.style.animation=''}s[i].classList.add('on')},6000);
document.body.onclick=()=>paused=!paused;
</script></body></html>`;
  download(new Blob([html], { type: "text/html" }), `${slug(p.title)}.html`);
}
