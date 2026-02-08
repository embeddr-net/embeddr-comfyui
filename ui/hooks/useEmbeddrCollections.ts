import { useState, useCallback } from "react";
import type { EmbeddrApiClient } from "@embeddr/api";

export interface Collection {
  id: string;
  label: string;
  type_name: string;
  file_count: number;
  uri?: string;
  created_at?: string;
}

interface UseEmbeddrCollectionsProps {
  apiBase: string;
  configLoaded: boolean;
  apiClient?: EmbeddrApiClient;
  apiKey?: string;
}

export function useEmbeddrCollections({
  apiBase,
  configLoaded,
  apiClient,
  apiKey,
}: UseEmbeddrCollectionsProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);

  const fetchCollections = useCallback(async () => {
    if (!configLoaded || !apiBase) return;

    setLoadingCollections(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["X-API-Key"] = apiKey;
      }

      let baseUrl = apiBase;
      if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
      // Ensure we target the V2 API
      if (!baseUrl.endsWith("/api/v1")) {
        baseUrl = `${baseUrl}/api/v1`;
      }

      const url = `${baseUrl}/collections`;
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
        // data could be paginated or just a list
        // Assuming list for now based on typical embeddr api
        const list = Array.isArray(data) ? data : data.items || [];
        setCollections(list);
      } else {
        console.error("Failed to fetch collections", res.status);
      }
    } catch (error) {
      console.error("Error fetching collections:", error);
    } finally {
      setLoadingCollections(false);
    }
  }, [apiBase, configLoaded, apiKey]);

  const [creating, setCreating] = useState(false);

  const createCollection = useCallback(
    async (label: string) => {
      if (!configLoaded || !apiBase) return;
      setCreating(true);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (apiKey) {
          headers["X-API-Key"] = apiKey;
        }

        const payload = {
          label: label,
          type_name: "collection:mix", // Default to simple mix
          uri: `embeddr:///collections/${label
            .toLowerCase()
            .replace(/\s/g, "_")}_${Date.now()}`,
        };

        let baseUrl = apiBase;
        if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
        if (!baseUrl.endsWith("/api/v1")) {
          baseUrl = `${baseUrl}/api/v1`;
        }

        // Use the artifact endpoint to create a collection, since /collections might be read-only or alias
        // But if /api/v1/collections exists as a dedicated endpoint, we use it.
        // Assuming /api/v1/collections POST works as expected for creating collections specificically.
        // If not, we might need to POST to /artifacts with type=collection.
        // Let's stick to the user's requested endpoint /api/v1/collections for now.
        const res = await fetch(`${baseUrl}/collections`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          await fetchCollections(); // Refresh list
          return true;
        } else {
          console.error("Failed to create collection", res.status);
          return false;
        }
      } catch (e) {
        console.error(e);
        return false;
      } finally {
        setCreating(false);
      }
    },
    [apiBase, configLoaded, fetchCollections, apiKey],
  );

  return {
    collections,
    fetchCollections,
    loadingCollections,
    createCollection,
    creating,
  };
}
