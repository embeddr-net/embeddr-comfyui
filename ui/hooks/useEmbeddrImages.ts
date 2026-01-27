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
}

export function useEmbeddrImages({
  apiBase,
  mode,
  configLoaded,
  apiClient,
}: UseEmbeddrImagesProps) {
  const [images, setImages] = useState<Array<PromptImageRead>>([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const pageRef = useRef(1);
  const [hasMore, setHasMore] = useState(true);
  const [similarImageId, setSimilarImageId] = useState<string | number | null>(
    null,
  );

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
      if (loadingRef.current && !reset) return;

      loadingRef.current = true;
      setLoading(true);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const storedKey = localStorage.getItem("embeddr_api_key");
        if (storedKey) {
          headers["Authorization"] = `Bearer ${storedKey}`;
        }

        const currentPage = reset ? 1 : pageRef.current;
        const offset = (currentPage - 1) * 20;

        let baseUrl = apiBase;
        if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
        // Ensure V2
        if (!baseUrl.endsWith("/api/v2")) {
          baseUrl = `${baseUrl}/api/v2`;
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
          const list = await apiClient.artifacts.list({
            limit: 20,
            offset,
            type_name: "image",
            sort: "new",
            library_id: libraryId ? String(libraryId) : undefined,
            collection_id: collectionId || undefined,
          });

          const items = list.items || [];
          const mapped = items.map((item: any) => {
            const id = item.id;
            const metadata = item.metadata_json || {};
            return {
              id: id,
              prompt: metadata.prompt || metadata.filename || "Untitled",
              image_url: apiClient.artifacts.getContentUrl(id),
              thumb_url: apiClient.artifacts.getPreviewUrl(id, "thumbnail"),
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
          // List Artifacts
          url = `${baseUrl}/artifacts/?type_name=image&sort=new&limit=20&offset=${offset}`;
          if (libraryId) {
            url += `&library_id=${libraryId}`;
          }
          if (collectionId) {
            url += `&collection_id=${collectionId}`;
          }
        }

        let response = await fetch(url, { method, headers, body });

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

              return {
                id: id,
                prompt:
                  metadata.prompt ||
                  metadata.filename ||
                  (isFullArtifact ? "Untitled" : "Similar Result"),
                image_url: apiClient
                  ? apiClient.artifacts.getContentUrl(id)
                  : `${baseUrl}/artifacts/${id}/content`,
                thumb_url: apiClient
                  ? apiClient.artifacts.getPreviewUrl(id, "thumbnail")
                  : `${baseUrl}/artifacts/${id}/preview?preview_type=thumbnail`,
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
        } else {
          throw new Error(`Failed to fetch images: ${response.status}`);
        }
      } catch (error) {
        console.error("Error fetching images:", error);
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
    [apiBase, configLoaded, mode, similarImageId],
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
