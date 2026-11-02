"use client";

import { useEffect, useState } from "react";
import { cachedImageUrl, imageUrl } from "@/lib/storage";
import { ASPECT_RATIO } from "@/lib/defaults";
import type { Aspect, Balloon, LetteringStyle } from "@/lib/types";

export function useImageUrl(id?: string) {
  const [url, setUrl] = useState(() => cachedImageUrl(id));
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(undefined);
      return;
    }
    imageUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

export function Btn({
  children,
  onClick,
  variant = "ghost",
  disabled,
  title,
  className = "",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "outline" | "danger";
  disabled?: boolean;
  title?: string;
  className?: string;
  type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-accent text-accent-ink hover:brightness-110 font-semibold",
    ghost: "text-muted hover:text-ink hover:bg-panel-2",
    outline: "border border-line-strong text-ink hover:border-accent hover:text-accent",
    danger: "text-bad hover:bg-bad/10",
  }[variant];
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition disabled:pointer-events-none disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Swatches({ colors, size = 18 }: { colors: { hex: string; name?: string }[]; size?: number }) {
  return (
    <div className="flex">
      {colors.map((c, i) => (
        <span
          key={i}
          title={c.name ? `${c.name} ${c.hex}` : c.hex}
          className="rounded-full ring-2 ring-panel"
          style={{ width: size, height: size, background: c.hex, marginLeft: i ? -size / 4 : 0 }}
        />
      ))}
    </div>
  );
}

export const LETTERING_CLASS: Record<LetteringStyle, string> = {
  comic: "font-lt-comic font-bold",
  serif: "font-lt-serif",
  typewriter: "font-lt-type",
};

/** A page image with HTML lettering on top. Used for thumbnails and the canvas. */
export function PageImage({
  imageId,
  aspect,
  balloons = [],
  lettering = "comic",
  className = "",
  scale = 1,
  children,
}: {
  imageId?: string;
  aspect: Aspect;
  balloons?: Balloon[];
  lettering?: LetteringStyle;
  className?: string;
  /** Font scale relative to a ~600px tall page. */
  scale?: number;
  children?: React.ReactNode;
}) {
  const url = useImageUrl(imageId);
  return (
    <div
      className={`relative overflow-hidden bg-panel-2 ${className}`}
      style={{ aspectRatio: ASPECT_RATIO[aspect], containerType: "size" }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="shimmer absolute inset-0" />
      )}
      <Tails balloons={balloons} />
      {balloons.map((b) => (
        <BalloonView key={b.id} b={b} lettering={lettering} scale={scale} />
      ))}
      {children}
    </div>
  );
}

/** Speech and thought tails, drawn under the balloons (which cover their roots). */
export function Tails({ balloons }: { balloons: Balloon[] }) {
  const talk = balloons.filter((b) => b.tail && (b.kind === "speech" || b.kind === "thought"));
  if (!talk.length) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      {talk.map((b) => {
        const cx = (b.x + b.w / 2) * 100;
        const cy = b.y * 100 + 4;
        const tx = b.tail!.x * 100;
        const ty = b.tail!.y * 100;
        if (b.kind === "thought")
          return (
            <g key={b.id}>
              {[0.35, 0.6, 0.82].map((t, k) => (
                <ellipse key={k} cx={cx + (tx - cx) * t} cy={cy + 4 + (ty - cy - 4) * t} rx={1.6 - k * 0.4} ry={1.1 - k * 0.27} fill="#fff" stroke="#141210" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          );
        const spread = b.w * 100 * 0.08;
        return <polygon key={b.id} points={`${cx - spread},${cy} ${tx},${ty} ${cx + spread},${cy}`} fill="#fff" stroke="#141210" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

export function BalloonView({
  b,
  lettering,
  scale = 1,
  editable,
  onChange,
  onDragStart,
}: {
  b: Balloon;
  lettering: LetteringStyle;
  scale?: number;
  editable?: boolean;
  onChange?: (text: string) => void;
  onDragStart?: (e: React.PointerEvent) => void;
}) {
  const base = {
    left: `${b.x * 100}%`,
    top: `${b.y * 100}%`,
    width: `${b.w * 100}%`,
  } as const;
  const fontSize = `calc(min(100cqw, 100cqh) * ${(b.kind === "caption" ? 0.03 : 0.032) * scale})`;
  if (b.kind === "sfx")
    return (
      <div
        className="absolute select-none text-center font-boom leading-none tracking-wide text-[#ffd447]"
        style={{ ...base, fontSize: `calc(min(100cqw, 100cqh) * ${0.085 * scale})`, transform: "rotate(-4.5deg)", WebkitTextStroke: "0.06em #111", paintOrder: "stroke fill" }}
        onPointerDown={onDragStart}
      >
        {editable ? <Editable text={b.text} onChange={onChange} /> : b.text}
      </div>
    );
  const shape =
    b.kind === "caption"
      ? "rounded-none bg-[#f3e9cf] text-left shadow-[0_2px_10px_rgba(0,0,0,.35)]"
      : b.kind === "thought"
        ? "rounded-[50%] bg-white text-center px-[1.2em] py-[1em]"
        : "rounded-[1.4em] bg-white text-center";
  return (
    <div
      className={`absolute border-[max(1.5px,0.12em)] border-[#141210] px-[0.7em] py-[0.55em] leading-[1.25] text-[#141210] ${shape} ${LETTERING_CLASS[lettering]} ${editable ? "cursor-move" : ""}`}
      style={{ ...base, fontSize }}
      onPointerDown={onDragStart}
    >
      {editable ? <Editable text={b.text} onChange={onChange} /> : b.text}
    </div>
  );
}

function Editable({ text, onChange }: { text: string; onChange?: (t: string) => void }) {
  return (
    <span
      contentEditable
      suppressContentEditableWarning
      className="cursor-text outline-none focus:bg-accent/10"
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const t = e.currentTarget.textContent ?? "";
        if (t !== text) onChange?.(t);
      }}
    >
      {text}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line-strong bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>
  );
}

export function formatMs(ms?: number) {
  if (!ms) return "";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}
