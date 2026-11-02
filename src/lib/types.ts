// Core domain model for a Vizzy project. Everything here is plain JSON so it
// can be persisted to IndexedDB, exported as a project file and handed to the
// director as a compact snapshot. Image bytes live in a separate blob store and
// are referenced by id.

export type Phase = "brief" | "style" | "cast" | "plan" | "pages" | "assemble";

export const PHASES: { id: Phase; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "style", label: "Style bible" },
  { id: "cast", label: "Cast & world" },
  { id: "plan", label: "Page plan" },
  { id: "pages", label: "Pages" },
  { id: "assemble", label: "Assemble" },
];

export type Format = "graphic-novel" | "storyboard" | "picture-book";
export type Aspect = "2:3" | "3:4" | "1:1" | "16:9";
export type LetteringStyle = "comic" | "serif" | "typewriter";

export interface Brief {
  title: string;
  logline: string;
  format: Format;
  pageCount: number;
  tone: string;
  audience: string;
  notes: string;
}

export interface PaletteColor {
  hex: string;
  name: string;
  role: "dominant" | "accent" | "shadow" | "highlight";
}

export interface StyleBible {
  version: number;
  locked: boolean;
  name: string;
  medium: string;
  palette: PaletteColor[];
  lighting: string;
  texture: string;
  moodWords: string[];
  aspect: Aspect;
  negative: string[];
  lettering: LetteringStyle;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  /** Frozen visual descriptor, reused verbatim in every prompt. */
  look: string;
  wardrobe: string;
  refImageId?: string;
  version: number;
}

export interface Location {
  id: string;
  name: string;
  look: string;
}

export type BalloonKind = "caption" | "speech" | "thought" | "sfx";

/** Lettering is composited by Vizzy, never baked into the image. Coordinates are 0..1. */
export interface Balloon {
  id: string;
  kind: BalloonKind;
  text: string;
  speaker?: string;
  x: number;
  y: number;
  w: number;
  /** Where the speech tail points, 0..1 in page space. */
  tail?: { x: number; y: number };
}

export interface Shot {
  type: string;
  angle: string;
}

export interface ImageOption {
  id: string;
  imageId?: string;
  label: string;
  status: "pending" | "ready" | "error";
  error?: string;
  prompt: string;
  refsUsed: string[];
  provider: string;
  model: string;
  ms?: number;
  costUsd?: number;
  /** Set when this option is a refinement of another option. */
  parentId?: string;
  instruction?: string;
  createdAt: number;
}

export type PageStatus = "draft" | "generating" | "choosing" | "locked";

export interface Page {
  id: string;
  title: string;
  beat: string;
  shot: Shot;
  characterIds: string[];
  locationId?: string;
  /** Where to keep the image clear for lettering, e.g. "upper third". */
  negativeSpace: string;
  balloons: Balloon[];
  status: PageStatus;
  options: ImageOption[];
  selectedId?: string;
  lockedOptionId?: string;
  builtWith?: { bible: number; chars: Record<string, number> };
  /** Ken Burns focal point for the player, 0..1. */
  focus: { x: number; y: number };
  durationSec: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  images: number;
  costUsd: number;
}

export type QuickReply = { label: string; value?: string };

export type Card =
  | { kind: "question"; question: string; chips: QuickReply[] }
  | { kind: "brief" }
  | { kind: "style-directions"; directions: StyleDirection[] }
  | { kind: "style-bible" }
  | { kind: "cast" }
  | { kind: "plan" }
  | { kind: "options"; pageId: string; optionIds: string[] }
  | { kind: "locked"; pageId: string }
  | { kind: "player" }
  | { kind: "note"; tone: "info" | "warn" | "error"; text: string };

export interface StyleDirection {
  name: string;
  pitch: string;
  medium: string;
  palette: PaletteColor[];
  lighting: string;
  texture: string;
  moodWords: string[];
}

export interface ChatItem {
  id: string;
  role: "user" | "vizzy" | "system";
  text?: string;
  cards?: Card[];
  createdAt: number;
  streaming?: boolean;
}

export interface Project {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  phase: Phase;
  brief: Brief;
  bible: StyleBible;
  characters: Character[];
  locations: Location[];
  pages: Page[];
  currentPageId?: string;
  usage: Usage;
  chat: ChatItem[];
  /** Raw director transcript (Anthropic message params), append-only. */
  transcript: unknown[];
  /** UI actions (select/lock/edit) not yet reported to the director. */
  pendingEvents: string[];
}
