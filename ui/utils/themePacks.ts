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
  packs: Array<ThemePack>;
};

const THEME_STYLE_ID = "embeddr-theme-pack-css";
const THEME_BRIDGE_STYLE_ID = "embeddr-theme-pack-bridge";

const TOKEN_FALLBACKS: Record<string, Array<string>> = {
  "--background": ["--base-background", "--bg-color", "--content-bg"],
  "--foreground": ["--base-foreground", "--fg-color", "--content-fg"],
  "--primary": ["--primary-background", "--brand-blue", "--accent-primary"],
  "--primary-foreground": ["--button-surface-contrast", "--base-foreground"],
  "--secondary": ["--secondary-background", "--component-node-widget-background"],
  "--secondary-foreground": ["--component-node-foreground", "--foreground"],
  "--muted": ["--muted-background", "--component-node-widget-background"],
  "--muted-foreground": ["--text-secondary", "--component-node-foreground-secondary"],
  "--accent": ["--accent-background", "--component-node-surface"],
  "--accent-foreground": ["--component-node-foreground", "--foreground"],
  "--border": ["--border-default", "--node-component-border"],
  "--input": ["--input-surface", "--component-node-widget-background"],
  "--card": ["--component-node-background", "--node-component-surface"],
  "--card-foreground": ["--component-node-foreground", "--foreground"],
};

