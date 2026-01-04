import { app } from "../../../scripts/app.js";

const _ID = "embeddr.MergeIDs";
const _PREFIX = "id";
const _TYPE = "STRING";

app.registerExtension({
  name: "embeddr.dynamic_merge_ids",
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name !== _ID) {
      return;
    }

    // Add initial input on creation
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const me = onNodeCreated?.apply(this);
      // Start with one dynamic input if none exist
      if (!this.inputs || this.inputs.length === 0) {
        this.addInput(`${_PREFIX}1`, _TYPE);
      }
      return me;
    };

    // Handle connections
    const onConnectionsChange = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function (
      slotType,
      slotIdx,
      event,
      linkInfo,
      nodeSlot
    ) {
      const me = onConnectionsChange?.apply(this, arguments);

      // Only care about inputs (slotType 1)
      if (slotType !== 1) return me;

      const inputs = this.inputs || [];
      const lastInput = inputs[inputs.length - 1];

      // If last input is connected, add a new one
      if (lastInput && lastInput.link) {
        this.addInput(`${_PREFIX}${inputs.length + 1}`, _TYPE);
      }

      // Compact: Remove unconnected inputs that are NOT the last one
      // Iterate backwards to avoid index issues
      for (let i = inputs.length - 2; i >= 0; i--) {
        if (!inputs[i].link) {
          this.removeInput(i);
        }
      }

      // Rename all inputs to be sequential
      for (let i = 0; i < this.inputs.length; i++) {
        this.inputs[i].name = `${_PREFIX}${i + 1}`;
      }

      if (this.graph) {
        this.graph.setDirtyCanvas(true);
      }

      return me;
    };
  },
});
