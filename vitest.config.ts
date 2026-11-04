import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    // its ESM imports have no file extension, which Node cannot resolve; the bundler can
    server: { deps: { inline: [/material-color-utilities/] } },
  },
});
