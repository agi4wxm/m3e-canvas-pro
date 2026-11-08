import type { ReactNode } from "react";
import { ActivityIndicator, Text as RNText, View } from "react-native";

import { typeStyle, useKit } from "./theme/ThemeProvider";

/* The field states a part shows beside its value, as the editor declares them (parts/fieldState.ts): read-only (it shows
 * its value and cannot be changed), required (a star after its label), loading (a spinner beside it), and the message
 * of its error under it. Disabled and in error each control already draws itself. `ariaLabel` names a control that
 * shows no words of its own to a screen reader. */

export type FieldProps = { readOnly?: boolean; required?: boolean; loading?: boolean; errorText?: string; ariaLabel?: string };

/** words with a star after them while the field is required */
export const starred = (words: string | undefined, required?: boolean): string | undefined => (words && required ? `${words} *` : words);

/** A control with what its states say around it: the message of its error under it, a spinner while it loads. Bare
 *  when it has neither, so a part as it always was draws as it always did. */
export function withField(p: FieldProps & { error?: boolean }, control: ReactNode): ReactNode {
  const message = p.error === false ? "" : (p.errorText ?? "");
  if (!message && !p.loading) return control;
  return <FieldNote control={control} message={message} loading={!!p.loading} />;
}

function FieldNote({ control, message, loading }: { control: ReactNode; message: string; loading: boolean }) {
  const kit = useKit();
  return (
    <View style={{ rowGap: 4, alignSelf: "flex-start" }} accessibilityState={{ busy: loading }}>
      <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
        {control}
        {loading ? <ActivityIndicator size="small" color={kit.colors.primary} /> : null}
      </View>
      {message ? (
        <RNText accessibilityRole="alert" style={{ ...typeStyle(kit, "body-small"), color: kit.colors.error ?? "#B3261E", paddingHorizontal: 16 }}>
          {message}
        </RNText>
      ) : null}
    </View>
  );
}
