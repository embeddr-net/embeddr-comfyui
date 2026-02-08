import React, { useEffect, useState, useMemo, useCallback } from "react";
import type { EmbeddrAPI } from "@embeddr/react-ui/types";
import {
  ZenPanelManagerCore,
  useZenWindowStore,
  usePluginRegistry,
  loadExternalPlugins,
  DynamicPluginComponent,
  PluginErrorBoundary,
  type PluginManifest,
  type ZenWindowRendererProps,
  EmbeddrProvider,
  type PluginLoaderAdapter,
} from "@embeddr/zen-shell";
import { useEmbeddrApi } from "../hooks/useEmbeddrApi";
import {
  Terminal,
  Grid,
  Maximize2,
  Minimize2,
  X,
  Play,
  RefreshCw,
  LayoutTemplate,
} from "lucide-react";
import { Button } from "@embeddr/react-ui/components/button";
import { cn } from "@embeddr/react-ui";

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
  const api = useEmbeddrApi();
  const updateWindow = useZenWindowStore((s) => s.updateWindow);
  const baseApi = useMemo(() => createEmbeddrApiAdapter(api), [api]);

  const resolved = useMemo(
    () => resolveComponentId(windowState.componentId, plugins),
    [windowState.componentId, plugins],
  );

  const handleClose = useCallback(() => {
    useZenWindowStore.getState().closeWindow(id);
  }, [id]);

  const handleFocus = useCallback(() => {
    useZenWindowStore.getState().bringToFront(id);
  }, [id]);

  if (!resolved) {
    return (
      <div style={{ pointerEvents: "auto" }}>
        <ZenDraggablePanel
          id={id}
          title="Error"
          onClose={handleClose}
          defaultPosition={{ x: 100, y: 100 }}
          defaultSize={{ width: 300, height: 100 }}
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
        title={
          windowState.title || resolved.def?.label || resolved.componentName
        }
        onClose={handleClose}
        position={windowState.position}
        size={windowState.size}
      >
        {(() => {
          const pluginApi = extendApiForPlugin(baseApi, resolved.pluginId);
          const GlobalEmbeddrProvider =
            (window as any).EmbeddrUI?.EmbeddrProvider || EmbeddrProvider;
          return (
            <BasicWindowPanel
              id={id}
              title={
                windowState.title ||
                resolved.def?.label ||
                resolved.componentName
              }
              position={windowState.position}
              size={windowState.size}
              isActive={isActive}
              zIndex={props.zIndex}
              onClose={handleClose}
              onMouseDown={handleFocus}
              onPositionChange={(pos) => updateWindow(id, { position: pos })}
              onSizeChange={(next) => updateWindow(id, { size: next })}
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
                    {...windowState.props}
                  />
                </PluginErrorBoundary>
              </GlobalEmbeddrProvider>
            </BasicWindowPanel>
          );
        })()}
      </WindowErrorBoundary>
    </div>
  );
});

