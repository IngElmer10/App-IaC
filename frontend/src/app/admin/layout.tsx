import { PortalShell } from "../../components/layout/portal-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell role="admin">{children}</PortalShell>;
}
