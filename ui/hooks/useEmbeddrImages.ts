import { useCallback, useRef, useState } from "react";
import type { EmbeddrApiClient } from "@embeddr/client-typescript";
// @ts-ignore
import { app } from "../../../scripts/app.js";
import type { ApiMode, PromptImageRead } from "@types";

const PAGE_SIZE = 20;

const proxifyImageUrl = (url: string) =>
  url.startsWith("http")
    ? `/embeddr/proxy?url=${encodeURIComponent(url)}`
    : url;

const normalizePromptImage = (
  item: any,
  getContentUrl: (id: string | number) => string,
  getPreviewUrl: (id: string | number) => string,
): PromptImageRead => {
  const id = item.id;
  const metadata = item.metadata_json || {};
  return {
    id,
    prompt: metadata.prompt || metadata.filename || metadata.name || "Untitled",
    image_url: proxifyImageUrl(getContentUrl(id)),
    thumb_url: proxifyImageUrl(getPreviewUrl(id)),
    created_at: item.created_at || new Date().toISOString(),
    like_count: 0,
    liked_by_me: false,
    width: metadata.width || 0,
    height: metadata.height || 0,
    filename: metadata.filename,
  };
};

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
        const offset = (currentPage - 1) * PAGE_SIZE;

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
        const fetchWithProxy = async (targetUrl: string, init?: RequestInit) => {
          const isComfyEnv = true;
          if (isComfyEnv && targetUrl.startsWith("http")) {
            return fetch(`/embeddr/proxy?url=${encodeURIComponent(targetUrl)}`, init);
          }
          return fetch(targetUrl, init);
        };

        const fetchArtifactsByIds = async (ids: Array<string | number>) => {
          if (!ids.length) return [];
          if (apiClient) {
            const listed = await apiClient.artifacts.list({
              ids: ids.map((id) => String(id)),
              limit: ids.length,
              media_type: "image",
            });
            return Array.isArray(listed.items) ? listed.items : [];
          }

          const params = new URLSearchParams();
          params.set("limit", String(ids.length));
          params.set("media_type", "image");
          ids.forEach((id) => params.append("ids", String(id)));
          const listedResponse = await fetchWithProxy(`${baseUrl}/artifacts/?${params.toString()}`, {
            method: "GET",
            headers,
          });
          if (!listedResponse.ok) {
            throw new Error(`Failed to fetch artifacts: ${listedResponse.status}`);
          }
          const listed = await listedResponse.json();
          return Array.isArray(listed?.items) ? listed.items : [];
        };

        const mapArtifacts = (artifactItems: Array<any>) =>
          artifactItems.map((item) =>
            normalizePromptImage(
              item,
              (id) =>
                apiClient
                  ? apiClient.artifacts.getContentUrl(id)
                  : `${baseUrl}/artifacts/${id}/content`,
              (id) =>
                apiClient
                  ? apiClient.artifacts.getPreviewUrl(id, "thumbnail")
                  : `${baseUrl}/artifacts/${id}/content?preview_type=thumbnail`,
            ),
          );

        // V2 API Logic
        if (currentSimilarId) {
          // Use embeddr-search plugin for similar items
          url = `${baseUrl}/plugins/embeddr-search/similar`;
          method = "POST";
          body = JSON.stringify({
            artifact_id: currentSimilarId.toString(),
            limit: PAGE_SIZE,
            offset,
            skip: offset,
          });
        } else if (searchQuery) {
          // Use Embeddr Search Plugin (semantic text search)
          url = `${baseUrl}/plugins/embeddr-search/query`;
          method = "POST";
          body = JSON.stringify({
            query: searchQuery,
            limit: PAGE_SIZE,
            offset,
            skip: offset,
          });
        } else if (apiClient) {
          // Use apiClient for listing items, which now uses proxyFetch internally through constructor
          const list = await apiClient.artifacts.list({
            limit: PAGE_SIZE,
            offset,
            media_type: "image",
            sort: "new",
            library_id: libraryId ? String(libraryId) : undefined,
            collection_id: collectionId || undefined,
          });
          const mapped = mapArtifacts(list.items || []);

          if (reset) {
            setImages(mapped);
            pageRef.current = 2;
          } else {
            setImages((prev) => [...prev, ...mapped]);
            pageRef.current = currentPage + 1;
          }

          const total =
            typeof list.count === "number"
              ? list.count
              : typeof list.total === "number"
                ? list.total
                : undefined;
          setHasMore(
            typeof total === "number"
              ? offset + mapped.length < total
              : mapped.length === PAGE_SIZE,
          );
          return;
        } else {
          // List Artifacts (No Client Fallback - Should rarely happen if hook setup correct)
          url = `${baseUrl}/artifacts/?media_type=image&sort=new&limit=${PAGE_SIZE}&offset=${offset}`;
          if (libraryId) {
            url += `&library_id=${libraryId}`;
          }
          if (collectionId) {
            url += `&collection_id=${collectionId}`;
          }
        }

        let response = await fetchWithProxy(url, { method, headers, body });

        // Fallback for Similar Search if plugin missing (404)
        if (!response.ok && currentSimilarId && response.status === 404) {
          console.warn(
            "Embeddr Search plugin not found, falling back to latest",
          );
          url = `${baseUrl}/artifacts/?media_type=image&sort=new&limit=${PAGE_SIZE}&offset=${offset}`;
          method = "GET";
          body = undefined;
          response = await fetchWithProxy(url, { method, headers });
        }

        // Fallback for Text Search if plugin missing (404)
        if (!response.ok && searchQuery && response.status === 404) {
          console.warn(
            "Embeddr Search plugin not found, falling back to simple search",
          );
          url = `${baseUrl}/artifacts/search?q=${encodeURIComponent(
            searchQuery,
          )}&limit=${PAGE_SIZE}&offset=${offset}`;
          method = "GET";
          body = undefined;
          response = await fetchWithProxy(url, { method, headers });
        }

        if (response.ok) {
          const data = await response.json();
          let items: Array<PromptImageRead> = [];

          if (data.items) {
            const rawItems = Array.isArray(data.items) ? data.items : [];
            const artifactIds = rawItems
              .map((item: any) => item?.id ?? item?.artifact_id)
              .filter((id: unknown): id is string | number => Boolean(id));
            const needsArtifactLookup = rawItems.some(
              (item: any) => !item?.uri && !item?.metadata_json,
            );
            let artifactItems = rawItems;
            if (needsArtifactLookup && artifactIds.length) {
              const resolvedItems = await fetchArtifactsByIds(artifactIds);
              const byId = new Map(
                resolvedItems.map((item: any) => [String(item.id), item]),
              );
              artifactItems = artifactIds
                .map((id) => byId.get(String(id)))
                .filter(Boolean);
            }

            items = mapArtifacts(artifactItems);
            const total =
              typeof data.count === "number"
                ? data.count
                : typeof data.total === "number"
                  ? data.total
                  : undefined;
            setHasMore(
              typeof total === "number"
                ? offset + artifactIds.length < total
                : rawItems.length === PAGE_SIZE,
            );
          } else if (Array.isArray(data)) {
            // Legacy Cloud API or simple array
            items = data;
            setHasMore(data.length === PAGE_SIZE);
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
    [apiBase, apiClient, configLoaded, mode, similarImageId, apiKey],
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
