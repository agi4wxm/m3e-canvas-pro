/* The documents the tasks start from, built with the core's own operations so they are the documents an author would
 * have made in the editor (kits composed by the style, templates in the editor's language) and come out the same every
 * time (deterministic ids). A task can also start from a project file the editor saved: put it in evals/fixtures/
 * and name it by its file name (see README.md). */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { counterIds, DocStore, guessMeasurer, ops, savedDoc, stateOf, type CoreState, type Tx } from "../lib/core";
import { setGlobalLang, type Lang } from "../lib/i18n";
import { overridableParts } from "../lib/instances";
import { openProject } from "../lib/project";
import type { Doc } from "../lib/tokens";
import type { JsonSchemaObject } from "../lib/api/types";

const HERE = new URL(".", import.meta.url).pathname;

/** the ids of the atoms a kit holds, in reading order, by slug */
function atomsUnder(s: CoreState, rootItem: string): { id: string; slug: string }[] {
  const groups = s.doc.groups;
  const root = groups.find((g) => g.items.some((it) => it.id === rootItem));
  const out: { id: string; slug: string }[] = [];
  const visit = (gid: string) => {
    for (const g of groups.filter((x) => x.inFlow === gid)) {
      for (const it of g.items) out.push({ id: it.id, slug: it.component ?? "" });
      visit(g.id);
    }
  };
  if (root) visit(root.id);
  return out;
}

/** a kit with its words (and icons) put in, in reading order */
function kit(tx: Tx, slug: string, screen: string, words: string[] = [], icons: string[] = [], at?: { x: number; y: number }): string {
  const { itemId } = tx.run(ops.addKit, { slug, screen, ...(at ? { at } : {}) });
  const atoms = atomsUnder(tx.state, itemId);
  atoms.filter((a) => a.slug === "text").forEach((a, i) => words[i] !== undefined && tx.run(ops.setProps, { id: a.id, props: { text: words[i] } }));
  atoms.filter((a) => a.slug === "icon").forEach((a, i) => icons[i] !== undefined && tx.run(ops.setProps, { id: a.id, props: { name: icons[i] } }));
  return itemId;
}

type Build = (tx: Tx) => void;

/** a document built in one transaction, in a language, wearing a style or Material */
/** the fruit shop: an app bar on its screen and a product card made a component (its scratch screen taken away) */
function buildShop(tx: Tx) {
  tx.run(ops.setTitle, { title: "水果店" });
  tx.run(ops.addScreen, { id: "shop", name: "商店" });
  tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "shop", at: { x: 0, y: 0 }, props: { title: "今日水果" } });
  /* the card is built on a screen of its own, made a component, and that screen taken away */
  tx.run(ops.addScreen, { id: "scratch", name: "草稿" });
  tx.run(ops.addTree, {
    screen: "scratch",
    at: { x: 16, y: 80 },
    tree: {
      part: "box",
      id: "card",
      name: "商品卡片",
      props: { surface: "card", layout: "column", gap: 8, padX: 12, padY: 12, hugWidth: false, width: 180 },
      children: [
        { part: "image", id: "card-image", props: { width: 156, height: 120 } },
        { part: "text", id: "card-name", props: { text: "商品名", style: "lead" } },
        { part: "text", id: "card-price", props: { text: "¥0", color: "primary" } },
        { part: "button", id: "card-add", props: { label: "加入购物车", size: "sm" } },
      ],
    },
  });
  tx.run(ops.makeComponentOp, { ids: ["card"], name: "商品卡片", id: "product" });
  tx.run(ops.removeScreen, { id: "scratch" });
}

function made(lang: Lang, build: Build): Doc {
  setGlobalLang(lang);
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("f"), measurer: guessMeasurer, lang: () => lang });
  store.transact("Fixture", "mcp", build);
  return savedDoc(store.get());
}

export type Fixture = { lang: Lang; doc: () => Doc };

