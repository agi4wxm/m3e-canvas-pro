/* Editor words for the MCP connection (components/McpPanel.tsx): the switch, the pairing and confirmation asks, the
 * connections and the activity log. Kept on their own, with their own lookup, so nothing else's dictionary changes;
 * every language has exactly the same keys (lib/i18n/mcp.test.ts). */

import type { Lang } from "../i18n";

type Words = {
  title: string;
  connect: string;
  intro: string;
  howToStart: string;
  docs: string;
  looking: string;
  lookingHint: string;
  pairTitle: string;
  pairBody: string;
  codeLabel: string;
  codeWrong: string;
  pairReadOnlyOffered: string;
  allowEdit: string;
  allowRead: string;
  deny: string;
  paired: string;
  pairing: string;
  closed: string;
  refusedBusy: string;
  refusedProtocol: string;
  refusedDenied: string;
  refusedDisconnected: string;
  refusedLocked: string;
  canEdit: string;
  readOnly: string;
  drawing: string;
  disconnect: string;
  activity: string;
  noActivity: string;
  confirmTitle: string;
  confirmBody: string;
  confirmChanged: string;
  confirmLeft: string;
  allow: string;
  decline: string;
  someClient: string;
  stateRunning: string;
  stateAsking: string;
  stateOk: string;
  stateError: string;
  stateDenied: string;
  remember: string;
  rememberHint: string;
  remembered: string;
  rememberedVia: string;
  forget: string;
  usedAt: string;
};

