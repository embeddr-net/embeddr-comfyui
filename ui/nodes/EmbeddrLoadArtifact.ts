// @ts-ignore
import { EmbeddrDnDTypes } from "@embeddr/react-ui";
import { app } from "../../../scripts/app.js";
import { registerNodeDragAndDrop } from "../utils/nodeDragAndDrop.js";

app.registerExtension({
  name: "Embeddr.LoadArtifact",
  async beforeRegisterNodeDef(nodeType: any, nodeData: any, app: any) {
    if (nodeData.name === "embeddr.LoadArtifact") {
      // Add a button to open the dialog
      const onNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

        // Add button widget
        this.addWidget("button", "Search Image", "search", () => {
          // Dispatch event to open dialog
          const event = new CustomEvent("embeddr-open-dialog", {
            detail: { nodeId: this.id },
          });
          window.dispatchEvent(event);
        });

        return r;
      };

      // Use utility to register drag and drop
      registerNodeDragAndDrop(nodeType, {
        acceptTypes: [
          EmbeddrDnDTypes.ARTIFACT_ID,
          EmbeddrDnDTypes.IMAGE_ID,
          EmbeddrDnDTypes.ARTIFACT,
          "embeddr/id",
          "embeddr/json",
        ],
        onDrop: (e: DragEvent, node: any) => {
          const dataTransfer = e.dataTransfer;
          if (!dataTransfer) return false;

          let id =
            dataTransfer.getData(EmbeddrDnDTypes.ARTIFACT_ID) ||
            dataTransfer.getData(EmbeddrDnDTypes.IMAGE_ID) ||
            dataTransfer.getData("embeddr/id");

          if (!id) {
            const artifactRaw =
              dataTransfer.getData(EmbeddrDnDTypes.ARTIFACT) ||
              dataTransfer.getData("embeddr/json");
            if (artifactRaw) {
              try {
                const parsed = JSON.parse(artifactRaw);
                id = parsed?.id?.toString?.() || parsed?.artifact_id?.toString?.() || "";
              } catch {
                id = "";
              }
            }
          }

          if (id) {
            const widget = node.widgets?.find((w: any) => w.name === "artifact_id");
            if (widget) {
              widget.value = id;
              if (widget.callback) {
                widget.callback(widget.value);
              }
              node.setDirtyCanvas(true, true);
              return true; // handled
            }
          }
          return false;
        },
      });
    }
  },
});
