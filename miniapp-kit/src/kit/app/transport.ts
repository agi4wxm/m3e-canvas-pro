import Taro from "@tarojs/taro";
import type { TokenStorage, Transport, TransportRequest, TransportResponse } from "@m3e/app-runtime";

/* The platform's pieces the shared runtime is handed in a mini-program: a transport over Taro.request (Taro.uploadFile
 * for a body that carries a file, which reports how far it has gone), the session's tokens kept with Taro's storage,
 * and a file the platform handed over read as a data URL (for the mocks, which answer without a network). The same
 * `Transport` shape as packages/api's: the typed client runs over it unchanged. */

export type TaroTransportOptions = {
  /** where the API is: "https://api.example.com/v1" (a mini-program asks only https addresses its admin allowed) */
  baseUrl: string;
  /** headers every call sends */
  headers?: Readonly<Record<string, string>>;
  /** how long a call may take, in ms */
  timeout?: number;
};

/** a file as the platform hands one over (Taro.chooseImage, chooseMessageFile): a temporary path */
export type PlatformFile = { path: string; name?: string; type?: string; size?: number };

const isPlatformFile = (v: unknown): v is PlatformFile => !!v && typeof v === "object" && typeof (v as { path?: unknown }).path === "string" && typeof (v as { dataUrl?: unknown }).dataUrl !== "string";

/** a file as the contract's client carries one: its bytes as a data URL (TransportFile) */
type DataFile = { name: string; type: string; dataUrl: string; size?: number };
const isDataFile = (v: unknown): v is DataFile => !!v && typeof v === "object" && typeof (v as { dataUrl?: unknown }).dataUrl === "string" && (v as { dataUrl: string }).dataUrl.startsWith("data:");
const isFile = (v: unknown) => isPlatformFile(v) || isDataFile(v);

let written = 0;

/** A data URL's bytes as a file the platform can upload: a temporary file in a mini-program, a blob's address on the
 *  web (Taro.uploadFile reads either). */
async function platformFileOf(f: DataFile): Promise<PlatformFile> {
  if (process.env.TARO_ENV === "h5") {
    const blob = await (await fetch(f.dataUrl)).blob();
    return { path: URL.createObjectURL(blob), name: f.name, type: f.type, size: blob.size };
  }
  const path = `${Taro.env.USER_DATA_PATH}/m3e-upload-${Date.now()}-${written++}-${f.name.replace(/[^\w.-]/g, "_")}`;
  const data = f.dataUrl.slice(f.dataUrl.indexOf(",") + 1);
  await new Promise<void>((resolve, reject) => Taro.getFileSystemManager().writeFile({ filePath: path, data, encoding: "base64", success: () => resolve(), fail: reject }));
  return { path, name: f.name, type: f.type, size: f.size };
}

