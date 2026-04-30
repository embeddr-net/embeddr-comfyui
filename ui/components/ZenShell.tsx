import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useEmbeddrAPI } from "@embeddr/react-ui/context";
import {
  CoreUIEventBridge,
  DynamicPluginComponent,
  EmbeddrProvider,
  PluginErrorBoundary,
  ZenDraggablePanel,
  ZenPanelManagerCore,
  ZenWebSocketProvider,
  globalEventBus,
  loadExternalPlugins,
  usePluginRegistry,
  useZenWindowStore,
} from "@embeddr/zen-shell";
import {
  AppWindow,
  ExternalLink,
  LayoutTemplate,
  Minimize2,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@embeddr/react-ui/components/ui";
import { Badge, Input, ScrollArea, Separator, cn } from "@embeddr/react-ui";
import { useEmbeddrApi } from "../hooks/useEmbeddrApi";
import type { PluginLoaderAdapter, ZenWindowRendererProps } from "@embeddr/zen-shell";
import type { EmbeddrAPI } from "@embeddr/react-ui/types";

const PANEL_SAFE_AREA = { top: 8, right: 8, bottom: 8, left: 8 };

type PersistedZenWindowStore = typeof useZenWindowStore & {
  persist?: {
    hasHydrated?: () => boolean;
    onFinishHydration?: (listener: () => void) => () => void;
  };
};

const zenWindowStoreWithPersist = useZenWindowStore;

type LauncherComponentEntry = {
  pluginId: string;
  pluginLabel: string;
  componentId: string;
  title: string;
  subtitle: string;
  component: any;
};

type LauncherWindowEntry = {
  id: string;
  title: string;
  subtitle: string;
  componentId: string;
  groupHostId?: string;
  isPinned: boolean;
  tabsCount: number;
  orderIndex: number;
};

type LauncherSearchResult =
  | {
      key: string;
      kind: "open";
      score: number;
      entry: LauncherWindowEntry;
    }
  | {
      key: string;
      kind: "minimized";
      score: number;
      entry: LauncherWindowEntry;
    }
  | {
      key: string;
      kind: "component";
      score: number;
      entry: LauncherComponentEntry;
    };

function normalizeLauncherText(value: string) {
  return value.toLowerCase().trim();
}

function scoreLauncherMatch(values: Array<string | undefined>, query: string) {
  const normalizedQuery = normalizeLauncherText(query);
  if (!normalizedQuery) return 1;

  const haystacks = values.map((value) => normalizeLauncherText(value || ""));
  if (haystacks.some((value) => value === normalizedQuery)) return 100;
  if (haystacks.some((value) => value.startsWith(normalizedQuery))) return 80;
  if (haystacks.some((value) => value.includes(normalizedQuery))) return 60;
  return 0;
}

// Helper to resolve component ID to plugin and component name
function resolveComponentId(fullId: string, plugins: Record<string, any>) {
  if (!fullId) return null;

  // Try longest prefix match for pluginId
  let bestPid: string | null = null;
  for (const pid of Object.keys(plugins)) {
    // Exact match check (for simple ID cases)
    if (fullId === pid) {
      if (!bestPid || pid.length > bestPid.length) bestPid = pid;
    }
    // Prefix match
    const prefix = pid + "-";
    if (fullId.startsWith(prefix)) {
      if (!bestPid || pid.length > bestPid.length) bestPid = pid;
    }
  }

  if (!bestPid) return null;

  const localId = fullId.slice(bestPid.length + 1);
  const plugin = plugins[bestPid];

  // If localId is empty, it might be the main/default component
  const compDef = plugin.components?.find(
    (c: any) =>
      c.name === localId ||
      c.component === localId ||
      c.exportName === localId ||
      (!localId && c.name === "main"),
  );

  return {
    pluginId: bestPid,
    componentName: compDef?.exportName || compDef?.component || localId,
    def: compDef,
  };
}

const CustomWindowRenderer = React.memo((props: ZenWindowRendererProps) => {
  const { id, windowState, isActive } = props;
  const { plugins } = usePluginRegistry();
  const baseApi = useEmbeddrAPI();
  const updateWindow = useZenWindowStore((s) => s.updateWindow);

  const resolved = useMemo(
    () => resolveComponentId(windowState.componentId, plugins),
    [windowState.componentId, plugins],
  );
  const panelProps = useMemo(
    () => ({
      ...(resolved?.def?.props ?? {}),
      ...(windowState.props ?? {}),
    }),
    [resolved?.def?.props, windowState.props],
  );

  const handleClose = useCallback(() => {
    useZenWindowStore.getState().closeWindow(id);
  }, [id]);

  const handleFocus = useCallback(() => {
    useZenWindowStore.getState().bringToFront(id);
  }, [id]);

  const handleMinimize = useCallback(() => {
    useZenWindowStore.getState().minimizeWindow(id);
  }, [id]);

  const handlePinChange = useCallback(() => {
    useZenWindowStore.getState().togglePin(id);
  }, [id]);

  const defaultPosition = windowState.position || panelProps.defaultPosition || { x: 100, y: 100 };
  const defaultSize = windowState.size || panelProps.defaultSize || { width: 500, height: 400 };
  const panelMeta = useMemo(
    () => ({
      id,
      defaultPosition,
      isActive,
    }),
    [defaultPosition, id, isActive],
  );
  const panelClassName =
    typeof panelProps.className === "string" ? panelProps.className : undefined;
  const hideHeader = Boolean(panelProps.hideHeader);
  const transparent = Boolean(panelProps.transparent);
  const panelPluginId = resolved?.pluginId || "unknown";
  const panelComponentName = resolved?.componentName || windowState.componentId;
  const resolvedPanelClassName = cn(
    panelClassName,
    "embeddr-panel",
    `embeddr-panel-${panelPluginId.replace(/[^a-zA-Z0-9]/g, "-")}`,
    `embeddr-component-${panelComponentName.replace(/[^a-zA-Z0-9]/g, "-")}`,
  );
  const panelContentId = `panel-content-${panelPluginId.replace(/[^a-zA-Z0-9]/g, "-")}-${panelComponentName.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const pluginApi = useMemo(
    () => (resolved ? extendApiForPlugin(baseApi, resolved.pluginId) : baseApi),
    [baseApi, resolved?.pluginId],
  );
  const GlobalEmbeddrProvider = (window as any).EmbeddrUI?.EmbeddrProvider || EmbeddrProvider;

  if (!resolved) {
    return (
      <div style={{ pointerEvents: "auto" }}>
        <ZenDraggablePanel
          id={id}
          title="Error"
          isOpen={true}
          onClose={handleClose}
          onMinimize={handleMinimize}
          pinned={windowState.isPinned}
          onPinChange={handlePinChange}
          defaultPosition={defaultPosition}
          defaultSize={defaultSize}
          position={windowState.position}
          size={windowState.size}
          onPositionChange={(pos) => updateWindow(id, { position: pos })}
          onSizeChange={(next) => updateWindow(id, { size: next })}
          zIndex={props.zIndex}
          isActive={isActive}
          onMouseDown={handleFocus}
          hideHeader={hideHeader}
          transparent={transparent}
          className={resolvedPanelClassName}
          openRevision={windowState.openRevision}
          resetUiOnOpen={Boolean(panelProps.resetUiOnOpen)}
        >
          <div className="p-4 text-destructive space-y-2">
            <div className="font-bold">Component Not Found</div>
            <div className="text-xs font-mono bg-muted p-2 rounded">
              ID: {windowState.componentId}
            </div>
            <div className="text-xs">Plugin might not be loaded yet.</div>
          </div>
        </ZenDraggablePanel>
      </div>
    );
  }

  return (
    <div style={{ pointerEvents: "auto" }}>
      <WindowErrorBoundary
        windowId={id}
        title={windowState.title || resolved.def?.label || resolved.componentName}
        onClose={handleClose}
        onMinimize={handleMinimize}
        onPinChange={handlePinChange}
        onFocus={handleFocus}
        position={windowState.position}
        size={windowState.size}
        defaultPosition={defaultPosition}
        defaultSize={defaultSize}
        isActive={isActive}
        zIndex={props.zIndex}
        pinned={windowState.isPinned}
        hideHeader={hideHeader}
        transparent={transparent}
        className={resolvedPanelClassName}
      >
        <ZenDraggablePanel
          id={id}
          title={windowState.title || resolved.def?.label || resolved.componentName}
          isOpen={true}
          onMinimize={handleMinimize}
          pinned={windowState.isPinned}
          onPinChange={handlePinChange}
          defaultPosition={defaultPosition}
          defaultSize={defaultSize}
          position={windowState.position}
          size={windowState.size}
          isActive={isActive}
          zIndex={props.zIndex}
          onClose={handleClose}
          onMouseDown={handleFocus}
          onPositionChange={(pos) => updateWindow(id, { position: pos })}
          onSizeChange={(next) => updateWindow(id, { size: next })}
          hideHeader={hideHeader}
          transparent={transparent}
          className={resolvedPanelClassName}
          openRevision={windowState.openRevision}
          resetUiOnOpen={Boolean(panelProps.resetUiOnOpen)}
        >
          <div
            id={panelContentId}
            className="embeddr-panel-content h-full w-full min-h-0 overflow-hidden embeddr-plugin-scope @container [container-name:panel] relative"
          >
            <GlobalEmbeddrProvider api={pluginApi}>
              <PluginErrorBoundary
                pluginId={resolved.pluginId}
                componentName={resolved.componentName}
              >
                <DynamicPluginComponent
                  pluginId={resolved.pluginId}
                  componentName={resolved.componentName}
                  api={pluginApi}
                  windowId={id}
                  isActive={isActive}
                  openRevision={windowState.openRevision}
                  panel={panelMeta}
                  {...panelProps}
                />
              </PluginErrorBoundary>
            </GlobalEmbeddrProvider>
          </div>
        </ZenDraggablePanel>
      </WindowErrorBoundary>
    </div>
  );
});

class WindowErrorBoundary extends React.Component<
  {
    windowId: string;
    title: string;
    onClose: () => void;
    onMinimize?: () => void;
    onPinChange?: () => void;
    onFocus?: (event: React.MouseEvent) => void;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    defaultPosition?: { x: number; y: number };
    defaultSize?: { width: number; height: number };
    isActive?: boolean;
    zIndex?: number;
    pinned?: boolean;
    hideHeader?: boolean;
    transparent?: boolean;
    className?: string;
    children: React.ReactNode;
  },
  { error?: Error }
> {
  state = { error: undefined } as { error?: Error };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[ZenShell] Window renderer crashed", error);
  }

  render() {
    if (this.state.error) {
      const defaultPosition = this.props.defaultPosition || { x: 100, y: 100 };
      const defaultSize = this.props.defaultSize || { width: 500, height: 400 };
      return (
        <ZenDraggablePanel
          id={`${this.props.windowId}-error`}
          title={this.props.title}
          isOpen={true}
          onClose={this.props.onClose}
          onMinimize={this.props.onMinimize}
          pinned={this.props.pinned}
          onPinChange={this.props.onPinChange}
          position={this.props.position}
          size={this.props.size}
          defaultPosition={defaultPosition}
          defaultSize={defaultSize}
          isActive={this.props.isActive}
          zIndex={this.props.zIndex}
          onMouseDown={this.props.onFocus}
          hideHeader={this.props.hideHeader}
          transparent={this.props.transparent}
          className={this.props.className}
        >
          <div className="h-full w-full min-h-0 overflow-hidden">
            <div className="p-4 text-xs text-muted-foreground whitespace-pre-wrap">
              {this.state.error.message}
            </div>
          </div>
        </ZenDraggablePanel>
      );
    }

    return this.props.children;
  }
}

type EmbeddrApiAdapterInput = ReturnType<typeof useEmbeddrApi>;

function createEmbeddrApiAdapter(input: EmbeddrApiAdapterInput): EmbeddrAPI {
  const backendUrl = (input.endpoint || "http://localhost:8003").replace(/\/$/, "");
  const apiBase = `${backendUrl}/api/v1`;
  const assetBase = backendUrl.replace(/\/api(?:\/v\d+)?\/?$/, "");

  const signProtectedUrl = (url: string) => {
    const apiKey = String(input.apiKey || "").trim();
    if (!url || !apiKey) return url;
    try {
      const baseUrl =
        assetBase ||
        backendUrl ||
        (typeof window !== "undefined" ? window.location.origin : "http://localhost");
      const parsed = new URL(url, baseUrl);
      const assetOrigin = new URL(baseUrl).origin;
      const windowOrigin = typeof window !== "undefined" ? window.location.origin : assetOrigin;
      const isInternal = parsed.origin === assetOrigin || parsed.origin === windowOrigin;
      const isProtectedPath =
        parsed.pathname.startsWith("/api/") || parsed.pathname.startsWith("/plugins/");
      if (!isInternal || !isProtectedPath) return parsed.toString();
      if (!parsed.searchParams.has("api_key")) {
        parsed.searchParams.set("api_key", apiKey);
      }
      return parsed.toString();
    } catch {
      return url;
    }
  };

  const normalizePluginLogoUrl = (value: string | null, pluginName?: string) => {
    if (!value) return null;
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return signProtectedUrl(value);
    }
    if (value.startsWith("//")) {
      const protocol = typeof window !== "undefined" ? window.location.protocol : "https:";
      return signProtectedUrl(`${protocol}${value}`);
    }
    if (value.startsWith("/api/") || value.startsWith("/plugins/")) {
      return signProtectedUrl(`${assetBase}${value}`);
    }
    if (pluginName && value.startsWith(`/${pluginName}/static/`)) {
      return signProtectedUrl(`${assetBase}/plugins${value}`);
    }
    if (value.startsWith("/")) {
      return signProtectedUrl(`${assetBase}${value}`);
    }
    return signProtectedUrl(`${assetBase}/${value}`);
  };

  const jsonRequest = async (path: string, init?: RequestInit) => {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const url = path.startsWith("http") ? path : `${apiBase}${normalized}`;

    const key = input.apiKey || "";
    const headers = new Headers(init?.headers || {});
    if (key && !headers.has("X-API-Key")) {
      headers.set("X-API-Key", key);
    }
    const nextInit: RequestInit = { ...init, headers };

    const addTrailingSlash = (inputUrl: string) => {
      const [base, query] = inputUrl.split("?");
      if (base.endsWith("/")) return inputUrl;
      return query ? `${base}/?${query}` : `${base}/`;
    };

    const run = async (target: string) => {
      const res = await input.apiClient.fetch(target, nextInit);
      if (res.ok) return res.json();
      return res;
    };

    const first = await run(url);
    if (first instanceof Response) {
      if (first.status === 404) {
        const fallbackUrl = addTrailingSlash(url);
        const second = await run(fallbackUrl);
        if (second instanceof Response) {
          const txt = await second.text().catch(() => "");
          throw new Error(txt || second.statusText || "Request failed");
        }
        return second;
      }
      const txt = await first.text().catch(() => "");
      throw new Error(txt || first.statusText || "Request failed");
    }
    return first;
  };

  const executionStore = {
    pipelines: [],
    selectedPipeline: null,
    runs: [],
    isRunning: false,
    run: async () => {},
    setPipelineInput: () => {},
    selectPipeline: () => {},
  };

  const generationStore = {
    workflows: executionStore.pipelines,
    selectedWorkflow: executionStore.selectedPipeline,
    generations: executionStore.runs,
    runs: executionStore.runs,
    isGenerating: executionStore.isRunning,
    generate: executionStore.run,
    setWorkflowInput: executionStore.setPipelineInput,
    selectWorkflow: executionStore.selectPipeline,
  };

  const modelCatalog = {
    list: async (input: { category: string; page?: number; limit?: number }) => ({
      items: [],
      total: 0,
      page: input.page || 1,
      pages: 1,
      category: input.category,
    }),
    listSamplers: async () => ({ samplers: [], schedulers: [] }),
  };

  const api: EmbeddrAPI = {
    stores: {
      global: {
        selectedImage: null,
        selectImage: () => {},
      },
      generation: generationStore,
    },
    ui: {
      activePanelId: null,
      isPanelActive: () => false,
    },
    workspaces: {
      getState: () => ({}),
      subscribe: () => () => {},
      list: () => [],
      getActiveId: () => null,
      ensureDefault: () => {},
      create: () => "default",
      save: () => {},
      saveActive: () => {},
      apply: () => {},
      rename: () => {},
      clone: () => null,
      remove: () => {},
      setTemplate: () => {},
    },
    settings: {
      get: <T,>(key: string, defaultValue?: T) => {
        const raw = localStorage.getItem(key);
        return raw !== null ? (JSON.parse(raw) as T) : defaultValue;
      },
      set: (key: string, value: any) => {
        localStorage.setItem(key, JSON.stringify(value));
      },
      getPlugin: <T,>(pluginId: string, key: string, defaultValue?: T) => {
        const raw = localStorage.getItem(`${pluginId}:${key}`);
        return raw !== null ? (JSON.parse(raw) as T) : defaultValue;
      },
      setPlugin: (pluginId: string, key: string, value: any) => {
        localStorage.setItem(`${pluginId}:${key}`, JSON.stringify(value));
      },
    },
    toast: {
      success: (message: string) => console.log("[Embeddr]", message),
      error: (message: string) => console.error("[Embeddr]", message),
      info: (message: string) => console.info("[Embeddr]", message),
    },
    utils: {
      backendUrl,
      getApiKey: () => input.apiKey || null,
      uploadImage: async () => {
        throw new Error("uploadImage not implemented in ComfyUI shell");
      },
      getPluginUrl: (path: string) => {
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        return `${apiBase}/plugins/${cleanPath}`;
      },
    },
    artifacts: {
      list: (inputData) => {
        const q = new URLSearchParams();
        if (inputData?.limit !== undefined) q.append("limit", String(inputData.limit));
        if (inputData?.offset !== undefined) q.append("offset", String(inputData.offset));
        if (inputData?.type_name) q.append("type_name", inputData.type_name);
        if (inputData?.media_type) q.append("media_type", inputData.media_type);
        if (inputData?.sort) q.append("sort", inputData.sort);
        if (inputData?.ids?.length) q.append("ids", inputData.ids.join(","));
        const qs = q.toString();
        return jsonRequest(`/artifacts${qs ? `?${qs}` : ""}`);
      },
      get: (id: string) => jsonRequest(`/artifacts/${id}`),
      getContentUrl: (id: string) => `${apiBase}/artifacts/${id}/content`,
      resolve: (inputData: any) => jsonRequest(`/artifacts/${inputData.id}`),
      getPreviewUrl: (id: string, type: "thumbnail" | "preview" = "thumbnail") =>
        `${apiBase}/artifacts/${id}/preview?preview_type=${type}`,
      getEmbeddings: (id: string) => jsonRequest(`/artifacts/${id}/embeddings`),
      getAnnotations: (id: string) => jsonRequest(`/artifacts/${id}/annotations`),
      getLineage: (id: string) => jsonRequest(`/artifacts/${id}/lineage`),
      getRelations: (id: string) => jsonRequest(`/artifacts/${id}/relations`),
      addRelation: (sourceId: string, inputData: any) =>
        jsonRequest(`/artifacts/${sourceId}/relations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_id: inputData?.target_id,
            relation_type: inputData?.relation_type || "contains",
            metadata_json: inputData?.metadata_json || {},
          }),
        }),
      getSubgraph: (id: string, params: any) => {
        const q = new URLSearchParams();
        if (params?.maxDepth !== undefined) q.append("max_depth", String(params.maxDepth));
        if (params?.includeLineage !== undefined)
          q.append("include_lineage", String(params.includeLineage));
        if (params?.includeRelations !== undefined)
          q.append("include_relations", String(params.includeRelations));
        const qs = q.toString();
        return jsonRequest(`/artifacts/${id}/subgraph${qs ? `?${qs}` : ""}`);
      },
      create: (inputData: any) =>
        jsonRequest(`/artifacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputData),
        }),
      update: (id: string, inputData: any) =>
        jsonRequest(`/artifacts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputData),
        }),
      delete: (id: string) => jsonRequest(`/artifacts/${id}`, { method: "DELETE" }),
      uploadInit: (inputData: any) =>
        jsonRequest(`/artifacts/${inputData.artifact_id}/upload/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputData),
        }),
      uploadComplete: (inputData: any) =>
        jsonRequest(`/artifacts/upload/${inputData.upload_id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputData),
        }),
      uploadFile: async (inputData: { artifact_id: string; file: File }) => {
        const formData = new FormData();
        formData.append("file", inputData.file);
        return jsonRequest(`/artifacts/${inputData.artifact_id}/upload`, {
          method: "POST",
          body: formData as any,
        });
      },
    },
    resources: {
      resolve: (inputData: any) =>
        jsonRequest(`/resources/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputData),
        }),
    },
    collections: input.apiClient.collections,
    library: input.apiClient.collections as any,
    executions: {
      create: (payload) =>
        jsonRequest(`/executions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      get: (executionId) => jsonRequest(`/executions/${executionId}`),
      list: (payload) => {
        const q = new URLSearchParams();
        if (payload?.plugin_name) q.append("plugin_name", payload.plugin_name);
        if (payload?.status) q.append("status", payload.status);
        if (payload?.limit) q.append("limit", String(payload.limit));
        if (payload?.offset) q.append("offset", String(payload.offset));
        return jsonRequest(`/executions?${q.toString()}`);
      },
      cancel: (executionId) =>
        jsonRequest(`/executions/${executionId}/cancel`, {
          method: "POST",
        }),
      nudge: (executionId, input) => {
        const payload = typeof input === "string" ? { message: input } : input;
        return jsonRequest(`/executions/${executionId}/nudge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      },
    },
    lotus: {
      invoke: (capId: string, payload?: Record<string, any>) =>
        jsonRequest(`/lotus/${capId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload ?? {}),
        }),
      query: (query: string, limit = 20) =>
        jsonRequest(`/lotus/query?q=${encodeURIComponent(query)}&limit=${limit}`),
      list: (payload?: any) => {
        const q = new URLSearchParams();
        if (payload?.kind) q.append("kind", payload.kind);
        if (payload?.plugin) q.append("plugin", payload.plugin);
        if (payload?.slot) q.append("slot", payload.slot);
        if (payload?.limit) q.append("limit", String(payload.limit));
        if (payload?.offset) q.append("offset", String(payload.offset));
        return jsonRequest(`/lotus/list${q.toString() ? `?${q.toString()}` : ""}`);
      },
    },
    client: {
      plugins: {
        call: (pluginId: string, path: string, method = "GET", body?: any) => {
          const normalized = path.startsWith("/") ? path : `/${path}`;
          return jsonRequest(`/plugins/${pluginId}${normalized}`, {
            method,
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
          });
        },
      },
    } as any,
    plugin: {
      fetch: async (path: string, init?: RequestInit) => {
        const url = path.startsWith("http")
          ? path
          : `${apiBase}/plugins${path.startsWith("/") ? path : `/${path}`}`;
        const key = input.apiKey || "";
        const headers = new Headers(init?.headers || {});
        if (key && !headers.has("X-API-Key")) headers.set("X-API-Key", key);
        return input.apiClient.fetch(url, { ...init, headers });
      },
      request: async <T = any,>(path: string, init?: RequestInit): Promise<T> => {
        const url = path.startsWith("http")
          ? path
          : `${apiBase}/plugins${path.startsWith("/") ? path : `/${path}`}`;
        const key = input.apiKey || "";
        const headers = new Headers(init?.headers || {});
        if (key && !headers.has("X-API-Key")) headers.set("X-API-Key", key);
        const res = await input.apiClient.fetch(url, { ...init, headers });
        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
        return res.json();
      },
    },
    security: {
      overview: () => jsonRequest(`/system/auth/overview`),
      operatorProfile: () => jsonRequest(`/system/auth/me`),
      login: async (payload: { username: string; password: string }) => {
        try {
          return await jsonRequest(`/system/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } catch {
          return { ok: false, detail: "Login not supported in ComfyUI shell" };
        }
      },
      logout: async () => ({
        ok: true,
        message: "No session to clear in ComfyUI shell",
      }),
    },
    events: {
      on: (event, listener) =>
        globalEventBus.on(event as string, listener as (...args: Array<any>) => void),
      off: (event, listener) =>
        globalEventBus.off(event as string, listener as (...args: Array<any>) => void),
      emit: (event, payload) => globalEventBus.emit(event as string, payload),
    },
    comfy: modelCatalog as any,
    windows: {
      open: (id: string, title: string, componentId: string, props?: any) =>
        useZenWindowStore.getState().openWindow({
          id,
          title,
          componentId,
          props,
        }),
      spawn: (componentId: string, title: string, props?: any) =>
        useZenWindowStore.getState().spawnWindow(componentId, title, props),
      register: () => {},
      getState: () => useZenWindowStore.getState(),
      list: () => Object.values(useZenWindowStore.getState().windows),
    },
    plugins: {
      list: () => jsonRequest("/plugins"),
      listLogos: async () => {
        const data = (await jsonRequest("/plugins/logos")) as {
          logos?: Record<string, string | null>;
        };
        const logos = data?.logos || {};
        return Object.fromEntries(
          Object.entries(logos).map(([key, value]) => [key, normalizePluginLogoUrl(value, key)]),
        );
      },
      getActions: () => [],
      getComponents: () => [],
      getApi: () => api,
    },
  };

  (api as any).models = modelCatalog;
  (api as any).stores.execution = executionStore;

  (api as any).__proxyFetch = input.apiClient.fetch;
  return api;
}

function extendApiForPlugin(api: EmbeddrAPI, pluginId: string): EmbeddrAPI {
  if (!api?.utils) return api;
  return {
    ...api,
    utils: {
      ...api.utils,
      getPluginUrl: (path: string) => {
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        return `${api.utils.backendUrl}/api/v1/plugins/${pluginId}/${cleanPath}`;
      },
    },
    plugin: {
      fetch: (path: string, init?: RequestInit) => {
        const proxyFetch = (api as any).__proxyFetch || fetch;
        const key = (api as any).utils?.getApiKey?.() || "";
        const headers = new Headers(init?.headers || {});
        if (key && !headers.has("X-API-Key")) headers.set("X-API-Key", key);
        const nextInit: RequestInit = { ...init, headers };
        if (path.startsWith("http")) {
          return proxyFetch(path, nextInit);
        }
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        const url = `${api.utils.backendUrl}/api/v1/plugins/${pluginId}/${cleanPath}`;
        return proxyFetch(url, nextInit);
      },
      request: async (path: string, init?: RequestInit) => {
        const proxyFetch = (api as any).__proxyFetch || fetch;
        const key = (api as any).utils?.getApiKey?.() || "";
        const headers = new Headers(init?.headers || {});
        if (key && !headers.has("X-API-Key")) headers.set("X-API-Key", key);
        const nextInit: RequestInit = { ...init, headers };
        const url = path.startsWith("http")
          ? path
          : `${api.utils.backendUrl}/api/v1/plugins/${pluginId}/${
              path.startsWith("/") ? path.slice(1) : path
            }`;

        if (url.includes("/api/v1/lotus/") && (nextInit.method || "GET").toUpperCase() === "POST") {
          const capId = url.split("/api/v1/lotus/")[1] || "";
          let payload: any = undefined;
          if (typeof nextInit.body === "string") {
            try {
              payload = JSON.parse(nextInit.body);
            } catch {
              payload = {};
            }
          } else if (nextInit.body && typeof nextInit.body === "object") {
            payload = nextInit.body as any;
          }
          return api.lotus.invoke(capId, payload);
        }
        const res = await proxyFetch(url, nextInit);
        if (!res.ok) {
          const errorText = await res.text().catch(() => res.statusText);
          throw new Error(errorText || `Request failed: ${res.status}`);
        }
        return res.json();
      },
    } as any,
  } as EmbeddrAPI;
}

export function ZenShell() {
  console.log("[ZenShell] Rendering...");
  const [isOpen, setIsOpen] = useState(false);
  const [launcherCollapsed, setLauncherCollapsed] = useState(false);
  const [launcherQuery, setLauncherQuery] = useState("");
  const [launcherMode, setLauncherMode] = useState<"workspace" | "catalog">("workspace");
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [pluginLoadError, setPluginLoadError] = useState<string | null>(null);
  const [pluginBootstrapComplete, setPluginBootstrapComplete] = useState(false);
  const [windowStoreHydrated, setWindowStoreHydrated] = useState(
    () => zenWindowStoreWithPersist.persist?.hasHydrated?.() ?? true,
  );

  let api;
  try {
    api = useEmbeddrApi();
  } catch (e) {
    console.error("[ZenShell] Failed to get API context", e);
    return null;
  }

  const { plugins, knownPlugins } = usePluginRegistry();
  const spawnWindow = useZenWindowStore((s) => s.spawnWindow);
  const updateWindow = useZenWindowStore((s) => s.updateWindow);
  const setPanelConstraints = useZenWindowStore((s) => s.setPanelConstraints);
  const windows = useZenWindowStore((s) => s.windows);
  const panelOrder = useZenWindowStore((s) => s.panelOrder);
  const bringToFront = useZenWindowStore((s) => s.bringToFront);
  const restoreWindow = useZenWindowStore((s) => s.restoreWindow);
  const minimizeWindow = useZenWindowStore((s) => s.minimizeWindow);
  const closeWindow = useZenWindowStore((s) => s.closeWindow);
  const setActiveTab = useZenWindowStore((s) => s.setActiveTab);
  const [pluginReloadTick, setPluginReloadTick] = useState(0);
  const deferredLauncherQuery = useDeferredValue(launcherQuery);
  const embeddrApi = useMemo(
    () => createEmbeddrApiAdapter(api),
    [api.endpoint, api.apiKey, api.apiClient],
  );
  const wsBackendUrl = useMemo(
    () => (api.endpoint || "http://localhost:8003").replace(/\/$/, ""),
    [api.endpoint],
  );
  const orderIndexByWindowId = useMemo(
    () => new Map(panelOrder.map((id, index) => [id, index] as const)),
    [panelOrder],
  );
  const launcherComponents = useMemo<Array<LauncherComponentEntry>>(
    () =>
      knownPlugins
        .flatMap((pluginId) => {
          const plugin = plugins[pluginId];
          return (plugin?.components ?? []).map((component: any, componentIndex: number) => ({
            pluginId,
            pluginLabel: plugin?.name || pluginId,
            componentId: `${pluginId}-${
              component.exportName ||
              component.component ||
              component.name ||
              `comp-${componentIndex}`
            }`,
            title:
              component.label ||
              component.name ||
              component.component ||
              component.exportName ||
              pluginId,
            subtitle:
              component.component || component.exportName || component.name || "Plugin panel",
            component,
          }));
        })
        .sort(
          (left, right) =>
            left.pluginLabel.localeCompare(right.pluginLabel) ||
            left.title.localeCompare(right.title),
        ),
    [knownPlugins, plugins],
  );
  const launcherOpenWindows = useMemo<Array<LauncherWindowEntry>>(
    () =>
      Object.values(windows)
        .filter((windowState) => !windowState.isMinimized && !windowState.groupHostId)
        .map((windowState) => {
          const resolved = resolveComponentId(windowState.componentId, plugins);
          return {
            id: windowState.id,
            title:
              windowState.title || resolved?.def?.label || resolved?.componentName || "Untitled",
            subtitle: resolved?.pluginId || resolved?.def?.component || windowState.componentId,
            componentId: windowState.componentId,
            isPinned: Boolean(windowState.isPinned),
            tabsCount: windowState.tabs?.length || 0,
            orderIndex: orderIndexByWindowId.get(windowState.id) ?? -1,
          };
        })
        .sort((left, right) => right.orderIndex - left.orderIndex),
    [orderIndexByWindowId, plugins, windows],
  );
  const launcherMinimizedWindows = useMemo<Array<LauncherWindowEntry>>(
    () =>
      Object.values(windows)
        .filter((windowState) => windowState.isMinimized)
        .map((windowState) => {
          const resolved = resolveComponentId(windowState.componentId, plugins);
          return {
            id: windowState.id,
            title:
              windowState.title || resolved?.def?.label || resolved?.componentName || "Untitled",
            subtitle: resolved?.pluginId || resolved?.def?.component || windowState.componentId,
            componentId: windowState.componentId,
            groupHostId: windowState.groupHostId,
            isPinned: Boolean(windowState.isPinned),
            tabsCount: windowState.tabs?.length || 0,
            orderIndex: orderIndexByWindowId.get(windowState.id) ?? -1,
          };
        })
        .sort((left, right) => right.orderIndex - left.orderIndex),
    [orderIndexByWindowId, plugins, windows],
  );
  const filteredOpenWindows = useMemo(
    () =>
      launcherOpenWindows
        .map((entry) => ({
          entry,
          score: scoreLauncherMatch(
            [entry.title, entry.subtitle, entry.componentId],
            deferredLauncherQuery,
          ),
        }))
        .filter(({ score }) => score > 0)
        .sort(
          (left, right) =>
            right.score - left.score || right.entry.orderIndex - left.entry.orderIndex,
        )
        .map(({ entry }) => entry),
    [deferredLauncherQuery, launcherOpenWindows],
  );
  const filteredMinimizedWindows = useMemo(
    () =>
      launcherMinimizedWindows
        .map((entry) => ({
          entry,
          score: scoreLauncherMatch(
            [entry.title, entry.subtitle, entry.componentId],
            deferredLauncherQuery,
          ),
        }))
        .filter(({ score }) => score > 0)
        .sort(
          (left, right) =>
            right.score - left.score || right.entry.orderIndex - left.entry.orderIndex,
        )
        .map(({ entry }) => entry),
    [deferredLauncherQuery, launcherMinimizedWindows],
  );
  const filteredLauncherComponents = useMemo(
    () =>
      launcherComponents
        .map((entry) => ({
          entry,
          score: scoreLauncherMatch(
            [entry.title, entry.subtitle, entry.pluginId, entry.pluginLabel],
            deferredLauncherQuery,
          ),
        }))
        .filter(({ score }) => score > 0)
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.entry.pluginLabel.localeCompare(right.entry.pluginLabel) ||
            left.entry.title.localeCompare(right.entry.title),
        )
        .map(({ entry }) => entry),
    [deferredLauncherQuery, launcherComponents],
  );
  const groupedLauncherComponents = useMemo(() => {
    const groups = new Map<
      string,
      {
        pluginId: string;
        pluginLabel: string;
        entries: Array<LauncherComponentEntry>;
      }
    >();

    filteredLauncherComponents.forEach((entry) => {
      const current = groups.get(entry.pluginId);
      if (current) {
        current.entries.push(entry);
        return;
      }
      groups.set(entry.pluginId, {
        pluginId: entry.pluginId,
        pluginLabel: entry.pluginLabel,
        entries: [entry],
      });
    });

    return Array.from(groups.values()).sort((left, right) =>
      left.pluginLabel.localeCompare(right.pluginLabel),
    );
  }, [filteredLauncherComponents]);
  const shellReady = api.configLoaded && windowStoreHydrated && pluginBootstrapComplete;

  useEffect(() => {
    console.log("[ZenShell] Mounted");
    return () => console.log("[ZenShell] Unmounted");
  }, []);

  useEffect(() => {
    setPanelConstraints({
      enabled: true,
      safeArea: PANEL_SAFE_AREA,
      snapThreshold: 24,
    });
  }, [setPanelConstraints]);

  useEffect(() => {
    const persistApi = zenWindowStoreWithPersist.persist;
    if (!persistApi?.onFinishHydration) {
      setWindowStoreHydrated(true);
      return;
    }
    if (persistApi.hasHydrated?.()) {
      setWindowStoreHydrated(true);
      return;
    }
    const unsubscribe = persistApi.onFinishHydration(() => {
      setWindowStoreHydrated(true);
    });
    return unsubscribe;
  }, []);

  const adapter = useMemo<PluginLoaderAdapter>(() => {
    console.log("[ZenShell] Recreating adapter");
    return {
      list: async () => {
        try {
          const baseUrl = api.endpoint || "http://localhost:8003";
          // Reverting to /v2/plugins if that's what was working, or checking both?
          // Let's assume /api/v1/plugins is correct based on recent changes, but we'll log it.
          const targetUrl = baseUrl.endsWith("/")
            ? `${baseUrl}api/v1/plugins`
            : `${baseUrl}/api/v1/plugins`;

          console.log("[ZenShell] Fetching plugins from", targetUrl);
          const res = await api.apiClient.fetch(targetUrl);
          if (!res.ok) {
            console.error("[ZenShell] Plugin fetch failed", res.status, res.statusText);
            return [];
          }
          const data = await res.json();
          console.log("[ZenShell] Fetched plugins:", data.length);
          return data;
        } catch (e) {
          console.error("Failed to list plugins via proxy", e);
          return [];
        }
      },
      resolveScriptUrl: (manifest) => {
        const baseUrl = (api.endpoint || "http://localhost:8003").replace(/\/$/, "");
        const url = manifest.url;

        if (!url) return "";

        if (url.startsWith("/")) {
          const target = `${baseUrl}${url}`;
          return `/embeddr/proxy?url=${encodeURIComponent(target)}`;
        }
        return url;
      },
      resolveCssUrl: (manifest) => {
        const baseUrl = (api.endpoint || "http://localhost:8003").replace(/\/$/, "");
        let url = manifest.url;

        if (!url) return null;

        if (url.startsWith("/")) {
          if (url.endsWith(".js")) {
            url = url.replace(".js", ".css");
          }
          const target = `${baseUrl}${url}`;
          return `/embeddr/proxy?url=${encodeURIComponent(target)}`;
        }

        if (url.endsWith(".js")) return url.replace(".js", ".css");
        return null;
      },
    };
  }, [api.endpoint, api.apiClient]);

  useEffect(() => {
    const handleToggle = () => {
      console.log("[ZenShell] Toggle event received");
      if (!isOpen) {
        setIsOpen(true);
        setLauncherCollapsed(false);
        return;
      }
      if (launcherCollapsed) {
        setLauncherCollapsed(false);
        return;
      }
      setIsOpen(false);
    };
    const handleLaunch = (e: CustomEvent) => {
      console.log("[ZenShell] Launch event received", e.detail);
      setIsOpen(true);
      setLauncherCollapsed(false);
      if (e.detail && e.detail.componentId) {
        const title = e.detail.title || e.detail.componentId;
        spawnWindow(e.detail.componentId, title, e.detail.props);
      }
    };

    const targets: Array<Window> = [];
    const addTarget = (target?: Window | null) => {
      if (!target) return;
      if (!targets.includes(target)) targets.push(target);
    };

    addTarget(window);
    try {
      addTarget(window.parent);
    } catch (e) {
      console.warn("[ZenShell] Unable to access window.parent", e);
    }
    try {
      addTarget(window.top);
    } catch (e) {
      console.warn("[ZenShell] Unable to access window.top", e);
    }

    targets.forEach((target) => {
      target.addEventListener("embeddr-toggle-shell", handleToggle);
      target.addEventListener("embeddr-launch-window", handleLaunch as EventListener);
    });

    return () => {
      targets.forEach((target) => {
        target.removeEventListener("embeddr-toggle-shell", handleToggle);
        target.removeEventListener("embeddr-launch-window", handleLaunch as EventListener);
      });
    };
  }, [isOpen, launcherCollapsed, spawnWindow]);

  const handlePluginLoadError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : "Failed to load plugins";
    console.error("[ZenShell] Failed to load external plugins", error);
    setPluginLoadError(message);
  }, []);

  const reloadPlugins = useCallback(async () => {
    setPluginsLoading(true);
    setPluginLoadError(null);
    try {
      await loadExternalPlugins({ adapter });
      setPluginReloadTick((prev) => prev + 1);
      setPluginBootstrapComplete(true);
    } catch (error) {
      handlePluginLoadError(error);
      setPluginBootstrapComplete(true);
    } finally {
      setPluginsLoading(false);
    }
  }, [adapter, handlePluginLoadError]);

  useEffect(() => {
    if (!api.configLoaded) {
      setPluginBootstrapComplete(false);
      setPluginsLoading(false);
      setPluginLoadError(null);
      return;
    }
    console.log("[ZenShell] Loading external plugins...");
    let cancelled = false;
    setPluginBootstrapComplete(false);
    setPluginsLoading(true);
    setPluginLoadError(null);
    (async () => {
      try {
        await loadExternalPlugins({ adapter });
        if (cancelled) return;
        setPluginReloadTick((prev) => prev + 1);
      } catch (error) {
        if (cancelled) return;
        handlePluginLoadError(error);
      } finally {
        if (!cancelled) {
          setPluginsLoading(false);
          setPluginBootstrapComplete(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api.configLoaded, adapter, handlePluginLoadError]);

  const handleSpawnComponent = useCallback(
    (entry: LauncherComponentEntry) => {
      const windowId = spawnWindow(entry.componentId, entry.title, {
        ...(entry.component.props ?? {}),
        defaultPosition: entry.component.defaultPosition ?? entry.component.props?.defaultPosition,
        defaultSize: entry.component.defaultSize ?? entry.component.props?.defaultSize,
      });

      if (entry.component.defaultPosition || entry.component.defaultSize) {
        updateWindow(windowId, {
          position: entry.component.defaultPosition,
          size: entry.component.defaultSize,
        });
      }
    },
    [spawnWindow, updateWindow],
  );

  const handleFocusWindow = useCallback(
    (windowId: string) => {
      bringToFront(windowId);
      setActiveTab(windowId, windowId);
    },
    [bringToFront, setActiveTab],
  );

  const handleRestoreWindow = useCallback(
    (windowId: string, hostId?: string) => {
      const restoreId = hostId || windowId;
      restoreWindow(restoreId);
      if (hostId) {
        setActiveTab(hostId, windowId);
        bringToFront(hostId);
        return;
      }
      bringToFront(windowId);
    },
    [bringToFront, restoreWindow, setActiveTab],
  );

  const hasLauncherResults =
    filteredOpenWindows.length > 0 ||
    filteredMinimizedWindows.length > 0 ||
    groupedLauncherComponents.length > 0;
  const trimmedLauncherQuery = deferredLauncherQuery.trim();
  const launcherSearchResults = useMemo<Array<LauncherSearchResult>>(() => {
    if (!trimmedLauncherQuery) return [];

    const openResults = launcherOpenWindows
      .map((entry) => ({
        key: `open:${entry.id}`,
        kind: "open" as const,
        score:
          scoreLauncherMatch(
            [entry.title, entry.subtitle, entry.componentId],
            trimmedLauncherQuery,
          ) + 30,
        entry,
      }))
      .filter((result) => result.score > 30);

    const minimizedResults = launcherMinimizedWindows
      .map((entry) => ({
        key: `minimized:${entry.id}`,
        kind: "minimized" as const,
        score:
          scoreLauncherMatch(
            [entry.title, entry.subtitle, entry.componentId],
            trimmedLauncherQuery,
          ) + 20,
        entry,
      }))
      .filter((result) => result.score > 20);

    const componentResults = launcherComponents
      .map((entry) => ({
        key: `component:${entry.componentId}`,
        kind: "component" as const,
        score: scoreLauncherMatch(
          [entry.title, entry.subtitle, entry.pluginId, entry.pluginLabel],
          trimmedLauncherQuery,
        ),
        entry,
      }))
      .filter((result) => result.score > 0);

    return [...openResults, ...minimizedResults, ...componentResults]
      .sort((left, right) => right.score - left.score)
      .slice(0, 40);
  }, [launcherComponents, launcherMinimizedWindows, launcherOpenWindows, trimmedLauncherQuery]);
  const effectiveLauncherMode = trimmedLauncherQuery ? "search" : launcherMode;

  return (
    <ZenWebSocketProvider
      backendUrl={wsBackendUrl}
      apiKey={api.apiKey || undefined}
      autoConnect={api.configLoaded}
    >
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9000,
          pointerEvents: "none",
        }}
      >
        {/* The Window Manager Layer */}
        <div style={{ width: "100vw", height: "100vh" }}>
          <EmbeddrProvider api={embeddrApi}>
            <CoreUIEventBridge api={embeddrApi} />
            {shellReady ? (
              <ZenPanelManagerCore
                key={`zen-panel-manager-${pluginReloadTick}`}
                useWindowStore={useZenWindowStore}
                WindowRenderer={CustomWindowRenderer}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
                <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                  <div>Loading workspace panels...</div>
                </div>
              </div>
            )}
          </EmbeddrProvider>
        </div>
      </div>

      {/* The Shell Dock / Launcher */}
      {isOpen && (
        <div className="fixed inset-4 z-[9999] flex items-end justify-end pointer-events-none">
          {launcherCollapsed ? (
            <button
              type="button"
              className={cn(
                "pointer-events-auto",
                "flex items-center gap-3 rounded-full border border-border/70",
                "bg-background/95 px-3 py-2 shadow-2xl backdrop-blur-xl",
                "transition-transform hover:scale-[1.02]",
              )}
              onClick={() => setLauncherCollapsed(false)}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <LayoutTemplate className="h-4 w-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold">Zen Launcher</div>
                <div className="text-[10px] text-muted-foreground">
                  {launcherOpenWindows.length} open, {launcherMinimizedWindows.length} minimized
                </div>
              </div>
            </button>
          ) : (
            <div className="pointer-events-auto flex h-full max-h-full w-full max-w-[440px] flex-col overflow-hidden rounded-[24px] border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl">
              <div className="shrink-0 border-b border-border/60 bg-gradient-to-b from-background to-muted/20 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
                        <LayoutTemplate className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">Zen Launcher</div>
                        <div className="text-[11px] text-muted-foreground">
                          {effectiveLauncherMode === "search"
                            ? "Fast search across open windows and plugin panels."
                            : launcherMode === "workspace"
                              ? "Manage open and minimized panels."
                              : "Browse and launch plugin panels."}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Reload plugins"
                      disabled={pluginsLoading}
                      onClick={reloadPlugins}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", pluginsLoading && "animate-spin")} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Collapse launcher"
                      onClick={() => setLauncherCollapsed(true)}
                    >
                      <Minimize2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Close launcher"
                      onClick={() => setIsOpen(false)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl border border-border/60 bg-background/70 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Open
                    </div>
                    <div className="mt-1 text-lg font-semibold">{launcherOpenWindows.length}</div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/70 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Minimized
                    </div>
                    <div className="mt-1 text-lg font-semibold">
                      {launcherMinimizedWindows.length}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/70 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Panels
                    </div>
                    <div className="mt-1 text-lg font-semibold">{launcherComponents.length}</div>
                  </div>
                </div>

                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                  <Input
                    value={launcherQuery}
                    onChange={(event) => setLauncherQuery(event.target.value)}
                    placeholder="Search panels, plugins, or open windows..."
                    className="h-9 border-border/50 bg-background/80 pl-8 text-xs"
                  />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant={effectiveLauncherMode === "workspace" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => setLauncherMode("workspace")}
                  >
                    Workspace
                    <Badge variant="secondary" className="ml-2 h-4 px-1 text-[9px]">
                      {launcherOpenWindows.length + launcherMinimizedWindows.length}
                    </Badge>
                  </Button>
                  <Button
                    variant={effectiveLauncherMode === "catalog" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => setLauncherMode("catalog")}
                  >
                    Catalog
                    <Badge variant="secondary" className="ml-2 h-4 px-1 text-[9px]">
                      {launcherComponents.length}
                    </Badge>
                  </Button>
                  {trimmedLauncherQuery && (
                    <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                      {launcherSearchResults.length} results
                    </Badge>
                  )}
                </div>

                {pluginLoadError && (
                  <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {pluginLoadError}
                  </div>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col p-4">
                {effectiveLauncherMode === "search" ? (
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Search Results
                      </div>
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                        {launcherSearchResults.length}
                      </Badge>
                    </div>

                    {launcherSearchResults.length > 0 ? (
                      <ScrollArea className="min-h-0 flex-1">
                        <div className="space-y-2 pr-3">
                          {launcherSearchResults.map((result) => {
                            if (result.kind === "component") {
                              const entry = result.entry;
                              return (
                                <div
                                  key={result.key}
                                  className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/60 px-3 py-2"
                                >
                                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    <Play className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="truncate text-xs font-medium"
                                        title={entry.title}
                                      >
                                        {entry.title}
                                      </span>
                                      <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                                        Panel
                                      </Badge>
                                    </div>
                                    <div
                                      className="truncate text-[10px] text-muted-foreground"
                                      title={`${entry.pluginLabel} · ${entry.subtitle}`}
                                    >
                                      {entry.pluginLabel} · {entry.subtitle}
                                    </div>
                                  </div>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    className="h-7 shrink-0 rounded-lg px-2 text-xs"
                                    onClick={() => handleSpawnComponent(entry)}
                                  >
                                    Open
                                  </Button>
                                </div>
                              );
                            }

                            const entry = result.entry;
                            const isOpenResult = result.kind === "open";
                            return (
                              <button
                                key={result.key}
                                type="button"
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-background/60 px-3 py-2 text-left",
                                  "transition-colors hover:bg-muted/40",
                                )}
                                onClick={() =>
                                  isOpenResult
                                    ? handleFocusWindow(entry.id)
                                    : handleRestoreWindow(entry.id, entry.groupHostId)
                                }
                              >
                                <div
                                  className={cn(
                                    "flex h-9 w-9 items-center justify-center rounded-xl",
                                    isOpenResult
                                      ? "bg-primary/10 text-primary"
                                      : "bg-muted/60 text-muted-foreground",
                                  )}
                                >
                                  {isOpenResult ? (
                                    <AppWindow className="h-4 w-4" />
                                  ) : (
                                    <RotateCcw className="h-4 w-4" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="truncate text-xs font-medium"
                                      title={entry.title}
                                    >
                                      {entry.title}
                                    </span>
                                    <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                                      {isOpenResult ? "Open" : "Minimized"}
                                    </Badge>
                                  </div>
                                  <div
                                    className="truncate text-[10px] text-muted-foreground"
                                    title={entry.subtitle}
                                  >
                                    {entry.subtitle}
                                  </div>
                                </div>
                                <span className="text-[10px] text-muted-foreground">
                                  {isOpenResult ? "Focus" : "Restore"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 px-4 py-8 text-center text-xs text-muted-foreground">
                        No panels match "{trimmedLauncherQuery}".
                      </div>
                    )}
                  </div>
                ) : effectiveLauncherMode === "workspace" ? (
                  <div className="flex min-h-0 flex-1 flex-col gap-4">
                    <section className="flex min-h-0 flex-1 flex-col space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <AppWindow className="h-3.5 w-3.5" />
                          Open Panels
                        </div>
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                          {launcherOpenWindows.length}
                        </Badge>
                      </div>
                      {launcherOpenWindows.length > 0 ? (
                        <ScrollArea className="min-h-0 flex-1">
                          <div className="space-y-1 pr-3">
                            {launcherOpenWindows.map((entry) => (
                              <button
                                key={entry.id}
                                type="button"
                                className={cn(
                                  "group flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-background/60 px-3 py-2 text-left",
                                  "transition-colors hover:bg-muted/40",
                                )}
                                onClick={() => handleFocusWindow(entry.id)}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="truncate text-xs font-medium"
                                      title={entry.title}
                                    >
                                      {entry.title}
                                    </span>
                                    {entry.tabsCount > 1 && (
                                      <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                                        {entry.tabsCount} tabs
                                      </Badge>
                                    )}
                                    {entry.isPinned && (
                                      <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                                        Pinned
                                      </Badge>
                                    )}
                                  </div>
                                  <div
                                    className="truncate text-[10px] text-muted-foreground"
                                    title={entry.subtitle}
                                  >
                                    {entry.subtitle}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    title="Minimize panel"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      minimizeWindow(entry.id);
                                    }}
                                  >
                                    <Minimize2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    title="Close panel"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      closeWindow(entry.id);
                                    }}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 px-4 py-6 text-center text-xs text-muted-foreground">
                          No open panels.
                        </div>
                      )}
                    </section>

                    <Separator />

                    <section className="flex min-h-0 flex-[0.75] flex-col space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <RotateCcw className="h-3.5 w-3.5" />
                          Minimized
                        </div>
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                          {launcherMinimizedWindows.length}
                        </Badge>
                      </div>
                      {launcherMinimizedWindows.length > 0 ? (
                        <ScrollArea className="min-h-0 flex-1">
                          <div className="space-y-1 pr-3">
                            {launcherMinimizedWindows.map((entry) => (
                              <button
                                key={entry.id}
                                type="button"
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-background/60 px-3 py-2 text-left",
                                  "transition-colors hover:bg-muted/40",
                                )}
                                onClick={() => handleRestoreWindow(entry.id, entry.groupHostId)}
                              >
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="truncate text-xs font-medium"
                                      title={entry.title}
                                    >
                                      {entry.title}
                                    </span>
                                    {entry.groupHostId && (
                                      <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                                        Tab
                                      </Badge>
                                    )}
                                  </div>
                                  <div
                                    className="truncate text-[10px] text-muted-foreground"
                                    title={entry.subtitle}
                                  >
                                    {entry.subtitle}
                                  </div>
                                </div>
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/70" />
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 px-4 py-6 text-center text-xs text-muted-foreground">
                          No minimized panels.
                        </div>
                      )}
                    </section>
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Launch Panels
                      </div>
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                        {launcherComponents.length}
                      </Badge>
                    </div>

                    {pluginsLoading && launcherComponents.length === 0 && (
                      <div className="flex h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-border/50 bg-background/60 text-sm text-muted-foreground">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <div>Loading plugins...</div>
                      </div>
                    )}

                    {!pluginsLoading && groupedLauncherComponents.length > 0 && (
                      <ScrollArea className="min-h-0 flex-1">
                        <div className="space-y-3 pr-3">
                          {groupedLauncherComponents.map((group) => (
                            <div
                              key={group.pluginId}
                              className="overflow-hidden rounded-2xl border border-border/50 bg-background/60"
                            >
                              <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
                                <div className="min-w-0">
                                  <div
                                    className="truncate text-xs font-semibold"
                                    title={group.pluginLabel}
                                  >
                                    {group.pluginLabel}
                                  </div>
                                  <div
                                    className="truncate text-[10px] text-muted-foreground"
                                    title={group.pluginId}
                                  >
                                    {group.pluginId}
                                  </div>
                                </div>
                                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                  {group.entries.length}
                                </Badge>
                              </div>
                              <div className="space-y-1 p-2">
                                {group.entries.map((entry) => (
                                  <div
                                    key={entry.componentId}
                                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/40"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div
                                        className="truncate text-xs font-medium"
                                        title={entry.title}
                                      >
                                        {entry.title}
                                      </div>
                                      <div
                                        className="truncate text-[10px] text-muted-foreground"
                                        title={entry.subtitle}
                                      >
                                        {entry.subtitle}
                                      </div>
                                    </div>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      className="h-7 shrink-0 rounded-lg px-2 text-xs"
                                      onClick={() => handleSpawnComponent(entry)}
                                    >
                                      <Play className="mr-1.5 h-3 w-3" />
                                      Open
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}

                    {!pluginsLoading && !hasLauncherResults && (
                      <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 px-4 py-8 text-center text-xs text-muted-foreground">
                        No panels are available yet.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </ZenWebSocketProvider>
  );
}
