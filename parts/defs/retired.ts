import { atom, box, button, entry, hbox, icon, iconButton, image, para, round, text, vbox } from "../atoms";
import type { Node, Say } from "../templates/kit";
import type { P, PartRetired } from "../types";

/* The whole-screen parts that are retired (docs/组件清单.md "退役的组件"): each kept its data and its behaviour to
 * itself (a cart that added up its own rows, a sign-in form that checked its own fields and said "All set"), which a
 * product cannot wire to its back end. They still draw, so an old document looks as it did, but the palette and the
 * AI no longer offer them; what replaces each is the same look in atoms, its rows as data, its taps as actions.
 *
 * Here are, for each, what to build instead (read by the AI's catalog and the editor's notice), and the trees of
 * atoms of those that had none yet (the rest are in splits.ts). lib/retire.ts does the splitting: these trees as they
 * are, or, where a list's rows are alike, one row repeated over a data collection that holds them.
 *
 * The legacy `resizable` is retired too, for another reason: its panels hold only words. It is no split into atoms but
 * converts to a split view (`convert`, lib/core/ops/split.ts), whose panes take what lay over its panels. */

export const RETIRED: Record<string, PartRetired> = {
  inventory: { use: "a grid box of item cells (the item-cell part, or atoms), repeated over the inventory's data; the item a tap picks is the screen's to say", with: ["item-cell"] },
  "task-row": { use: "the quest-row kit, repeated over the tasks' data; Claim calls the API and the row shows the claimed state the answer gives", with: ["quest-row"] },
  "pull-to-refresh": { use: "turn on pull to refresh on the screen's data source (pullToRefresh): every target refreshes natively" },
  "cart-list": { use: "cart-row kits repeated over the cart's data with a buy-bar kit at the foot; each check, step, remove and select-all calls the API, and the total and count come from the cart's data", with: ["cart-row", "price-summary", "buy-bar"] },
  "contact-list": { use: "a search-bar kit over contact-row kits repeated over the contacts' data; the search words go into a variable the data source reads, and follow calls the API", with: ["search-bar", "contact-row"] },
  "comment-list": { use: "rows of atoms (an avatar, name, time and words, a like button) repeated over the comments' data, then the chat-input kit; like and send call the API, reply sets a variable", with: ["chat-input"] },
  "notification-list": { use: "a header row over notification-row kits repeated over the notifications' data; a tap opens one and calls mark-read, mark-all-read calls the API and refreshes", with: ["see-all-header", "notification-row"] },
  "settings-group": { use: "settings-row kits in an inset-group kit; each switch and check is a real input whose value goes into a variable or a form", with: ["inset-group", "settings-row"] },
  "todo-list": { use: "rows of a checkbox, words and a remove button repeated over the tasks' data, and an input with an add button (or make_form) for a new one", with: ["checkbox", "input"] },
  "auth-form": { use: "the login-form kit (with password-field and terms-row) bound with make_form to the sign-in endpoint, a sign-up screen of its own; the rules come from the API's schema", with: ["login-form", "password-field", "terms-row"] },
  "chat-composer": { use: "the chat-input kit: the entry's words go into a variable, send calls the API and then clears it", with: ["chat-input"] },
  /* panels of words with a handle, no parts in them: the split view's panes hold parts, so an old one converts to it */
  resizable: {
    use: "the split-view part: two panes that hold parts, with a divider the visitor drags (set_split sets the share)",
    with: ["split-view"],
    why: "its panels hold only words, never parts",
    convert: "convert_to_split_view",
  },
};

const px = (p: P, key = "width") => Math.round(p.n(key));
const some = (...nodes: (Node | false | "" | undefined | null)[]): Node[] => nodes.filter((n): n is Node => !!n);
/** empty room that takes what is left of a row */
const rest = (): Node => box({ layout: "row", padX: 0, padY: 0, hugWidth: false, hugHeight: false, width: 8, height: 8 }, [], { grow: true });

/** a cell of an amount as a number, read only when it is written as one ("24.00", "1,250.5", "$12"); NaN otherwise, so
 *  "€12,50" is not taken for 1250 */
function figure(cell: string): number {
  const t = cell.replace(/[\s$€£¥₩]/g, "");
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replaceAll(",", ""));
  return Number.NaN;
}

/** the note a pull-to-refresh box carries once split: the pull is the screen's data source's now (split_retired turns
 *  it on for the data the screen loads; on a screen that loads none yet, it is the author's to turn on) */
