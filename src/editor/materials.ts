/* The document's materials (lib/materials.ts) put on the page for drawing as the document changes: the editor's store
 * calls this on every change, the render page with each document it is given. A material layer names its pictures by
 * CSS variable (lib/materialCss.ts); one stylesheet on the page says what each is, so every part drawn here, on the
 * canvas, in the preview and in the gallery, reads the same pictures without each carrying them in its style. */

import { materialSheet } from "@/lib/materialCss";
import { materialOpacities } from "@/lib/materials";
import type { Doc } from "@/lib/tokens";

const ID = "m3e-materials";
let last: { materials: unknown; groups: unknown; components: unknown; key: string } | null = null;

export function setDocMaterials(doc: Pick<Doc, "materials" | "groups" | "components">) {
  if (typeof document === "undefined") return;
  const materials = doc.materials;
  /* the faded copies a layer under 100% needs are looked for only while there are materials, and only again when the
     parts or the definitions changed */
  if (last && last.materials === materials && (!materials?.length || (last.groups === doc.groups && last.components === doc.components))) return;
  const opacities = materials?.length ? materialOpacities({ groups: doc.groups, components: doc.components }) : new Map<string, Set<number>>();
  const key = [...opacities].map(([id, set]) => `${id}:${[...set].sort().join(",")}`).join(";");
  const same = last && last.materials === materials && last.key === key;
  last = { materials, groups: doc.groups, components: doc.components, key };
  if (same) return;
  let el = document.getElementById(ID) as HTMLStyleElement | null;
  const css = materialSheet(materials, opacities);
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}
