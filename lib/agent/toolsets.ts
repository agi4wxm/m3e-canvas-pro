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
  components: "reusable components and their instances: variants, component properties, swapping an instance",
  style: "styles, themes, palettes, looks, custom styles",
  data: "variables (collections, modes such as light and dark, color variables bound to fills), data collections, repeats, taps and their effects, triggers and animations, bindings",
  generate: "drawing with a model: SVG, pictures, custom styles written from words or a picture",
  reference: "measuring an attached reference picture and comparing a screen with it",
};

/** the tools of the build set; everything else falls in the set of its kind */
const BUILD = new Set([
  "get_outline", "list_screens", "find_nodes", "describe_node", "get_selection", "list_parts", "describe_part", "list_kits", "list_icons", "screenshot", "load_tools",
  "apply_ops", "add_screen", "set_screen", "add_part", "add_tree", "add_kit", "set_props", "set_item", "set_group", "set_layout", "remove_nodes", "move_into", "move_node", "duplicate_nodes",
]);
const SCREENS = new Set(["set_flow_start", "add_template", "list_templates", "remove_screen", "duplicate_screen", "create_screen_variant", "resize_screen", "set_phone_model", "set_screen_length", "set_screen_place", "move_screen", "set_canvas_mode", "set_title", "set_brief", "set_prompt", "clear"]);
const COMPONENTS = new Set([
  "make_component", "rename_component", "remove_component", "detach_instance", "set_overrides", "add_instance", "list_components",
  "add_variant", "update_component_set", "set_variant_values", "swap_instance", "set_component_prop", "remove_component_prop", "set_instance_props", "reset_overrides",
]);
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

/* words that call for a set, in the four languages the editor speaks */
const CALLS: [ToolSet, RegExp][] = [
  ["style", /\b(style|styles|theme|colou?rs?|palette|dark|light mode|font|typeface|look|brand|skin|aesthetic|notebook|retro|minimal)\b|风格|主题|颜色|配色|色调|字体|深色|浅色|暗色|外观|质感|スタイル|テーマ|色|配色|フォント|ダーク|ライト|見た目|스타일|테마|색|글꼴|폰트|다크|라이트/i],
  ["data", /\b(variables?|data|collection|list of|toggle|switch|tap|taps|click|navigat\w*|link|links|interact\w*|prototype|flow|state|counter|login flow|when)\b|变量|数据|交互|跳转|点击|开关|切换|原型|流程|状态|绑定|変数|データ|タップ|遷移|切り替え|スイッチ|プロトタイプ|변수|데이터|탭|전환|스위치|프로토타입/i],
  ["generate", /\b(draw|drawing|svg|icon|icons|illustration|picture|image|photo|background|backdrop|logo|ornament|generate|paint|artwork|hero)\b|画|绘|插图|图标|图片|背景|生成|装饰|描|イラスト|アイコン|画像|背景|生成|그려|그림|아이콘|이미지|배경|생성/i],
  ["components", /\b(component|components|reusable|instance|instances|symbol|variants?)\b|组件库|可复用|复用|实例|变体|コンポーネント|再利用|インスタンス|バリアント|컴포넌트|재사용|인스턴스|베리언트/i],
  ["screens", /\b(screens|template|templates|whole app|app with|pages|onboarding|tablet|desktop|variant|title of the app)\b|屏幕|页面|模板|整个应用|多屏|平板|桌面版|画面|テンプレート|アプリ全体|화면|템플릿|앱 전체/i],
  ["layout", /\b(tidy|align|distribute|arrange|spacing|group|lock|reorder|auto layout|polish|clean up)\b|整理|对齐|分布|排列|间距|分组|锁定|自动布局|打磨|整える|揃え|整列|余白|정리|정렬|간격|그룹/i],
];

/** The sets a request calls for by its words, and by what comes with it: a picture to copy brings the tools that
 *  measure it, styles and drawing. */
export function setsFor(request: string, o: { attachments?: number } = {}): ToolSet[] {
  const out = new Set<ToolSet>(["build"]);
  for (const [set, re] of CALLS) if (re.test(request)) out.add(set);
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
