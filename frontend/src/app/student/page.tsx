"use client";

import { useEffect, useState } from "react";
import { apiUrl, authenticatedFetch } from "../../lib/api";
import { getSession, signOut } from "../../lib/session";

type StudentMark = {
  sessionId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "PRESENT" | "ABSENT" | "PENDING";
  observedAt: string | null;
  canMark: boolean;
};

type StudentSummary = {
  student: { id: string; fullName: string; registrationCode: string; email: string };
  activeModule: { name: string };
  attendanceRate: number;
  totalSessions: number;
  present: number;
  absent: number;
  marks: StudentMark[];
};

export default function StudentDashboardPage() {
  const [summary, setSummary] = useState<StudentSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [markingSession, setMarkingSession] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const session = getSession();

    if (!session || session.role !== "student") {
      signOut();
      return;
    }

    authenticatedFetch(apiUrl(`student/${encodeURIComponent(session.username)}`))
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.message ?? "No se encontró al estudiante en el módulo activo.");
        }
        setSummary(payload);
      })
      .catch((requestError: Error) => setError(requestError.message))
      .finally(() => setIsLoading(false));
  }, []);

  const markAttendance = async (sessionId: string) => {
    if (!summary) return;
    setMarkingSession(sessionId);
    setError("");
    try {
      const response = await authenticatedFetch(apiUrl("attendance/mark"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message ?? "No fue posible registrar la asistencia.");
      }

      const updated = await authenticatedFetch(apiUrl(`student/${encodeURIComponent(summary.student.registrationCode)}`));
      const updatedSummary = await updated.json();
      if (!updated.ok) {
        throw new Error(updatedSummary?.message ?? "La marca se guardó, pero no se pudo actualizar el historial.");
      }
      setSummary(updatedSummary);
      setSuccess("Tu asistencia se registró correctamente.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No fue posible registrar la asistencia.");
    } finally {
      setMarkingSession("");
    }
  };

  if (isLoading) {
    return <main className="min-h-screen bg-slate-100 p-6 text-slate-700">Cargando historial...</main>;
  }

  if (!summary) {
    return (
      <main className="min-h-screen bg-slate-100 p-6 text-slate-800">
        <div className="mx-auto max-w-3xl border-l-4 border-red-600 bg-white p-6">
          <h1 className="text-xl font-semibold">No se pudo cargar el historial</h1>
          <p role="alert" className="mt-2 text-sm text-red-800">{error || "Verifica que tu usuario pertenezca al módulo activo y que el backend esté conectado."}</p>
          <button type="button" onClick={signOut} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Cerrar sesión</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-800">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-900 p-6 text-white md:flex-row md:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-300">Portal del estudiante</p>
            <h1 className="mt-2 text-3xl font-bold">{summary.student.fullName}</h1>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-700"
          >
            Cerrar sesión
          </button>
        </header>

        {success ? <p role="status" className="border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm text-emerald-900">{success}</p> : null}

        <section className="grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Módulo activo</p>
            <h2 className="mt-3 text-2xl font-bold">{summary.activeModule.name}</h2>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Asistencia</p>
            <h2 className="mt-3 text-2xl font-bold">{summary.attendanceRate}%</h2>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Registro</p>
            <h2 className="mt-3 text-2xl font-bold">{summary.student.registrationCode}</h2>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-xl font-semibold">Historial de asistencia</h3>
            <p className="mt-2 text-sm text-slate-500">Puedes marcar durante todo el día de clase, hasta las 23:59 (hora de Bolivia).</p>
            <div className="mt-5 space-y-3">
              {summary.marks.length === 0 ? <p className="text-sm text-slate-500">No hay fechas de clase cargadas.</p> : null}
              {summary.marks.map((mark) => (
                <div key={mark.sessionId} className="flex flex-col justify-between gap-4 border-b border-slate-200 py-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-medium text-slate-800">{new Date(`${mark.date}T12:00:00`).toLocaleDateString("es-BO", { dateStyle: "long" })}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {new Date(mark.startTime).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit" })}
                      {" - "}
                      {new Date(mark.endTime).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit" })}
                      {mark.observedAt ? ` · Marcada ${new Date(mark.observedAt).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit" })}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${mark.status === "PRESENT" ? "text-emerald-700" : mark.status === "ABSENT" ? "text-rose-700" : "text-amber-700"}`}>
                      {mark.status === "PRESENT" ? "Presente" : mark.status === "ABSENT" ? "Falta" : "Pendiente"}
                    </span>
                    {mark.canMark ? (
                      <button
                        type="button"
                        onClick={() => markAttendance(mark.sessionId)}
                        disabled={markingSession !== ""}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {markingSession === mark.sessionId ? "Registrando..." : "Marcar asistencia"}
                      </button>
                    ) : <button type="button" disabled className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">{mark.status === "PRESENT" ? "Registrada" : mark.status === "ABSENT" ? "Fecha cerrada" : "Aún no habilitada"}</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-xl font-semibold">Resumen</h3>
            <ul className="mt-5 space-y-3 text-sm text-slate-600">
              <li>Sesiones programadas: {summary.totalSessions}</li>
              <li>Presencias: {summary.present}</li>
              <li>Faltas: {summary.absent}</li>
              <li>Estado: activo</li>
            </ul>
          </div>
        </section>

        {error ? <p role="alert" className="border-l-4 border-red-600 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      </div>
    </main>
  );
}
