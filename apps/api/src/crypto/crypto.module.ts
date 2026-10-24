import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { FieldCipher, parseKey } from './field-cipher.js';

@Global()
@Module({
  providers: [
    {
      provide: FieldCipher,
      inject: [ENV],
      useFactory: (env: Env) => new FieldCipher(parseKey(env.DATA_ENCRYPTION_KEY)),
    },
  ],
  exports: [FieldCipher],
})
export class CryptoModule {}
