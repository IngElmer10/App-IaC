import { Injectable } from '@nestjs/common';

export interface ModuleSummary {
  id: string;
  code: string;
  name: string;
  description?: string;
  active: boolean;
}

@Injectable()
export class AcademicModuleService {
  resolveActiveModule(modules: ModuleSummary[]) {
    const activeModules = modules.filter((module) => module.active);

    if (activeModules.length === 0) {
      return null;
    }

    return activeModules[activeModules.length - 1];
  }
}
