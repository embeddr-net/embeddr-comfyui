// @ts-ignore
import { app } from "../../../scripts/app.js";

app.registerExtension({
  name: "Embeddr.LoadImage",
  async beforeRegisterNodeDef(nodeType: any, nodeData: any, app: any) {
    if (nodeData.name === "embeddr.LoadImage") {
      // Add a button to open the dialog
      const onNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        const r = onNodeCreated
          ? onNodeCreated.apply(this, arguments)
          : undefined;

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

      // Handle image_id updates (if we want to preview)
      // We can reuse the updatePreview logic from LoadImage if we want
      // But here we might just want to show the ID or fetch the image.
      // The python node returns the image, so ComfyUI will handle the preview if we return it in the output.
      // But if we want to show it on the node before execution, we need to fetch it.
      // For now, let's just handle the ID insertion.
    }
  },
});
