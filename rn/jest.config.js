/* jest-expo runs the tests the way the app runs on a phone (the iOS preset); React Native Testing Library renders them. */
module.exports = {
  preset: "jest-expo/ios",
  setupFiles: ["./jest.setup.tsx"],
  /* the shared runtime an exported app has as packages/app-runtime is the editor's lib/app, as the mini-program kit reads
     it too; one React for it and the kit (the consistency table's rows, __tests__/table.test.tsx) */
  moduleNameMapper: { "^@m3e/app-runtime$": "<rootDir>/../lib/app/index.ts", "^react$": "<rootDir>/node_modules/react" },
  /* what the kit's build adds to that code (NativeWind's JSX) comes from here too */
  modulePaths: ["<rootDir>/node_modules"],
  testMatch: ["<rootDir>/__tests__/**/*.test.ts?(x)"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-native-svg|nativewind|react-native-css-interop|react-native-reanimated|react-native-worklets))",
  ],
};
