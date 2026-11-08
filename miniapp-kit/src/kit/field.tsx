import type { ReactNode } from "react";
import { View } from "@tarojs/components";

import { c } from "./color";
import { sx } from "./styles";
import { typeStyle, useKit } from "./theme";
import { Spinner } from "./atoms/indicators";
import { Words } from "./atoms/words";

/* The field states a part shows beside its value, as the editor declares them (parts/fieldState.ts): read-only (it shows
 * its value and cannot be changed), required (a star after its label), loading (a spinner beside it), its line of help
 * under it, and in its place the message of its error. Disabled and in error each control already draws itself. `ariaLabel` names a control that
 * shows no words of its own to a screen reader. */

export type FieldProps = { readOnly?: boolean; required?: boolean; loading?: boolean; errorText?: string; helperText?: string; ariaLabel?: string };

/** words with a star after them while the field is required */
export const starred = (words: string | undefined, required?: boolean): string | undefined => (words && required ? `${words} *` : words);

/** A control with what its states say around it: the message of its error under it (where its line of help stands
 *  otherwise), a spinner while it loads. Bare when it has none of these, so a part as it always was draws as it always
 *  did. */
export function withField(p: FieldProps & { error?: boolean }, control: ReactNode): ReactNode {
  const message = p.error === false ? "" : (p.errorText ?? "");
  const help = p.helperText ?? "";
  if (!message && !help && !p.loading) return control;
  return <FieldNote control={control} message={message} help={help} loading={!!p.loading} />;
}

function FieldNote({ control, message, help, loading }: { control: ReactNode; message: string; help: string; loading: boolean }) {
  const kit = useKit();
  return (
    <View style={sx({ display: "flex", flexDirection: "column", rowGap: 4, alignSelf: "flex-start" })}>
      <View style={sx({ display: "flex", flexDirection: "row", alignItems: "center", columnGap: 8 })}>
        {control}
        {loading ? <Spinner size="sm" /> : null}
      </View>
      {message || help ? <Words text={message || help} style={{ ...typeStyle(kit, "body-small"), color: c(message ? "error" : "on-surface-variant"), paddingLeft: 16, paddingRight: 16 }} /> : null}
    </View>
  );
}
