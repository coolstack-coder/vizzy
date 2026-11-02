"use client";

import { create } from "zustand";
import type { ChatItem, Project } from "./types";
import { newProject, uid } from "./defaults";
import { listProjects, loadProject, saveProject } from "./storage";

export type DirectorMode = "claude" | "demo";
export type ImageProviderId = "gemini" | "openai" | "sketch";

export interface ServerConfig {
  director: boolean;
  gemini: boolean;
  openai: boolean;
  directorModel: string;
  geminiModel: string;
  openaiModel: string;
}

export interface Keys {
  anthropic?: string;
  gemini?: string;
  openai?: string;
}

interface State {
  project?: Project;
  library: Project[];
  busy: boolean;
  /** Short status line shown under the chat while Vizzy works. */
  activity?: string;
  config?: ServerConfig;
  keys: Keys;
  directorMode: DirectorMode;
  imageProvider: ImageProviderId;
  view: "page" | "bible" | "cast" | "plan";
  playerOpen: boolean;
  promptDrawer?: { pageId: string; optionId: string };

  refreshLibrary(): Promise<void>;
  open(id: string): Promise<void>;
  createProject(title?: string): Project;
  setProject(p: Project): void;
  close(): void;
  /** Apply a mutation to a structured clone of the current project. */
  mutate(fn: (p: Project) => void): void;
  pushChat(item: Omit<ChatItem, "id" | "createdAt"> & { id?: string }): string;
  patchChat(id: string, patch: Partial<ChatItem>): void;
  set(partial: Partial<State>): void;
  setKeys(k: Keys): void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave(p: Project) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveProject(p), 250);
}

function readKeys(): Keys {
  try {
    return JSON.parse(localStorage.getItem("vizzy.keys") ?? "{}");
  } catch {
    return {};
  }
}

export const useVizzy = create<State>((setState, getState) => ({
  library: [],
  busy: false,
  keys: typeof window === "undefined" ? {} : readKeys(),
  directorMode: "demo",
  imageProvider: "sketch",
  view: "page",
  playerOpen: false,

  async refreshLibrary() {
    setState({ library: await listProjects() });
  },

  async open(id) {
    const p = await loadProject(id);
    if (p) setState({ project: p, view: "page", playerOpen: false });
  },

  createProject(title) {
    const p = newProject(title);
    setState({ project: p, view: "page", playerOpen: false });
    void saveProject(p);
    return p;
  },

  setProject(p) {
    setState({ project: p });
    void saveProject(p);
  },

  close() {
    const p = getState().project;
    if (p) void saveProject(p);
    setState({ project: undefined, playerOpen: false });
    void getState().refreshLibrary();
  },

  mutate(fn) {
    const cur = getState().project;
    if (!cur) return;
    const next = structuredClone(cur);
    fn(next);
    next.updatedAt = Date.now();
    setState({ project: next });
    scheduleSave(next);
  },

  pushChat(item) {
    const id = item.id ?? uid("m_");
    getState().mutate((p) => {
      p.chat.push({ ...item, id, createdAt: Date.now() });
    });
    return id;
  },

  patchChat(id, patch) {
    getState().mutate((p) => {
      const m = p.chat.find((c) => c.id === id);
      if (m) Object.assign(m, patch);
    });
  },

  set(partial) {
    setState(partial);
  },

  setKeys(k) {
    try {
      localStorage.setItem("vizzy.keys", JSON.stringify(k));
    } catch {
      /* private mode: keys stay in memory only */
    }
    setState({ keys: k });
  },
}));

export const getProject = () => useVizzy.getState().project!;
