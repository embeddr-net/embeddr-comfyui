// @ts-ignore
import { app } from "../../../scripts/app.js";
import { registerNodeDragAndDrop } from "../utils/nodeDragAndDrop.js";

app.registerExtension({
  name: "Embeddr.UploadArtifact",
  async beforeRegisterNodeDef(nodeType: any, nodeData: any, app: any) {
    if (nodeData.name === "embeddr.UploadArtifact") {
      // Add a button to open the dialog
      const onNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

        // Add button widget
        this.addWidget("button", "Select Collection", "select_collection", () => {
          // Dispatch event to open dialog with collection mode
          const event = new CustomEvent("embeddr-open-dialog", {
            detail: {
              nodeId: this.id,
              mode: "collection",
            },
          });
          window.dispatchEvent(event);
        });

        return r;
      };

      // Use utility to register drag and drop for collections
      registerNodeDragAndDrop(nodeType, {
        acceptTypes: ["embeddr/collection_id"],
        onDrop: (e: DragEvent, node: any) => {
          const id = e.dataTransfer?.getData("embeddr/collection_id");
          if (id) {
            const widget = node.widgets?.find((w: any) => w.name === "collection_ids");
            if (widget) {
              // Append if shift key held? Or just replace?
              // For now, let's assume replacement or simple csv append if non-empty
              const current = widget.value ? widget.value.toString() : "";
              if (current && !current.includes(id)) {
                widget.value = `${current},${id}`;
              } else {
                widget.value = id;
              }

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
