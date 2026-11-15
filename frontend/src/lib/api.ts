import { getSession, signOut } from "./session";

export function apiUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/$/, "");
  return `${base}/${path.replace(/^\//, "")}`;
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (typeof window !== "undefined") {
    const session = getSession();
    if (session?.accessToken) {
      headers.set("Authorization", `Bearer ${session.accessToken}`);
    }
  }

  const response = await fetch(input, { signal: AbortSignal.timeout(30000), ...init, headers });
  if (response.status === 401 && typeof window !== "undefined") {
    signOut();
  }
  return response;
}

export async function downloadFile(path: string, filename: string) {
  const response = await authenticatedFetch(apiUrl(path));
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? "No se pudo descargar el archivo.");
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
