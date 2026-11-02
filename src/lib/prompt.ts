import type { Character, Location, Page, Project } from "./types";

// The director writes the *beat*; this module deterministically compiles the
// full image prompt from the style bible, the cast and the page. Keeping this
// in code (not in the LLM) is what makes pages consistent with each other and
// lets the user inspect exactly what was sent.

export interface CompiledPrompt {
  text: string;
  /** Image ids sent as visual references, in priority order. */
  refs: string[];
  refLabels: string[];
}

export function compilePrompt(
  project: Project,
  page: Page,
  variation?: string,
): CompiledPrompt {
  const { bible } = project;
  const cast = page.characterIds
    .map((id) => project.characters.find((c) => c.id === id))
    .filter((c): c is Character => !!c);
  const location = project.locations.find((l) => l.id === page.locationId);

  const refs: string[] = [];
  const refLabels: string[] = [];
  const castLines = cast.map((c) => {
    let ref = "";
    if (c.refImageId && refs.length < 3) {
      refs.push(c.refImageId);
      refLabels.push(`${c.name} reference sheet`);
      ref = ` (match reference image ${refs.length} exactly)`;
    }
    return `${c.name}, ${c.role}${ref}: ${c.look}. Wearing ${c.wardrobe}.`;
  });

  // The first locked page becomes the style anchor for everything after it.
  const anchor = project.pages.find(
    (p) => p.id !== page.id && p.lockedOptionId,
  );
  const anchorImage = anchor?.options.find(
    (o) => o.id === anchor.lockedOptionId,
  )?.imageId;
  if (anchorImage && refs.length < 4) {
    refs.push(anchorImage);
    refLabels.push("style anchor (an earlier page)");
  }

  const palette = bible.palette
    .map((c) => `${c.role} ${c.name} ${c.hex}`)
    .join(", ");

  const lines = [
    `[FORMAT] A single full-bleed ${formatNoun(project)} illustration, aspect ratio ${bible.aspect}.`,
    `[STYLE] ${bible.medium}. ${bible.texture}. Lighting: ${bible.lighting}.`,
    palette && `[PALETTE] Strictly limited palette: ${palette}.`,
    bible.moodWords.length > 0 && `[MOOD] ${bible.moodWords.join(", ")}.`,
    `[SHOT] ${page.shot.type}, ${page.shot.angle}.`,
    castLines.length > 0 && `[CAST] ${castLines.join(" ")}`,
    location && `[SETTING] ${describeLocation(location)}`,
    `[ACTION] ${page.beat}`,
    variation && `[VARIATION] ${variation}.`,
    `[COMPOSITION] Keep the ${page.negativeSpace} visually quiet so lettering can be placed there.`,
    anchorImage &&
      `[CONTINUITY] Match the rendering style, line weight and colour grading of the style anchor reference.`,
    `[NEVER] No text, no letters, no captions, no speech bubbles, no signatures, no watermarks${
      bible.negative.length ? ", " + bible.negative.join(", ") : ""
    }.`,
  ];

  return {
    text: lines.filter(Boolean).join("\n"),
    refs,
    refLabels,
  };
}

/** Prompt for a character turnaround sheet used as a consistency reference. */
export function compileCharacterSheetPrompt(
  project: Project,
  c: Character,
): string {
  const { bible } = project;
  return [
    `[FORMAT] Character reference sheet on a plain light background, aspect ratio 1:1.`,
    `[STYLE] ${bible.medium}. ${bible.texture}.`,
    `[PALETTE] ${bible.palette.map((p) => `${p.name} ${p.hex}`).join(", ")}.`,
    `[SUBJECT] ${c.name}, ${c.role}: ${c.look}. Wearing ${c.wardrobe}.`,
    `[LAYOUT] Three views side by side, full body: front, three-quarter, profile. Neutral pose, even lighting.`,
    `[NEVER] No text, no labels, no watermarks.`,
  ].join("\n");
}

function describeLocation(l: Location) {
  return `${l.name}: ${l.look}`;
}

function formatNoun(project: Project) {
  switch (project.brief.format) {
    case "storyboard":
      return "cinematic storyboard frame";
    case "picture-book":
      return "picture book page";
    default:
      return "graphic novel page";
  }
}
