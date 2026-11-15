"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiUrl, authenticatedFetch, downloadFile } from "../../../lib/api";

type AttendanceRecord = {
  sessionId: string;
  studentId: string;
  registrationCode: string;
  fullName: string;
  email: string;
  date: string;
  startTime: string;
  status: "PRESENT" | "ABSENT" | "PENDING";
  observedAt: string | null;
};

type AttendanceOverview = {
  records: AttendanceRecord[];
  totals: { present: number; absent: number; pending: number };
};

const emptyOverview: AttendanceOverview = {
  records: [],
  totals: { present: 0, absent: 0, pending: 0 },
};

export default function AdminAttendancePage() {
  const [overview, setOverview] = useState(emptyOverview);
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ date: "", search: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [exporting, setExporting] = useState(false);

  const reload = useCallback(async () => {
    const params = new URLSearchParams();
    if (appliedFilters.date) params.set("date", appliedFilters.date);
    if (appliedFilters.search) params.set("search", appliedFilters.search);
    const suffix = params.size ? `?${params.toString()}` : "";
    try {
      const response = await authenticatedFetch(apiUrl(`admin/attendance${suffix}`));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "No se pudo consultar asistencia.");
      setOverview(payload);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo conectar con el backend.");
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  const handleFilter = (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setAppliedFilters({ date, search: search.trim() });
  };

  const updateStatus = async (record: AttendanceRecord, status: "PRESENT" | "ABSENT") => {
    const key = `${record.sessionId}:${record.studentId}`;
    setUpdatingKey(key);
    setError("");
    try {
      const response = await authenticatedFetch(
        apiUrl(`admin/attendance/${record.sessionId}/${record.studentId}`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "No se pudo modificar la asistencia.");
      await reload();
      setSuccess(`Asistencia de ${record.fullName} actualizada. El cambio quedó registrado en actividades.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo modificar la asistencia.");
    } finally {
      setUpdatingKey("");
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-800">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-300 pb-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Administración</p>
            <h1 className="mt-2 text-3xl font-bold">Asistencia del módulo activo</h1>
          </div>
          <button type="button" disabled={exporting || isLoading} onClick={async () => {
            setExporting(true);
            try {
              const params = new URLSearchParams();
              if (appliedFilters.date) params.set("date", appliedFilters.date);
              if (appliedFilters.search) params.set("search", appliedFilters.search);
              await downloadFile(`admin/attendance/export?${params}`, "asistencias.xlsx");
            } catch { setError("No se pudo exportar la asistencia."); }
            finally { setExporting(false); }
          }} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">{exporting ? "Exportando..." : "Exportar Excel"}</button>
        </header>

        <div className="grid gap-5 border-b border-slate-300 py-5 sm:grid-cols-3">
          <p className="text-sm text-slate-600">Presentes <strong className="ml-2 text-xl text-emerald-700">{overview.totals.present}</strong></p>
          <p className="text-sm text-slate-600">Ausentes <strong className="ml-2 text-xl text-rose-700">{overview.totals.absent}</strong></p>
          <p className="text-sm text-slate-600">Pendientes <strong className="ml-2 text-xl text-amber-700">{overview.totals.pending}</strong></p>
        </div>

        <form onSubmit={handleFilter} className="flex flex-col gap-3 border-b border-slate-300 py-5 md:flex-row">
          <label className="sr-only" htmlFor="attendanceDate">Filtrar por fecha</label>
          <input id="attendanceDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm" />
          <label className="sr-only" htmlFor="attendanceSearch">Filtrar por estudiante</label>
          <input id="attendanceSearch" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o número de registro" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm" />
          <button type="submit" className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">Filtrar</button>
          <button type="button" onClick={() => { setDate(""); setSearch(""); setAppliedFilters({ date: "", search: "" }); }} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium hover:bg-white">Limpiar</button>
        </form>

        {error ? <p role="alert" className="my-4 border-l-4 border-red-600 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
        {success ? <p role="status" className="my-4 border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm text-emerald-900">{success}</p> : null}
        <p className="py-4 text-sm text-slate-600">{isLoading ? "Cargando..." : `${overview.records.length} registros de asistencia`}</p>

        <div className="overflow-x-auto border-y border-slate-300 bg-white">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-slate-200 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Registro</th>
                <th className="px-4 py-3">Estudiante</th>
                <th className="px-4 py-3">Correo</th>
                <th className="px-4 py-3">Marca</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Corrección admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {!isLoading && overview.records.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No hay registros para esos filtros.</td></tr> : null}
              {overview.records.map((record) => {
                const key = `${record.sessionId}:${record.studentId}`;
                return (
                  <tr key={key}>
                    <td className="whitespace-nowrap px-4 py-3">{new Date(`${record.date}T12:00:00`).toLocaleDateString("es-BO")}</td>
                    <td className="px-4 py-3">{record.registrationCode}</td>
                    <td className="px-4 py-3 font-medium">{record.fullName}</td>
                    <td className="px-4 py-3 text-slate-600">{record.email}</td>
                    <td className="px-4 py-3">{record.observedAt ? new Date(record.observedAt).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                    <td className="px-4 py-3">{record.status === "PRESENT" ? "Presente" : record.status === "ABSENT" ? "Falta" : "Pendiente"}</td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Corregir asistencia de ${record.fullName} del ${record.date}`}
                        value={record.status}
                        disabled={updatingKey !== "" || isLoading}
                        onChange={(event) => void updateStatus(record, event.target.value as "PRESENT" | "ABSENT")}
                        className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm disabled:bg-slate-100"
                      >
                        <option value="PRESENT">Presente</option>
                        <option value="ABSENT">Falta</option>
                        {record.status === "PENDING" ? <option value="PENDING">Pendiente</option> : null}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
