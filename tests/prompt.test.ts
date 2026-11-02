import { describe, expect, it } from "vitest";
import { compilePrompt } from "@/lib/prompt";
import { newPage, newProject } from "@/lib/defaults";

function project() {
  const p = newProject("Test");
  p.bible = {
    ...p.bible,
    name: "Ink & Ash",
    medium: "Brush ink",
    texture: "paper grain",
    lighting: "overcast dawn",
    palette: [
      { hex: "#d9cfbd", name: "Parchment", role: "dominant" },
      { hex: "#b3261e", name: "Signal red", role: "accent" },
    ],
    moodWords: ["solemn"],
    negative: ["gore"],
  };
  p.characters = [
    { id: "c1", name: "Eli", role: "medic", look: "freckled, grey eyes", wardrobe: "M1 helmet", refImageId: "img_eli", version: 1 },
    { id: "c2", name: "Ray", role: "sergeant", look: "scar through eyebrow", wardrobe: "field jacket", version: 1 },
  ];
  return p;
}

describe("compilePrompt", () => {
  it("compiles style, cast, action and hard constraints in order", () => {
    const p = project();
    const page = newPage({ beat: "Eli kneels in the sand", characterIds: ["c1", "c2"] });
    p.pages = [page];
    const out = compilePrompt(p, page, "low angle");
    const lines = out.text.split("\n").map((l) => l.slice(0, l.indexOf("]") + 1));
    expect(lines).toEqual(["[FORMAT]", "[STYLE]", "[PALETTE]", "[MOOD]", "[SHOT]", "[CAST]", "[ACTION]", "[VARIATION]", "[COMPOSITION]", "[NEVER]"]);
    expect(out.text).toContain("accent Signal red #b3261e");
    expect(out.text).toContain("No text, no letters");
    expect(out.text).toContain("gore");
  });

  it("sends character sheets as references and labels them", () => {
    const p = project();
    const page = newPage({ beat: "x", characterIds: ["c1", "c2"] });
    p.pages = [page];
    const out = compilePrompt(p, page);
    expect(out.refs).toEqual(["img_eli"]);
    expect(out.text).toContain("Eli, medic (match reference image 1 exactly)");
    expect(out.text).not.toContain("Ray, sergeant (match");
  });

  it("uses the first locked page as a style anchor for later pages", () => {
    const p = project();
    const first = newPage({ beat: "a" });
    first.options = [{ id: "o1", imageId: "img_p1", label: "A", status: "ready", prompt: "", refsUsed: [], provider: "sketch", model: "m", createdAt: 0 }];
    first.lockedOptionId = "o1";
    const second = newPage({ beat: "b" });
    p.pages = [first, second];
    const out = compilePrompt(p, second);
    expect(out.refs).toContain("img_p1");
    expect(out.text).toContain("[CONTINUITY]");
    expect(compilePrompt(p, first).refs).not.toContain("img_p1");
  });
});
