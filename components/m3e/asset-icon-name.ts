/** An asset of the asset pipeline's (`asset:<id>`, lib/assetRefs.ts) drawn as an icon is registered under this Iconify
 *  collection, by whoever holds the manifest (the editor, an exported app's lookup). */
export const ASSET_SET = "m3e-asset"

/** the name an asset's id is registered under: Iconify takes lowercase letters and digits, so each character of the
 *  id (letters, digits, - _ . /) is written as two hex digits, which keeps every id apart */
export function assetIconName(id: string) {
  let out = "a"
  for (let i = 0; i < id.length; i++) out += id.charCodeAt(i).toString(16).padStart(2, "0")
  return out
}
