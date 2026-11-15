import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getRoot() {
    return {
      name: 'control-asistencia-api',
      status: 'ready',
      version: '0.2.0',
      docs: '/api',
    };
  }

  getHealth() {
    return {
      status: 'ok',
      service: 'control-asistencia-api',
      timestamp: new Date().toISOString(),
      uptime: Number(process.uptime().toFixed(2)),
    };
  }
}
