import type { PrismaService } from '../../prisma/prisma.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  const findStudent = vi.fn();

  beforeEach(() => {
    findStudent.mockReset();
    const prisma = { student: { findFirst: findStudent } };
    controller = new AuthController(new AuthService(prisma as unknown as PrismaService));
  });

  it('authenticates the configured admin without a student lookup', async () => {
    const result = await controller.login({ username: 'admin', password: 'admin123' });

    expect(result).toMatchObject({
      user: {
        username: 'admin',
        role: 'admin',
      },
      authenticated: true,
    });
    expect(findStudent).not.toHaveBeenCalled();
  });

  it('authenticates an active database student by registration code', async () => {
    findStudent.mockResolvedValue({ id: 'student-1', registrationCode: '2024001' });
    const result = await controller.login({ username: '2024001', password: '12345678' });

    expect(result).toMatchObject({
      user: {
        id: 'student-1',
        username: '2024001',
        role: 'student',
      },
      authenticated: true,
    });
    expect(findStudent).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ active: true }),
    }));
  });

  it('rejects a student identifier that is not in the active module', async () => {
    findStudent.mockResolvedValue(null);

    await expect(controller.login({ username: '1000', password: '12345678' })).rejects.toThrow(
      'No eres un estudiante del módulo activo.',
    );
  });

  it('rejects invalid admin credentials', async () => {
    await expect(controller.login({ username: 'admin', password: 'wrong' })).rejects.toThrow(
      'Credenciales inválidas',
    );
  });
});