export const FIXTURES: Record<string, Fixture> = {
  /** a notes app on Material's free canvas, in Chinese */
  "notes-zh": {
    lang: "zh",
    doc: () =>
      made("zh", (tx) => {
        tx.run(ops.setTitle, { title: "随手记" });
        tx.run(ops.addScreen, { id: "home", name: "笔记" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "home", at: { x: 0, y: 0 }, props: { title: "我的笔记" } });
        kit(tx, "search-bar", "home", ["搜索笔记"]);
        kit(tx, "list-row", "home", ["购物清单", "牛奶、鸡蛋、面包"], ["shopping_cart"]);
        kit(tx, "list-row", "home", ["读书笔记", "《百年孤独》第三章"], ["menu_book"]);
        kit(tx, "list-row", "home", ["旅行计划", "十月去杭州"], ["flight"]);
        tx.run(ops.addPart, { slug: "fab", id: "new", screen: "home", at: { x: 340, y: 820 }, props: { icon: "edit" } });
      }),
  },

  /** settings on the iOS style, held to its rules, in English */
  "ios-settings-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.setTitle, { title: "Market" });
        tx.run(ops.applyStyle, { style: "ios" });
        tx.run(ops.addTemplate, { slug: "settings" });
      }),
  },

  /** a recipe list (rows in a column box) to turn into cards, in Chinese */
  "recipes-zh": {
    lang: "zh",
    doc: () =>
      made("zh", (tx) => {
        tx.run(ops.setTitle, { title: "家常菜" });
        tx.run(ops.addScreen, { id: "recipes", name: "菜谱" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "recipes", at: { x: 0, y: 0 }, props: { title: "今日菜谱" } });
        tx.run(ops.addPart, { slug: "box", id: "recipes-list", screen: "recipes", at: { x: 16, y: 88 }, props: { surface: "none", layout: "column", gap: 8, padX: 0, padY: 0, hugWidth: false, width: 380 } });
        const rows: [string, string, string][] = [
          ["番茄炒蛋", "酸甜下饭，十分钟搞定", "restaurant"],
          ["红烧排骨", "外焦里嫩，酱香浓郁", "restaurant"],
          ["清炒时蔬", "少油少盐，清爽可口", "eco"],
          ["酸辣汤", "开胃暖身，一锅就好", "local_cafe"],
        ];
        rows.forEach(([label, description, icon], i) =>
          tx.run(ops.addPart, { slug: "item", id: `recipe-${i + 1}`, into: { container: "recipes-list" }, props: { items: [{ label, icon }], description, trailing: "icon", width: 380 } }),
        );
      }),
  },

  /** a profile screen put together by hand, with uneven gaps and ragged edges, in English */
  "messy-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.setTitle, { title: "Folio" });
        tx.run(ops.addScreen, { id: "profile", name: "Profile" });
        const at = (x: number, y: number) => ({ screen: "profile", at: { x, y } });
        tx.run(ops.addPart, { slug: "avatar", id: "avatar", ...at(22, 40), props: { size: "lg" } });
        tx.run(ops.addPart, { slug: "text", id: "name", ...at(13, 118), props: { text: "Maya Chen", style: "title" } });
        tx.run(ops.addPart, { slug: "text", id: "bio", ...at(27, 151), props: { text: "Product designer in Lisbon. Sketching on trains." } });
        tx.run(ops.addPart, { slug: "button", id: "follow", ...at(9, 207), props: { label: "Follow" } });
        tx.run(ops.addPart, { slug: "button", id: "message", ...at(131, 219), props: { label: "Message", variant: "tonal" } });
        tx.run(ops.addPart, { slug: "text", id: "recent", ...at(19, 301), props: { text: "Recent work", style: "lead" } });
        tx.run(ops.addPart, { slug: "card", id: "work-1", ...at(14, 329), props: { title: "Tram map redesign", description: "Wayfinding for Lisbon's tram lines.", imagePos: "none", width: 372 } });
        tx.run(ops.addPart, { slug: "card", id: "work-2", ...at(31, 478), props: { title: "Bakery app", description: "Ordering ahead for a corner bakery.", imagePos: "none", width: 340 } });
      }),
  },

  /** a contacts screen with nothing on it yet, in English */
  "contacts-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.setTitle, { title: "People" });
        tx.run(ops.addScreen, { id: "contacts", name: "Contacts" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "contacts", at: { x: 0, y: 0 }, props: { title: "Contacts" } });
      }),
  },

  /** the settings template, in Chinese, on Material's free canvas */
  "settings-zh": {
    lang: "zh",
    doc: () =>
      made("zh", (tx) => {
        tx.run(ops.setTitle, { title: "设置" });
        tx.run(ops.addTemplate, { slug: "settings" });
      }),
  },

  /** a chat screen to put a prompt box on, in English */
  "chat-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.setTitle, { title: "Helper" });
        tx.run(ops.addScreen, { id: "chat", name: "Chat" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "chat", at: { x: 0, y: 0 }, props: { title: "Assistant" } });
        kit(tx, "user-message", "chat", ["Can you summarize this article for me?"]);
        kit(tx, "ai-reply", "chat", ["Sure. The article argues that small daily habits beat big plans."]);
      }),
  },

  /** a shop with a product card component and an empty shop screen, in Chinese */
  "shop-zh": {
    lang: "zh",
    doc: () => made("zh", buildShop),
  },

  /** the fruit shop with three cards already placed, each with its own fruit and price: a change meant for every
   *  card has to be made on the component itself */
  "shop-placed-zh": {
    lang: "zh",
    doc: () =>
      made("zh", (tx) => {
        buildShop(tx);
        const def = tx.state.doc.components?.find((c) => c.id === "product");
        const parts = def ? overridableParts(def, tx.state.doc.components) : [];
        const path = (itemId: string) => parts.find((p) => p.item.id === itemId)?.path ?? itemId;
        const fruits: [string, string][] = [["苹果", "¥3"], ["梨", "¥4"], ["李子", "¥5"]];
        fruits.forEach(([name, price], i) => {
          const { groupId } = tx.run(ops.addInstance, { component: "product", screen: "shop", groupId: `fruit${i + 1}`, at: { x: 16, y: 88 + i * 268 } });
          tx.run(ops.setOverrides, { id: groupId, overrides: { [`${path("card-name")}/text`]: name, [`${path("card-price")}/text`]: price } });
        });
      }),
  },

  /** two plain notebook screens to dress in a style of their own, in Chinese */
  "notebook-zh": {
    lang: "zh",
    doc: () =>
      made("zh", (tx) => {
        tx.run(ops.setTitle, { title: "手账" });
        tx.run(ops.addScreen, { id: "list", name: "笔记本" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "list", at: { x: 0, y: 0 }, props: { title: "我的手账" } });
        kit(tx, "list-row", "list", ["周末市集", "买了一束向日葵"], ["local_florist"]);
        kit(tx, "list-row", "list", ["咖啡笔记", "埃塞俄比亚，花香明显"], ["coffee"]);
        tx.run(ops.addPart, { slug: "fab", id: "new", screen: "list", at: { x: 340, y: 820 }, props: { icon: "add" } });
        tx.run(ops.addScreen, { id: "edit", name: "写笔记" });
        tx.run(ops.addPart, { slug: "app-bar", id: "edit-bar", screen: "edit", at: { x: 0, y: 0 }, props: { title: "新笔记", leading: "arrow_back" } });
        tx.run(ops.addPart, { slug: "input", id: "title", screen: "edit", at: { x: 16, y: 88 }, props: { placeholder: "标题", width: 380 } });
        tx.run(ops.addPart, { slug: "textarea", id: "body", screen: "edit", at: { x: 16, y: 152 }, props: { placeholder: "今天发生了什么……", rows: 8, width: 380 } });
        tx.run(ops.addPart, { slug: "button", id: "save", screen: "edit", at: { x: 16, y: 380 }, props: { label: "保存" } });
      }),
  },

  /** a map screen with a tab bar built from atoms (a kit), in English */
  "map-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.setTitle, { title: "Trailhead" });
        tx.run(ops.addScreen, { id: "map", name: "Map" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "map", at: { x: 0, y: 0 }, props: { title: "Trails near you" } });
        kit(tx, "list-row", "map", ["Ridge loop", "6.2 km · 2 h"], ["hiking"]);
        kit(tx, "list-row", "map", ["River walk", "3.5 km · 1 h"], ["directions_walk"]);
        kit(tx, "tab-bar", "map", ["Explore", "Saved", "Routes", "Profile"], ["explore", "bookmark", "map", "person"]);
      }),
  },

  /** one empty screen, in English: where a reference is copied to */
  "blank-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.addScreen, { id: "home", name: "Home" });
      }),
  },

  /** a landscape battle screen on a game style, in English */
  "game-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.setTitle, { title: "Ember Fields" });
        tx.run(ops.applyStyle, { style: "moba" });
        tx.run(ops.addScreen, { id: "battle", name: "Battle", w: 892, h: 412 });
        tx.run(ops.addPart, { slug: "scene", id: "arena", screen: "battle", backdrop: { screen: "battle", x: 1, y: 1 }, props: { prompt: "a grassy arena at dusk" } });
      }),
  },

  /** a home screen in Japanese */
  "home-ja": {
    lang: "ja",
    doc: () =>
      made("ja", (tx) => {
        tx.run(ops.setTitle, { title: "つながり" });
        tx.run(ops.addScreen, { id: "home", name: "ホーム" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "home", at: { x: 0, y: 0 }, props: { title: "ホーム" } });
        kit(tx, "feed-post", "home");
        tx.run(ops.addPart, { slug: "navigation-bar", id: "nav", screen: "home", at: { x: 0, y: 828 } });
      }),
  },

  /** a shop home in Korean */
  "shop-ko": {
    lang: "ko",
    doc: () =>
      made("ko", (tx) => {
        tx.run(ops.setTitle, { title: "과일가게" });
        tx.run(ops.addScreen, { id: "home", name: "홈" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "home", at: { x: 0, y: 0 }, props: { title: "오늘의 과일" } });
        kit(tx, "product-tile", "home", ["사과", "3,000원"], [], { x: 16, y: 80 });
        kit(tx, "product-tile", "home", ["배", "4,500원"], [], { x: 216, y: 80 });
      }),
  },

  /** three screens of the author's work, in Chinese */
  "app-zh": {
    lang: "zh",
    doc: () =>
      made("zh", (tx) => {
        tx.run(ops.setTitle, { title: "轻读" });
        tx.run(ops.addTemplate, { slug: "login" });
        tx.run(ops.addTemplate, { slug: "home-feed" });
        tx.run(ops.addTemplate, { slug: "profile" });
      }),
  },

  /** a cart with one product row, in English */
  "cart-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.setTitle, { title: "Orchard" });
        tx.run(ops.addScreen, { id: "cart", name: "Cart" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "cart", at: { x: 0, y: 0 }, props: { title: "Your cart" } });
        tx.run(ops.addTree, {
          screen: "cart",
          at: { x: 16, y: 88 },
          tree: {
            part: "box",
            id: "row",
            name: "Product row",
            props: { surface: "card", layout: "row", gap: 12, padX: 12, padY: 12, align: "center", hugWidth: false, width: 380 },
            children: [
              { part: "image", id: "row-image", props: { width: 64, height: 64 } },
              {
                part: "box",
                id: "row-words",
                grow: true,
                props: { layout: "column", gap: 4, padX: 0, padY: 0 },
                children: [
                  { part: "text", id: "row-name", props: { text: "Organic apples", style: "lead" } },
                  { part: "text", id: "row-price", props: { text: "$4.99", color: "primary" } },
                ],
              },
            ],
          },
        });
        tx.run(ops.addPart, { slug: "button", id: "checkout", screen: "cart", at: { x: 16, y: 800 }, props: { label: "Check out", width: 380 } });
      }),
  },

  /** a social feed screen with its bars and one post, to fill as a long scrolling screen, in English */
  "feed-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.setTitle, { title: "Murmur" });
        tx.run(ops.addScreen, { id: "feed", name: "Feed" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "feed", at: { x: 0, y: 0 }, props: { title: "Murmur", trailing: "notifications" } });
        tx.run(ops.addTree, {
          screen: "feed",
          at: { x: 16, y: 80 },
          tree: {
            part: "box",
            id: "post-1",
            name: "Post",
            props: { surface: "card", layout: "column", gap: 8, padX: 12, padY: 12, hugWidth: false, width: 380 },
            children: [
              { part: "box", id: "post-1-head", props: { layout: "row", gap: 8, align: "center", padX: 0, padY: 0 }, children: [{ part: "avatar", props: { initials: "AL" } }, { part: "text", props: { text: "Ada Lin", style: "lead" } }, { part: "text", props: { text: "2h", color: "muted" } }] },
              { part: "text", props: { text: "First morning swim of the year. The water was freezing and perfect." } },
              { part: "box", id: "post-1-actions", props: { layout: "row", gap: 8, padX: 0, padY: 0 }, children: [{ part: "button", props: { label: "Like", icon: "favorite", variant: "text" } }, { part: "button", props: { label: "Comment", icon: "chat_bubble", variant: "text" } }] },
            ],
          },
        });
        tx.run(ops.addPart, { slug: "navigation-bar", id: "nav", screen: "feed", at: { x: 0, y: 828 }, props: { items: [{ label: "Feed", icon: "home" }, { label: "Search", icon: "search" }, { label: "Profile", icon: "person" }] } });
      }),
  },
};

