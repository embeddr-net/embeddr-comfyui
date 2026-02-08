import { useEffect, useMemo, useRef, useState } from "react";
// @ts-ignore
import { app } from "../../../scripts/app.js";
import type { ApiMode } from "@types";
import {
  applyThemePackCss,
  applyThemePackTokens,
  clearThemePackTokens,
  loadThemePacks,
} from "../utils/themePacks";

interface UseEmbeddrSettingsProps {
  baseUrl?: string;
}

export function useEmbeddrSettings({
  baseUrl = "http://localhost:8003",
}: UseEmbeddrSettingsProps = {}) {
  const normalizeEndpoint = (value: string) =>
    value.replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "");

  const [endpoint, setEndpoint] = useState(() => {
    const stored = localStorage.getItem("embeddr_endpoint");
    return normalizeEndpoint(stored || baseUrl);
  });

  const [mode, setMode] = useState<ApiMode>(() => "local");

  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem("embeddr_api_key") || "";
  });

  const [gridSize, setGridSize] = useState(() =>
    parseInt(localStorage.getItem("embeddr_grid_size") || "3"),
  );

  const [gridPreviewContain, setGridPreviewContain] = useState(
    () => localStorage.getItem("embeddr_grid_preview_contain") === "true",
  );

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("embeddr_theme") || "dark";
  });

  const [themePackId, setThemePackId] = useState(() => {
    return localStorage.getItem("embeddr_theme_pack") || "";
  });

  const appliedTokenKeysRef = useRef<string[]>([]);

  const [configLoaded, setConfigLoaded] = useState(false);

  // computed API base for requests
  const apiBase = useMemo(() => {
    const url = normalizeEndpoint(endpoint);
    return url ? `${url}/api/v1` : "/api/v1";
  }, [endpoint]);

  // Apply theme
  useEffect(() => {
    const roots = document.querySelectorAll(".embeddr-theme-root");
    roots.forEach((root) => {
      if (theme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    });

    localStorage.setItem("embeddr_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("embeddr_theme_pack", themePackId);
  }, [themePackId]);

  useEffect(() => {
    const roots = [document.documentElement, document.body];
    roots.forEach((root) => {
      if (themePackId) {
        root.setAttribute("data-embeddr-theme-pack", "1");
      } else {
        root.removeAttribute("data-embeddr-theme-pack");
      }
    });
  }, [themePackId]);

  useEffect(() => {
    let isActive = true;

    const applyTheme = async () => {
      if (!apiBase) return;
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>(".embeddr-theme-root"),
      );

      clearThemePackTokens(targets, appliedTokenKeysRef.current);

      if (!themePackId) {
        applyThemePackCss(null);
        appliedTokenKeysRef.current = [];
        return;
      }

      try {
        const packs = await loadThemePacks(apiBase);
        if (!isActive) return;
        const pack = packs.find((item) => item.id === themePackId);
        if (!pack) {
          applyThemePackCss(null);
          appliedTokenKeysRef.current = [];
          return;
        }

        applyThemePackCss(pack);
        appliedTokenKeysRef.current = applyThemePackTokens(
          targets,
          pack,
          theme === "dark" ? "dark" : "light",
        );
      } catch (e) {
        console.warn("[EmbeddrUI] Failed to load theme packs", e);
      }
    };

    applyTheme();
    return () => {
      isActive = false;
    };
  }, [apiBase, theme, themePackId]);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch("/embeddr/config");
        const data = await res.json();

        if (data.endpoint) {
          const normalized = normalizeEndpoint(
            new URL(data.endpoint).toString(),
          );
          setEndpoint(normalized);
          localStorage.setItem("embeddr_endpoint", normalized);
        }

        if (data.mode) {
          setMode("local");
          localStorage.setItem("embeddr_mode", data.mode);
        }

        if (data.api_key) {
          setApiKey(data.api_key);
          localStorage.setItem("embeddr_api_key", data.api_key);
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
    newApiKey?: string,
  ) => {
    try {
      const normalizedEndpoint = normalizeEndpoint(newEndpoint);
      localStorage.setItem("embeddr_endpoint", normalizedEndpoint);
      localStorage.setItem("embeddr_mode", newMode);
      localStorage.setItem("embeddr_grid_size", newGridSize.toString());
      localStorage.setItem(
        "embeddr_grid_preview_contain",
        newGridPreviewContain.toString(),
      );

      const payload: any = {
        endpoint: normalizedEndpoint,
        mode: newMode,
        grid_size: newGridSize,
        grid_preview_contain: newGridPreviewContain,
      };

      if (newApiKey !== undefined) {
        payload.api_key = newApiKey;
        setApiKey(newApiKey);
        localStorage.setItem("embeddr_api_key", newApiKey);
      }

      const res = await fetch("/embeddr/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      setEndpoint(normalizedEndpoint);
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
    themePackId,
    setThemePackId,
    configLoaded,
    apiKey,
    setApiKey,
    apiBase,
    saveSettings,
  };
}
