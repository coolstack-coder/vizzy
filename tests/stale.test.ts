import { describe, expect, it } from "vitest";
import { newPage, newProject } from "@/lib/defaults";
import { stalePages, staleReasons } from "@/lib/stale";
import { snapshot } from "@/lib/director/system";

function lockedProject() {
  const p = newProject();
  p.bible.version = 2;
  p.characters = [{ id: "c1", name: "Eli", role: "medic", look: "x", wardrobe: "y", version: 1 }];
  const page = newPage({ beat: "beach", characterIds: ["c1"], title: "Landing" });
  page.status = "locked";
  page.builtWith = { bible: 2, chars: { c1: 1 } };
  p.pages = [page, newPage({ beat: "later" })];
  return p;
}

describe("stale pages", () => {
  it("is fresh when versions match", () => {
    const p = lockedProject();
    expect(stalePages(p)).toEqual([]);
  });

  it("flags locked pages after a style bible change", () => {
    const p = lockedProject();
    p.bible.version = 3;
    expect(staleReasons(p, p.pages[0])).toEqual(["style bible changed (v2 → v3)"]);
    expect(stalePages(p).map((x) => x.n)).toEqual([1]);
  });

  it("flags only pages that show a redesigned character", () => {
    const p = lockedProject();
    p.characters[0].version = 2;
    expect(staleReasons(p, p.pages[0])).toEqual(["Eli was redesigned"]);
    expect(staleReasons(p, p.pages[1])).toEqual([]); // not locked
  });

  it("tells the director which pages are out of date", () => {
    const p = lockedProject();
    p.bible.version = 3;
    expect(snapshot(p)).toContain('1. [locked, OUT OF DATE: style bible changed (v2 → v3)] "Landing"');
  });
});
