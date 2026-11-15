import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { MetricsService } from './modules/platform/metrics.controller.js';
import type { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const metrics = app.get(MetricsService);
  app.use((_request: Request, response: Response, next: NextFunction) => {
    const started = performance.now();
    response.on('finish', () => {
      metrics.requests++;
      if (response.statusCode >= 500) metrics.errors++;
      metrics.durationSeconds += (performance.now() - started) / 1000;
    });
    next();
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3001, process.env.BIND_ADDRESS ?? '127.0.0.1');
}
await bootstrap();
