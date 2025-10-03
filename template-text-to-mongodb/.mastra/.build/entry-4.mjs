import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';

const mongodbGenerationSchema = z.object({
  operation: z.object({
    type: z.enum(["find", "aggregate", "count", "distinct"]).describe("Type of MongoDB operation"),
    collection: z.string().describe("Collection name to query"),
    query: z.any().optional().describe("MongoDB query object for find operations"),
    pipeline: z.array(z.any()).optional().describe("Aggregation pipeline for aggregate operations"),
    field: z.string().optional().describe("Field name for distinct operations"),
    options: z.object({
      limit: z.number().optional(),
      skip: z.number().optional(),
      sort: z.any().optional(),
      projection: z.any().optional()
    }).optional()
  }),
  explanation: z.string().describe("Explanation of what the query does"),
  confidence: z.number().min(0).max(1).describe("Confidence level in the generated query (0-1)"),
  assumptions: z.array(z.string()).describe("Any assumptions made while generating the query"),
  collections_used: z.array(z.string()).describe("List of collections used in the query"),
  queryComplexity: z.enum(["simple", "moderate", "complex"]).describe("Complexity level of the generated query")
});
const mongodbGenerationTool = createTool({
  id: "mongodb-generation",
  inputSchema: z.object({
    naturalLanguageQuery: z.string().describe("Natural language query from the user"),
    databaseSchema: z.object({
      database: z.object({
        name: z.string(),
        collections: z.number(),
        dataSize: z.number(),
        storageSize: z.number(),
        indexSize: z.number()
      }),
      collections: z.array(z.object({
        name: z.string(),
        type: z.string(),
        options: z.any().optional(),
        error: z.string().optional()
      })),
      schemas: z.array(z.object({
        collectionName: z.string(),
        sampleSize: z.number(),
        fields: z.record(z.any())
      })),
      indexes: z.array(z.object({
        collectionName: z.string(),
        indexes: z.array(z.object({
          name: z.string(),
          key: z.any(),
          unique: z.boolean().optional(),
          sparse: z.boolean().optional(),
          background: z.boolean().optional(),
          expireAfterSeconds: z.number().optional()
        }))
      })),
      stats: z.array(z.object({
        name: z.string(),
        documentCount: z.number(),
        averageObjectSize: z.number(),
        storageSize: z.number(),
        totalIndexSize: z.number(),
        indexCount: z.number()
      }))
    })
  }),
  description: "Generates MongoDB queries from natural language descriptions using database schema information",
  execute: async ({ context: { naturalLanguageQuery, databaseSchema } }) => {
    try {
      console.log("\u{1F50C} Generating MongoDB query for:", naturalLanguageQuery);
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
- Simple find: "show all users" \u2192 { type: "find", collection: "users" }
- Filtered find: "users from NYC" \u2192 { type: "find", collection: "users", query: { city: "NYC" } }
- Count: "how many orders" \u2192 { type: "count", collection: "orders" }
- Grouping: "sales by category" \u2192 { type: "aggregate", collection: "sales", pipeline: [{"$group": {"_id": "$category", "total": {"$sum": "$amount"}}}] }

PERFORMANCE CONSIDERATIONS:
- Use indexes when available
- Add appropriate $match stages early in aggregation pipelines
- Use $project to limit returned fields when possible
- Consider using $limit to prevent large result sets

Analyze the user's question carefully and generate the most appropriate MongoDB operation.`;
      const userPrompt = `Generate a MongoDB operation for this question: "${naturalLanguageQuery}"

Please provide:
1. The complete MongoDB operation object
2. A clear explanation of what the operation does
3. Your confidence level (0-1)
4. Any assumptions you made
5. List of collections used
6. Query complexity level`;
      const result = await generateObject({
        model: openai("gpt-4o"),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        schema: mongodbGenerationSchema,
        temperature: 0.1
        // Low temperature for more deterministic results
      });
      return result.object;
    } catch (error) {
      throw new Error(`Failed to generate MongoDB query: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});
function createSchemaDescription(databaseSchema) {
  let description = `Database: ${databaseSchema.database.name}
`;
  description += `Collections: ${databaseSchema.database.collections}
`;
  description += `Total Documents: ${databaseSchema.stats?.reduce((sum, stat) => sum + stat.documentCount, 0) || 0}

`;
  databaseSchema.schemas.forEach((schema) => {
    const stats = databaseSchema.stats.find((s) => s.name === schema.collectionName);
    const indexes = databaseSchema.indexes.find((i) => i.collectionName === schema.collectionName);
    description += `Collection: ${schema.collectionName}
`;
    if (stats) {
      description += `  Documents: ${stats.documentCount.toLocaleString()}
`;
      description += `  Average Size: ${Math.round(stats.averageObjectSize)} bytes
`;
      description += `  Indexes: ${stats.indexCount}
`;
    }
    description += `  Fields:
`;
    Object.entries(schema.fields).forEach(([fieldPath, fieldInfo]) => {
      description += `    - ${fieldPath}: ${fieldInfo.type}`;
      if (fieldInfo.alternativeTypes && fieldInfo.alternativeTypes.length > 0) {
        description += ` (also: ${fieldInfo.alternativeTypes.join(", ")})`;
      }
      description += ` [${fieldInfo.presence} present]`;
      if (fieldInfo.isRequired) {
        description += ` [REQUIRED]`;
      }
      if (fieldInfo.isArray) {
        description += ` [ARRAY]`;
      }
      if (fieldInfo.samples && fieldInfo.samples.length > 0) {
        const sampleStr = fieldInfo.samples.map(
          (s) => typeof s === "string" ? `"${s}"` : String(s)
        ).slice(0, 2).join(", ");
        description += ` (e.g., ${sampleStr})`;
      }
      description += "\n";
    });
    if (indexes && indexes.indexes.length > 0) {
      description += `  Indexes:
`;
      indexes.indexes.forEach((index) => {
        description += `    - ${index.name}: ${JSON.stringify(index.key)}`;
        if (index.unique) description += " [UNIQUE]";
        if (index.sparse) description += " [SPARSE]";
        description += "\n";
      });
    }
    description += "\n";
  });
  description += "COMMON QUERY PATTERNS:\n";
  description += '- Use ObjectId("...") for _id field comparisons\n';
  description += '- Use $regex with $options: "i" for case-insensitive text search\n';
  description += "- Use aggregation pipeline for grouping, counting, and complex transformations\n";
  description += "- Use $lookup stage to join data from multiple collections\n";
  description += "- Consider field presence and types when building queries\n\n";
  return description;
}
function validateMongoDbOperation(operation) {
  const errors = [];
  if (!operation.type || !["find", "aggregate", "count", "distinct"].includes(operation.type)) {
    errors.push("Operation type must be one of: find, aggregate, count, distinct");
  }
  if (!operation.collection || typeof operation.collection !== "string") {
    errors.push("Collection name is required and must be a string");
  }
  switch (operation.type) {
    case "aggregate":
      if (!operation.pipeline || !Array.isArray(operation.pipeline)) {
        errors.push("Aggregation pipeline must be an array");
      } else {
        const writeOps = ["$out", "$merge"];
        const hasWriteOps = operation.pipeline.some(
          (stage) => Object.keys(stage).some((key) => writeOps.includes(key))
        );
        if (hasWriteOps) {
          errors.push("Pipeline contains write operations which are not allowed");
        }
      }
      break;
    case "distinct":
      if (!operation.field || typeof operation.field !== "string") {
        errors.push("Field name is required for distinct operations");
      }
      break;
  }
  return errors;
}

export { mongodbGenerationTool, validateMongoDbOperation };