const COMFY_MAPPINGS: Array<[string, Array<string>]> = [
  ["--component-node-background", ["--card", "--background"]],
  ["--component-node-border", ["--border", "--node-component-border"]],
  ["--component-node-foreground", ["--card-foreground", "--foreground"]],
  ["--component-node-foreground-secondary", ["--muted-foreground"]],
  ["--component-node-widget-background", ["--secondary", "--input"]],
  ["--component-node-widget-background-hovered", ["--accent", "--secondary"]],
  ["--component-node-widget-background-selected", ["--accent", "--primary"]],
  ["--component-node-widget-background-highlighted", ["--ring", "--primary"]],
  ["--node-component-header-surface", ["--card", "--background"]],
  ["--node-component-slot-text", ["--muted-foreground", "--foreground"]],
  ["--node-component-border", ["--border"]],
  ["--node-component-ring", ["--ring", "--primary"]],
  ["--base-background", ["--background"]],
  ["--base-foreground", ["--foreground"]],
  ["--primary-background", ["--primary"]],
  ["--primary-background-hover", ["--accent", "--primary"]],
  ["--secondary-background", ["--secondary"]],
  ["--secondary-background-hover", ["--accent", "--secondary"]],
  ["--secondary-background-selected", ["--accent", "--primary"]],
  ["--input-surface", ["--input", "--secondary"]],
  ["--text-primary", ["--foreground"]],
  ["--text-secondary", ["--muted-foreground", "--foreground"]],
  ["--bg-color", ["--background"]],
  ["--fg-color", ["--foreground"]],
  ["--p-primary-color", ["--primary"]],
  ["--p-primary-hover-color", ["--primary-background-hover", "--accent", "--primary"]],
  ["--p-primary-active-color", ["--primary-background-hover", "--accent", "--primary"]],
  ["--p-primary-contrast-color", ["--primary-foreground", "--foreground"]],
  ["--p-surface-0", ["--background"]],
  ["--p-surface-100", ["--card", "--secondary"]],
  ["--p-surface-200", ["--secondary"]],
  ["--p-surface-300", ["--secondary-background-hover", "--accent"]],
  ["--p-surface-400", ["--secondary-background-selected", "--accent"]],
  ["--p-surface-500", ["--muted"]],
  ["--p-surface-600", ["--secondary-background-hover", "--accent"]],
  ["--p-surface-700", ["--card", "--background"]],
  ["--p-surface-800", ["--background"]],
  ["--p-surface-900", ["--background"]],
  ["--p-surface-950", ["--background"]],
  ["--p-content-background", ["--card", "--background"]],
  ["--p-content-color", ["--foreground"]],
  ["--p-text-color", ["--foreground"]],
  ["--p-text-muted-color", ["--muted-foreground"]],
  ["--p-button-primary-background", ["--primary"]],
  ["--p-button-primary-hover-background", ["--primary-background-hover", "--accent", "--primary"]],
  ["--p-button-primary-active-background", ["--primary-background-hover", "--accent", "--primary"]],
  ["--p-button-primary-border-color", ["--primary"]],
  [
    "--p-button-primary-hover-border-color",
    ["--primary-background-hover", "--accent", "--primary"],
  ],
  [
    "--p-button-primary-active-border-color",
    ["--primary-background-hover", "--accent", "--primary"],
  ],
  ["--p-button-primary-color", ["--primary-foreground", "--foreground"]],
  ["--p-button-primary-hover-color", ["--primary-foreground", "--foreground"]],
  ["--p-button-primary-active-color", ["--primary-foreground", "--foreground"]],
  ["--p-button-secondary-background", ["--secondary"]],
  ["--p-button-secondary-hover-background", ["--accent", "--secondary"]],
  ["--p-button-secondary-active-background", ["--accent", "--secondary"]],
  ["--p-button-secondary-border-color", ["--border"]],
  ["--p-button-secondary-hover-border-color", ["--border"]],
  ["--p-button-secondary-active-border-color", ["--border"]],
  ["--p-button-secondary-color", ["--secondary-foreground", "--foreground"]],
  ["--p-button-secondary-hover-color", ["--secondary-foreground", "--foreground"]],
  ["--p-button-secondary-active-color", ["--secondary-foreground", "--foreground"]],
  ["--p-togglebutton-background", ["--secondary", "--input"]],
  ["--p-togglebutton-border-color", ["--border"]],
  ["--p-togglebutton-color", ["--foreground"]],
  ["--p-togglebutton-hover-background", ["--accent", "--secondary"]],
  ["--p-togglebutton-hover-border-color", ["--border"]],
  ["--p-togglebutton-hover-color", ["--foreground"]],
  ["--p-togglebutton-checked-background", ["--primary-background-hover", "--accent", "--primary"]],
  [
    "--p-togglebutton-checked-border-color",
    ["--primary-background-hover", "--accent", "--primary"],
  ],
  ["--p-togglebutton-checked-color", ["--foreground"]],
  [
    "--p-togglebutton-checked-hover-background",
    ["--primary-background-hover", "--accent", "--primary"],
  ],
  [
    "--p-togglebutton-checked-hover-border-color",
    ["--primary-background-hover", "--accent", "--primary"],
  ],
  ["--p-togglebutton-checked-hover-color", ["--foreground"]],
  ["--p-form-field-background", ["--input", "--secondary"]],
  ["--p-form-field-color", ["--foreground"]],
  ["--p-form-field-border-color", ["--border"]],
  ["--p-form-field-placeholder-color", ["--muted-foreground"]],
];

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

