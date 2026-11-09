import { col, go, part, row, say, screen, txt, type Node, type Say, type ScreenSeed, type Template } from "./kit";
import { atomsOf } from "./atoms";
import { AUTH_WORDS } from "./words";

/* Getting into an app. Each builder takes the links a flow gives it; on its own a screen has none, so that adding one
 * screen never leaves a link to a screen that is not there. What comes after signing in is the app's own business, so
 * no screen here decides what its home looks like. */

type Link = ReturnType<typeof go>;
type Links = Partial<Record<"submit" | "switch" | "forgot", Link>>;

/** the sign-in or sign-up form, in atoms: its entries keep what is typed, its buttons go where the flow says */
const authForm = (mode: "sign-in" | "sign-up", links: Links): Node => atomsOf("auth-form", { mode, ...AUTH_WORDS }, { actions: links });
/** where the app's mark goes, above the form */
const mark = (): Node => row({ justify: "center" }, [part("shape", { name: "sunny", color: "primary", width: 72, height: 72 })]);
const backBar = (title: Say, link?: Link): Node => part("app-bar", { title, leading: "arrow_back", trailing: "" }, { actions: { icon: link } });

export const splashScreen = (link?: Link): ScreenSeed =>
  screen({
    id: "splash",
    name: say("Splash", "启动页", "スプラッシュ", "스플래시"),
    place: "center",
    body: [
      mark(),
      txt(say("App name", "应用名称", "アプリ名", "앱 이름"), "headline", { align: "center" }),
      txt(say("One line on what it does", "一句话介绍这个应用", "何ができるかを一文で", "무엇을 하는 앱인지 한 줄로"), "body", { align: "center", color: "on-surface-variant" }),
      row({ justify: "center" }, [part("spinner", { size: "md" }, { action: link })]),
    ],
  });

export const loginScreen = (links: Links = {}): ScreenSeed =>
  screen({
    id: "login",
    name: say("Log in", "登录", "ログイン", "로그인"),
    place: "center",
    body: [mark(), authForm("sign-in", links)],
  });

export const signUpScreen = (links: Links = {}): ScreenSeed =>
  screen({
    id: "signup",
    name: say("Sign up", "注册", "新規登録", "회원가입"),
    place: "center",
    body: [
      mark(),
      /* in one layout: the form comes out taller in some styles, and the line stays under it */
      col({ gap: 12 }, [
        authForm("sign-up", links),
        txt(say("By signing up you agree to the terms and the privacy policy.", "注册即表示你同意用户协议和隐私政策。", "登録すると利用規約とプライバシーポリシーに同意したことになります。", "가입하면 이용약관과 개인정보 처리방침에 동의하게 됩니다."), "caption", { align: "center", color: "on-surface-variant" }),
      ]),
    ],
  });

export const phoneLoginScreen = (): ScreenSeed =>
  screen({
    id: "phone-login",
    name: say("Phone sign-in", "手机号登录", "電話番号でログイン", "전화번호 로그인"),
    place: "center",
    body: [
      mark(),
      txt(say("Sign in with your phone", "手机号登录", "電話番号でログイン", "전화번호로 로그인"), "headline", { align: "center" }),
      part("phone-input", { code: say("+1", "+86", "+81", "+82"), placeholder: say("Phone number", "手机号", "電話番号", "전화번호") }),
      part("input-group", { placeholder: say("Code", "验证码", "確認コード", "인증번호"), leadingIcon: "", leadingText: "", trailingText: "", button: say("Get code", "获取验证码", "コードを取得", "인증번호 받기") }),
      /* nobody has agreed to anything before they tick it */
      part("checkbox", { checked: false, label: say("I agree to the terms and the privacy policy", "我已阅读并同意用户协议和隐私政策", "利用規約とプライバシーポリシーに同意します", "이용약관과 개인정보 처리방침에 동의합니다") }),
      part("button", { label: say("Sign in", "登录", "ログイン", "로그인"), size: "md" }),
      part("button", { label: say("Use email instead", "使用邮箱登录", "メールアドレスでログイン", "이메일로 로그인"), variant: "text" }),
    ],
  });

export const forgotScreen = (links: { send?: Link; back?: Link } = {}): ScreenSeed =>
  screen({
    id: "forgot",
    name: say("Forgot password", "忘记密码", "パスワードを忘れた", "비밀번호 찾기"),
    top: [backBar(say("Forgot password", "忘记密码", "パスワードを忘れた", "비밀번호 찾기"), links.back)],
    body: [
      txt(say("Enter your email and we will send you a code.", "输入注册时的邮箱，我们会发送验证码。", "登録したメールアドレスに確認コードを送ります。", "가입한 이메일로 인증번호를 보내 드립니다."), "body", { color: "on-surface-variant" }),
      part("text-field", { label: say("Email", "邮箱", "メールアドレス", "이메일"), value: "", helperText: "" }),
      part("button", { label: say("Send code", "发送验证码", "コードを送信", "인증번호 보내기"), size: "md" }, { action: links.send }),
    ],
  });

