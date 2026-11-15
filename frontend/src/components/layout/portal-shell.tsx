"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession, signOut } from "../../lib/session";

const adminLinks = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/students", label: "Estudiantes" },
  { href: "/admin/attendance", label: "Asistencias" },
  { href: "/admin/import", label: "Cargar Excel" },
  { href: "/admin/activities", label: "Actividades" },
];

export function PortalShell({ role, children }: { role: "admin" | "student" | "platform"; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const session = getSession();
    if (!session) {
      window.location.replace("/login");
      return;
    }
    if (session.role !== role) {
      window.location.replace(session.role === "platform" ? "/platform" : session.role === "admin" ? "/admin" : "/student");
      return;
    }
    queueMicrotask(() => setReady(true));
  }, [role]);

  if (!ready) return <div role="status" className="grid min-h-screen place-items-center text-slate-500">Cargando tu espacio...</div>;

  return (
    <>
      <a href="#portal-content" className="sr-only focus:not-sr-only focus:p-3">Saltar al contenido</a>
      <div className="border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 py-4">
          <Link href={role === "platform" ? "/platform" : role === "admin" ? "/admin" : "/student"} className="flex items-center gap-3 font-bold tracking-tight text-slate-900">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-emerald-600 text-xl text-white" style={{ backgroundColor: process.env.NEXT_PUBLIC_TENANT_COLOR || '#059669' }}>✓</span>
            {role === "platform" ? "TenantForge" : process.env.NEXT_PUBLIC_TENANT_NAME || "Aula"} <span className="font-normal text-slate-500">/ {role === "platform" ? "Plataforma" : "Asistencia"}</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-800">{role === "platform" ? "Administrador de plataforma" : role === "admin" ? "Administrador" : "Estudiante"}</span>
            <button type="button" onClick={signOut} className="font-medium text-slate-600 hover:text-slate-950">Salir</button>
          </div>
        </div>
        {role === "admin" ? (
          <nav aria-label="Navegación principal" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto">
            {adminLinks.map((link) => (
              <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} style={pathname === link.href ? { borderColor: process.env.NEXT_PUBLIC_TENANT_COLOR || '#059669', color: process.env.NEXT_PUBLIC_TENANT_COLOR || '#047857' } : undefined} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${pathname === link.href ? "border-emerald-600 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-900"}`}>
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      <div id="portal-content">{children}</div>
      <footer className="mx-auto max-w-7xl px-6 py-6 text-xs text-slate-500">Control de asistencia · Horario de Bolivia (UTC-4)</footer>
    </>
  );
}
