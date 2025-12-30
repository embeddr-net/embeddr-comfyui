// @ts-ignore
import { app } from "../../../scripts/app.js";

app.registerExtension({
  name: "Embeddr.LoadImage",
  async beforeRegisterNodeDef(nodeType: any, nodeData: any, app: any) {
    if (nodeData.name === "embeddr.LoadImage") {
      const hideWidget = (node: any) => {
        const urlWidget = node.widgets?.find(
          (w: any) => w.name === "image_url",
        );
        if (urlWidget) {
          urlWidget.type = "hidden";
          urlWidget.computeSize = () => [0, 0];
          if (urlWidget.inputEl) {
            urlWidget.inputEl.style.display = "none";
            urlWidget.inputEl.hidden = true;
          }
        }
      };

      // Add updatePreview method
      nodeType.prototype.updatePreview = function (url: string) {
        if (!url) return;

        hideWidget(this);

        const img = new Image();
        img.onload = () => {
          // Use a custom property to avoid conflict with ComfyUI's default preview
          this._embeddr_img = img;
          // Ensure node has some size if it collapsed
          if (this.size[0] < 64 || this.size[1] < 64) {
            this.setSize([256, 256]);
          }
          app.graph.setDirtyCanvas(true, true);
        };
        img.src = url;
      };

      const onNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        const r = onNodeCreated
          ? onNodeCreated.apply(this, arguments)
          : undefined;

        hideWidget(this);

        const urlWidget = this.widgets?.find(
          (w: any) => w.name === "image_url",
        );

        // If we have a value initially, load it
        if (urlWidget && urlWidget.value) {
          this.updatePreview(urlWidget.value);
        }

        // Hook into widget callback
        if (urlWidget) {
          const originalCallback = urlWidget.callback;
          urlWidget.callback = (value: string) => {
            if (originalCallback) {
              originalCallback(value);
            }
            this.updatePreview(value);
          };
        }

        return r;
      };

      // Ensure widget is hidden when loading from workflow
      const onConfigure = nodeType.prototype.onConfigure;
      nodeType.prototype.onConfigure = function () {
        const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
        hideWidget(this);
        return r;
      };

      // Draw the image
      const onDrawBackground = nodeType.prototype.onDrawBackground;
      nodeType.prototype.onDrawBackground = function (ctx: any) {
        // Only draw if we have an image
        if (this._embeddr_img) {
          // Don't call original onDrawBackground to avoid double drawing
          // if the original one draws something that conflicts.
          // However, we might want to call it if it draws the node background color.
          // But usually onDrawBackground draws the content.
          // Let's try NOT calling it if we have an image.

          const img = this._embeddr_img;

          // Calculate available area
          const w = this.size[0];
          const h = this.size[1];

          // Draw
          ctx.save();

          // Better aspect ratio drawing (contain)
          const ratio = img.width / img.height;
          const nodeRatio = w / h;

          let drawW, drawH, drawX, drawY;

          if (ratio > nodeRatio) {
            // Image is wider
            drawW = w;
            drawH = w / ratio;
            drawX = 0;
            drawY = (h - drawH) / 2;
          } else {
            // Image is taller
            drawH = h;
            drawW = h * ratio;
            drawY = 0;
            drawX = (w - drawW) / 2;
          }

          ctx.drawImage(img, drawX, drawY, drawW, drawH);

          ctx.restore();
        } else {
          if (onDrawBackground) {
            onDrawBackground.apply(this, arguments);
          }
        }
      };
    }
  },
});
