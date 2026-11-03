import { z } from "zod";

// Request validation for the API routes. These are deliberately loose about
// the shape of Claude messages (the SDK and API validate those) and strict
// about size, so a bad client can't push huge payloads to the providers.

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const imageDataUrl = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "expected a base64 PNG/JPEG/WebP data URL")
  .refine((d) => (d.length - d.indexOf(",") - 1) * 0.75 <= MAX_IMAGE_BYTES, "image is larger than 6 MB");

export const directorRequest = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]),
      }),
    )
    .min(1, "messages must not be empty")
    .max(600, "conversation is too long"),
});

export const imageRequest = z.object({
  provider: z.enum(["gemini", "openai"]),
  prompt: z.string().min(1).max(8000),
  aspect: z.enum(["2:3", "3:4", "1:1", "16:9"]),
  refs: z.array(imageDataUrl).max(4).optional(),
  source: imageDataUrl.optional(),
});

/** Parse JSON and validate it, returning a ready-made 400 response on failure. */
export async function parseJson<T extends z.ZodType>(req: Request, schema: T, maxBytes: number) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > maxBytes) return { error: Response.json({ error: "Request body too large" }, { status: 413 }) };
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: Response.json({ error: "Body must be JSON" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: Response.json({ error: `Invalid request: ${issue.path.join(".") || "body"}: ${issue.message}` }, { status: 400 }),
    };
  }
  return { data: parsed.data as z.infer<T> };
}
