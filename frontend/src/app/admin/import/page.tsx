"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { apiUrl, authenticatedFetch, downloadFile } from "../../../lib/api";

export default function ImportStudentsPage() {
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [sessionFile, setSessionFile] = useState<File | null>(null);
  const [studentStatus, setStudentStatus] = useState("");
  const [sessionStatus, setSessionStatus] = useState("");
  const [uploading, setUploading] = useState<"students" | "sessions" | null>(null);

  const upload = async (event: FormEvent, kind: "students" | "sessions") => {
    event.preventDefault();
    const file = kind === "students" ? studentFile : sessionFile;
    const setStatus = kind === "students" ? setStudentStatus : setSessionStatus;

    if (!file) {
      setStatus("Selecciona un archivo .xlsx antes de importar.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 5 * 1024 * 1024) {
      setStatus("Selecciona un archivo .xlsx de hasta 5 MB.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploading(kind);
    setStatus("");

    try {
      const response = await authenticatedFetch(apiUrl(`admin/import/${kind}`), {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        const details = Array.isArray(payload?.errors) ? payload.errors : payload?.message;
        setStatus(Array.isArray(details) ? details.join(" ") : details ?? "No fue posible importar el archivo.");
        return;
      }

      setStatus(`Importación exitosa: ${payload.imported} ${kind === "students" ? "estudiantes registrados" : "fechas cargadas"}.`);
    } catch {
      setStatus("No fue posible importar el archivo. Verifica que sea un Excel .xlsx válido y reintenta.");
    } finally {
      setUploading(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-800">
      <div className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Administración</p>
            <h1 className="mt-2 text-3xl font-bold">Cargas del módulo</h1>
          </div>
          <a href="/admin" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Volver al panel
          </a>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <form onSubmit={(event) => upload(event, "students")} className="space-y-5 border-b border-slate-200 pb-8 md:border-b-0 md:border-r md:pb-0 md:pr-8">
            <div>
              <h2 className="text-xl font-semibold">Importar estudiantes</h2>
              <p className="mt-2 text-sm text-slate-600">Columnas: Número de registro, Nombre completo, Correo electrónico.</p>
              <button type="button" onClick={() => void downloadFile("admin/templates/students", "plantilla-estudiantes.xlsx").catch(() => setStudentStatus("No se pudo descargar la plantilla."))} className="mt-3 text-sm font-semibold text-emerald-700 underline">Descargar plantilla de estudiantes</button>
            </div>
            <label htmlFor="studentFile" className="block text-sm font-medium text-slate-700">
              Archivo de estudiantes (.xlsx)
            </label>
            <input
              id="studentFile"
              type="file"
              accept=".xlsx"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setStudentFile(event.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-slate-400"
            />
            <button type="submit" disabled={uploading !== null} className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:opacity-60">
              {uploading === "students" ? "Importando..." : "Importar estudiantes"}
            </button>
            {studentStatus ? <p role="status" className="text-sm text-slate-700">{studentStatus}</p> : null}
          </form>

          <form onSubmit={(event) => upload(event, "sessions")} className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold">Importar fechas y horarios</h2>
              <p className="mt-2 text-sm text-slate-600">Columnas: Fecha, Hora inicio, Hora fin.</p>
              <p className="mt-2 text-xs text-slate-500">Fechas: DD/MM/AAAA o AAAA-MM-DD. Horas: HH:MM. Máximo 5 MB.</p>
              <button type="button" onClick={() => void downloadFile("admin/templates/sessions", "plantilla-fechas.xlsx").catch(() => setSessionStatus("No se pudo descargar la plantilla."))} className="mt-3 text-sm font-semibold text-emerald-700 underline">Descargar plantilla de fechas</button>
            </div>
            <label htmlFor="sessionFile" className="block text-sm font-medium text-slate-700">
              Archivo de fechas (.xlsx)
            </label>
            <input
              id="sessionFile"
              type="file"
              accept=".xlsx"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSessionFile(event.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-slate-400"
            />
            <button type="submit" disabled={uploading !== null} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60">
              {uploading === "sessions" ? "Importando..." : "Importar fechas"}
            </button>
            {sessionStatus ? <p role="status" className="text-sm text-slate-700">{sessionStatus}</p> : null}
          </form>
        </div>
      </div>
    </main>
  );
}
