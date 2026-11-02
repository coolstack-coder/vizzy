import { describe, expect, it } from "vitest";
import { demoTurn } from "@/lib/director/demo";
import { toolSchemas, type ToolName } from "@/lib/director/tools";
import { newPage, newProject } from "@/lib/defaults";
import type { Project } from "@/lib/types";

const STORY = "A graphic novel about D-Day, told through a young medic. Gritty with a red accent.";

function withUser(p: Project, text: string) {
  p.chat.push({ id: String(p.chat.length), role: "user", text, createdAt: 0 });
  return p;
}

function calls(p: Project, text: string) {
  return demoTurn(withUser(p, text), text, []).flatMap((s) => s.calls);
}

describe("offline director", () => {
  it("emits only schema-valid tool calls", () => {
    const p = newProject();
    const all = [...calls(p, STORY), ...calls(p, "Graphic novel · 6 pages")];
    for (const c of all) expect(toolSchemas[c.name as ToolName].safeParse(c.input).success, c.name).toBe(true);
  });

  it("asks about format first, then sets the brief and offers styles", () => {
    const p = newProject();
    expect(calls(p, STORY).map((c) => c.name)).toEqual(["ask_user"]);
    const next = calls(p, "Graphic novel · 6 pages").map((c) => c.name);
    expect(next).toEqual(["set_brief", "propose_style_directions"]);
  });

  it("tints style directions with colours the user named", () => {
    const p = newProject();
    calls(p, STORY);
    const styles = calls(p, "6 pages").find((c) => c.name === "propose_style_directions")!;
    const accents = (styles.input as { directions: { palette: { role: string; hex: string }[] }[] }).directions.map(
      (d) => d.palette.find((c) => c.role === "accent")!.hex,
    );
    expect(new Set(accents)).toEqual(new Set(["#c0392b"]));
  });

  it("refines the selected option instead of regenerating", () => {
    const p = newProject();
    p.phase = "pages";
    const page = newPage({ beat: "beach" });
    page.options = [{ id: "o1", imageId: "i", label: "A · wide", status: "ready", prompt: "", refsUsed: [], provider: "sketch", model: "m", createdAt: 0 }];
    page.selectedId = "o1";
    page.status = "choosing";
    p.pages = [page];
    expect(calls(p, "add more smoke").map((c) => c.name)).toEqual(["refine_option"]);
    expect(calls(p, "lock it").map((c) => c.name)).toEqual(["lock_page", "open_player"]);
  });
});
