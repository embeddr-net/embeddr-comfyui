// @ts-ignore
import { app } from "../../../scripts/app.js";

app.registerExtension({
  name: "Embeddr.FindCollection",
  async beforeRegisterNodeDef(nodeType: any, nodeData: any, app: any) {
    if (nodeData.name === "embeddr.FindCollection") {
      // Add a button to open the dialog
      const onNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

        // Custom Widget for Displaying Collection Info
        // We create a custom widget that just renders text, no input
        const displayWidget = this.addWidget("text", "Info", "No Collection Selected", () => {}, {
          serialize: false,
        });
        if (displayWidget.inputEl) {
          displayWidget.inputEl.readOnly = true;
          displayWidget.inputEl.style.opacity = "0.6";
          displayWidget.inputEl.style.fontSize = "10px";
        }

        // Add button widget
        this.addWidget("button", "Search Existing", "search_collection", () => {
          // Dispatch event to open dialog with collection mode
          const event = new CustomEvent("embeddr-open-dialog", {
            detail: {
              nodeId: this.id,
              mode: "collection",
            },
          });
          window.dispatchEvent(event);
        });

        // Patch onConfigure to restore display if needed?
        // For now, let's just use the widget value if it was saved?
        // Ah, serialize: false means it won't be saved.
        // Maybe we want to update it if the collection_id has a value on load?
        // That would require fetching details which is complex here.

        return r;
      };
    }
  },
});
