import { useCallback, useState } from "react";
// @ts-ignore
import { app } from "../../../scripts/app.js";
import type { ApiMode, PromptImageRead } from "@types";

interface UseEmbeddrImagesProps {
    apiBase: string;
    mode: ApiMode;
    configLoaded: boolean;
}

export function useEmbeddrImages({
    apiBase,
    mode,
    configLoaded,
}: UseEmbeddrImagesProps) {
    const [images, setImages] = useState<Array<PromptImageRead>>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [similarImageId, setSimilarImageId] = useState<number | null>(null);

    const fetchImages = useCallback(
        async (
            reset = false,
            searchQuery = "",
            viewMode: "all" | "mine" = "all",
            libraryId?: number | null,
            similarId?: number | null
        ) => {
            if (!configLoaded) return;
            if (loading && !reset) return;

            setLoading(true);
            try {
                const headers: Record<string, string> = {};
                const storedKey = localStorage.getItem("embeddr_api_key");
                if (storedKey) {
                    headers["Authorization"] = `Bearer ${storedKey}`;
                }

                const currentPage = reset ? 1 : page;
                const offset = (currentPage - 1) * 20;

                let baseUrl = apiBase;
                if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

                let url;
                const currentSimilarId =
                    similarId !== undefined ? similarId : similarImageId;

                if (currentSimilarId) {
                    url = `${baseUrl}/images/${currentSimilarId}/similar?limit=20&skip=${offset}`;
                    if (libraryId) {
                        url += `&library_id=${libraryId}`;
                    }
                } else if (mode === "local") {
                    // Local API
                    url = `${baseUrl}/images?limit=20&skip=${offset}`;
                    if (libraryId) {
                        url += `&library_id=${libraryId}`;
                    }
                }

                if (searchQuery) {
                    url += `&q=${encodeURIComponent(searchQuery)}`;
                }

                const response = await fetch(url, { headers });

                if (response.ok) {
                    const data = await response.json();
                    let items: Array<any> = [];

                    if (mode === "local") {
                        // Local API returns { items: [], total: ... }
                        items = data.items.map((item: any) => ({
                            id: item.id,
                            prompt: item.prompt, // Use filename as prompt for now
                            image_url: `${baseUrl}/images/${item.id}/file`,
                            thumb_url: `${baseUrl}/images/${item.id}/thumbnail`,
                            created_at: item.created_at,
                            like_count: 0,
                            liked_by_me: false,
                            // Local specific
                            filename: item.filename,
                            path: item.path,
                            width: item.width,
                            height: item.height,
                        }));
                        setHasMore(items.length === 20); // Simple check
                    } else {
                        // Cloud API returns array
                        items = data;
                        setHasMore(data.length === 20);
                    }

                    if (reset) {
                        setImages(items);
                    } else {
                        setImages((prev) => [...prev, ...items]);
                    }
                    setPage(currentPage + 1);
                } else {
                    throw new Error("Failed to fetch images");
                }
            } catch (error) {
                console.error("Error fetching images:", error);
                if (app.extensionManager?.toast) {
                    app.extensionManager.toast.add({
                        severity: "error",
                        summary: "Fetch Failed",
                        detail: "Could not load images. Check your API settings and connection.",
                        life: 5000,
                    });
                }
            } finally {
                setLoading(false);
            }
        },
        [apiBase, loading, page, configLoaded, mode, similarImageId]
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
