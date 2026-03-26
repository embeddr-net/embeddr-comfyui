import React from "react";
import ReactDOM from "react-dom/client";
import * as ReactDOMLib from "react-dom";
import * as EmbeddrUI from "@embeddr/react-ui";
import * as Lucide from "lucide-react";
import * as ReactQuery from "@tanstack/react-query";
import * as THREE from "three";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Recharts from "recharts";
import { ImageDialogProvider } from "@embeddr/react-ui/providers/ImageDialogProvider";
import { ExternalNavProvider } from "@embeddr/react-ui";
import { globalEventBus } from "@embeddr/zen-shell";
// @ts-ignore
import { app } from "../../../scripts/app.js";
import EmbeddrPanel from "./components/panels/EmbeddrPanel.js";
import { GlobalDialog } from "./components/GlobalDialog";
import { ZenShell } from "./components/ZenShell";
import "./nodes/EmbeddrLoadArtifact.js";
import "./nodes/EmbeddrMergeIds.js";
import "./nodes/EmbeddrLoRAStack.js";
import "./nodes/EmbeddrUploadArtifact.js";
import "./nodes/EmbeddrFindCollection.js";
import "./nodes/EmbeddrAction.js";
// @ts-ignore
import "./globals.css";

(window as any).React = React;
(window as any).ReactDOM = ReactDOMLib;
(window as any).Lucide = Lucide;
(window as any).ReactQuery = ReactQuery;
(window as any).Recharts = Recharts;
(window as any).THREE = THREE;
(window as any).Embeddr = {
  ...((window as any).Embeddr || {}),
  eventBus: globalEventBus,
};

