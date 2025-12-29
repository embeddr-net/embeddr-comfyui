import { useEffect, useState } from "react";
import type { ApiMode, LibraryPath } from "@types";

interface UseEmbeddrLibrariesProps {
    apiBase: string;
    mode: ApiMode;
    configLoaded: boolean;
}

export function useEmbeddrLibraries({
    apiBase,
    mode,
    configLoaded,
}: UseEmbeddrLibrariesProps) {
    const [libraries, setLibraries] = useState<Array<LibraryPath>>([]);

    const fetchLibraries = async () => {
        try {
            let baseUrl = apiBase;
            if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

            const res = await fetch(`${baseUrl}/workspace/paths`);
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
            fetchLibraries();
        }
    }, [configLoaded, mode, apiBase]);

    return {
        libraries,
        fetchLibraries,
    };
}
