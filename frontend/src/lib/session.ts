export type Session = {
  id: string;
  username: string;
  role: "admin" | "student" | "platform";
  accessToken: string;
};

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const session = JSON.parse(localStorage.getItem("session") ?? "null");
    if (!session?.accessToken || !session.id || !session.username || !["admin", "student", "platform"].includes(session.role)) return null;
    return session;
  } catch {
    localStorage.removeItem("session");
    return null;
  }
}

export function signOut() {
  localStorage.removeItem("session");
  window.location.replace("/login");
}
