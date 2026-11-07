/* The tasks: what people ask the in-app agent for, spread over what it should be able to do, each with the document it
 * starts from, what it may spend and how it is graded. Requests are written the way a person types them, in the
 * language their editor is in. Add one by appending to TASKS (see README.md). */

import { asks, atFoot, autoLayout, barsPinned, collection, component, corners, counter, countShowing, custom, customStyle, darkControl, darkVar, evenSpacing, finished, has, inBounds, inBudget, instances, isA, keepsWork, language, likeness, navFlow, newScreen, noOverlap, partsOn, repeat, scrolls, shows, strictKept, styleTexture, svgPlaced, tapToDetail, undoOne, type Placed } from "./graders";
import type { Budget, Check, EvalTask } from "./types";
import { PRODUCT_TASKS } from "./productTasks";
import type { Doc, Item } from "../lib/tokens";

const MIN = 60_000;
const SMALL: Budget = { steps: 20, tokens: 1_000_000, ms: 6 * MIN, drawings: 0 };
const MEDIUM: Budget = { steps: 30, tokens: 2_000_000, ms: 10 * MIN, drawings: 0 };
const LARGE: Budget = { steps: 30, tokens: 3_000_000, ms: 15 * MIN, drawings: 1 };

/** what every task that changes the document is held to */
const basics = (): Check[] => [finished(), undoOne(), inBudget()];
/** what a screen the agent made or changed is held to */
const tidy = (o: { screens?: string[] } = {}): Check[] => [noOverlap(o), inBounds(o)];

const button = isA("button", "icon-button", "fab", "button-stack", "buy-bar", "checkout-bar");
const field = isA("input", "textarea", "text-field", "labeled-field", "password-field", "login-form", "auth-form");
const avatar = isA("avatar", "profile-summary", "profile-header");
const cardLike = (p: Placed) => isA("card", "media-card", "product-tile", "plan-card", "feed-post", "stat-tile")(p) || (p.node.slug === "box" && p.item?.props?.surface === "card");
const progressLike = isA("progress", "circular-progress", "stat-bar", "slider", "hud-top-bar");
const skillLike = (p: Placed) => isA("button", "icon-button", "fab", "skill-button", "cooldown-skill")(p) || (p.node.slug === "box" && ["button", "chip"].includes(String(p.item?.props?.surface ?? "")));
const anything = () => true;
const inTabBar = (p: Placed) => p.node.kit === "tab-bar" || p.node.slug === "navigation-bar" || (p.node.slug === "box" && p.item?.props?.pin === "bottom");

