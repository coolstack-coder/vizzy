"use client";

import { createStore, del, get, keys, set } from "idb-keyval";
import type { Project } from "./types";
import { uid } from "./defaults";

// Projects and image blobs are stored in two IndexedDB stores. Project JSON is
// small and saved on every change; images are written once and referenced by id.

const projectsDb = () => createStore("vizzy-projects", "projects");
const imagesDb = () => createStore("vizzy-images", "images");

const urlCache = new Map<string, string>();

export async function saveProject(p: Project) {
  await set(p.id, p, projectsDb());
}

export async function loadProject(id: string) {
  return get<Project>(id, projectsDb());
}

export async function deleteProject(id: string) {
  await del(id, projectsDb());
}

export async function listProjects(): Promise<Project[]> {
  const ids = (await keys(projectsDb())) as string[];
  const all = await Promise.all(ids.map((id) => loadProject(id)));
  return all
    .filter((p): p is Project => !!p)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putImage(blob: Blob, id = uid("img_")) {
  await set(id, blob, imagesDb());
  urlCache.set(id, URL.createObjectURL(blob));
  return id;
}

export async function getImageBlob(id: string) {
  return get<Blob>(id, imagesDb());
}

/** Object URL for an image id, cached for the lifetime of the tab. */
export async function imageUrl(id: string): Promise<string | undefined> {
  const hit = urlCache.get(id);
  if (hit) return hit;
  const blob = await getImageBlob(id);
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function cachedImageUrl(id?: string) {
  return id ? urlCache.get(id) : undefined;
}

/** Downscaled JPEG data URL, used to send references to image models. */
export async function imageAsReference(id: string, max = 1024) {
  const blob = await getImageBlob(id);
  if (!blob) return undefined;
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * s);
  canvas.height = Math.round(bmp.height * s);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function dataUrlToBlob(dataUrl: string) {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
