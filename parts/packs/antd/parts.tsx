import { useMemo, type ComponentProps, type ReactNode } from "react";
import { Button, ConfigProvider, Select, theme as antdTheme, type SelectProps } from "antd";
import { usePartTheme } from "../../theme";

/* Ant Design inside the editor. Its own 6dp corner, scaled the way the sketch scales shapes, and
 * the sketch's seed color and dark mode: a brand change reaches these parts too.
 *
 * A popup goes to <body> unless told otherwise: there it stands outside the part's theme scope.
 * getPopupContainer keeps it beside its trigger, so it scales and goes away with its screen. */

const inPlace = (trigger?: HTMLElement) => trigger?.parentElement ?? document.body;

function Themed({ children }: { children: ReactNode }) {
  const { seed, dark, shape } = usePartTheme();
  const theme = useMemo(
    () => ({
      algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: { colorPrimary: seed, borderRadius: Math.round(6 * shape) },
    }),
    [seed, dark, shape],
  );
  return (
    <ConfigProvider theme={theme} getPopupContainer={inPlace}>
      {children}
    </ConfigProvider>
  );
}

export const AntButton = (props: ComponentProps<typeof Button>) => (
  <Themed>
    <Button {...props} />
  </Themed>
);

export const AntSelect = (props: SelectProps) => (
  <Themed>
    <Select {...props} />
  </Themed>
);
