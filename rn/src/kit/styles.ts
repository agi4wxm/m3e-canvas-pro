import type { TextStyle, ViewStyle } from "react-native";

/* React Native's style types are read-only; a style the kit builds field by field is one of these until it is done. */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
export type BuildViewStyle = Mutable<ViewStyle>;
export type BuildTextStyle = Mutable<TextStyle>;
