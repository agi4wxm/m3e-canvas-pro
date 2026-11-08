import { beforeAll, describe, expect, it } from "vitest";

import { buildCode } from "./codegen";
import { allPartsDoc } from "./codegen.fixture";
import { setGlobalLang } from "./i18n";
import { Doc, makeItem } from "./tokens";
import { PARTS } from "../parts/registry";

beforeAll(() => setGlobalLang("en"));

const one = (slug: string, props: Record<string, unknown> = {}): Doc => ({
  groups: [{ id: "g", x: 16, y: 100, axis: "x", items: [{ ...makeItem(slug), id: "i", props }] }],
  frames: [{ id: "f", name: "Home", x: 0, y: 0 }],
  paletteKey: "purple",
  frame: "phone",
  title: "T",
  brief: "",
});

/** the capitalised JSX tags of a source, which have to be imported */
const tags = (code: string) => {
  const body = code
    .split(/\r?\n/)
    .filter((l) => !l.startsWith("//"))
    .join(" ");
  return new Set([...body.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]));
};
const imported = (code: string) => new Set([...code.matchAll(/import \{([^}]+)\} from/g)].flatMap((m) => m[1].split(",").map((s) => s.trim())));

describe("buildCode", () => {
  it("covers every part", () => {
    for (const { slug } of PARTS) {
      const { code } = buildCode(one(slug), {});
      expect(code, slug).toContain("export function HomeScreen()");
      expect(code, slug).not.toMatch(/undefined|\[object|NaN/);
      const have = imported(code);
      for (const tag of tags(code)) expect(have.has(tag), `${slug}: ${tag} is not imported`).toBe(true);
    }
  });

  it("names screens from their names, falling back to the screen's id", () => {
    const { code } = buildCode(allPartsDoc(), {});
    expect(code).toContain("export function AllPartsScreen()");
    /* "日本語" has no ASCII words and is no template's: the screen "f-2" is named after its id, not its place */
    expect(code).toContain("export function ScreenF2()");
  });

  it("maps a button to the M3E button props", () => {
    const { code } = buildCode(one("button", { label: "Save", variant: "tonal", icon: "" }), {});
    expect(code).toContain(`<Button variant="tonal"`);
    expect(code).toContain(">Save</Button>");
    expect(code).toContain(`import { Button } from "@/components/m3e/button"`);
  });

  it("puts the registry setup, the install command and the seed color in the header", () => {
    const { code, install } = buildCode(one("switch"), {});
    expect(install).toContain("npx shadcn@latest add @m3e/base");
    expect(install).toContain("@m3e/switch");
    expect(code).toContain(install);
    expect(code).toContain("https://shadcn-m3e.crystaworld.dev/r/{name}.json");
    expect(code).toContain(`primary: "#6750A4"`);
  });

  it("asks for a Toaster only when a snackbar is used", () => {
    expect(buildCode(one("sonner"), {}).code).toContain("<Toaster />");
    expect(buildCode(one("button"), {}).code).not.toContain("<Toaster />");
  });

  it("keeps text from breaking the JSX", () => {
    const { code } = buildCode(one("button", { label: "a < b {c}", icon: "" }), {});
    expect(code).toContain(`{"a < b {c}"}`);
  });

  it("builds a screen out of loose parts when the sketch has no frames", () => {
    const doc = { ...one("button"), frames: [], frame: "blank" as const };
    expect(buildCode(doc, {}).code).toContain("export function");
  });

  it("prints a component's appearance as fixed classes and a picked image as a placeholder", () => {
    const doc = one("button");
    doc.groups[0].items = [
      { ...makeItem("card"), id: "c", fill: "primaryContainer", corners: { tl: 24, tr: 24, bl: 24, br: 24 } },
      { ...makeItem("avatar"), id: "a", props: { image: "data:image/webp;base64,AAAA" } },
    ];
    const { code } = buildCode(doc, {});
    expect(code).toContain('className="bg-primary-container text-on-primary-container"');
    expect(code).toContain('borderRadius: "24px 24px 24px 24px"');
    expect(code).toContain('src="/placeholder.svg"');
    expect(code).not.toContain("data:image");
  });
});
