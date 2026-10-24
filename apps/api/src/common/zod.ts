import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/** Validates a request part against a shared Zod schema. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        errors: z.flattenError(result.error).fieldErrors,
      });
    }
    return result.data;
  }
}

/** OpenAPI schema for Swagger's @ApiBody, derived from the same Zod schema. */
export function openApiSchema(schema: z.ZodType): Record<string, any> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: 'input' }) as Record<
    string,
    any
  >;
  return rest;
}
