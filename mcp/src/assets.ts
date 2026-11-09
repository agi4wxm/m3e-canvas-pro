/* The asset manifest beside a project on disk (lib/assetCatalog.ts), for the file backend: read from inside the
 * project's folder only, the way its pictures are (inside.ts: no link followed, nothing outside it), and read again
 * whenever the manifest or one of its files changed. What it holds is what `asset:<id>` draws in a screenshot, what
 * the tools check an asset against, and what an export's lookup is made from. */

import { assetCatalogChanged, assetManifestPathOf, loadAssetCatalog, setAssetCatalog, type AssetCatalog, type AssetReader } from "../../lib/assetCatalog";
import type { Doc } from "../../lib/tokens";
import { Folder } from "./inside";

/** a folder on disk as the catalog reads it, nothing outside it */
export function diskReader(dir: string): AssetReader {
  const folder = new Folder(dir);
  return {
    read: (path) => folder.read(path).catch(() => null),
    async stamp(path) {
      const st = await folder.stat(path).catch(() => null);
      return st?.isFile() ? `${st.size}:${st.mtimeMs}` : null;
    },
  };
}

/** Keeps the catalog of the manifest beside a project up to date, and in reach (`setAssetCatalog`). */
export class DiskAssets {
  catalog: AssetCatalog | null = null;
  private reader: AssetReader | null = null;
  private dir = "";

  /** the catalog for the document in `dir`, read again when its place or what it reads changed */
  async refresh(dir: string, doc: Pick<Doc, "external"> | null): Promise<AssetCatalog> {
    if (dir !== this.dir || !this.reader) {
      this.dir = dir;
      this.reader = diskReader(dir);
      this.catalog = null;
    }
    const path = assetManifestPathOf(doc);
    if (!this.catalog || this.catalog.path !== path || (await assetCatalogChanged(this.reader, this.catalog))) this.catalog = await loadAssetCatalog(this.reader, path);
    setAssetCatalog(this.catalog);
    return this.catalog;
  }
}
