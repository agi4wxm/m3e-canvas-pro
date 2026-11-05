import { box, button, hbox, iconButton, para, text, vbox } from "../atoms";
import { say, type Node } from "../templates/kit";
import { centersTitle, type KitDef } from "./types";

/* A screen's top bar, as atoms. Where the title stands is the composition: at the start beside the
 * way back (Material), centered between two equal sides (iOS, WeChat), or large under the bar (the
 * styles that set their titles large). The kit follows where the style's own bar puts its title. */

const W = 412;
const TITLE = say("Title", "标题", "タイトル", "제목");
const BACK = say("Back", "返回", "戻る", "뒤로");
const MORE = say("More", "更多", "その他", "더보기");
const SEARCH = say("Search", "搜索", "検索", "검색");
const NAME = say("Top app bar", "顶部栏", "トップバー", "상단 바");

/** one side of a centered bar: as wide as the other, so the title between them is truly centered */
const side = (justify: "start" | "end", kids: Node[]): Node => hbox({ justify, gap: 0, hugWidth: false, width: 100 }, kids, { grow: true });

const appBar: KitDef = {
  slug: "top-app-bar",
  name: "Top app bar",
  labels: { zh: "顶部应用栏", ja: "トップアプリバー", ko: "상단 앱 바" },
  category: "Navigation",
  icon: "web_asset",
  about: "a bar box: the way back, the title (at the start, centered between two equal sides, or large under the bar) and action buttons",
  variants: [
    {
      key: "start",
      name: "Title at the start",
      labels: { zh: "标题靠左", ja: "タイトル左寄せ", ko: "제목 왼쪽" },
      suits: (l) => !centersTitle(l) && l.appbar !== "large",
      span: "screen",
      build: () =>
        hbox({ surface: "bar", width: W, hugWidth: false, padX: 4, padY: 8, gap: 4 }, [iconButton("arrow_back", BACK), para(TITLE, "title", { maxLines: 1 }, { grow: true }), iconButton("search", SEARCH), iconButton("more_vert", MORE)], { name: NAME }),
    },
    {
      key: "center",
      name: "Title centered",
      labels: { zh: "标题居中", ja: "タイトル中央", ko: "제목 가운데" },
      suits: centersTitle,
      span: "screen",
      build: () =>
        hbox(
          { surface: "bar", width: W, hugWidth: false, padX: 8, padY: 8, gap: 8 },
          [side("start", [button(BACK, { variant: "text", size: "sm", icon: "chevron_left" })]), text(TITLE, "heading", { bold: true }), side("end", [iconButton("more_horiz", MORE)])],
          { name: NAME },
        ),
    },
    {
      key: "large",
      name: "Large title",
      labels: { zh: "大标题", ja: "大きなタイトル", ko: "큰 제목" },
      suits: (l) => l.appbar === "large",
      span: "screen",
      build: () =>
        vbox(
          { surface: "bar", width: W, hugWidth: false, padX: 16, padY: 8, gap: 4 },
          [hbox({ justify: "between", gap: 8 }, [box({ layout: "row", align: "center", padX: 0, padY: 0 }, [iconButton("arrow_back", BACK)]), hbox({ gap: 0 }, [iconButton("search", SEARCH), iconButton("more_vert", MORE)])]), para(TITLE, "display", { bold: true, maxLines: 1 })],
          { name: NAME },
        ),
    },
  ],
};

export const barKits: KitDef[] = [appBar];
