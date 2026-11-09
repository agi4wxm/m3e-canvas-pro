//! Copied as it is (lib/export/copy.ts) into apps/mobile/src/generated/mocks.ts of every product with a mobile app (lib/export/targets/mobile.ts):
//! the mobile app's own code, typechecked and linted with the kit (rn/types/app.d.ts stands in for the Expo packages
//! the kit does not install). Written in the product's style (Prettier, no semicolons); the lines starting with //!
//! are the editor's only.
import { Platform } from "react-native"
import { createScriptedWorld } from "@m3e/app-runtime"
import { createMockTransport, MOCK_WORLD, startsSignedIn, type ScenarioName } from "@m3e/mocks"
import { kitNow, setStandInWorld } from "../kit"
import { runtime } from "./runtime"

/* Development only (./root requires this behind __DEV__): the API answers from the mocks, the editor preview's own,
 * in the scenario the design chose, the address's ?scenario= on the web, or the one picked in the dev menu. */

let scenario: string | undefined

/** the scenario an address asks for on the web */
function asked(): string | undefined {
  if (Platform.OS !== "web") return undefined
  const search = (globalThis as { location?: { search?: string } }).location?.search ?? ""
  const v = new URLSearchParams(search).get("scenario")
  return v === null ? undefined : v
}

/** Answers the API from the mocks in a scenario ("" for none, left out for the design's own), starting over: no data, no
 *  session but the one the scenario starts with. */
export function startMocks(next: string | undefined = scenario ?? asked()) {
  const transport = createMockTransport(next === undefined ? {} : { scenario: next as ScenarioName | "" })
  scenario = transport.scenario ?? ""
  /* the app's session starts as the mocks' does under the scenario, as the preview's does */
  runtime.setTransport(transport, { presumed: startsSignedIn(scenario) })
}

/* the world views' stand-ins play the design's world script (docs/模拟库.md in the design editor), on the app's clock,
   until an engine is plugged into their slots: a production build never does */
const world = MOCK_WORLD
if (world) setStandInWorld((start) => createScriptedWorld(world, { now: kitNow, base: start }))

/** the scenario the mocks answer in now ("" for none) */
export const scenarioNow = () => scenario ?? ""
