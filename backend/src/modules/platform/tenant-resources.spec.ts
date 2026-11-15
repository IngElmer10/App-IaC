import {
  tenantHostname,
  tenantResource,
  tenantResources,
} from './tenant-resources.js';

describe('Identidad e inventario de las tres instancias', () => {
  it('rechaza una IPv4 fuera de rango', () => {
    expect(() => tenantHostname('uagrm', '999.1.2.3')).toThrow();
  });
  it('no dirige una restauración al frontend si falta el nodo de base de datos', () => {
    expect(() =>
      tenantResource(
        {
          instanceId: 'i-front',
          slug: 'uagrm',
          resources: [{ role: 'frontend', instanceId: 'i-front' }],
        },
        'database',
      ),
    ).toThrow();
  });
  const tenant = {
    instanceId: 'i-front',
    slug: 'uagrm',
    resources: [
      {
        role: 'frontend',
        instanceId: 'i-front',
        privateIp: '172.31.1.1',
        publicIp: '3.1.2.3',
        name: 'uagrm-frontend-dev',
      },
      {
        role: 'backend',
        instanceId: 'i-back',
        privateIp: '172.31.1.2',
        publicIp: '3.1.2.4',
        name: 'uagrm-backend-dev',
      },
      {
        role: 'database',
        instanceId: 'i-db',
        privateIp: '172.31.1.3',
        publicIp: '3.1.2.5',
        name: 'uagrm-database-dev',
      },
    ],
  };
  it('resuelve un hostname real con identificador y dirección', () => {
    expect(tenantHostname('uagrm', '3.1.2.3')).toBe('uagrm.3.1.2.3.sslip.io');
  });
  it('dirige respaldos y restauraciones al nodo correcto', () => {
    expect(tenantResources(tenant)).toHaveLength(3);
    expect(tenantResource(tenant, 'database')).toBe('i-db');
    expect(tenantResource(tenant, 'backend')).toBe('i-back');
  });
  it('conserva compatibilidad con las instituciones previas a migrar', () => {
    expect(tenantResource({ ...tenant, resources: null }, 'database')).toBe(
      'i-front',
    );
  });
  it('rechaza identificadores que podrían inyectar comandos', () => {
    expect(() => tenantHostname('uagrm;bad', '3.1.2.3')).toThrow();
  });
});
