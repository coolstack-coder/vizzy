"use client";

import type { PaletteColor, Project, StyleDirection } from "../types";
import type { PageSpec, ToolName } from "./tools";

// Offline director. A small, deterministic state machine that reads the same
// project state Claude sees and emits the same tool calls, so the complete
// brief → style → cast → plan → pages → player flow works without any keys.
// It is intentionally simple; the Claude director is the real experience.

export interface DemoStep {
  say: string;
  calls: { name: ToolName; input: unknown }[];
}

const YES = /\b(yes|yep|sure|go|ok|okay|approve|approved|looks good|love it|perfect|great|lock|next|happy|do it|ship it|nice)\b/i;
const SKIP = /\b(skip|no|later|not now)\b/i;

export function demoTurn(project: Project, text: string, events: string[]): DemoStep[] {
  const t = text.trim();
  const all = `${t} ${events.join(" ")}`;
  switch (project.phase) {
    case "brief":
      return briefTurn(project, t);
    case "style":
      return styleTurn(project, all);
    case "cast":
      return castTurn(project, t);
    case "plan":
      return planTurn(project, t);
    case "pages":
      return pagesTurn(project, t, events);
    case "assemble":
      return [{ say: "Every page is locked. Here's your book in motion: export it as MP4, PDF or PNGs from the player.", calls: [{ name: "open_player", input: {} }] }];
  }
}

// ---------------------------------------------------------------- brief

function storyText(p: Project) {
  return p.chat.find((m) => m.role === "user")?.text ?? "";
}

function briefTurn(p: Project, t: string): DemoStep[] {
  const userTurns = p.chat.filter((m) => m.role === "user").length;
  if (userTurns <= 1) {
    const story = detectStory(t);
    return [
      {
        say: `${story.hook} Before we pick a look, what are we making, and how long should it be?`,
        calls: [
          {
            name: "ask_user",
            input: {
              question: "Format and length?",
              chips: ["Graphic novel · 6 pages", "Film storyboard · 8 frames", "Picture book · 5 pages", "Surprise me"],
            },
          },
        ],
      },
    ];
  }
  const story = detectStory(storyText(p));
  const format = /storyboard|film|frame/i.test(t) ? "storyboard" : /picture|kids|children/i.test(t) ? "picture-book" : "graphic-novel";
  const count = Number(/(\d+)/.exec(t)?.[1] ?? 6);
  const pageCount = Math.max(3, Math.min(10, count));
  const colours = parseColours(`${storyText(p)} ${t}`);
  return [
    {
      say: `Got it: a ${pageCount}-page ${format.replace("-", " ")}. Here are three directions for the look${colours.length ? ", each built around the colours you mentioned" : ""}. Pick one, or tell me what to mix.`,
      calls: [
        {
          name: "set_brief",
          input: {
            title: story.title,
            logline: story.logline,
            format,
            pageCount,
            tone: story.tone,
            audience: "adults",
            notes: storyText(p).slice(0, 600),
          },
        },
        { name: "propose_style_directions", input: { directions: story.directions.map((d) => tint(d, colours)) } },
      ],
    },
  ];
}

// ---------------------------------------------------------------- style