const embeddrUI: Record<string, any> = { ...EmbeddrUI };
const fallbackDnDTypes = embeddrUI.EmbeddrDnDTypes || {
  ARTIFACT: "application/embeddr-artifact-json",
  ARTIFACT_ID: "application/embeddr-artifact-id",
  IMAGE_ID: "application/embeddr-image-id",
  IMAGE_URL: "application/external-image-url",
  VIDEO_URL: "application/external-video-url",
  PREVIEW_URL: "application/embeddr-preview-url",
  ARTIFACT_TYPE: "application/embeddr-artifact-type",
};
if (typeof embeddrUI.usePluginDrop !== "function") {
  embeddrUI.usePluginDrop = ({
    onArtifact,
    onFile,
    onUrl,
    onText,
    stopPropagation = true,
  }: {
    onArtifact?: (data: Record<string, any>) => void;
    onFile?: (file: File) => void;
    onUrl?: (url: string) => void;
    onText?: (text: string) => void;
    stopPropagation?: boolean;
  } = {}) => {
    const [isDragOver, setIsDragOver] = React.useState(false);

    const handleDragOver = React.useCallback(
      (event: React.DragEvent) => {
        event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        setIsDragOver(true);
      },
      [stopPropagation],
    );

    const handleDragLeave = React.useCallback(
      (event: React.DragEvent) => {
        event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        setIsDragOver(false);
      },
      [stopPropagation],
    );

    const handleDrop = React.useCallback(
      (event: React.DragEvent) => {
        event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        setIsDragOver(false);

        const dt = event.dataTransfer;
        const artifactJson = dt.getData(fallbackDnDTypes.ARTIFACT);
        if (artifactJson && onArtifact) {
          try {
            onArtifact(JSON.parse(artifactJson));
            return;
          } catch (error) {
            console.warn("[EmbeddrUI] Failed to parse dropped artifact", error);
          }
        }

        const artifactId =
          dt.getData(fallbackDnDTypes.ARTIFACT_ID) ||
          dt.getData(fallbackDnDTypes.IMAGE_ID);
        if (artifactId && onArtifact) {
          onArtifact({
            id: artifactId,
            type: dt.getData(fallbackDnDTypes.ARTIFACT_TYPE) || "image",
            previewUrl: dt.getData(fallbackDnDTypes.PREVIEW_URL),
            imageUrl: dt.getData(fallbackDnDTypes.IMAGE_URL),
            videoUrl: dt.getData(fallbackDnDTypes.VIDEO_URL),
          });
          return;
        }

        if (dt.files.length > 0 && onFile) {
          Array.from(dt.files).forEach((file) => onFile(file));
          return;
        }

        const url = dt.getData("text/uri-list");
        if (url && onUrl) {
          onUrl(url);
          return;
        }

        const text = dt.getData("text/plain");
        if (text) {
          if (text.startsWith("http") && onUrl) {
            onUrl(text);
          } else if (onText) {
            onText(text);
          }
        }
      },
      [onArtifact, onFile, onText, onUrl, stopPropagation],
    );

    return {
      handleDragOver,
      handleDragLeave,
      handleDrop,
      isDragOver,
    };
  };
}
if (typeof embeddrUI.usePluginStorage !== "function") {
  embeddrUI.usePluginStorage = <T,>(
    pluginId: string,
    key: string,
    initialValue: T,
  ) => {
    const storageKey = pluginId ? `plugin-storage:${pluginId}:${key}` : key;
    const [value, setValue] = React.useState<T>(() => {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) {
        try {
          return JSON.parse(raw) as T;
        } catch {
          return initialValue;
        }
      }
      return initialValue;
    });
    React.useEffect(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch (e) {
        console.warn("[EmbeddrUI] Failed to persist plugin storage", e);
      }
    }, [storageKey, value]);
    return [value, setValue] as const;
  };
}
if (typeof embeddrUI.usePanelLifecycle !== "function") {
  embeddrUI.usePanelLifecycle = (
    request: ((path: string, init?: RequestInit) => Promise<any>) | undefined,
    config: {
      panelId: string;
      panelType: string;
      title?: string;
      windowId?: string | null;
      meta?: Record<string, any>;
    },
  ) => {
    const configRef = React.useRef(config);
    configRef.current = config;

    React.useEffect(() => {
      if (typeof request !== "function") return;
      const { panelId, panelType, title, windowId, meta } = configRef.current;
      request("/execute/ui.panel_register", {
        method: "POST",
        body: JSON.stringify({
          panel_id: panelId,
          panel_type: panelType,
          title,
          window_id: windowId ?? null,
          meta,
        }),
      }).catch(() => undefined);

      return () => {
        request("/execute/ui.panel_unregister", {
          method: "POST",
          body: JSON.stringify({ panel_id: configRef.current.panelId }),
        }).catch(() => undefined);
      };
    }, [request]);

    const updatePanel = React.useCallback(
      (payload: {
        items?: Array<Record<string, any>>;
        lastActive?: boolean;
        meta?: Record<string, any>;
      }) => {
        if (typeof request !== "function") return;
        const body: Record<string, any> = {
          panel_id: configRef.current.panelId,
        };
        if (payload.items !== undefined) body.items = payload.items;
        if (payload.lastActive) body.last_active = new Date().toISOString();
        if (payload.meta !== undefined) body.meta = payload.meta;
        request("/execute/ui.panel_update", {
          method: "POST",
          body: JSON.stringify(body),
        }).catch(() => undefined);
      },
      [request],
    );

    return { updatePanel };
  };
}
if (typeof embeddrUI.registerReactiveContext !== "function") {
  embeddrUI.registerReactiveContext = () => () => undefined;
}
if (typeof embeddrUI.resolveReactiveConfig !== "function") {
  embeddrUI.resolveReactiveConfig = () => undefined;
}
if (typeof embeddrUI.publishReactiveArtifactState !== "function") {
  embeddrUI.publishReactiveArtifactState = () => undefined;
}
if (typeof embeddrUI.readReactiveArtifactState !== "function") {
  embeddrUI.readReactiveArtifactState = () => null;
}
if (typeof embeddrUI.subscribeReactiveArtifactState !== "function") {
  embeddrUI.subscribeReactiveArtifactState = () => () => undefined;
}
if (typeof embeddrUI.matchReactiveMessage !== "function") {
  embeddrUI.matchReactiveMessage = () => false;
}
if (typeof embeddrUI.extractReactiveArtifactId !== "function") {
  embeddrUI.extractReactiveArtifactId = () => undefined;
}
if (typeof embeddrUI.extractReactivePreview !== "function") {
  embeddrUI.extractReactivePreview = () => undefined;
}
if (typeof embeddrUI.syncRenderablesFromLotus !== "function") {
  embeddrUI.syncRenderablesFromLotus = async () => [];
}
if (typeof embeddrUI.resolveRenderable !== "function") {
  embeddrUI.resolveRenderable = () => undefined;
}
(window as any).EmbeddrUI = embeddrUI;
(window as any)["@embeddr/react-ui"] = embeddrUI;
(window as any).EmbeddrReactUI = embeddrUI;
(window as any).embeddr_react_ui = embeddrUI;
(window as any)["lucide-react"] = Lucide;
(window as any).lucideReact = Lucide;
(window as any)["@tanstack/react-query"] = ReactQuery;
(window as any).reactQuery = ReactQuery;
(window as any)["recharts"] = Recharts;
(window as any).Recharts = Recharts;

