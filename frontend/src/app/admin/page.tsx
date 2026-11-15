"use client";

import { useEffect, useState } from "react";
import { apiUrl, authenticatedFetch } from "../../lib/api";
import { signOut } from "../../lib/session";

const emptyDashboard = {
  activeModule: null as { name: string } | null,
  totalStudents: 0,
  totalSessions: 0,
  attendanceToday: 0,
  overview: [
    { label: "Presentes", value: 0 },
    { label: "Ausentes", value: 0 },
  ],
};

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [restartOpen, setRestartOpen] = useState(false);
  const [newModuleName, setNewModuleName] = useState("");
  const [restarting, setRestarting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [accessSettings, setAccessSettings] = useState<{ defaultStudentPassword: string; maxStudents: number | null } | null>(null);
  const [showStudentPassword, setShowStudentPassword] = useState(false);

  useEffect(() => {
    authenticatedFetch(apiUrl("admin/access-settings"))
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (payload) setAccessSettings(payload); })
      .catch(() => undefined);
    authenticatedFetch(apiUrl("admin/dashboard"))
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message ?? "No se pudo cargar el panel.");
        return payload;
      })
      .then((payload) => {
        if (payload) {
          setDashboard(payload);
        }
      })
      .catch(() => setError("No se pudo cargar el panel. Comprueba la conexión e intenta recargar la página."))
      .finally(() => setLoading(false));
  }, []);

  const restartModule = async () => {
    setRestarting(true);
    setMessage("");
    setError("");
    try {
      const response = await authenticatedFetch(apiUrl("modules/restart"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newModuleName }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "No se pudo iniciar el módulo nuevo.");
      setDashboard({
        activeModule: payload,
        totalStudents: 0,
        totalSessions: 0,
        attendanceToday: 0,
        overview: [{ label: "Presentes", value: 0 }, { label: "Ausentes", value: 0 }],
      });
      setNewModuleName("");
      setRestartOpen(false);
      setMessage("Módulo nuevo activado. Los datos del módulo anterior se conservaron.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo iniciar el módulo nuevo.");
    } finally {
      setRestarting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-800">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-900 p-6 text-white md:flex-row md:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-300">Panel administrativo</p>
            <h1 className="mt-2 text-3xl font-bold">Dashboard</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/admin/students"
              className="rounded-full border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Ver estudiantes
            </a>
            <a
              href="/admin/import"
              className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400"
            >
              Cargar Excel
            </a>
            <a
              href="/admin/attendance"
              className="rounded-full border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Asistencias
            </a>
            <a
              href="/admin/activities"
              className="rounded-full border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Actividades
            </a>
            <button
              type="button"
              onClick={() => setRestartOpen(true)}
              className="rounded-full border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-950"
            >
              Nuevo módulo
            </button>
            <button
              type="button"
              onClick={signOut}
              className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-700"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        {loading ? <p role="status" className="text-sm text-slate-500">Cargando resumen del módulo...</p> : null}
        {error ? <p role="alert" className="border-l-4 border-red-600 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}

        {!loading && !error && (dashboard.totalStudents === 0 || dashboard.totalSessions === 0) ? (
          <aside className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
            <h2 className="font-semibold">Prepara tu módulo en dos pasos</h2>
            <p className="mt-2 text-sm">Carga la lista de estudiantes y las fechas de clase para habilitar el registro de asistencia.</p>
            <a href="/admin/import" className="mt-3 inline-block text-sm font-bold underline">Descargar plantillas y cargar Excel →</a>
          </aside>
        ) : null}

        <section className="grid gap-6 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Módulo activo</p>
            <h2 className="mt-3 text-xl font-bold">{dashboard.activeModule?.name ?? "Sin módulo activo"}</h2>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Estudiantes</p>
            <h2 className="mt-3 text-3xl font-bold">{dashboard.totalStudents}</h2>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Sesiones</p>
            <h2 className="mt-3 text-3xl font-bold">{dashboard.totalSessions}</h2>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Asistencia hoy</p>
            <h2 className="mt-3 text-3xl font-bold">{dashboard.attendanceToday}</h2>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-xl font-semibold">Resumen por estado</h3>
          <p className="mt-2 text-sm text-slate-500">Todas las fechas del módulo activo. Las clases futuras y las marcas pendientes de hoy aún no se cuentan como falta.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {dashboard.overview.map((metric) => (
              <div key={metric.label} className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">{metric.label}</p>
                <p className="mt-2 text-3xl font-bold text-slate-800">{metric.value}</p>
              </div>
            ))}
          </div>
        </section>

        {accessSettings ? <section className="rounded-2xl border border-slate-200 bg-white p-6"><h3 className="font-semibold">Acceso de estudiantes</h3><p className="mt-2 text-sm text-slate-500">Los estudiantes importados ingresan con su correo o número de registro y esta contraseña inicial.{accessSettings.maxStudents ? ` Tu plan permite ${accessSettings.maxStudents} estudiantes en el módulo activo.` : ""}</p><div className="mt-4 flex flex-wrap items-center gap-4"><code className="rounded-lg bg-slate-100 px-4 py-2 text-sm">{showStudentPassword ? accessSettings.defaultStudentPassword : "••••••••••••"}</code><button type="button" onClick={() => setShowStudentPassword(!showStudentPassword)} className="text-sm font-semibold text-emerald-700">{showStudentPassword ? "Ocultar contraseña" : "Mostrar contraseña de estudiantes"}</button></div></section> : null}

        {message ? <p role="status" className="border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm text-emerald-900">{message}</p> : null}

        {restartOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-5" role="presentation">
            <section role="dialog" aria-modal="true" aria-labelledby="restartTitle" className="w-full max-w-lg bg-white p-6 shadow-2xl">
              <h2 id="restartTitle" className="text-xl font-bold">Activar un módulo nuevo</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                El módulo actual dejará de estar activo y no aparecerá en la operación diaria. Sus estudiantes, fechas y asistencias se conservarán; el módulo nuevo empezará vacío.
              </p>
              <label htmlFor="moduleName" className="mt-5 block text-sm font-medium text-slate-700">Nombre del nuevo módulo</label>
              <input
                id="moduleName"
                maxLength={120}
                value={newModuleName}
                onChange={(event) => setNewModuleName(event.target.value)}
                placeholder="Ej. Módulo 2026-2"
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-600"
              />
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setRestartOpen(false)} disabled={restarting} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="button" onClick={() => void restartModule()} disabled={restarting} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60">{restarting ? "Activando..." : "Confirmar reinicio"}</button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
