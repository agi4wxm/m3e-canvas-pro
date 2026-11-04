import { go, part, row, say, screen, type Node, type Say, type ScreenSeed, type Template } from "./kit";
import { AUTH_WORDS, homeNav, PEOPLE, WORDS } from "./words";

/* Getting in, and the first screen after it. Each builder takes the links a flow gives it; on its own a
 * screen has none, so that adding one screen never leaves a link to a screen that is not there. */

type Links = Partial<Record<"submit" | "switch" | "forgot", ReturnType<typeof go>>>;

const authForm = (mode: "sign-in" | "sign-up", links: Links): Node => part("auth-form", { mode, ...AUTH_WORDS }, { actions: links });
/** where the app's mark goes, above the form */
const mark = (): Node => row({ justify: "center" }, [part("shape", { name: "sunny", color: "primary", width: 72, height: 72 })]);

export const loginScreen = (links: Links = {}): ScreenSeed =>
  screen({
    id: "login",
    name: say("Log in", "登录", "ログイン", "로그인"),
    bodyProps: { justify: "center", padY: 48, gap: 24 },
    body: [mark(), authForm("sign-in", links)],
  });

export const signUpScreen = (links: Links = {}): ScreenSeed =>
  screen({
    id: "signup",
    name: say("Sign up", "注册", "新規登録", "회원가입"),
    bodyProps: { justify: "center", padY: 48, gap: 24 },
    body: [mark(), authForm("sign-up", links)],
  });

const POST = (author: Say, time: Say, text: Say, showImage: boolean, likes: number): Node => part("post-card", { author, time, text, showImage, likes, comments: Math.round(likes / 6), shares: Math.round(likes / 20) });

export const homeFeedScreen = (): ScreenSeed =>
  screen({
    id: "home",
    name: WORDS.home,
    /* a feed runs on: its body scrolls between the bars in the preview */
    length: 1116,
    top: [part("app-bar", { title: say("For you", "推荐", "おすすめ", "추천"), leading: "menu", trailing: "notifications" })],
    bottom: [homeNav(0)],
    bodyProps: { gap: 12, padY: 8 },
    body: [
      part("story-row", {
        items: [
          { label: say("Your story", "我的故事", "あなた", "내 스토리") },
          { label: say("Ada", "小雨", "葵", "하늘") },
          { label: say("Grace", "思远", "蓮", "서준") },
          { label: say("Alan", "浩然", "陽", "지민") },
          { label: say("Kate", "一诺", "結衣", "유나") },
          { label: say("Marie", "子涵", "凛", "민서") },
        ],
      }),
      POST(PEOPLE.ada, say("2 hours ago", "2 小时前", "2 時間前", "2시간 전"), say("Morning light over the harbour.", "清晨的海港。", "朝の光に包まれた港。", "아침 햇살이 비치는 항구."), true, 128),
      POST(PEOPLE.grace, say("5 hours ago", "5 小时前", "5 時間前", "5시간 전"), say("Finished the first draft. Tell me what to cut.", "初稿写完了，看看哪里该删。", "初稿が書けました。削るべき所を教えてください。", "초고를 끝냈어요. 뺄 부분을 알려 주세요."), false, 42),
      POST(PEOPLE.alan, WORDS.yesterday, say("The new bridge opened today.", "新桥今天通车了。", "新しい橋が今日開通しました。", "새 다리가 오늘 개통했어요."), true, 310),
    ],
  });

export const onboardingScreen = (links: { done?: ReturnType<typeof go>; skip?: ReturnType<typeof go> } = {}): ScreenSeed =>
  screen({
    id: "onboarding",
    name: say("Onboarding", "引导", "はじめに", "시작하기"),
    bodyProps: { padY: 48 },
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
  { slug: "login", name: "Log in", labels: { ja: "ログイン", zh: "登录", ko: "로그인" }, category: "auth", frame: "phone", icon: "login", build: () => [loginScreen()] },
  { slug: "sign-up", name: "Sign up", labels: { ja: "新規登録", zh: "注册", ko: "회원가입" }, category: "auth", frame: "phone", icon: "person_add", build: () => [signUpScreen()] },
  { slug: "onboarding", name: "Onboarding", labels: { ja: "はじめに", zh: "引导页", ko: "온보딩" }, category: "auth", frame: "phone", icon: "tour", build: () => [onboardingScreen()] },
];