function BasicWindowPanel({
  id,
  title,
  position,
  size,
  isActive,
  zIndex,
  onClose,
  onMouseDown,
  onPositionChange,
  onSizeChange,
  children,
}: {
  id: string;
  title: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  isActive?: boolean;
  zIndex?: number;
  onClose: () => void;
  onMouseDown?: (event: React.MouseEvent) => void;
  onPositionChange?: (pos: { x: number; y: number }) => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState(position || { x: 100, y: 100 });
  const [dimensions, setDimensions] = useState(
    size || { width: 500, height: 400 },
  );
  const dragRef = React.useRef<{
    startX: number;
    startY: number;
    pointerId: number;
  } | null>(null);
  const resizeRef = React.useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    pointerId: number;
  } | null>(null);

  useEffect(() => {
    if (position) setPos(position);
  }, [position?.x, position?.y]);

  useEffect(() => {
    if (size) setDimensions(size);
  }, [size?.width, size?.height]);

  const handlePointerDown = (event: React.PointerEvent) => {
    event.stopPropagation();
    onMouseDown?.(event as unknown as React.MouseEvent);
    dragRef.current = {
      startX: event.clientX - pos.x,
      startY: event.clientY - pos.y,
      pointerId: event.pointerId,
    };
  };

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }
    const next = {
      x: event.clientX - dragRef.current.startX,
      y: event.clientY - dragRef.current.startY,
    };
    setPos(next);
  }, []);

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
        return;
      }
      dragRef.current = null;
      onPositionChange?.(pos);
    },
    [onPositionChange, pos],
  );

  const handleResizeDown = (event: React.PointerEvent) => {
    event.stopPropagation();
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startW: dimensions.width,
      startH: dimensions.height,
      pointerId: event.pointerId,
    };
  };

  const handleResizeMove = useCallback(
    (event: PointerEvent) => {
      if (
        !resizeRef.current ||
        resizeRef.current.pointerId !== event.pointerId
      ) {
        return;
      }
      const next = {
        width: Math.max(
          240,
          resizeRef.current.startW + (event.clientX - resizeRef.current.startX),
        ),
        height: Math.max(
          180,
          resizeRef.current.startH + (event.clientY - resizeRef.current.startY),
        ),
      };
      setDimensions(next);
    },
    [dimensions.width, dimensions.height],
  );

  const handleResizeUp = useCallback(
    (event: PointerEvent) => {
      if (
        !resizeRef.current ||
        resizeRef.current.pointerId !== event.pointerId
      ) {
        return;
      }
      resizeRef.current = null;
      onSizeChange?.(dimensions);
    },
    [dimensions, onSizeChange],
  );

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointermove", handleResizeMove);
    window.addEventListener("pointerup", handleResizeUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointermove", handleResizeMove);
      window.removeEventListener("pointerup", handleResizeUp);
    };
  }, [handlePointerMove, handlePointerUp, handleResizeMove, handleResizeUp]);

  return (
    <div
      className={cn(
        "fixed rounded-md border border-border bg-background/95 backdrop-blur shadow-xl overflow-hidden",
        isActive ? "ring-1 ring-primary/40" : "",
      )}
      style={{
        left: pos.x,
        top: pos.y,
        width: dimensions.width,
        height: dimensions.height,
        zIndex: zIndex ?? 9999,
        pointerEvents: "auto",
      }}
      data-panel-id={id}
    >
      <div
        className="h-10 border-b border-border flex items-center justify-between px-3 bg-muted/50 cursor-move"
        onPointerDown={handlePointerDown}
      >
        <div className="text-sm font-medium truncate">{title}</div>
        <Button
          variant="ghost"
          size="icon-sm"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
      <div className="h-[calc(100%-40px)] w-full">{children}</div>
      <div
        className="absolute bottom-1 right-1 h-3 w-3 cursor-se-resize bg-muted/80 border border-border rounded"
        onPointerDown={handleResizeDown}
      />
    </div>
  );
}

