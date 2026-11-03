import { describe, expect, it } from "vitest";
import { directorRequest, imageRequest, parseJson } from "@/lib/server/validate";

const tinyPng = "data:image/png;base64,iVBORw0KGgo=";
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });

describe("API request validation", () => {
  it("accepts a normal image request", () => {
    expect(imageRequest.safeParse({ provider: "gemini", prompt: "a beach", aspect: "2:3", refs: [tinyPng] }).success).toBe(true);
  });

  it("rejects unknown providers, non-image refs and too many refs", () => {
    expect(imageRequest.safeParse({ provider: "dalle", prompt: "x", aspect: "2:3" }).success).toBe(false);
    expect(imageRequest.safeParse({ provider: "openai", prompt: "x", aspect: "2:3", refs: ["https://evil.example/a.png"] }).success).toBe(false);
    expect(imageRequest.safeParse({ provider: "openai", prompt: "x", aspect: "2:3", refs: Array(5).fill(tinyPng) }).success).toBe(false);
  });

  it("requires a non-empty conversation for the director", () => {
    expect(directorRequest.safeParse({ messages: [] }).success).toBe(false);
    expect(directorRequest.safeParse({ messages: [{ role: "user", content: "hi" }] }).success).toBe(true);
    expect(directorRequest.safeParse({ messages: [{ role: "system", content: "hi" }] }).success).toBe(false);
  });

  it("turns bad bodies into 400/413 responses", async () => {
    expect((await parseJson(post("nope"), directorRequest, 1000)).error?.status).toBe(400);
    expect((await parseJson(post({ messages: [] }), directorRequest, 1000)).error?.status).toBe(400);
    expect((await parseJson(post({}, { "content-length": "5000" }), directorRequest, 1000)).error?.status).toBe(413);
    expect((await parseJson(post({ messages: [{ role: "user", content: "hi" }] }), directorRequest, 1000)).data).toBeTruthy();
  });
});
