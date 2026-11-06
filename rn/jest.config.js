/* jest-expo runs the tests the way the app runs on a phone (the iOS preset); React Native Testing Library renders them. */
module.exports = {
  preset: "jest-expo/ios",
  setupFiles: ["./jest.setup.tsx"],
  testMatch: ["<rootDir>/__tests__/**/*.test.ts?(x)"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-native-svg|nativewind|react-native-css-interop|react-native-reanimated|react-native-worklets))",
  ],
};
