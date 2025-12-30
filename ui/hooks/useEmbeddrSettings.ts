import { useEffect, useMemo, useState } from "react";
// @ts-ignore
import { app } from "../../../scripts/app.js";
import type { ApiMode } from "@types";

interface UseEmbeddrSettingsProps {
  baseUrl?: string;
}

export function useEmbeddrSettings({
  baseUrl = "http://localhost:8003",
}: UseEmbeddrSettingsProps = {}) {
  const [endpoint, setEndpoint] = useState(() => {
    const stored = localStorage.getItem("embeddr_endpoint");
    return stored || baseUrl;
  });

  const [mode, setMode] = useState<ApiMode>(() => "local");

  const [gridSize, setGridSize] = useState(() =>
    parseInt(localStorage.getItem("embeddr_grid_size") || "3"),
  );

  const [gridPreviewContain, setGridPreviewContain] = useState(
    () => localStorage.getItem("embeddr_grid_preview_contain") === "true",
  );

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("embeddr_theme") || "dark";
  });

  const [configLoaded, setConfigLoaded] = useState(false);

  // computed API base for requests
  const apiBase = useMemo(() => {
    const url = endpoint.replace(/\/$/, ""); // remove trailing slash
    return `${url}/api/v1`; // append API path automatically
  }, [endpoint]);

  // Apply theme
  useEffect(() => {
    const container = document.querySelector(".embeddr-sidebar-container");
    if (container) {
      if (theme === "dark") {
        container.classList.add("dark");
      } else {
        container.classList.remove("dark");
      }
    }

    // Also handle portals immediately
    const portals = document.querySelectorAll("[data-radix-portal]");
    portals.forEach((portal) => {
      if (theme === "dark") {
        portal.classList.add("dark");
      } else {
        portal.classList.remove("dark");
      }
    });

    localStorage.setItem("embeddr_theme", theme);
  }, [theme]);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch("/embeddr/config");
        const data = await res.json();

        if (data.endpoint) {
          setEndpoint(new URL(data.endpoint).toString());
          localStorage.setItem("embeddr_endpoint", data.endpoint);
        }

        if (data.mode) {
          setMode("local");
          localStorage.setItem("embeddr_mode", data.mode);
        }

        if (data.grid_preview_contain !== undefined) {
          setGridPreviewContain(data.grid_preview_contain);
          localStorage.setItem(
            "embeddr_grid_preview_contain",
            data.grid_preview_contain.toString(),
          );
        }
      } catch (e) {
        console.error("Failed to load config", e);
      } finally {
        setConfigLoaded(true);
      }
    };
    loadConfig();
  }, []);

  const saveSettings = async (
    newEndpoint: string,
    newMode: ApiMode,
    newGridSize: number,
    newGridPreviewContain: boolean,
  ) => {
    try {
      localStorage.setItem("embeddr_endpoint", newEndpoint);
      localStorage.setItem("embeddr_mode", newMode);
      localStorage.setItem("embeddr_grid_size", newGridSize.toString());
      localStorage.setItem(
        "embeddr_grid_preview_contain",
        newGridPreviewContain.toString(),
      );

      const res = await fetch("/embeddr/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: newEndpoint,
          mode: newMode,
          grid_size: newGridSize,
          grid_preview_contain: newGridPreviewContain,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      setEndpoint(newEndpoint);
      setMode(newMode);
      setGridSize(newGridSize);
      setGridPreviewContain(newGridPreviewContain);

      if (app.extensionManager?.toast) {
        app.extensionManager.toast.add({
          severity: "success",
          summary: "Settings Saved",
          detail: "Settings have been saved successfully.",
          life: 3000,
        });
      } else {
        alert("Settings saved!");
      }

      return true;
    } catch (e) {
      console.error("Failed to save settings", e);
      if (app.extensionManager?.toast) {
        app.extensionManager.toast.add({
          severity: "error",
          summary: "Save Failed",
          detail: "Failed to save settings to server. Check console.",
          life: 5000,
        });
      } else {
        alert("Failed to save settings.");
      }
      return false;
    }
  };

  return {
    endpoint,
    setEndpoint,
    mode,
    setMode,
    gridSize,
    setGridSize,
    gridPreviewContain,
    setGridPreviewContain,
    theme,
    setTheme,
    configLoaded,
    apiBase,
    saveSettings,
  };
}
