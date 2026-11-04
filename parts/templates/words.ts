import { part, say, type Node, type Say } from "./kit";

/* What several templates say the same way: the people in the sample data, the main destinations, the
 * words on a sign-in form. A bar has the same entries on every screen of a set. */

export const PEOPLE = {
  ada: say("Ada Lovelace", "林小雨", "佐藤 葵", "김하늘"),
  grace: say("Grace Hopper", "陈思远", "鈴木 蓮", "이서준"),
  alan: say("Alan Turing", "王浩然", "高橋 陽", "박지민"),
  katherine: say("Katherine Johnson", "赵一诺", "田中 結衣", "최유나"),
  marie: say("Marie Curie", "周子涵", "伊藤 凛", "정민서"),
};

export const WORDS = {
  home: say("Home", "首页", "ホーム", "홈"),
  search: say("Search", "搜索", "検索", "검색"),
  shop: say("Shop", "商店", "ショップ", "쇼핑"),
  cart: say("Cart", "购物车", "カート", "장바구니"),
  chats: say("Chats", "聊天", "チャット", "채팅"),
  alerts: say("Alerts", "通知", "通知", "알림"),
  profile: say("Profile", "我的", "プロフィール", "프로필"),
  wallet: say("Wallet", "钱包", "ウォレット", "지갑"),
  today: say("Today", "今天", "今日", "오늘"),
  yesterday: say("Yesterday", "昨天", "昨日", "어제"),
};

/** the destinations of a consumer app, the entry its screen belongs to chosen */
export const homeNav = (selected: number, extra: Parameters<typeof part>[2] = {}): Node =>
  part(
    "navigation-bar",
    {
      items: [
        { label: WORDS.home, icon: "home" },
        { label: WORDS.search, icon: "search" },
        { label: WORDS.chats, icon: "chat" },
        { label: WORDS.profile, icon: "person" },
      ],
      selected,
    },
    extra,
  );

export const shopNav = (selected: number, extra: Parameters<typeof part>[2] = {}): Node =>
  part(
    "navigation-bar",
    {
      items: [
        { label: WORDS.home, icon: "home" },
        { label: WORDS.shop, icon: "storefront" },
        { label: WORDS.cart, icon: "shopping_cart" },
        { label: WORDS.profile, icon: "person" },
      ],
      selected,
    },
    extra,
  );

/** every word a sign-in form shows, so none of them stays in the part's English */
export const AUTH_WORDS: Record<string, Say | { label: Say }[]> = {
  title: say("Welcome back", "欢迎回来", "おかえりなさい", "다시 오신 것을 환영합니다"),
  subtitle: say("Sign in to continue.", "登录后继续。", "続けるにはログインしてください。", "계속하려면 로그인하세요."),
  upTitle: say("Create your account", "创建账号", "アカウントを作成", "계정 만들기"),
  nameLabel: say("Name", "姓名", "名前", "이름"),
  emailLabel: say("Email", "邮箱", "メールアドレス", "이메일"),
  passwordLabel: say("Password", "密码", "パスワード", "비밀번호"),
  confirmLabel: say("Confirm password", "确认密码", "パスワード（確認）", "비밀번호 확인"),
  remember: say("Remember me", "记住我", "ログインを保持", "로그인 유지"),
  forgot: say("Forgot password?", "忘记密码？", "パスワードをお忘れですか？", "비밀번호를 잊으셨나요?"),
  action: say("Sign in", "登录", "ログイン", "로그인"),
  upAction: say("Sign up", "注册", "登録する", "가입하기"),
  toUp: say("New here? Create an account", "没有账号？去注册", "はじめての方はこちら", "계정이 없나요? 가입하기"),
  toIn: say("Have an account? Sign in", "已有账号？去登录", "アカウントをお持ちの方はこちら", "계정이 있나요? 로그인"),
  others: [{ label: say("Continue with phone", "使用手机号继续", "電話番号で続ける", "전화번호로 계속하기") }],
  badEmail: say("Enter a valid email address", "请输入有效的邮箱", "正しいメールアドレスを入力してください", "올바른 이메일을 입력하세요"),
  badPassword: say("Password is too short", "密码太短", "パスワードが短すぎます", "비밀번호가 너무 짧습니다"),
  badConfirm: say("Passwords do not match", "两次密码不一致", "パスワードが一致しません", "비밀번호가 일치하지 않습니다"),
  success: say("All set", "验证通过", "確認できました", "확인되었습니다"),
};
