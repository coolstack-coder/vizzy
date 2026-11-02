"use client";

import { renderSketchPng } from "./art/sketch";
import { aspectSize, uid } from "./defaults";
import { compileCharacterSheetPrompt, compilePrompt } from "./prompt";
import { dataUrlToBlob, imageAsReference, putImage } from "./storage";
import { getProject, useVizzy } from "./store";
import type { Aspect, ImageOption } from "./types";

// Image jobs run in the browser so the chat never blocks: each option is
// created as "pending", rendered in parallel, then patched to "ready".

const MAX_PARALLEL = 3;
let running = 0;
const queue: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => queue.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}

function providerLabel() {
  const { imageProvider, config } = useVizzy.getState();
  if (imageProvider === "gemini") return { provider: "gemini", model: config?.geminiModel ?? "gemini" };
  if (imageProvider === "openai") return { provider: "openai", model: config?.openaiModel ?? "openai" };
  return { provider: "sketch", model: "vizzy-sketch-1 (offline)" };
}

function keyHeaders(): Record<string, string> {
  const { keys } = useVizzy.getState();
  const h: Record<string, string> = {};
  if (keys.gemini) h["x-gemini-key"] = keys.gemini;
  if (keys.openai) h["x-openai-key"] = keys.openai;
  return h;
}

interface RenderRequest {
  prompt: string;
  refs: string[];
  sourceImageId?: string;
  aspect: Aspect;
  seed: string;
  figures: number;
}

