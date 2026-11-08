//! Copied as it is (lib/export/copy.ts) into apps/mobile/jest.setup.tsx of every product with a mobile app (lib/export/targets/mobile.ts):
//! the mobile app's own code that is the same in every app, typechecked and linted with the kit. Written in the product's
//! style (Prettier, no semicolons); the lines starting with //! are the editor's only.
/* Reanimated and Worklets have no native side under Jest: their own mocks stand in. */
jest.mock("react-native-reanimated", () => jest.requireActual("react-native-reanimated/mock"))
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"))

/* the platform's date and time pickers are native views: a stand-in that names what it was asked for */
jest.mock("@react-native-community/datetimepicker", () => {
  const { Text } = jest.requireActual("react-native")
  const Picker = ({ mode }: { mode: string }) => <Text>{`native ${mode} picker`}</Text>
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } }
})

/* the device's safe area: the library's own stand-in, with a phone's insets */
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default)

/* the session's tokens: kept in memory */
jest.mock("expo-secure-store", () => {
  const kept = new Map<string, string>()
  return {
    getItemAsync: async (k: string) => kept.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void kept.set(k, v),
    deleteItemAsync: async (k: string) => void kept.delete(k),
  }
})
