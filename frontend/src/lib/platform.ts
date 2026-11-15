import { z } from "zod";
import { apiUrl, authenticatedFetch } from "./api";

export type Plan = { id: string; code: string; name: string; description: string; instanceType: string; vcpu: number; memoryMb: number; storageGb: number; maxStudents: number; maxSessions: number };
export type Operation = { id: string; tenantId: string; action: string; state: string; progress: number; actor: string; logs: string[]; error: string | null; createdAt: string; appVersion: string; templateVersion: string; toolVersion: string | null; tenant?: { name: string } };
export type Backup = { id: string; createdAt: string; objectKey: string };
export type Alert = { id: string; name: string; message: string; state: string; detectedAt: string; tenant?: { name: string } };
export type TenantResource = { role: "frontend" | "backend" | "database"; instanceId: string; name: string; privateIp: string; publicIp: string; instanceType?: string };
export type Tenant = { id: string; slug: string; name: string; contactEmail: string; contactPhone?: string; color: string; architectureVersion: number; resources: TenantResource[] | null; environment: string; engine: string; status: string; plan: Plan; publicUrl: string | null; instanceId: string | null; deployedVersion: string | null; createdAt: string; health: { available: boolean; database?: boolean; nodes?: { role: string; available: boolean }[]; latencyMs?: number; students?: number; sessions?: number; checkedAt: string } | null; operations?: Operation[]; backups?: Backup[]; alerts?: Alert[] };
export type Overview = { tenants: Tenant[]; plans: Plan[]; operations: Operation[]; alerts: Alert[]; pendingRequests: number; region: string; cloudConfigured: boolean };
export type TenantRequest = { id: string; name: string; slug: string; contactEmail: string; contactPhone: string; color: string; environment: string; engine: string; plan: Plan; status: string; rejectionReason: string | null; tenantId: string | null; createdAt: string; reviewedBy: string | null; reviewedAt: string | null };

export const tenantSchema = z.object({
  name: z.string().min(3, "Escribe al menos 3 caracteres.").max(80),
  slug: z.string().regex(/^[a-z][a-z0-9-]{2,30}$/, "Usa entre 3 y 31 letras minúsculas, números o guiones."),
  contactEmail: z.email("Ingresa un correo válido."),
  environment: z.enum(["dev", "staging", "prod"]),
  engine: z.enum(["terraform", "cloudformation", "opentofu", "pulumi"]),
  planId: z.string().min(1, "Selecciona un plan."),
  adminPassword: z.string().min(10, "Usa al menos 10 caracteres.").max(100),
  contactPhone: z.string().regex(/^\+?[0-9 ()-]{7,25}$/, "Ingresa un teléfono válido.").or(z.literal("")).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Selecciona un color válido."),
});
export type TenantValues = z.infer<typeof tenantSchema>;
export const tenantRequestSchema = tenantSchema.omit({ contactPhone: true }).extend({ phone: z.string().regex(/^\+?[0-9 ()-]{7,25}$/, "Ingresa un teléfono de contacto válido."), engine: z.enum(["terraform", "cloudformation"]), website: z.string().max(0).optional() });
export type TenantRequestValues = z.infer<typeof tenantRequestSchema>;

export async function platformRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(apiUrl(`platform/${path}`), { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
  const payload = await response.json();
  if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(" ") : payload?.message || "No se pudo completar la operación.");
  return payload;
}

export const statusLabels: Record<string, string> = { PENDING: "Pendiente", APPROVED: "Aprobada", REJECTED: "Rechazada", PROVISIONING: "Desplegando", ACTIVE: "Activo", SUSPENDED: "Suspendido", FAILED: "Fallido", DELETED: "Eliminado", QUEUED: "En cola", RUNNING: "En ejecución", SUCCEEDED: "Completado", FIRING: "Activa", RESOLVED: "Resuelta" };
export const actionLabels: Record<string, string> = { DEPLOY: "Desplegar", UPDATE: "Actualizar", MIGRATE: "Separar en 3 instancias", SUSPEND: "Suspender", RESUME: "Reanudar", BACKUP: "Respaldar", RESTORE: "Restaurar", DELETE: "Eliminar", CHANGE_PLAN: "Cambiar plan", TEST_ALERT: "Probar alerta", CLEAR_ALERT: "Resolver prueba" };
