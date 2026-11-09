/* packages/capabilities: the platform capabilities the product uses (docs/平台能力.md), as typed interfaces and a
 * registry. M3E implements none of them and embeds no SDK, key or permission declaration: the catalog, the registry
 * (adapters written in each app's src/custom/capabilities.ts, the platform's defaults for the generic ones, else
 * `not-implemented`, told in development) and the mock answers are the design editor's own code (lib/capabilities),
 * copied as it is into src/engine; what the design says (which capabilities, the product's own, how the mocks answer
 * them) is data beside it. Only a product that uses a capability has the package. */

import { capabilitiesUsed, usedDefinitions } from "../../capabilities/doc";
import { failuresOf } from "../../capabilities/catalog";
import type { CapabilityDef, CapabilitySchema } from "../../capabilities/types";
import { schemaTypeTs } from "../../api/typescript";
import type { JsonSchema } from "../../api/types";
import { GENERATED, jsonCode, jsonFile, str } from "../code";
import { generated, type ProductContext, type ProductTarget, type Workspace } from "../types";

/** the editor's files the package is made of (what lib/capabilities/index.ts says stands on its own) */
export const CAPABILITY_ENGINE_FILES = ["types", "catalog", "registry", "mock"].map((n) => `lib/capabilities/${n}.ts`);

/** a capability's name as the start of a type's name: payment.pay → PaymentPay, rtc.view → RtcView */
export const typeBase = (name: string) =>
  name
    .split(".")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("")
    .replace(/[^A-Za-z0-9]/g, "");

const ts = (s: CapabilitySchema | undefined) => schemaTypeTs((s ?? { type: "object" }) as JsonSchema, { comments: false });

/** a type of no key: what an empty map of calls or of a view's events is */
export const NONE = "Record<never, never>";

/** The interfaces of the capabilities used: each call's arguments and result, each event's payload, each view's props
 *  and events; the map of the calls by name, and what an app's adapters are. */
export function typesModule(defs: CapabilityDef[]): string {
  const calls = defs.filter((d) => d.kind === "call");
  const views = defs.filter((d) => d.kind === "view");
  const events = defs.filter((d) => d.kind === "event");
  const out: string[] = [GENERATED, "/* The platform capabilities this product uses, as types (from their JSON Schemas). */", ""];
  for (const d of calls) {
    out.push(`/** what ${d.name} is given */`, `export type ${typeBase(d.name)}Args = ${ts(d.args)}`, "");
    out.push(`/** what ${d.name} gives back; it fails with ${failuresOf(d).join(", ") || "nothing"} */`, `export type ${typeBase(d.name)}Result = ${ts(d.result)}`, "");
  }
  for (const d of events) out.push(`/** what ${d.name} carries */`, `export type ${typeBase(d.name)}Payload = ${ts(d.payload)}`, "");
  for (const d of views) {
    out.push(`/** what the ${d.name} view is given */`, `export type ${typeBase(d.name)}Props = ${ts(d.props)}`, "");
    const evs = d.events ?? [];
    out.push(`/** the events the ${d.name} view sends, by name, with what each carries */`, `export type ${typeBase(d.name)}Events = ${evs.length ? `{\n${evs.map((e) => `  ${e.name}: ${ts(e.payload)}`).join("\n")}\n}` : NONE}`, "");
  }
  /* a product that only draws views (a map, a call) invokes no call: its map has no key, which is said as a type of no
     key, not as an empty interface or `{}` (both of which the product's lint turns down: they take any value) */
  out.push("/** the calls by name: what each is given and gives back */");
  if (calls.length) out.push("export interface CapabilityMap {", ...calls.map((d) => `  ${str(d.name)}: { args: ${typeBase(d.name)}Args; result: ${typeBase(d.name)}Result }`), "}", "");
  else out.push(`export type CapabilityMap = ${NONE}`, "");
  out.push(
    "/** An app's adapters, by capability: each takes the arguments and gives the result (a promise or not), or throws",
    ' *  `fail("cancelled")` (or denied, unavailable, timeout, failed) for an outcome the design shows. Any left out answers',
    " *  `not-implemented` (the platform's default for a generic one, where it has one). */",
    "export type Capabilities = { [K in keyof CapabilityMap]?: (args: CapabilityMap[K][\"args\"]) => CapabilityMap[K][\"result\"] | Promise<CapabilityMap[K][\"result\"]> }",
    "",
    "/** what a view's slot (src/custom/slots) is given: the view's props, the size the design gives it, a way to send its",
    " *  events and to hand out what the visitor chose (a marker), and what the design draws in its place until the real",
    " *  one is written (children) */",
    "export type ViewSlotProps<P, E, F = unknown> = P & { width: number; height: number; onEvent?: <K extends keyof E & string>(name: K, payload: E[K]) => void; onValueChange?: (value: unknown) => void; children?: F }",
    "",
  );
  return out.join("\n");
}

