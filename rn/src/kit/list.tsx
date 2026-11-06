import { Fragment, type ReactNode } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";

import { useKit } from "./theme/ThemeProvider";

/* A container's first part drawn once per element of a list of data (a repeat over `data.products.items`), as the
 * preview draws it. Where the list has the screen's room to itself it scrolls on its own (`scroll`): a FlatList, so a
 * long list draws only what is on show, the next page loads as its end comes into view (`onEndReached`), and a pull on
 * it loads it again (`onRefresh`). Inside another layout it is the rows themselves, laid out by what holds them. */

export type RepeatProps<T> = {
  /** the elements, as the expression read them */
  data: readonly T[];
  /** each element's key: its id, else its place */
  keyOf: (item: T, index: number) => string | number;
  /** the row drawn for an element */
  children: (item: T, index: number) => ReactNode;
  /** the list scrolls in the room it is given */
  scroll?: boolean;
  /** the space between rows, as the container lays them out */
  gap?: number;
  /** across: rows side by side */
  horizontal?: boolean;
  /** its end came into view: the next page */
  onEndReached?: () => void;
  /** a next page is on its way */
  loadingMore?: boolean;
  /** a pull loads it again */
  onRefresh?: () => void;
  refreshing?: boolean;
  testID?: string;
};

export function Repeat<T>({ data, keyOf, children: render, scroll, gap = 0, horizontal, onEndReached, loadingMore, onRefresh, refreshing = false, testID }: RepeatProps<T>) {
  const kit = useKit();
  if (!scroll)
    return (
      <>
        {data.map((item, i) => (
          <Fragment key={keyOf(item, i)}>{render(item, i)}</Fragment>
        ))}
      </>
    );
  return (
    <FlatList
      testID={testID}
      style={{ flex: 1, alignSelf: "stretch" }}
      contentContainerStyle={horizontal ? { columnGap: gap } : { rowGap: gap }}
      horizontal={horizontal}
      data={data}
      keyExtractor={(item, i) => String(keyOf(item, i))}
      renderItem={({ item, index }) => <>{render(item, index)}</>}
      onEndReached={onEndReached ? () => onEndReached() : undefined}
      onEndReachedThreshold={0.5}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[kit.colors.primary]} tintColor={kit.colors.primary} progressBackgroundColor={kit.colors["surface-container-high"]} /> : undefined}
      ListFooterComponent={loadingMore ? <View style={{ paddingVertical: 16, alignItems: "center" }}><ActivityIndicator color={kit.colors.primary} /></View> : undefined}
    />
  );
}
