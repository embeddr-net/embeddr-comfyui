import { useMemo } from "react";
import { EmbeddrApiClient } from "@embeddr/client-typescript";
import { proxyFetch } from "../utils/proxyFetch";
import { useEmbeddrSettings } from "./useEmbeddrSettings";
import { useEmbeddrLibraries } from "./useEmbeddrLibraries";
import { useEmbeddrImages } from "./useEmbeddrImages";
import { useEmbeddrCollections } from "./useEmbeddrCollections";
import type { Collection } from "./useEmbeddrCollections";
import type { ApiMode, LibraryPath, PromptImageRead } from "@types";

export type { PromptImageRead, LibraryPath, ApiMode, Collection };

interface UseEmbeddrApiProps {
  baseUrl?: string;
}

export function useEmbeddrApi({ baseUrl = "http://localhost:8003" }: UseEmbeddrApiProps = {}) {
  const settings = useEmbeddrSettings({ baseUrl });

  const apiClient = useMemo(
    () =>
      new EmbeddrApiClient({
        baseUrl: settings.apiBase,
        // In ComfyUI, we don't need to pass headers client-side because the proxy handles it.
        // But we keep this for local dev or direct connection scenarios if proxy logic wasn't used.
        // However, since we are injecting proxyFetch, headers passed here are forwarded to fetch,
        // which sends them to the proxy endpoint. The proxy endpoint usually EXPECTS raw structure,
        // but here we are sending metadata.
        // Actually, our proxy implementation forwards the body and method, but headers handling
        // in __init__.py is explicit about keys. It adds X-API-Key itself.
        // So we can strictly rely on proxyFetch to do the lifting.
        fetch: proxyFetch,
        headers: () => {
          const headers: Record<string, string> = {};
          // We can attach the key here, but the proxy will OVERWRITE/Attach it from server-side config.
          // It's safer to rely on server-side config for the key to avoid exposing it in browser network tab
          // if we can. But providing it here doesn't hurt.
          const key = settings.apiKey || localStorage.getItem("embeddr_api_key");
          if (key) {
            // For now we do NOT attach it here to ensure we test the proxy works from server config
            // headers["X-API-Key"] = key;
          }
          return headers;
        },
      }),
    [settings.apiBase, settings.apiKey],
  );

  const libraries = useEmbeddrLibraries({
    apiBase: settings.apiBase,
    mode: settings.mode,
    configLoaded: settings.configLoaded,
    apiKey: settings.apiKey,
    apiClient, // Pass client
  });

  const images = useEmbeddrImages({
    apiBase: settings.apiBase,
    mode: settings.mode,
    configLoaded: settings.configLoaded,
    apiClient, // Pass client - hook will use it now
    apiKey: settings.apiKey,
  });

  const collections = useEmbeddrCollections({
    apiBase: settings.apiBase,
    configLoaded: settings.configLoaded,
    apiClient, // Pass client
    apiKey: settings.apiKey,
  });

  return {
    ...settings,
    apiClient,
    ...libraries,
    ...images,
    ...collections,
  };
}
