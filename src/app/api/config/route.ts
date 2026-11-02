import { DIRECTOR_MODEL, GEMINI_MODEL, OPENAI_MODEL } from "@/lib/server/env";

// Tells the client which capabilities the server has keys for. Never returns keys.
export async function GET() {
  return Response.json({
    director: !!process.env.ANTHROPIC_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    directorModel: DIRECTOR_MODEL,
    geminiModel: GEMINI_MODEL,
    openaiModel: OPENAI_MODEL,
  });
}
