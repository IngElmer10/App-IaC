"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiUrl, authenticatedFetch } from "../../../lib/api";

type Student = {
  id: string;
  registrationCode: string;
  fullName: string;
  email: string;
};

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState({ value: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = submittedSearch.value ? `?search=${encodeURIComponent(submittedSearch.value)}` : "";
    authenticatedFetch(apiUrl(`admin/students${query}`))
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.message ?? "No fue posible consultar la lista.");
        }
        setStudents(payload);
      })
      .catch((requestError: Error) => {
        setError(requestError.message || "No fue posible conectar con el servidor.");
      })
      .finally(() => setIsLoading(false));
  }, [submittedSearch]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setSubmittedSearch({ value: search.trim() });
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-800">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-300 pb-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Administración</p>
            <h1 className="mt-2 text-3xl font-bold">Estudiantes del módulo activo</h1>
          </div>
          <nav className="flex gap-3">
            <a href="/admin" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-white">
              Panel
            </a>
            <a href="/admin/import" className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-400">
              Cargar Excel
            </a>
          </nav>
        </header>

        <form onSubmit={handleSearch} className="flex flex-col gap-3 border-b border-slate-300 py-5 sm:flex-row">
          <label htmlFor="studentSearch" className="sr-only">Buscar por nombre o número de registro</label>
          <input
            id="studentSearch"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre o número de registro"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-600"
          />
          <button type="submit" className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">
            Buscar
          </button>
          {submittedSearch.value ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setIsLoading(true);
                setError("");
                setSubmittedSearch({ value: "" });
              }}
              className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium hover:bg-white"
            >
              Limpiar
            </button>
          ) : null}
        </form>

        <div className="flex items-center justify-between py-4 text-sm text-slate-600">
          <p>{isLoading ? "Cargando lista..." : `${students.length} ${students.length === 1 ? "estudiante" : "estudiantes"}`}</p>
        </div>

        {error ? <p role="alert" className="border-l-4 border-red-600 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}

        <div className="overflow-x-auto border-y border-slate-300 bg-white">
          <table className="w-full min-w-[620px] border-collapse text-left text-sm">
            <thead className="bg-slate-200 text-xs uppercase text-slate-600">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">Número de registro</th>
                <th scope="col" className="px-5 py-3 font-semibold">Nombre completo</th>
                <th scope="col" className="px-5 py-3 font-semibold">Correo electrónico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {!isLoading && !error && students.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-10 text-center text-slate-500">No hay estudiantes que coincidan con la búsqueda.</td></tr>
              ) : null}
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-emerald-50/50">
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">{student.registrationCode}</td>
                  <td className="px-5 py-3">{student.fullName}</td>
                  <td className="px-5 py-3 text-slate-600">{student.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
