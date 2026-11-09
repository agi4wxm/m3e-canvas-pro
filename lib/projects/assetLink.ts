/* The asset manifest of a project bound to a folder (lib/projects/fileLink.ts), read from that folder and read again
 * whenever it or one of the files it lists changes: the pipeline writes a new manifest, or swaps a picture under the
 * same name, and every part naming that asset is drawn anew (lib/assetCatalog.ts). Where the manifest is, inside the
 * folder, is the project's configuration (`Doc.external.assetManifest`, `asset-manifest.json` by default).
 *
 * Only read: the editor never writes into what the pipeline owns. A project bound to a single file has no folder to
 * look in, and so no manifest. */

import { assetCatalogChanged, dataUrlOf, loadAssetCatalog, type AssetCatalog, type AssetReader } from "../assetCatalog";
import { ASSET_PATH } from "../assetManifest";
import type { DirHandle, FileHandle } from "./fileLink";

/** how often the folder is looked at for a changed manifest or file */
export const ASSET_POLL_MS = 2000;

/** the file at a path inside a folder (`/`-separated), or null when there is none */
async function fileAt(dir: DirHandle, path: string): Promise<File | null> {
  if (!ASSET_PATH.test(path)) return null;
  const names = path.split("/");
  try {
    let at = dir;
    for (const name of names.slice(0, -1)) at = await at.getDirectoryHandle(name);
    return await ((await at.getFileHandle(names[names.length - 1])) as FileHandle).getFile();
  } catch {
    return null;
  }
}

/** a folder the File System Access API gave, as the catalog reads it */
export function folderReader(dir: DirHandle): AssetReader {
  return {
    async read(path) {
      const f = await fileAt(dir, path);
      return f ? new Uint8Array(await f.arrayBuffer()) : null;
    },
    async stamp(path) {
      const f = await fileAt(dir, path);
      return f ? `${f.size}:${f.lastModified}` : null;
    },
  };
}

/** pictures as data URLs (a screenshot draws them), clips and the rest as blob: URLs (a data URL of a clip is large) */
function urlMaker(made: string[]) {
  return (bytes: Uint8Array, mime: string, type: string) => {
    if (type === "image" || type === "icon" || typeof URL.createObjectURL !== "function") return dataUrlOf(bytes, mime);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime || "application/octet-stream" }));
    made.push(url);
    return url;
  };
}

/** Keeps the catalog of a folder's manifest up to date: read now, and again whenever what it reads changed. */
export class AssetWatch {
  private timer: ReturnType<typeof setInterval> | null = null;
  private catalog: AssetCatalog | null = null;
  private path: string;
  private busy = false;
  private closed = false;
  /** the blob: URLs of the catalog shown now, let go once another takes its place */
  private urls: string[] = [];

  constructor(
    private readonly reader: AssetReader,
    path: string,
    private readonly onCatalog: (c: AssetCatalog) => void,
    private readonly pollMs = ASSET_POLL_MS,
  ) {
    this.path = path;
  }

  /** reads the manifest now, then looks again every `pollMs` */
  start(): Promise<void> {
    if (!this.timer && this.pollMs > 0) this.timer = setInterval(() => void this.check(), this.pollMs);
    return this.load();
  }

  /** the project's configuration names another place: it is read from there */
  setPath(path: string): Promise<void> {
    if (path === this.path) return Promise.resolve();
    this.path = path;
    return this.load();
  }

  /** looks whether the manifest or a file it lists changed, and reads it again if so */
  async check(): Promise<void> {
    if (this.busy || this.closed) return;
    if (this.catalog && !(await assetCatalogChanged(this.reader, this.catalog).catch(() => false))) return;
    await this.load();
  }

  private async load(): Promise<void> {
    if (this.closed) return;
    this.busy = true;
    try {
      const made: string[] = [];
      const next = await loadAssetCatalog(this.reader, this.path, { url: urlMaker(made) });
      if (this.closed) {
        made.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      const old = this.urls;
      this.catalog = next;
      this.urls = made;
      this.onCatalog(next);
      old.forEach((u) => URL.revokeObjectURL(u));
    } finally {
      this.busy = false;
    }
  }

  /** stops looking; the catalog's blob: URLs are let go */
  close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
  }
}
