/* Slots for any part (report 9.3, docs/平台能力.md 插槽): a part the design marks as the product's own (`Item.slot`) is
 * drawn in every exported app by a slot written once (`src/custom/slots/<Name>.tsx`), handed what the part is and drawing
 * the design's part until it is changed, and kept, whatever it holds, by every later export into the same folder. */

import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../core";
import { makeItem, type Doc, type Item } from "../tokens";
import { planExport, type DiskHashes } from "./merge";
import { buildProduct } from "./product";
import { sha256 } from "./sha256";
import { slotsOf } from "./appCapabilities";
import { boundaryDifferences } from "./boundary";
import type { Product } from "./types";

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
const build = (doc: Doc) => buildProduct(doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
const text = (p: Product, path: string) => {
  const body = p.files[path]?.body;
  if (typeof body !== "string") throw new Error(`${path} is not a text file of the product`);
  return body;
};

const part = (id: string, slug: string, more: Partial<Item> = {}): Item => ({ ...makeItem(slug), id, ...more });

/** a home screen with a buy button the product draws itself (by the name the design gives its slot), a stat card the
 *  kits draw as its atoms marked too, and a plain button */
function slottedDoc(): Doc {
  return {
    title: "Slots",
    brief: "",
    paletteKey: "purple",
    frame: "phone",
    frames: [
      { id: "home", name: "Home", x: 0, y: 0 },
      { id: "done", name: "Done", x: 600, y: 0 },
    ],
    groups: [
      { id: "g1", x: 16, y: 100, axis: "x", items: [part("buy", "button", { props: { label: "Buy" }, slot: "BuyButton", action: { to: "done" } })] },
      { id: "g2", x: 16, y: 200, axis: "x", name: "Sales today", items: [part("stat", "stat-card", { slot: true })] },
      { id: "g3", x: 16, y: 400, axis: "x", items: [part("plain", "button", { props: { label: "Plain" } })] },
    ],
  };
}

describe("slots for any part", () => {
  let p: Product;
  beforeAll(async () => {
    p = await build(slottedDoc());
  }, 60_000);

  it("are named as the design says, else after the part's group or its kind, clear of what the kits name", () => {
    expect(slotsOf(slottedDoc()).map((s) => [s.item, s.name, s.view])).toEqual([
      ["buy", "BuyButton", ""],
      ["stat", "SalesToday", ""],
    ]);
    const doc = slottedDoc();
    doc.groups[1].name = undefined;
    doc.groups[2].items[0].slot = "Button";
    /* a kind's own name, and a name a kit component has (the screen draws the kit's Button beside the slot) */
    expect(slotsOf(doc).map((s) => s.name)).toEqual(["BuyButton", "StatCardSlot", "Button2"]);
  });

  it("are written once in every app and drawn by the screens, the design's part inside until changed", () => {
    for (const app of ["web", "mobile", "miniapp"]) {
      for (const name of ["BuyButton", "SalesToday"]) {
        const slot = p.files[`apps/${app}/src/custom/slots/${name}.tsx`];
        expect(slot?.kind, `${app} ${name}`).toBe("seeded");
        expect(slot.body as string, app).toContain(`export default function ${name}({ children }: Props) {\n  return <>{children}</>;\n}`);
      }
    }
    /* on a phone and in a mini-program the button's slot is handed what the kit's Button is, typed as its props, and
       the generated module draws the kit's Button inside it: the screen prints the button's props once */
    for (const app of ["mobile", "miniapp"]) {
      expect(text(p, `apps/${app}/src/custom/slots/BuyButton.tsx`), app).toContain('import type { Button } from "../../kit";\n');
      expect(text(p, `apps/${app}/src/custom/slots/BuyButton.tsx`), app).toContain("type Props = ComponentProps<typeof Button> & { children?: ReactNode };");
      expect(text(p, `apps/${app}/src/custom/slots/SalesToday.tsx`), app).toContain("type Props = { width: number; height: number; children?: ReactNode };");
      const slots = text(p, `apps/${app}/src/generated/slots.tsx`);
      expect(p.files[`apps/${app}/src/generated/slots.ts`], app).toBeUndefined();
      expect(slots, app).toContain('import BuyButtonSlot from "../custom/slots/BuyButton";');
      expect(slots, app).toContain('export { default as SalesToday } from "../custom/slots/SalesToday";');
      expect(slots, app).toContain("export function BuyButton(props: ComponentProps<typeof Button>) {\n  return (\n    <BuyButtonSlot {...props}>\n      <Button {...props} />\n    </BuyButtonSlot>\n  );\n}");
      const screen = text(p, `apps/${app}/src/generated/screens/HomeScreen.tsx`);
      expect(screen, app).toContain('import { BuyButton, SalesToday } from "../slots";');
      /* the slot takes the button's place, its tap with it; the plain button is still the kit's */
      expect(screen, app).toMatch(/<BuyButton label="Buy" onPress=/);
      expect(screen, app).toMatch(/<Button label="Plain"/);
      /* the stat card is drawn as its atoms inside its slot, which is handed its size */
      expect(screen, app).toMatch(/<SalesToday width=\{\d+\} height=\{\d+\}>\n\s+<Box/);
    }
    /* the web draws the design's part inside the slot, handed the props of that drawing */
    expect(text(p, "apps/web/src/generated/slots.ts")).toContain('export { default as BuyButton } from "../custom/slots/BuyButton"');
    const web = text(p, "apps/web/src/generated/screens/HomeScreen.tsx");
    expect(web).toContain('import { BuyButton, SalesToday } from "@/generated/slots"');
    expect(web).toMatch(/<BuyButton [^\n]*\n\s*<Button [^\n]*>Buy<\/Button>\n\s*<\/BuyButton>/);
  });

  it("are listed in the export's report as the product's own", () => {
    const diffs = boundaryDifferences(slottedDoc(), "mobile");
    expect(diffs.filter((d) => d.kind === "custom").map((d) => d.detail)).toEqual([expect.stringContaining("src/custom/slots/BuyButton.tsx"), expect.stringContaining("src/custom/slots/SalesToday.tsx")]);
  });

  it("are kept, whatever they hold, when the product is exported again into the same folder", async () => {
    const files = (q: Product) => q.files;
    const first = planExport({ product: "slots", next: files(p), disk: {}, previous: null });
    /* someone writes the real button; the design changes (the plain button's words, another screen's name) */
    const mine = "export default function BuyButton() {\n  return null;\n}\n";
    const disk: Record<string, string | undefined> = Object.fromEntries(first.writes.map((w) => [w.path, sha256(w.body)]));
    for (const app of ["web", "mobile", "miniapp"]) disk[`apps/${app}/src/custom/slots/BuyButton.tsx`] = sha256(mine);
    const doc = slottedDoc();
    doc.groups[2].items[0].props = { label: "Plain, again" };
    doc.frames[1].name = "All done";
    const again = await build(doc);
    const plan = planExport({ product: "slots", next: again.files, disk: disk as DiskHashes, previous: first.manifest });
    for (const app of ["web", "mobile", "miniapp"]) {
      for (const name of ["BuyButton", "SalesToday"]) {
        const path = `apps/${app}/src/custom/slots/${name}.tsx`;
        expect(plan.kept, path).toContain(path);
        expect(plan.writes.map((w) => w.path), path).not.toContain(path);
      }
    }
    expect(plan.conflicts).toEqual([]);
    /* the part taken out of the design: its slot stays where it is, reported until someone deletes it */
    const gone = slottedDoc();
    gone.groups = gone.groups.filter((g) => g.id !== "g1");
    const without = planExport({ product: "slots", next: (await build(gone)).files, disk: disk as DiskHashes, previous: first.manifest });
    for (const app of ["web", "mobile", "miniapp"]) expect(without.customOrphans).toContain(`apps/${app}/src/custom/slots/BuyButton.tsx`);
    expect(without.deletes.some((d) => d.includes("custom/slots"))).toBe(false);
  }, 120_000);

  it("are set on a part with set_item: true or a component's name", () => {
    const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
    store.transact("slots", "mcp", (tx) => {
      tx.run(ops.addScreen, { id: "home", name: "Home" });
      tx.run(ops.addPart, { slug: "button", id: "b", screen: "home", at: { x: 16, y: 100 } });
      tx.run(ops.setItem, { id: "b", patch: { slot: "BuyButton" } });
    });
    expect(savedDoc(store.get()).groups.flatMap((g) => g.items).find((it) => it.id === "b")?.slot).toBe("BuyButton");
    expect(() => store.transact("bad", "mcp", (tx) => tx.run(ops.setItem, { id: "b", patch: { slot: "buy button" } }))).toThrow(/slot/);
    store.transact("named for it", "mcp", (tx) => tx.run(ops.setItem, { id: "b", patch: { slot: true } }));
    expect(savedDoc(store.get()).groups.flatMap((g) => g.items).find((it) => it.id === "b")?.slot).toBe(true);
  });
});
