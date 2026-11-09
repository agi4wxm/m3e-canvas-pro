/* The asset pipeline's pictures and icons registered for drawing as icons (`asset:<id>` where a part takes an icon),
 * whenever the catalog of the open project changes (lib/assetCatalog.ts): the editor and the render page import this
 * once, and parts/icons.ts draws again the trees that name an asset whose picture changed. */

import { assetCatalog, assetIconSet, subscribeAssetCatalog } from "@/lib/assetCatalog";
import { registerAssetIcons } from "@/parts/icons";

let started = false;

export function syncAssetIcons() {
  if (started) return;
  started = true;
  const sync = () => {
    const { drawn, set } = assetIconSet(assetCatalog());
    registerAssetIcons(drawn, Object.keys(set.icons).length ? set : null);
  };
  subscribeAssetCatalog(sync);
  sync();
}
