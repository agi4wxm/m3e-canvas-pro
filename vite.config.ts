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
  server: { port: 3000 },
})
