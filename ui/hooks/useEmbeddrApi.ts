import { useEmbeddrSettings } from "./useEmbeddrSettings";
import { useEmbeddrLibraries } from "./useEmbeddrLibraries";
import { useEmbeddrImages } from "./useEmbeddrImages";
import type { ApiMode, LibraryPath, PromptImageRead } from "@types";

export type { PromptImageRead, LibraryPath, ApiMode };

interface UseEmbeddrApiProps {
    baseUrl?: string;
}

export function useEmbeddrApi({
    baseUrl = "http://localhost:8003",
}: UseEmbeddrApiProps = {}) {
    const settings = useEmbeddrSettings({ baseUrl });

    const libraries = useEmbeddrLibraries({
        apiBase: settings.apiBase,
        mode: settings.mode,
        configLoaded: settings.configLoaded,
    });

    const images = useEmbeddrImages({
        apiBase: settings.apiBase,
        mode: settings.mode,
        configLoaded: settings.configLoaded,
    });

    return {
        ...settings,
        ...libraries,
        ...images,
    };
}
