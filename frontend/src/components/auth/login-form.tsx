"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiUrl } from "../../lib/api";
import { loginSchema, type LoginValues } from "../../lib/validation";

export default function LoginForm() {
  const router = useRouter();
  const platformEnabled = process.env.NEXT_PUBLIC_PLATFORM_ENABLED !== "false";
  const [role, setRole] = useState<"admin" | "student" | "platform">(platformEnabled ? "platform" : "student");
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { username: "", password: "" } });
  const [error, setError] = useState("");

  const subtitle = role === "admin"
    ? "Gestión de estudiantes, módulos y asistencias"
    : role === "platform" ? "Administra instituciones, planes e infraestructura" : "Consulta tu historial y registra asistencia";

  const handleLogin = async ({ username, password }: LoginValues) => {
    setError("");
    try {
      const response = await fetch(apiUrl("auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(Array.isArray(payload?.message) ? payload.message.join(" ") : payload?.message ?? "Credenciales inválidas.");
        return;
      }
      localStorage.setItem(
        "session",
        JSON.stringify({
          id: payload.user.id,
          role: payload.user.role,
          username: payload.user.username,
          accessToken: payload.accessToken,
        }),
      );
      router.push(payload.user.role === "platform" ? "/platform" : payload.user.role === "admin" ? "/admin" : "/student");
    } catch {
      setError("No se pudo conectar con el sistema. Intenta nuevamente en unos segundos.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="grid md:grid-cols-2">
          <div className="bg-slate-900 p-8 text-white md:p-12" style={!platformEnabled ? { borderTop: `6px solid ${process.env.NEXT_PUBLIC_TENANT_COLOR || '#059669'}` } : undefined}>
            <p className="text-sm uppercase tracking-[0.28em] text-slate-300">{platformEnabled ? "TenantForge" : process.env.NEXT_PUBLIC_TENANT_NAME || "Control de asistencia"}</p>
            <h1 className="mt-6 text-4xl font-bold">{platformEnabled ? <>Tu institución.<br />Su propio espacio.</> : <>Tu asistencia.<br />Tu progreso.</>}</h1>
            <p className="mt-5 max-w-sm text-slate-300">
              {platformEnabled ? "Crea instituciones, elige sus recursos y despliega una aplicación de asistencia independiente para cada una." : "Consulta tus clases, registra tu asistencia y revisa tu historial académico."}
            </p>
            <div className="mt-8 space-y-3 text-sm text-slate-200">
              <div className="rounded-xl bg-slate-800/60 p-3">{platformEnabled ? "• Planes y despliegues en AWS" : "• Asistencia en las fechas de clase"}</div>
              <div className="rounded-xl bg-slate-800/60 p-3">{platformEnabled ? "• Datos aislados por institución" : "• Historial personal y resumen"}</div>
              <div className="rounded-xl bg-slate-800/60 p-3">{platformEnabled ? "• Monitoreo, respaldos y trazabilidad" : "• Información exclusiva de tu institución"}</div>
            </div>
          </div>

          <div className="p-8 md:p-12">
            <div className="mb-8 flex gap-2 rounded-full bg-slate-100 p-1">
              {platformEnabled ? <button type="button" onClick={() => { setRole("platform"); reset({ username: "platform", password: "" }); setError(""); }} className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${role === "platform" ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}>Plataforma</button> : null}
              <button
                type="button"
                onClick={() => {
                  setRole("student");
                  reset({ username: "", password: "" });
                  setError("");
                }}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  role === "student" ? "bg-white text-slate-900 shadow" : "text-slate-500"
                }`}
              >
                Estudiante
              </button>
              <button
                type="button"
                onClick={() => {
                  setRole("admin");
                  reset({ username: "admin", password: "" });
                  setError("");
                }}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  role === "admin" ? "bg-white text-slate-900 shadow" : "text-slate-500"
                }`}
              >
                Administrador
              </button>
            </div>

            {platformEnabled ? <Link href="/" className="mb-5 inline-block text-sm font-medium text-emerald-700">← Conocer TenantForge</Link> : null}
            <h2 className="text-2xl font-semibold text-slate-900">Iniciar sesión</h2>
            <p className="mt-2 text-sm text-slate-500">{subtitle}</p>

            <form onSubmit={handleSubmit(handleLogin)} className="mt-8 space-y-5" noValidate>
              <div>
                <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-700">
                  Usuario
                </label>
                <input
                  id="username"
                  {...register("username")}
                  autoComplete="username"
                  aria-invalid={Boolean(errors.username)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-0 transition focus:border-slate-400"
                  placeholder={role === "platform" ? "platform" : role === "admin" ? "admin" : "Correo o número de registro"}
                />
                {errors.username ? <p role="alert" className="mt-2 text-sm text-red-700">{errors.username.message}</p> : null}
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  {...register("password")}
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400"
                  placeholder="••••••••"
                />
                {errors.password ? <p role="alert" className="mt-2 text-sm text-red-700">{errors.password.message}</p> : null}
              </div>

              {error ? <p role="alert" className="text-sm font-medium text-red-600">{error}</p> : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                {isSubmitting ? "Ingresando..." : "Entrar al sistema"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
