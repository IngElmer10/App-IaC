"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiUrl, authenticatedFetch } from "../../../lib/api";

type Activity = {
  id: string;
  action: string;
  actor: string | null;
  entity: string;
  entityId: string;
  payload: unknown;
  createdAt: string;
};

const actionLabels: Record<string, string> = {
  IMPORT_STUDENTS: "Importó estudiantes",
  IMPORT_CLASS_SESSIONS: "Importó fechas y horarios",
  STUDENT_MARKED_PRESENT: "Marcó asistencia",
  ADMIN_CHANGED_ATTENDANCE: "Corrigió una asistencia",
  ACTIVATE_NEW_MODULE: "Activó un módulo nuevo",
  ACTIVATE_MODULE: "Activó un módulo",
};

export default function AdminActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ date: "", search: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.date) params.set("date", filters.date);
    if (filters.search) params.set("search", filters.search);
    authenticatedFetch(apiUrl(`admin/activities${params.size ? `?${params.toString()}` : ""}`))
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message ?? "No se pudo consultar el historial.");
        setActivities(payload);
        setError("");
      })
      .catch((requestError: Error) => setError(requestError.message || "No se pudo conectar con el backend."))
      .finally(() => setLoading(false));
  }, [filters]);

  const handleFilter = (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setFilters({ date, search: search.trim() });
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-800">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-300 pb-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Administración</p>
            <h1 className="mt-2 text-3xl font-bold">Actividades del módulo activo</h1>
          </div>
          <a href="/admin" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-white">Panel</a>
        </header>

        <form onSubmit={handleFilter} className="flex flex-col gap-3 border-b border-slate-300 py-5 sm:flex-row">
          <label htmlFor="activityDate" className="sr-only">Filtrar por fecha</label>
          <input id="activityDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm" />
          <label htmlFor="activitySearch" className="sr-only">Filtrar por estudiante</label>
          <input id="activitySearch" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Estudiante o número de registro" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm" />
          <button type="submit" className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">Filtrar</button>
          <button type="button" onClick={() => { setDate(""); setSearch(""); setFilters({ date: "", search: "" }); }} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium hover:bg-white">Limpiar</button>
        </form>

        {error ? <p role="alert" className="my-4 border-l-4 border-red-600 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
        <p className="py-4 text-sm text-slate-600">{loading ? "Cargando historial..." : `${activities.length} actividades`}</p>

        <div className="divide-y divide-slate-300 border-y border-slate-300 bg-white">
          {!loading && activities.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No hay actividades que coincidan con los filtros.</p> : null}
          {activities.map((activity) => {
            const payload = activity.payload && typeof activity.payload === "object" && !Array.isArray(activity.payload)
              ? activity.payload as Record<string, unknown>
              : {};
            const affectedStudent = typeof payload.registrationCode === "string" ? payload.registrationCode : null;
            const change = typeof payload.previousStatus === "string" && typeof payload.newStatus === "string"
              ? `${payload.previousStatus === "PRESENT" ? "Presente" : payload.previousStatus === "ABSENT" ? "Falta" : "Pendiente"} → ${payload.newStatus === "PRESENT" ? "Presente" : "Falta"}`
              : null;

            return (
              <article key={activity.id} className="grid gap-2 px-5 py-4 md:grid-cols-[190px_1fr_180px] md:items-center">
                <time dateTime={activity.createdAt} className="text-sm text-slate-500">
                  {new Date(activity.createdAt).toLocaleString("es-BO", { timeZone: "America/La_Paz", dateStyle: "short", timeStyle: "short" })}
                </time>
                <div>
                  <h2 className="font-semibold">{actionLabels[activity.action] ?? activity.action}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {affectedStudent ? `Registro ${affectedStudent}` : `Entidad ${activity.entity}`}
                    {change ? ` · ${change}` : ""}
                    {typeof payload.count === "number" ? ` · ${payload.count} registros` : ""}
                  </p>
                </div>
                <p className="text-sm text-slate-500">Usuario: {activity.actor ?? "Sistema"}</p>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
