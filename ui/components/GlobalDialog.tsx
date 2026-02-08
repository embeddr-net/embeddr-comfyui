import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@embeddr/react-ui/components/dialog";
import { useImageDialog } from "@embeddr/react-ui";
import { ExploreTab } from "./tabs/ExploreTab";
import { CollectionSelector } from "./selectors/CollectionSelector";
import { useEmbeddrApi } from "../hooks/useEmbeddrApi";
// @ts-ignore
import { app } from "../../../scripts/app.js";

type DialogMode = "image" | "collection";

export function GlobalDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [targetNodeId, setTargetNodeId] = useState<number | null>(null);
  const [mode, setMode] = useState<DialogMode>("image");

  const api = useEmbeddrApi();
  const { setApiKey: setDialogApiKey } = useImageDialog();

  useEffect(() => {
    if (setDialogApiKey && api.apiKey) {
      setDialogApiKey(api.apiKey);
    }
  }, [api.apiKey, setDialogApiKey]);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent;
      setTargetNodeId(customEvent.detail.nodeId);
      const requestedMode = customEvent.detail.mode || "image";
      setMode(requestedMode);
      setIsOpen(true);

      // Trigger a fetch if needed
      if (api.configLoaded) {
        if (requestedMode === "collection") {
          api.fetchCollections();
        } else {
          api.fetchImages(true);
        }
      }
    };

    window.addEventListener("embeddr-open-dialog", handleOpen);
    return () => window.removeEventListener("embeddr-open-dialog", handleOpen);
  }, [api.configLoaded]);

  // Theme observer for portals
  useEffect(() => {
    const applyTheme = () => {
      const portals = document.querySelectorAll(
        "[data-radix-portal], [data-slot='dialog-content'], [data-slot='dialog-overlay'], [data-slot='select-content'], [data-slot='select-viewport'], [data-slot='popover-content'], [data-slot='dropdown-menu-content']",
      );

      const isDark = api.theme === "dark";

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
    };

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          applyTheme();
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also apply immediately
    applyTheme();

    return () => observer.disconnect();
  }, [api.theme]);

  const handleSelect = (item: any) => {
    if (targetNodeId !== null) {
      const node = app.graph.getNodeById(targetNodeId);
      if (node) {
        if (mode === "collection") {
          // Handle Collection Selection

          // 1. Try "collection_ids" -> Set ID
          const idWidget = node.widgets?.find(
            (w: any) => w.name === "collection_ids",
          );
          if (idWidget) {
            idWidget.value = item.id.toString();
            if (idWidget.callback) {
              idWidget.callback(idWidget.value);
            }
          }

          // 2. Try "collection_id" -> Set ID (for FindCollection node V2)
          console.log(
            "[Embeddr] Debug: Listing node widgets:",
            node.widgets?.map((w: any) => w.name),
          );

          const colIdWidget = node.widgets?.find(
            (w: any) => w.name === "collection_id",
          );

          let idSet = false;
          if (colIdWidget && item.id) {
            console.log("[Embeddr] Setting collection_id to", item.id);
            colIdWidget.value = item.id.toString();
            if (colIdWidget.callback) {
              colIdWidget.callback(colIdWidget.value);
            }
            idSet = true;
          } else {
            console.warn(
              "[Embeddr] collection_id widget not found on node or invalid item.id!",
              { widgetFound: !!colIdWidget, itemId: item.id },
            );
          }

          // 3. Update Info Widget (Friendly display)
          const infoWidget = node.widgets?.find((w: any) => w.name === "Info");
          if (infoWidget) {
            const count = item.file_count !== undefined ? item.file_count : "?";
            infoWidget.value = `${
              item.label || item.name
            } (${count} items) [ID: ${item.id?.substring(0, 8)}...]`;
          }

          // 4. Update or Clear Name Widget
          // If we successfully set the ID, clear the name widget to avoid confusion
          // and ensure the backend uses the ID.
          const nameWidget = node.widgets?.find(
            (w: any) => w.name === "collection_name",
          );
          if (nameWidget) {
            if (idSet) {
              // Clear name to prioritize ID match and avoid ambiguity
              console.log(
                "[Embeddr] Clearing collection_name widget to prioritize ID",
              );
              nameWidget.value = "";
            } else {
              nameWidget.value = item.label || item.name;
            }

            if (nameWidget.callback) {
              nameWidget.callback(nameWidget.value);
            }
          }

          // Force UI update
          if (app.graph) {
            app.graph.setDirtyCanvas(true, true);
          }
        } else {
          // Handle Image Selection
          // Check for artifact_id (V2) or image_id (V1)
          const idWidget = node.widgets?.find(
            (w: any) => w.name === "artifact_id" || w.name === "image_id",
          );
          if (idWidget) {
            idWidget.value = item.id.toString();
            if (idWidget.callback) {
              idWidget.callback(idWidget.value);
            }
          } else {
            // Fallback to first widget if name doesn't match
            if (node.widgets && node.widgets[0]) {
              node.widgets[0].value = item.id.toString();
            }
          }

          // Also update image_url if it exists (for preview/compatibility)
          const urlWidget = node.widgets?.find(
            (w: any) => w.name === "image_url",
          );
          if (urlWidget) {
            urlWidget.value = item.image_url;
          }
        }

        app.graph.setDirtyCanvas(true, true);
      }
    }
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>
            {mode === "collection" ? "Select Collection" : "Select Image"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden p-4 pt-0">
          {mode === "collection" ? (
            <CollectionSelector
              collections={api.collections}
              loading={api.loadingCollections}
              onSelect={handleSelect}
              fetchCollections={api.fetchCollections}
              createCollection={api.createCollection}
              creating={api.creating}
            />
          ) : (
            <ExploreTab
              {...api}
              activeTab="explore"
              onImageSelect={handleSelect}
              apiKey={api.apiKey}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
