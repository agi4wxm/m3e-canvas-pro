/* A generated picture is megabytes of text, and the browser gives a saved document about five. So what is
 * written to localStorage carries a short reference, and the picture waits in IndexedDB. In memory the
 * document stays whole: a file saved, a project exported or a preview opened sees the picture itself. */

const PREFIX = "m3e-asset:";
/** smaller pictures cost little and travel fine with the document */
const LARGE = 50_000;
const DB = "m3e-assets";
const STORE = "assets";

/* a picture, or a file of the mock library (a PDF, a sound, a clip) */
const isLarge = (s: string) => s.length >= LARGE && /^data:(?:image|audio|video|application)\//.test(s);
export const isAssetRef = (s: unknown): s is string => typeof s === "string" && s.startsWith(PREFIX);

/** the same picture always gets the same name */
function nameOf(data: string): string {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761);
    b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return `${PREFIX}${(b >>> 0).toString(36)}${(a >>> 0).toString(36)}-${data.length}`;
}

function mapStrings<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === "string") return fn(value) as T;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const next = mapStrings(v, fn);
      if (next !== v) changed = true;
      return next;
    });
    return (changed ? out : value) as T;
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const next = mapStrings(v, fn);
      if (next !== v) changed = true;
      out[k] = next;
    }
    return (changed ? out : value) as T;
  }
  return value;
}

/** the document to write down, and the large pictures taken out of it */
export function stripAssets<T>(doc: T): { doc: T; found: Map<string, string> } {
  const found = new Map<string, string>();
  const light = mapStrings(doc, (s) => {
    if (!isLarge(s)) return s;
    const name = nameOf(s);
    found.set(name, s);
    return name;
  });
  return { doc: light, found };
}

/** the references a document holds */
export function assetRefsIn(doc: unknown): Set<string> {
  const refs = new Set<string>();
  mapStrings(doc, (s) => {
    if (isAssetRef(s)) refs.add(s);
    return s;
  });
  return refs;
}

/** the document with its pictures back. One that is gone (site data cleared) leaves an empty picture, not a broken one. */
export function restoreAssets<T>(doc: T, assets: Map<string, string>): T {
  return mapStrings(doc, (s) => (isAssetRef(s) ? (assets.get(s) ?? "") : s));
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

const stored = new Set<string>();

/** keeps the pictures not yet kept. It reports how it went: until then the reference points at nothing. */
export async function putAssets(found: Map<string, string>): Promise<void> {
  const fresh = [...found].filter(([name]) => !stored.has(name));
  if (!fresh.length) return;
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  for (const [name, data] of fresh) tx.objectStore(STORE).put(data, name);
  await done(tx);
  db.close();
  for (const [name] of fresh) stored.add(name);
}

export async function getAssets(names: Iterable<string>): Promise<Map<string, string>> {
  const wanted = [...names];
  const out = new Map<string, string>();
  if (!wanted.length) return out;
  const db = await open();
  const store = db.transaction(STORE, "readonly").objectStore(STORE);
  await Promise.all(
    wanted.map(
      (name) =>
        new Promise<void>((resolve) => {
          const req = store.get(name);
          req.onsuccess = () => {
            if (typeof req.result === "string") {
              out.set(name, req.result);
              stored.add(name);
            }
            resolve();
          };
          req.onerror = () => resolve();
        }),
    ),
  );
  db.close();
  return out;
}

/** forgets the pictures nothing refers to any more */
export async function pruneAssets(keep: Set<string>): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const req = store.getAllKeys();
  req.onsuccess = () => {
    for (const key of req.result) if (!keep.has(String(key))) store.delete(key);
  };
  await done(tx);
  db.close();
}