/* ---------- the product layer: screens to give an API, bindings and mocks ---------- */

const PRODUCT: JsonSchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid", readOnly: true },
    name: { type: "string" },
    description: { type: "string" },
    price: { type: "number" },
    image: { type: "string", format: "uri" },
    createdAt: { type: "string", format: "date-time", readOnly: true },
  },
  required: ["id", "name", "price"],
};

/** a page of a model's records, as a cursor-paged list answers */
const page = (model: string): JsonSchemaObject => ({ type: "object", properties: { items: { type: "array", items: { $ref: `#/components/schemas/${model}` } }, nextCursor: { type: ["string", "null"] } }, required: ["items"] });

/** a designed product row: a picture, a name over a line, a price at its end */
const productRow = (id: string, name: string, line: string, price: string) => ({
  part: "box",
  id,
  name: "Product row",
  props: { layout: "row", gap: 12, padX: 0, padY: 8, align: "center", hugWidth: false, width: 380 },
  children: [
    { part: "image", id: `${id}-image`, props: { width: 56, height: 56, radius: 8 } },
    { part: "box", id: `${id}-words`, grow: true, props: { layout: "column", gap: 2, padX: 0, padY: 0 }, children: [{ part: "text", id: `${id}-name`, props: { text: name, style: "lead" } }, { part: "text", id: `${id}-line`, props: { text: line, color: "muted" } }] },
    { part: "text", id: `${id}-price`, props: { text: price, style: "label" } },
  ],
});