class WindowErrorBoundary extends React.Component<
  {
    title: string;
    onClose: () => void;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
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
      const pos = this.props.position || { x: 100, y: 100 };
      const size = this.props.size || { width: 500, height: 400 };
      return (
        <div
          className="fixed z-[9999] border border-border bg-background/95 backdrop-blur shadow-xl rounded-md overflow-hidden"
          style={{
            left: pos.x,
            top: pos.y,
            width: size.width,
            height: size.height,
          }}
        >
          <div className="h-10 border-b border-border flex items-center justify-between px-3 bg-muted/50">
            <div className="text-sm font-medium truncate">
              {this.props.title}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={this.props.onClose}>
              <X className="w-3 h-3" />
            </Button>
          </div>
          <div className="p-4 text-xs text-muted-foreground whitespace-pre-wrap">
            {this.state.error.message}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

type EmbeddrApiAdapterInput = ReturnType<typeof useEmbeddrApi>;

function createEmbeddrApiAdapter(input: EmbeddrApiAdapterInput): EmbeddrAPI {
  const backendUrl = (input.endpoint || "http://localhost:8003").replace(
    /\/$/,
    "",
  );
  const apiBase = `${backendUrl}/api/v1`;

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

  const eventTarget = new EventTarget();

  const api: EmbeddrAPI = {
    stores: {
      global: {
        selectedImage: null,
        selectImage: () => {},
      },
      generation: {
        workflows: [],
        selectedWorkflow: null,
        generations: [],
        isGenerating: false,
        generate: async () => {},
        setWorkflowInput: () => {},
        selectWorkflow: () => {},
      },
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
        return (raw !== null ? (JSON.parse(raw) as T) : defaultValue) as T;
      },
      set: (key: string, value: any) => {
        localStorage.setItem(key, JSON.stringify(value));
      },
      getPlugin: <T,>(pluginId: string, key: string, defaultValue?: T) => {
        const raw = localStorage.getItem(`${pluginId}:${key}`);
        return (raw !== null ? (JSON.parse(raw) as T) : defaultValue) as T;
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
        if (inputData?.limit !== undefined)
          q.append("limit", String(inputData.limit));
        if (inputData?.offset !== undefined)
          q.append("offset", String(inputData.offset));
        if (inputData?.type_name) q.append("type_name", inputData.type_name);
        if (inputData?.sort) q.append("sort", inputData.sort);
        if (inputData?.ids?.length) q.append("ids", inputData.ids.join(","));
        const qs = q.toString();
        return jsonRequest(`/artifacts${qs ? `?${qs}` : ""}`);
      },
      get: (id: string) => jsonRequest(`/artifacts/${id}`),
      getContentUrl: (id: string) => `${apiBase}/artifacts/${id}/content`,
      resolve: (inputData: any) => jsonRequest(`/artifacts/${inputData.id}`),
      getPreviewUrl: (
        id: string,
        type: "thumbnail" | "preview" = "thumbnail",
      ) => `${apiBase}/artifacts/${id}/preview?preview_type=${type}`,
      getEmbeddings: (id: string) => jsonRequest(`/artifacts/${id}/embeddings`),
      getAnnotations: (id: string) =>
        jsonRequest(`/artifacts/${id}/annotations`),
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
        if (params?.maxDepth !== undefined)
          q.append("max_depth", String(params.maxDepth));
        if (params?.includeLineage !== undefined)
          q.append("include_lineage", String(params.includeLineage));
        if (params?.includeRelations !== undefined)
          q.append("include_relations", String(params.includeRelations));
        const qs = q.toString();
        return jsonRequest(`/artifacts/${id}/subgraph${qs ? `?${qs}` : ""}`);
      },
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
    },
    lotus: {
      invoke: (capId: string, payload?: Record<string, any>) =>
        jsonRequest(`/lotus/${capId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload ?? {}),
        }),
      query: (query: string, limit = 20) =>
        jsonRequest(
          `/lotus/query?q=${encodeURIComponent(query)}&limit=${limit}`,
        ),
      list: (payload?: any) => {
        const q = new URLSearchParams();
        if (payload?.kind) q.append("kind", payload.kind);
        if (payload?.plugin) q.append("plugin", payload.plugin);
        if (payload?.slot) q.append("slot", payload.slot);
        if (payload?.limit) q.append("limit", String(payload.limit));
        if (payload?.offset) q.append("offset", String(payload.offset));
        return jsonRequest(
          `/lotus/list${q.toString() ? `?${q.toString()}` : ""}`,
        );
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
    events: {
      on: (event, listener) => {
        const handler = (e: Event) => listener((e as CustomEvent).detail);
        eventTarget.addEventListener(event, handler as EventListener);
        return () =>
          eventTarget.removeEventListener(event, handler as EventListener);
      },
      off: (event, listener) => {
        eventTarget.removeEventListener(event, listener as EventListener);
      },
      emit: (event, payload) => {
        eventTarget.dispatchEvent(new CustomEvent(event, { detail: payload }));
      },
    },
    comfy: {
      getLoras: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
      getCheckpoints: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
      getEmbeddings: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
      getSamplers: async () => ({ samplers: [], schedulers: [] }),
    },
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
  };

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

        if (
          url.includes("/api/v1/lotus/") &&
          (nextInit.method || "GET").toUpperCase() === "POST"
        ) {
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
  const [minimized, setMinimized] = useState(false);

  let api;
  try {
    api = useEmbeddrApi();
  } catch (e) {
    console.error("[ZenShell] Failed to get API context", e);
    return null;
  }

  const { plugins, knownPlugins } = usePluginRegistry();
  const spawnWindow = useZenWindowStore((s) => s.spawnWindow);
  const embeddrApi = useMemo(
    () => createEmbeddrApiAdapter(api),
    [api.endpoint, api.apiKey, api.apiClient],
  );

  useEffect(() => {
    console.log("[ZenShell] Mounted");
    return () => console.log("[ZenShell] Unmounted");
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
            console.error(
              "[ZenShell] Plugin fetch failed",
              res.status,
              res.statusText,
            );
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
        const baseUrl = (api.endpoint || "http://localhost:8003").replace(
          /\/$/,
          "",
        );
        const url = manifest.url;

        if (!url) return "";

        if (url.startsWith("/")) {
          const target = `${baseUrl}${url}`;
          return `/embeddr/proxy?url=${encodeURIComponent(target)}`;
        }
        return url;
      },
      resolveCssUrl: (manifest) => {
        const baseUrl = (api.endpoint || "http://localhost:8003").replace(
          /\/$/,
          "",
        );
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
      setIsOpen((prev) => !prev);
    };
    const handleLaunch = (e: CustomEvent) => {
      console.log("[ZenShell] Launch event received", e.detail);
      setIsOpen(true);
      if (e.detail && e.detail.componentId) {
        const title = e.detail.title || e.detail.componentId;
        spawnWindow(e.detail.componentId, title, e.detail.props);
      }
    };

    const targets: Window[] = [];
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
      target.addEventListener(
        "embeddr-launch-window",
        handleLaunch as EventListener,
      );
    });

    return () => {
      targets.forEach((target) => {
        target.removeEventListener("embeddr-toggle-shell", handleToggle);
        target.removeEventListener(
          "embeddr-launch-window",
          handleLaunch as EventListener,
        );
      });
    };
  }, [spawnWindow]);

  // Initial Load
  useEffect(() => {
    if (!api.configLoaded) return;
    console.log("[ZenShell] Loading external plugins...");
    loadExternalPlugins({ adapter });
  }, [api.configLoaded, adapter]);

  // We always render the Manager (so windows exist), but maybe hide the Dock
  return (
    <>
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
            <ZenPanelManagerCore
              useWindowStore={useZenWindowStore}
              WindowRenderer={CustomWindowRenderer}
            />
          </EmbeddrProvider>
        </div>
      </div>

      {/* The Shell Dock / Launcher */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-[9999] flex flex-col overflow-hidden items-center justify-center pointer-events-auto",
            // Centered circular dock logic
            "bottom-5 left-1/2 -translate-x-1/2",
            minimized
              ? "w-10 h-10 rounded-full bg-background/95 backdrop-blur shadow-2xl border border-border cursor-pointer hover:scale-110"
              : "w-[600px] h-[400px] rounded-xl bg-background/95 backdrop-blur shadow-2xl border border-border flex flex-col",
          )}
          // If minimized, clicking opens it
          onClick={minimized ? () => setMinimized(false) : undefined}
        >
          {minimized ? (
            <div className="flex items-center justify-center w-full h-full text-primary">
              <LayoutTemplate className="w-5 h-5" />
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="h-10 border-b border-border flex items-center justify-between px-4 bg-muted/50 select-none w-full shrink-0">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <LayoutTemplate className="w-3 h-3 text-primary" />
                  Zen Launcher
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMinimized(true);
                    }}
                  >
                    <Minimize2 className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                    }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 w-full">
                <div className="text-xs text-muted-foreground px-2 uppercase tracking-wider font-bold">
                  Available Plugins ({knownPlugins.length})
                </div>
                {knownPlugins.length === 0 && (
                  <div className="p-4 text-center text-muted-foreground text-sm flex flex-col items-center justify-center h-40">
                    <RefreshCw className="w-8 h-8 mb-4 animate-spin opacity-50" />
                    Loading plugins...
                  </div>
                )}

                {knownPlugins.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {knownPlugins.map((pid, idx) => {
                      const p = plugins[pid];
                      return (
                        <div
                          key={pid || `plugin-${idx}`}
                          className="p-3 border rounded-lg hover:bg-muted/50 transition-all hover:scale-[1.02] cursor-default bg-card shadow-sm"
                        >
                          <div className="font-semibold text-sm flex items-center gap-2 mb-2 border-b pb-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                            <div className="truncate" title={p.name || pid}>
                              {p.name || pid}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            {p.components?.map((c: any, cIdx: number) => {
                              const componentId = `${pid}-${
                                c.exportName ||
                                c.component ||
                                c.name ||
                                `comp-${cIdx}`
                              }`;
                              return (
                                <Button
                                  key={componentId}
                                  variant="secondary"
                                  size="sm"
                                  className="h-8 text-xs justify-start px-2 w-full"
                                  onClick={() =>
                                    spawnWindow(
                                      componentId,
                                      c.label ||
                                        c.name ||
                                        c.component ||
                                        c.exportName ||
                                        pid,
                                    )
                                  }
                                >
                                  <Play className="w-3 h-3 mr-2 opacity-50 shrink-0" />
                                  <span className="truncate">
                                    {c.label || c.name || c.component}
                                  </span>
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => loadExternalPlugins({ adapter })}
                >
                  <RefreshCw className="w-3 h-3 mr-2" /> Reload Plugins
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
