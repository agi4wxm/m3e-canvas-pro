import { atom, button, hbox, para, text, vbox } from "../atoms";
import { say, type Node } from "../templates/kit";
import { isWide, type KitDef } from "./types";

/* A sign-in form as atoms: a heading, fields that take the column's width, the main action as wide
 * as they are, and the way to the other form. On desktop software it stands on a card. */

const T = {
  title: say("Welcome back", "欢迎回来", "おかえりなさい", "다시 오신 것을 환영합니다"),
  sub: say("Sign in to pick up where you left off.", "登录后继续上次的进度。", "サインインして続きから始めましょう。", "로그인하고 이어서 하세요."),
  email: say("Email", "邮箱", "メールアドレス", "이메일"),
  password: say("Password", "密码", "パスワード", "비밀번호"),
  phone: say("Phone number", "手机号", "電話番号", "전화번호"),
  code: say("Verification code", "验证码", "確認コード", "인증 코드"),
  send: say("Get code", "获取验证码", "コードを送信", "코드 받기"),
  forgot: say("Forgot password?", "忘记密码？", "パスワードをお忘れですか？", "비밀번호를 잊으셨나요?"),
  signIn: say("Sign in", "登录", "サインイン", "로그인"),
  none: say("No account yet?", "还没有账号？", "アカウントをお持ちでないですか？", "아직 계정이 없나요?"),
  signUp: say("Sign up", "注册", "新規登録", "가입하기"),
};

const field = (placeholder: ReturnType<typeof say>, more: Record<string, unknown> = {}): Node => atom("input", { placeholder, variant: "outlined", ...more });

const head = (): Node[] => [text(T.title, "headline", { bold: true }), para(T.sub, "body", { color: "muted" })];
const foot = (): Node => hbox({ justify: "center", gap: 4 }, [text(T.none, "body", { color: "muted" }), button(T.signUp, { variant: "text", size: "xs" })]);

const emailForm = (): Node[] => [
  ...head(),
  vbox({ gap: 12, padY: 8 }, [field(T.email, { type: "email" }), field(T.password, { type: "password" })]),
  hbox({ justify: "end" }, [button(T.forgot, { variant: "text", size: "xs" })]),
  button(T.signIn, { variant: "filled", size: "md" }),
  foot(),
];

const login: KitDef = {
  slug: "login-form",
  name: "Login form",
  labels: { zh: "登录表单", ja: "サインインフォーム", ko: "로그인 양식" },
  category: "Forms",
  icon: "login",
  about: "a column box: a heading and a line, email and password inputs as wide as the column, a forgot-password link, a wide sign-in button and a sign-up link",
  variants: [
    {
      key: "email",
      name: "Email and password",
      labels: { zh: "邮箱和密码", ja: "メールとパスワード", ko: "이메일과 비밀번호" },
      suits: (l) => !isWide(l),
      build: () => vbox({ width: 380, hugWidth: false, padX: 0, padY: 0, gap: 12 }, emailForm(), { name: say("Sign-in form", "登录表单", "サインインフォーム", "로그인 양식") }),
    },
    {
      key: "card",
      name: "On a card",
      labels: { zh: "卡片上", ja: "カードの上", ko: "카드 위" },
      suits: isWide,
      build: () => vbox({ surface: "card", width: 400, hugWidth: false, padX: 32, padY: 32, gap: 12 }, emailForm(), { name: say("Sign-in form", "登录表单", "サインインフォーム", "로그인 양식") }),
    },
    {
      key: "phone",
      name: "Phone and code",
      labels: { zh: "手机号和验证码", ja: "電話番号とコード", ko: "전화번호와 코드" },
      build: () =>
        vbox(
          { width: 380, hugWidth: false, padX: 0, padY: 0, gap: 12 },
          [
            ...head(),
            vbox({ gap: 12, padY: 8 }, [field(T.phone, { type: "tel" }), hbox({ gap: 8, align: "center" }, [field(T.code, { type: "number" }, ), button(T.send, { variant: "tonal", size: "md" })].map((n, i) => (i === 0 ? { ...n, grow: true } : n)))]),
            button(T.signIn, { variant: "filled", size: "md" }),
            foot(),
          ],
          { name: say("Sign-in form", "登录表单", "サインインフォーム", "로그인 양식") },
        ),
    },
  ],
};

export const formKits: KitDef[] = [login];
