import { Global, Module } from '@nestjs/common';
import { Clock } from './application/clock.port';
import { TimezoneClock } from './infrastructure/clock/timezone-clock';

@Global()
@Module({
  providers: [{ provide: Clock, useClass: TimezoneClock }],
  exports: [Clock],
})
export class SharedModule {}