function styleTurn(p: Project, all: string): DemoStep[] {
  const cards = p.chat.flatMap((m) => m.cards ?? []);
  const directions = [...cards].reverse().find((c) => c.kind === "style-directions");
  const options = directions?.kind === "style-directions" ? directions.directions : detectStory(storyText(p)).directions;
  const pick = options.find((d) => all.toLowerCase().includes(d.name.toLowerCase())) ?? options[0];
  const story = detectStory(storyText(p));
  const aspect = p.brief.format === "storyboard" ? "16:9" : "2:3";
  return [
    {
      say: `"${pick.name}" it is. I've locked it into the style bible: every prompt is compiled from it. I've also cast the story and its key locations.`,
      calls: [
        {
          name: "update_style_bible",
          input: {
            name: pick.name,
            medium: pick.medium,
            palette: pick.palette,
            lighting: pick.lighting,
            texture: pick.texture,
            moodWords: pick.moodWords,
            aspect,
            negative: ["gore", "modern objects", "text"],
            lettering: story.lettering,
            lock: true,
          },
        },
        ...story.cast.map((c) => ({ name: "upsert_character" as const, input: c })),
        ...story.locations.map((l) => ({ name: "upsert_location" as const, input: l })),
        {
          name: "ask_user",
          input: {
            question: "Want turnaround reference sheets? They keep faces consistent from page to page.",
            chips: ["Yes, draw them", "Skip to the page plan"],
          },
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------- cast

function castTurn(p: Project, t: string): DemoStep[] {
  const story = detectStory(storyText(p));
  const plan = buildPlan(story, p.brief.pageCount);
  const calls: DemoStep["calls"] = [];
  if (!SKIP.test(t)) calls.push({ name: "generate_character_sheets", input: { names: p.characters.map((c) => c.name) } });
  calls.push({ name: "propose_page_plan", input: { pages: plan } });
  return [
    {
      say: `Here's the page plan: an arc from calm to chaos to a quiet ending, with the shot sizes varied like a film cut. Approve it, or tell me what to change (e.g. "make page 3 a close-up").`,
      calls,
    },
  ];
}

// ---------------------------------------------------------------- plan

function planTurn(p: Project, t: string): DemoStep[] {
  const pageRef = /page\s*(\d+)/i.exec(t);
  if (pageRef && !YES.test(t)) {
    const n = Number(pageRef[1]);
    const page = p.pages[n - 1];
    if (page) {
      const close = /close/i.test(t);
      return [
        {
          say: `Updated page ${n}. Anything else, or shall we start drawing?`,
          calls: [
            {
              name: "edit_page",
              input: {
                page: n,
                changes: close
                  ? { shot: { type: "close-up", angle: page.shot.angle } }
                  : { beat: `${page.beat} ${t.replace(pageRef[0], "").trim()}` },
              },
            },
          ],
        },
      ];
    }
  }
  return [{ say: "", calls: [{ name: "set_phase", input: { phase: "pages" } }] }, ...introPage(p, 0, true)];
}

// ---------------------------------------------------------------- pages

const VARIATIONS = [
  ["wide establishing view, figures small against the scene", "low angle, figures dominant and heroic", "over-the-shoulder, looking toward the danger", "tight close-up on a face, background soft"],
  ["high angle looking down, sense of scale", "eye level medium shot, faces readable", "dutch tilt, unstable and urgent", "silhouettes against the brightest light"],
];

function introPage(p: Project, index: number, generate: boolean): DemoStep[] {
  const page = p.pages[index];
  if (!page) return [];
  if (!generate)
    return [
      {
        say: `Page ${index + 1}, "${page.title}": ${page.beat}`,
        calls: [{ name: "ask_user", input: { question: `Anything to change on page ${index + 1} before I draw it?`, chips: ["Go", "Make it night", "Closer on the faces", "More chaos"] } }],
      },
    ];
  return [
    {
      say: `Page ${index + 1}, "${page.title}". Four takes, each a different camera idea. Pick one with a click (or keys 1-4), then tell me what to adjust, or say "lock it".`,
      calls: [{ name: "generate_page_options", input: { page: index + 1, variations: VARIATIONS[index % 2] } }],
    },
  ];
}

function pagesTurn(p: Project, t: string, events: string[]): DemoStep[] {
  const index = p.pages.findIndex((pg) => pg.status !== "locked");
  if (index < 0) return [{ say: "That's the whole book. Rolling the player.", calls: [{ name: "open_player", input: {} }] }];
  const page = p.pages[index];
  const n = index + 1;
  const hasReady = page.options.some((o) => o.status === "ready");
  const selected = page.options.find((o) => o.id === page.selectedId);

  if (!hasReady) {
    if (t && !YES.test(t)) {
      return [
        {
          say: `Folding that into the beat for page ${n}.`,
          calls: [{ name: "edit_page", input: { page: n, changes: { beat: `${page.beat} ${t}` } } }],
        },
        ...introPage(p, index, true),
      ];
    }
    return introPage(p, index, true);
  }

  if (/\b(again|fresh|more (options|takes)|new (options|takes)|regenerate|reroll|different)\b/i.test(t))
    return [{ say: `Fresh takes on page ${n}.`, calls: [{ name: "generate_page_options", input: { page: n, variations: VARIATIONS[(index + 1) % 2] } }] }];

  if (YES.test(t) || events.some((e) => e.includes("locked"))) {
    if (!selected)
      return [{ say: `Pick one of the options for page ${n} first: click a thumbnail or press 1-4.`, calls: [] }];
    const after = p.pages[index + 1];
    const steps: DemoStep[] = [{ say: `Locked page ${n}.`, calls: [{ name: "lock_page", input: { page: n } }] }];
    if (!after) steps.push({ say: "That's the final page. Here's the whole book, in motion.", calls: [{ name: "open_player", input: {} }] });
    else steps.push(...introPage(p, index + 1, false));
    return steps;
  }

  if (!t && events.length) {
    return selected
      ? [{ say: `Nice pick: "${selected.label.split(" · ")[1] ?? selected.label}". Want any changes, or shall I lock it?`, calls: [{ name: "ask_user", input: { question: "Refine or lock?", chips: ["Lock it", "Warmer light", "Add more smoke", "Closer on the faces"] } }] }]
      : [];
  }

  if (!selected) return [{ say: `Pick an option for page ${n} first, then I'll refine it.`, calls: [] }];
  return [
    {
      say: `Refining "${selected.label.split(" · ")[0]}" with: ${t}. Compare it against the original when it lands.`,
      calls: [{ name: "refine_option", input: { page: n, instruction: t } }],
    },
  ];
}

// ---------------------------------------------------------------- stories

interface StoryKit {
  title: string;
  logline: string;
  tone: string;
  hook: string;
  lettering: "comic" | "serif" | "typewriter";
  directions: StyleDirection[];
  cast: { name: string; role: string; look: string; wardrobe: string }[];
  locations: { name: string; look: string }[];
  beats: PageSpec[];
}

const pal = (...c: [string, string, PaletteColor["role"]][]): PaletteColor[] =>
  c.map(([hex, name, role]) => ({ hex, name, role }));

function detectStory(text: string): StoryKit {
  if (/d-?day|normandy|omaha|world war|ww2|wwii|1944/i.test(text)) return DDAY;
  return generic(text);
}

const DDAY: StoryKit = {
  title: "The Longest Morning",
  logline: "On 6 June 1944 a nineteen-year-old medic crosses Omaha Beach and learns that courage is just the next step forward.",
  tone: "solemn, intimate, grounded",
  hook: "D-Day: a huge canvas. I'd tell it small, through one young medic's eyes, so the scale lands on a single face.",
  lettering: "typewriter",
  directions: [
    {
      name: "Ink & Ash",
      pitch: "Heavy brush ink with one wound-red accent; it reads like a war correspondent's sketchbook.",
      medium: "Expressive brush-and-ink illustration with dry-brush edges and ink washes",
      palette: pal(["#d9cfbd", "Dust parchment", "dominant"], ["#b3261e", "Signal red", "accent"], ["#1c1b1a", "Lamp black", "shadow"], ["#f4efe6", "Bone white", "highlight"]),
      lighting: "Overcast dawn, flat cold light broken by flashes",
      texture: "Visible paper tooth, splattered ink, rough halftone in shadows",
      moodWords: ["solemn", "raw", "immediate"],
    },
    {
      name: "Faded Kodachrome",
      pitch: "Desaturated period colour, like found film stock from 1944.",
      medium: "Painterly realism in the style of aged colour photography",
      palette: pal(["#8a9a8c", "Channel grey-green", "dominant"], ["#c7883a", "Brass", "accent"], ["#2e3330", "Wet slate", "shadow"], ["#e6dccb", "Faded cream", "highlight"]),
      lighting: "Low sun through sea mist, soft backlight",
      texture: "Film grain, slight colour bleed, soft edges",
      moodWords: ["nostalgic", "heavy", "human"],
    },
    {
      name: "Graphic Noir",
      pitch: "High-contrast blocks and hard silhouettes for maximum drama.",
      medium: "Bold graphic novel inking with flat colour blocks",
      palette: pal(["#2f3e46", "Steel blue", "dominant"], ["#e9c46a", "Flare gold", "accent"], ["#0b0c0d", "Ink", "shadow"], ["#edf2f4", "Paper", "highlight"]),
      lighting: "Hard rim light from explosions, deep shadows",
      texture: "Clean heavy line weight, spot blacks, screen-tone gradients",
      moodWords: ["stark", "kinetic", "mythic"],
    },
  ],
  cast: [
    { name: "Eli Brandt", role: "19-year-old army medic, our point of view", look: "lanky 19-year-old, narrow freckled face, big frightened grey eyes, chipped front tooth, chin strap undone", wardrobe: "M1 helmet with red-cross brassard on the left arm, olive wool uniform soaked dark, canvas medic satchels" },
    { name: "Sgt. Ray Okafor", role: "squad sergeant, steady and protective", look: "broad-shouldered man in his thirties, square jaw, close-cropped beard shadow, calm heavy-lidded eyes, scar through left eyebrow", wardrobe: "M1 helmet with netting, olive field jacket, Thompson slung across chest" },
  ],
  locations: [
    { name: "Landing craft", look: "cramped Higgins boat, steel ramp at the bow, sea spray, packed rows of helmets" },
    { name: "Omaha Beach", look: "wide grey sand, steel hedgehog obstacles, smoke along the bluffs, surf churning" },
  ],
  beats: [
    { title: "Before the ramp", beat: "Inside the landing craft at dawn, rows of helmets; Eli grips his satchel strap, eyes fixed on the steel ramp ahead.", shot: { type: "medium shot", angle: "eye level" }, characters: ["Eli Brandt", "Sgt. Ray Okafor"], location: "Landing craft", negativeSpace: "upper third", lettering: [{ kind: "caption", text: "Normandy. 6 June 1944. 06:31.", position: "top-left" }, { kind: "speech", speaker: "Sgt. Ray Okafor", text: "Stay on my back, Doc. Don't stop for anything.", position: "top-right" }] },
    { title: "The ramp drops", beat: "The bow ramp crashes down revealing the beach, smoke and steel obstacles; figures surge into chest-deep surf.", shot: { type: "wide shot", angle: "low angle" }, characters: ["Sgt. Ray Okafor"], location: "Omaha Beach", negativeSpace: "top", lettering: [{ kind: "sfx", text: "KLANNG", position: "top" }] },
    { title: "Into the water", beat: "Eli underwater for a moment, light filtering down, bubbles and dropped gear around him, then breaking the surface.", shot: { type: "close-up", angle: "eye level" }, characters: ["Eli Brandt"], location: "Omaha Beach", negativeSpace: "upper third", lettering: [{ kind: "caption", text: "The sea was louder than the guns.", position: "top-left" }] },
    { title: "The calling", beat: "Eli kneels in wet sand beside a wounded soldier behind a steel hedgehog, smoke drifting across, Okafor shielding them.", shot: { type: "medium shot", angle: "high angle" }, characters: ["Eli Brandt", "Sgt. Ray Okafor"], location: "Omaha Beach", negativeSpace: "top-right", lettering: [{ kind: "speech", speaker: "Eli Brandt", text: "Medic! I've got you. Look at me.", position: "top-right" }] },
    { title: "One step", beat: "Close on Eli's face streaked with sand and salt, jaw set, as he looks up the beach toward the bluffs.", shot: { type: "extreme close-up", angle: "low angle" }, characters: ["Eli Brandt"], location: "Omaha Beach", negativeSpace: "left side", lettering: [{ kind: "thought", speaker: "Eli Brandt", text: "Next step. Just the next one.", position: "middle-left" }] },
    { title: "Evening tide", beat: "Dusk on the quiet beach, Eli and Okafor sitting against the sea wall, smoke thinning, the tide returning.", shot: { type: "wide shot", angle: "eye level" }, characters: ["Eli Brandt", "Sgt. Ray Okafor"], location: "Omaha Beach", negativeSpace: "upper third", lettering: [{ kind: "caption", text: "By nightfall we held the beach. I never learned his name.", position: "top" }] },
  ],
};

function generic(text: string): StoryKit {
  const words = text.replace(/[^\w\s'-]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const key = words.slice(0, 3).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  const title = key.length ? `The ${key[key.length - 1]}` : "The Journey";
  const night = /night|dark|moon|star/i.test(text);
  const sea = /sea|ocean|ship|island|shore/i.test(text);
  const place = sea ? "a windswept coast" : night ? "a city at night" : "a wide open valley";
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 12);
  return {
    title,
    logline: sentences[0]?.slice(0, 200) ?? `A story told across ${place}.`,
    tone: night ? "moody, mysterious" : "hopeful, adventurous",
    hook: "Love this. I can already see the opening frame.",
    lettering: "comic",
    directions: [
      { name: "Riso Dream", pitch: "Two-ink risograph print: playful and bold.", medium: "Risograph-style illustration with two overlapping inks", palette: pal(["#f2e8cf", "Newsprint", "dominant"], ["#ff6b4a", "Fluoro coral", "accent"], ["#24325f", "Riso blue", "shadow"], ["#fffaf0", "White", "highlight"]), lighting: "Bright, even daylight", texture: "Misregistered ink layers, grain, halftone", moodWords: ["playful", "bold", "warm"] },
      { name: "Moonlit Gouache", pitch: "Soft painted shapes with a glowing accent.", medium: "Gouache painting with soft shapes and visible brushwork", palette: pal(["#3d5a80", "Dusk blue", "dominant"], ["#ee6c4d", "Lantern orange", "accent"], ["#1b263b", "Night", "shadow"], ["#e0fbfc", "Moon", "highlight"]), lighting: "Moonlight with warm practical lights", texture: "Matte paint, dry brush edges", moodWords: ["dreamy", "quiet", "magical"] },
      { name: "Ink Noir", pitch: "Stark black and white with one accent colour.", medium: "High-contrast ink illustration", palette: pal(["#d6d6d6", "Fog", "dominant"], ["#e63946", "Red", "accent"], ["#0d0d0d", "Ink", "shadow"], ["#ffffff", "Paper", "highlight"]), lighting: "Hard single source, long shadows", texture: "Heavy blacks, crosshatching", moodWords: ["tense", "graphic", "cinematic"] },
    ],
    cast: [
      { name: "Ava", role: "protagonist", look: "wiry woman in her twenties, sharp cheekbones, short cropped dark hair, determined dark eyes", wardrobe: "oversized mustard coat, scarf, worn boots" },
      { name: "Moss", role: "companion", look: "shaggy grey dog with one ear up, bright amber eyes", wardrobe: "red bandana" },
    ],
    locations: [{ name: "The Edge", look: place }],
    beats: [
      { title: "Opening", beat: `Establishing view of ${place}; Ava stands small at the edge, Moss beside her.`, shot: { type: "wide shot", angle: "high angle" }, characters: ["Ava", "Moss"], location: "The Edge", negativeSpace: "upper third", lettering: [{ kind: "caption", text: sentences[0]?.slice(0, 90) ?? "It started here.", position: "top-left" }] },
      { title: "The call", beat: "Close on Ava noticing something far away, light catching her eyes.", shot: { type: "close-up", angle: "eye level" }, characters: ["Ava"], location: "The Edge", negativeSpace: "left side", lettering: [{ kind: "thought", speaker: "Ava", text: "There. Did you see it?", position: "middle-left" }] },
      { title: "Setting out", beat: "Ava and Moss walking into the landscape, long shadows behind them.", shot: { type: "wide shot", angle: "low angle" }, characters: ["Ava", "Moss"], location: "The Edge", negativeSpace: "top", lettering: [] },
      { title: "The obstacle", beat: "A storm rolls in; Ava shields Moss under her coat.", shot: { type: "medium shot", angle: "dutch tilt" }, characters: ["Ava", "Moss"], location: "The Edge", negativeSpace: "top-right", lettering: [{ kind: "sfx", text: "KRAKOOM", position: "top-right" }] },
      { title: "The turn", beat: "Ava climbs the final ridge at night, stars bright above.", shot: { type: "wide shot", angle: "low angle" }, characters: ["Ava"], location: "The Edge", negativeSpace: "upper third", lettering: [{ kind: "caption", text: sentences[1]?.slice(0, 90) ?? "She kept going.", position: "top" }] },
      { title: "Home", beat: "Morning light; Ava and Moss resting, the valley below now calm.", shot: { type: "medium shot", angle: "eye level" }, characters: ["Ava", "Moss"], location: "The Edge", negativeSpace: "upper third", lettering: [{ kind: "speech", speaker: "Ava", text: "We made it, Moss.", position: "top-left" }] },
    ],
  };
}

function buildPlan(story: StoryKit, count: number): PageSpec[] {
  const beats = story.beats;
  if (count <= beats.length) {
    // Keep the first and last beats; sample the middle.
    if (count >= beats.length) return beats;
    const mid = beats.slice(1, -1);
    const step = mid.length / Math.max(1, count - 2);
    return [beats[0], ...Array.from({ length: count - 2 }, (_, i) => mid[Math.floor(i * step)]), beats[beats.length - 1]];
  }
  const extra = Array.from({ length: count - beats.length }, (_, i) => {
    const src = beats[1 + (i % (beats.length - 2))];
    return { ...src, title: `${src.title} (II)`, shot: { type: "insert shot", angle: "eye level" }, lettering: [] };
  });
  return [...beats.slice(0, -1), ...extra, beats[beats.length - 1]];
}

const COLOUR_WORDS: Record<string, string> = {
  red: "#c0392b", crimson: "#a4161a", orange: "#e07a2f", gold: "#d4a017", yellow: "#e9c46a", teal: "#2a9d8f",
  green: "#3a7d44", blue: "#2b5d8a", navy: "#1d3557", purple: "#6a4c93", pink: "#e56b9f", sepia: "#a67c52",
  brown: "#7b5134", grey: "#7d8597", gray: "#7d8597", black: "#111111", white: "#f5f3ee",
};

function parseColours(text: string): string[] {
  return Object.keys(COLOUR_WORDS).filter((w) => new RegExp(`\\b${w}s?\\b`, "i").test(text)).map((w) => COLOUR_WORDS[w]);
}

/** Let colours the user named override the accent (and dominant) of a direction. */
function tint(d: StyleDirection, colours: string[]): StyleDirection {
  if (!colours.length) return d;
  return {
    ...d,
    palette: d.palette.map((c) =>
      c.role === "accent" ? { ...c, hex: colours[0], name: `${c.name} (your pick)` } : c.role === "dominant" && colours[1] ? { ...c, hex: colours[1] } : c,
    ),
  };
}
