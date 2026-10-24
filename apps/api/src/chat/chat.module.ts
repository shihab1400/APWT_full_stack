import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

@Module({
  imports: [ContentModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
