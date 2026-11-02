"use client";

import { useEffect, useState } from "react";
import { Home } from "@/components/Home";
import { Studio } from "@/components/Studio";
import { useVizzy, type ServerConfig } from "@/lib/store";

export default function Page() {
  const project = useVizzy((s) => s.project);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Pick the best available director and image provider for this server/browser.
    fetch("/api/config")
      .then((r) => r.json() as Promise<ServerConfig>)
      .then((config) => {
        const { keys } = useVizzy.getState();
        useVizzy.getState().set({
          config,
          directorMode: config.director || keys.anthropic ? "claude" : "demo",
          imageProvider: config.gemini || keys.gemini ? "gemini" : config.openai || keys.openai ? "openai" : "sketch",
        });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="h-dvh bg-bg" />;
  return project ? <Studio /> : <Home />;
}
