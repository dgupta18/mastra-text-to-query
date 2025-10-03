import { z as zodToJsonSchema$1 } from './zodToJsonSchema.mjs';

// src/zod-to-json.ts
function zodToJsonSchema(zodSchema, target = "jsonSchema7", strategy = "relative") {
  {
    return zodToJsonSchema$1(zodSchema, {
      $refStrategy: strategy,
      target
    });
  }
}

export { zodToJsonSchema };
