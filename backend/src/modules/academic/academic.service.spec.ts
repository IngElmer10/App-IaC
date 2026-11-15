import { AcademicModuleService } from './academic.service.js';

describe('AcademicModuleService', () => {
  it('should keep only one active academic module', () => {
    const service = new AcademicModuleService();

    const modules = [
      { id: 'm1', active: true, code: '2025-1', name: 'Primer Modulo' },
      { id: 'm2', active: true, code: '2025-2', name: 'Segundo Modulo' },
    ];

    const result = service.resolveActiveModule(modules as never[]);

    expect(result).toMatchObject({ id: 'm2' });
  });
});
