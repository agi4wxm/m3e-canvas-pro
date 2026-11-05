import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    // agent worktrees are full copies of the project; their tests are not this checkout's
    exclude: [...configDefaults.exclude, ".claude/**"],
    // its ESM imports have no file extension, which Node cannot resolve; the bundler can
    server: { deps: { inline: [/material-color-utilities/] } },
  },
});
