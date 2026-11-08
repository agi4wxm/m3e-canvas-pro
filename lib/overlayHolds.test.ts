import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "./i18n";
import { buildCode } from "./codegen";
import { goneIds, startState } from "./interact";
import { flowOf } from "./flow";
import { heldBy, holdsParts, makeItem, type Doc, type Group, type Item } from "./tokens";
import { partBySlug } from "../parts/registry";

/* An overlay that holds parts (report 5.7 item 5): a dialog, an alert dialog or a sheet with its auto layout on lays out
 * the parts in it in its body. They open and close with it, and the printed code puts them inside the dialog that
 * opens. With its auto layout off it is the dialog it always was: what lies over it is the screen's. */

beforeAll(() => setGlobalLang("en"));

const part = (slug: string, id: string, props: Record<string, unknown> = {}): Item => ({ ...makeItem(slug), id, props });
const group = (id: string, x: number, y: number, it: Item, extra: Partial<Group> = {}): Group => ({ id, x, y, axis: "x", items: [it], ...extra });
const sizes = { "i-d": 400, "i-d:h": 320, "i-f": 280, "i-f:h": 56, "i-b": 100, "i-b:h": 40 };
const docOf = (groups: Group[]): Doc => ({ groups, frames: [{ id: "f", name: "F", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" }) as Doc;

describe("a dialog with its auto layout on", () => {
  const dialog = (layout: string, extra: Partial<Group> = {}) => group("d", 0, 100, part("dialog", "i-d", { layout, title: "Sign in" }), extra);
  const field = group("f", 24, 172, part("text-field", "i-f", { label: "Email" }), { inFlow: "d" });
  const button = group("b", 24, 240, part("button", "i-b", { label: "Send code" }), { inFlow: "d" });

  it("holds the parts laid out in it, and only then", () => {
    expect(partBySlug("dialog")!.holds).toBe("laidOut");
    expect(holdsParts(dialog("column"))).toBe(true);
    expect(flowOf(dialog("column"))?.dir).toBe("column");
    expect(heldBy(dialog("column"), [dialog("column"), field, button], sizes).map((g) => g.id)).toEqual(["f", "b"]);
    /* off, it is the dialog it always was: a part merely lying over it is the screen's */
    const over = group("b", 24, 200, part("button", "i-b", { label: "Over" }));
    expect(holdsParts(dialog("free"))).toBe(false);
    expect(heldBy(dialog("free"), [dialog("free"), over], sizes)).toEqual([]);
    expect(holdsParts(group("d", 0, 0, part("dialog", "i-d")))).toBe(false);
  });

  it("is laid out under its title, above its buttons", () => {
    const f = flowOf(dialog("column"))!;
    expect(f.inset).toEqual({ t: 24 + 32 + 16, r: 24, b: 24 + 16 + 48, l: 24 });
    const noButtons = flowOf(group("d", 0, 0, part("dialog", "i-d", { layout: "column", dismiss: "", confirm: "" })))!;
    expect(noButtons.inset.b).toBe(24);
  });

  it("hides what it holds while it is closed", () => {
    const groups = [dialog("column", { hidden: true }), field, button];
    const doc = { groups, frames: [], vars: [] };
    const gone = goneIds(groups, startState([]), doc as never, sizes);
    expect([...gone].sort()).toEqual(["b", "d", "f"]);
  });

  it("prints what it holds inside the dialog that opens", () => {
    const { code } = buildCode(docOf([dialog("column", { hidden: true }), field, button]), sizes);
    const content = code.slice(code.indexOf("<DialogContent"), code.indexOf("</DialogContent>"));
    expect(content).toContain("Email");
    expect(content).toContain("Send code");
    expect(content).toContain("Sign in");
    /* laid out, its parts say what it says */
    expect(content).not.toContain("This will reset");
  });

  it("draws as it always did with its auto layout off", () => {
    const off = buildCode(docOf([group("d", 0, 100, part("dialog", "i-d", { title: "Sign in" }), { hidden: true })]), sizes).code;
    expect(off).toContain("This will reset");
    expect(off).not.toContain("overlay-body");
  });
});

describe("an alert dialog and a sheet", () => {
  it("hold what is laid out in them as a dialog does", () => {
    for (const slug of ["alert-dialog", "sheet"]) {
      const host = group("d", 0, 0, part(slug, "i-d", { layout: "column" }));
      const kid = group("b", 24, 100, part("button", "i-b", { label: "Inside" }), { inFlow: "d" });
      expect(heldBy(host, [host, kid], sizes).map((g) => g.id), slug).toEqual(["b"]);
      const code = buildCode(docOf([{ ...host, hidden: true }, kid]), sizes).code;
      expect(code, slug).toContain("Inside");
      expect(code.indexOf("Inside"), slug).toBeGreaterThan(code.indexOf(slug === "sheet" ? "<SheetContent" : "<AlertDialogContent"));
    }
  });
});
