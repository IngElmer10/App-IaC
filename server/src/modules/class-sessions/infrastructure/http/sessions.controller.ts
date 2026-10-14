import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { Roles } from '../../../../shared/infrastructure/security/decorators';
import { ListSessionsUseCase } from '../../application/list-sessions.use-case';

@Controller('sessions')
@Roles('ADMIN')
export class SessionsController {
  constructor(private readonly listSessions: ListSessionsUseCase) {}

  @Get()
  list(@Query('moduleId', new ParseIntPipe({ optional: true })) moduleId?: number) {
    return this.listSessions.execute(moduleId);
  }
}
