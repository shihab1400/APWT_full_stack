import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ACCESS_TOKEN_COOKIE } from '@mindease/shared';
import { AppModule } from './app.module.js';
import { ENV, type Env } from './config/env.js';
import { configureApp } from './setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = app.get<Env>(ENV);
  configureApp(app, env);

  const swagger = new DocumentBuilder()
    .setTitle('MindEase Oasis API')
    .setDescription('AI & expert support for mental health')
    .setVersion('0.1.0')
    .addCookieAuth(ACCESS_TOKEN_COOKIE)
    .build();
  const docs = env.ENABLE_API_DOCS ? env.ENABLE_API_DOCS === 'true' : env.NODE_ENV !== 'production';
  if (docs) SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, swagger));

  await app.listen(env.PORT);
  console.log(`API on http://localhost:${env.PORT}/api  ·  docs at /api/docs`);
}
await bootstrap();
