/* The pictures a request to the agent carries (a screenshot to copy): pasted, dropped or picked, shown small with a
 * way to take each off. Shared by the chat panel and the Cmd/Ctrl+K bar; small, so the bar can stay in the editor's
 * own bundle while the panel loads with its tab. */

import { useState } from "react";
import type { Palette } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { pictureOf, picturesIn, type PickedImage } from "@/src/editor/attachImage";
import { Icon } from "./Icon";

/** the pictures waiting to go with the next request, each with a way to take it off */
export function AttachedPictures({ pictures, onRemove, p }: { pictures: PickedImage[]; onRemove: (i: number) => void; p: Palette }) {
  const lang = useLang();
  if (!pictures.length) return null;
  return (
    <div data-agent-pictures style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
      {pictures.map((pic, i) => (
        <div key={i} style={{ position: "relative" }}>
          <img src={pic.dataUrl} alt={pic.name} title={`${pic.name} · ${pic.w}×${pic.h}`} style={{ height: 56, maxWidth: 96, objectFit: "cover", borderRadius: 8, border: `1px solid ${p.outlineVariant}`, display: "block" }} />
          <button type="button" aria-label={t("agentRemovePicture", lang)} title={t("agentRemovePicture", lang)} onClick={() => onRemove(i)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: "none", background: p.inverseSurface, color: p.inverseOnSurface, display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** pictures pasted, dropped or picked: what the chat panel and the prompt bar both take */
export function usePictures(onError: () => void) {
  const [pictures, setPictures] = useState<PickedImage[]>([]);
  const add = (list: PickedImage[]) => list.length && setPictures((now) => [...now, ...list].slice(0, 4));
  const fromFiles = async (files: FileList | DataTransferItemList | null | undefined) => {
    const got = await picturesIn(files).catch(() => []);
    if (!got.length && files && files.length) onError();
    add(got);
    return got.length;
  };
  return {
    pictures,
    clear: () => setPictures([]),
    remove: (i: number) => setPictures((now) => now.filter((_, j) => j !== i)),
    /** a paste with a picture in it attaches the picture instead of pasting its name */
    onPaste: (e: React.ClipboardEvent) => {
      if (![...e.clipboardData.items].some((it) => it.kind === "file" && it.type.startsWith("image/"))) return;
      e.preventDefault();
      void fromFiles(e.clipboardData.items);
    },
    fromFiles,
    pick: async (file: File) => {
      const pic = await pictureOf(file).catch(() => null);
      if (pic) add([pic]);
      else onError();
    },
  };
}
