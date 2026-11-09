import { createContext, useContext } from "react";
import type { MaterialDef } from "@/lib/material";

/* The document's library of materials (lib/materials.ts), for the look panel's material layers: what is in it, and the
 * editor's gestures on it. The editor provides it (src/Editor.tsx); a panel drawn outside the editor sees an empty
 * library and offers no import. */

export type MaterialsApi = {
  materials: readonly MaterialDef[];
  /** opens the file picker for a material pack; the editor adds what it holds to the library */
  importPack?: () => void;
  /** takes a material out of the library, after asking when layers still use it */
  remove?: (id: string) => void;
  /** how many layers of the document name a material */
  uses?: (id: string) => number;
};

export const MaterialsContext = createContext<MaterialsApi>({ materials: [] });
export const useMaterials = () => useContext(MaterialsContext);

/** a material as a small picture of its surface, tiled, with its average colour while the picture loads */
export function MaterialThumb({ material, size = 28, radius = 8 }: { material: MaterialDef | undefined; size?: number; radius?: number }) {
  const bg = material ? `url("${material.maps.surface}") 0 0 / ${Math.max(8, Math.round(size / 1.5))}px repeat, ${material.swatch.average}` : "repeating-linear-gradient(45deg, #c8c8c8 0 4px, #ffffff 4px 8px)";
  return <span aria-hidden data-material-thumb={material?.id} style={{ display: "inline-block", flex: "0 0 auto", width: size, height: size, borderRadius: radius, background: bg, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.18)" }} />;
}
