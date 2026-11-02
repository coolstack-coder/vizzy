import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Keys come from the server environment, or per request from the browser
// ("bring your own key", sent as a header and never stored server-side).

export const DIRECTOR_MODEL = process.env.VIZZY_DIRECTOR_MODEL ?? "claude-opus-5-5";
export const DIRECTOR_EFFORT = (process.env.VIZZY_DIRECTOR_EFFORT ?? "low") as
  | "low"
  | "medium"
  | "high";
export const GEMINI_MODEL = process.env.VIZZY_GEMINI_MODEL ?? "gemini-nano-banana-2.1";
export const OPENAI_MODEL = process.env.VIZZY_OPENAI_MODEL ?? "gpt-image-2";

export function anthropicClient(headerKey?: string | null) {
  const apiKey = headerKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return undefined;
  return new Anthropic({
    apiKey,
    // Pin the public endpoint so a stray ANTHROPIC_BASE_URL in a dev shell
    // doesn't hijack requests; override explicitly if you use a gateway.
    baseURL: process.env.VIZZY_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
  });
}

export const geminiKey = (h?: string | null) => h || process.env.GEMINI_API_KEY;
export const openaiKey = (h?: string | null) => h || process.env.OPENAI_API_KEY;