document.documentElement.classList.add("embeddr-theme-root", "font-sans");
document.body.classList.add("embeddr-theme-root", "font-sans");

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const urlStr = input instanceof Request ? input.url : input.toString();
  const endpoint =
    localStorage.getItem("embeddr_endpoint") || "http://localhost:8003";
  const apiKey = localStorage.getItem("embeddr_api_key") || "";

  const shouldAttachKey = (() => {
    try {
      if (!apiKey) return false;
      const target = urlStr.startsWith("http")
        ? new URL(urlStr)
        : new URL(urlStr, window.location.origin);
      const base = new URL(endpoint);
      return (
        target.origin === base.origin && target.pathname.startsWith("/api/v1/")
      );
    } catch {
      return false;
    }
  })();

  if (!shouldAttachKey) {
    return originalFetch(input, init);
  }

  const headers = new Headers(
    input instanceof Request ? input.headers : undefined,
  );
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  if (!headers.has("X-API-Key")) headers.set("X-API-Key", apiKey);

  if (input instanceof Request) {
    const nextRequest = new Request(input, { ...init, headers });
    return originalFetch(nextRequest);
  }

  return originalFetch(input, { ...init, headers });
};

const queryClient = new QueryClient();

// Mount Global Dialog
const dialogContainer = document.createElement("div");
dialogContainer.id = "embeddr-global-dialog-root";
// Add tailwind class to ensure styles work if they rely on parent class
dialogContainer.classList.add("tailwind");
dialogContainer.classList.add("font-sans");
dialogContainer.classList.add("embeddr-theme-root");
document.body.appendChild(dialogContainer);
const dialogRoot = ReactDOM.createRoot(dialogContainer);
dialogRoot.render(
  <QueryClientProvider client={queryClient}>
    <ExternalNavProvider>
      <ImageDialogProvider>
        <GlobalDialog />
        <ZenShell />
      </ImageDialogProvider>
    </ExternalNavProvider>
  </QueryClientProvider>,
);
app.extensionManager.registerSidebarTab({
  id: "embeddr",
  icon: "mdi mdi-cloud-search-outline",
  title: "Embeddr",
  type: "custom",
  render(container) {
    document.documentElement.classList.add("tailwind");

    container.innerHTML = "";
    container.classList.add("tailwind");
    container.classList.add("font-sans");
    container.classList.add("embeddr-sidebar-container");
    // Default to dark, but let React handle it
    container.classList.add("embeddr-theme-root");
    // Prevent the parent container from scrolling
    container.style.overflow = "hidden";
    container.style.height = "100%";

    // Ensure any future portals get proper styling
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          const portals = document.querySelectorAll(
            "[data-radix-portal], [data-slot='dialog-content'], [data-slot='dialog-overlay'], [data-slot='select-content'], [data-slot='select-viewport'], [data-slot='popover-content'], [data-slot='dropdown-menu-content']",
          );
          const isDark =
            container.classList.contains("dark") ||
            localStorage.getItem("embeddr_theme") === "dark";
          portals.forEach((portal) => {
            if (!portal.classList.contains("tailwind")) {
              portal.classList.add("tailwind");
            }
            if (!portal.classList.contains("font-sans")) {
              portal.classList.add("font-sans");
            }
            if (!portal.classList.contains("embeddr-theme-root")) {
              portal.classList.add("embeddr-theme-root");
            }
            if (isDark) {
              portal.classList.add("dark");
            } else {
              portal.classList.remove("dark");
            }
          });
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const root = ReactDOM.createRoot(container);
    root.render(
      <QueryClientProvider client={queryClient}>
        <ImageDialogProvider>
          <ExternalNavProvider>
            <EmbeddrPanel />
          </ExternalNavProvider>
        </ImageDialogProvider>
      </QueryClientProvider>,
    );
    return () => {
      observer.disconnect();
      root.unmount();
    };
  },
});

// Register Node Extension
app.registerExtension({
  name: "Embeddr.NodeHelper",
  aboutPageBadges: [
    {
      label: "Embeddr",
      url: "https://github.com/embeddr-net/embeddr-local",
      icon: "pi pi-globe",
    },
  ],
  async nodeCreated(node) {
    // Handle Embeddr Load Image Node
  },

  async loadedGraphNode(node) {
    // No-op
  },
});
