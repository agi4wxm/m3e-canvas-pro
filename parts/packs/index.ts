import type { PartDef } from "../types";
import { antd } from "./antd";
import { basic } from "./basic";
import { dashboard } from "./dashboard";
import { desktop } from "./desktop";
import { game } from "./game";
import { ios } from "./ios";
import { ANT_COMPONENTS, CORE_LEGACY_KINDS, DIALECT_KINDS, dialectOf, type DialectKind } from "./legacy";
import { layout } from "./layout";
import { media } from "./media";
import type { LegacyKind, PackSource, PartPack } from "./types";

/* Every pack, in palette order. This list is the one place a pack is registered: the registry, the
 * palette, the printed code, project files and the loading of its components all read from it. */
export const PACKS: PartPack[] = [basic, layout, media, dashboard, desktop, game, ios, antd];

export const PACK_DEFS: PartDef[] = PACKS.flatMap((p) => p.defs);
export const PACK_CATEGORIES = PACKS.map((p) => p.category);
export const PACK_SOURCES: Record<string, PackSource> = Object.assign({}, ...PACKS.map((p) => p.sources));

/** What a part saved in another fork's words opens as, if anything stands for it. Its dialect comes
 *  first: the same name can mean something else there. */
export const foreignKindOf = (item: Record<string, unknown>): DialectKind | undefined => {
  const kind = String(item.kind);
  /* the Ant Design fork saves one kind for all its parts, and says which in `component` */
  if (kind === "dsComponent") return ANT_COMPONENTS[String(item.component)];
  const dialect = dialectOf(item);
  const said = dialect && DIALECT_KINDS[dialect][kind];
  if (said) return said;
  for (const p of PACKS) if (p.legacyKinds?.[kind]) return p.legacyKinds[kind];
  return CORE_LEGACY_KINDS[kind];
};

export const isDrawnKind = (known: DialectKind): known is LegacyKind => "slug" in known;

/** the pack a slug belongs to, by its namespace; core parts have none */
export const packOfSlug = (slug: string | undefined) => {
  const id = slug?.includes("/") ? slug.split("/")[0] : undefined;
  return id ? PACKS.find((p) => p.id === id) : undefined;
};
