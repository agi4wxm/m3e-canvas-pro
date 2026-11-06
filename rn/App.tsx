import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { registerIcons } from "./src/kit";
import { Gallery, queryOf } from "./src/gallery/Gallery";
import { ICONS } from "./src/gallery/icons.generated";

/* The kit's test bed: the gallery of every part under the styles it is checked in. On the web the address picks the
 * style (?style=ios&dark=1&part=button). */
registerIcons(ICONS);

export default function App() {
  const initial = queryOf(Platform.OS === "web" && typeof window !== "undefined" ? window.location.search : "");
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Gallery initial={initial} />
    </SafeAreaProvider>
  );
}
