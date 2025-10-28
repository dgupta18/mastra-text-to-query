/**
 * mongodb-generation-tool.ts
 * -------------------------
 * Purpose: Convert a natural language query plus a database schema into a
 * structured MongoDB operation. The tool returns an object containing an
 * `operation` (type, collection, query|pipeline|field, options) as well as
 * `explanation`, `confidence`, `assumptions`, and `collections_used`.
 *
 * Important notes / pitfalls:
 * - The tool returns `query` and `pipeline` as JSON strings; callers must
 *   JSON.parse them into objects/arrays before passing to the execution tool.
 * - Avoid passing explicit `null` values for numeric options (limit/skip)
 *   or for `field`. Prefer numbers or omit the property so downstream
 *   validation can apply defaults.
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';

// Define the schema for MongoDB query generation output
const mongodbGenerationSchema = z.object({
  type: z.enum(['find', 'aggregate', 'count', 'distinct']).describe('Type of MongoDB operation'),
  collection: z.string().describe('Collection name to query'),
  query: z.string().optional().describe('MongoDB query as JSON string for find operations'),
  pipeline: z.string().optional().describe('Aggregation pipeline as JSON string for aggregate operations'),
  field: z.string().optional().describe('Field name for distinct operations'),
  limit: z.number().optional().describe('Limit number of results'),
  skip: z.number().optional().describe('Skip number of documents'),
  sort: z.string().optional().describe('Sort object as JSON string'),
  projection: z.string().optional().describe('Projection object as JSON string'),
  explanation: z.string().describe('Explanation of what the query does'),
  confidence: z.number().min(0).max(1).describe('Confidence level in the generated query (0-1)'),
  assumptions: z.array(z.string()).describe('Any assumptions made while generating the query'),
  collections_used: z.array(z.string()).describe('List of collections used in the query'),
  queryComplexity: z.enum(['simple', 'moderate', 'complex']).describe('Complexity level of the generated query'),
});

export const mongodbGenerationTool = createTool({
  id: 'mongodb-generation',
  inputSchema: z.object({
    naturalLanguageQuery: z.string().describe('Natural language query from the user'),
    databaseSchema: z.object({
      database: z.object({
        name: z.string(),
        collections: z.number(),
        dataSize: z.number(),
        storageSize: z.number(),
        indexSize: z.number(),
      }),
      collections: z.array(z.object({
        name: z.string(),
        type: z.string().optional(),
        options: z.any().optional(),
        error: z.string().optional(),
      })),
      schemas: z.array(z.object({
        collectionName: z.string(),
        sampleSize: z.number().optional(),
        fields: z.record(z.any()).optional().default({}),
      })),
      indexes: z.array(z.object({
        collectionName: z.string(),
        indexes: z.array(z.object({
          name: z.string(),
          key: z.any(),
          unique: z.boolean().optional(),
          sparse: z.boolean().optional(),
          background: z.boolean().optional(),
          expireAfterSeconds: z.number().nullable().optional(),
        })),
      })).optional().default([]),
      stats: z.array(z.object({
        name: z.string(),
        documentCount: z.number(),
        averageObjectSize: z.number(),
        storageSize: z.number(),
        totalIndexSize: z.number(),
        indexCount: z.number(),
      })).optional().default([]),
    }),
  }),
  description: 'Generates MongoDB queries from natural language descriptions using database schema information',
  execute: async ({ context: { naturalLanguageQuery, databaseSchema } }) => {
    try {
      console.log('🔌 Generating MongoDB query for:', naturalLanguageQuery);
      
      // Create a comprehensive schema description for the AI
      const schemaDescription = createSchemaDescription(databaseSchema);

      const systemPrompt = `You are an expert MongoDB query generator. Your task is to convert natural language questions into accurate MongoDB operations.

DATABASE SCHEMA:
${schemaDescription}

MONGODB OPERATION TYPES:
1. **find**: For simple document retrieval with filters, projections, sorting
   - Use for: "find users", "get products", "show documents where..."
   - Format: { type: "find", collection: "users", query: {...}, options: {...} }

2. **aggregate**: For complex data processing, grouping, joining, transformations
   - Use for: "group by", "count by category", "average", "sum", "join data"
   - Format: { type: "aggregate", collection: "orders", pipeline: [...] }

3. **count**: For counting documents matching criteria
   - Use for: "how many", "count of", "total number"
   - Format: { type: "count", collection: "users", query: {...} }

4. **distinct**: For getting unique values of a field
   - Use for: "unique values", "distinct", "different types"
   - Format: { type: "distinct", collection: "products", field: "category", query: {...} }

MONGODB QUERY RULES:
1. Only generate read-only operations (find, aggregate, count, distinct)
2. Use proper MongoDB syntax and operators
3. For text searches, use case-insensitive regex: { field: { $regex: "pattern", $options: "i" } }
4. Use ObjectId for _id field comparisons when needed
5. Use appropriate data types for comparisons
6. Limit results appropriately (default 100 for find operations)
7. Use aggregation for complex operations like grouping, counting, averaging
8. Consider index usage for performance

OUTPUT FORMAT:
- For 'query' field: Provide the MongoDB query object as a JSON string
- For 'pipeline' field: Provide the aggregation pipeline array as a JSON string  
- For 'sort' and 'projection' options: Provide as JSON strings
- Example: query: '{"price": {"$gte": 100}}' not query: {"price": {"$gte": 100}}

AGGREGATION PIPELINE STAGES:
- $match: Filter documents (like WHERE in SQL)
- $group: Group documents and perform aggregations
- $sort: Sort documents
- $project: Shape/transform documents (like SELECT in SQL)
- $limit: Limit number of results
- $skip: Skip documents for pagination
- $lookup: Join with other collections
- $unwind: Deconstruct arrays

QUERY EXAMPLES:
- Simple find: "show all users" → { type: "find", collection: "users" }
- Filtered find: "users from NYC" → { type: "find", collection: "users", query: { city: "NYC" } }
- Count: "how many orders" → { type: "count", collection: "orders" }
- Grouping: "sales by category" → { type: "aggregate", collection: "sales", pipeline: [{"$group": {"_id": "$category", "total": {"$sum": "$amount"}}}] }

PERFORMANCE CONSIDERATIONS:
- Use indexes when available
- Add appropriate $match stages early in aggregation pipelines
- Use $project to limit returned fields when possible
- Consider using $limit to prevent large result sets

Analyze the user's question carefully and generate the most appropriate MongoDB operation.`;

      const userPrompt = `Generate a MongoDB operation for this question: "${naturalLanguageQuery}"

Please provide:
1. The complete MongoDB operation object (with query, pipeline, sort, projection as JSON strings)
2. A clear explanation of what the operation does
3. Your confidence level (0-1)
4. Any assumptions you made
5. List of collections used
6. Query complexity level

REMEMBER: Return complex objects like query, pipeline, sort, and projection as JSON strings, not objects.`;

      const result = await generateObject({
        model: openai('gpt-4o'),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        schema: mongodbGenerationSchema,
        temperature: 0.1, // Low temperature for more deterministic results
      });

      // Parse JSON strings back into objects and restructure for consuming code
      const parsedResult = {
        operation: {
          type: result.object.type,
          collection: result.object.collection,
          query: result.object.query ? JSON.parse(result.object.query) : undefined,
          pipeline: result.object.pipeline ? JSON.parse(result.object.pipeline) : undefined,
          field: result.object.field,
          options: {
            limit: result.object.limit,
            skip: result.object.skip,
            sort: result.object.sort ? JSON.parse(result.object.sort) : undefined,
            projection: result.object.projection ? JSON.parse(result.object.projection) : undefined,
          },
        },
        explanation: result.object.explanation,
        confidence: result.object.confidence,
        assumptions: result.object.assumptions,
        collections_used: result.object.collections_used,
        queryComplexity: result.object.queryComplexity,
      };

      return parsedResult;
    } catch (error) {
      throw new Error(`Failed to generate MongoDB query: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

function createSchemaDescription(databaseSchema: any): string {
  let description = `Database: ${databaseSchema.database.name}\n`;
  description += `Collections: ${databaseSchema.database.collections}\n`;
  description += `Total Documents: ${databaseSchema.stats?.reduce((sum: number, stat: any) => sum + stat.documentCount, 0) || 0}\n\n`;

  // Describe each collection
  databaseSchema.schemas.forEach((schema: any) => {
    const stats = databaseSchema.stats.find((s: any) => s.name === schema.collectionName);
    const indexes = databaseSchema.indexes.find((i: any) => i.collectionName === schema.collectionName);

    description += `Collection: ${schema.collectionName}\n`;
    if (stats) {
      description += `  Documents: ${stats.documentCount.toLocaleString()}\n`;
      description += `  Average Size: ${Math.round(stats.averageObjectSize)} bytes\n`;
      description += `  Indexes: ${stats.indexCount}\n`;
    }

    description += `  Fields:\n`;
    Object.entries(schema.fields).forEach(([fieldPath, fieldInfo]: [string, any]) => {
      description += `    - ${fieldPath}: ${fieldInfo.type}`;
      if (fieldInfo.alternativeTypes && fieldInfo.alternativeTypes.length > 0) {
        description += ` (also: ${fieldInfo.alternativeTypes.join(', ')})`;
      }
      description += ` [${fieldInfo.presence} present]`;
      if (fieldInfo.isRequired) {
        description += ` [REQUIRED]`;
      }
      if (fieldInfo.isArray) {
        description += ` [ARRAY]`;
      }
      if (fieldInfo.samples && fieldInfo.samples.length > 0) {
        const sampleStr = fieldInfo.samples.map((s: any) => 
          typeof s === 'string' ? `"${s}"` : String(s)
        ).slice(0, 2).join(', ');
        description += ` (e.g., ${sampleStr})`;
      }
      description += '\n';
    });

    if (indexes && indexes.indexes.length > 0) {
      description += `  Indexes:\n`;
      indexes.indexes.forEach((index: any) => {
        description += `    - ${index.name}: ${JSON.stringify(index.key)}`;
        if (index.unique) description += ' [UNIQUE]';
        if (index.sparse) description += ' [SPARSE]';
        description += '\n';
      });
    }

    description += '\n';
  });

  // Add relationship hints if we can infer them
  description += 'COMMON QUERY PATTERNS:\n';
  description += '- Use ObjectId("...") for _id field comparisons\n';
  description += '- Use $regex with $options: "i" for case-insensitive text search\n';
  description += '- Use aggregation pipeline for grouping, counting, and complex transformations\n';
  description += '- Use $lookup stage to join data from multiple collections\n';
  description += '- Consider field presence and types when building queries\n\n';

  return description;
}

// Helper function to validate generated MongoDB operations
export function validateMongoDbOperation(operation: any): string[] {
  const errors: string[] = [];

  if (!operation.type || !['find', 'aggregate', 'count', 'distinct'].includes(operation.type)) {
    errors.push('Operation type must be one of: find, aggregate, count, distinct');
  }

  if (!operation.collection || typeof operation.collection !== 'string') {
    errors.push('Collection name is required and must be a string');
  }

  switch (operation.type) {
    case 'aggregate':
      if (!operation.pipeline || !Array.isArray(operation.pipeline)) {
        errors.push('Aggregation pipeline must be an array');
      } else {
        // Check for write operations
        const writeOps = ['$out', '$merge'];
        const hasWriteOps = operation.pipeline.some((stage: any) => 
          Object.keys(stage).some(key => writeOps.includes(key))
        );
        if (hasWriteOps) {
          errors.push('Pipeline contains write operations which are not allowed');
        }
      }
      break;

    case 'distinct':
      if (!operation.field || typeof operation.field !== 'string') {
        errors.push('Field name is required for distinct operations');
      }
      break;
  }

  return errors;
}
