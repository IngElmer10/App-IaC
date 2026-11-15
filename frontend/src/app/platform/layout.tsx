import { PortalShell } from "../../components/layout/portal-shell";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell role="platform">{children}</PortalShell>;
}