export async function loadThemePacks(apiBase: string): Promise<Array<ThemePack>> {
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
        pack.iconUrl || (pack.icon ? `${assetBase}/themes/${pack.id}/${pack.icon}` : undefined);
      const bannerUrl =
        pack.bannerUrl ||
        (pack.banner ? `${assetBase}/themes/${pack.id}/${pack.banner}` : undefined);
      const cssUrl =
        pack.cssUrl ||
        (pack.cssFile ? `${assetBase}/themes/${pack.id}/${pack.cssFile}` : undefined);

      return {
        ...pack,
        iconUrl: iconUrl && iconUrl.startsWith("/") ? `${assetBase}${iconUrl}` : iconUrl,
        bannerUrl: bannerUrl && bannerUrl.startsWith("/") ? `${assetBase}${bannerUrl}` : bannerUrl,
        cssUrl: cssUrl && cssUrl.startsWith("/") ? `${assetBase}${cssUrl}` : cssUrl,
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
    // Cross-origin <link rel=stylesheet> from ComfyUI's origin (8188) to the
    // embeddr-cli (8003) is blocked by CORS in some setups. Fetch through the
    // ComfyUI proxy (same-origin) and inject the CSS text inline so the
    // browser never has to resolve the cross-origin reference itself.
    const style = document.createElement("style");
    style.id = THEME_STYLE_ID;
    document.head.appendChild(style);
    proxyFetch(pack.cssUrl, { cache: "no-store" })
      .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
      .then((text) => {
        style.textContent = text;
      })
      .catch((err) => {
        // Fall back to direct link — this works if CORS is open.
        if (style.parentElement) style.parentElement.removeChild(style);
        const link = document.createElement("link");
        link.id = THEME_STYLE_ID;
        link.rel = "stylesheet";
        link.href = pack.cssUrl;
        document.head.appendChild(link);

        console.warn(
          "[themePacks] proxyFetch failed for theme css, falling back to direct link",
          err,
        );
      });
  }
}

