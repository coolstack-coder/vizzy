import { describe, expect, it } from "vitest";
import { parseBackup } from "@/lib/backup";
import { newProject } from "@/lib/defaults";

const valid = () => JSON.stringify({ format: "vizzy-project", version: 1, exportedAt: "", project: newProject("Book"), images: {} });

describe("backup parsing", () => {
  it("accepts a well-formed backup", () => {
    expect(parseBackup(valid()).project.title).toBe("Book");
  });

  it("rejects non-JSON and foreign JSON with a clear message", () => {
    expect(() => parseBackup("not json")).toThrow("isn't valid JSON");
    expect(() => parseBackup('{"hello":1}')).toThrow("isn't a Vizzy project backup");
  });

  it("refuses backups from a newer format version", () => {
    const b = JSON.parse(valid());
    b.version = 99;
    expect(() => parseBackup(JSON.stringify(b))).toThrow("newer version");
  });
});
