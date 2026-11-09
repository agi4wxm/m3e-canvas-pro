/* Editor words for the preview's choice of what answers it (docs/玩法契约.md “本地 game-loop”, docs/模拟库.md): the
 * mock library or a local game loop at an address, and how the game loop is (answering, or what is wrong). Spread into
 * `UI` and `KO` in lib/i18n.ts; each entry has ja, en and zh, and Korean is in `GAME_LOOP_KO` below with exactly the
 * same keys. `{url}`, `{origin}`, `{namespace}`, `{version}`, `{got}`, `{want}`, `{path}` are filled in. */

type Str = { ja: string; en: string; zh: string };

export const GAME_LOOP_UI = {
  glAnsweredBy: { ja: "応答するもの", en: "Answered by", zh: "由谁回答" },
  glMocks: { ja: "モックライブラリ", en: "Mock library", zh: "模拟库" },
  glLoop: { ja: "ローカルの game-loop", en: "Local game loop", zh: "本地 game-loop" },
  glLoopShort: { ja: "game-loop", en: "Game loop", zh: "game-loop" },
  glAddress: { ja: "game-loop のアドレス", en: "Game loop address", zh: "game-loop 地址" },
  glConnect: { ja: "接続", en: "Connect", zh: "连接" },
  glRetry: { ja: "もう一度", en: "Try again", zh: "重试" },
  glUseMocks: { ja: "モックに戻す", en: "Back to mocks", zh: "切回模拟库" },
  glHint: { ja: "API の呼び出し、リアルタイムチャネル、ワールドが game-loop に届きます。モックのシナリオと時計は使いません", en: "Calls, realtime channels and the world go to the game loop; the mocks' scenarios and clock are set aside", zh: "接口调用、实时通道和世界都发给 game-loop；模拟库的场景和时钟不再使用" },
  glChecking: { ja: "{url} に接続しています…", en: "Connecting to {url}…", zh: "正在连接 {url}…" },
  glOk: { ja: "{url} の game-loop：契約 {namespace} {version}", en: "Game loop at {url}: contract {namespace} {version}", zh: "{url} 的 game-loop：契约 {namespace} {version}" },
  glUnreachable: { ja: "{url} から応答がありません。game-loop は起動していますか", en: "Nothing answers at {url}: is the game loop running?", zh: "{url} 没有回应：game-loop 启动了吗？" },
  glCors: { ja: "{url} の game-loop がこのページからの読み取りを許可していません（CORS）。オリジン {origin} を許可してください", en: "The game loop at {url} does not let this page read it (CORS): allow the origin {origin}", zh: "{url} 的 game-loop 不允许这个页面读取（CORS）：请允许来源 {origin}" },
  glNotLoop: { ja: "{url} で応答しているのは game-loop ではありません（{path} がない）", en: "What answers at {url} is no game loop (it has no {path})", zh: "{url} 回应的不是 game-loop（没有 {path}）" },
  glVersion: { ja: "game-loop の契約は {got}、デザインは {want} に合わせています。契約を読み込み直すか、合う game-loop を起動してください", en: "The game loop plays contract {got}, the design is made for {want}: import its contract again, or start the game loop that matches", zh: "game-loop 的契约是 {got}，设计按 {want} 做：重新导入它的契约，或者启动对应版本的 game-loop" },
  glNamespace: { ja: "game-loop の契約は {got} で、{want} ではありません", en: "The game loop plays the contract {got}, not {want}", zh: "game-loop 的契约是 {got}，不是 {want}" },
  glShortChecking: { ja: "接続中…", en: "Connecting…", zh: "连接中…" },
  glShortUnreachable: { ja: "応答なし", en: "Unreachable", zh: "连不上" },
  glShortCors: { ja: "CORS で拒否", en: "CORS refused", zh: "CORS 拒绝" },
  glShortNotLoop: { ja: "game-loop ではない", en: "Not a game loop", zh: "不是 game-loop" },
  glShortVersion: { ja: "バージョン違い", en: "Wrong version", zh: "版本不对" },
  glShortNamespace: { ja: "別の契約", en: "Other contract", zh: "别的契约" },
  glUrlEmpty: { ja: "アドレスを入力してください：http://localhost:8787", en: "Enter an address: http://localhost:8787", zh: "请输入地址：http://localhost:8787" },
  glUrlInvalid: { ja: "アドレスとして読めません", en: "That is not an address", zh: "这不是一个地址" },
  glUrlScheme: { ja: "http か https のアドレスにしてください", en: "Use an http or https address", zh: "请使用 http 或 https 地址" },
  glUrlSecret: { ja: "ユーザー名、パスワード、クエリ、フラグメントは入れません。アドレスは文書に保存され、秘密は保存されません", en: "No user, password, query or fragment: the address is kept in the document, and secrets never are", zh: "不能带用户名、密码、查询参数或片段：地址会保存在文档里，密钥从不保存" },
} as const satisfies Record<string, Str>;

export const GAME_LOOP_KO: Record<keyof typeof GAME_LOOP_UI, string> = {
  glAnsweredBy: "응답하는 곳",
  glMocks: "모의 라이브러리",
  glLoop: "로컬 game-loop",
  glLoopShort: "game-loop",
  glAddress: "game-loop 주소",
  glConnect: "연결",
  glRetry: "다시 시도",
  glUseMocks: "모의로 돌아가기",
  glHint: "API 호출, 실시간 채널, 월드가 game-loop로 갑니다. 모의 시나리오와 시계는 쓰지 않습니다",
  glChecking: "{url}에 연결하는 중…",
  glOk: "{url}의 game-loop: 계약 {namespace} {version}",
  glUnreachable: "{url}에서 응답이 없습니다. game-loop가 실행 중인가요?",
  glCors: "{url}의 game-loop가 이 페이지의 읽기를 허용하지 않습니다(CORS). 출처 {origin}을(를) 허용하세요",
  glNotLoop: "{url}에서 응답하는 것은 game-loop가 아닙니다({path} 없음)",
  glVersion: "game-loop의 계약은 {got}, 디자인은 {want} 기준입니다. 계약을 다시 가져오거나 맞는 game-loop를 실행하세요",
  glNamespace: "game-loop의 계약은 {got}이며 {want}이(가) 아닙니다",
  glShortChecking: "연결 중…",
  glShortUnreachable: "응답 없음",
  glShortCors: "CORS 거부",
  glShortNotLoop: "game-loop 아님",
  glShortVersion: "버전 다름",
  glShortNamespace: "다른 계약",
  glUrlEmpty: "주소를 입력하세요: http://localhost:8787",
  glUrlInvalid: "주소가 아닙니다",
  glUrlScheme: "http 또는 https 주소를 쓰세요",
  glUrlSecret: "사용자, 비밀번호, 쿼리, 프래그먼트는 넣지 않습니다. 주소는 문서에 저장되고 비밀은 저장되지 않습니다",
};
