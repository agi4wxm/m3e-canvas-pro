import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, lazyPlugins } from "vite-plus"

// Deployed under this path when VITE_BASE_PATH is set (e.g. "/m3e-canvas");
// SITE_ORIGIN only feeds absolute URLs in the head metadata.
const basePath = process.env.VITE_BASE_PATH ?? "/"
const siteOrigin = process.env.VITE_SITE_ORIGIN ?? ""

export default defineConfig({
  base: basePath,
  plugins: lazyPlugins(() => [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    {
      name: "canvas-meta",
      transformIndexHtml: (html) =>
        html
          .replaceAll("%SITE_ORIGIN%", siteOrigin)
          .replaceAll("%BASE%", basePath.replace(/\/$/, "")),
    },
  ]),
  resolve: {
    alias: [{ find: /^@\//, replacement: `${__dirname}/` }],
  },
  lint: {
    /* the consistency table's rows as the kits' test beds hold them: exported apps' code, printed by lib/export and checked
       there by the kits' own lint (scripts/gen-rn.ts, scripts/gen-miniapp.ts write them) */
    ignorePatterns: ["rn/__tests__/table/**", "miniapp-kit/test/table/**"],
    /* the printed proofs hold taps as data: a call's or an invoke's `then` is an action body, never awaited */
    overrides: [
      { files: ["rn/src/printed/**", "miniapp-kit/src/printed/**"], rules: { "unicorn/no-thenable": "off" } },
      /* the mobile app's own files every export copies (rn/src/app): written as products have always had them, and linted
         with the kit's ESLint, the product's own; a form's `then` there is an action body too */
      { files: ["rn/src/app/**"], rules: { "unicorn/no-thenable": "off", "unicorn/prefer-string-starts-ends-with": "off" } },
    ],
  },
  server: {
    port: 3000,
    // agent worktrees are full copies of the project: a change in one must not reload this one
    watch: { ignored: ["**/.claude/**"] },
  },
})
