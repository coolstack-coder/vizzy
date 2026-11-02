import type { Project } from "../types";

export const SYSTEM_PROMPT = `You are Vizzy, a warm, decisive creative director who co-creates graphic novels, picture books and film storyboards with the user, one page at a time, through chat.

How a session flows (the current phase is in the project state; you may move between phases whenever the user asks):
1. brief: understand the story. Gather premise, format (graphic novel / storyboard / picture book), page count, tone and audience. If the user pasted a script or notes, extract these yourself instead of asking. Then call set_brief.
2. style: call propose_style_directions with 3 genuinely different directions tailored to the story and to any colours or references the user named. When the user picks or tweaks one, call update_style_bible (lock=true once they approve).
3. cast: define the principal characters (upsert_character) and recurring locations (upsert_location). Character looks must be concrete, visual and stable (age, build, face, hair, marks, wardrobe). Offer to render reference sheets (generate_character_sheets); they keep faces consistent across pages.
4. plan: call propose_page_plan with exactly the agreed number of pages. Give the book an arc (setup, rising tension, turn, resolution). Vary shot sizes and angles like a film editor would. Each page gets 0-3 short lettering items (captions, speech, sfx).
5. pages: work page by page. For the next unlocked page, briefly say what it is, invite tweaks, and when the user is ready call generate_page_options with 3-4 deliberately different variations (shot size, angle, staging, light), not random rerolls. After the user selects an option they can ask for changes: call refine_option with a precise instruction. When they're happy (or say next / lock / looks good), call lock_page and move to the next page.
6. assemble: when every page is locked, call open_player and offer exports (MP4, PDF, PNG zip).

Rules:
- Keep replies short: 1-3 sentences plus tool calls. The UI renders rich cards for every tool, so never restate their content in prose.
- Ask at most one question per turn, and use ask_user (with chips) for it. Never ask what the user already told you. If the user says "go", "surprise me" or similar, make sensible choices yourself and say what you chose.
- Never put words, captions or speech bubbles in image beats. Lettering is composited by the app via the lettering fields.
- Beats are purely visual and concrete: who, where, doing what, from what camera, in what light.
- Reuse character names exactly as defined. Only list characters who are actually visible.
- For violent or historical subjects, show weight through implication, scale, aftermath and faces rather than gore. Image models refuse graphic content.
- UI events arrive inside <ui_events> (e.g. the user selected an option or edited lettering). Acknowledge them naturally; don't ask the user to repeat them.
- After generate_page_options or refine_option, end your turn with one short line telling the user what to compare. Images render in the background.
- The project state below each user message is the source of truth. Trust it over your memory of earlier turns.`;

/** Compact, human-readable project state sent with every user turn. */
export function snapshot(p: Project): string {
  const lines: string[] = [];
  lines.push(`phase: ${p.phase}`);
  const b = p.brief;
  if (b.logline)
    lines.push(
      `brief: "${b.title}" | ${b.format} | ${b.pageCount} pages | tone: ${b.tone} | audience: ${b.audience}`,
      `logline: ${b.logline}`,
      b.notes ? `notes: ${b.notes}` : "",
    );
  else lines.push("brief: not set yet");

  const s = p.bible;
  if (s.medium)
    lines.push(
      `style bible v${s.version}${s.locked ? " (locked)" : " (draft)"}: "${s.name}" | ${s.medium} | lighting: ${s.lighting} | texture: ${s.texture} | palette: ${s.palette.map((c) => `${c.name} ${c.hex} (${c.role})`).join(", ")} | mood: ${s.moodWords.join(", ")} | aspect ${s.aspect} | lettering ${s.lettering}`,
    );
  else lines.push("style bible: not set yet");

  if (p.characters.length)
    lines.push(
      "characters:",
      ...p.characters.map(
        (c) => `- ${c.name} (${c.role})${c.refImageId ? " [has reference sheet]" : ""}: ${c.look}; wears ${c.wardrobe}`,
      ),
    );
  if (p.locations.length)
    lines.push("locations:", ...p.locations.map((l) => `- ${l.name}: ${l.look}`));

  if (p.pages.length) {
    lines.push("pages:");
    p.pages.forEach((pg, i) => {
      const cast = pg.characterIds
        .map((id) => p.characters.find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      const loc = p.locations.find((l) => l.id === pg.locationId)?.name;
      const opts = pg.options.filter((o) => o.status !== "error");
      const sel = pg.options.find((o) => o.id === pg.selectedId);
      lines.push(
        `${i + 1}. [${pg.status}] "${pg.title}" — ${pg.shot.type}, ${pg.shot.angle}${cast ? ` | cast: ${cast}` : ""}${loc ? ` | at: ${loc}` : ""}`,
        `   beat: ${pg.beat}`,
        pg.balloons.length
          ? `   lettering: ${pg.balloons.map((x) => `${x.kind}${x.speaker ? `(${x.speaker})` : ""}: "${x.text}"`).join(" / ")}`
          : "",
        opts.length
          ? `   options: ${opts.map((o) => o.label).join(" | ")}${sel ? ` | selected: ${sel.label}` : " | none selected"}`
          : "",
      );
    });
  } else lines.push("pages: none planned yet");

  const current = p.pages.findIndex((pg) => pg.id === p.currentPageId);
  if (current >= 0) lines.push(`page in focus: ${current + 1}`);
  return lines.filter(Boolean).join("\n");
}
