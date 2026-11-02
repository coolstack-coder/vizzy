"use client";

import { newPage, uid } from "../defaults";
import { renderCharacterSheet, startPageOptions, startRefinement } from "../images";
import { getProject, useVizzy } from "../store";
import type { Balloon, Card, Page, Project } from "../types";
import { toolSchemas, type BalloonSpec, type PageSpec, type ToolName } from "./tools";

// Executes a director tool call against the local project. Each tool validates
// its input, mutates state, returns a short result for Claude and the cards the
// chat should render. Both the Claude director and the offline demo director
// go through this one function, so the UI can't tell them apart.

export interface ToolOutcome {
  result: string;
  isError?: boolean;
  cards: Card[];
}

const POSITIONS: Record<NonNullable<BalloonSpec["position"]>, { x: number; y: number }> = {
  "top-left": { x: 0.04, y: 0.04 },
  top: { x: 0.3, y: 0.04 },
  "top-right": { x: 0.56, y: 0.04 },
  "middle-left": { x: 0.04, y: 0.4 },
  "middle-right": { x: 0.56, y: 0.4 },
  "bottom-left": { x: 0.04, y: 0.78 },
  bottom: { x: 0.3, y: 0.8 },
  "bottom-right": { x: 0.56, y: 0.78 },
};

