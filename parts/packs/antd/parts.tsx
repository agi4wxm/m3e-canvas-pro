import { useMemo, type ComponentProps, type ReactNode } from "react";
import { Breadcrumb, Button, Card, ConfigProvider, Divider, Form, Input, Menu, Pagination, Select, Table, Tabs, theme as antdTheme, type SelectProps, type TableProps } from "antd";
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

export const AntInput = (props: ComponentProps<typeof Input>) => (
  <Themed>
    <Input {...props} />
  </Themed>
);

export const AntCard = (props: ComponentProps<typeof Card>) => (
  <Themed>
    <Card {...props} />
  </Themed>
);

export const AntTable = (props: TableProps<Record<string, string>>) => (
  <Themed>
    <Table {...props} />
  </Themed>
);

export const AntTabs = (props: ComponentProps<typeof Tabs>) => (
  <Themed>
    <Tabs {...props} />
  </Themed>
);

export const AntMenu = (props: ComponentProps<typeof Menu>) => (
  <Themed>
    <Menu {...props} />
  </Themed>
);

export const AntBreadcrumb = (props: ComponentProps<typeof Breadcrumb>) => (
  <Themed>
    <Breadcrumb {...props} />
  </Themed>
);

export const AntPagination = (props: ComponentProps<typeof Pagination>) => (
  <Themed>
    <Pagination {...props} />
  </Themed>
);

export const AntDivider = (props: ComponentProps<typeof Divider>) => (
  <Themed>
    <Divider {...props} />
  </Themed>
);

/** a form is fields in a layout and a button, which is what the part lets the author say */
export function AntForm({ fields = [], layout = "vertical", submit = "", width = 360 }: { fields?: string[]; layout?: "vertical" | "horizontal" | "inline"; submit?: string; width?: number }) {
  return (
    <Themed>
      <Form layout={layout} style={{ width }} onFinish={() => {}}>
        {fields.map((label, i) => (
          <Form.Item key={i} label={label}>
            <Input />
          </Form.Item>
        ))}
        {submit && (
          <Form.Item>
            <Button type="primary" htmlType="submit">
              {submit}
            </Button>
          </Form.Item>
        )}
      </Form>
    </Themed>
  );
}

/* Ant's Modal always goes to <body> behind a mask: on the board it would cover the editor. A modal
 * here is what any dialog is here, the panel where the author put it. */
export function AntModal({ title = "", content = "", ok = "", cancel = "", width = 520 }: { title?: string; content?: string; ok?: string; cancel?: string; width?: number }) {
  return (
    <Themed>
      <Card title={title} style={{ width }} actions={[cancel && <Button key="cancel">{cancel}</Button>, ok && <Button key="ok" type="primary">{ok}</Button>].filter(Boolean)}>
        {content}
      </Card>
    </Themed>
  );
}
