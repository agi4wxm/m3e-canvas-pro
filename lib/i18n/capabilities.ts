/* Editor words for the platform capabilities (lib/capabilities, docs/平台能力.md): the invoke effect in the effects
 * panel, a capability's outcomes in the mocks panel and in the preview's request log. Spread into `UI` and `KO` in
 * lib/i18n.ts; each entry has ja, en and zh, and Korean is in `CAPABILITIES_KO` below with exactly the same keys. */

export const CAPABILITIES_UI = {
  capEffInvoke: { ja: "プラットフォーム機能を使う", en: "Use a platform capability", zh: "调用平台能力" },
  capCapability: { ja: "機能", en: "Capability", zh: "能力" },
  capArgs: { ja: "渡す値", en: "What it is given", zh: "参数" },
  capThen: { ja: "できたとき（result を読む）", en: "When it is done (reads result)", zh: "完成后（读 result）" },
  capCatch: { ja: "できなかったとき（error.type を読む）", en: "When it fails (reads error.type)", zh: "失败时（读 error.type）" },
  capNotSuccess: {
    ja: "支払いの「できた」は送信されたという意味だけです。支払い済みかどうかは注文の状態（API）で表示します。",
    en: "A payment that is done was only submitted: whether it is paid is the order's status, from the API.",
    zh: "支付“完成”只代表已提交：是否已支付以接口返回的订单状态为准。",
  },
  capFailCancelled: { ja: "キャンセルされた", en: "Cancelled", zh: "已取消" },
  capFailFailed: { ja: "失敗した", en: "Failed", zh: "失败" },
  capFailUnavailable: { ja: "使えない", en: "Unavailable", zh: "不可用" },
  capFailNotImplemented: { ja: "まだ実装されていない", en: "Not implemented", zh: "未实现" },
  capFailDenied: { ja: "許可されなかった", en: "Denied", zh: "被拒绝" },
  capFailTimeout: { ja: "時間切れ", en: "Timed out", zh: "超时" },
  capMocks: { ja: "プラットフォーム機能", en: "Platform capabilities", zh: "平台能力" },
  capMocksHint: {
    ja: "プレビューでの機能の答え方です。シナリオごとに変えられます（支払いのキャンセル、位置情報の拒否など）。",
    en: "How the capabilities answer in the preview; a scenario may change it (a payment cancelled, the location denied).",
    zh: "预览里各能力怎样回答；每个场景可以单独设置（支付被取消、定位被拒绝……）。",
  },
  capAnswerOk: { ja: "できた（例の値）", en: "Done (the example)", zh: "完成（示例结果）" },
  capDelay: { ja: "待ち時間（ms）", en: "Delay (ms)", zh: "延迟（毫秒）" },
  capNone: { ja: "このドキュメントはまだ機能を使っていません。", en: "This document uses no capability yet.", zh: "这个文档还没有用到平台能力。" },
  capLogInvoke: { ja: "機能", en: "Capability", zh: "能力" },
};

type Keys = keyof typeof CAPABILITIES_UI;

export const CAPABILITIES_KO: Record<Keys, string> = {
  capEffInvoke: "플랫폼 기능 사용",
  capCapability: "기능",
  capArgs: "넘길 값",
  capThen: "완료되면(result 읽기)",
  capCatch: "실패하면(error.type 읽기)",
  capNotSuccess: "결제 ‘완료’는 제출되었다는 뜻일 뿐입니다. 결제되었는지는 API의 주문 상태로 표시하세요.",
  capFailCancelled: "취소됨",
  capFailFailed: "실패",
  capFailUnavailable: "사용할 수 없음",
  capFailNotImplemented: "아직 구현되지 않음",
  capFailDenied: "거부됨",
  capFailTimeout: "시간 초과",
  capMocks: "플랫폼 기능",
  capMocksHint: "미리보기에서 기능이 답하는 방식입니다. 시나리오마다 바꿀 수 있습니다(결제 취소, 위치 거부 등).",
  capAnswerOk: "완료(예시 결과)",
  capDelay: "지연(ms)",
  capNone: "이 문서는 아직 플랫폼 기능을 쓰지 않습니다.",
  capLogInvoke: "기능",
};

/** the words of each failure kind */
export const FAILURE_WORDS = {
  cancelled: "capFailCancelled",
  failed: "capFailFailed",
  unavailable: "capFailUnavailable",
  "not-implemented": "capFailNotImplemented",
  denied: "capFailDenied",
  timeout: "capFailTimeout",
} as const satisfies Record<string, Keys>;
