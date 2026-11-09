import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { GENERATED } from "./code";
import { FILES_DIR, MOBILE_FILES_DIR, productFile } from "./copy";
import { buildProduct } from "./product";
import type { Product } from "./types";
import { makeItem, type Doc, type Item } from "../tokens";
import { productDoc } from "./product.fixture";

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });

let proof: Product;
beforeAll(async () => {
  setGlobalLang("en");
  const { doc, widths, api } = productDoc();
  proof = await buildProduct(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en", api });
});
const text = (path: string) => {
  const f = proof.files[path];
  if (!f || typeof f.body !== "string") throw new Error(`no ${path}`);
  return f.body;
};

describe("the files an export copies as they are (lib/export/files)", () => {
  it("leaves the editor's notes out and puts the product's packages under its scope", () => {
    const file = '//! the editor\'s note\n//! another\nimport { a } from "@m3e/api"\nimport type {\n  B,\n} from "@m3e/app-runtime"\nexport { c } from "@m3e/mocks/native"\nconst s = "@m3e/api"\n';
    expect(productFile(file, "@shop")).toBe('import { a } from "@shop/api"\nimport type {\n  B,\n} from "@shop/app-runtime"\nexport { c } from "@shop/mocks/native"\nconst s = "@m3e/api"\n');
  });

  it("are written into the product byte for byte, under the generated header", async () => {
    const copied: Record<string, string> = {
      "packages/api/src/transport.ts": "api/transport.ts",
      "packages/api/src/client.ts": "api/client.ts",
      "packages/api/src/fetch.ts": "api/fetch.ts",
      "packages/app-runtime/src/setup.ts": "appRuntime/setup.ts",
      "packages/app-runtime/src/runtime.test.ts": "appRuntime/runtime.spec.ts",
      "apps/web/src/generated/platform.ts": "web/platform.ts",
      "apps/web/src/generated/DataScroll.tsx": "web/DataScroll.tsx",
      "apps/mobile/src/generated/transport.ts": `${MOBILE_FILES_DIR}/transport.ts`,
      "apps/mobile/jest.setup.tsx": `${MOBILE_FILES_DIR}/jest.setup.tsx`,
      "apps/mobile/src/generated/api.ts": `${MOBILE_FILES_DIR}/api.ts`,
      "apps/mobile/src/generated/files.ts": `${MOBILE_FILES_DIR}/files.ts`,
      "apps/mobile/src/generated/mocks.ts": `${MOBILE_FILES_DIR}/mocks.ts`,
      "apps/mobile/src/generated/DevMenu.tsx": `${MOBILE_FILES_DIR}/DevMenu.tsx`,
      "apps/mobile/src/generated/ScreenRoute.tsx": `${MOBILE_FILES_DIR}/ScreenRoute.tsx`,
      "apps/mobile/src/generated/env.d.ts": `${MOBILE_FILES_DIR}/env.d.ts`,
    };
    for (const [at, from] of Object.entries(copied)) {
      const source = from.startsWith(MOBILE_FILES_DIR) ? from : `${FILES_DIR}/${from}`;
      expect(text(at), at).toBe(`${GENERATED}\n${productFile(await fromDisk(source), `@${proof.name}`)}`);
      expect(text(at), at).not.toContain("//!");
      expect(text(at), at).not.toMatch(/from "@m3e\//);
    }
    expect(text("packages/app-runtime/src/index.ts")).toContain('export * from "./setup"');
  });
});

describe("the mobile app's own files filled in for the design (rn/src/app, lib/export/regions.ts)", () => {
  const MARKS = /\/\/#|\/\/\||\/\*#|#end\*\/|\/\*\$|@@|\/\/!/;
  const FILLED = ["root.tsx", "routing.tsx", "runtime.ts", "contract.ts", "effects.ts", "bind.ts"];

  it("keep no mark, name the product's scope, and hold the design's own tables", () => {
    for (const file of FILLED) {
      const body = text(`apps/mobile/src/generated/${file}`);
      expect(body, file).not.toMatch(MARKS);
      expect(body, file).not.toMatch(/@m3e\//);
      expect(body.startsWith(`${GENERATED}\n`), file).toBe(true);
    }
    expect(text("apps/mobile/src/generated/effects.ts")).toContain(`(lib/actions in @${proof.name}/app-runtime,`);
    expect(text("apps/mobile/src/generated/root.tsx")).toContain(`(@${proof.name}/mocks)`);
    expect(text("apps/mobile/src/generated/runtime.ts")).toContain(`storageKey: "proof_app.session"`);
    expect(text("apps/mobile/src/custom/setup.ts")).toContain(`@${proof.name}/mocks/native (startNative)`);
    expect(text("apps/mobile/src/custom/setup.ts")).not.toMatch(MARKS);
  });

  it("keep the regions the design uses: the capabilities' registry, a variable that drives the dark mode", async () => {
    /* the proof pays through payment.pay: its runtime takes the capabilities' registry */
    expect(text("apps/mobile/src/generated/runtime.ts")).toContain('import { registry } from "./capabilities"');
    expect(text("apps/mobile/src/generated/runtime.ts")).toContain("  capabilities: registry,\n");
    const plain = await buildProduct({ groups: [], frames: [{ id: "home", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "Plain", brief: "", vars: [{ id: "night", name: "Night", type: "bool", value: false, drives: "dark" }] }, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const body = (path: string) => plain.files[path].body as string;
    expect(body("apps/mobile/src/generated/runtime.ts")).not.toContain("registry");
    const root = body("apps/mobile/src/generated/root.tsx");
    expect(root).toContain("registerIcons, useApp, type AppVar }");
    expect(root).toContain('const dark = app.vars["night"]');
    expect(root).not.toContain("light or dark as the device is");
    expect(text("apps/mobile/src/generated/root.tsx")).toContain("light or dark as the device is");
  });
});

describe("a copy button on a phone", () => {
  it("copies through the app's capabilities (clipboard.write), which bind.ts has only where a screen copies", async () => {
    const doc = (items: Item[]): Doc => ({ groups: items.map((it, i) => ({ id: `g${i}`, x: 16, y: 80 + i * 60, axis: "x", items: [it] })), frames: [{ id: "home", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "Copy", brief: "" });
    const built = async (items: Item[]) => (await buildProduct(doc(items), {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" })).files;
    const copies = await built([{ ...makeItem("copy-row"), id: "c", props: { text: "npm run deploy" } }]);
    const screenFile = Object.entries(copies).find(([p]) => p.startsWith("apps/mobile/src/generated/screens/"))![1].body as string;
    expect(screenFile).toContain("onCopy={copyText}");
    expect(screenFile).toMatch(/import \{[^}]*copyText[^}]*\} from "\.\.\/bind"/);
    const bind = copies["apps/mobile/src/generated/bind.ts"].body as string;
    expect(bind).toContain('import { runtime } from "./runtime"');
    expect(bind).toContain('const out = await runtime.invoke("clipboard.write", { text })');
    /* a design with no copy button: bind.ts as it always was */
    const plain = (await built([{ ...makeItem("text"), id: "t", props: { text: "Hi" } }]))["apps/mobile/src/generated/bind.ts"].body as string;
    expect(plain).not.toContain("copyText");
    expect(plain).not.toContain('from "./runtime"');
  });
});

describe("the app's setup, the same on every front end", () => {
  it("is run by SetupGate around the screens of the web app, the mobile app and the mini-program, never before them", () => {
    const scope = `@${proof.name}`;
    const web = text("apps/web/src/main.tsx");
    expect(web).toContain(`import { RuntimeProvider, SetupGate } from "${scope}/app-runtime"`);
    expect(web).toMatch(/<SetupGate setup=\{setup\}>\s*<AppProvider>[\s\S]*<App \/>[\s\S]*<\/SetupGate>/);
    expect(web).not.toContain("await setup()");
    const mobile = text("apps/mobile/src/generated/root.tsx");
    expect(mobile).toContain(`import { RuntimeProvider, SetupGate } from "${scope}/app-runtime"`);
    expect(mobile).toMatch(/<SetupGate setup=\{setup\}>\s*<Providers>\{children\}<\/Providers>\s*<\/SetupGate>/);
    expect(mobile).not.toContain("void setup()");
    /* the app's own test checks its routes wait for the setup */
    expect(text("apps/mobile/src/generated/app.test.tsx")).toContain("draws its routes only once the custom setup has run");
    const mini = text("apps/miniapp/src/generated/root.tsx");
    expect(mini).toContain(`import { RuntimeProvider, SetupGate } from "${scope}/app-runtime"`);
    expect(mini).toMatch(/<SetupGate setup=\{setup\}>\s*<Providers>\{children\}<\/Providers>\s*<\/SetupGate>/);
    expect(text("apps/miniapp/src/app.ts")).not.toMatch(/import .*custom\/setup|setup\(\)/);
  });
});