/** the query as a URL's search string: keys in the order given, a list as the key again for each element */
export function queryString(query: TransportRequest["query"]): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    for (const one of Array.isArray(value) ? value : [value]) if (one !== undefined && one !== null) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(one))}`);
  }
  return parts.join("&");
}

/** a header set with every name in lower case */
const lower = (h: Record<string, unknown> | undefined): Record<string, string> => Object.fromEntries(Object.entries(h ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));

/** an answer's words read as the content type says: JSON parsed, else the words, else nothing */
function bodyOf(data: unknown, headers: Record<string, string>): unknown {
  if (data === undefined || data === null || data === "") return undefined;
  if (typeof data !== "string") return data;
  if (/json/i.test(headers["content-type"] ?? "")) {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}

/** the file fields of a body and the rest, as Taro.uploadFile takes them (form fields are words) */
async function splitFiles(body: unknown): Promise<{ files: [string, PlatformFile][]; rest: Record<string, string> } | null> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const files: [string, PlatformFile][] = [];
  const rest: Record<string, string> = {};
  const one = (v: unknown): Promise<PlatformFile> => (isDataFile(v) ? platformFileOf(v) : Promise.resolve(v as PlatformFile));
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (isFile(v)) files.push([k, await one(v)]);
    else if (Array.isArray(v) && v.length && v.every(isFile)) files.push([k, await one(v[0])]);
    else if (v !== undefined && v !== null) rest[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return files.length ? { files, rest } : null;
}

/** A transport over Taro.request: JSON goes out as JSON; a body with a file goes as a multipart upload (one file a
 *  call: the platform's limit), its progress told to `onUploadProgress`. A call cannot be stopped half way here: the
 *  runtime drops an answer nobody waits for any more. */
export function createTaroTransport(o: TaroTransportOptions): Transport {
  const base = o.baseUrl.replace(/\/$/, "");
  return {
    async request(r: TransportRequest): Promise<TransportResponse> {
      const search = queryString(r.query);
      const url = `${base}${r.path}${search ? `?${search}` : ""}`;
      const header: Record<string, string> = { accept: "application/json", ...o.headers, ...r.headers };
      const upload = await splitFiles(r.body);
      if (upload) {
        const [name, file] = upload.files[0];
        /* the platform writes the multipart body and its boundary: a content type of the caller's would lose it */
        const own = Object.fromEntries(Object.entries(header).filter(([k]) => k.toLowerCase() !== "content-type"));
        const task = Taro.uploadFile({ url, filePath: file.path, name, header: own, formData: upload.rest, timeout: o.timeout, ...(file.name ? { fileName: file.name } : {}) });
        if (r.onUploadProgress) task.progress((p) => r.onUploadProgress?.(p.totalBytesSent, p.totalBytesExpectedToSend));
        const res = await task;
        const headers = lower((res as { header?: Record<string, unknown> }).header);
        return { status: res.statusCode, headers, body: bodyOf(res.data, { "content-type": headers["content-type"] ?? "application/json", ...headers }) };
      }
      const json = r.body !== undefined;
      if (json) header["content-type"] = header["content-type"] ?? "application/json";
      const res = await Taro.request({
        url,
        method: r.method as "GET",
        header,
        data: json ? JSON.stringify(r.body) : undefined,
        dataType: "text",
        responseType: "text",
        timeout: o.timeout ?? 30000,
      });
      const headers = lower(res.header as Record<string, unknown>);
      return { status: res.statusCode, headers, body: bodyOf(res.data, headers) };
    },
  };
}

/** the session's tokens kept with Taro's storage (wx.setStorage, tt.setStorage, the web's localStorage) */
export const taroStorage: TokenStorage = {
  get: (key) => Taro.getStorage<string>({ key }).then((r) => (typeof r.data === "string" ? r.data : null)).catch(() => null),
  set: (key, value) => Taro.setStorage({ key, data: value }).then(() => {}),
  remove: (key) => Taro.removeStorage({ key }).then(() => {}).catch(() => {}),
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < b.length ? B64[n & 63] : "=");
  }
  return out;
}

/** A file the platform handed over, as the mocks take one: its bytes as a data URL, with its name and type. */
export async function readAsDataUrl(file: PlatformFile): Promise<{ name: string; type: string; dataUrl: string; size?: number }> {
  const type = file.type || "application/octet-stream";
  const name = file.name || file.path.split("/").pop() || "file";
  let base64: string;
  if (process.env.TARO_ENV === "h5") {
    const res = await fetch(file.path);
    base64 = bytesToBase64(new Uint8Array(await res.arrayBuffer()));
  } else {
    base64 = await new Promise<string>((resolve, reject) =>
      Taro.getFileSystemManager().readFile({ filePath: file.path, encoding: "base64", success: (r) => resolve(String(r.data)), fail: reject }),
    );
  }
  return { name, type, dataUrl: `data:${type};base64,${base64}`, ...(file.size !== undefined ? { size: file.size } : {}) };
}

/** A transport that first reads the files a body carries into data URLs (what the mocks take), then hands it on. */
export function withFileData(inner: Transport): Transport {
  return {
    async request(r) {
      if (!r.body || typeof r.body !== "object" || Array.isArray(r.body)) return inner.request(r);
      const body: Record<string, unknown> = { ...(r.body as Record<string, unknown>) };
      let changed = false;
      for (const [k, v] of Object.entries(body)) {
        if (isPlatformFile(v)) {
          body[k] = await readAsDataUrl(v);
          changed = true;
        } else if (Array.isArray(v) && v.some(isPlatformFile)) {
          body[k] = await Promise.all(v.map((x) => (isPlatformFile(x) ? readAsDataUrl(x) : x)));
          changed = true;
        }
      }
      if (changed && r.onUploadProgress) r.onUploadProgress(1, 1);
      return inner.request(changed ? { ...r, body } : r);
    },
  };
}
