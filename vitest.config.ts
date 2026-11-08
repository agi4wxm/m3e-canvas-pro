import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) },
      /* the product's packages, as the files an export copies as they are name them (lib/export/copy.ts) */
      { find: /^@m3e\/api$/, replacement: fileURLToPath(new URL("./lib/export/files/api/index.ts", import.meta.url)) },
      { find: /^@m3e\/app-runtime$/, replacement: fileURLToPath(new URL("./lib/export/files/appRuntime/index.ts", import.meta.url)) },
    ],
  },
  test: {
    // agent worktrees are full copies of the project; their tests are not this checkout's. rn/ is a package of its own with its own runner (jest), miniapp-kit/ too (its own vitest)
    exclude: [...configDefaults.exclude, ".claude/**", "rn/**", "miniapp-kit/**"],
    // several tests draw every part, kit or template in every language; on a busy machine 5s is not enough for them
    testTimeout: 20_000,
    // a file's setup (beforeAll) loads every part's modules once; with several suites sharing the machine 10s is not enough
    hookTimeout: 60_000,
    // its ESM imports have no file extension, which Node cannot resolve; the bundler can
    server: { deps: { inline: [/material-color-utilities/] } },
  },
});
