/* Every operation of the document core, by family, and the list the tools are made from. */

import type { Op } from "../op";
import * as document from "./document";
import * as screens from "./screens";
import * as nodes from "./nodes";
import * as layout from "./layout";
import * as components from "./components";
import * as data from "./data";
import * as tree from "./tree";
import * as styles from "./styles";
import * as icons from "./icons";
import * as api from "./api";
import * as mocks from "./mocks";
import * as bindings from "./bindings";
import * as capabilities from "./capabilities";
import * as materials from "./materials";
import * as splits from "./split";
import * as rows from "./rows";
import * as focus from "./focus";
import { editComponentOp } from "./definition";

export { document, screens, nodes, layout, components, data, tree, styles, icons, api, mocks, bindings, capabilities, splits, rows, materials, focus };
export * from "./document";
export * from "./screens";
export * from "./nodes";
export * from "./layout";
export * from "./components";
export * from "./data";
export * from "./tree";
export * from "./styles";
export * from "./icons";
export * from "./api";
export * from "./mocks";
export * from "./bindings";
export * from "./capabilities";
export * from "./materials";
export * from "./split";
export * from "./rows";
export * from "./focus";
export { DEFINITION_OPS, definitionOpened } from "./definition";
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
  document.setStyles,
  styles.addCustomStyle,
  icons.setIcon,
  icons.removeIcon,
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
  screens.setFlowStart,
  nodes.addPart,
  nodes.addInstance,
  nodes.addKit,
  tree.addTree,
  nodes.removeNodes,
  nodes.duplicateNodes,
  nodes.setItem,
  nodes.setProps,
  rows.setRows,
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
  layout.alignToParent,
  layout.distribute,
  layout.autoLayout,
  layout.autoLayoutScreen,
  layout.split,
  layout.splitRetired,
  splits.setSplit,
  splits.convertToSplitView,
  layout.placeInScreen,
  layout.combine,
  layout.relayout,
  components.makeComponentOp,
  components.renameComponent,
  components.removeComponentOp,
  components.detach,
  components.setOverrides,
  components.addVariant,
  components.updateComponentSet,
  components.setVariantValues,
  components.swapInstance,
  components.setComponentProp,
  components.removeComponentProp,
  components.setInstanceProps,
  components.resetOverrides,
  /* runs the operations on parts inside a definition: it finds them by name when it runs, so it can be in this list */
  editComponentOp((name) => opByName(name)),
  data.addCollection,
  data.updateCollection,
  data.removeCollection,
  data.setRepeat,
  data.addVar,
  data.updateVar,
  data.removeVar,
  data.addVarCollection,
  data.updateVarCollection,
  data.removeVarCollection,
  data.setVarMode,
  data.setAction,
  focus.setFocus,
  data.bindProp,
  data.reorderPanes,
  api.addModel,
  api.updateModel,
  api.renameModel,
  api.removeModel,
  api.addEndpoint,
  api.updateEndpoint,
  api.removeEndpoint,
  api.setAuth,
  api.addChannel,
  api.updateChannel,
  api.removeChannel,
  api.setServers,
  api.setApiInfo,
  api.importOpenApi,
  api.importAsyncApi,
  mocks.setMocks,
  mocks.setMockModel,
  mocks.pinMockRecords,
  mocks.unpinMockRecords,
  mocks.addMockScenario,
  mocks.updateMockScenario,
  mocks.removeMockScenario,
  mocks.addMockFile,
  mocks.generateMockFiles,
  mocks.updateMockFile,
  mocks.removeMockFile,
  mocks.setMockRealtime,
  mocks.removeMockRealtime,
  mocks.setMockAuth,
  mocks.setMockRoute,
  mocks.fillMocksOp,
  mocks.clearMocks,
  capabilities.setMockCapability,
  capabilities.declareCapability,
  capabilities.removeCapability,
  capabilities.useCapabilities,
  bindings.addDataSource,
  bindings.updateDataSource,
  bindings.removeDataSource,
  bindings.setSubscription,
  bindings.removeSubscription,
  bindings.setScreenParams,
  bindings.renameScreenParam,
  bindings.setScreenAuth,
  bindings.bindExpression,
  bindings.setRegion,
  bindings.removeRegion,
  bindings.setForm,
  bindings.makeForm,
  bindings.bindField,
  bindings.wireScreen,
] as unknown as Op<never, unknown>[];

/** an operation by its name */
export const opByName = (name: string): Op<never, unknown> | undefined => OPS.find((o) => o.name === name);
