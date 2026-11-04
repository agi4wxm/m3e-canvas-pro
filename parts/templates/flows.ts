import { back, go, type Template } from "./kit";
import { homeFeedScreen, loginScreen, signUpScreen } from "./auth";
import { cartScreen, checkoutScreen, orderSuccessScreen, productDetailScreen, productListScreen } from "./shop";

/* Sets of screens added together, their links already in place. */

export const flows: Template[] = [
  {
    slug: "auth-flow",
    name: "Auth flow",
    labels: { ja: "ログインの流れ", zh: "登录流程", ko: "로그인 흐름" },
    category: "flow",
    frame: "phone",
    icon: "login",
    build: () => [loginScreen({ submit: go("home", "fade"), switch: go("signup") }), signUpScreen({ submit: go("home", "fade"), switch: back() }), homeFeedScreen()],
  },
  {
    slug: "shop-flow",
    name: "Shop flow",
    labels: { ja: "購入の流れ", zh: "购物流程", ko: "구매 흐름" },
    category: "flow",
    frame: "phone",
    icon: "shopping_bag",
    build: () => [productListScreen(go("product")), productDetailScreen({ cart: go("cart"), back: back() }), cartScreen({ checkout: go("checkout"), back: back() }), checkoutScreen({ place: go("success"), back: back() }), orderSuccessScreen({ more: go("products", "fade") })],
  },
];