export const MCP_TEXT: Record<Lang, Words> = {
  en: {
    title: "MCP",
    connect: "Connect to MCP",
    intro: "Let Claude Desktop, Codex and other MCP clients work on this canvas. Add the m3e-canvas-mcp server to your client, then turn this on and type the pairing code your client gives you.",
    howToStart: "The server's command",
    docs: "Setup and security: docs/MCP.md",
    looking: "Looking for an MCP server on this computer…",
    lookingHint: "Start m3e-canvas-mcp from your MCP client (or run it in a terminal). It is found by itself.",
    pairTitle: "{client} wants to work on this canvas",
    pairBody: "Type the pairing code {client} gives you: ask the AI in it for the code (it calls connection_status), or read it in the server's log. The editor never shows it, so a page that is not yours cannot pair.",
    codeLabel: "Pairing code",
    codeWrong: "That is not the server's code. {n} tries left.",
    pairReadOnlyOffered: "The server was started read-only.",
    allowEdit: "Allow editing",
    allowRead: "Read only",
    deny: "Deny",
    paired: "Connected",
    pairing: "Waiting for your approval",
    closed: "Server stopped, looking for it again",
    refusedBusy: "Another tab is already connected to this server.",
    refusedProtocol: "This server is another version: update m3e-canvas-mcp or the editor.",
    refusedDenied: "Denied",
    refusedDisconnected: "Disconnected",
    refusedLocked: "Too many wrong codes: restart the MCP server to pair",
    canEdit: "Can edit",
    readOnly: "Read only",
    drawing: "Draws with the server's OpenAI key",
    disconnect: "Disconnect",
    activity: "Activity",
    noActivity: "No calls yet.",
    confirmTitle: "Allow {client} to do this?",
    confirmBody: "{name} takes something off the canvas. You can undo it afterwards.",
    confirmChanged: "The canvas changed while you were asked, and so did what this takes away. Check it again.",
    confirmLeft: "Declined in {n} s",
    allow: "Allow",
    decline: "Decline",
    someClient: "An MCP client",
    stateRunning: "Running",
    stateAsking: "Waiting for you",
    stateOk: "Done",
    stateError: "Failed",
    stateDenied: "Not allowed",
    remember: "Remember this client",
    rememberHint: "Next time {client} starts its server, it connects without asking, with the same access.",
    remembered: "Remembered clients",
    rememberedVia: "Remembered",
    forget: "Forget",
    usedAt: "last used {when}",
  },
  zh: {
    title: "MCP",
    connect: "连接 MCP",
    intro: "让 Claude Desktop、Codex 等 MCP 客户端操作这块画布。在客户端里添加 m3e-canvas-mcp 服务器，然后打开这里，输入客户端给你的配对码。",
    howToStart: "服务器的命令",
    docs: "安装和安全说明：docs/MCP.md",
    looking: "正在查找这台电脑上的 MCP 服务器…",
    lookingHint: "在 MCP 客户端里启动 m3e-canvas-mcp（或在终端里运行），这里会自动找到它。",
    pairTitle: "{client} 想操作这块画布",
    pairBody: "输入 {client} 给你的配对码：在客户端里问 AI 要（它会调用 connection_status），或看服务器的日志。编辑器不会显示这个码，所以不是你的网页无法配对。",
    codeLabel: "配对码",
    codeWrong: "这不是服务器的配对码，还可以试 {n} 次。",
    pairReadOnlyOffered: "服务器以只读方式启动。",
    allowEdit: "允许编辑",
    allowRead: "只读",
    deny: "拒绝",
    paired: "已连接",
    pairing: "等待你批准",
    closed: "服务器已停止，正在重新查找",
    refusedBusy: "已有另一个标签页连接到这个服务器。",
    refusedProtocol: "服务器版本不同：请更新 m3e-canvas-mcp 或编辑器。",
    refusedDenied: "已拒绝",
    refusedDisconnected: "已断开",
    refusedLocked: "输错的次数太多：重启 MCP 服务器后再配对",
    canEdit: "可编辑",
    readOnly: "只读",
    drawing: "用服务器的 OpenAI 密钥生成图形",
    disconnect: "断开",
    activity: "活动",
    noActivity: "还没有调用。",
    confirmTitle: "允许 {client} 这样做吗？",
    confirmBody: "{name} 会从画布上删掉内容。之后可以撤销。",
    confirmChanged: "询问期间画布有了变化，这次调用要删掉的内容也变了。请再确认一次。",
    confirmLeft: "{n} 秒后自动拒绝",
    allow: "允许",
    decline: "拒绝",
    someClient: "一个 MCP 客户端",
    stateRunning: "进行中",
    stateAsking: "等你确认",
    stateOk: "完成",
    stateError: "失败",
    stateDenied: "未允许",
    remember: "记住这个客户端",
    rememberHint: "下次 {client} 启动服务器时不再询问，直接以同样的权限连接。",
    remembered: "记住的客户端",
    rememberedVia: "已记住",
    forget: "忘记",
    usedAt: "上次使用 {when}",
  },
  ja: {
    title: "MCP",
    connect: "MCP に接続",
    intro: "Claude Desktop や Codex などの MCP クライアントがこのキャンバスを操作できるようにします。クライアントに m3e-canvas-mcp サーバーを追加し、ここをオンにして、クライアントが示すペアリングコードを入力してください。",
    howToStart: "サーバーのコマンド",
    docs: "設定とセキュリティ：docs/MCP.md",
    looking: "このコンピューターの MCP サーバーを探しています…",
    lookingHint: "MCP クライアントから m3e-canvas-mcp を起動してください（ターミナルで実行しても構いません）。自動で見つかります。",
    pairTitle: "{client} がこのキャンバスを操作しようとしています",
    pairBody: "{client} が示すペアリングコードを入力してください。クライアントの AI に尋ねる（connection_status を呼びます）か、サーバーのログで確認できます。エディタにはコードを表示しないので、あなたのものではないページはペアリングできません。",
    codeLabel: "ペアリングコード",
    codeWrong: "サーバーのコードと違います。あと {n} 回試せます。",
    pairReadOnlyOffered: "サーバーは読み取り専用で起動しています。",
    allowEdit: "編集を許可",
    allowRead: "読み取りのみ",
    deny: "拒否",
    paired: "接続済み",
    pairing: "承認を待っています",
    closed: "サーバーが停止しました。もう一度探しています",
    refusedBusy: "別のタブがこのサーバーに接続しています。",
    refusedProtocol: "サーバーのバージョンが違います。m3e-canvas-mcp かエディターを更新してください。",
    refusedDenied: "拒否しました",
    refusedDisconnected: "切断しました",
    refusedLocked: "間違ったコードが多すぎます。MCP サーバーを再起動してからペアリングしてください",
    canEdit: "編集できる",
    readOnly: "読み取りのみ",
    drawing: "サーバーの OpenAI キーで描画",
    disconnect: "切断",
    activity: "アクティビティ",
    noActivity: "まだ呼び出しはありません。",
    confirmTitle: "{client} にこの操作を許可しますか？",
    confirmBody: "{name} はキャンバスから内容を取り除きます。あとで取り消せます。",
    confirmChanged: "確認を待つ間にキャンバスが変わり、取り除かれる内容も変わりました。もう一度確認してください。",
    confirmLeft: "{n} 秒後に拒否",
    allow: "許可",
    decline: "拒否",
    someClient: "MCP クライアント",
    stateRunning: "実行中",
    stateAsking: "確認待ち",
    stateOk: "完了",
    stateError: "失敗",
    stateDenied: "許可されず",
    remember: "このクライアントを記憶",
    rememberHint: "次に {client} がサーバーを起動したときは、確認なしで同じ権限で接続します。",
    remembered: "記憶したクライアント",
    rememberedVia: "記憶済み",
    forget: "削除",
    usedAt: "最終使用 {when}",
  },
  ko: {
    title: "MCP",
    connect: "MCP 연결",
    intro: "Claude Desktop, Codex 등 MCP 클라이언트가 이 캔버스를 다룰 수 있게 합니다. 클라이언트에 m3e-canvas-mcp 서버를 추가한 다음 여기를 켜고 클라이언트가 알려 주는 페어링 코드를 입력하세요.",
    howToStart: "서버 명령",
    docs: "설정과 보안: docs/MCP.md",
    looking: "이 컴퓨터에서 MCP 서버를 찾는 중…",
    lookingHint: "MCP 클라이언트에서 m3e-canvas-mcp를 시작하세요(터미널에서 실행해도 됩니다). 자동으로 찾습니다.",
    pairTitle: "{client}이(가) 이 캔버스를 다루려고 합니다",
    pairBody: "{client}이(가) 알려 주는 페어링 코드를 입력하세요. 클라이언트의 AI에게 물어보거나(connection_status를 호출합니다) 서버 로그에서 확인할 수 있습니다. 편집기에는 코드가 표시되지 않으므로 내 것이 아닌 페이지는 페어링할 수 없습니다.",
    codeLabel: "페어링 코드",
    codeWrong: "서버의 코드가 아닙니다. {n}번 더 시도할 수 있습니다.",
    pairReadOnlyOffered: "서버가 읽기 전용으로 시작되었습니다.",
    allowEdit: "편집 허용",
    allowRead: "읽기 전용",
    deny: "거부",
    paired: "연결됨",
    pairing: "승인을 기다리는 중",
    closed: "서버가 멈췄습니다. 다시 찾는 중",
    refusedBusy: "다른 탭이 이미 이 서버에 연결되어 있습니다.",
    refusedProtocol: "서버 버전이 다릅니다. m3e-canvas-mcp 또는 편집기를 업데이트하세요.",
    refusedDenied: "거부됨",
    refusedDisconnected: "연결 끊김",
    refusedLocked: "잘못된 코드가 너무 많습니다. MCP 서버를 다시 시작한 뒤 페어링하세요",
    canEdit: "편집 가능",
    readOnly: "읽기 전용",
    drawing: "서버의 OpenAI 키로 그리기",
    disconnect: "연결 끊기",
    activity: "활동",
    noActivity: "아직 호출이 없습니다.",
    confirmTitle: "{client}에게 이 작업을 허용할까요?",
    confirmBody: "{name}은(는) 캔버스에서 내용을 지웁니다. 나중에 실행 취소할 수 있습니다.",
    confirmChanged: "확인을 기다리는 동안 캔버스가 바뀌어 지워질 내용도 달라졌습니다. 다시 확인하세요.",
    confirmLeft: "{n}초 후 거부",
    allow: "허용",
    decline: "거부",
    someClient: "MCP 클라이언트",
    stateRunning: "실행 중",
    stateAsking: "확인 대기",
    stateOk: "완료",
    stateError: "실패",
    stateDenied: "허용 안 됨",
    remember: "이 클라이언트 기억하기",
    rememberHint: "다음에 {client} 가 서버를 시작하면 묻지 않고 같은 권한으로 연결합니다.",
    remembered: "기억한 클라이언트",
    rememberedVia: "기억됨",
    forget: "잊기",
    usedAt: "마지막 사용 {when}",
  },
};

export type McpKey = keyof Words;

/** a word for the MCP connection in the editor's language, with {placeholders} filled in */
export function mcpText(key: McpKey, lang: Lang, vars: Record<string, string | number> = {}): string {
  return (MCP_TEXT[lang] ?? MCP_TEXT.en)[key].replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] !== undefined ? String(vars[k]) : all));
}