const INDEX = `${GENERATED}
/* The platform capabilities of the product (see AGENTS.md and docs/平台能力.md in the design editor). src/engine is the
   design editor's own code, copied as it is; never edit it here. */
import { createCapabilities, missingAdapterWords, type CapabilityRegistry } from "./engine/capabilities/registry"
import type { CapabilityAdapters } from "./engine/capabilities/types"
import type { Capabilities } from "./generated/types"
import { SPEC } from "./generated/used"

export * from "./engine/capabilities/types"
export { CapabilityFailure, fail, missingAdapterWords, type CapabilityRegistry } from "./engine/capabilities/registry"
export { CAPABILITY_CATALOG, capabilityOf, failuresOf } from "./engine/capabilities/catalog"
export * from "./generated/types"
export { SPEC, USED } from "./generated/used"

/** what a development build says in the console */
const warn = (words: string) => (globalThis as { console?: { warn(words: string): void } }).console?.warn(words)

/** The registry an app invokes its capabilities through: the adapters written for it (src/custom/capabilities.ts), then
 *  the platform's defaults for the generic ones, else \`not-implemented\`, which a development build says once for each. */
export function createAppCapabilities(o: { adapters?: Capabilities; defaults?: Capabilities; dev?: boolean; timeoutMs?: number } = {}): CapabilityRegistry {
  return createCapabilities({
    adapters: o.adapters as CapabilityAdapters | undefined,
    defaults: o.defaults as CapabilityAdapters | undefined,
    spec: SPEC,
    ...(o.dev ? { onMissing: (name: string, def: Parameters<typeof missingAdapterWords>[1]) => warn(missingAdapterWords(name, def)) } : {}),
    ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}),
  })
}
`;

const MOCKS_INDEX = `${GENERATED}
/* The mock library's answers to the capabilities (development and tests only): the catalog's examples, or what the
   design's mock settings and scenarios say (a payment cancelled, the location denied). */
import { createMockCapabilities as make, type MockCapabilities, type MockCapabilityOptions } from "./engine/capabilities/mock"
import { MOCKS } from "./generated/mocks"
import { SPEC } from "./generated/used"

export type { CapabilityLogEntry, MockCapabilities, MockCapabilityOptions } from "./engine/capabilities/mock"

/** the capabilities answered by the mocks, in a scenario of the design's (\`{ scenario: "pay-cancelled" }\`) */
export const createMockCapabilities = (o: MockCapabilityOptions = {}): MockCapabilities => make(MOCKS, SPEC, o)
`;

const TEST = (used: string[], calls: string[]) => `${GENERATED}
import { describe, expect, it } from "vitest"
import { createAppCapabilities, fail, USED } from "./index"
import { createMockCapabilities } from "./mocks"

describe("the capabilities", () => {
  it("lists what the design uses", () => {
    expect(USED).toEqual(${jsonCode(used, 0)})
  })

  it("answers not-implemented until an adapter is written, and runs the one that is", async () => {
    const empty = createAppCapabilities()
    for (const name of ${jsonCode(calls, 0)}) expect((await empty.invoke(name, {})).ok).toBe(${calls.includes("analytics.track") ? "name === \"analytics.track\"" : "false"})
    const written = createAppCapabilities({ defaults: {}, adapters: {} })
    written.use({ "demo.never": () => Promise.reject(fail("cancelled")) })
    expect(await written.invoke("demo.never", {})).toMatchObject({ ok: false, error: { type: "cancelled" } })
  })

  it("answers from the mocks in development", async () => {
    const mocks = createMockCapabilities({ latency: false })
    for (const name of ${jsonCode(calls, 0)}) expect(typeof (await mocks.invoke(name, {})).ok).toBe("boolean")
    expect(mocks.log.length).toBe(${calls.length})
  })
})
`;

const README = (scope: string) => `# ${scope}/capabilities

The platform capabilities the product uses (payment, sign-in with another service, location, scanning, push, share, the
clipboard, links, files…): their types, a registry, and the mocks' answers for development. Adapters are written in
each app's \`src/custom/capabilities.ts\`, the real map, camera or call view in \`src/custom/slots/\`. \`src/engine/\` is the
design editor's own code, copied as it is; never edit it here. See AGENTS.md.

产品用到的平台能力（支付、第三方登录、定位、扫码、推送、分享、剪贴板、链接、文件……）：类型、注册表和开发时的模拟结果。
适配写在每个应用的 \`src/custom/capabilities.ts\`，真实的地图、相机、通话视图写在 \`src/custom/slots/\`。\`src/engine/\` 是设计
编辑器自己的代码，原样复制，不要在这里修改。
`;