export const TASKS: EvalTask[] = [
  {
    id: "login-material",
    ability: "new-screen",
    title: "New login screen in the current style (Material, free canvas)",
    lang: "zh",
    fixture: "notes-zh",
    request: "按当前风格加一个登录页：邮箱、密码、登录按钮，再加一个忘记密码的链接。",
    budget: MEDIUM,
    checks: [...basics(), newScreen({ name: /登录|登陆/ }), has("fields", "email and password fields", field, { min: 1, critical: true }), has("button", "a sign-in button", button, { critical: true }), shows([/忘记密码/], { label: "a forgot-password link" }), language(), autoLayout(), ...tidy(), keepsWork()],
  },
  {
    id: "profile-ios-strict",
    ability: "new-screen",
    title: "New profile screen on a strict iOS document",
    lang: "en",
    fixture: "ios-settings-en",
    request: "Add a Profile screen in the current style: avatar, name, a short bio, and rows for Orders, Addresses and Payment methods.",
    budget: MEDIUM,
    checks: [...basics(), strictKept(), newScreen({ name: /profile/i }), has("avatar", "an avatar", avatar, { critical: true }), shows(["Orders", "Addresses", "Payment"], { label: "the three rows", critical: true }), language(), autoLayout(), ...tidy(), keepsWork()],
  },
  {
    id: "list-to-cards",
    ability: "edit",
    title: "Turn the selected list into cards",
    lang: "zh",
    fixture: "recipes-zh",
    select: ["recipes-list"],
    request: "把这个列表改成卡片，每张卡片有图片、标题和一句简介。",
    budget: MEDIUM,
    checks: [
      ...basics(),
      has("cards", "four cards", cardLike, { min: 4, screens: ["recipes"], critical: true }),
      has("pictures", "a picture on each card", isA("image", "card", "media-card", "product-tile"), { min: 4, screens: ["recipes"] }),
      shows(["番茄炒蛋", "红烧排骨", "清炒时蔬", "酸辣汤"], { screens: ["recipes"], label: "every recipe kept", critical: true }),
      custom("no-rows", "the old rows are gone", (g) => {
        const left = partsOn(g, "recipes").filter((p) => p.node.slug === "item");
        return { pass: !left.length, detail: left.length ? `${left.length} list rows left` : "no list rows left" };
      }),
      ...tidy({ screens: ["recipes"] }),
      keepsWork({ except: ["recipes"] }),
    ],
  },
  {
    id: "polish-spacing",
    ability: "edit",
    title: "Polish the spacing of a messy screen",
    lang: "en",
    fixture: "messy-en",
    selectScreen: "profile",
    request: "This screen looks messy — can you polish the spacing and alignment?",
    budget: MEDIUM,
    checks: [...basics(), evenSpacing({ screen: "profile" }), ...tidy({ screens: ["profile"] }), shows(["Maya Chen", "Product designer", "Follow", "Message", "Recent work", "Tram map redesign", "Bakery app"], { screens: ["profile"], label: "every word kept", critical: true })],
  },
  {
    id: "contacts-data",
    ability: "data",
    title: "Contacts from a collection, repeated rows, tap to a detail screen",
    lang: "en",
    fixture: "contacts-en",
    request: "Make the contacts list data-driven: a collection with 5 people (name, phone, city), one row repeated per person, and tapping a row opens a detail screen that shows that person's name, phone and city.",
    budget: MEDIUM,
    checks: [...basics(), collection({ rows: 5 }), repeat(), tapToDetail(), newScreen(), ...tidy(), keepsWork()],
  },
  {
    id: "dark-mode-switch",
    ability: "variables",
    title: "A dark-mode switch wired to a variable that drives dark",
    lang: "zh",
    fixture: "settings-zh",
    request: "加一个深色模式开关，打开就切换成深色。",
    budget: SMALL,
    checks: [...basics(), darkVar(), darkControl(), ...tidy(), keepsWork()],
  },
  {
    id: "stepper-vars",
    ability: "variables",
    title: "A quantity stepper: a number variable, a bound text, + and − taps",
    lang: "en",
    fixture: "cart-en",
    request: "Add a quantity stepper next to the price: a − button, the number and a + button. Make the number a variable that the buttons change.",
    budget: SMALL,
    checks: [...basics(), counter(), ...tidy(), keepsWork()],
  },
  {
    id: "prompt-box-component",
    ability: "components",
    title: "Build a Codex-style prompt box from atoms, save it as a component, place an instance",
    lang: "en",
    fixture: "chat-en",
    request: 'Build a Codex-style prompt box from atoms — a rounded panel with a multi-line input on top and a row underneath with an attach button, a model chip and a send button — save it as a reusable component called "Prompt box", and put an instance of it at the bottom of the Chat screen.',
    budget: MEDIUM,
    checks: [...basics(), component({ name: /prompt/i, needs: [["input", "textarea"], ["button", "icon-button"], ["chip", "badge", "button", "text"]] }), instances({ min: 1, screen: "chat" }), ...tidy({ screens: ["chat"] }), keepsWork()],
  },
  {
    id: "product-instances",
    ability: "components",
    title: "Use an existing component: three instances with their own words",
    lang: "zh",
    fixture: "shop-zh",
    request: "用商品卡片组件在商店页放三个商品：苹果 ¥3、梨 ¥4、李子 ¥5。",
    budget: SMALL,
    checks: [...basics(), instances({ min: 3, component: "product", screen: "shop", words: ["苹果", "梨", "李子"] }), ...tidy({ screens: ["shop"] }), keepsWork()],
  },
  {
    id: "edit-definition",
    ability: "components",
    title: "Change a component once so every placed card, and every card placed later, follows",
    lang: "zh",
    fixture: "shop-placed-zh",
    request: "商品卡片要改一下：价格改成红色并加粗，按钮文字改成“立即购买”。所有卡片都要一起变，以后新放的卡片也一样。",
    budget: SMALL,
    checks: [...basics(), definitionChanged(), boldPrice(), cardsStillInstances(), keepsWork()],
  },
  {
    id: "paper-style",
    ability: "styles",
    title: "Generate a warm paper-notebook style and wear it",
    lang: "zh",
    fixture: "notebook-zh",
    request: "生成一个暖色纸张笔记本风格并穿上。",
    budget: MEDIUM,
    checks: [...basics(), customStyle({ warm: true }), styleTexture(), keepsWork({ critical: true })],
  },
  {
    id: "svg-tab-icon",
    ability: "svg",
    title: "Write a route icon as SVG code and put it in the tab bar",
    lang: "en",
    fixture: "map-en",
    request: "Draw a custom route icon — a winding dotted path between two map pins — as SVG code (not the image model), and put it in the tab bar in place of the Routes tab's icon.",
    budget: { ...MEDIUM, drawings: 1 },
    checks: [...basics(), svgPlaced({ inside: inTabBar, label: "a sanitized SVG in the tab bar" }), shows(["Explore", "Saved", "Routes", "Profile"], { screens: ["map"], label: "the four tabs kept", critical: true }), ...tidy({ screens: ["map"] })],
  },
  {
    id: "replicate-weather",
    ability: "replicate",
    title: "Copy a weather screen from an attached screenshot",
    lang: "en",
    fixture: "blank-en",
    reference: "weather.png",
    request: "Copy this screenshot as a new screen — same layout, colors and text.",
    budget: LARGE,
    checks: [...basics(), shows(["Lisbon", "Mostly sunny", "21°", "Hourly forecast", "Today", "Sat", "Sun", "Mon"], { min: 6, label: "the screenshot's words" }), likeness({ min: 75 }), autoLayout(), ...tidy()],
  },
  {
    id: "game-hud",
    ability: "game",
    title: "A battle HUD in the four corners of a landscape game screen",
    lang: "en",
    fixture: "game-en",
    request: "Add the battle HUD to this screen: HP and mana bars top-left, a minimap top-right, a virtual joystick bottom-left and four skill buttons bottom-right.",
    budget: { ...MEDIUM, drawings: 1 },
    checks: [
      ...basics(),
      strictKept(),
      corners({
        screen: "battle",
        need: {
          tl: { min: 2, match: progressLike, what: "2 bars" },
          tr: { min: 1, match: anything, what: "a minimap" },
          bl: { min: 1, match: (p) => isA("joystick")(p) || /joy|stick|pad/i.test(p.node.name), what: "a joystick" },
          br: { min: 4, match: skillLike, what: "4 skills" },
        },
      }),
      inBounds({ screens: ["battle"] }),
      keepsWork(),
    ],
  },
  {
    id: "profile-ja",
    ability: "multilingual",
    title: "A profile screen asked for in Japanese",
    lang: "ja",
    fixture: "home-ja",
    request: "プロフィール画面を追加してください。アイコン、名前、自己紹介、フォローボタンがほしいです。",
    budget: MEDIUM,
    checks: [...basics(), newScreen(), has("avatar", "an avatar", avatar, { critical: true }), has("button", "a follow button", button, { critical: true }), language(), ...tidy(), keepsWork()],
  },
  {
    id: "cart-ko",
    ability: "multilingual",
    title: "A cart screen asked for in Korean",
    lang: "ko",
    fixture: "shop-ko",
    request: "장바구니 화면을 만들어 주세요. 상품 세 개, 합계 금액, 결제하기 버튼이 있으면 좋겠어요.",
    budget: MEDIUM,
    checks: [...basics(), newScreen(), shows([/결제/, /합계|총/], { label: "checkout and total", critical: true }), has("button", "a pay button", button, { critical: true }), language(), ...tidy(), keepsWork()],
  },
  {
    id: "vague-wipe",
    ability: "ambiguous",
    title: "“Delete it all and redo it”: ask first, keep the author's work",
    lang: "zh",
    fixture: "app-zh",
    request: "都不好看，全删了重做",
    budget: SMALL,
    checks: [finished(), undoOne({ orNothing: true }), inBudget(), keepsWork({ critical: true }), asks()],
  },

  /* harder tasks, added with the 2026-11-06 fixes (see baselines/2026-11-06-fixes/notes.md) */
  {
    id: "travel-app-flow",
    ability: "flow",
    title: "A three-screen app wired together: tab bar between two screens, a detail and back",
    lang: "en",
    fixture: "blank-en",
    request: "Build a small travel app: a Trips list, a Trip detail screen and a Saved screen. Trips and Saved share a bottom navigation bar that switches between them. Tapping a trip opens its detail, which has a back button in its top bar.",
    budget: LARGE,
    checks: [...basics(), navFlow({ minScreens: 3 }), newScreen({ min: 2 }), language(), autoLayout(), noOverlap(), inBounds()],
  },
  {
    id: "checkout-strict",
    ability: "new-screen",
    title: "A checkout form on a strict iOS document: fields, a choice, a switch, a summary, a pinned pay button",
    lang: "en",
    fixture: "ios-settings-en",
    request: "Add a Checkout screen in the current style: shipping fields for name, street, city and postal code, a choice between Standard and Express delivery, a “Save this address” switch, an order summary with three items and a total, and a Pay button pinned to the bottom.",
    budget: MEDIUM,
    checks: [
      ...basics(),
      strictKept(),
      newScreen({ name: /checkout/i }),
      has("fields", "four shipping fields", field, { min: 4, critical: true }),
      has("switch", "a save-address switch", isA("switch", "toggle"), { critical: true }),
      shows(["Standard", "Express", "Total", "Pay"], { label: "the delivery choice, the total and the pay button", critical: true }),
      atFoot("pay-pinned", "the pay button at the foot", (p) => button(p) && /pay/i.test(p.node.name)),
      language(),
      autoLayout(),
      ...tidy(),
      keepsWork(),
    ],
  },
  {
    id: "long-feed",
    ability: "long-screen",
    title: "A long scrolling feed: stories, eight posts, bars pinned",
    lang: "en",
    fixture: "feed-en",
    request: "Fill the Feed screen with a long scrolling feed: a row of six story avatars under the top bar, then eight posts, each with the author's avatar and name, a time, two lines of text and Like and Comment buttons. The top bar and the bottom navigation stay pinned while the feed scrolls.",
    budget: LARGE,
    checks: [
      ...basics(),
      scrolls({ screen: "feed" }),
      countShowing("posts", "eight posts with Like", /^like$/i, { screen: "feed", min: 8, critical: true }),
      has("stories", "story avatars and post avatars", avatar, { min: 12, screens: ["feed"] }),
      barsPinned({ screen: "feed" }),
      noOverlap({ screens: ["feed"] }),
      inBounds({ screens: ["feed"] }),
    ],
  },
];

