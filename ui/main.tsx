import React from "react";
import ReactDOM from "react-dom/client";
import { ImageDialogProvider } from "@embeddr/react-ui/providers/ImageDialogProvider";
import { ExternalNavProvider } from "@embeddr/react-ui";
// @ts-ignore
import { app } from "../../../scripts/app.js";
import EmbeddrPanel from "./components/panels/EmbeddrPanel.js";
import { GlobalDialog } from "./components/GlobalDialog";
import "./nodes/EmbeddrLoadImage.js";
// @ts-ignore
import "./globals.css";

// Mount Global Dialog
const dialogContainer = document.createElement("div");
dialogContainer.id = "embeddr-global-dialog-root";
// Add tailwind class to ensure styles work if they rely on parent class
dialogContainer.classList.add("tailwind");
dialogContainer.classList.add("dark");
document.body.appendChild(dialogContainer);
const dialogRoot = ReactDOM.createRoot(dialogContainer);
dialogRoot.render(
  <React.StrictMode>
    <ImageDialogProvider>
      <GlobalDialog />
    </ImageDialogProvider>
  </React.StrictMode>
);

// Register Embeddr Sidebar
app.extensionManager.registerSidebarTab({
  id: "embeddr",
  icon: "mdi mdi-cloud-search-outline",
  title: "Embeddr",
  type: "custom",
  render(container) {
    document.documentElement.classList.add("dark", "tailwind");

    container.innerHTML = "";
    container.classList.add("tailwind");
    container.classList.add("embeddr-sidebar-container");
    // Default to dark, but let React handle it
    container.classList.add("dark");
    // Prevent the parent container from scrolling
    container.style.overflow = "hidden";
    container.style.height = "100%";

    // Ensure any future portals get proper styling
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          const portals = document.querySelectorAll(
            "[data-radix-portal], [data-slot='dialog-content'], [data-slot='dialog-overlay'], [data-slot='select-content'], [data-slot='select-viewport'], [data-slot='popover-content'], [data-slot='dropdown-menu-content']"
          );
          const isDark = container.classList.contains("dark");
          portals.forEach((portal) => {
            if (!portal.classList.contains("tailwind")) {
              portal.classList.add("tailwind");
            }
            // // Sync dark mode
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
      <ImageDialogProvider>
        <ExternalNavProvider>
          <EmbeddrPanel />
        </ExternalNavProvider>
      </ImageDialogProvider>
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
