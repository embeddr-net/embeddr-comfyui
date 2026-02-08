import { useCallback, useRef, useState } from "react";
import type { EmbeddrApiClient } from "@embeddr/api";
// @ts-ignore
import { app } from "../../../scripts/app.js";
import type { ApiMode, PromptImageRead } from "@types";

interface UseEmbeddrImagesProps {
  apiBase: string;
  mode: ApiMode;
  configLoaded: boolean;
  apiClient?: EmbeddrApiClient;
  apiKey?: string;
}

export function useEmbeddrImages({
  apiBase,
  mode,
  configLoaded,
  apiClient,
  apiKey,
}: UseEmbeddrImagesProps) {
  const [images, setImages] = useState<Array<PromptImageRead>>([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const pageRef = useRef(1);
  const [hasMore, setHasMore] = useState(true);
  const [similarImageId, setSimilarImageId] = useState<string | number | null>(
    null,
  );
  const failureCountRef = useRef(0);
  const nextAllowedFetchRef = useRef(0);

  const fetchImages = useCallback(
    async (
      reset = false,
      searchQuery = "",
      viewMode: "all" | "mine" = "all",
      libraryId?: number | null,
      similarId?: string | number | null,
      collectionId?: string | null,
    ) => {
      if (!configLoaded) return;
      const now = Date.now();
      if (!reset && now < nextAllowedFetchRef.current) {
        return;
      }
      // If we are loading more pages (not reset) and already loading, skip
      if (loadingRef.current && !reset) return;

      loadingRef.current = true;
      setLoading(true);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        // Use prop apiKey first, then fallback to localStorage if needed (though prop should be source of truth)
        const currentKey = apiKey || localStorage.getItem("embeddr_api_key");
        if (currentKey) {
          headers["X-API-Key"] = currentKey;
        }

        const currentPage = reset ? 1 : pageRef.current;
        const offset = (currentPage - 1) * 20;

        let baseUrl = apiBase;
        if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
        // Ensure V2
        if (!baseUrl.endsWith("/api/v1")) {
          baseUrl = `${baseUrl}/api/v1`;
        }

        const currentSimilarId =
          similarId !== undefined ? similarId : similarImageId;

        let url = "";
        let method = "GET";
        let body: string | undefined = undefined;

        // V2 API Logic
        if (currentSimilarId) {
          // Use embeddr-search plugin for similar items
          url = `${baseUrl}/plugins/embeddr-search/similar`;
          method = "POST";
          body = JSON.stringify({
            artifact_id: currentSimilarId.toString(),
            limit: 20,
          });
        } else if (searchQuery) {
          // Use Embeddr Search Plugin (semantic text search)
          url = `${baseUrl}/plugins/embeddr-search/query`;
          method = "POST";
          body = JSON.stringify({
            query: searchQuery,
            limit: 20,
          });
        } else if (apiClient) {
          // Use apiClient for listing items, which now uses proxyFetch internally through constructor
          const list = await apiClient.artifacts.list({
            limit: 20,
            offset,
            type_name: "image",
            sort: "new",
            library_id: libraryId ? String(libraryId) : undefined,
            collection_id: collectionId || undefined,
          });

          // Helper to ensure urls are proxied even if returned from client helpers
          // The client's getContentUrl returns raw url, we must wrap it if display is needed
          const proxify = (u: string) =>
            u.startsWith("http")
              ? `/embeddr/proxy?url=${encodeURIComponent(u)}`
              : u;

          const items = list.items || [];
          const mapped = items.map((item: any) => {
            const id = item.id;
            const metadata = item.metadata_json || {};

            const rawImageUrl = apiClient.artifacts.getContentUrl(id);
            const rawThumbUrl = apiClient.artifacts.getPreviewUrl(
              id,
              "thumbnail",
            );

            return {
              id: id,
              prompt: metadata.prompt || metadata.filename || "Untitled",
              image_url: proxify(rawImageUrl),
              thumb_url: proxify(rawThumbUrl),
              created_at: item.created_at || new Date().toISOString(),
              like_count: 0,
              liked_by_me: false,
              width: metadata.width || 0,
              height: metadata.height || 0,
            };
          });

          if (reset) {
            setImages(mapped);
            pageRef.current = 2;
          } else {
            setImages((prev) => [...prev, ...mapped]);
            pageRef.current = currentPage + 1;
          }

          setHasMore(offset + mapped.length < list.total);
          return;
        } else {
          // List Artifacts (No Client Fallback - Should rarely happen if hook setup correct)
          url = `${baseUrl}/artifacts/?type_name=image&sort=new&limit=20&offset=${offset}`;
          if (libraryId) {
            url += `&library_id=${libraryId}`;
          }
          if (collectionId) {
            url += `&collection_id=${collectionId}`;
          }
        }

        let response: Response;

        // Use Proxy for all requests to avoid CORS/Auth issues in ComfyUI environment
        // The backend proxy injects the API key from server-side config
        const isComfyEnv = true; // We are in ComfyUI extension
        if (isComfyEnv && url.startsWith("http")) {
          const proxyUrl = `/embeddr/proxy?url=${encodeURIComponent(url)}`;
          response = await fetch(proxyUrl, { method, headers, body });
        } else {
          response = await fetch(url, { method, headers, body });
        }

        // Fallback for Similar Search if plugin missing (404)
        if (!response.ok && currentSimilarId && response.status === 404) {
          console.warn(
            "Embeddr Search plugin not found, falling back to latest",
          );
          url = `${baseUrl}/artifacts/?type_name=image&sort=new&limit=20&offset=${offset}`;
          method = "GET";
          body = undefined;
          response = await fetch(url, { method, headers });
        }

        // Fallback for Text Search if plugin missing (404)
        if (!response.ok && searchQuery && response.status === 404) {
          console.warn(
            "Embeddr Search plugin not found, falling back to simple search",
          );
          url = `${baseUrl}/artifacts/search?q=${encodeURIComponent(
            searchQuery,
          )}&limit=20&offset=${offset}`;
          method = "GET";
          body = undefined;
          response = await fetch(url, { method, headers });
        }

        if (response.ok) {
          const data = await response.json();
          let items: Array<any> = [];

          if (data.items) {
            // V2 Paginated Response or Search Response
            items = data.items.map((item: any) => {
              // Map V2 Artifact to PromptImageRead
              // OR Map SearchResultItem (which only has ID/Score)
              const id = item.id;
              // Check if we have metadata (Artifact) or just ID (Search)
              const isFullArtifact = !!item.uri;
              const metadata = item.metadata_json || {};

              const rawImageUrl = apiClient
                ? apiClient.artifacts.getContentUrl(id)
                : `${baseUrl}/artifacts/${id}/content`;
              const rawThumbUrl = apiClient
                ? apiClient.artifacts.getPreviewUrl(id, "thumbnail")
                : `${baseUrl}/artifacts/${id}/preview?preview_type=thumbnail`;

              return {
                id: id,
                prompt:
                  metadata.prompt ||
                  metadata.filename ||
                  (isFullArtifact ? "Untitled" : "Similar Result"),
                image_url: rawImageUrl.startsWith("http")
                  ? `/embeddr/proxy?url=${encodeURIComponent(rawImageUrl)}`
                  : rawImageUrl,
                thumb_url: rawThumbUrl.startsWith("http")
                  ? `/embeddr/proxy?url=${encodeURIComponent(rawThumbUrl)}`
                  : rawThumbUrl,
                created_at: item.created_at || new Date().toISOString(),
                like_count: 0,
                liked_by_me: false,
                width: metadata.width || 0,
                height: metadata.height || 0,
                score: item.score, // specific to search
              };
            });
            // Handle pagination check
            if (data.total !== undefined) {
              setHasMore(offset + items.length < data.total);
            } else {
              // Search plugin might return count
              setHasMore(items.length === 20);
            }
          } else if (Array.isArray(data)) {
            // Legacy Cloud API or simple array
            items = data;
            setHasMore(data.length === 20);
          }

          if (reset) {
            setImages(items);
            pageRef.current = 2;
          } else {
            setImages((prev) => [...prev, ...items]);
            pageRef.current = currentPage + 1;
          }
          failureCountRef.current = 0;
          nextAllowedFetchRef.current = 0;
        } else {
          throw new Error(`Failed to fetch images: ${response.status}`);
        }
      } catch (error) {
        console.error("Error fetching images:", error);
        failureCountRef.current += 1;
        const backoffMs = Math.min(
          60000,
          2000 * 2 ** (failureCountRef.current - 1),
        );
        nextAllowedFetchRef.current = Date.now() + backoffMs;
        if (app.extensionManager?.toast) {
          app.extensionManager.toast.add({
            severity: "error",
            summary: "Fetch Failed",
            detail:
              "Could not load images. Check your API settings and connection.",
            life: 5000,
          });
        }
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [apiBase, configLoaded, mode, similarImageId, apiKey],
  );

  return {
    images,
    loading,
    hasMore,
    fetchImages,
    similarImageId,
    setSimilarImageId,
  };
}
