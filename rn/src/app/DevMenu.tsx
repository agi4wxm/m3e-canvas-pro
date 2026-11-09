//! Copied as it is (lib/export/copy.ts) into apps/mobile/src/generated/DevMenu.tsx of every product with a mobile app (lib/export/targets/mobile.ts):
//! the mobile app's own code, typechecked and linted with the kit (rn/types/app.d.ts stands in for the Expo packages
//! the kit does not install). Written in the product's style (Prettier, no semicolons); the lines starting with //!
//! are the editor's only.
import { useState } from "react"
import { Modal, Platform, Pressable, Text, View } from "react-native"
import { SCENARIOS } from "@m3e/mocks"
import { useKit } from "../kit"
import { scenarioNow, startMocks } from "./mocks"

/* Development only (./root requires this behind __DEV__): the scenarios of the mocks, one tap away. */

/** whether the dev menu shows: ?devmenu=off on the web hides it (screenshots) */
const shown = () => {
  if (Platform.OS !== "web") return true
  const search = (globalThis as { location?: { search?: string } }).location?.search ?? ""
  return new URLSearchParams(search).get("devmenu") !== "off"
}

/** a small button in a corner that opens the scenarios of the mocks: one tapped starts the app over in it */
export function DevMenu() {
  const kit = useKit()
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(scenarioNow)
  if (!shown()) return null
  const pick = (id: string) => {
    startMocks(id)
    setAt(id)
    setOpen(false)
  }
  const row = (id: string, name: string) => (
    <Pressable key={id || "-"} accessibilityRole="menuitem" onPress={() => pick(id)} style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: id === at ? kit.colors["secondary-container"] : "transparent" }}>
      <Text style={{ color: kit.colors["on-surface"], fontSize: 16 }}>{name}</Text>
    </Pressable>
  )
  return (
    <>
      <Pressable accessibilityLabel="Mocks" testID="dev-menu" onPress={() => setOpen(true)} style={{ position: "absolute", right: 8, bottom: 140, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: kit.colors["inverse-surface"], opacity: 0.7, zIndex: 200 }}>
        <Text style={{ color: kit.colors["inverse-on-surface"], fontSize: 12, fontWeight: "600" }}>{`mocks · ${SCENARIOS.find((s) => s.id === at)?.name ?? "normal"}`}</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "#00000052", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: kit.colors["surface-container-high"], borderRadius: 16, paddingVertical: 8 }}>
            <Text style={{ color: kit.colors["on-surface-variant"], fontSize: 12, paddingHorizontal: 16, paddingVertical: 8 }}>Scenario of the mocks</Text>
            {row("", "normal")}
            {SCENARIOS.map((s) => row(s.id, s.name || s.id))}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}
