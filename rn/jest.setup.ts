/* Reanimated and Worklets have no native side under Jest: their own mocks stand in. */
jest.mock("react-native-reanimated", () => jest.requireActual("react-native-reanimated/mock"));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
