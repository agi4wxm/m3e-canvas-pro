import { back, go, type Template } from "./kit";
import { forgotScreen, loginScreen, onboardingScreen, resetScreen, signUpScreen, splashScreen, verifyScreen } from "./auth";
import { battleHudScreen, levelSelectScreen, lobbyScreen, titleScreen, victoryScreen } from "./game";
import { cartScreen, checkoutScreen, orderSuccessScreen, paymentContract, placeOrder, productDetailScreen, productListScreen } from "./shop";

/* Sets of screens added together, their links already in place. A flow holds what belongs to it and nothing else:
 * where the app goes after it is the app's own business. */

export const flows: Template[] = [
  {
    slug: "auth-flow",
    name: "Sign-in flow",
    labels: { ja: "ログインの流れ", zh: "登录流程", ko: "로그인 흐름" },
    category: "flow",
    frame: "phone",
    icon: "login",
    build: () => [loginScreen({ switch: go("signup"), forgot: go("forgot") }), signUpScreen({ switch: back() }), forgotScreen({ send: go("verify"), back: back() }), verifyScreen({ verify: go("reset"), back: back() }), resetScreen({ done: go("login", "fade"), back: back() })],
  },
  {
    slug: "start-flow",
    name: "First launch flow",
    labels: { ja: "初回起動の流れ", zh: "首次启动流程", ko: "첫 실행 흐름" },
    category: "flow",
    frame: "phone",
    icon: "rocket_launch",
    build: () => [splashScreen(go("onboarding", "fade")), onboardingScreen({ done: go("login", "fade"), skip: go("login", "fade") }), loginScreen()],
  },
  {
    slug: "shop-flow",
    name: "Shop flow",
    labels: { ja: "購入の流れ", zh: "购物流程", ko: "구매 흐름" },
    category: "flow",
    frame: "phone",
    icon: "shopping_bag",
    /* placing the order is the payment flow: the order from the back end, the payment sheet, the order's status */
    build: () => [productListScreen(go("product")), productDetailScreen({ cart: go("cart"), back: back() }), cartScreen({ checkout: go("checkout"), back: back() }), checkoutScreen({ place: placeOrder("success"), back: back() }), orderSuccessScreen({ more: go("products", "fade") })],
    contract: paymentContract,
  },
  {
    slug: "game-flow",
    name: "Game flow",
    labels: { ja: "ゲームの流れ", zh: "游戏主流程", ko: "게임 흐름" },
    category: "flow",
    frame: "phone",
    icon: "sports_esports",
    build: () => [titleScreen({ start: go("lobby", "fade") }), lobbyScreen({ play: go("levels") }), levelSelectScreen({ start: go("battle", "fade"), back: back() }), battleHudScreen({ end: go("victory", "fade") }), victoryScreen({ next: go("levels", "fade") })],
  },
];