function selectTokenValue(
  tokenMap: Record<string, string>,
  keys: Array<string>,
): string | undefined {
  for (const key of keys) {
    const value = tokenMap[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function resolveThemeTokens(pack: ThemePack | null | undefined, mode: "light" | "dark") {
  if (!pack?.tokens) return null;
  const rawTokens =
    (mode === "dark" ? pack.tokens.dark : pack.tokens.light) ||
    pack.tokens.light ||
    pack.tokens.dark;
  if (!rawTokens) return null;

  const normalizedTokens = Object.fromEntries(
    Object.entries(rawTokens).filter((entry): entry is [string, string] => {
      const [key, value] = entry;
      return typeof key === "string" && typeof value === "string";
    }),
  );

  const withFallbacks: Record<string, string> = { ...normalizedTokens };
  Object.entries(TOKEN_FALLBACKS).forEach(([target, fallbackKeys]) => {
    if (withFallbacks[target]) return;
    const resolved = selectTokenValue(withFallbacks, fallbackKeys);
    if (resolved) {
      withFallbacks[target] = resolved;
    }
  });

  const translatedTokens: Record<string, string> = {};
  COMFY_MAPPINGS.forEach(([target, candidateKeys]) => {
    const resolved = selectTokenValue(withFallbacks, candidateKeys);
    if (resolved) {
      translatedTokens[target] = resolved;
    }
  });

  return {
    ...translatedTokens,
    ...withFallbacks,
  };
}

export function applyThemePackTokens(
  targets: Array<HTMLElement>,
  pack: ThemePack | null | undefined,
  mode: "light" | "dark",
) {
  const tokens = resolveThemeTokens(pack, mode);
  if (!tokens) return [] as Array<string>;
  const keys = Object.keys(tokens);
  targets.forEach((target) => {
    Object.entries(tokens).forEach(([key, value]) => {
      if (typeof value !== "string") return;
      target.style.setProperty(key, value);
    });
  });
  return keys;
}

export function clearThemePackTokens(targets: Array<HTMLElement>, keys: Array<string>) {
  if (!keys.length) return;
  targets.forEach((target) => {
    keys.forEach((key) => target.style.removeProperty(key));
  });
}

export function applyThemePackComfyBridge(enabled: boolean) {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(THEME_BRIDGE_STYLE_ID);
  if (existing?.parentElement) {
    existing.parentElement.removeChild(existing);
  }
  if (!enabled) return;

  const style = document.createElement("style");
  style.id = THEME_BRIDGE_STYLE_ID;
  style.textContent = `
html[data-embeddr-theme-pack] .lg-node,
html[data-embeddr-theme-pack] .comfy-menu,
html[data-embeddr-theme-pack] .comfyui-body-top,
html[data-embeddr-theme-pack] .comfyui-body-bottom {
  background: var(--component-node-background, var(--card, var(--background))) !important;
  color: var(--component-node-foreground, var(--foreground)) !important;
  border-color: var(--component-node-border, var(--border)) !important;
}

html[data-embeddr-theme-pack] .lg-node {
  border-radius: var(--radius-2xl) !important;
}

html[data-embeddr-theme-pack] .lg-node-header {
  background: var(--node-component-header-surface, var(--component-node-background, var(--card))) !important;
  color: var(--node-component-slot-text, var(--foreground)) !important;
  border-color: var(--component-node-border, var(--border)) !important;
  border-radius: var(--radius-2xl) var(--radius-2xl) 0 0 !important;
}

html[data-embeddr-theme-pack] .lg-node > [data-testid^="node-body-"] {
  background: var(--component-node-background, var(--card, var(--background))) !important;
  border-radius: 0 0 var(--radius-2xl) var(--radius-2xl) !important;
}

html[data-embeddr-theme-pack] [data-testid="node-state-outline-overlay"] {
  border-color: var(--primary-background, var(--primary)) !important;
  border-radius: calc(var(--radius-2xl) + 3px) !important;
}

html[data-embeddr-theme-pack] .text-node-component-slot-text,
html[data-embeddr-theme-pack] .node-title,
html[data-embeddr-theme-pack] .comfy-menu button,
html[data-embeddr-theme-pack] .comfy-menu label {
  color: var(--node-component-slot-text, var(--foreground)) !important;
}

html[data-embeddr-theme-pack] .p-button.p-button-primary,
html[data-embeddr-theme-pack] .p-splitbutton .p-button-primary {
  background: var(--p-button-primary-background, var(--primary-background, var(--primary))) !important;
  border-color: var(--p-button-primary-border-color, var(--primary-background, var(--primary))) !important;
  color: var(--p-button-primary-color, var(--primary-foreground, var(--foreground))) !important;
}

html[data-embeddr-theme-pack] .p-button.p-button-primary:hover,
html[data-embeddr-theme-pack] .p-splitbutton .p-button-primary:hover {
  background: var(--p-button-primary-hover-background, var(--primary-background-hover, var(--primary-background, var(--primary)))) !important;
  border-color: var(--p-button-primary-hover-border-color, var(--primary-background-hover, var(--primary-background, var(--primary)))) !important;
}

html[data-embeddr-theme-pack] .p-togglebutton,
html[data-embeddr-theme-pack] .p-togglebutton .p-togglebutton-content {
  color: var(--p-togglebutton-color, var(--foreground)) !important;
}

html[data-embeddr-theme-pack] .p-togglebutton.p-togglebutton-checked,
html[data-embeddr-theme-pack] .p-togglebutton.p-togglebutton-checked .p-togglebutton-content,
html[data-embeddr-theme-pack] .p-togglebutton.p-togglebutton-checked:hover,
html[data-embeddr-theme-pack] .p-togglebutton.p-togglebutton-checked:focus,
html[data-embeddr-theme-pack] .p-togglebutton.p-togglebutton-checked:active {
  background: var(--p-togglebutton-checked-background, var(--primary-background-hover, var(--accent, var(--primary)))) !important;
  border-color: var(--p-togglebutton-checked-border-color, var(--primary-background-hover, var(--accent, var(--primary)))) !important;
  color: var(--p-togglebutton-checked-color, var(--foreground)) !important;
}

html[data-embeddr-theme-pack] .p-inputtext,
html[data-embeddr-theme-pack] .p-select,
html[data-embeddr-theme-pack] .p-inputnumber-input {
  background: var(--p-form-field-background, var(--input-surface, var(--input))) !important;
  border-color: var(--p-form-field-border-color, var(--border)) !important;
  color: var(--p-form-field-color, var(--foreground)) !important;
}
`;
  document.head.appendChild(style);
}
