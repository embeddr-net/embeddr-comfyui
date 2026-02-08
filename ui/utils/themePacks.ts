import { proxyFetch } from "./proxyFetch";

export type ThemePackTokens = {
  light?: Record<string, string>;
  dark?: Record<string, string>;
};

export type ThemePack = {
  id: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  preview?: string;
  iconUrl?: string;
  bannerUrl?: string;
  tokens?: ThemePackTokens;
  css?: string;
  cssUrl?: string;
  icon?: string;
  banner?: string;
  cssFile?: string;
};

export type ThemePackIndex = {
  packs: ThemePack[];
};

const THEME_STYLE_ID = "embeddr-theme-pack-css";

const buildThemeUrl = (apiBase: string) => {
  const trimmed = apiBase.replace(/\/+$/, "");
  if (/\/api\/v1$/.test(trimmed)) {
    return `${trimmed}/themes`;
  }
  return `${trimmed}/api/v1/themes`;
};

const resolveAssetBase = (apiBase: string) => {
  const trimmed = apiBase.replace(/\/+$/, "");
  return trimmed.replace(/\/api\/v1$/, "");
};

export async function loadThemePacks(apiBase: string): Promise<ThemePack[]> {
  const packs = new Map<string, ThemePack>();

  const addPack = (pack?: ThemePack) => {
    if (!pack?.id) return;
    packs.set(pack.id, pack);
  };

  const addIndex = (index?: ThemePackIndex) => {
    if (!index?.packs) return;
    index.packs.forEach((pack) => addPack(pack));
  };

  const themeUrl = buildThemeUrl(apiBase);
  const assetBase = resolveAssetBase(apiBase);

  const res = await proxyFetch(themeUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Theme pack fetch failed (${res.status})`);
  }

  const data = (await res.json()) as ThemePackIndex;
  const normalized: ThemePackIndex = {
    packs: (data.packs || []).map((pack) => {
      const iconUrl =
        pack.iconUrl ||
        (pack.icon ? `${assetBase}/themes/${pack.id}/${pack.icon}` : undefined);
      const bannerUrl =
        pack.bannerUrl ||
        (pack.banner
          ? `${assetBase}/themes/${pack.id}/${pack.banner}`
          : undefined);
      const cssUrl =
        pack.cssUrl ||
        (pack.cssFile
          ? `${assetBase}/themes/${pack.id}/${pack.cssFile}`
          : undefined);

      return {
        ...pack,
        iconUrl:
          iconUrl && iconUrl.startsWith("/")
            ? `${assetBase}${iconUrl}`
            : iconUrl,
        bannerUrl:
          bannerUrl && bannerUrl.startsWith("/")
            ? `${assetBase}${bannerUrl}`
            : bannerUrl,
        cssUrl:
          cssUrl && cssUrl.startsWith("/") ? `${assetBase}${cssUrl}` : cssUrl,
      };
    }),
  };

  addIndex(normalized);
  return Array.from(packs.values());
}

export function applyThemePackCss(pack?: ThemePack | null) {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(THEME_STYLE_ID);
  if (existing?.parentElement) {
    existing.parentElement.removeChild(existing);
  }

  if (!pack) return;

  if (pack.css) {
    const style = document.createElement("style");
    style.id = THEME_STYLE_ID;
    style.textContent = pack.css;
    document.head.appendChild(style);
    return;
  }

  if (pack.cssUrl) {
    const link = document.createElement("link");
    link.id = THEME_STYLE_ID;
    link.rel = "stylesheet";
    link.href = pack.cssUrl;
    document.head.appendChild(link);
  }
}

export function applyThemePackTokens(
  targets: HTMLElement[],
  pack: ThemePack | null | undefined,
  mode: "light" | "dark",
) {
  if (!pack?.tokens) return [] as string[];
  const tokens =
    (mode === "dark" ? pack.tokens.dark : pack.tokens.light) ||
    pack.tokens.light ||
    pack.tokens.dark;
  if (!tokens) return [] as string[];
  const keys = Object.keys(tokens);
  targets.forEach((target) => {
    Object.entries(tokens).forEach(([key, value]) => {
      if (typeof value !== "string") return;
      target.style.setProperty(key, value);
    });
  });
  return keys;
}

export function clearThemePackTokens(targets: HTMLElement[], keys: string[]) {
  if (!keys.length) return;
  targets.forEach((target) => {
    keys.forEach((key) => target.style.removeProperty(key));
  });
}
