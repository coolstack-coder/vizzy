import { GEMINI_MODEL, OPENAI_MODEL, geminiKey, openaiKey } from "@/lib/server/env";

export const maxDuration = 180;

// Generates or edits one image with a hosted model. The prompt arrives already
// compiled (style bible + cast + beat); references are downscaled JPEG data
// URLs: character sheets, the style anchor page, or the image being refined.

interface Body {
  provider: "gemini" | "openai";
  prompt: string;
  aspect: "2:3" | "3:4" | "1:1" | "16:9";
  refs?: string[];
  /** For refinement: the image to edit, sent first. */
  source?: string;
}

class ProviderError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const t0 = Date.now();
  try {
    const out =
      body.provider === "openai"
        ? await openai(body, openaiKey(req.headers.get("x-openai-key")))
        : await gemini(body, geminiKey(req.headers.get("x-gemini-key")));
    return Response.json({ ...out, ms: Date.now() - t0 });
  } catch (err) {
    const status = err instanceof ProviderError ? err.status : 500;
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status },
    );
  }
}

const splitDataUrl = (d: string) => {
  const [head, data] = d.split(",");
  return { mimeType: /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg", data };
};

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const retryable = e instanceof ProviderError && (e.status === 429 || e.status >= 500);
      if (!retryable || i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i + Math.random() * 400));
    }
  }
}

async function gemini(b: Body, key?: string) {
  if (!key) throw new ProviderError("No Gemini API key configured", 401);
  const images = [b.source, ...(b.refs ?? [])].filter((x): x is string => !!x);
  const parts = [
    ...images.map((d) => ({ inlineData: splitDataUrl(d) })),
    {
      text: b.source
        ? `Edit the FIRST image. Keep its composition, characters and style unless the instruction says otherwise.\n${b.prompt}`
        : b.prompt,
    },
  ];
  const json = await withRetry(async () => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio: b.aspect, imageSize: "1K" },
          },
        }),
      },
    );
    const j = await res.json();
    if (!res.ok) throw new ProviderError(j?.error?.message ?? `Gemini ${res.status}`, res.status);
    return j;
  });

  type Part = { inlineData?: { mimeType: string; data: string }; thought?: boolean };
  const out: Part[] = json?.candidates?.[0]?.content?.parts ?? [];
  // Gemini 3 models may emit interim "thought" images; keep the last real one.
  const img = out.filter((p) => p.inlineData && !p.thought).pop()?.inlineData;
  if (!img) {
    const reason =
      json?.promptFeedback?.blockReason ?? json?.candidates?.[0]?.finishReason ?? "no image returned";
    throw new ProviderError(`Gemini declined: ${reason}. Try softening the beat.`, 422);
  }
  return {
    image: `data:${img.mimeType};base64,${img.data}`,
    model: GEMINI_MODEL,
    costUsd: 0.034,
  };
}

const OPENAI_SIZE: Record<Body["aspect"], string> = {
  "2:3": "1024x1536",
  "3:4": "1152x1536",
  "1:1": "1024x1024",
  "16:9": "1536x864",
};

async function openai(b: Body, key?: string) {
  if (!key) throw new ProviderError("No OpenAI API key configured", 401);
  const images = [b.source, ...(b.refs ?? [])].filter((x): x is string => !!x);
  const json = await withRetry(async () => {
    let res: Response;
    if (images.length) {
      const form = new FormData();
      form.append("model", OPENAI_MODEL);
      form.append("prompt", b.prompt);
      form.append("size", OPENAI_SIZE[b.aspect]);
      form.append("quality", "medium");
      images.forEach((d, i) => {
        const { mimeType, data } = splitDataUrl(d);
        form.append("image[]", new Blob([Buffer.from(data, "base64")], { type: mimeType }), `ref${i}.jpg`);
      });
      res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { authorization: `Bearer ${key}` },
        body: form,
      });
    } else {
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          prompt: b.prompt,
          size: OPENAI_SIZE[b.aspect],
          quality: "medium",
          n: 1,
        }),
      });
    }
    const j = await res.json();
    if (!res.ok) throw new ProviderError(j?.error?.message ?? `OpenAI ${res.status}`, res.status);
    return j;
  });
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new ProviderError("OpenAI returned no image", 502);
  return { image: `data:image/png;base64,${b64}`, model: OPENAI_MODEL, costUsd: 0.041 };
}
