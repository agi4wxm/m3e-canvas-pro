/* The consistency table as the kits' own test beds run it. The kits never import the editor, so their scripts
 * (scripts/gen-miniapp.ts, scripts/gen-rn.ts) write it there: the table's runner (check.ts, types.ts, tinyReact.ts as
 * they are), the rows, and each row's design printed by the kit's own printer as an exported app has it (its screens,
 * its calls, its spec or its bindings), over a stand-in of the API client that sends each call to the row's back end.
 * `check:miniapp` and `check:rn` fail when what is written there is behind the table. */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { apiModelOf, type ApiOperation } from "../../export/api";
import { callsModule, printMiniApp, screensIndex, specModule } from "../../export/miniapp/app";
import { contractOf } from "../../export/product";
import { authSource } from "../../export/targets/webSources";
import type { Doc } from "../../tokens";
import { CAPABILITY_OP } from "./check";
import { designDoc } from "./design";
import { ROWS } from "./rows";
import type { KitRow, Row } from "./types";

const own = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

/** where each kit's test bed holds the table */
export const TABLE_DIRS = { miniapp: "miniapp-kit/test/table", rn: "rn/__tests__/table" } as const;

/** the files under a table's folder the table no longer writes (a row taken out): by their paths from the repo's root */
export function staleTableFiles(root: string, dir: string, written: Record<string, unknown>): string[] {
  const at = join(root, dir);
  if (!existsSync(at)) return [];
  const walk = (rel: string): string[] =>
    readdirSync(join(root, rel), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${rel}/${e.name}`) : [`${rel}/${e.name}`]));
  return walk(dir).filter((p) => !(p in written));
}

/** the runner's own files, as the kits' test beds hold them: the table's types stand on their own there */
function runnerFiles(head: string): Record<string, string> {
  const types = own("types.ts").replace(
    /^import type \{[^}]*\} from "\.\.\/model";$/m,
    "/* the design's action, as the kit's own types say it */\ntype VarValue = string | number | boolean;\ntype VarType = \"text\" | \"number\" | \"bool\" | \"color\";\ntype Action = Record<string, unknown>;\ntype ActionBody = Record<string, unknown>;",
  );
  return { "types.ts": `${head}\n${types}`, "check.ts": `${head}\n${own("check.ts")}`, "tinyReact.ts": `${head}\n${own("tinyReact.ts")}` };
}

const kitRow = (row: Row, doc: Doc, keys: Record<string, string>): KitRow => {
  const { design: _design, ...rest } = row;
  return { ...rest, vars: (doc.vars ?? []).map((v) => v.id), screens: keys };
};

const json = (v: unknown) => JSON.stringify(v, null, 1);

/** the typed client of the API (packages/api) as the printed calls use it: each operation by its name, sent over the
 *  transport it is made over, a refusal thrown as the client throws it */
function clientModule(ops: ApiOperation[], head: string): string {
  const table = Object.fromEntries(ops.map((op) => [op.name, { operationId: op.operationId, method: op.method.toUpperCase(), path: op.path }]));
  return `${head}
import type { AbortSignalLike, Transport, TransportRequest } from "@m3e/app-runtime";

type Input = { params?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown };
type Init = { headers?: Record<string, string> };
export type CallInit = Init & { signal?: AbortSignalLike; onUploadProgress?: (sent: number, total: number) => void };

const OPS: Record<string, { operationId: string; method: string; path: string }> = ${json(table)};

export type Api = Record<string, (input?: Input, init?: Init) => Promise<unknown>> & { request: <T = unknown>(r: TransportRequest) => Promise<T> };

/** a path parameter as one segment of the path */
export const segment = (v: unknown) => encodeURIComponent(String(v));

export function createApi(t: Transport): Api {
  const send = async <T = unknown>(r: TransportRequest): Promise<T> => {
    const res = await t.request(r);
    if (res.status < 200 || res.status >= 300) throw Object.assign(new Error(\`\${r.operationId} failed with status \${res.status}\`), { status: res.status, body: res.body, operationId: r.operationId });
    return res.body as T;
  };
  const api: Record<string, unknown> = { request: send };
  for (const [name, op] of Object.entries(OPS))
    api[name] = (input: Input = {}, init: Init = {}) => {
      const path = op.path.replace(/\\{([^{}]+)\\}/g, (_, p: string) => segment(input.params?.[p] ?? ""));
      return send({ operationId: op.operationId, method: op.method as TransportRequest["method"], path, ...(input.query ? { query: input.query as Record<string, string> } : {}), ...(init.headers ? { headers: init.headers } : {}), ...(input.body !== undefined ? { body: input.body } : {}) });
    };
  return api as Api;
}
`;
}

/** the runtime of a row's app, made as the exported app makes it, over the table's back end */
const runtimeModule = (doc: Doc, head: string) => `${head}
import { createRuntime, type AuthConfig } from "@m3e/app-runtime";
import { capabilities, transport } from "../backend";

/** what the session needs of the contract, as the exported app writes it */
const AUTH: AuthConfig = ${authSource(doc.api ?? {})};

export const runtime = createRuntime({ transport, auth: AUTH, lang: "en", now: () => 0, capabilities });
`;

const backendModule = (head: string) => `${head}
import type { CapabilityHost, FailureKind, Transport, TransportRequest, TransportResponse } from "@m3e/app-runtime";

let send: (r: TransportRequest) => Promise<TransportResponse> = async () => ({ status: 404, headers: {}, body: undefined });

/** where the rows' runtimes send their calls: the back end of the row being run */
export const transport: Transport = { request: (r) => send(r) };

/** The platform's adapters, as the rows' runtimes invoke them: each invoke goes to the row's back end the way a call
 *  does, under ${JSON.stringify(CAPABILITY_OP)} and its name (check.ts), and its answer is read back as the outcome. */
export const capabilities: CapabilityHost = {
  invoke: async (name, args) => {
    const r = await send({ operationId: ${JSON.stringify(CAPABILITY_OP)} + name, method: "POST", path: "/__capabilities/" + name, body: args });
    if (r.status >= 200 && r.status < 300) return { ok: true, result: r.body };
    return { ok: false, error: { type: ((r.body as { type?: string } | undefined)?.type ?? "failed") as FailureKind, capability: name } };
  },
};

export function answerWith(fn: typeof send) {
  send = fn;
}
`;

/** what the React Native kit's runner needs of a row beyond the table's: the app's memory as it starts */
export type RnRow = KitRow & {
  appVars: { id: string; name: string; type: "text" | "number" | "bool" | "color"; value: string | number | boolean }[];
  hidden: string[];
  initial: string;
  /** the screens that need a session, and the sign-in screen, by key (the app's routes guard them) */
  auth: Record<string, "required" | "login">;
};

/** Every file of the table in the React Native kit's test bed (rn/__tests__/table), by its path from the repo's root.
 *  Each row is the exported phone app's own code for its design (lib/export/targets/mobile.ts): its screens, its
 *  bindings, its effects, its contract and its API module, with the platform's pieces (the runtime's storage and
 *  transport, the file pickers, the typed client) stood in for. */
export async function rnTable(): Promise<Record<string, string>> {
  const { mobileTarget } = await import("../../export/targets/mobile");
  const { printRnScreens, screensIndex } = await import("../../export/rn/print");
  const { productVersion } = await import("../../export/product");
  const at = TABLE_DIRS.rn;
  const head = "// Generated by scripts/gen-rn.ts (bun run gen:rn) from lib/actions/consistency. Do not edit.";
  const files: Record<string, string> = {};
  const runner = runnerFiles(head);
  files[`${at}/types.ts`] = runner["types.ts"];
  files[`${at}/check.ts`] = runner["check.ts"];
  files[`${at}/backend.ts`] = backendModule(head);
  const rows: RnRow[] = [];
  for (const row of ROWS) {
    const { doc } = designDoc(row.design);
    const api = apiModelOf("Consistency", contractOf(doc, "Consistency"));
    const ctx = { doc, widths: {}, lang: "en" as const, name: "consistency", scope: "@m3e", title: "Consistency", api, version: productVersion, read: async () => "", warnings: [], differences: [] };
    const app = await mobileTarget.build(ctx);
    if (!app) throw new Error("the phone app was not built");
    const dir = `${at}/${row.id}`;
    /* the app's own modules where they are in the test bed: the kit is rn/src/kit, the runtime the shared one */
    const placed = (text: string) => text.replaceAll('"../../kit"', '"../../../../src/kit"').replaceAll('"../kit"', '"../../../src/kit"').replaceAll('"@m3e/api"', '"./client"');
    for (const [path, file] of Object.entries(app.files)) {
      const m = /^src\/generated\/(screens\/[^/]+\.tsx?|bind\.ts|effects\.ts|contract\.ts|api\.ts)$/.exec(path);
      if (m && typeof file.body === "string") files[`${dir}/${m[1]}`] = placed(file.body);
    }
    files[`${dir}/client.ts`] = clientModule(api.operations, head);
    files[`${dir}/runtime.ts`] = `${head}
import { createRuntime } from "@m3e/app-runtime";
import { capabilities, transport } from "../backend";
import { AUTH } from "./contract";

export const runtime = createRuntime({ transport, auth: AUTH, lang: "en", now: () => 0, capabilities });
`;
    files[`${dir}/files.ts`] = `${head}
/* the device's file pickers: no row picks a file */
export const pickFile = async (_accept: string) => undefined;
export const fileName = (f: { name?: string } | undefined) => f?.name ?? "";
`;
    const printed = printRnScreens(doc, {}, { kitImport: "../../kit", runtime: { bind: "../bind" } });
    files[`${dir}/screens/index.ts`] = screensIndex(printed);
    const auth = Object.fromEntries(printed.screens.flatMap((s) => (s.auth ? [[s.key, s.auth] as const] : [])));
    rows.push({ ...kitRow(row, doc, Object.fromEntries(printed.screens.map((s) => [s.key, s.id]))), appVars: printed.vars, hidden: printed.hidden, initial: printed.initial, auth });
  }
  files[`${at}/rows.ts`] = `${head}
import type { KitRow } from "./types";

/** the consistency table (lib/actions/consistency/rows.ts): each row's steps, what it expects, the divergences it records,
 *  and the app's memory as the printed app starts it */
export const ROWS: (KitRow & {
  appVars: { id: string; name: string; type: "text" | "number" | "bool" | "color"; value: string | number | boolean }[];
  hidden: string[];
  initial: string;
  auth: Record<string, "required" | "login">;
})[] = ${json(rows)};
`;
  return files;
}

/** Every file of the table in the mini-program kit's test bed (miniapp-kit/test/table), by its path from the repo's
 *  root. Each row is the exported mini-program's own code for its design: the screens printed by lib/export/miniapp, the
 *  calls and the spec. */
export async function miniappTable(): Promise<Record<string, string>> {
  const at = TABLE_DIRS.miniapp;
  const head = "// Generated by scripts/gen-miniapp.ts (bun run gen:miniapp) from lib/actions/consistency. Do not edit.";
  const files: Record<string, string> = {};
  for (const [name, text] of Object.entries(runnerFiles(head))) files[`${at}/${name}`] = text;
  files[`${at}/backend.ts`] = backendModule(head);
  const rows: KitRow[] = [];
  for (const row of ROWS) {
    const { doc } = designDoc(row.design);
    const api = apiModelOf("Consistency", contractOf(doc, "Consistency"));
    const app = await printMiniApp(doc, {}, { kitImport: "../../../../src/kit", runtimeImport: "@m3e/app-runtime", callsImport: "../calls" });
    const dir = `${at}/${row.id}`;
    for (const s of app.printed.screens) files[`${dir}/screens/${s.component}.tsx`] = s.source;
    files[`${dir}/screens/index.ts`] = screensIndex(app.printed);
    files[`${dir}/calls.ts`] = callsModule(api, { apiImport: "./api", kitImport: "../../../src/kit", runtimeFrom: "./runtime" });
    files[`${dir}/spec.ts`] = specModule(doc, app.printed, api, { kitImport: "../../../src/kit", callsFrom: "./calls" });
    files[`${dir}/api.ts`] = clientModule(api.operations, head);
    files[`${dir}/runtime.ts`] = runtimeModule(doc, head);
    rows.push(kitRow(row, doc, Object.fromEntries(app.printed.screens.map((s) => [s.key, s.id]))));
  }
  files[`${at}/rows.ts`] = `${head}
import type { KitRow } from "./types";

/** the consistency table (lib/actions/consistency/rows.ts): each row's steps, what it expects, the divergences it records */
export const ROWS: KitRow[] = ${json(rows)};
`;
  return files;
}
