/* The notice over the canvas of a design that still holds retired parts (parts/defs/retired.ts): how many, which,
 * that they look as they did, and "Split into atoms", which splits them all in one undoable step (`split_retired`); a
 * retired resizable converts to a split view in the same step, and a design holding only those is offered
 * "Convert to split view". "Not now" puts it away for this design until the page is opened again. Nothing is split
 * without the author. */

import { useMemo, useState } from "react";
import { type Lang } from "@/lib/i18n";
import { retireText } from "@/lib/i18n/retire";
import { nameOf } from "@/parts/labels";
import { retiredParts } from "@/lib/retire";
import type { Group, Palette } from "@/lib/tokens";
import { Icon } from "./Icon";

export function RetiredBanner({ p, lang, groups, design, top, onSplit }: { p: Palette; lang: Lang; groups: Group[]; /** which design this is: "Not now" holds for it */ design: string; top: number; onSplit: () => void }) {
  const found = useMemo(() => retiredParts(groups), [groups]);
  const [later, setLater] = useState<string | null>(null);
  if (!found.length || later === design) return null;
  const names = [...new Set(found.map((r) => nameOf(r.def, lang)))].join(lang === "en" ? ", " : "、");
  /* the parts that convert (a resizable into a split view) rather than split into atoms */
  const converts = found.filter((r) => r.def.retired?.convert).length;
  const only = converts === found.length;
  const body = only ? retireText("noticeConvertOnly", lang).replace("{names}", names) : `${retireText("noticeBody", lang).replace("{names}", names)}${converts ? ` ${retireText("noticeConvert", lang)}` : ""}`;
  return (
    <div
      role="status"
      data-retired-banner={found.length}
      style={{
        position: "absolute",
        top,
        left: "50%",
        transform: "translateX(-50%)",
        width: "max-content",
        maxWidth: "min(560px, calc(100% - 32px))",
        boxSizing: "border-box",
        zIndex: 46,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: 12,
        rowGap: 6,
        padding: "10px 10px 10px 14px",
        borderRadius: 16,
        background: p.surfaceContainerHigh,
        color: p.onSurface,
        boxShadow: "0 4px 16px rgba(0,0,0,0.16), 0 1px 3px rgba(0,0,0,0.12)",
        pointerEvents: "auto",
      }}
    >
      <Icon name="call_split" size={20} color={p.onSurfaceVariant} />
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{retireText("noticeTitle", lang).replace("{n}", String(found.length))}</div>
        <div style={{ fontSize: 12, lineHeight: 1.4, color: p.onSurfaceVariant }}>{body}</div>
      </div>
      <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
        <button type="button" data-retired-later className="m3-press" onClick={() => setLater(design)} style={{ height: 36, padding: "0 12px", borderRadius: 18, border: "none", background: "transparent", color: p.primary, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          {retireText("noticeLater", lang)}
        </button>
        <button type="button" data-retired-split className="m3-press" onClick={onSplit} style={{ height: 36, padding: "0 14px", borderRadius: 18, border: "none", background: p.primary, color: p.onPrimary, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          {retireText(only ? "noticeConvertButton" : "noticeSplit", lang)}
        </button>
      </div>
    </div>
  );
}
