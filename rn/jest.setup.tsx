/* Reanimated and Worklets have no native side under Jest: their own mocks stand in. */
jest.mock("react-native-reanimated", () => jest.requireActual("react-native-reanimated/mock"));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));

/* The platform's date and time pickers are native views: a stand-in that names what it was asked for */
jest.mock("@react-native-community/datetimepicker", () => {
  const { Text } = jest.requireActual("react-native");
  const Picker = ({ mode }: { mode: string }) => <Text>{`native ${mode} picker`}</Text>;
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } };
});

/* the device's safe area: the library's own stand-in, with a phone's insets */
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