async function render(req: RenderRequest): Promise<{ imageId: string; model: string; costUsd: number; ms: number }> {
  const { provider, model } = providerLabel();
  const t0 = performance.now();
  if (provider === "sketch") {
    const { w, h } = aspectSize(req.aspect, 1024);
    const palette = getProject().bible.palette.map((c) => c.hex);
    // A short pause keeps the UX honest about this being a render step.
    await new Promise((r) => setTimeout(r, 450 + Math.random() * 900));
    const blob = await renderSketchPng({
      prompt: req.prompt,
      palette,
      width: w,
      height: h,
      seed: req.seed,
      figures: req.figures,
    });
    return { imageId: await putImage(blob), model, costUsd: 0, ms: performance.now() - t0 };
  }

  const refs = (await Promise.all(req.refs.map((id) => imageAsReference(id)))).filter(
    (x): x is string => !!x,
  );
  const source = req.sourceImageId ? await imageAsReference(req.sourceImageId, 1280) : undefined;
  const res = await fetch("/api/images", {
    method: "POST",
    headers: { "content-type": "application/json", ...keyHeaders() },
    body: JSON.stringify({ provider, prompt: req.prompt, aspect: req.aspect, refs, source }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Image request failed (${res.status})`);
  const imageId = await putImage(dataUrlToBlob(json.image));
  return { imageId, model: json.model, costUsd: json.costUsd ?? 0, ms: json.ms };
}

function patchOption(pageId: string, optionId: string, patch: Partial<ImageOption>) {
  useVizzy.getState().mutate((p) => {
    const page = p.pages.find((x) => x.id === pageId);
    const opt = page?.options.find((o) => o.id === optionId);
    if (!page || !opt) return;
    Object.assign(opt, patch);
    if (patch.status === "ready") {
      p.usage.images += 1;
      p.usage.costUsd += patch.costUsd ?? 0;
    }
    if (page.status === "generating" && page.options.every((o) => o.status !== "pending"))
      page.status = "choosing";
  });
}

/** Queue N option renders for a page. Returns the new option ids immediately. */
export function startPageOptions(pageId: string, variations: string[]): string[] {
  const project = getProject();
  const page = project.pages.find((p) => p.id === pageId)!;
  const { provider, model } = providerLabel();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const base = page.options.length;
  const options: ImageOption[] = variations.map((v, i) => {
    const compiled = compilePrompt(project, page, v);
    return {
      id: uid("o_"),
      label: `${letters[(base + i) % 26]} · ${v}`,
      status: "pending",
      prompt: compiled.text,
      refsUsed: compiled.refLabels,
      provider,
      model,
      createdAt: Date.now(),
    };
  });
  const refs = compilePrompt(project, page).refs;

  useVizzy.getState().mutate((p) => {
    const pg = p.pages.find((x) => x.id === pageId)!;
    pg.options.push(...options);
    pg.status = "generating";
    p.currentPageId = pageId;
    if (p.phase !== "pages") p.phase = "pages";
  });

  for (const opt of options) {
    void slot(() =>
      render({
        prompt: opt.prompt,
        refs,
        aspect: project.bible.aspect,
        seed: opt.id,
        figures: page.characterIds.length,
      }),
    )
      .then((r) => patchOption(pageId, opt.id, { status: "ready", ...r }))
      .catch((e: Error) => patchOption(pageId, opt.id, { status: "error", error: e.message }));
  }
  return options.map((o) => o.id);
}

/** Refine the selected option: an image edit seeded with the source image. */
export function startRefinement(pageId: string, instruction: string, preserve: string[] = []) {
  const project = getProject();
  const page = project.pages.find((p) => p.id === pageId)!;
  const source =
    page.options.find((o) => o.id === page.selectedId && o.status === "ready") ??
    [...page.options].reverse().find((o) => o.status === "ready");
  if (!source?.imageId) throw new Error("Select an option before refining it.");

  const { provider, model } = providerLabel();
  const compiled = compilePrompt(project, page);
  const prompt = `${compiled.text}\n[EDIT] ${instruction}.${
    preserve.length ? ` Preserve: ${preserve.join(", ")}.` : " Preserve everything else."
  }`;
  const rootLabel = source.label.split(" · ")[0];
  const generation = page.options.filter((o) => o.parentId === source.id).length + 1;
  const opt: ImageOption = {
    id: uid("o_"),
    label: `${rootLabel}${generation + 1} · ${instruction}`,
    status: "pending",
    prompt,
    refsUsed: ["option being refined", ...compiled.refLabels],
    provider,
    model,
    parentId: source.id,
    instruction,
    createdAt: Date.now(),
  };
  useVizzy.getState().mutate((p) => {
    const pg = p.pages.find((x) => x.id === pageId)!;
    pg.options.push(opt);
    pg.status = "generating";
    pg.selectedId = opt.id;
  });
  void slot(() =>
    render({
      // Sketch mode has no editor: re-seed from the parent so the result stays
      // close, while the instruction text still nudges the composition.
      prompt: provider === "sketch" ? `${source.prompt}\n${instruction}` : prompt,
      refs: compiled.refs,
      sourceImageId: source.imageId,
      aspect: project.bible.aspect,
      seed: provider === "sketch" ? source.id : opt.id,
      figures: page.characterIds.length,
    }),
  )
    .then((r) => patchOption(pageId, opt.id, { status: "ready", ...r }))
    .catch((e: Error) => patchOption(pageId, opt.id, { status: "error", error: e.message }));
  return opt.id;
}

export function retryOption(pageId: string, optionId: string) {
  const project = getProject();
  const page = project.pages.find((p) => p.id === pageId)!;
  const opt = page.options.find((o) => o.id === optionId)!;
  patchOption(pageId, optionId, { status: "pending", error: undefined });
  useVizzy.getState().mutate((p) => {
    p.pages.find((x) => x.id === pageId)!.status = "generating";
  });
  void slot(() =>
    render({
      prompt: opt.prompt,
      refs: compilePrompt(project, page).refs,
      aspect: project.bible.aspect,
      seed: opt.id + Date.now(),
      figures: page.characterIds.length,
    }),
  )
    .then((r) => patchOption(pageId, optionId, { status: "ready", ...r }))
    .catch((e: Error) => patchOption(pageId, optionId, { status: "error", error: e.message }));
}

export async function renderCharacterSheet(characterId: string) {
  const project = getProject();
  const c = project.characters.find((x) => x.id === characterId);
  if (!c) return;
  const r = await slot(() =>
    render({
      prompt: compileCharacterSheetPrompt(project, c) + `\nclose-up portrait, ${c.wardrobe}`,
      refs: [],
      aspect: "1:1",
      seed: c.id + c.version,
      figures: 1,
    }),
  );
  useVizzy.getState().mutate((p) => {
    const ch = p.characters.find((x) => x.id === characterId);
    if (ch) ch.refImageId = r.imageId;
    p.usage.images += 1;
    p.usage.costUsd += r.costUsd;
  });
}
