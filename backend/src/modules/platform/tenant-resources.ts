import type { PlatformTenant } from '@prisma/client';

export type TenantRole = 'frontend' | 'backend' | 'database';
export const tenantRoles: TenantRole[] = ['frontend', 'backend', 'database'];
export type TenantResource = {
  role: TenantRole;
  instanceId: string;
  privateIp: string;
  publicIp: string;
  name: string;
  instanceType?: string;
  storageGb?: number;
};

export function tenantResources(
  tenant: Pick<PlatformTenant, 'resources' | 'instanceId' | 'slug'>,
): TenantResource[] {
  if (!Array.isArray(tenant.resources)) return [];
  return tenant.resources.filter((value) =>
    Boolean(
      value &&
      typeof value === 'object' &&
      'role' in value &&
      'instanceId' in value,
    ),
  ) as TenantResource[];
}

export function tenantResource(
  tenant: Pick<PlatformTenant, 'resources' | 'instanceId' | 'slug'>,
  role: TenantRole,
) {
  const resources = tenantResources(tenant);
  if (!resources.length) return tenant.instanceId;
  const resource = resources.find((candidate) => candidate.role === role);
  if (!resource)
    throw new Error(`No se encontró la instancia ${role} del tenant.`);
  return resource.instanceId;
}

export function tenantHostname(slug: string, address: string) {
  if (
    !/^[a-z][a-z0-9-]{2,30}$/.test(slug) ||
    !/^\d{1,3}(\.\d{1,3}){3}$/.test(address) ||
    address.split('.').some((octet) => Number(octet) > 255)
  )
    throw new Error('Identificador o dirección de la institución inválidos.');
  return `${slug}.${address}.sslip.io`;
}
