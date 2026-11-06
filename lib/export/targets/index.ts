/* The targets of a product, in the order their workspaces are listed (packages before the apps that use them): the
 * contract and its client (`apiTarget`), the mock library (`mocksTarget`), the runtime the apps share
 * (`appRuntimeTarget`), the web app (`webTarget`), the server and its contract tests, the React Native app
 * (`mobileTarget`, lib/export/targets/mobile.ts) and the Taro mini-program (`miniappTarget`,
 * lib/export/targets/miniapp.ts). Each one is a `ProductTarget` (lib/export/types.ts). */

import type { ProductTarget } from "../types";
import { apiTarget } from "./api";
import { appRuntimeTarget } from "./appRuntime";
import { mocksTarget } from "./mocks";
import { contractTestsTarget } from "./contractTests";
import { miniappTarget } from "./miniapp";
import { mobileTarget } from "./mobile";
import { serverTarget } from "./server";
import { webTarget } from "./web";

export const PRODUCT_TARGETS: readonly ProductTarget[] = [apiTarget, mocksTarget, appRuntimeTarget, webTarget, serverTarget, contractTestsTarget, mobileTarget, miniappTarget];

export { apiTarget, appRuntimeTarget, contractTestsTarget, miniappTarget, mobileTarget, mocksTarget, serverTarget, webTarget };
