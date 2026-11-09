/* Editor words for templates spawned on events (docs/交互规则.md “按事件生成”): the spawn effect in the effects panel and
 * the template section of the design panel. Spread into `UI` and `KO` in lib/i18n.ts; each entry has ja, en and zh, and
 * Korean is in `SPAWN_KO` below with exactly the same keys. */

export const SPAWN_UI = {
  spawnEff: { ja: "テンプレートからひとつ生成する", en: "Spawn an instance of a template", zh: "用模板生成一个实例" },
  spawnTemplate: { ja: "テンプレート", en: "Template", zh: "模板" },
  spawnNoTemplates: { ja: "この画面にテンプレートがありません（グループの「イベントごとに生成」をオンにします）。", en: "No template on this screen (turn on “Spawn per event” on a group).", zh: "这个屏幕上还没有模板（在组上打开“按事件生成”）。" },
  spawnSection: { ja: "イベントごとに生成", en: "Spawn per event", zh: "按事件生成" },
  spawnOn: { ja: "テンプレートにする", en: "Make it a template", zh: "设为模板" },
  spawnLife: { ja: "寿命（秒）", en: "Life (seconds)", zh: "寿命（秒）" },
  spawnMax: { ja: "同時に最大", en: "At most at once", zh: "同时最多" },
  spawnMotion: { ja: "動き", en: "Motion", zh: "动画" },
  spawnFloat: { ja: "浮き上がって消える", en: "Float up and fade", zh: "上浮并淡出" },
  spawnFade: { ja: "その場で消える", en: "Fade where it stands", zh: "原地淡出" },
  spawnStill: { ja: "動かない", en: "Stay still", zh: "不动" },
  spawnHint: {
    ja: "イベント（ワールドビューの hit、購読のメッセージ）に「生成」効果を付けると、そのたびにこのグループのインスタンスがひとつ出ます。文字の {{event.amount}} はそのイベントを読みます。キャンバスにはテンプレートだけが描かれます。",
    en: "Add a Spawn effect to an event (a world view's hit, a subscription's message) and each one brings up an instance of this group. {{event.amount}} in its words reads that event. The canvas draws only the template.",
    zh: "在事件（世界视口的 hit、订阅的消息）上加“生成”效果，每收到一次就出现这个组的一个实例。文字里的 {{event.amount}} 读那次事件。画布上只画模板。",
  },
};

type Keys = keyof typeof SPAWN_UI;

export const SPAWN_KO: Record<Keys, string> = {
  spawnEff: "템플릿으로 인스턴스 하나 생성",
  spawnTemplate: "템플릿",
  spawnNoTemplates: "이 화면에 템플릿이 없습니다(그룹에서 “이벤트마다 생성”을 켜세요).",
  spawnSection: "이벤트마다 생성",
  spawnOn: "템플릿으로 만들기",
  spawnLife: "수명(초)",
  spawnMax: "동시에 최대",
  spawnMotion: "움직임",
  spawnFloat: "떠오르며 사라짐",
  spawnFade: "제자리에서 사라짐",
  spawnStill: "움직이지 않음",
  spawnHint: "이벤트(월드 뷰의 hit, 구독 메시지)에 “생성” 효과를 붙이면 그때마다 이 그룹의 인스턴스가 하나 나타납니다. 글자의 {{event.amount}}는 그 이벤트를 읽습니다. 캔버스에는 템플릿만 그려집니다.",
};
