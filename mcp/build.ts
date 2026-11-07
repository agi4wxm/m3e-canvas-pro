/* Builds the MCP server into one Node ESM file, mcp/dist/m3e-canvas-mcp.js, that runs with node, npx or bunx and
 * needs nothing installed beside it. Playwright stays outside (it brings its own browser and is found at run time).
 * The app build (dist/, from `bun run build`) is copied to mcp/dist/app, for the render page file-mode screenshots
 * load; without it the server still runs, and says how to get screenshots.
 *
 *   bun mcp/build.ts            bundle, and copy the app build when there is one
 *   bun mcp/build.ts --no-app   bundle only */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPORT_SOURCE_DIRS, isExportSource } from "../lib/export/sourceList";

/* Bun's bundler, typed as far as it is used here (the project has no Bun types) */
type BuildOutput = { success: boolean; logs: unknown[] };
type Plugin = { name: string; setup(build: { onLoad(o: { filter: RegExp }, fn: () => { contents: string; loader: string }): void }): void };
const { Bun } = globalThis as unknown as { Bun: { build(o: Record<string, unknown>): Promise<BuildOutput> } };

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "..");
const out = join(here, "dist");
const file = join(out, "m3e-canvas-mcp.js");

/* the editor's files a product export copies (export_product), carried inside the bundle: an installed server has no
   checkout to read them from (mcp/src/sources.ts reads the checkout when run from source) */
const sources: Record<string, string> = {};
for (const dir of EXPORT_SOURCE_DIRS)
  for (const name of readdirSync(join(root, dir)).sort()) {
    const path = dir ? `${dir}/${name}` : name;
    if (isExportSource(path)) sources[path] = readFileSync(join(root, path), "utf8");
  }
const embedSources: Plugin = {
  name: "export-sources",
  setup(build) {
    build.onLoad({ filter: /mcp[\\/]src[\\/]sources\.ts$/ }, () => ({
      loader: "ts",
      contents: `const FILES: Record<string, string> = ${JSON.stringify(sources)}\nexport async function readEditorSource(path: string): Promise<string> {\n  const text = Object.hasOwn(FILES, path) ? FILES[path] : undefined\n  if (text === undefined) throw new Error(\`no such source: \${path}\`)\n  return text\n}\n`,
    }));
  },
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const result = await Bun.build({
  entrypoints: [join(here, "src", "cli.ts")],
  target: "node",
  format: "esm",
  outdir: out,
  naming: "m3e-canvas-mcp.js",
  external: ["playwright", "playwright-core", "bufferutil", "utf-8-validate"],
  define: { "process.env.NODE_ENV": '"production"' },
  sourcemap: "none",
  minify: { syntax: true, whitespace: false, identifiers: false },
  plugins: [embedSources],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

/* a command needs the line that says what runs it */
const code = readFileSync(file, "utf8").replace(/^#!.*\n/, "");
writeFileSync(file, `#!/usr/bin/env node\n${code}`, { mode: 0o755 });

const app = join(root, "dist");
if (!process.argv.includes("--no-app") && existsSync(join(app, "index.html"))) {
  cpSync(app, join(out, "app"), { recursive: true });
  console.log(`mcp/dist/m3e-canvas-mcp.js (${(code.length / 1024 / 1024).toFixed(1)} MB) and the app build in mcp/dist/app`);
} else {
  console.log(`mcp/dist/m3e-canvas-mcp.js (${(code.length / 1024 / 1024).toFixed(1)} MB); no app build copied${process.argv.includes("--no-app") ? "" : " (run bun run build first for file-mode screenshots)"}`);
}
