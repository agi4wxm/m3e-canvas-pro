import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { TEMPLATES } from "../../../parts/templates";
import { setGlobalLang } from "../../i18n";
import type { Doc, Frame } from "../../tokens";
import { buildProduct } from "../product";
import { printRnScreens } from "../rn/print";
import { printMiniScreens } from "../miniapp/print";
import { routeSegment, screenToken, screenWords } from "./names";
import { SCREEN_WORDS } from "./screenWords";

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });

const docOf = (frames: Frame[]): Doc => ({ groups: [], frames, paletteKey: "purple", frame: "phone", title: "路由", brief: "" });
const screen = (id: string, name: string, x = 0): Frame => ({ id, name, x, y: 0 });

describe("a screen's words", () => {
  it("are its own when they make a name, else the English the templates give them, else none", () => {
    expect(screenWords({ name: "Product details" })).toBe("Product details");
    expect(screenWords({ name: "首页" })).toBe("Home");
    expect(screenWords({ name: "商品详情" })).toBe("Product");
    expect(screenWords({ name: "ホーム" })).toBe("Home");
    expect(screenWords({ name: "장바구니" })).toBe("Cart");
    /* the name a new screen is given, with its number */
    expect(screenWords({ name: "屏幕 2" })).toBe("Screen 2");
    expect(screenWords({ name: "画面3" })).toBe("Screen 3");
    /* nothing the templates say: the screen is named after its id */
    expect(screenWords({ name: "合计" })).toBeUndefined();
    expect(screenWords({ name: "2 步" })).toBeUndefined();
    expect(screenToken({ id: "k3j2h1g5" })).toBe("K3j2h1g5");
    expect(screenToken({ id: "f-welcome" })).toBe("FWelcome");
    /* an id with no ASCII at all is hashed, the same every time */
    expect(screenToken({ id: "首页" })).toMatch(/^[A-Z0-9]+$/);
    expect(screenToken({ id: "首页" })).toBe(screenToken({ id: "首页" }));
    expect(routeSegment("productDetails")).toBe("product-details");
    expect(routeSegment("ProductDetails")).toBe("product-details");
  });

  it("know every screen name the templates give in Chinese, Japanese and Korean (the table is only ever added to)", () => {
    const missing: string[] = [];
    for (const t of TEMPLATES)
      for (const s of t.build())
        for (const lang of ["zh", "ja", "ko"] as const) {
          const name = s.name[lang].normalize("NFKC").trim();
          if (!/[A-Za-z]/.test(name) && !SCREEN_WORDS[name]) missing.push(`${t.slug}: ${name}`);
        }
    expect(missing).toEqual([]);
    /* each entry names a route: printable ASCII, starting with a letter */
    for (const [k, v] of Object.entries(SCREEN_WORDS)) expect(/^[A-Za-z][\x20-\x7e]*$/.test(v), k).toBe(true);
  });
});

describe("Chinese screen names", () => {
  const frames = [screen("home", "首页"), screen("p1", "商品详情", 600), screen("k3j2h1g5", "合计", 1200), screen("x9", "合计", 1800), screen("again", "首页", 2400)];

  it("give the phone app and the mini-program readable keys that do not hang on a screen's place", () => {
    const rn = printRnScreens(docOf(frames), {});
    expect(rn.screens.map((s) => s.key)).toEqual(["Home", "Product", "screenK3j2h1g5", "screenX9", "Home2"]);
    expect(rn.screens.map((s) => s.component)).toEqual(["HomeScreen", "ProductScreen", "ScreenK3j2h1g5", "ScreenX9", "HomeScreen2"]);
    const mini = printMiniScreens(docOf(frames), {});
    expect(mini.screens.map((s) => s.key)).toEqual(["home", "product", "screenK3j2h1g5", "screenX9", "home2"]);
    expect(mini.screens.map((s) => s.path)).toEqual(["pages/home/index", "pages/product/index", "pages/screenK3j2h1g5/index", "pages/screenX9/index", "pages/home2/index"]);
    /* a screen added before the others, or one taken out, moves no other screen's key */
    const more = [screen("new", "我的", -600), ...frames.slice(0, 2), ...frames.slice(3)];
    const again = printMiniScreens(docOf(more), {});
    expect(again.screens.map((s) => s.key)).toEqual(["me", "home", "product", "screenX9", "home2"]);
    expect(printRnScreens(docOf(more), {}).screens.find((s) => s.id === "x9")!.key).toBe("screenX9");
  });

  it("give the same routes on the web, the phone and the mini-program, on every export", async () => {
    const doc = docOf(frames);
    const routes = async (d: Doc) => {
      const p = await buildProduct(d, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "zh" });
      const web = p.files["apps/web/src/generated/routes.ts"].body as string;
      const mobile = Object.keys(p.files).filter((f) => /^apps\/mobile\/src\/app\/[^(/]+\.tsx$/.test(f) && !f.endsWith("_layout.tsx") && !f.endsWith("index.tsx"));
      const pages = Object.keys(p.files).filter((f) => /^apps\/miniapp\/src\/pages\/[^/]+\/index\.tsx$/.test(f));
      return {
        web: [...web.matchAll(/^ {2}(\w+): "([^"]+)",$/gm)].map((m) => [m[1], m[2]]),
        mobile: mobile.map((f) => f.slice("apps/mobile/src/app/".length, -".tsx".length)).sort(),
        miniapp: pages.map((f) => f.split("/")[4]).sort(),
      };
    };
    const first = await routes(doc);
    expect(first.web).toEqual([
      ["home", "/home"],
      ["product", "/product"],
      ["screenK3j2h1g5", "/screen-k3j2h1g5"],
      ["screenX9", "/screen-x9"],
      ["home2", "/home2"],
    ]);
    expect(first.mobile).toEqual(["home", "home2", "product", "screen-k3j2h1g5", "screen-x9"]);
    expect(first.miniapp).toEqual(["home", "home2", "product", "screenK3j2h1g5", "screenX9"]);
    /* the three agree: the web's and the phone's paths are the mini-program's pages, in kebab case */
    expect(first.web.map(([key]) => routeSegment(key)).sort()).toEqual(first.mobile);
    /* exported again, the same routes */
    expect(await routes(doc)).toEqual(first);
  }, 120_000);
});
