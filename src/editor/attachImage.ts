/* A picture the author hands the agent (pasted, dropped or picked in the chat panel or the Cmd/Ctrl+K bar), made fit
 * to send: no longer than 2048 px on its long side (a phone screenshot at 3× comes down to about 2× of its dp), as a
 * PNG when it stays small and a JPEG otherwise, with its size said, so the model and the tools that measure it agree
 * on its pixels. */

export type PickedImage = { dataUrl: string; w: number; h: number; name: string };

const MAX_SIDE = 2048;
const PNG_LIMIT = 1_500_000;

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** a file the author gave, as a picture to attach; null for one that is not a picture */
export async function pictureOf(file: File | Blob, name = (file as File).name || "picture"): Promise<PickedImage | null> {
  if (!file.type.startsWith("image/")) return null;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  if (scale === 1 && (file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp") && file.size <= PNG_LIMIT) {
    bmp.close();
    return { dataUrl: await readAsDataUrl(file), w, h, name };
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const png = canvas.toDataURL("image/png");
  return { dataUrl: png.length <= PNG_LIMIT * 1.37 ? png : canvas.toDataURL("image/jpeg", 0.9), w, h, name };
}

/** the pictures among what was pasted or dropped */
export async function picturesIn(items: DataTransferItemList | FileList | null | undefined): Promise<PickedImage[]> {
  if (!items) return [];
  const files: File[] = [];
  for (const it of Array.from(items as ArrayLike<DataTransferItem | File>)) {
    const f = it instanceof File ? it : it.kind === "file" ? it.getAsFile() : null;
    if (f && f.type.startsWith("image/")) files.push(f);
  }
  const out: PickedImage[] = [];
  for (const f of files.slice(0, 4)) {
    const p = await pictureOf(f).catch(() => null);
    if (p) out.push(p);
  }
  return out;
}
