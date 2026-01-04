import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@embeddr/react-ui/components/dialog";
import { ExploreTab } from "./tabs/ExploreTab";
import { useEmbeddrApi } from "../hooks/useEmbeddrApi";
// @ts-ignore
import { app } from "../../../scripts/app.js";

export function GlobalDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [targetNodeId, setTargetNodeId] = useState<number | null>(null);

  const api = useEmbeddrApi();

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent;
      setTargetNodeId(customEvent.detail.nodeId);
      setIsOpen(true);

      // Trigger a fetch if needed
      if (api.configLoaded) {
        api.fetchImages(true);
      }
    };

    window.addEventListener("embeddr-open-dialog", handleOpen);
    return () => window.removeEventListener("embeddr-open-dialog", handleOpen);
  }, [api.configLoaded]);

  // Theme observer for portals
  useEffect(() => {
    const applyTheme = () => {
      const portals = document.querySelectorAll(
        "[data-radix-portal], [data-slot='dialog-content'], [data-slot='dialog-overlay'], [data-slot='select-content'], [data-slot='select-viewport'], [data-slot='popover-content'], [data-slot='dropdown-menu-content']"
      );

      const isDark = api.theme === "dark";

      portals.forEach((portal) => {
        if (!portal.classList.contains("tailwind")) {
          portal.classList.add("tailwind");
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

  const handleSelect = (image: any) => {
    if (targetNodeId !== null) {
      const node = app.graph.getNodeById(targetNodeId);
      if (node) {
        // Assuming the first widget is the image_id input
        // We should check the widget name or type
        const idWidget = node.widgets?.find((w: any) => w.name === "image_id");
        if (idWidget) {
          idWidget.value = image.id.toString();
          if (idWidget.callback) {
            idWidget.callback(idWidget.value);
          }
        } else {
          // Fallback to first widget if name doesn't match
          if (node.widgets && node.widgets[0]) {
            node.widgets[0].value = image.id.toString();
          }
        }

        // Also update image_url if it exists (for preview/compatibility)
        const urlWidget = node.widgets?.find(
          (w: any) => w.name === "image_url"
        );
        if (urlWidget) {
          urlWidget.value = image.image_url;
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
          <DialogTitle>Select Image</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden p-4 pt-0">
          <ExploreTab
            {...api}
            activeTab="explore"
            onImageSelect={handleSelect}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