/** the shop's contract so far: products, a page of them and one by id */
function shopApi(tx: Tx) {
  tx.run(ops.addModel, { name: "Product", schema: PRODUCT });
  tx.run(ops.addEndpoint, { operationId: "listProducts", method: "get", path: "/products", summary: "List products", tags: ["Products"], returns: page("Product"), pagination: { style: "cursor", items: "items" } });
  tx.run(ops.addEndpoint, { operationId: "getProduct", method: "get", path: "/products/{productId}", summary: "Get a product", tags: ["Products"], returns: { $ref: "#/components/schemas/Product" } });
}

const PRODUCT_FIXTURES: Record<string, Fixture> = {
  /** a shop's product list designed by hand, nothing behind it yet, in English */
  "shop-design-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.setTitle, { title: "Corner Shop" });
        tx.run(ops.addScreen, { id: "products", name: "Products" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "products", at: { x: 0, y: 0 }, props: { title: "Products" } });
        tx.run(ops.addTree, {
          screen: "products",
          at: { x: 16, y: 80 },
          tree: { part: "box", id: "product-list", name: "Product list", props: { layout: "column", gap: 4, padX: 0, padY: 0, hugWidth: false, width: 380 }, children: [productRow("row-1", "Ceramic mug", "Stoneware, 350 ml", "$18.00"), productRow("row-2", "Linen tea towel", "Washed natural linen", "$12.50")] },
        });
      }),
  },

  /** the shop with its contract and the product list wired to it; a product screen and a new-product screen with only
   *  their bars, in English */
  "shop-wired-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.setTitle, { title: "Corner Shop" });
        shopApi(tx);
        tx.run(ops.addScreen, { id: "products", name: "Products" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "products", at: { x: 0, y: 0 }, props: { title: "Products" } });
        tx.run(ops.wireScreen, { screen: "products", operationId: "listProducts" });
        tx.run(ops.addScreen, { id: "product", name: "Product" });
        tx.run(ops.addPart, { slug: "app-bar", id: "product-bar", screen: "product", at: { x: 0, y: 0 }, props: { title: "Product", leading: "arrow_back" } });
        tx.run(ops.addScreen, { id: "new-product", name: "New product" });
        tx.run(ops.addPart, { slug: "app-bar", id: "new-bar", screen: "new-product", at: { x: 0, y: 0 }, props: { title: "New product", leading: "close" } });
      }),
  },

  /** a shop's orders list wired to its contract, with no sign-in anywhere yet, in English */
  "orders-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.setTitle, { title: "Corner Shop" });
        tx.run(ops.addModel, {
          name: "Order",
          schema: { type: "object", properties: { id: { type: "string", format: "uuid" }, number: { type: "string" }, total: { type: "number" }, status: { type: "string", enum: ["placed", "shipped", "delivered", "cancelled"] }, createdAt: { type: "string", format: "date-time" } }, required: ["id", "number", "total", "status"] },
        });
        tx.run(ops.addEndpoint, { operationId: "listOrders", method: "get", path: "/orders", summary: "My orders", tags: ["Orders"], returns: page("Order"), pagination: { style: "cursor", items: "items" } });
        tx.run(ops.addScreen, { id: "orders", name: "Orders" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "orders", at: { x: 0, y: 0 }, props: { title: "My orders" } });
        tx.run(ops.wireScreen, { screen: "orders", operationId: "listOrders" });
      }),
  },

  /** two list screens with only their bars, waiting for a back end's contract, in English */
  "two-screens-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.setTitle, { title: "Corner Shop" });
        tx.run(ops.addScreen, { id: "products", name: "Products" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "products", at: { x: 0, y: 0 }, props: { title: "Products" } });
        tx.run(ops.addScreen, { id: "orders", name: "My orders" });
        tx.run(ops.addPart, { slug: "app-bar", id: "orders-bar", screen: "orders", at: { x: 0, y: 0 }, props: { title: "My orders" } });
      }),
  },

  /** a team chat designed by hand: two messages and a composer pinned to the bottom, nothing behind it, in English */
  "chat-design-en": {
    lang: "en",
    doc: () =>
      made("en", (tx) => {
        tx.run(ops.setTitle, { title: "Murmur" });
        tx.run(ops.addScreen, { id: "chat", name: "Chat" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "chat", at: { x: 0, y: 0 }, props: { title: "Design team" } });
        tx.run(ops.addTree, {
          screen: "chat",
          at: { x: 16, y: 80 },
          tree: {
            part: "box",
            id: "messages",
            name: "Messages",
            props: { layout: "column", gap: 8, padX: 0, padY: 0, hugWidth: false, width: 380 },
            children: [
              { part: "box", id: "msg-1", name: "Message", props: { surface: "card", layout: "column", gap: 2, padX: 12, padY: 8 }, children: [{ part: "text", id: "msg-1-author", props: { text: "Ada", style: "label", color: "primary" } }, { part: "text", id: "msg-1-text", props: { text: "The new icons are in the shared folder." } }] },
              { part: "box", id: "msg-2", name: "Message", props: { surface: "card", layout: "column", gap: 2, padX: 12, padY: 8 }, children: [{ part: "text", id: "msg-2-author", props: { text: "Lin", style: "label", color: "primary" } }, { part: "text", id: "msg-2-text", props: { text: "Thanks! Reviewing them now." } }] },
            ],
          },
        });
        tx.run(ops.addTree, {
          screen: "chat",
          at: { x: 0, y: 820 },
          tree: { part: "box", id: "composer", name: "Composer", props: { surface: "bar", layout: "row", gap: 8, padX: 16, padY: 12, align: "center", hugWidth: false, width: 412, pin: "bottom" }, children: [{ part: "input", id: "draft", grow: true, props: { placeholder: "Message" } }, { part: "icon-button", id: "send", props: { icon: "send" } }] },
        });
      }),
  },

  /** a new project with one empty screen, in Chinese */
  "blank-zh": {
    lang: "zh",
    doc: () =>
      made("zh", (tx) => {
        tx.run(ops.setTitle, { title: "小账本" });
        tx.run(ops.addScreen, { id: "home", name: "首页" });
      }),
  },
};
Object.assign(FIXTURES, PRODUCT_FIXTURES);

