import { useCallback, useEffect, useState } from "react";
import type { EmbeddrApiClient } from "@embeddr/client-typescript";
import type { ApiMode, LibraryPath } from "@types";

interface UseEmbeddrLibrariesProps {
  apiBase: string;
  mode: ApiMode;
  configLoaded: boolean;
  apiClient?: EmbeddrApiClient;
  apiKey?: string;
}

export function useEmbeddrLibraries({
  apiBase,
  mode,
  configLoaded,
  apiClient,
  apiKey,
}: UseEmbeddrLibrariesProps) {
  const [libraries, setLibraries] = useState<Array<LibraryPath>>([]);

  const fetchLibraries = useCallback(async () => {
    if (!configLoaded || (!apiBase && !apiClient)) return;

    try {
      if (apiClient) {
        const data = await apiClient.collections.list("library");
        setLibraries(
          (Array.isArray(data) ? data : []).map((item: any, index: number) => {
            const numericId = Number(item?.id);
            const label = String(
              item?.label || item?.name || item?.uri || "Library",
            );
            return {
              id: Number.isFinite(numericId) ? numericId : index + 1,
              path: String(item?.uri || ""),
              label,
              name: label,
              file_count: Number(item?.file_count || 0),
              image_count: Number(item?.file_count || 0),
            };
          }),
        );
        return;
      }

      let baseUrl = apiBase;
      if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["X-API-Key"] = apiKey;
      }

      const url = `${baseUrl}/workspace/paths`;
      let res: Response;
      // Use Proxy
      if (url.startsWith("http")) {
        res = await fetch(`/embeddr/proxy?url=${encodeURIComponent(url)}`, {
          method: "GET",
          headers,
        });
      } else {
        res = await fetch(url, { method: "GET", headers });
      }

      if (res.ok) {
        const data = await res.json();
        setLibraries(data);
      }
    } catch (e) {
      console.error("Failed to fetch libraries", e);
    }
  }, [apiBase, apiClient, configLoaded, apiKey]);

  useEffect(() => {
    if (configLoaded && mode === "local") {
      void fetchLibraries();
    }
  }, [configLoaded, mode, fetchLibraries]);

  return {
    libraries,
    fetchLibraries,
  };
}
