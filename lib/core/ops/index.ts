/* Every operation of the document core, by family, and the list the tools are made from. */

import type { Op } from "../op";
import * as document from "./document";
import * as screens from "./screens";
import * as nodes from "./nodes";
import * as layout from "./layout";
import * as components from "./components";
import * as data from "./data";

export { document, screens, nodes, layout, components, data };
export * from "./document";
export * from "./screens";
export * from "./nodes";
export * from "./layout";
export * from "./components";
export * from "./data";
export { OpError } from "../op";

/** What a model or an MCP client may call, by name. The editor's own gestures (a drop, a paste, a drag of a layer)
 *  are operations too, but they take what only the editor has in hand (a part being carried, a clipboard) and are
 *  left out. */
export const OPS: Op<never, unknown>[] = [
  document.setTitle,
  document.setBrief,
  document.setPrompt,
  document.patchTheme,
  document.applyStyle,
  document.setRules,
  document.patchUx,
  document.setPalette,
  document.setCustomPalette,
  document.setDynamicColor,
  document.setFrameMode,
  document.clearAll,
  screens.addScreen,
  screens.addTemplate,
  screens.patchScreen,
  screens.resizeScreen,
  screens.setPhoneModel,
  screens.setScreenLength,
  screens.removeScreen,
  screens.duplicateScreen,
  screens.createScreenVariant,
  screens.setPlace,
  screens.moveScreen,
  nodes.addPart,
  nodes.addInstance,
  nodes.addKit,
  nodes.removeNodes,
  nodes.duplicateNodes,
  nodes.setItem,
  nodes.setProps,
  nodes.setGroup,
  nodes.toggleLock,
  nodes.nudge,
  nodes.moveNode,
  nodes.moveInto,
  nodes.zOrder,
  nodes.reorderItems,
  nodes.showNodes,
  nodes.groupNodes,
  nodes.ungroup,
  layout.setLayout,
  layout.tidyScreen,
  layout.tidyUp,
  layout.align,
  layout.distribute,
  layout.autoLayout,
  layout.autoLayoutScreen,
  layout.split,
  layout.placeInScreen,
  layout.combine,
  layout.relayout,
  components.makeComponentOp,
  components.renameComponent,
  components.removeComponentOp,
  components.detach,
  components.setOverrides,
  data.addCollection,
  data.updateCollection,
  data.removeCollection,
  data.setRepeat,
  data.addVar,
  data.updateVar,
  data.removeVar,
  data.setAction,
  data.bindProp,
  data.reorderPanes,
] as unknown as Op<never, unknown>[];

/** an operation by its name */
export const opByName = (name: string): Op<never, unknown> | undefined => OPS.find((o) => o.name === name);
