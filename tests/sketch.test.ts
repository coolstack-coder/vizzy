import { describe, expect, it } from "vitest";
import { renderSketchSvg, type SketchInput } from "@/lib/art/sketch";

const base: SketchInput = {
  prompt: "[SHOT] wide shot, eye level.\n[ACTION] Soldiers wade ashore on the beach.",
  palette: ["#d9cfbd", "#b3261e", "#1c1b1a", "#f4efe6"],
  width: 400,
  height: 600,
  seed: "o_1",
  figures: 2,
};

// The close-up bust is the only shape drawn at this scale on a 400px frame.
const isCloseUp = (svg: string) => svg.includes("a120 105") || svg.includes('rx="92"');

describe("sketch renderer", () => {
  it("is deterministic for the same seed and prompt", () => {
    expect(renderSketchSvg(base)).toBe(renderSketchSvg(base));
  });

  it("varies between options (different seeds)", () => {
    expect(renderSketchSvg(base)).not.toBe(renderSketchSvg({ ...base, seed: "o_2" }));
  });

  it("paints with the style bible palette", () => {
    const svg = renderSketchSvg(base);
    expect(svg).toContain("#1c1b1a"); // darkest colour is the ink
    expect(svg).toMatch(/^<svg[^>]+width="400" height="600"/);
  });

  it("lets a take's variation override the page's planned shot", () => {
    const planned = "[SHOT] close-up, eye level.\n[ACTION] Eli in the surf.";
    expect(isCloseUp(renderSketchSvg({ ...base, prompt: planned }))).toBe(true);
    expect(isCloseUp(renderSketchSvg({ ...base, prompt: `${planned}\n[VARIATION] wide establishing view.` }))).toBe(false);
  });

  it("ignores cast descriptors when choosing the shot", () => {
    const svg = renderSketchSvg({ ...base, prompt: `${base.prompt}\n[CAST] Eli: narrow freckled face, grey eyes.` });
    expect(isCloseUp(svg)).toBe(false);
  });
});
