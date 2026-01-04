import { useEffect, useState } from "react";
// @ts-ignore
import { app } from "../../../scripts/app.js";

export interface TargetNode {
  id: number;
  title: string;
}

export function useNodeScanner() {
  const [targetNodes, setTargetNodes] = useState<Array<TargetNode>>([]);

  useEffect(() => {
    const scan = () => {
      if (!app.graph) return;
      const nodes = app.graph.findNodesByType
        ? app.graph.findNodesByType("embeddr.LoadImage")
        : [];

      if (nodes) {
        const info = nodes.map((n: any) => ({
          id: n.id,
          title: n.title || `Node ${n.id}`,
        }));

        // Sort alphabetically by title
        info.sort((a: any, b: any) => a.title.localeCompare(b.title));

        setTargetNodes((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(info)) return info;
          return prev;
        });
      }
    };

    const interval = setInterval(scan, 1000);
    scan();
    return () => clearInterval(interval);
  }, []);

  const handleLoadIntoNode = (nodeId: number, imageUrl: string) => {
    const node = app.graph.getNodeById(nodeId);
    if (node) {
      if (node.widgets && node.widgets[0]) {
        node.widgets[0].value = imageUrl;
        if (node.updatePreview) {
          node.updatePreview(imageUrl);
        }
        app.graph.setDirtyCanvas(true, true);
        if (app.extensionManager?.toast) {
          app.extensionManager.toast.add({
            severity: "info",
            summary: "Image Loaded",
            detail: `Updated ${node.title || "Node " + node.id}`,
            life: 1000,
          });
        }
      }
    }
  };

  const handleUseImage = (imageUrl: string) => {
    const selectedNodes = app.canvas.selected_nodes;
    let targetNode = null;

    if (selectedNodes && Object.keys(selectedNodes).length > 0) {
      const firstNode = Object.values(selectedNodes)[0] as any;
      if (firstNode.type === "embeddr.LoadImage") {
        targetNode = firstNode;
      }
    }

    if (targetNode) {
      if (targetNode.widgets && targetNode.widgets[0]) {
        targetNode.widgets[0].value = imageUrl;
        // Trigger updatePreview if available
        if (targetNode.updatePreview) {
          targetNode.updatePreview(imageUrl);
        }
        app.graph.setDirtyCanvas(true, true);
      }
    } else {
      // @ts-ignore
      const LiteGraph = window.LiteGraph;
      const node = LiteGraph.createNode("embeddr.LoadImage");
      if (node) {
        node.pos = [
          app.canvas.graph_mouse[0] || 0,
          app.canvas.graph_mouse[1] || 0,
        ];
        if (node.widgets && node.widgets[0]) {
          node.widgets[0].value = imageUrl;
        }
        app.graph.add(node);

        // Trigger updatePreview if available (must be after add?)
        // Actually updatePreview is on the prototype, so it should be available.
        if (node.updatePreview) {
          node.updatePreview(imageUrl);
        }

        app.graph.setDirtyCanvas(true, true);
        if (app.extensionManager?.toast) {
          app.extensionManager.toast.add({
            severity: "success",
            summary: "Node Created",
            detail: "Created new Embeddr Load Image node",
            life: 2000,
          });
        }
      }
    }
  };

  return {
    targetNodes,
    handleLoadIntoNode,
    handleUseImage,
  };
}
