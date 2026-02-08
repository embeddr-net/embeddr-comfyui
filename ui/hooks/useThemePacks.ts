import { useCallback, useEffect, useState } from "react";
import { loadThemePacks, type ThemePack } from "../utils/themePacks";

export function useThemePacks(apiBase: string, enabled = true) {
  const [packs, setPacks] = useState<ThemePack[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !apiBase) return;
    setIsLoading(true);
    try {
      const data = await loadThemePacks(apiBase);
      setPacks(data);
    } catch {
      setPacks([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { packs, isLoading, reload };
}
