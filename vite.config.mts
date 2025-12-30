import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";

// Plugin to inline CSS into JS
const inlineCssPlugin: any = {
  name: "inline-css",
  apply: "build" as const,
  enforce: "post",
  generateBundle(options: any, bundle: any) {
    let cssContent = "";
    const cssFiles: string[] = [];

    // Collect all CSS files
    for (const [fileName, asset] of Object.entries(bundle)) {
      if (fileName.endsWith(".css") && (asset as any).type === "asset") {
        cssContent += (asset as any).source;
        cssFiles.push(fileName);
      }
    }

    // Inject CSS into main JS file
    if (cssContent && Object.keys(bundle).some((f) => f.endsWith(".js"))) {
      const jsFile = Object.keys(bundle).find(
        (f) => f.endsWith(".js") && f.startsWith("main"),
      );
      if (jsFile) {
        const jsAsset = bundle[jsFile] as any;

        // Wrap all CSS rules with a scoping selector
        const scopedCss = cssContent.replace(
          /([^{}]+){([^{}]*)}/g,
          (match, selector, rules) => {
            // Skip @rules (like @media, @keyframes, @import)
            if (selector.trim().startsWith("@")) {
              return match;
            }

            // Skip if already scoped to avoid double scoping
            if (selector.includes(".tailwind")) {
              return match;
            }

            // Handle :root selector specially
            if (selector.trim() === ":root") {
              return match; // Keep :root global
            }

            // Add scoping to each selector
            const scopedSelectors = selector
              .split(",")
              .map((s) => {
                const trimmed = s.trim();
                // Don't scope html, body, or other global selectors that are already in your CSS
                if (
                  trimmed === "html" ||
                  trimmed === "body" ||
                  trimmed === "*"
                ) {
                  return `.tailwind ${trimmed}`;
                }
                return `.tailwind ${trimmed}`;
              })
              .join(", ");
            return `${scopedSelectors} { ${rules} }`;
          },
        );

        const styleInject = `(function(){const css=${JSON.stringify(
          scopedCss,
        )};const style=document.createElement('style');style.setAttribute('data-extension','nynxz_custom_nodes');style.textContent=css;document.head.appendChild(style);})();`;
        jsAsset.code = styleInject + jsAsset.code;
      }
    }

    // Remove CSS files from bundle
    for (const cssFile of cssFiles) {
      delete bundle[cssFile];
    }
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), inlineCssPlugin],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./ui", import.meta.url)),
      "@components": path.resolve(__dirname, "ui/components"),
      "@hooks": path.resolve(__dirname, "ui/hooks"),
    },
  },
  define: {
    "process.env": {}, // fixes 'process is not defined'
  },
  build: {
    lib: {
      entry: "./ui/main.tsx",
      formats: ["es"],
      fileName: "main",
    },
    rollupOptions: {
      external: [
        "../../../scripts/app.js", // Comfy's app object
        "../../../../scripts/app.js", // Comfy's app object from components
        /^primevue\/?.*/,
        /^@primevue\/themes\/?.*/,
      ],
      output: {
        dir: "js",
        entryFileNames: "main.js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
    outDir: "js",
    sourcemap: false,
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
  },
});
