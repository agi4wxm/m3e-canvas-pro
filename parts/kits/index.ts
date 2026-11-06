import { ai } from "./ai";
import { assistantKits } from "./assistant";
import { navigationKits } from "./navigation";
import { rowKits } from "./rows";
import { panelKits } from "./panels";
import { fieldKits } from "./fields";
import { overlayKits } from "./overlays";
import { commerceKits } from "./commerce";
import { socialKits } from "./social";
import { playKits } from "./play";
import { mediaKits } from "./media";
import { barKits } from "./bars";
import { cardKits } from "./cards";
import { formKits } from "./forms";
import { gameKits } from "./game";
import { listKits } from "./lists";
import { searchKits } from "./search";
import type { KitDef, KitLook, KitVariant } from "./types";

export { MATERIAL_LOOK, isWide, type KitDef, type KitLook, type KitVariant } from "./types";

/* Every kit, by the section it is shown in. A kit's slug is its own, apart from every part's: a
 * favorite of the palette keeps it as `kit:<slug>`. */

export const KITS: KitDef[] = [...ai, ...assistantKits, ...searchKits, ...barKits, ...navigationKits, ...listKits, ...rowKits, ...cardKits, ...panelKits, ...formKits, ...fieldKits, ...overlayKits, ...commerceKits, ...socialKits, ...gameKits, ...playKits, ...mediaKits];

const BY_SLUG = new Map(KITS.map((k) => [k.slug, k]));
export const kitBySlug = (slug: string | undefined): KitDef | undefined => (slug ? BY_SLUG.get(slug) : undefined);

/** the key a favorite or a palette entry stores a kit under, beside parts' bare slugs */
export const KIT_PREFIX = "kit:";
export const kitKey = (slug: string) => `${KIT_PREFIX}${slug}`;
export const kitOfKey = (key: string): KitDef | undefined => (key.startsWith(KIT_PREFIX) ? kitBySlug(key.slice(KIT_PREFIX.length)) : undefined);

/** The variant a kit is added as: the one asked for by key, else the first that suits the look,
 *  else its first. */
export function pickVariant(kit: KitDef, look: KitLook, key?: string): KitVariant {
  return (key && kit.variants.find((v) => v.key === key)) || kit.variants.find((v) => v.suits?.(look)) || kit.variants[0];
}

/** One line per kit for public/agent.md: what it is built of, so an agent can compose the same with boxes. */
export const kitCatalog = (): string =>
  KITS.map((k) => `- \`${k.slug}\` (${k.category}): ${k.name}, ${k.about}. Variants: ${k.variants.map((v) => `\`${v.key}\` (${v.name.toLowerCase()})`).join("; ")}.`).join("\n");
