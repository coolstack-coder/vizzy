// Offline "Sketch" image provider. It turns a compiled prompt into a seeded,
// palette-true SVG composition (sky, horizon, set pieces, silhouetted cast,
// halftone, grain, vignette) so the whole Vizzy flow runs with zero API keys.
// It reads the same prompt the real models receive, so changing the style
// bible or the beat visibly changes the sketch.

export interface SketchInput {
  prompt: string;
  palette: string[]; // dominant, accent, shadow, highlight (any order tolerated)
  width: number;
  height: number;
  seed: string;
  figures: number;
}

type Rng = () => number;

function hash(s: string) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(a: number): Rng {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Prefix match on word boundaries: "tree" matches "trees" but not "street".
const has = (text: string, words: string[]) =>
  words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text));

function mix(a: string, b: string, t: number) {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function parseHex(h: string) {
  const s = h.replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
}

function luminance(h: string) {
  const [r, g, b] = parseHex(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Only the camera/action/setting lines drive composition; style and cast
// descriptors ("freckled face") would otherwise trigger the wrong shot.
const IGNORED = /^\[(FORMAT|STYLE|PALETTE|MOOD|CAST|NEVER|COMPOSITION|CONTINUITY|LAYOUT|SUBJECT)\]/;
function sceneText(prompt: string) {
  return prompt
    .split("\n")
    .filter((l) => !IGNORED.test(l.trim()))
    .join(" ")
    .toLowerCase();
}

export function renderSketchSvg(input: SketchInput): string {
  const { width: W, height: H } = input;
  // Seeded by the option id only, so a refinement (same seed, extra
  // instruction) keeps its parent's layout and only adds what was asked for.
  const rnd = mulberry32(hash(input.seed));
  const r = (a: number, b: number) => a + (b - a) * rnd();
  const text = sceneText(input.prompt);

  const pal = input.palette.length >= 2 ? input.palette : ["#c9b79c", "#b5452b", "#2b2622", "#efe6d2"];
  const byLum = [...pal].sort((a, b) => luminance(a) - luminance(b));
  const ink = byLum[0];
  const light = byLum[byLum.length - 1];
  const sky = pal[0];
  const accent = pal[1] ?? mix(sky, ink, 0.4);

  const night = has(text, ["night", "dark", "moon", "midnight", "star"]);
  const sea = has(text, ["beach", "sea", "ocean", "shore", "wave", "water", "underwater", "surf", "channel", "coast"]);
  const city = has(text, ["city", "street", "town", "village", "building", "rooftop", "ruin"]);
  const forest = has(text, ["forest", "tree", "hedgerow", "woods", "orchard", "jungle", "field"]);
  const interior = has(text, ["interior", "room", "bunker", "tent", "kitchen", "cabin", "office", "inside", "cockpit"]);
  const fire = has(text, ["fire", "explosion", "smoke", "burning", "flare", "shell", "blast", "battle"]);
  const boats = has(text, ["boat", "ship", "landing craft", "vessel", "higgins", "fleet"]);
  const planes = has(text, ["plane", "aircraft", "paratrooper", "bomber", "flight", "parachute", "c-47"]);
  const rain = has(text, ["rain", "storm", "drizzle", "spray"]);
  const helmets = has(text, ["soldier", "helmet", "trooper", "infantry", "ranger", "gi ", "army", "private", "sergeant"]);
  const crowd = has(text, ["soldiers", "troops", "crowd", "men ", "squad", "platoon", "army"]);
  // A take's own [VARIATION] beats the page's planned [SHOT].
  const variation = /\[variation\]([^\n]*)/i.exec(input.prompt)?.[1]?.toLowerCase() ?? "";
  const CLOSE = ["close-up", "close up", "closeup", "portrait", "extreme close", "face"];
  const WIDE = ["wide", "establishing", "aerial", "panorama", "bird's-eye", "long shot", "high angle"];
  const shotText = has(variation, [...CLOSE, ...WIDE, "medium", "over-the-shoulder", "silhouette"]) ? variation : text;
  const close = has(shotText, CLOSE) && !has(shotText, ["wide", "establishing"]);
  const wide = has(shotText, WIDE);
  const low = has(shotText, ["low angle", "worm"]);
  const high = has(shotText, ["high angle", "overhead", "bird's-eye", "aerial"]);

  let horizon = H * (high ? r(0.18, 0.3) : low ? r(0.62, 0.74) : r(0.42, 0.56));
  if (close) horizon = H * r(0.55, 0.7);

  const skyTop = night ? mix(ink, sky, 0.25) : mix(sky, light, 0.15);
  const skyBottom = night ? mix(sky, ink, 0.5) : mix(sky, accent, fire ? 0.45 : 0.15);
  const ground = mix(ink, sky, interior ? 0.35 : 0.2);

  const parts: string[] = [];
  const defs: string[] = [];

  defs.push(`
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${skyTop}"/>
      <stop offset="1" stop-color="${skyBottom}"/>
    </linearGradient>
    <radialGradient id="vig" cx="0.5" cy="0.48" r="0.75">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${mix(accent, light, 0.4)}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(${Math.round(r(10, 40))})">
      <circle cx="3.5" cy="3.5" r="1.25" fill="${ink}"/>
    </pattern>
    <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(${Math.round(r(30, 60))})">
      <line x1="0" y1="0" x2="0" y2="6" stroke="${ink}" stroke-width="1.4"/>
    </pattern>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${Math.floor(r(1, 999))}"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0"/>
    </filter>
    <filter id="rough"><feTurbulence baseFrequency="0.02" numOctaves="2" seed="${Math.floor(r(1, 999))}"/><feDisplacementMap in="SourceGraphic" scale="6"/></filter>
    <filter id="blur"><feGaussianBlur stdDeviation="${(W / 90).toFixed(1)}"/></filter>
  `);

  // Sky / back wall
  if (interior) {
    parts.push(`<rect width="${W}" height="${H}" fill="${mix(ink, sky, 0.45)}"/>`);
    const wx = r(0.15, 0.6) * W;
    const ww = r(0.18, 0.3) * W;
    const wy = H * r(0.12, 0.25);
    const wh = H * r(0.25, 0.35);
    parts.push(`<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" fill="url(#sky)"/>`);
    parts.push(`<path d="M${wx + ww / 2} ${wy}V${wy + wh}M${wx} ${wy + wh / 2}H${wx + ww}" stroke="${ink}" stroke-width="${W / 120}"/>`);
    // light shaft
    parts.push(`<path d="M${wx} ${wy + wh} L${wx + ww} ${wy + wh} L${wx + ww * 2.2} ${H} L${wx - ww * 0.6} ${H}Z" fill="${light}" opacity="0.12"/>`);
    parts.push(`<rect y="${horizon}" width="${W}" height="${H - horizon}" fill="${ground}"/>`);
    parts.push(`<rect y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#hatch)" opacity="0.18"/>`);
  } else {
    parts.push(`<rect width="${W}" height="${H}" fill="url(#sky)"/>`);
    if (night) {
      for (let i = 0; i < 70; i++)
        parts.push(`<circle cx="${r(0, W)}" cy="${r(0, horizon * 0.9)}" r="${r(0.6, 1.8)}" fill="${light}" opacity="${r(0.3, 0.9).toFixed(2)}"/>`);
      parts.push(`<circle cx="${r(0.15, 0.85) * W}" cy="${r(0.1, 0.25) * H}" r="${W * 0.05}" fill="${light}" opacity="0.9"/>`);
    } else {
      const sx = r(0.15, 0.85) * W;
      const sy = horizon - r(0.12, 0.3) * H;
      parts.push(`<circle cx="${sx}" cy="${sy}" r="${W * 0.22}" fill="url(#glow)" opacity="0.7"/>`);
      parts.push(`<circle cx="${sx}" cy="${sy}" r="${W * 0.045}" fill="${mix(light, accent, 0.25)}" opacity="0.85"/>`);
    }
    // cloud banks
    for (let i = 0; i < 5; i++) {
      const cy = r(0.06, 0.8) * horizon;
      const cx = r(-0.1, 1) * W;
      const cw = r(0.3, 0.7) * W;
      parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${cw / 2}" ry="${r(8, 26)}" fill="${night ? mix(ink, sky, 0.4) : light}" opacity="${r(0.18, 0.4).toFixed(2)}" filter="url(#blur)"/>`);
    }
  }

  // Distant set pieces
  if (city && !interior) {
    let x = -10;
    const base = horizon + 4;
    let d = `M-10 ${base}`;
    while (x < W + 20) {
      const bw = r(0.04, 0.11) * W;
      const bh = r(0.05, 0.22) * H;
      const ruined = has(text, ["ruin", "bomb", "battle", "war"]) && rnd() < 0.5;
      d += ` L${x} ${base - bh}`;
      if (ruined) d += ` L${x + bw * 0.4} ${base - bh * 0.7} L${x + bw * 0.6} ${base - bh * 1.05}`;
      d += ` L${x + bw} ${base - bh} L${x + bw} ${base}`;
      x += bw + r(0, 6);
    }
    d += ` L${W + 20} ${base} Z`;
    parts.push(`<path d="${d}" fill="${mix(ink, sky, 0.55)}" opacity="0.85"/>`);
  }

  if (!interior) {
    // ground or sea
    if (sea) {
      parts.push(`<rect y="${horizon}" width="${W}" height="${H - horizon}" fill="${mix(sky, ink, 0.45)}"/>`);
      for (let i = 0; i < 26; i++) {
        const y = horizon + Math.pow(rnd(), 1.6) * (H - horizon);
        const x = r(-0.2, 1) * W;
        const len = r(0.05, 0.3) * W * (0.3 + (y - horizon) / (H - horizon));
        parts.push(`<path d="M${x} ${y} q${len / 2} ${-r(2, 6)} ${len} 0" stroke="${light}" stroke-width="${r(1, 2.6)}" fill="none" opacity="${r(0.25, 0.6).toFixed(2)}"/>`);
      }
      // beach wedge in the foreground
      const by = H * r(0.72, 0.86);
      parts.push(`<path d="M0 ${by} Q${W * 0.5} ${by - r(10, 50)} ${W} ${by + r(-20, 30)} L${W} ${H} L0 ${H}Z" fill="${mix(sky, light, 0.2)}"/>`);
      parts.push(`<path d="M0 ${by} Q${W * 0.5} ${by - r(10, 50)} ${W} ${by + r(-20, 30)} L${W} ${H} L0 ${H}Z" fill="url(#dots)" opacity="0.18"/>`);
      if (has(text, ["obstacle", "hedgehog", "beach", "omaha", "d-day"])) {
        for (let i = 0; i < 6; i++) {
          const ox = r(0.05, 0.95) * W;
          const oy = horizon + r(0.15, 0.5) * (H - horizon);
          const s = r(10, 24) * (1 + (oy - horizon) / H);
          parts.push(`<path d="M${ox - s} ${oy} L${ox + s} ${oy - s * 1.2} M${ox + s} ${oy} L${ox - s} ${oy - s * 1.2} M${ox} ${oy} L${ox} ${oy - s * 1.4}" stroke="${ink}" stroke-width="${s / 5}" stroke-linecap="round"/>`);
        }
      }
    } else {
      // rolling ground
      const hill = `M0 ${horizon} C${W * 0.3} ${horizon - r(10, 50)} ${W * 0.6} ${horizon + r(-30, 30)} ${W} ${horizon - r(0, 40)} L${W} ${H} L0 ${H}Z`;
      parts.push(`<path d="${hill}" fill="${ground}"/>`);
      parts.push(`<path d="${hill}" fill="url(#hatch)" opacity="0.15"/>`);
    }

    if (forest) {
      for (let i = 0; i < 14; i++) {
        const tx = r(-0.05, 1.05) * W;
        const th = r(0.12, 0.35) * H;
        const ty = horizon + r(-5, 20);
        parts.push(`<path d="M${tx} ${ty - th} L${tx + th * 0.28} ${ty} L${tx - th * 0.28} ${ty} Z" fill="${mix(ink, sky, r(0.1, 0.35))}"/>`);
      }
    }
  }

  if (boats) {
    const n = Math.round(r(2, 6));
    for (let i = 0; i < n; i++) {
      const bx = r(0.05, 0.9) * W;
      const by = horizon + r(0.02, 0.3) * (H - horizon);
      const s = r(0.06, 0.14) * W * (0.5 + (by - horizon) / (H - horizon));
      parts.push(`<path d="M${bx} ${by} l${s} 0 l${-s * 0.12} ${s * 0.32} l${-s * 0.76} 0 Z M${bx + s * 0.1} ${by} l0 ${-s * 0.28} l${s * 0.75} 0 l0 ${s * 0.28}" fill="${ink}" opacity="0.92"/>`);
      parts.push(`<path d="M${bx - s * 0.3} ${by + s * 0.3} q${s * 0.6} ${-s * 0.1} ${s * 1.6} 0" stroke="${light}" stroke-width="2" fill="none" opacity="0.5"/>`);
    }
  }

  if (planes) {
    const n = Math.round(r(2, 7));
    for (let i = 0; i < n; i++) {
      const px = r(0.05, 0.95) * W;
      const py = r(0.06, 0.4) * horizon;
      const s = r(0.03, 0.07) * W;
      parts.push(`<path d="M${px - s} ${py} L${px + s} ${py} M${px} ${py - s * 0.15} L${px} ${py + s * 0.15} M${px - s * 0.25} ${py} l${-s * 0.35} ${-s * 0.6} M${px - s * 0.25} ${py} l${-s * 0.35} ${s * 0.6}" stroke="${ink}" stroke-width="${s / 6}" stroke-linecap="round" transform="rotate(${r(-12, 12)} ${px} ${py})"/>`);
      if (has(text, ["parachute", "paratrooper"]))
        parts.push(`<path d="M${px + r(-60, 60)} ${py + 60} a14 10 0 0 1 28 0 l-14 22z" fill="${light}" opacity="0.8"/>`);
    }
  }

  if (fire) {
    const n = Math.round(r(2, 4));
    for (let i = 0; i < n; i++) {
      const fx = r(0.05, 0.95) * W;
      const fy = horizon + r(-10, 30);
      parts.push(`<circle cx="${fx}" cy="${fy}" r="${r(0.08, 0.18) * W}" fill="url(#glow)"/>`);
      let d = "";
      let y = fy;
      let x = fx;
      for (let k = 0; k < 6; k++) {
        const rr = r(0.03, 0.08) * W * (1 + k * 0.35);
        d += `<circle cx="${x}" cy="${y}" r="${rr}" fill="${mix(ink, sky, 0.3 + k * 0.08)}" opacity="${(0.55 - k * 0.06).toFixed(2)}"/>`;
        y -= rr * 1.1;
        x += r(-0.03, 0.06) * W;
      }
      parts.push(`<g filter="url(#blur)">${d}</g>`);
    }
  }

  // Cast silhouettes
  const figureCount = close ? 1 : crowd ? Math.round(r(5, 9)) : Math.max(1, Math.min(input.figures || Math.round(r(1, 3)), 4));
  const figures: { gy: number; svg: string }[] = [];
  if (close) {
    const cx = r(0.38, 0.62) * W;
    const scale = Math.min(W * 0.0016, H * 0.0021) * (low ? 1.12 : 1);
    figures.push({ gy: H, svg: bust(cx, H, scale, ink, helmets, accent) });
  } else {
    for (let i = 0; i < figureCount; i++) {
      const depth = crowd ? rnd() : i / Math.max(1, figureCount);
      const gy = horizon + (H - horizon) * (0.25 + depth * 0.6);
      const scale = (H / 900) * (wide ? 0.35 : 0.75) * (0.55 + depth * 0.9) * (low ? 1.25 : 1);
      const fx = crowd ? r(0.05, 0.95) * W : W * ((i + 1) / (figureCount + 1)) + r(-40, 40);
      figures.push({ gy, svg: figure(fx, gy, scale, ink, helmets, rnd) });
    }
    figures.sort((a, b) => a.gy - b.gy); // paint far figures first
  }
  parts.push(`<g filter="url(#rough)">${figures.map((f) => f.svg).join("")}</g>`);

  if (rain) {
    for (let i = 0; i < 160; i++) {
      const x = r(0, W);
      const y = r(0, H);
      parts.push(`<line x1="${x}" y1="${y}" x2="${x - 6}" y2="${y + 22}" stroke="${light}" stroke-width="1" opacity="0.35"/>`);
    }
  }

  // Finishing passes: halftone in the shadows, grain, vignette, ink frame.
  parts.push(`<rect width="${W}" height="${H}" fill="url(#dots)" opacity="0.07"/>`);
  parts.push(`<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.35"/>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#vig)"/>`);
  parts.push(`<rect x="${W * 0.012}" y="${W * 0.012}" width="${W * 0.976}" height="${H - W * 0.024}" fill="none" stroke="${ink}" stroke-width="${W * 0.008}" filter="url(#rough)"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs.join("")}</defs>${parts.join("")}</svg>`;
}

function figure(x: number, gy: number, s: number, ink: string, helmet: boolean, rnd: Rng) {
  const lean = (rnd() - 0.5) * 18;
  const stride = 8 + rnd() * 18;
  const head = helmet
    ? `<path d="M-15 -150 a17 15 0 0 1 34 0 l4 3 l-42 0 z"/><circle cx="1" cy="-140" r="11"/>`
    : `<circle cx="0" cy="-145" r="13"/>`;
  const rifle = helmet && rnd() < 0.7 ? `<rect x="10" y="-150" width="5" height="70" transform="rotate(${20 + rnd() * 20})"/>` : "";
  return `<g transform="translate(${x} ${gy}) scale(${s}) rotate(${lean})" fill="${ink}">
    ${head}
    <path d="M-20 -128 Q0 -136 20 -128 L24 -62 L-24 -62 Z"/>
    <path d="M-20 -124 L-34 -80 L-28 -78 L-14 -112 Z"/>
    <path d="M20 -124 L32 -84 L26 -82 L14 -112 Z"/>
    <path d="M-20 -64 L${-12 - stride} 0 L${-2 - stride} 0 L0 -50 L${2 + stride} 0 L${12 + stride} 0 L20 -64 Z"/>
    ${rifle}
  </g>`;
}

function bust(cx: number, H: number, s: number, ink: string, helmet: boolean, accent: string) {
  const head = helmet
    ? `<path d="M-120 -330 a120 105 0 0 1 240 0 l26 18 l-292 0 z"/><ellipse cx="0" cy="-260" rx="88" ry="104"/>`
    : `<ellipse cx="0" cy="-270" rx="92" ry="112"/>`;
  return `<g transform="translate(${cx} ${H}) scale(${s})" fill="${ink}">
    ${head}
    <path d="M-60 -170 L-58 -120 Q-230 -100 -260 0 L260 0 Q230 -100 58 -120 L60 -170 Z"/>
    <path d="M30 -300 q30 10 40 40" stroke="${accent}" stroke-width="7" fill="none" opacity="0.7"/>
  </g>`;
}

/** Render the SVG to a PNG blob in the browser. */
export async function renderSketchPng(input: SketchInput): Promise<Blob> {
  const svg = renderSketchSvg(input);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = input.width;
    canvas.height = input.height;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
