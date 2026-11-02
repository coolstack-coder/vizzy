"use client";

import { Download, FileText, Film, Globe, Images, Loader2, Pause, Play, Repeat, SkipBack, SkipForward, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { exportHtml, exportMp4, exportPdf, exportZip } from "@/lib/export";
import { useVizzy } from "@/lib/store";
import { buildTimeline, pageCount, renderFrame, segmentAt, type Timeline } from "@/lib/timeline";
import { Btn } from "./ui";

// Cinematic player: Ken Burns toward each page's focal point, crossfades,
// balloons popping in on cue. Renders on a canvas with the same renderFrame()
// the MP4 exporter uses.

export function Player() {
  const project = useVizzy((s) => s.project!);
  const close = () => useVizzy.getState().set({ playerOpen: false });
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tl, setTl] = useState<Timeline>();
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [t, setT] = useState(0);
  const [exporting, setExporting] = useState<string>();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const time = useRef(0);

  useEffect(() => {
    let alive = true;
    void buildTimeline(project).then((x) => alive && setTl(x));
    return () => {
      alive = false;
    };
    // Build once per open; the project doesn't change while the player is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!tl || !canvas.current) return;
    const c = canvas.current;
    const ctx = c.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (playing) {
        time.current += dt;
        if (time.current >= tl.total) {
          if (loop) time.current = 0;
          else {
            time.current = tl.total - 0.001;
            setPlaying(false);
          }
        }
      }
      const W = c.clientWidth * devicePixelRatio;
      const H = c.clientHeight * devicePixelRatio;
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      renderFrame(ctx, W, H, tl, time.current);
      setT(time.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tl, playing, loop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if (e.key === "ArrowRight") jump(1);
      if (e.key === "ArrowLeft") jump(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const jump = (d: number) => {
    if (!tl) return;
    const i = Math.max(0, Math.min(tl.segments.length - 1, segmentAt(tl, time.current) + d));
    time.current = tl.starts[i] + 0.01;
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setError(undefined);
    setExporting(label);
    setProgress(0);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(undefined);
    }
  };

  const pages = tl ? pageCount(tl) : 0;
  const seg = tl ? segmentAt(tl, t) : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center gap-3 px-4 py-3 text-sm text-white/80">
        <Film size={16} className="text-accent" />
        <span className="font-title text-lg text-white">{project.brief.title || project.title}</span>
        <span className="text-white/40">{pages} pages · {tl ? Math.round(tl.total) : 0}s</span>
        <button onClick={close} className="ml-auto rounded-full p-1.5 hover:bg-white/10" aria-label="Close player">
          <X size={18} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" onClick={() => setPlaying((p) => !p)} />
        {!tl && (
          <div className="absolute inset-0 flex items-center justify-center text-white/60">
            <Loader2 className="animate-spin" />
          </div>
        )}
        {tl && pages === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">Lock or select at least one page to play the book.</div>
        )}
      </div>
      <div className="space-y-3 px-4 pb-4 pt-2">
        {tl && (
          <div className="flex gap-1">
            {tl.segments.map((s, i) => {
              const local = i < seg ? 1 : i > seg ? 0 : (t - tl.starts[i]) / s.dur;
              return (
                <button
                  key={i}
                  onClick={() => (time.current = tl.starts[i] + 0.01)}
                  className="h-1 overflow-hidden rounded-full bg-white/15"
                  style={{ flex: s.dur }}
                  aria-label={`Go to segment ${i + 1}`}
                >
                  <div className="h-full bg-accent" style={{ width: `${local * 100}%` }} />
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => jump(-1)} className="rounded-full p-2 text-white/80 hover:bg-white/10" aria-label="Previous">
            <SkipBack size={16} />
          </button>
          <button onClick={() => setPlaying((p) => !p)} className="rounded-full bg-white p-2.5 text-black" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button onClick={() => jump(1)} className="rounded-full p-2 text-white/80 hover:bg-white/10" aria-label="Next">
            <SkipForward size={16} />
          </button>
          <button onClick={() => setLoop((l) => !l)} className={`rounded-full p-2 hover:bg-white/10 ${loop ? "text-accent" : "text-white/50"}`} title="Loop">
            <Repeat size={16} />
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {exporting ? (
              <span className="flex items-center gap-2 text-xs text-white/70">
                <Loader2 size={14} className="animate-spin text-accent" /> {exporting}
                {exporting.startsWith("Encoding") && ` ${Math.round(progress * 100)}%`}
              </span>
            ) : (
              <>
                <span className="mr-1 flex items-center gap-1 text-xs text-white/40">
                  <Download size={12} /> Export
                </span>
                <Btn variant="primary" disabled={!pages} onClick={() => run("Encoding MP4…", () => exportMp4(project, setProgress))}>
                  <Film size={14} /> MP4
                </Btn>
                <Btn variant="outline" disabled={!pages} onClick={() => run("Building PDF…", () => exportPdf(project))}>
                  <FileText size={14} /> PDF
                </Btn>
                <Btn variant="outline" disabled={!pages} onClick={() => run("Zipping pages…", () => exportZip(project))}>
                  <Images size={14} /> PNGs
                </Btn>
                <Btn variant="outline" disabled={!pages} onClick={() => run("Packing player…", () => exportHtml(project))} title="A single offline HTML file that plays the book on a loop">
                  <Globe size={14} /> HTML
                </Btn>
              </>
            )}
          </div>
        </div>
        {error && <p className="text-right text-xs text-bad">{error}</p>}
      </div>
    </div>
  );
}
