import type { Page, Project } from "./types";

// A locked page records the style bible and character versions it was drawn
// with. If either moves on afterwards, the page no longer matches the book.

export function staleReasons(project: Project, page: Page): string[] {
  if (page.status !== "locked" || !page.builtWith) return [];
  const reasons: string[] = [];
  if (page.builtWith.bible < project.bible.version)
    reasons.push(`style bible changed (v${page.builtWith.bible} → v${project.bible.version})`);
  for (const id of page.characterIds) {
    const c = project.characters.find((x) => x.id === id);
    const built = page.builtWith.chars[id];
    if (c && built !== undefined && c.version > built) reasons.push(`${c.name} was redesigned`);
  }
  return reasons;
}

export function stalePages(project: Project) {
  return project.pages
    .map((page, i) => ({ page, n: i + 1, reasons: staleReasons(project, page) }))
    .filter((x) => x.reasons.length > 0);
}
