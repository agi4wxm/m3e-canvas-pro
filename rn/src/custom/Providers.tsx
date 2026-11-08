//! Written once (lib/export/copy.ts seededFile) into apps/mobile/src/custom/Providers.tsx of every product with a mobile app, never
//! changed again: custom code's place. Typechecked and linted with the kit.
import type { ReactNode } from "react";

/*
 * Custom code (written by people or AI). The export created this file once and
 * never changes it again. Providers wraps the whole app: put the providers of
 * third-party SDKs here.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
