/* m3e-canvas-mcp: the command a client starts (stdio) or a person runs (--http). See docs/MCP.md. */

import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pkg from "../package.json";
import { BRIDGE_PORT } from "../../lib/mcp/protocol";
import { proxyFetch } from "./generate";
import { HTTP_PORT, newToken, serveHttp } from "./http";
import { createLog } from "./log";
import { createMcpServer } from "./server";
import { langOf, setup } from "./setup";
import { configDir, TrustStore } from "./trust";

const HELP = `m3e-canvas-mcp ${pkg.version}: an MCP server for M3E Canvas Pro

Usage:
  m3e-canvas-mcp [options]                 work on an editor tab paired over the live bridge (default)
  m3e-canvas-mcp --file <project.json|folder>
                                           work on a project file headless, no editor needed
  m3e-canvas-mcp --file <project.json> --live
                                           the tab while one is paired, the file otherwise

Options:
  --file <path>          the project: a file (m3e-canvas <name>.json) or a folder (m3e-project.json with its pictures
                         in m3e-assets/), as the editor saves them; created on the first change if missing
  --live                 also listen for an editor tab when --file is given
  --read-only            offer only the tools that read (outline, find, describe, screenshot, catalogs)
  --http [port]          serve Streamable HTTP at http://127.0.0.1:<port>/mcp (default ${HTTP_PORT}) instead of stdio
  --token <token>        the bearer token for --http (default: M3E_MCP_TOKEN, or a new one, printed at start)
  --port <port>          the live bridge's first port (default ${BRIDGE_PORT}; the next three are tried when busy)
  --origin <origin>      another origin the editor is served from (repeatable; also M3E_MCP_ORIGINS, comma-separated)
  --allow-destructive    file mode: let removing and clearing through without asking
  --forget-editors       forget every pairing an editor was told to remember (they are asked again), then run
  --confirm-timeout <s>  live mode: how long the editor waits for the author to allow a destructive call (default 60)
  --lang <ja|en|zh|ko>   the language new words are written in (file mode; default: the system's)
  --app <dir|url>        the app build, or a running editor, that file-mode screenshots are drawn with
  --allow-outside <origin>
                         let file-mode screenshots load pictures and pages from this origin (repeatable; "*" for any
                         web address). By default they load only the app's own build and what the project holds
  --log <file>           also write the log to this file
  --quiet                log only what must be seen (the pairing code, the token)
  --debug                log every call
  -h, --help             this help
  -v, --version          the version

Environment:
  OPENAI_API_KEY         turns on generate_svg and generate_image (the key stays in this process)
  OPENAI_BASE_URL, M3E_MCP_TEXT_MODEL, M3E_MCP_IMAGE_MODEL   where and with what they draw
  HTTPS_PROXY, NO_PROXY  honoured for the model calls
  PLAYWRIGHT_PATH        where Playwright is, for file-mode screenshots (otherwise NODE_PATH and the global modules)
  M3E_MCP_CONFIG_DIR     where remembered pairings are kept (default: the user's config folder, m3e-canvas-mcp/)
`;

async function main() {
  let a: ReturnType<typeof parse>;
  try {
    a = parse();
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n\n${HELP}`);
    process.exit(2);
  }
  const v = a.values;
  if (v.help) {
    process.stdout.write(HELP);
    return;
  }
  if (v.version) {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }
  const log = createLog({ file: v.log, quiet: v.quiet, debug: v.debug });
  /* stdout is the stdio session's: anything printed there by mistake would break it */
  console.log = console.info = (...x: unknown[]) => log.debug(x.map(String).join(" "));

  /* Node's fetch does not go through HTTPS_PROXY by itself; image calls use the global one */
  const pf = proxyFetch();
  if (pf) globalThis.fetch = pf;

  if (v["forget-editors"]) {
    const trust = TrustStore.at(configDir(process.env));
    await trust.clear();
    log.notice(`Forgot every remembered editor pairing (${trust.path}).`);
  }
  const origins = [...(v.origin ?? []), ...(process.env.M3E_MCP_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)];
  const confirm = v["confirm-timeout"] !== undefined ? Number(v["confirm-timeout"]) : undefined;
  const { backend, registry } = await setup({
    file: v.file,
    live: v.live,
    readOnly: v["read-only"],
    allowDestructive: v["allow-destructive"],
    port: v.port !== undefined ? Number(v.port) : undefined,
    origins,
    lang: langOf(v.lang),
    app: v.app,
    allowOutside: v["allow-outside"],
    confirmMs: confirm !== undefined && Number.isFinite(confirm) ? Math.max(5, confirm) * 1000 : undefined,
    env: process.env,
    version: pkg.version,
    log,
  });
  const makeServer = () => createMcpServer({ backend, registry, version: pkg.version, log });
  log.info(`${registry.tools.length + 1} tools${v["read-only"] ? " (read-only)" : ""}, backend: ${backend.kind}.`);

  let stop: () => Promise<void>;
  if (v.http !== undefined) {
    const token = v.token || process.env.M3E_MCP_TOKEN || newToken();
    const http = await serveHttp({ port: v.http === "" || v.http === "true" ? HTTP_PORT : Number(v.http), token, origins, makeServer, log });
    log.notice(`Streamable HTTP at ${http.url}`);
    log.notice(`Authorization: Bearer ${token}`);
    stop = http.close;
  } else {
    const server = makeServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    stop = () => server.close();
    /* the client closing its end of the pipe is the session ending */
    process.stdin.on("end", () => void quit());
  }
  let quitting = false;
  const quit = async () => {
    if (quitting) return;
    quitting = true;
    await Promise.race([Promise.all([stop().catch(() => {}), backend.close().catch(() => {})]), new Promise((r) => setTimeout(r, 3000))]);
    process.exit(0);
  };
  process.on("SIGINT", () => void quit());
  process.on("SIGTERM", () => void quit());
}

function parse() {
  const args = process.argv.slice(2);
  /* `--http` may stand alone or take a port */
  const i = args.indexOf("--http");
  if (i >= 0 && (i === args.length - 1 || args[i + 1].startsWith("-"))) args.splice(i + 1, 0, "");
  return parseArgs({
    args,
    options: {
      file: { type: "string" },
      live: { type: "boolean" },
      "read-only": { type: "boolean" },
      http: { type: "string" },
      token: { type: "string" },
      port: { type: "string" },
      origin: { type: "string", multiple: true },
      "allow-destructive": { type: "boolean" },
      "forget-editors": { type: "boolean" },
      "confirm-timeout": { type: "string" },
      lang: { type: "string" },
      app: { type: "string" },
      "allow-outside": { type: "string", multiple: true },
      log: { type: "string" },
      quiet: { type: "boolean" },
      debug: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
    allowPositionals: false,
    strict: true,
  });
}

main().catch((e) => {
  process.stderr.write(`[m3e-canvas-mcp] ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
