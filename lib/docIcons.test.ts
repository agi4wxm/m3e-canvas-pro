/* The document's own icons: what is kept of a drawing (held to the vector atom's sanitizer), what an id may be, how a
 * kept drawing becomes an Iconify icon, and that a document carries them through the core, a project file and an
 * exported project, while one without any stays exactly as it was. */

import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, savedDoc, stateOf, OpError } from "./core";
import { parseProject, serializeProject } from "./core/projectFile";
import { cleanDocIcon, cleanDocIcons, docIconIdFor, iconifyIconOf, iconifySetOf, isDocIconName } from "./docIcons";
import { buildProject } from "./exportProject";
import { proofDoc } from "./exportProject.fixture";
import { setGlobalLang } from "./i18n";
import { openProject } from "./project";
import type { Doc } from "./tokens";

beforeAll(() => setGlobalLang("en"));

const LEAF = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19c8 0 14-6 14-14C11 5 5 11 5 19z"/><path d="M5 19l7-7"/></svg>';
const EVIL = '<svg viewBox="0 0 24 24" onload="alert(1)"><script>alert(2)</script><foreignObject><div>x</div></foreignObject><image href="https://evil.example/x.png"/><path d="M0 0h24v24z" onclick="alert(3)"/></svg>';

describe("a drawing kept as an icon", () => {
  it("keeps what draws and nothing that runs or reaches out", () => {
    const clean = cleanDocIcon(EVIL)!;
    expect(clean).toContain("<path");
    for (const bad of ["script", "onload", "onclick", "foreignObject", "evil.example", "image"]) expect(clean).not.toContain(bad);
    expect(cleanDocIcon("<p>not a drawing</p>")).toBeNull();
    expect(cleanDocIcon(42)).toBeNull();
    /* written out again it is the same */
    expect(cleanDocIcon(cleanDocIcon(LEAF)!)).toBe(cleanDocIcon(LEAF));
  });

  it("is named svg:<id>, with an id Iconify takes", () => {
    expect(isDocIconName("svg:leaf")).toBe(true);
    expect(isDocIconName("svg:coffee-cup-2")).toBe(true);
    for (const bad of ["leaf", "svg:", "svg:Leaf", "svg:a_b", "svg:a--b", "svg:-a", `svg:${"a".repeat(41)}`]) expect(isDocIconName(bad), bad).toBe(false);
    expect(docIconIdFor("A simple flat icon of a coffee cup", {})).toBe("coffee-cup");
    expect(docIconIdFor("咖啡杯", {})).toBe("icon");
    expect(docIconIdFor("leaf", { leaf: LEAF, "leaf-2": LEAF })).toBe("leaf-3");
  });

  it("drops what is not an icon from a document's list, and keeps a clean list as it was", () => {
    const leaf = cleanDocIcon(LEAF)!;
    expect(cleanDocIcons({ leaf, BAD: leaf, "a_b": leaf, gone: "<p/>", evil: EVIL })).toEqual({ leaf, evil: cleanDocIcon(EVIL) });
    const kept = { leaf };
    expect(cleanDocIcons(kept)).toBe(kept);
    expect(cleanDocIcons([leaf])).toBeUndefined();
    expect(cleanDocIcons({})).toBeUndefined();
  });

  it("is drawn by Iconify from its viewBox and inside, the outer paint carried onto a group", () => {
    const icon = iconifyIconOf(cleanDocIcon(LEAF)!)!;
    expect(icon).toMatchObject({ width: 24, height: 24 });
    expect(icon.body.startsWith('<g fill="none" stroke="currentColor" stroke-width="2">')).toBe(true);
    expect(icon.body).toContain("<path");
    const wide = iconifyIconOf(cleanDocIcon('<svg viewBox="-2 -4 48 24"><rect width="10" height="10"/></svg>')!)!;
    expect(wide).toMatchObject({ left: -2, top: -4, width: 48, height: 24 });
    expect(iconifySetOf({ leaf: LEAF, BAD: LEAF })).toEqual({ prefix: "m3e-doc", icons: { leaf: iconifyIconOf(cleanDocIcon(LEAF)!) } });
  });
});

const store = () => {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  s.run(ops.addScreen, { id: "home", name: "Home" }, { origin: "user" });
  return s;
};
const ai = { origin: "ai" as const };

