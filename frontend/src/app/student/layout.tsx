import { PortalShell } from "../../components/layout/portal-shell";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell role="student">{children}</PortalShell>;
}