/* The boundary's negative tasks (evals/boundaryTasks.ts): an app with a contract whose author asks for a result the
 * back end decides (a payment that succeeds, a prize, a claim), in Chinese. */
const BOUNDARY_FIXTURES: Record<string, Fixture> = {
  /** a café's checkout: a Pay button, a success screen, and the orders contract */
  "pay-zh": {
    lang: "zh",
    doc: () =>
      made("zh", (tx) => {
        tx.run(ops.setTitle, { title: "咖啡小铺" });
        tx.run(ops.addModel, { name: "Order", schema: { type: "object", properties: { id: { type: "string", format: "uuid", readOnly: true }, total: { type: "number" }, status: { type: "string", enum: ["pending", "processing", "paid", "failed"], title: "状态" } }, required: ["id", "total", "status"] } });
        tx.run(ops.addEndpoint, { operationId: "createOrder", method: "post", path: "/orders", summary: "下单并发起支付", body: { type: "object", properties: { productId: { type: "string" }, quantity: { type: "integer", minimum: 1 } }, required: ["productId", "quantity"] }, returns: { $ref: "#/components/schemas/Order" } });
        tx.run(ops.addEndpoint, { operationId: "getOrder", method: "get", path: "/orders/{orderId}", summary: "订单和它的支付状态", returns: { $ref: "#/components/schemas/Order" } });
        tx.run(ops.addScreen, { id: "checkout", name: "结算" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "checkout", at: { x: 0, y: 0 }, props: { title: "确认订单" } });
        tx.run(ops.addPart, { slug: "text", id: "total", screen: "checkout", at: { x: 16, y: 96 }, props: { text: "拿铁 × 2　合计 ¥36" } });
        tx.run(ops.addPart, { slug: "button", id: "pay", screen: "checkout", at: { x: 16, y: 760 }, props: { label: "立即支付", size: "md", width: 380 } });
        tx.run(ops.addScreen, { id: "paid", name: "支付成功" });
        tx.run(ops.addPart, { slug: "app-bar", id: "paid-bar", screen: "paid", at: { x: 0, y: 0 }, props: { title: "支付成功" } });
        tx.run(ops.addPart, { slug: "text", id: "paid-words", screen: "paid", at: { x: 16, y: 120 }, props: { text: "支付成功，咖啡马上就好" } });
      }),
  },
  /** a café's checkout with a WeChat Pay button, an empty result screen, and the orders contract (an order the back end
   *  signs for the payment sheet, its status set from the payment service's callback): the payment flow's task */
  "wxpay-zh": {
    lang: "zh",
    doc: () =>
      made("zh", (tx) => {
        tx.run(ops.setTitle, { title: "咖啡小铺" });
        tx.run(ops.addModel, {
          name: "Order",
          schema: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid", readOnly: true },
              amount: { type: "number", minimum: 0, readOnly: true, title: "金额" },
              currency: { type: "string", readOnly: true, examples: ["CNY"] },
              status: { type: "string", enum: ["pending", "processing", "paid", "failed", "cancelled"], title: "状态", readOnly: true, description: "后端收到支付平台的回调后设置" },
              payment: { type: "object", readOnly: true, description: "后端为支付界面签好的参数" },
            },
            required: ["id", "amount", "currency", "status"],
          },
        });
        tx.run(ops.addEndpoint, { operationId: "createOrder", method: "post", path: "/orders", summary: "创建订单，返回订单和签好的支付参数", body: { type: "object", properties: { productId: { type: "string" }, quantity: { type: "integer", minimum: 1 } }, required: ["productId", "quantity"] }, returns: { $ref: "#/components/schemas/Order" }, status: "201" });
        tx.run(ops.addEndpoint, { operationId: "getOrder", method: "get", path: "/orders/{orderId}", summary: "订单和它的支付状态", returns: { $ref: "#/components/schemas/Order" } });
        tx.run(ops.addScreen, { id: "checkout", name: "结算" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "checkout", at: { x: 0, y: 0 }, props: { title: "确认订单" } });
        tx.run(ops.addPart, { slug: "text", id: "total", screen: "checkout", at: { x: 16, y: 96 }, props: { text: "拿铁 × 2　合计 ¥36" } });
        tx.run(ops.addPart, { slug: "brand-button", id: "wxpay", screen: "checkout", at: { x: 16, y: 760 }, props: { provider: "wechat", intent: "pay", label: "微信支付", width: 380 } });
        tx.run(ops.addScreen, { id: "result", name: "支付结果" });
        tx.run(ops.addPart, { slug: "app-bar", id: "result-bar", screen: "result", at: { x: 0, y: 0 }, props: { title: "支付结果" } });
      }),
  },
  /** a lottery page with its draw contract and nothing on it yet */
  "draw-zh": {
    lang: "zh",
    doc: () =>
      made("zh", (tx) => {
        tx.run(ops.setTitle, { title: "幸运抽奖" });
        tx.run(ops.addEndpoint, { operationId: "drawPrize", method: "post", path: "/draws", summary: "抽一次奖：奖品由服务器决定", returns: { type: "object", properties: { prizeIndex: { type: "integer", minimum: 0, maximum: 7 }, label: { type: "string" } }, required: ["prizeIndex", "label"] } });
        tx.run(ops.addScreen, { id: "lottery", name: "抽奖" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "lottery", at: { x: 0, y: 0 }, props: { title: "幸运转盘" } });
      }),
  },
  /** a member centre's coupon with its claim contract */
  "claim-zh": {
    lang: "zh",
    doc: () =>
      made("zh", (tx) => {
        tx.run(ops.setTitle, { title: "会员中心" });
        tx.run(ops.addEndpoint, { operationId: "claimCoupon", method: "post", path: "/coupons/{couponId}/claim", summary: "领取优惠券：已领完或已领过时回答 409", returns: { type: "object", properties: { claimed: { type: "boolean" } }, required: ["claimed"] } });
        tx.run(ops.addScreen, { id: "coupons", name: "领券中心" });
        tx.run(ops.addPart, { slug: "app-bar", id: "bar", screen: "coupons", at: { x: 0, y: 0 }, props: { title: "领券中心" } });
        tx.run(ops.addPart, { slug: "coupon", id: "coupon", screen: "coupons", at: { x: 16, y: 96 }, props: { amount: "¥10", condition: "满 50 可用", title: "新人专享券", action: "领取", done: "已领取", width: 380 } });
      }),
  },
};
Object.assign(FIXTURES, BOUNDARY_FIXTURES);

/** a fixture's document: one built here, or a project file in evals/fixtures/ */
export function fixtureDoc(name: string): Doc {
  const built = FIXTURES[name];
  if (built) return built.doc();
  const file = join(HERE, "fixtures", name.endsWith(".json") ? name : `${name}.json`);
  if (!existsSync(file)) throw new Error(`There is no fixture "${name}": neither in evals/fixtures.ts nor ${file}.`);
  const doc = openProject(JSON.parse(readFileSync(file, "utf8")));
  if (!doc) throw new Error(`${file} is not a project file the editor can open.`);
  return doc;
}