/* the product layer (contract, bindings, mocks), added with the product-layer AI work (see productTasks.ts) */
TASKS.push(...PRODUCT_TASKS);

export const taskById = (id: string) => TASKS.find((t) => t.id === id);

/* ---------- edit-definition: the change is made on the component, not on each card ---------- */

type Def = NonNullable<Doc["components"]>[number];
const productDef = (doc: Doc): Def | undefined => doc.components?.find((c) => c.id === "product");
const defItems = (d: Def | undefined) => (d?.groups ?? []).flatMap((g) => g.items);
/** red as the canvas can say it: the error role, or a hex colour whose red clearly leads */
function isRed(v: unknown): boolean {
  if (typeof v !== "string") return false;
  if (/^(error|on-error-container|red)$/i.test(v)) return true;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(v);
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return r >= 0xb0 && g <= 0x70 && b <= 0x70;
}
const redText = (it: Item) => isRed(it.props?.color) || isRed(it.textColor) || isRed((it.look as { text?: { color?: string } } | undefined)?.text?.color);
const pricePart = (d: Def | undefined) => defItems(d).find((it) => it.id === "card-price") ?? defItems(d).find((it) => it.component === "text" && /¥/.test(String(it.props?.text ?? "")));

function definitionChanged(): Check {
  return custom(
    "definition",
    "the component itself changed: button says 立即购买, price red",
    (g) => {
      const d = productDef(g.doc);
      const button = defItems(d).find((it) => it.component === "button" || it.component === "icon-button");
      const price = pricePart(d);
      const label = String(button?.props?.label ?? "");
      const red = !!price && redText(price);
      return { pass: !!d && label.includes("立即购买") && red, detail: `${d ? "" : "no product component; "}button ${JSON.stringify(label)}, price ${price ? (red ? "red" : `not red (${JSON.stringify(price.props?.color ?? price.textColor ?? null)})`) : "missing"}` };
    },
    { critical: true, weight: 2 },
  );
}

