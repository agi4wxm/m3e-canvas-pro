import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { registerIcons } from "./src/kit";
import { Gallery, queryOf } from "./src/gallery/Gallery";
import { ICONS } from "./src/gallery/icons.generated";
import { App as KitsApp } from "./src/printed/kits/App";
import { App as ProofApp } from "./src/printed/proof/App";

/* The kit's test bed: the gallery of every part under the styles it is checked in, and the apps the code printer wrote
 * for its fixture documents. On the web the address picks: ?style=ios&dark=1&part=button for the gallery, ?app=proof
 * or ?app=kits (with &screen=<key>) for a printed app. */
registerIcons(ICONS);

const search = Platform.OS === "web" && typeof window !== "undefined" ? window.location.search : "";
const params = new URLSearchParams(search);

export default function App() {
  const app = params.get("app");
  const screen = params.get("screen") ?? undefined;
  if (app === "proof") return <ProofApp initial={screen} />;
  if (app === "kits") return <KitsApp initial={screen} />;
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="auto" />
      <Gallery initial={queryOf(search)} />
    </SafeAreaProvider>
  );
}
