"use client";

import { uid } from "./defaults";
import { dataUrlToBlob, getImageBlob, putImage, saveProject } from "./storage";
import type { Project } from "./types";

// A project lives in this browser's IndexedDB. A backup is one JSON file with
// the project and every image it references inlined, so a book can be moved
// to another machine or attached to an email and opened again.

const FORMAT = "vizzy-project";
const VERSION = 1;

interface Backup {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  project: Project;
  images: Record<string, string>;
}

function imageIds(p: Project) {
  const ids = new Set<string>();
  for (const c of p.characters) if (c.refImageId) ids.add(c.refImageId);
  for (const page of p.pages) for (const o of page.options) if (o.imageId) ids.add(o.imageId);
  return [...ids];
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

export async function exportBackup(p: Project) {
  const images: Record<string, string> = {};
  for (const id of imageIds(p)) {
    const blob = await getImageBlob(id);
    if (blob) images[id] = await blobToDataUrl(blob);
  }
  const backup: Backup = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), project: p, images };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
  a.download = `${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "vizzy"}.vizzy.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const b = data as Partial<Backup>;
  if (b?.format !== FORMAT || typeof b.version !== "number" || !b.project || typeof b.images !== "object")
    throw new Error("That file isn't a Vizzy project backup.");
  if (b.version > VERSION) throw new Error("This backup was made by a newer version of Vizzy.");
  const p = b.project;
  if (!Array.isArray(p.pages) || !Array.isArray(p.chat) || !p.bible || !p.brief)
    throw new Error("The backup is missing project data.");
  return b as Backup;
}

/** Restore a backup as a new project (never overwrites an existing one). */
export async function importBackup(file: File): Promise<Project> {
  const backup = parseBackup(await file.text());
  for (const [id, dataUrl] of Object.entries(backup.images)) await putImage(dataUrlToBlob(dataUrl), id);
  const now = Date.now();
  const project: Project = {
    ...backup.project,
    id: uid("p_"),
    title: backup.project.title,
    updatedAt: now,
    pendingEvents: backup.project.pendingEvents ?? [],
    transcript: backup.project.transcript ?? [],
  };
  await saveProject(project);
  return project;
}