const PULL_NOTE: Say = {
  en: "Pull to refresh belongs to the screen's data source: its “pull to refresh” setting loads the data again.",
  zh: "下拉刷新由屏幕的数据源负责：数据源的“下拉刷新”设置会重新加载数据。",
  ja: "引っ張って更新は画面のデータソースが受け持ちます：データソースの「引っ張って更新」の設定でデータを読み込み直します。",
  ko: "당겨서 새로고침은 화면의 데이터 소스가 맡습니다: 데이터 소스의 '당겨서 새로고침' 설정이 데이터를 다시 불러옵니다.",
};

/** a field as the form draws it: an outlined entry whose label stands in it until something is typed */
const field = (label: string, type: string): Node => atom("input", { placeholder: label, type, variant: "outlined" });

export const RETIRED_SPLITS: Record<string, (p: P) => Node> = {
  /* a grid of square cells on the container, the first `filled` holding something */
  inventory: (p) => {
    const columns = Math.max(1, Math.round(p.n("columns")));
    const count = columns * Math.max(1, Math.round(p.n("rows")));
    const filled = Math.round(p.n("filled"));
    const width = px(p);
    const side = Math.max(8, Math.round((width - 24 - 8 * (columns - 1)) / columns));
    const cell = (i: number) =>
      box({ layout: "row", align: "center", justify: "center", padX: 0, padY: 0, gap: 0, width: side, height: side, hugWidth: false, hugHeight: false }, some(i < filled && icon("inventory_2", { size: 20, color: "on-surface-variant" })), { fill: "surfaceContainerLow", corners: round(16) });
    return box({ layout: "grid", columns, gap: 8, padX: 12, padY: 12, align: "stretch", width, hugWidth: false }, Array.from({ length: count }, (_, i) => cell(i)), { fill: "surfaceContainer", corners: round(28) });
  },

  /* the hint on the lowest container, as tall as the part; the pull itself is the data source's */
  "pull-to-refresh": (p) =>
    vbox({ width: px(p), height: px(p, "height"), hugWidth: false, hugHeight: false, padX: 0, padY: 0, gap: 0, align: "center" }, [hbox({ padX: 12, padY: 12 }, [text(p.s("hint"), "caption", { color: "on-surface-variant" })])], { fill: "surfaceContainerLow", corners: round(20), note: PULL_NOTE }),

  /* each line: its check, a picture, its name and variant over its price and its stepper; the foot: select all, the
   * total and the checkout button. The total and the count are the words the part showed: no longer worked out */
  "cart-list": (p) => {
    const width = px(p);
    const currency = p.s("currency");
    const rows = p.table("data").rows;
    const lines = rows.map(([name = "", spec = "", price = "", count = ""]) =>
      hbox({ padX: 12, padY: 12, gap: 12, hugWidth: false, width }, [
        atom("checkbox", { label: "", checked: true }),
        image({ alt: name, width: 64, height: 64, radius: 12 }),
        vbox({ gap: 2, hugWidth: false, width: 160 }, some(para(name, "body", { maxLines: 1 }), spec && para(spec, "caption", { color: "on-surface-variant", maxLines: 1 }), hbox({ justify: "between", gap: 4, padX: 0, padY: 0 }, [hbox({ gap: 0 }, [text(currency, "subtitle", { color: "primary" }), text(price, "subtitle", { color: "primary" })]), hbox({ gap: 0 }, [iconButton("remove", "Decrease", { size: "xs" }), text(count, "label"), iconButton("add", "Increase", { size: "xs" }), iconButton("delete", "Remove", { size: "xs" })])])), { grow: true }),
      ]),
    );
    const amounts = rows.map(([, , price = "", count = ""]) => ({ price: figure(price), count: count.trim() ? figure(count) : 1 }));
    const sum = amounts.reduce((s, a) => s + a.price * a.count, 0);
    const pieces = amounts.reduce((s, a) => s + a.count, 0);
    const known = Number.isFinite(sum) && Number.isFinite(pieces);
    const foot = hbox({ padX: 12, padY: 12, gap: 12, hugWidth: false, width }, some(
      atom("checkbox", { label: p.s("selectAll"), checked: rows.length > 0 }),
      rest(),
      vbox({ gap: 0, align: "end" }, some(p.s("total") && text(p.s("total"), "tiny", { color: "on-surface-variant" }), text(known ? `${currency}${sum.toFixed(2)}` : currency, "heading", { color: "primary" }))),
      p.s("action") && button(known ? `${p.s("action")} (${pieces})` : p.s("action"), { variant: "filled", size: "sm" }),
    ), { fill: "surfaceContainer" });
    const empty = hbox({ justify: "center", padX: 24, padY: 24, hugWidth: false, width }, [text(p.s("empty"), "body", { color: "on-surface-variant", align: "center" })]);
    return vbox({ width, hugWidth: false, padX: 0, padY: 0, gap: 0 }, [...(rows.length ? lines : [empty]), foot], { fill: "surfaceContainerLow", corners: round(20) });
  },

  /* the title and how many are done, the tasks (a check, the words, a remove button), and an entry to add one */
  "todo-list": (p) => {
    const tasks = p.list("items");
    const done = tasks.filter((t) => t.variant === "done").length;
    return vbox({ width: px(p), hugWidth: false, padX: 12, padY: 12, gap: 4 }, [
      ...some(p.s("title") && hbox({ justify: "between", padX: 4, padY: 0, gap: 8 }, [text(p.s("title"), "heading"), text(`${done} / ${tasks.length}`, "caption", { color: "on-surface-variant" })])),
      ...tasks.map((t) =>
        hbox({ padLeft: 12, padRight: 0, padY: 0, gap: 12 }, [atom("checkbox", { label: "", checked: t.variant === "done" }), hbox({ padX: 4, padY: 8, gap: 0, hugWidth: false, width: 160 }, [para(t.label, "body", { color: t.variant === "done" ? "on-surface-variant" : "" })], { grow: true }), iconButton("close", "Remove", { size: "xs" })]),
      ),
      hbox({ padX: 0, padTop: 4, padBottom: 0, gap: 4 }, [atom("input", { placeholder: p.s("placeholder"), size: "sm", variant: "outlined" }, { grow: true }), iconButton("add", "Add", { variant: "tonal", size: "sm" })]),
    ], { fill: "surfaceContainerLow", corners: round(20) });
  },

  /* the heading, the fields of the mode it is in, remember me and the way back in, the main action, the other ways in
   * and the way to the other form; what the visitor types stays in the entries, the rules are the API's */
  "auth-form": (p) => {
    const up = p.s("mode") === "sign-up";
    const password = hbox({ surface: "chip", padLeft: 0, padRight: 8, padY: 0, gap: 0, hugWidth: false, width: 240, hugHeight: false, height: 56 }, [entry(p.s("passwordLabel"), { type: "password" }), iconButton("visibility", "Show password", { size: "sm" })], { corners: round(4) });
    const link = up ? p.s("toIn") : p.s("toUp");
    return vbox({ width: px(p), hugWidth: false, padX: 20, padY: 20, gap: 12 }, [
      vbox({ gap: 0, padX: 0, padY: 0 }, some(para(up ? p.s("upTitle") : p.s("title"), "headline"), !up && p.s("subtitle") && para(p.s("subtitle"), "body", { color: "on-surface-variant" }))),
      ...some(up && field(p.s("nameLabel"), "text")),
      field(p.s("emailLabel"), "email"),
      password,
      ...some(up && field(p.s("confirmLabel"), "password")),
      ...some(!up && (p.s("remember") || p.s("forgot")) && hbox({ justify: "between", padX: 0, padY: 0, gap: 8 }, [p.s("remember") ? atom("checkbox", { label: p.s("remember"), checked: false }) : rest(), ...some(p.s("forgot") && button(p.s("forgot"), { variant: "text", size: "xs" }))])),
      button(up ? p.s("upAction") : p.s("action"), { variant: "filled", size: "sm" }),
      ...p.list("others").map((o) => button(o.label, { variant: "outlined", size: "sm" })),
      ...some(link && hbox({ justify: "center", padX: 0, padY: 0, gap: 0 }, [button(link, { variant: "text", size: "xs" })])),
    ], { fill: "surfaceContainerLow", corners: round(20) });
  },
};

/** where each place of a split here is: what `SPLIT_TAPS` says for the splits in splits.ts */
export type RetiredTaps = { slots?: (p: P, tree: Node) => Record<string, Node | undefined> };

const all = (n: Node): Node[] => [n, ...(n.kids ?? []).flatMap(all)];
const buttons = (t: Node) => all(t).filter((x) => x.slug === "button");

export const RETIRED_TAPS: Record<string, RetiredTaps> = {
  /* the checkout button ends the foot */
  "cart-list": { slots: (p, t) => ({ action: p.s("action") ? buttons(t).at(-1) : undefined }) },
  /* the buttons in the order the form shows them: forgot, the main action, the other ways in, the way to the other form */
  "auth-form": {
    slots: (p, t) => {
      const up = p.s("mode") === "sign-up";
      const list = buttons(t);
      const forgot = !up && p.s("forgot") ? list.shift() : undefined;
      const submit = list.shift();
      const others = p.list("others").map(() => list.shift());
      const swap = (up ? p.s("toIn") : p.s("toUp")) ? list.shift() : undefined;
      return { submit, forgot, switch: swap, ...Object.fromEntries(others.map((n, i) => [`other:${i}`, n])) };
    },
  },
};
