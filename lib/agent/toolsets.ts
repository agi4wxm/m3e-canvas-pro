/* Which tools the agent is handed. Every tool's definition goes with every request, and all of them together are some
 * 57 KB, most of it for things a request rarely needs (arranging, screens, components, styles, data, drawing). So a
 * conversation starts with the tools that build and read, plus the sets its request calls for by a cheap reading of
 * its words, and the model loads any other set with `load_tools` when it finds it needs one.
 *
 * The prompt cache keys on the tools as well as the system prompt and the conversation, so the sets only ever grow
 * within a conversation: a turn that needs nothing new sends exactly the tools of the turn before, and a set loaded
 * mid-turn costs one request without the cache. The system prompt names every set and its tools whatever is loaded,
 * so it never changes. Any operation can also run inside apply_ops whether its own tool is loaded or not. */

import { tool, type Tool } from "../tools";

export type ToolSet = "build" | "layout" | "screens" | "components" | "style" | "data" | "generate" | "reference";

export const TOOL_SETS: readonly ToolSet[] = ["build", "layout", "screens", "components", "style", "data", "generate", "reference"];

/** what each set is for, for the model */
export const SET_ABOUT: Record<ToolSet, string> = {
  build: "read the document and build on it (always loaded)",
  layout: "arrange: tidy, align, distribute, group, lock, z-order, wrap in or split out of auto layout",
  screens: "screens and the document: templates, sizes, variants, places, title, brief, clearing",
  components: "reusable components and their instances",
  style: "styles, themes, palettes, looks, custom styles",
  data: "variables, data collections, repeats, taps and their effects, bindings",
  generate: "drawing with a model: SVG, pictures, custom styles written from words or a picture",
  reference: "measuring an attached reference picture and comparing a screen with it",
};

/** the tools of the build set; everything else falls in the set of its kind */
const BUILD = new Set([
  "get_outline", "list_screens", "find_nodes", "describe_node", "get_selection", "list_parts", "describe_part", "list_kits", "list_icons", "screenshot", "load_tools",
  "apply_ops", "add_screen", "set_screen", "add_part", "add_tree", "add_kit", "set_props", "set_item", "set_group", "set_layout", "remove_nodes", "move_into", "move_node", "duplicate_nodes",
]);
const SCREENS = new Set(["add_template", "list_templates", "remove_screen", "duplicate_screen", "create_screen_variant", "resize_screen", "set_phone_model", "set_screen_length", "set_screen_place", "move_screen", "set_canvas_mode", "set_title", "set_brief", "set_prompt", "clear"]);
const COMPONENTS = new Set(["make_component", "rename_component", "remove_component", "detach_instance", "set_overrides", "add_instance", "list_components"]);
const REFERENCE = new Set(["sample_colors", "compare_to_reference"]);
const STYLE_READS = new Set(["list_styles", "get_style", "look_reference"]);

/** the set a tool belongs to */
export function setOf(t: Pick<Tool<never>, "name" | "group">): ToolSet {
  if (BUILD.has(t.name)) return "build";
  if (REFERENCE.has(t.name)) return "reference";
  if (SCREENS.has(t.name)) return "screens";
  if (COMPONENTS.has(t.name)) return "components";
  if (STYLE_READS.has(t.name) || t.group === "style") return "style";
  if (t.name === "list_data" || t.group === "data") return "data";
  if (t.group === "generate") return "generate";
  return "layout";
}

/* What calls for a set, in the four languages the editor speaks. A word alone is a poor guide ("Codex-style" is no
 * request for styles, a tab's icon needs no drawing, 页面 is any page and 画面 a screen), so each set has the phrases
 * that mean it (`yes`, English as whole words) and the look-alikes taken out of the request before they are read
 * (`no`). A set missed here costs one load_tools call; one loaded for nothing costs its bytes on every request of the
 * conversation after it, so the phrases lean to missing. */

/** one pattern, any of these, without regard to case */
const any = (...parts: RegExp[]) => new RegExp(parts.map((p) => p.source).join("|"), "i");
/** the look-alikes, every one of them */
const all = (...parts: RegExp[]) => new RegExp(parts.map((p) => p.source).join("|"), "gi");

type Cue = { yes: RegExp; no?: RegExp };