describe("the document's icons in the core", () => {
  it("are kept, used wherever an icon name is taken, refused when unknown, and taken back by one undo", () => {
    const s = store();
    s.run(ops.addPart, { slug: "icon", id: "i1", screen: "home" }, ai);
    s.run(ops.addPart, { slug: "button", id: "b1", screen: "home", props: { label: "Go" } }, ai);
    const kept = s.run(ops.setIcon, { id: "leaf", svg: LEAF }, ai);
    expect(kept).toEqual({ id: "leaf", icon: "svg:leaf", replaced: false });
    expect(s.get().doc.icons?.leaf).toBe(cleanDocIcon(LEAF));
    s.run(ops.setProps, { id: "i1", props: { name: "svg:leaf" } }, ai);
    s.run(ops.setProps, { id: "b1", props: { icon: "svg:leaf" } }, ai);
    expect(() => s.run(ops.setProps, { id: "i1", props: { name: "svg:nope" } }, ai)).toThrow(/no icon svg:nope. Its own icons are: svg:leaf/);
    expect(() => s.run(ops.setIcon, { id: "Leaf", svg: LEAF }, ai)).toThrow(OpError);
    expect(() => s.run(ops.setIcon, { id: "x", svg: "<p/>" }, ai)).toThrow(/Nothing drawable/);
    expect(() => s.run(ops.setIcon, { id: "leaf", svg: LEAF }, ai)).toThrow(/that drawing already/);
    const gone = s.run(ops.removeIcon, { id: "leaf" }, ai);
    expect(gone.stillNamedBy.sort()).toEqual(["b1", "i1"]);
    expect(s.get().doc.icons).toBeUndefined();
    s.undo();
    expect(s.get().doc.icons?.leaf).toBeTruthy();
    s.undo();
    s.undo();
    s.undo();
    expect(s.get().doc.icons).toBeUndefined();
  });

  it("come in clean with any document, and a document without any is saved as it was", () => {
    const s = store();
    const before = JSON.stringify(savedDoc(s.get()));
    expect(before).not.toContain("icons");
    s.load({ ...savedDoc(s.get()), icons: { evil: EVIL, Bad: LEAF } }, true);
    expect(s.get().doc.icons).toEqual({ evil: cleanDocIcon(EVIL) });
    const opened = openProject({ format: "m3e-project", version: 2, document: { ...savedDoc(s.get()), icons: { leaf: LEAF, nope: 3 } } })!;
    expect(opened.icons).toEqual({ leaf: cleanDocIcon(LEAF) });
  });

  it("go through a project file and back, one line each", () => {
    const s = store();
    s.run(ops.setIcon, { id: "leaf", svg: LEAF }, ai);
    s.run(ops.addPart, { slug: "icon", id: "i1", screen: "home", props: { name: "svg:leaf" } }, ai);
    const doc = savedDoc(s.get());
    for (const assets of ["inline", "files"] as const) {
      const { text } = serializeProject(doc, { assets });
      expect(text).toContain(`    "icons": {\n      "leaf": ${JSON.stringify(doc.icons!.leaf)}\n    },`);
      const back = parseProject(text)!;
      expect(back.doc.icons).toEqual(doc.icons);
      expect(serializeProject(back.doc, { assets }).text).toBe(text);
    }
  });
});

describe("an exported project", () => {
  const fromDisk = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });

  it("registers the document's icons at start, and draws them by name", async () => {
    const { doc, widths } = proofDoc();
    const first = doc.groups.find((g) => g.items.some((it) => it.component === "button"))!;
    const named: Doc = { ...doc, icons: { leaf: cleanDocIcon(LEAF)! }, groups: doc.groups.map((g) => (g === first ? { ...g, items: g.items.map((it) => (it.component === "button" ? { ...it, props: { ...it.props, icon: "svg:leaf" } } : it)) } : g)) };
    const { files } = await buildProject(named, widths, { read: fromDisk, fetchIcons: noNetwork });
    const icons = files["src/doc-icons.ts"] as string;
    expect(icons).toContain('"prefix": "m3e-doc"');
    expect(icons).toContain('"leaf"');
    expect(files["src/theme.tsx"] as string).toContain('import docIcons from "@/doc-icons"');
    expect(Object.entries(files).some(([p, t]) => p.startsWith("src/screens/") && String(t).includes('"svg:leaf"'))).toBe(true);
    /* the icon component the project carries knows the names */
    expect(files["src/components/m3e/icon.tsx"] as string).toContain('"m3e-doc"');
    const plain = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork });
    expect("src/doc-icons.ts" in plain.files).toBe(false);
    expect(plain.files["src/theme.tsx"] as string).not.toContain("doc-icons");
  });
});
