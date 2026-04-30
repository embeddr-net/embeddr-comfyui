// @ts-check
import { tanstackConfig } from "@tanstack/eslint-config";

export default [
  ...tanstackConfig,
  {
    ignores: ["js/**", "build/**", ".vite/**", "coverage/**", "*.config.{js,ts,mjs,cjs,mts}"],
  },
  {
    files: ["ui/**/*.{ts,tsx}", "nodes/**/*.{ts,tsx}"],
    rules: {
      // pending eslint-plugin-react-hooks v7 + tanstack-config compatibility
      "react-hooks/exhaustive-deps": "off",
      // Too aggressive for code that handles localStorage / untyped JSON
      // (e.g. version-checking parsed values where TS narrows to a literal).
      "@typescript-eslint/no-unnecessary-condition": "off",
      // ComfyUI integration files extensively use @ts-ignore to bridge
      // ComfyUI globals (`app`, the LiteGraph types, etc) that lack
      // proper TypeScript declarations. Requiring a description on each
      // would just generate noise like "@ts-ignore — ComfyUI lacks types".
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
];
