/* The document's library of materials (lib/materials.ts, docs/m3e-material.md): a material pack added to it, a material
 * taken out. Both are the editor's own gestures (a file the author picked, a press in the library), not tools: a model
 * can neither make nor draw a material, only name one the library has in a look (lib/look.ts lookForModel). */

import { importMaterials, materialUseCounts, withoutMaterial } from "../../materials";
import { op, OpError, S } from "../op";
import { withDoc } from "../state";

export const addMaterials = op<{ file: unknown }, { added: { id: string; name: string }[]; skipped: number }>({
  name: "import_materials",
  summary: "Adds the materials of an m3e material pack (.m3e-material.json) to the document's library, after the ones it has; an id taken already is given a free one. The document is not otherwise changed.",
  args: S.obj({ file: S.any("the material pack, as read from its file") }, ["file"]),
  label: () => "Import materials",
  run(s, a) {
    const next = importMaterials(s.doc.materials, a.file);
    if (!next) throw new OpError("invalid_value", "That is no m3e material pack this version reads (format m3e-material, version 1), or nothing in it is a whole material.", "file");
    return { state: withDoc(s, { materials: next.materials }), result: { added: next.added.map((m) => ({ id: m.id, name: m.name })), skipped: next.skipped } };
  },
});

export const removeMaterial = op<{ id: string }, { removed: string; stillUsedBy: number }>({
  name: "remove_material",
  summary: "Takes a material out of the document's library. Layers that still name it (stillUsedBy) draw nothing until a material of that id comes back.",
  args: S.obj({ id: S.str("the material's id") }, ["id"]),
  label: () => "Remove material",
  run(s, a) {
    const have = s.doc.materials ?? [];
    if (!have.some((m) => m.id === a.id)) throw new OpError("not_found", `The document has no material ${a.id}.`, a.id);
    /* the library itself is not walked: a material's fallback look is no layer of the document */
    return { state: withDoc(s, { materials: withoutMaterial(have, a.id) }), result: { removed: a.id, stillUsedBy: materialUseCounts(s.doc).get(a.id) ?? 0 } };
  },
});
