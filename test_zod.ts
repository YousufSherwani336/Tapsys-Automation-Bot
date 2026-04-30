import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
console.log(JSON.stringify(zodToJsonSchema(z.object({ key: z.string() }), { $refStrategy: 'none' })));