function boldPrice(): Check {
  return custom("bold", "the price is bold in the component", (g) => {
    const price = pricePart(productDef(g.doc));
    const bold = !!price && (price.props?.bold === true || /title|headline|display/.test(String(price.props?.style ?? "")) || Number((price.look as { text?: { weight?: number } } | undefined)?.text?.weight ?? 0) >= 600);
    return { pass: bold, detail: price ? `bold ${String(price.props?.bold ?? false)}, style ${String(price.props?.style ?? "body")}` : "price missing" };
  });
}

function cardsStillInstances(): Check {
  return custom(
    "instances-kept",
    "the three cards are still instances with their own fruit and price, and carry no copy of the change",
    (g) => {
      const cards = g.doc.groups.filter((x) => x.instanceOf === "product");
      const said = cards.flatMap((x) => Object.values(x.overrides ?? {}).map(String)).join("\n");
      const words = ["苹果", "梨", "李子", "¥3", "¥4", "¥5"].filter((w) => !said.includes(w));
      /* the change written into each card instead of the component would look the same and leave later cards behind */
      const copied = cards.filter((x) => Object.entries(x.overrides ?? {}).some(([k, v]) => (k.endsWith("/label") && String(v).includes("立即购买")) || (k.endsWith("/color") && isRed(v))));
      return { pass: cards.length >= 3 && !words.length && !copied.length, detail: `${cards.length} instances${words.length ? `, missing ${words.join(" ")}` : ""}${copied.length ? `, ${copied.length} carry the change as overrides` : ""}` };
    },
    { critical: true },
  );
}
