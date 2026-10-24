import { Global, Module } from '@nestjs/common';
import { TierService } from './tier.service.js';

@Global()
@Module({
  providers: [TierService],
  exports: [TierService],
})
export class SubscriptionsModule {}
