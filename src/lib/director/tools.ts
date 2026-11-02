import { z } from "zod";

// One source of truth for the director's tools: zod schemas validate inputs on
// the client and are converted to JSON Schema for the Claude API on the server.
// Pages are addressed by 1-based number and characters by name, which is how
// people (and Claude) naturally talk about a book.

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "hex colour like #aabbcc");

const paletteColor = z.object({
  hex,
  name: z.string(),
  role: z.enum(["dominant", "accent", "shadow", "highlight"]),
});

const balloon = z.object({
  kind: z.enum(["caption", "speech", "thought", "sfx"]),
  text: z.string().max(240),
  speaker: z.string().optional().describe("Character name for speech/thought"),
  position: z
    .enum(["top-left", "top", "top-right", "middle-left", "middle-right", "bottom-left", "bottom", "bottom-right"])
    .optional()
    .describe("Where on the page; keep it inside the page's negative space"),
});

const shot = z.object({
  type: z.string().describe("e.g. extreme wide, wide, medium, close-up, extreme close-up, over-the-shoulder, insert"),
  angle: z.string().describe("e.g. eye level, low angle, high angle, bird's-eye, dutch tilt"),
});

const pageSpec = z.object({
  title: z.string().describe("2-5 word page title"),
  beat: z.string().describe("Purely visual description of the moment: who, where, action, light. No dialogue here."),
  shot,
  characters: z.array(z.string()).describe("Names of characters visible on the page"),
  location: z.string().optional().describe("Location name"),
  negativeSpace: z.string().describe("Area kept clear for lettering, e.g. 'upper third', 'left side'"),
  lettering: z.array(balloon).max(4),
});

export const toolSchemas = {
  ask_user: z.object({
    question: z.string().describe("One focused question"),
    chips: z.array(z.string()).max(5).describe("2-5 short quick replies the user can tap"),
  }),
  set_brief: z.object({
    title: z.string(),
    logline: z.string().describe("One-sentence story summary"),
    format: z.enum(["graphic-novel", "storyboard", "picture-book"]),
    pageCount: z.number().int().min(1).max(24),
    tone: z.string(),
    audience: z.string(),
    notes: z.string().describe("Condensed story notes / script the user gave, kept for later pages"),
  }),
  propose_style_directions: z.object({
    directions: z
      .array(
        z.object({
          name: z.string().describe("Evocative 2-3 word name"),
          pitch: z.string().describe("One sentence on why it suits this story"),
          medium: z.string(),
          palette: z.array(paletteColor).min(3).max(6),
          lighting: z.string(),
          texture: z.string().describe("Line work, grain, print texture"),
          moodWords: z.array(z.string()).max(5),
        }),
      )
      .min(2)
      .max(3),
  }),
  update_style_bible: z.object({
    name: z.string().optional(),
    medium: z.string().optional(),
    palette: z.array(paletteColor).min(3).max(6).optional(),
    lighting: z.string().optional(),
    texture: z.string().optional(),
    moodWords: z.array(z.string()).max(6).optional(),
    aspect: z.enum(["2:3", "3:4", "1:1", "16:9"]).optional(),
    negative: z.array(z.string()).optional().describe("Things that must never appear"),
    lettering: z.enum(["comic", "serif", "typewriter"]).optional(),
    lock: z.boolean().optional().describe("Lock the bible once the user approves it"),
  }),
  upsert_character: z.object({
    name: z.string(),
    role: z.string(),
    look: z.string().describe("Frozen visual descriptor (<= 40 words): age, build, face, hair, distinguishing marks"),
    wardrobe: z.string(),
  }),
  upsert_location: z.object({
    name: z.string(),
    look: z.string().describe("Visual descriptor of the place"),
  }),
  generate_character_sheets: z.object({
    names: z.array(z.string()).describe("Characters to draw turnaround reference sheets for"),
  }),
  propose_page_plan: z.object({
    pages: z.array(pageSpec).min(1).max(24),
  }),
  edit_page: z.object({
    page: z.number().int().min(1),
    changes: pageSpec.partial(),
  }),
  insert_page: z.object({
    after: z.number().int().min(0).describe("Insert after this page number; 0 = at the start"),
    spec: pageSpec,
  }),
  remove_page: z.object({ page: z.number().int().min(1) }),
  generate_page_options: z.object({
    page: z.number().int().min(1),
    variations: z
      .array(z.string())
      .min(2)
      .max(4)
      .describe("One deliberate variation per option, e.g. 'low angle, figure dominant', 'wide, tiny figure against the sea'"),
  }),
  refine_option: z.object({
    page: z.number().int().min(1),
    instruction: z.string().describe("Precise edit to apply to the selected option"),
    preserve: z.array(z.string()).optional().describe("What must stay the same"),
  }),
  set_lettering: z.object({
    page: z.number().int().min(1),
    lettering: z.array(balloon).max(5),
  }),
  lock_page: z.object({
    page: z.number().int().min(1),
  }),
  set_phase: z.object({
    phase: z.enum(["brief", "style", "cast", "plan", "pages", "assemble"]),
  }),
  open_player: z.object({}),
} as const;

export type ToolName = keyof typeof toolSchemas;
export type ToolInput<N extends ToolName> = z.infer<(typeof toolSchemas)[N]>;
export type BalloonSpec = z.infer<typeof balloon>;
export type PageSpec = z.infer<typeof pageSpec>;

export const toolDescriptions: Record<ToolName, string> = {
  ask_user: "Ask the user one focused question with tappable quick replies. Use instead of asking questions in prose.",
  set_brief: "Record the story brief once the premise, format, length and tone are clear.",
  propose_style_directions: "Offer 2-3 distinct visual directions as cards the user can choose from.",
  update_style_bible: "Create or patch the style bible. Every image prompt is compiled from it. Set lock=true once the user approves.",
  upsert_character: "Add or update a principal character. The look is reused verbatim in every prompt, so make it concrete and visual.",
  upsert_location: "Add or update a recurring location.",
  generate_character_sheets: "Render turnaround reference sheets; they are passed to the image model on every page for consistency.",
  propose_page_plan: "Lay out the whole book as pages (replaces any existing unlocked plan).",
  edit_page: "Change one page's beat, shot, cast, location or lettering.",
  insert_page: "Insert a new page into the plan.",
  remove_page: "Delete a page from the plan.",
  generate_page_options: "Render 2-4 deliberately different options for a page. Returns immediately; images stream into the UI and the user picks one.",
  refine_option: "Edit the user's selected option with a precise instruction, keeping everything else. Produces a new option.",
  set_lettering: "Replace a page's captions and speech balloons (lettering is composited, never drawn by the image model).",
  lock_page: "Lock the selected option as the final page. Do this when the user is happy.",
  set_phase: "Move the session to a phase.",
  open_player: "Open the cinematic slideshow player once pages are locked.",
};

export function toolDefinitions() {
  return (Object.keys(toolSchemas) as ToolName[]).map((name) => {
    const schema = z.toJSONSchema(toolSchemas[name], { target: "draft-7" }) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name,
      description: toolDescriptions[name],
      input_schema: schema as { type: "object"; [k: string]: unknown },
    };
  });
}
