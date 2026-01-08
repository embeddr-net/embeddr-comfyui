import { app } from "../../../scripts/app.js";

const _ID = "embeddr.LoRAStack";

app.registerExtension({
  name: "embeddr.dynamic_lora_stack",
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name !== _ID) {
      return;
    }

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const me = onNodeCreated?.apply(this);

      // We expect lora_1 and strength_1 to exist from the python definition
      const loraWidget = this.widgets.find((w) => w.name === "lora_1");
      if (!loraWidget) return me;

      // Store the options for creating new widgets
      this.loraOptions = loraWidget.options.values;

      // Helper to add a new pair of widgets
      this.addLoRAPair = (index) => {
        const loraName = `lora_${index}`;
        const strengthName = `strength_${index}`;

        // Add LoRA Combo
        const w = this.addWidget(
          "combo",
          loraName,
          "None",
          (v) => {
            this.updateWidgets();
          },
          { values: this.loraOptions }
        );

        // Add Strength Float
        const s = this.addWidget("number", strengthName, 1.0, (v) => {}, {
          min: -10.0,
          max: 10.0,
          step: 0.01,
          precision: 2,
        });

        return { w, s };
      };

      // Helper to update widgets based on values
      this.updateWidgets = () => {
        const widgets = this.widgets;
        // Find all lora widgets
        const loraWidgets = widgets.filter((w) => w.name.startsWith("lora_"));

        // Sort by index
        loraWidgets.sort((a, b) => {
          const idxA = parseInt(a.name.split("_")[1]);
          const idxB = parseInt(b.name.split("_")[1]);
          return idxA - idxB;
        });

        const lastWidget = loraWidgets[loraWidgets.length - 1];
        const lastIndex = parseInt(lastWidget.name.split("_")[1]);

        // If last widget has a value != "None", add a new one
        if (lastWidget.value !== "None") {
          this.addLoRAPair(lastIndex + 1);
        }

        // If we have more than 1 widget, and the last TWO are "None", remove the last one
        // Actually, we just want to ensure there is exactly one "None" at the end?
        // Or maybe just ensure there is at least one "None" at the end.
        // And remove any "None" that are not at the end? No, user might want to skip one.

        // Let's stick to: Always have one empty slot at the end.
        // If the last one is filled, add one.
        // If the second to last one is empty AND the last one is empty, remove the last one.

        if (loraWidgets.length > 1) {
          const secondLastWidget = loraWidgets[loraWidgets.length - 2];
          if (
            lastWidget.value === "None" &&
            secondLastWidget.value === "None"
          ) {
            // Remove the last pair
            // We need to remove both lora and strength widgets
            const strengthName = `strength_${lastIndex}`;

            // Find index of widgets to remove
            const wIndex = this.widgets.findIndex(
              (w) => w.name === lastWidget.name
            );
            if (wIndex > -1) this.widgets.splice(wIndex, 1);

            const sIndex = this.widgets.findIndex(
              (w) => w.name === strengthName
            );
            if (sIndex > -1) this.widgets.splice(sIndex, 1);

            // Resize node
            this.onResize?.(this.size);
            this.graph?.setDirtyCanvas(true);
          }
        }
      };

      // Hook into the first widget's callback
      const originalCallback = loraWidget.callback;
      loraWidget.callback = (v) => {
        originalCallback?.(v);
        this.updateWidgets();
      };

      return me;
    };
  },
});
