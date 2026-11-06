/* The targets of a product, in the order their workspaces are listed (packages before the apps that use them). A
 * target to come takes the place of its slot here: the React Native app replaces `mobileTarget`, the Taro mini-program
 * `miniappTarget`; the mock library fills packages/mocks through `mocksTarget`, the bindings the web screens through
 * `webTarget`. Each one is a `ProductTarget` (lib/export/types.ts). */

import type { ProductTarget } from "../types";
import { apiTarget } from "./api";
import { mocksTarget } from "./mocks";
import { contractTestsTarget, miniappTarget, mobileTarget } from "./others";
import { serverTarget } from "./server";
import { webTarget } from "./web";

export const PRODUCT_TARGETS: readonly ProductTarget[] = [apiTarget, mocksTarget, webTarget, serverTarget, contractTestsTarget, mobileTarget, miniappTarget];

export { apiTarget, contractTestsTarget, miniappTarget, mobileTarget, mocksTarget, serverTarget, webTarget };
