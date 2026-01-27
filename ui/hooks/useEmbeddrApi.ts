import { useMemo } from "react";
import { EmbeddrApiClient } from "@embeddr/api";
import { useEmbeddrSettings } from "./useEmbeddrSettings";
import { useEmbeddrLibraries } from "./useEmbeddrLibraries";
import { useEmbeddrImages } from "./useEmbeddrImages";
import {
  useEmbeddrCollections,
  type Collection,
} from "./useEmbeddrCollections";
import type { ApiMode, LibraryPath, PromptImageRead } from "@types";

export type { PromptImageRead, LibraryPath, ApiMode, Collection };

interface UseEmbeddrApiProps {
  baseUrl?: string;
}

export function useEmbeddrApi({
  baseUrl = "http://localhost:8003",
}: UseEmbeddrApiProps = {}) {
  const settings = useEmbeddrSettings({ baseUrl });

  const apiClient = useMemo(
    () => new EmbeddrApiClient({ baseUrl: settings.apiBase }),
    [settings.apiBase],
  );

  const libraries = useEmbeddrLibraries({
    apiBase: settings.apiBase,
    mode: settings.mode,
    configLoaded: settings.configLoaded,
  });

  const images = useEmbeddrImages({
    apiBase: settings.apiBase,
    mode: settings.mode,
    configLoaded: settings.configLoaded,
    apiClient,
  });

  const collections = useEmbeddrCollections({
    apiBase: settings.apiBase,
    configLoaded: settings.configLoaded,
    apiClient,
  });

  return {
    ...settings,
    apiClient,
    ...libraries,
    ...images,
    ...collections,
  };
}
