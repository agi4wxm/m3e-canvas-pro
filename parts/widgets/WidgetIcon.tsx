import { useEffect } from "react";
import { Icon } from "@/components/m3e/icon";
import { ensureIcons, useIconVersion } from "../icons";

/* An icon a widget only knows at run time (a prize's, say). The editor fetches the icons
 * it finds in a part's tree; these are not in it, so this asks for them itself. The icon component
 * is memoized: an icon that arrives after the first draw shows only in a fresh one. */
export function WidgetIcon({ name, className }: { name: string; className?: string }) {
  const version = useIconVersion();
  useEffect(() => ensureIcons([name]), [name]);
  return <Icon key={version} name={name} className={className} />;
}
