
import { useMemo, useState } from "react";
import { Palette } from "@/lib/tokens";
import { CATEGORIES, PARTS, partBySlug, type PartCategory } from "@/parts/registry";
import { nameOf } from "@/parts/labels";
import { Icon } from "./M3Node";
import { t, useLang } from "@/lib/i18n";
import { Field, Section, Tile } from "./ui";

/* The palette lists every part by what it is for, under the names it has in the docs where it has any. */
const CATEGORY_ICON: Record<PartCategory, string> = {
  Actions: "touch_app",
  "Text inputs": "text_fields",
  Selection: "toggle_on",
  Navigation: "explore",
  Overlays: "web_asset",
  Feedback: "campaign",
  Layout: "dashboard",
  Data: "bar_chart",
  Media: "image",
  Chat: "forum",
  Game: "sports_esports",
  "Ant Design": "widgets",
};

const CATEGORY_TEXT = {
  ja: { Actions: "操作", "Text inputs": "テキスト入力", Selection: "選択", Navigation: "ナビゲーション", Overlays: "オーバーレイ", Feedback: "フィードバック", Layout: "レイアウト", Data: "リストとデータ", Media: "メディアと図形", Chat: "チャット", Game: "ゲーム", "Ant Design": "Ant Design" },
  zh: { Actions: "操作", "Text inputs": "文本输入", Selection: "选择", Navigation: "导航", Overlays: "弹出层", Feedback: "反馈", Layout: "布局容器", Data: "列表与数据", Media: "媒体与图形", Chat: "聊天", Game: "游戏", "Ant Design": "Ant Design" },
  ko: { Actions: "동작", "Text inputs": "텍스트 입력", Selection: "선택", Navigation: "내비게이션", Overlays: "오버레이", Feedback: "피드백", Layout: "레이아웃", Data: "목록과 데이터", Media: "미디어와 도형", Chat: "채팅", Game: "게임", "Ant Design": "Ant Design" },
} satisfies Record<string, Record<PartCategory, string>>;

/* another design system's versions of what the sections above already have: there when wanted */
const FOLDED: PartCategory[] = ["Ant Design"];

export function PartsPalette({
  palette: p,
  favorites,
  onToggleFavorite,
  onPartPointerDown,
  onPartActivate,
}: {
  palette: Palette;
  /** the slugs of the starred parts */
  favorites: string[];
  onToggleFavorite: (slug: string) => void;
  onPartPointerDown: (e: React.PointerEvent, slug: string) => void;
  /** a tile chosen with the keyboard or a screen reader adds its part without a drag */
  onPartActivate: (slug: string) => void;
}) {
  const lang = useLang();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return PARTS;
    return PARTS.filter((d) => d.name.toLowerCase().includes(s) || nameOf(d, lang).toLowerCase().includes(s) || d.slug.includes(s));
  }, [q, lang]);

  const tile = (slug: string) => {
    const d = partBySlug(slug);
    if (!d) return null;
    return (
      <Tile
        key={slug}
        icon={d.icon}
        label={nameOf(d, lang)}
        p={p}
        onPointerDown={(e) => onPartPointerDown(e, slug)}
        onClick={() => onPartActivate(slug)}
        starred={favorites.includes(slug)}
        onStar={() => onToggleFavorite(slug)}
      />
    );
  };

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))",
    gap: 6,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "12px 12px 8px" }}>
        <Field value={q} onChange={setQ} placeholder={t("search", lang)} p={p} icon="search" height={40} />
      </div>

      <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0 8px" }}>
        {!q && favorites.length > 0 && (
          <Section id="fav" icon="star" title={t("favorites", lang)} p={p}>
            <div style={grid}>{favorites.map(tile)}</div>
          </Section>
        )}
        {q ? (
          <div style={{ ...grid, padding: "4px 4px 12px" }}>
            {filtered.map((d) => tile(d.slug))}
            {filtered.length === 0 && (
              <div role="status" style={{ gridColumn: "1 / -1", color: p.outline, fontSize: 13, padding: 12, textAlign: "center", display: "grid", placeItems: "center", gap: 6 }}>
                <Icon name="search_off" size={28} />
                <span>{t("noMatch", lang)}</span>
              </div>
            )}
          </div>
        ) : (
          CATEGORIES.map((c) => {
            const inCategory = PARTS.filter((d) => d.category === c);
            if (inCategory.length === 0) return null;
            return (
              <Section key={c} id={`cat:${c}`} icon={CATEGORY_ICON[c]} title={lang === "en" ? c : CATEGORY_TEXT[lang][c]} p={p} defaultOpen={!FOLDED.includes(c)}>
                <div style={grid}>{inCategory.map((d) => tile(d.slug))}</div>
              </Section>
            );
          })
        )}
      </div>

    </div>
  );
}