export const verifyScreen = (links: { verify?: Link; back?: Link } = {}): ScreenSeed =>
  screen({
    id: "verify",
    name: say("Verification code", "验证码", "確認コード", "인증번호"),
    top: [backBar(say("Enter the code", "输入验证码", "コードを入力", "인증번호 입력"), links.back)],
    body: [
      txt(say("We sent a 6-digit code to your email.", "6 位验证码已发送到你的邮箱。", "6 桁のコードをメールに送りました。", "6자리 인증번호를 이메일로 보냈습니다."), "body", { color: "on-surface-variant" }),
      row({ justify: "center" }, [part("input-otp", { length: 6, group: 3, value: "" })]),
      part("button", { label: say("Verify", "验证", "確認", "확인"), size: "md" }, { action: links.verify }),
      part("button", { label: say("Send again", "重新发送", "再送信", "다시 보내기"), variant: "text" }),
    ],
  });

export const resetScreen = (links: { done?: Link; back?: Link } = {}): ScreenSeed =>
  screen({
    id: "reset",
    name: say("New password", "设置新密码", "新しいパスワード", "새 비밀번호"),
    top: [backBar(say("New password", "设置新密码", "新しいパスワード", "새 비밀번호"), links.back)],
    body: [
      part("text-field", { label: say("New password", "新密码", "新しいパスワード", "새 비밀번호"), value: "", helperText: say("At least 8 characters", "至少 8 位", "8 文字以上", "8자 이상"), trailingIcon: "visibility" }),
      part("text-field", { label: say("Confirm password", "确认新密码", "パスワード（確認）", "비밀번호 확인"), value: "", helperText: "", trailingIcon: "visibility" }),
      part("button", { label: say("Save and sign in", "保存并登录", "保存してログイン", "저장하고 로그인"), size: "md" }, { action: links.done }),
    ],
  });

export const onboardingScreen = (links: { done?: Link; skip?: Link } = {}): ScreenSeed =>
  screen({
    id: "onboarding",
    name: say("Onboarding", "引导", "はじめに", "시작하기"),
    body: [
      part(
        "onboarding",
        {
          data: {
            columns: ["Icon", "Title", "Text"],
            rows: [
              ["explore", say("Find what you need", "找到你需要的", "必要なものがすぐ見つかる", "필요한 것을 찾으세요"), say("Everything in one place, a tap away.", "所有内容集中在一处，轻点即达。", "すべてが一か所に。タップするだけです。", "모든 것이 한곳에, 탭 한 번이면 됩니다.")],
              ["bolt", say("Get it done faster", "更快完成", "もっと速く終わらせる", "더 빠르게 끝내세요"), say("Shortcuts that learn how you work.", "快捷方式会记住你的习惯。", "使い方を覚えるショートカット。", "사용 방식을 익히는 바로가기.")],
              ["verified_user", say("Stay in control", "一切由你掌控", "主導権はあなたに", "직접 관리하세요"), say("Your data stays yours. Always.", "你的数据始终属于你。", "データはいつでもあなたのものです。", "데이터는 언제나 당신의 것입니다.")],
            ],
          },
          skip: say("Skip", "跳过", "スキップ", "건너뛰기"),
          next: say("Next", "下一步", "次へ", "다음"),
          done: say("Get started", "开始使用", "はじめる", "시작하기"),
        },
        { fill: true, actions: links },
      ),
    ],
  });

export const auth: Template[] = [
  { slug: "splash", name: "Splash", labels: { ja: "スプラッシュ", zh: "启动页", ko: "스플래시" }, category: "auth", frame: "phone", icon: "rocket_launch", build: () => [splashScreen()] },
  { slug: "onboarding", name: "Onboarding", labels: { ja: "はじめに", zh: "引导页", ko: "온보딩" }, category: "auth", frame: "phone", icon: "tour", build: () => [onboardingScreen()] },
  { slug: "login", name: "Log in", labels: { ja: "ログイン", zh: "登录", ko: "로그인" }, category: "auth", frame: "phone", icon: "login", build: () => [loginScreen()] },
  { slug: "sign-up", name: "Sign up", labels: { ja: "新規登録", zh: "注册", ko: "회원가입" }, category: "auth", frame: "phone", icon: "person_add", build: () => [signUpScreen()] },
  { slug: "phone-login", name: "Phone sign-in", labels: { ja: "電話番号ログイン", zh: "手机号登录", ko: "전화번호 로그인" }, category: "auth", frame: "phone", icon: "smartphone", build: () => [phoneLoginScreen()] },
  { slug: "forgot-password", name: "Forgot password", labels: { ja: "パスワード再設定", zh: "忘记密码", ko: "비밀번호 찾기" }, category: "auth", frame: "phone", icon: "lock_reset", build: () => [forgotScreen()] },
  { slug: "verify-code", name: "Verification code", labels: { ja: "確認コード", zh: "验证码", ko: "인증번호" }, category: "auth", frame: "phone", icon: "pin", build: () => [verifyScreen()] },
  { slug: "reset-password", name: "New password", labels: { ja: "新しいパスワード", zh: "设置新密码", ko: "새 비밀번호" }, category: "auth", frame: "phone", icon: "password", build: () => [resetScreen()] },
];
