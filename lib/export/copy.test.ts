import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { GENERATED } from "./code";
import { FILES_DIR, MOBILE_FILES_DIR, productFile } from "./copy";
import { buildProduct } from "./product";
import type { Product } from "./types";
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
