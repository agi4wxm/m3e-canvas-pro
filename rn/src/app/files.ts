//! Copied as it is (lib/export/copy.ts) into apps/mobile/src/generated/files.ts of every product with a mobile app (lib/export/targets/mobile.ts):
//! the mobile app's own code, typechecked and linted with the kit (rn/types/app.d.ts stands in for the Expo packages
//! the kit does not install). Written in the product's style (Prettier, no semicolons); the lines starting with //!
//! are the editor's only.
import * as DocumentPicker from "expo-document-picker"
import * as ImagePicker from "expo-image-picker"
import { runtime } from "./runtime"
import type { PickedFile } from "./transport"

/** a file's bytes as a data URL: what the mocks read, and what the web sends */
async function dataUrlOf(uri: string): Promise<{ dataUrl: string; size: number }> {
  const blob = await (await fetch(uri)).blob()
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read"))
    reader.readAsDataURL(blob)
  })
  return { dataUrl, size: blob.size }
}

/** a file a capability adapter picked (file.pick): its name, type, size and where it is */
type Picked = { name?: string; type?: string; size?: number; url?: string }

/** Asks for a file through the capability registry (file.pick: the app's adapter, else the platform's), else the way a
 *  phone does: its photos for pictures (the field accepts images only), its files for anything else. Nothing when the
 *  person changes their mind. */
export async function pickFile(accept: string): Promise<PickedFile | undefined> {
  const asked = await runtime.invoke("file.pick", { accept })
  if (asked.ok) {
    const f = (asked.result as { files?: Picked[] } | undefined)?.files?.[0]
    if (!f?.url) return undefined
    const { dataUrl, size } = await dataUrlOf(f.url)
    return { name: f.name ?? "file", type: f.type ?? "application/octet-stream", size: f.size ?? size, dataUrl, uri: f.url }
  }
  if (asked.dropped || asked.error.type !== "not-implemented") return undefined
  const kinds = accept
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const images = kinds.length > 0 && kinds.every((k) => /^image\//.test(k) || /^\.(png|jpe?g|gif|webp|heic)$/i.test(k))
  if (images) {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 })
    const a = picked.canceled ? undefined : picked.assets[0]
    if (!a) return undefined
    const { dataUrl, size } = await dataUrlOf(a.uri)
    return { name: a.fileName ?? "image.jpg", type: a.mimeType ?? "image/jpeg", size: a.fileSize ?? size, dataUrl, uri: a.uri }
  }
  const picked = await DocumentPicker.getDocumentAsync({ type: kinds.filter((k) => k.includes("/")).length ? kinds.filter((k) => k.includes("/")) : "*/*", copyToCacheDirectory: true })
  const a = picked.canceled ? undefined : picked.assets[0]
  if (!a) return undefined
  const { dataUrl, size } = await dataUrlOf(a.uri)
  return { name: a.name, type: a.mimeType ?? "application/octet-stream", size: a.size ?? size, dataUrl, uri: a.uri }
}

/** the names of the files a field holds, for its upload panel */
export function fileName(v: unknown): string {
  const names = (Array.isArray(v) ? v : [v]).flatMap((f) => (f && typeof f === "object" && typeof (f as PickedFile).name === "string" ? [(f as PickedFile).name] : []))
  return names.join(", ")
}
