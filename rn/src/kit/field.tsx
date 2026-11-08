import type { ReactNode } from "react";
import { ActivityIndicator, Text as RNText, View } from "react-native";

import { typeStyle, useKit } from "./theme/ThemeProvider";

/* The field states a part shows beside its value, as the editor declares them (parts/fieldState.ts): read-only (it shows
 * its value and cannot be changed), required (a star after its label), loading (a spinner beside it), its line of help
 * under it, and in its place the message of its error. Disabled and in error each control already draws itself. `ariaLabel` names a control that
 * shows no words of its own to a screen reader. */

export type FieldProps = { readOnly?: boolean; required?: boolean; loading?: boolean; errorText?: string; helperText?: string; ariaLabel?: string };

/** words with a star after them while the field is required */
export const starred = (words: string | undefined, required?: boolean): string | undefined => (words && required ? `${words} *` : words);

/** A control with what its states say around it: the message of its error under it (where its line of help stands
 *  otherwise), a spinner while it loads. Bare when it has none of these, so a part as it always was draws as it always
 *  did. A field a form gives a message to ("" while it has none) is framed all along: the control stays where it is when
 *  its error comes and goes, and is not drawn anew (what is typed into it, its focus, stay). */
export function withField(p: FieldProps & { error?: boolean }, control: ReactNode): ReactNode {
  const message = p.error === false ? "" : (p.errorText ?? "");
  const help = p.helperText ?? "";
  if (p.errorText === undefined && !help && !p.loading) return control;
  return <FieldNote control={control} message={message} help={help} loading={!!p.loading} />;
}

function FieldNote({ control, message, help, loading }: { control: ReactNode; message: string; help: string; loading: boolean }) {
  const kit = useKit();
  return (
    <View style={{ rowGap: 4, alignSelf: "flex-start" }} accessibilityState={{ busy: loading }}>
      <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
        {control}
        {loading ? <ActivityIndicator size="small" color={kit.colors.primary} /> : null}
      </View>
      {message || help ? (
        <RNText accessibilityRole={message ? "alert" : undefined} style={{ ...typeStyle(kit, "body-small"), color: message ? (kit.colors.error ?? "#B3261E") : (kit.colors["on-surface-variant"] ?? "#49454F"), paddingHorizontal: 16 }}>
          {message || help}
        </RNText>
      ) : null}
    </View>
  );
}
