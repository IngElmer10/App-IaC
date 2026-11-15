import LoginForm from "../components/auth/login-form";
import { PublicLanding } from "../components/platform/public-landing";

export const metadata = {
  title: process.env.NEXT_PUBLIC_PLATFORM_ENABLED === "false" ? process.env.NEXT_PUBLIC_TENANT_NAME || "Control de asistencia" : "TenantForge · Tu institución, su propio espacio",
  description: "Plataformas de asistencia independientes para instituciones educativas, con infraestructura y monitoreo propios.",
};

export default function HomePage() {
  return process.env.NEXT_PUBLIC_PLATFORM_ENABLED === "false" ? <LoginForm /> : <PublicLanding />;
}
