import { useEffect, useState } from "react";
import type { ApiMode, LibraryPath } from "@types";

interface UseEmbeddrLibrariesProps {
  apiBase: string;
  mode: ApiMode;
  configLoaded: boolean;
  apiKey?: string;
}

export function useEmbeddrLibraries({
  apiBase,
  mode,
  configLoaded,
  apiKey,
}: UseEmbeddrLibrariesProps) {
  const [libraries, setLibraries] = useState<Array<LibraryPath>>([]);

  const fetchLibraries = async () => {
    try {
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
  };

  // Fetch libraries when in local mode
  useEffect(() => {
    if (configLoaded && mode === "local") {
      // TODO: Backend route /api/v1/workspace/paths is currently missing.
      // Re-enable this when the endpoint is restored or replaced.
      // fetchLibraries();
    }
  }, [configLoaded, mode, apiBase, apiKey]);

  return {
    libraries,
    fetchLibraries,
  };
}
