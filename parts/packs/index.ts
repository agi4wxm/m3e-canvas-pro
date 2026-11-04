import type { PartDef } from "../types";
import { antd } from "./antd";
import { basic } from "./basic";
import { dashboard } from "./dashboard";
import { desktop } from "./desktop";
import { game } from "./game";
import { ios } from "./ios";
import { layout } from "./layout";
import { media } from "./media";
import type { PackSource, PartPack } from "./types";

/* Every pack, in palette order. This list is the one place a pack is registered: the registry, the
 * palette, the printed code, project files and the loading of its components all read from it. */
export const PACKS: PartPack[] = [basic, layout, media, dashboard, desktop, game, ios, antd];

export const PACK_DEFS: PartDef[] = PACKS.flatMap((p) => p.defs);
export const PACK_SOURCES: Record<string, PackSource> = Object.assign({}, ...PACKS.map((p) => p.sources));

/** the pack a slug belongs to, by its namespace; core parts have none */
export const packOfSlug = (slug: string | undefined) => {
  const id = slug?.includes("/") ? slug.split("/")[0] : undefined;
  return id ? PACKS.find((p) => p.id === id) : undefined;
};
