import type { PrismaService } from '../../prisma/prisma.service.js';
import { ProvisionerService } from './provisioner.service.js';
import { sealSecret } from './platform-secrets.js';

type AwsCaller = {
  callAws(args: string[]): Promise<string>;
  aws(args: string[]): Promise<string>;
};

describe('Recuperación de Systems Manager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('espera y reintenta cuando la instancia todavía está reiniciándose', async () => {
    vi.useFakeTimers();
    const service = new ProvisionerService(
      {} as PrismaService,
    ) as unknown as AwsCaller;
    const call = vi
      .spyOn(service, 'callAws')
      .mockRejectedValueOnce(new Error('InvalidInstanceId'))
      .mockResolvedValueOnce('{}');
    const result = service.aws(['ssm', 'send-command']);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toBe('{}');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('no reintenta errores de permisos como si fueran demoras de arranque', async () => {
    const service = new ProvisionerService(
      {} as PrismaService,
    ) as unknown as AwsCaller;
    const call = vi
      .spyOn(service, 'callAws')
      .mockRejectedValueOnce(new Error('AccessDenied'));
    await expect(service.aws(['ssm', 'send-command'])).rejects.toThrow(
      'AccessDenied',
    );
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('Operaciones sobre los tres roles del tenant', () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalBucket = process.env.PLATFORM_ARTIFACT_BUCKET;
  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
    process.env.PLATFORM_ARTIFACT_BUCKET = originalBucket;
  });

  function fixture() {
    process.env.SESSION_SECRET = 'three-tier-operation-test-secret';
    process.env.PLATFORM_ARTIFACT_BUCKET = 'test-artifact-bucket';
    const tenant = {
      id: 'tenanttest',
      slug: 'universidad',
      engine: 'terraform',
      status: 'ACTIVE',
      instanceId: 'i-frontend',
      publicUrl: 'http://example.test',
      plan: { id: 'basic' },
      credentials: sealSecret(
        JSON.stringify({
          adminPassword: 'owner-test-secret',
          dbPassword: 'database-test-secret',
          sessionSecret: 'session-test-secret',
        }),
      ),
      resources: [
        { role: 'frontend', instanceId: 'i-frontend' },
        { role: 'backend', instanceId: 'i-backend' },
        { role: 'database', instanceId: 'i-database' },
      ],
    };
    const prisma = {
      platformTenant: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(tenant),
        update: vi.fn().mockResolvedValue({}),
      },
      platformOperation: { update: vi.fn().mockResolvedValue({}) },
      platformBackup: {
        upsert: vi.fn().mockResolvedValue({}),
        findFirstOrThrow: vi
          .fn()
          .mockResolvedValue({
            objectKey: 'mvp/backups/tenanttest/backup.dump',
          }),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const service = new ProvisionerService(
      prisma as unknown as PrismaService,
    ) as any;
    vi.spyOn(service, 'aws').mockResolvedValue('{}');
    vi.spyOn(service, 'command').mockResolvedValue('Terraform test');
    vi.spyOn(service, 'remote').mockResolvedValue('');
    vi.spyOn(service, 'waitReady').mockResolvedValue(undefined);
    return { service, prisma };
  }

  it('respalda desde la instancia PostgreSQL, no desde el frontend', async () => {
    const { service } = fixture();
    await service.execute({
      id: 'operationtest',
      tenantId: 'tenanttest',
      action: 'BACKUP',
      payload: null,
    });
    expect(service.remote).toHaveBeenCalledWith(
      'i-database',
      expect.arrayContaining([expect.stringContaining('pg_dump')]),
    );
  });

  it('suspende las tres instancias juntas', async () => {
    const { service } = fixture();
    await service.execute({
      id: 'operationtest',
      tenantId: 'tenanttest',
      action: 'SUSPEND',
      payload: null,
    });
    expect(service.aws).toHaveBeenCalledWith([
      'ec2',
      'stop-instances',
      '--instance-ids',
      'i-frontend',
      'i-backend',
      'i-database',
    ]);
  });

  it('reinicia el backend aunque falle una restauración en la base dedicada', async () => {
    const { service, prisma } = fixture();
    service.remote
      .mockResolvedValueOnce('')
      .mockRejectedValueOnce(new Error('Restore failed'))
      .mockResolvedValueOnce('');
    await service.execute({
      id: 'operationtest',
      tenantId: 'tenanttest',
      action: 'RESTORE',
      payload: { backupId: 'backup' },
    });
    expect(service.remote.mock.calls.map((call: string[]) => call[0])).toEqual([
      'i-backend',
      'i-database',
      'i-backend',
    ]);
    expect(prisma.platformOperation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'FAILED' }),
      }),
    );
  });
});