const CUES: [ToolSet, Cue][] = [
  [
    "style",
    {
      yes: any(
        /\b(?:re-?styl\w*|styles?|themes?|themed|palettes?|colou?r (?:scheme|palette|theme)s?|colou?rs|(?:dark|light|night) (?:mode|theme)|fonts?|typefaces?|typography|branding|skins?|aesthetics?|look and feel)\b/,
        /风格|主题|配色|色调|字体|深色|浅色|暗色|夜间模式|暗黑模式|外观|质感|主色|品牌色|整体颜色|换肤/,
        /スタイル|テーマ|配色|カラースキーム|フォント|書体|ダークモード|ライトモード|見た目/,
        /스타일|테마|배색|색상 ?테마|컬러 ?팔레트|팔레트|글꼴|폰트|다크 ?모드|라이트 ?모드/,
      ),
      no: all(
        /* a part described by a product it looks like ("a Codex-style prompt box"), or the style the document wears */
        /[\w.+#]+-styled?\b/,
        /\bstyle\s+(?:prompt|input|composer|box|card|button|bar|list|row|header|tab|menu|chat|screen|page|layout|component|dialog|sheet|field|form|nav\w*)/,
        /\b(?:in|with|using|keep(?:ing)?|match(?:ing)?|follow(?:ing)?|per|to)\s+(?:the\s+)?(?:current|same|existing|document'?s?|app'?s?|its|this|our|my)\s+(?:style|theme|look)\b/,
        /(?:按|照|按照|依照|保持|沿用|遵循|遵守|符合|延续|用)?(?:当前|现在|现有|目前|原来|原有|这个|这份|文档|同样|一样|统一|相同|一致)的?风格|风格(?:一致|统一|的)|风格(?=输入|卡片|按钮|列表|界面|页面|对话|聊天|搜索|标签|导航|菜单|弹窗|表单|组件)/,
        /\S*風の|スタイルの(?!変更|生成)|(?:今|現在|既存|同じ|この)の?(?:スタイル|テーマ)(?:で|のまま|に合わせ)/,
        /스타일의|스타일로 된|(?:현재|지금|기존|같은|동일한|이)\s*(?:스타일|테마)(?:로|대로|에 맞|을 유지|를 유지)|스타일\s*(?=입력|카드|버튼|목록|리스트|화면|채팅|검색|탭|메뉴)/,
      ),
    },
  ],
  [
    "data",
    {
      yes: any(
        /\b(?:variables?|data[- ]?(?:collections?|sets?|driven|binding|source)|collections?|datasets?|repeat(?:s|ed|ing)? (?:for|over) (?:each|every|the)|bind(?:s|ing)?|bound to|unbind|prototyp\w*|interactions?|interactive|navigat\w*|go(?:es)? back|go(?:es)? to (?:the |a )?\w+(?: \w+)? (?:screen|page|tab)|opens? (?:the |a )?\w+(?: \w+)? (?:screen|page|dialog|sheet|menu)|taps?|tapp(?:ed|ing)|clicks?|click(?:ed|ing)|press(?:es|ed|ing)?|link(?:s|ed)? (?:to|it to|them to)|(?:dark|light|theme|mode)\s+(?:mode\s+)?(?:toggle|switch)(?:es)?|toggles? (?:between|the (?:dark|light|theme|mode)|dark|light)|switch(?:es)? between|counters?|show (?:and|or) hide|conditional(?:ly)?|(?:login|log[- ]in|sign[- ]?in|sign[- ]?up|checkout|onboarding|user|purchase|payment|booking|registration) flows?)\b/,
        /变量|数据(?:集|集合|驱动|绑定|源)|示例数据|集合|绑定|交互|跳转|点击|点一下|轻点|点按|按下|原型|流程|计数|显示隐藏|显示或隐藏|返回上一|切换(?!风格|主题|成|为)|(?:深色|浅色|暗色|夜间|主题|模式)[^，。,.]{0,4}开关|开关[^，。,.]{0,4}(?:深色|浅色|暗色|夜间|主题|模式|变量)|打开(?=[^，。,.]{0,6}(?:页|屏|弹窗|菜单|对话框))/,
        /変数|データ(?:コレクション|セット|バインド)|コレクション|バインド|タップ(?:し|す|で|した)|クリック|押(?:す|し|した)と|遷移|切り替え(?!ボタン)|プロトタイプ|インタラクション|(?:ダーク|ライト)モード(?:の|を)?(?:切り替え|スイッチ|トグル)|カウンター|フロー/,
        /변수|데이터 ?(?:컬렉션|세트|바인딩)|컬렉션|바인딩|바인드|탭하면|탭할 때|누르면|클릭|이동(?:하|해|시)|전환(?!\s*버튼)|프로토타입|인터랙션|상호작용|(?:다크|라이트) ?모드 ?(?:전환|토글|스위치)|카운터|플로우/,
      ),
      no: all(/\b(?:tap|click) targets?\b/, /\btab bars?\b/, /\bnavigation (?:drawers?|bars?|rails?|menus?|tabs?|items?|buttons?|links?)\b/),
    },
  ],
  [
    "generate",
    {
      yes: any(
        /\b(?:draw|draws|drawing|drawn|sketch(?:es|ed|ing)?|svg|illustrat\w*|logos?|ornaments?|ornamental|artwork|paint(?:s|ed|ing)?|wallpapers?|backdrops?|mascot|emblem|(?:hero|background|cover|header|splash) (?:image|picture|art|illustration|photo|scene)s?|custom (?:icons?|glyphs?|graphics?|art)|(?:photo|picture|image)s? (?:of|showing) (?:a|an|the|some)?|generat\w*(?:\W+\w+){0,4}?\W+(?:styles?|themes?|icons?|logos?|svg|images?|pictures?|illustrations?|art|artwork|backdrops?|backgrounds?|photos?|graphics?))\b/,
        /(?<![动漫计规策刻])画(?![布面板廊质幅])|绘(?!制图层)|插图|插画|配图|壁纸|背景(?:图|画|插画|照片|场景)|吉祥物|标志|logo|自定义图标|(?:设计|生成|创作)[^，。,.]{0,14}(?:图标|插画|插图|图案|logo|标志|图片|背景图|照片|风格|主题)|装饰(?:图|花纹|纹样|图案)/,
        /描(?:い|く|け|こ)|イラスト|ロゴ|壁紙|背景(?:画像|イラスト|写真)|カスタムアイコン|アイコンを?(?:描|作成|生成|デザイン)|(?:画像|イラスト|写真|スタイル|テーマ|アイコン|ロゴ)を?(?:生成|描)|生成(?:して|する)?[^、。,.]{0,10}(?:画像|イラスト|スタイル|テーマ|アイコン|ロゴ)|装飾/,
        /그려|그림|일러스트|로고|배경 ?(?:이미지|그림|사진)|배경화면|커스텀 아이콘|아이콘을? ?(?:그려|생성|디자인)|(?:이미지|그림|사진|스타일|테마|아이콘|로고)를? ?생성|생성[^,.]{0,10}(?:이미지|그림|스타일|테마|아이콘|로고)|장식/,
      ),
    },
  ],
  [
    "components",
    {
      yes: any(
        /\b(?:reusable|re-?use|instances?|symbols?|(?:master|main) components?|detach\w*|(?:make|turn|save|convert|store|keep)\s+(?:it|this|these|them|that|the \w+)?\s*(?:in)?to\s+(?:a\s+)?(?:reusable\s+)?components?|as\s+(?:a\s+)?(?:reusable\s+)?components?|components? (?:library|definition))\b/,
        /组件库|可复用|复用|重复使用|实例|(?:存|做|保存|转|变|封装)(?:成|为)(?:一个)?(?:可复用的?)?组件|主组件/,
        /コンポーネント(?:化|に(?:して|する)|として保存)|再利用|インスタンス|メインコンポーネント/,
        /컴포넌트로|컴포넌트화|재사용|인스턴스|메인 컴포넌트/,
      ),
    },
  ],
  [
    "screens",
    {
      yes: any(
        /\b(?:templates?|(?:whole|entire|full|complete) app|multi-?screens?|(?:two|three|four|five|six|seven|eight|several|multiple|many|\d+)\s+(?:\w+\s+)?(?:screens|pages)|onboarding|tablet|ipad|desktop (?:version|layout|size|screen|app)|(?:screen|phone) (?:size|model)|screen variants?|variants? of (?:the|this) screen|(?:tablet|desktop|phone) variants?|(?:rename|title of|name of) the app|app(?:'s)? (?:name|title)|clear (?:the )?canvas|start over|landscape)\b/,
        /模板|整个应用|整套|完整的?应用|多个?(?:屏|页面|界面)|[两三四五六七八九十几多0-9]+\s*个?\s*(?:屏幕|页面|界面|屏)|平板|iPad|桌面版|电脑版|网页版|手机型号|屏幕尺寸|变体|横屏|应用(?:名|标题)|清空|引导页|新手引导/,
        /テンプレート|アプリ全体|アプリ一式|複数の画面|[2-9二三四五六]+\s*(?:つ|枚)?の?画面|画面を[2-9二三四五]|タブレット|iPad|デスクトップ版|PC版|機種|画面サイズ|横向き|オンボーディング|アプリ名|キャンバスをクリア/,
        /템플릿|앱 전체|전체 앱|여러 화면|화면 ?[2-9]개|[두세네다섯여섯]\s*개의? 화면|태블릿|아이패드|데스크톱 버전|PC 버전|기종|화면 크기|가로 모드|온보딩|앱 이름|캔버스를? 비워/,
      ),
    },
  ],
  [
    "layout",
    {
      yes: any(
        /\b(?:tidy|align\w*|distribut\w*|arrang\w*|re-?arrang\w*|spacing|evenly|group (?:them|these|it|those|the)|regroup|ungroup|lock|unlock|reorder|z-?order|bring (?:it |them )?(?:to )?(?:the )?front|send (?:it |them )?(?:to )?(?:the )?back|auto[- ]?layout|polish|clean ?up|neaten|line (?:them |these |it )?up)\b/,
        /整理|对齐|分布|排列|间距|均匀|分组|编组|锁定|解锁|调整顺序|层级|置顶|置底|自动布局|打磨|排版/,
        /整え|揃え|整列|余白|間隔|グループ化|ロック|並べ替え|重ね順|最前面|最背面|オートレイアウト|整理/,
        /정리|정렬|간격|여백|그룹화|그룹 해제|잠금|순서 변경|맨 앞|맨 뒤|오토 ?레이아웃|다듬/,
      ),
      no: all(/\b(?:button|radio|toggle|chip|segmented|tab|input|form|chat|list|avatar) groups?\b/, /\bgroup chats?\b/, /\block (?:screen|icon)s?\b/),
    },
  ],
];

/** The sets a request calls for by its words, and by what comes with it: a picture to copy brings the tools that
 *  measure it, styles and drawing. */
export function setsFor(request: string, o: { attachments?: number } = {}): ToolSet[] {
  const out = new Set<ToolSet>(["build"]);
  /* full-width letters and digits read as plain ones */
  const text = request.normalize("NFKC");
  for (const [set, cue] of CUES) if (cue.yes.test(cue.no ? text.replace(cue.no, " ") : text)) out.add(set);
  if (o.attachments) for (const s of ["reference", "style", "generate"] as const) out.add(s);
  return TOOL_SETS.filter((s) => out.has(s));
}

/** the tools of some sets, in the registry's order */
export const toolsIn = (tools: Tool<never>[], sets: readonly ToolSet[]) => tools.filter((t) => sets.includes(setOf(t)));

/** the sets a model asked for, of those there are */
const known = (v: unknown): ToolSet[] => (Array.isArray(v) ? v.filter((x): x is ToolSet => TOOL_SETS.includes(x as ToolSet)) : []);

/** load_tools: the model asks for more sets; the runner adds them from its next request on */
export function loadTools(load: (sets: ToolSet[]) => ToolSet[]): Tool<never> {
  return tool<{ sets: string[] }>({
    name: "load_tools",
    group: "read",
    description: `Adds sets of tools to your tool list from your next step on: ${TOOL_SETS.filter((s) => s !== "build").map((s) => `${s} (${SET_ABOUT[s]})`).join("; ")}. Load a set when the request needs its tools; any operation can also be run inside apply_ops without loading it.`,
    input: { type: "object", properties: { sets: { type: "array", items: { type: "string", enum: TOOL_SETS.filter((s) => s !== "build") }, minItems: 1 } }, required: ["sets"], additionalProperties: false },
    output: "{loaded, tools: the names now available}",
    readOnly: true,
    destructive: false,
    run(a) {
      const asked = known(a.sets);
      return { result: { loaded: load(asked) } };
    },
  }) as unknown as Tool<never>;
}

/** the guide's list of every set and its tools: the same whatever is loaded, so the system prompt stays as it was */
export function setsGuide(tools: Tool<never>[]): string {
  return [
    "Tool sets (your tool list holds build and the sets loaded so far; load_tools adds the others, and apply_ops runs any operation whether its tool is loaded or not):",
    ...TOOL_SETS.map((s) => {
      const names = toolsIn(tools, [s]).map((t) => t.name);
      return names.length ? `- ${s}: ${SET_ABOUT[s]}: ${names.join(", ")}` : "";
    }).filter(Boolean),
  ].join("\n");
}