const AGENTS = (scope: string, used: string[]) => `## Platform capabilities (packages/capabilities)

The design uses ${used.map((n) => `\`${n}\``).join(", ")}. M3E implements none of them and carries no SDK, key or permission
declaration: a tap invokes one (\`runtime.invoke(name, args)\`), its \`then\` reads the result and its \`catch\` reads \`error.type\`
(\`cancelled\`, \`failed\`, \`unavailable\`, \`not-implemented\`, \`denied\`, \`timeout\`), and every outcome has a design.

- **Write an adapter** in the app's \`src/custom/capabilities.ts\` (never overwritten): \`export const capabilities: Capabilities = { "payment.pay": async ({ orderId, payload }) => { …the SDK…; return { status: "submitted" } } }\`. Throw \`fail("cancelled")\` (from \`${scope}/capabilities\`) for an outcome the design shows; anything else thrown is \`failed\`. The types (\`PaymentPayArgs\`, \`PaymentPayResult\`…) are in \`src/generated/types.ts\`.
- Until one is written a capability answers \`not-implemented\`, and a development build says so in the console, as a handler answers 501. A generic one (\`link.open\`, \`clipboard.write\`, \`share.open\`, \`file.pick\`, and \`location.current\` on the web) has the platform's default where it has the API; an adapter of the same name takes its place.
- **Never decide a result in an adapter.** \`payment.pay\` only submits: whether the order is paid is the order's status from the back end (its payment callback), which the result screen loads. \`auth.oauth\` gives a code to sign in with; \`iap.purchase\` a receipt for the back end to verify.
- **Views** (a map, a camera, a call) are slots: \`src/custom/slots/<Name>.tsx\` (never overwritten) draws the real one from the props it is given and sends its events with \`onEvent\`; until then it draws the design's stand-in, which the screen hands it as \`children\`.
- **Try it**: \`createMockCapabilities({ scenario })\` from \`${scope}/capabilities/mocks\` answers as the design's mock scenarios say (development and tests only); \`runtime.setCapabilities(…)\` puts it in place.
`;

export const capabilitiesTarget: ProductTarget = {
  id: "capabilities",
  async build(ctx: ProductContext): Promise<Workspace | null> {
    const used = capabilitiesUsed(ctx.doc);
    if (!used.length) return null;
    const defs = usedDefinitions(ctx.doc);
    const calls = defs.filter((d) => d.kind === "call").map((d) => d.name);
    const engine: Record<string, ReturnType<typeof generated>> = {};
    for (const path of CAPABILITY_ENGINE_FILES) engine[`src/engine/${path.slice("lib/".length)}`] = generated(await ctx.read(path));
    const own = (ctx.doc.capabilities?.own ?? []).filter((c) => used.includes(c.name));
    const m = ctx.doc.mocks;
    /* what the mocks say of the capabilities: the rules, each scenario's (no files: the mock library has those) */
    const mocks = {
      ...(m?.capabilities ? { capabilities: m.capabilities } : {}),
      scenarios: (m?.scenarios ?? []).filter((s) => s.capabilities).map((s) => ({ id: s.id, name: s.name, capabilities: s.capabilities })),
      ...(m?.locale ? { locale: m.locale } : {}),
    };
    return {
      dir: "packages/capabilities",
      pkg: `${ctx.scope}/capabilities`,
      scripts: { typecheck: true, test: true },
      summary: { zh: "平台能力：类型、注册表（适配写在各应用的 src/custom）和开发时的模拟结果", en: "the platform capabilities: types, a registry (adapters in each app's src/custom) and the mocks' answers for development" },
      agents: AGENTS(ctx.scope, used),
      files: {
        "package.json": {
          ...generated(
            jsonFile({
              name: `${ctx.scope}/capabilities`,
              version: "0.1.0",
              private: true,
              type: "module",
              exports: { ".": "./src/index.ts", "./mocks": "./src/mocks.ts" },
              scripts: { typecheck: "tsc --noEmit -p .", test: "vitest run" },
              devDependencies: { typescript: ctx.version("typescript"), vitest: ctx.version("vitest") },
            }),
          ),
          merge: "package.json",
        },
        /* the registry's timeouts and the mocks' delays use the timers every platform has; DOM's lib types them, as
           for packages/mocks */
        "tsconfig.json": generated(jsonFile({ extends: "../../tsconfig.base.json", compilerOptions: { lib: ["ES2022", "DOM"], types: [], verbatimModuleSyntax: true }, include: ["src"] })),
        "README.md": generated(README(ctx.scope)),
        "src/index.ts": generated(INDEX),
        "src/mocks.ts": generated(MOCKS_INDEX),
        "src/index.test.ts": generated(TEST(used, calls)),
        "src/generated/types.ts": generated(typesModule(defs)),
        "src/generated/used.ts": generated(`${GENERATED}
import type { CapabilitySpec } from "../engine/capabilities/types"

/** the capabilities the design uses, by name */
export const USED = ${jsonCode(used)} as const

/** the product's own capabilities, declared beside the catalog's */
export const SPEC: CapabilitySpec = ${jsonCode(own.length ? { own } : {})}
`),
        "src/generated/mocks.ts": generated(`${GENERATED}
import type { MockCapabilitySource } from "../engine/capabilities/mock"

/** how the mocks answer the capabilities: the design's rules, and each scenario's */
export const MOCKS: MockCapabilitySource = ${jsonCode(mocks)}
`),
        ...engine,
      },
    };
  },
};