const DEFAULT_SLOTS: (keyof typeof POSITIONS)[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

export function balloonsFromSpec(specs: BalloonSpec[]): Balloon[] {
  return specs.map((b, i) => {
    const pos = POSITIONS[b.position ?? DEFAULT_SLOTS[i % DEFAULT_SLOTS.length]];
    const isTalk = b.kind === "speech" || b.kind === "thought";
    return {
      id: uid("b_"),
      kind: b.kind,
      text: b.text,
      speaker: b.speaker,
      x: pos.x,
      y: pos.y,
      w: b.kind === "sfx" ? 0.3 : b.kind === "caption" ? 0.42 : 0.36,
      tail: isTalk ? { x: pos.x + 0.18, y: Math.min(0.95, pos.y + 0.28) } : undefined,
    };
  });
}

function resolveCharacters(p: Project, names: string[] = []) {
  return names
    .map((n) => p.characters.find((c) => c.name.toLowerCase() === n.toLowerCase())?.id)
    .filter((x): x is string => !!x);
}

function resolveLocation(p: Project, name?: string) {
  if (!name) return undefined;
  return p.locations.find((l) => l.name.toLowerCase() === name.toLowerCase())?.id;
}

function applySpec(p: Project, page: Page, spec: Partial<PageSpec>) {
  if (spec.title !== undefined) page.title = spec.title;
  if (spec.beat !== undefined) page.beat = spec.beat;
  if (spec.shot) page.shot = spec.shot;
  if (spec.characters) page.characterIds = resolveCharacters(p, spec.characters);
  if (spec.location !== undefined) page.locationId = resolveLocation(p, spec.location);
  if (spec.negativeSpace) page.negativeSpace = spec.negativeSpace;
  if (spec.lettering) page.balloons = balloonsFromSpec(spec.lettering);
}

function pageAt(p: Project, n: number) {
  const page = p.pages[n - 1];
  if (!page) throw new Error(`There is no page ${n}; the book has ${p.pages.length} pages.`);
  return page;
}

export async function executeTool(name: string, rawInput: unknown): Promise<ToolOutcome> {
  const schema = toolSchemas[name as ToolName];
  if (!schema) return { result: `Unknown tool ${name}`, isError: true, cards: [] };
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success)
    return { result: `Invalid input: ${parsed.error.message}`, isError: true, cards: [] };

  const { mutate } = useVizzy.getState();
  // Inputs are validated above; the switch narrows by tool name.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input = parsed.data as any;

  try {
    switch (name as ToolName) {
      case "ask_user":
        return {
          result: "Question shown with quick replies. Wait for the user's answer.",
          cards: [{ kind: "question", question: input.question, chips: input.chips.map((label: string) => ({ label })) }],
        };

      case "set_brief":
        mutate((p) => {
          p.brief = { ...input };
          p.title = input.title;
          if (p.phase === "brief") p.phase = "style";
        });
        return { result: "Brief saved.", cards: [{ kind: "brief" }] };

      case "propose_style_directions":
        mutate((p) => {
          p.phase = "style";
        });
        return {
          result: "Directions shown as cards. The user will pick one (it arrives as a UI event) or describe changes.",
          cards: [{ kind: "style-directions", directions: input.directions }],
        };

      case "update_style_bible": {
        const { lock, ...patch } = input;
        mutate((p) => {
          Object.assign(p.bible, patch);
          p.bible.version += 1;
          if (lock) {
            p.bible.locked = true;
            if (p.phase === "style") p.phase = "cast";
          }
        });
        return { result: `Style bible is now v${getProject().bible.version}${lock ? " and locked" : ""}.`, cards: [{ kind: "style-bible" }] };
      }

      case "upsert_character": {
        mutate((p) => {
          const existing = p.characters.find((c) => c.name.toLowerCase() === input.name.toLowerCase());
          if (existing) {
            Object.assign(existing, input);
            existing.version += 1;
          } else p.characters.push({ id: uid("c_"), version: 1, ...input });
          if (p.phase === "style" && p.bible.locked) p.phase = "cast";
        });
        return { result: `Character ${input.name} saved.`, cards: [{ kind: "cast" }] };
      }

      case "upsert_location":
        mutate((p) => {
          const existing = p.locations.find((l) => l.name.toLowerCase() === input.name.toLowerCase());
          if (existing) existing.look = input.look;
          else p.locations.push({ id: uid("l_"), ...input });
        });
        return { result: `Location ${input.name} saved.`, cards: [] };

      case "generate_character_sheets": {
        const p = getProject();
        const ids = resolveCharacters(p, input.names);
        if (!ids.length) throw new Error("None of those names match a character.");
        useVizzy.getState().set({ activity: "Drawing reference sheets…" });
        await Promise.all(ids.map((id) => renderCharacterSheet(id)));
        return { result: `Reference sheets rendered for ${ids.length} character(s).`, cards: [{ kind: "cast" }] };
      }

      case "propose_page_plan":
        mutate((p) => {
          const locked = p.pages.filter((pg) => pg.status === "locked");
          const fresh = (input.pages as PageSpec[]).slice(locked.length).map((spec) => {
            const pg = newPage({ beat: spec.beat });
            applySpec(p, pg, spec);
            return pg;
          });
          p.pages = [...locked, ...fresh];
          p.brief.pageCount = p.pages.length;
          p.phase = "plan";
          p.currentPageId = p.pages.find((pg) => pg.status !== "locked")?.id;
        });
        return { result: `Plan saved with ${getProject().pages.length} pages. Ask the user to approve or tweak it.`, cards: [{ kind: "plan" }] };

      case "edit_page":
        mutate((p) => applySpec(p, pageAt(p, input.page), input.changes));
        return { result: `Page ${input.page} updated.`, cards: [] };

      case "insert_page":
        mutate((p) => {
          const pg = newPage({ beat: input.spec.beat });
          applySpec(p, pg, input.spec);
          p.pages.splice(Math.min(input.after, p.pages.length), 0, pg);
          p.brief.pageCount = p.pages.length;
        });
        return { result: `Page inserted as page ${input.after + 1}.`, cards: [{ kind: "plan" }] };

      case "remove_page":
        mutate((p) => {
          pageAt(p, input.page);
          p.pages.splice(input.page - 1, 1);
          p.brief.pageCount = p.pages.length;
        });
        return { result: `Page ${input.page} removed.`, cards: [{ kind: "plan" }] };

      case "generate_page_options": {
        const page = pageAt(getProject(), input.page);
        if (page.status === "locked")
          mutate((p) => {
            const pg = p.pages.find((x) => x.id === page.id)!;
            pg.status = "choosing";
            pg.lockedOptionId = undefined;
          });
        const ids = startPageOptions(page.id, input.variations);
        return {
          result: `Rendering ${ids.length} options for page ${input.page} in the background. End your turn; the user will pick one.`,
          cards: [{ kind: "options", pageId: page.id, optionIds: ids }],
        };
      }

      case "refine_option": {
        const page = pageAt(getProject(), input.page);
        const id = startRefinement(page.id, input.instruction, input.preserve);
        return {
          result: `Refinement rendering for page ${input.page}. It becomes the selected option when ready.`,
          cards: [{ kind: "options", pageId: page.id, optionIds: [id] }],
        };
      }

      case "set_lettering":
        mutate((p) => {
          pageAt(p, input.page).balloons = balloonsFromSpec(input.lettering);
        });
        return { result: `Lettering updated on page ${input.page}.`, cards: [] };

      case "lock_page": {
        const p0 = getProject();
        const page = pageAt(p0, input.page);
        const chosen =
          page.options.find((o) => o.id === page.selectedId && o.status === "ready") ??
          (page.options.filter((o) => o.status === "ready").length === 1
            ? page.options.find((o) => o.status === "ready")
            : undefined);
        if (!chosen) throw new Error("The user hasn't selected an option for this page yet.");
        mutate((p) => {
          const pg = p.pages.find((x) => x.id === page.id)!;
          pg.status = "locked";
          pg.selectedId = chosen.id;
          pg.lockedOptionId = chosen.id;
          pg.builtWith = {
            bible: p.bible.version,
            chars: Object.fromEntries(p.characters.map((c) => [c.id, c.version])),
          };
          const next = p.pages.find((x) => x.status !== "locked");
          p.currentPageId = next?.id ?? pg.id;
          if (!next) p.phase = "assemble";
        });
        const remaining = getProject().pages.filter((x) => x.status !== "locked").length;
        return {
          result: remaining
            ? `Page ${input.page} locked. ${remaining} page(s) to go.`
            : `Page ${input.page} locked. Every page is done: offer to open the player.`,
          cards: [{ kind: "locked", pageId: page.id }],
        };
      }

      case "set_phase":
        mutate((p) => {
          p.phase = input.phase;
        });
        return { result: `Phase is now ${input.phase}.`, cards: [] };

      case "open_player":
        mutate((p) => {
          p.phase = "assemble";
        });
        useVizzy.getState().set({ playerOpen: true });
        return { result: "Player opened.", cards: [{ kind: "player" }] };
    }
  } catch (e) {
    return { result: (e as Error).message, isError: true, cards: [] };
  }
  return { result: "Done.", cards: [] };
}
