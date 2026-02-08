import React from "react";
import ReactDOM from "react-dom/client";
import * as ReactDOMLib from "react-dom";
import * as EmbeddrUI from "@embeddr/react-ui";
import * as Lucide from "lucide-react";
import * as ReactQuery from "@tanstack/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Recharts from "recharts";
import { ImageDialogProvider } from "@embeddr/react-ui/providers/ImageDialogProvider";
import { ExternalNavProvider } from "@embeddr/react-ui";
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
// @ts-ignore
import "./globals.css";

(window as any).React = React;
(window as any).ReactDOM = ReactDOMLib;
(window as any).Lucide = Lucide;
(window as any).ReactQuery = ReactQuery;
(window as any).Recharts = Recharts;

const embeddrUI: Record<string, any> = { ...EmbeddrUI };
if (!("usePluginDrop" in embeddrUI)) {
  embeddrUI.usePluginDrop = () => ({
    isOver: false,
    canDrop: false,
    dropRef: () => {},
  });
}
if (!("usePluginStorage" in embeddrUI)) {
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
    <ImageDialogProvider>
      <GlobalDialog />
      <ZenShell />
    </ImageDialogProvider>
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
