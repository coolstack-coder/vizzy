import { describe, expect, it } from "vitest";
import { toolDefinitions, toolSchemas } from "@/lib/director/tools";

describe("director tools", () => {
  it("exports a JSON schema object for every tool", () => {
    const defs = toolDefinitions();
    expect(defs.map((d) => d.name).sort()).toEqual(Object.keys(toolSchemas).sort());
    for (const d of defs) {
      expect(d.input_schema.type).toBe("object");
      expect(d.description.length).toBeGreaterThan(10);
      expect(d.input_schema).not.toHaveProperty("$schema");
    }
  });

  it("rejects malformed palette colours", () => {
    const bad = toolSchemas.update_style_bible.safeParse({ palette: [{ hex: "red", name: "x", role: "accent" }] });
    expect(bad.success).toBe(false);
  });

  it("caps options per page between 2 and 4", () => {
    expect(toolSchemas.generate_page_options.safeParse({ page: 1, variations: ["a"] }).success).toBe(false);
    expect(toolSchemas.generate_page_options.safeParse({ page: 1, variations: ["a", "b", "c"] }).success).toBe(true);
  });
});
