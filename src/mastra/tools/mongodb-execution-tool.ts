/**
 * mongodb-execution-tool.ts
 * -------------------------
 * Purpose: Execute read-only MongoDB operations (find, aggregate, count, distinct).
 * Input expectations (tool inputSchema):
 * - connectionString: string
 * - dbName: optional string (falls back to DEFAULT_DB_NAME)
 * - operation: object with:
 *    - type: 'find'|'aggregate'|'count'|'distinct'
 *    - collection: string
 *    - query: optional object (for find/count)
 *    - pipeline: optional array (for aggregate)
 *    - field: optional string (for distinct)
 *    - options: optional object with numeric `limit` and `skip` (numbers, not null)
 *
 * Common pitfalls:
 * - Make sure `pipeline` is an array of stage objects. If missing, the tool
 *   will add a default $limit stage (100) when executing aggregates.
 * - Avoid explicit `null` values in `operation.options`; the validation
 *   schema expects numbers or absent fields so prefer to omit or set numeric
 *   defaults before invoking the tool.
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { MongoClient, Db } from 'mongodb';
import { DEFAULT_DB_NAME } from '../constants';

const createDatabaseConnection = async (connectionString: string, dbName: string = DEFAULT_DB_NAME): Promise<{ client: MongoClient; db: Db }> => {
  const client = new MongoClient(connectionString, {
    serverSelectionTimeoutMS: 30000, // 30 seconds
    connectTimeoutMS: 30000, // 30 seconds
    socketTimeoutMS: 60000, // 1 minute
  });

  await client.connect();
  
  const db = client.db(dbName);

  return { client, db };
};

export const mongodbExecutionTool = createTool({
  id: 'mongodb-execution',
  inputSchema: z.object({
    connectionString: z.string().describe('MongoDB connection string'),
    dbName: z.string().optional().describe('Database name (default: ' + DEFAULT_DB_NAME + ')'),
    operation: z.object({
      type: z.enum(['find', 'aggregate', 'count', 'distinct']).describe('Type of MongoDB operation'),
      collection: z.string().describe('Collection name to query'),
      query: z.any().optional().describe('MongoDB query object for find operations'),
      pipeline: z.array(z.any()).optional().describe('Aggregation pipeline for aggregate operations'),
      field: z.string().optional().describe('Field name for distinct operations'),
      options: z.object({
        limit: z.number().optional().default(100),
        skip: z.number().optional().default(0),
        sort: z.any().optional(),
        projection: z.any().optional(),
      }).optional().default({}),
    }),
  }),
  description: 'Safely executes read-only MongoDB operations including find, aggregate, count, and distinct queries',
  execute: async ({ context: { connectionString, dbName, operation } }) => {
    let client: MongoClient | null = null;

    try {
      console.log(`🔌 Connecting to MongoDB to execute ${operation.type} operation...`);
      const { client: mongoClient, db } = await createDatabaseConnection(connectionString, dbName || DEFAULT_DB_NAME);
      client = mongoClient;
      console.log('✅ Connected to MongoDB for query execution');

      const collection = db.collection(operation.collection);
      const startTime = Date.now();

      let result: any;
      let resultCount = 0;

      switch (operation.type) {
        case 'find':
          const findQuery = operation.query || {};
          const findOptions = {
            limit: operation.options?.limit || 100,
            skip: operation.options?.skip || 0,
            sort: operation.options?.sort,
            projection: operation.options?.projection,
          };

          const findCursor = collection.find(findQuery, findOptions);
          result = await findCursor.toArray();
          resultCount = result.length;

          // Get total count for pagination info
          const totalCount = await collection.countDocuments(findQuery);

          result = {
            documents: result,
            totalCount,
            returnedCount: resultCount,
            hasMore: (operation.options?.skip || 0) + resultCount < totalCount,
            query: findQuery,
            options: findOptions,
          };
          break;

        case 'aggregate':
          if (!operation.pipeline || !Array.isArray(operation.pipeline)) {
            throw new Error('Aggregation pipeline is required for aggregate operations');
          }

          // Add limit to pipeline if not already present
          const pipeline = [...operation.pipeline];
          const hasLimit = pipeline.some(stage => '$limit' in stage);
          if (!hasLimit) {
            pipeline.push({ $limit: operation.options?.limit || 100 });
          }

          const aggregateCursor = collection.aggregate(pipeline);
          const aggregateResults = await aggregateCursor.toArray();
          resultCount = aggregateResults.length;

          result = {
            documents: aggregateResults,
            returnedCount: resultCount,
            pipeline: operation.pipeline,
            appliedLimit: operation.options?.limit || 100,
          };
          break;

        case 'count':
          const countQuery = operation.query || {};
          const count = await collection.countDocuments(countQuery);
          
          result = {
            count,
            query: countQuery,
          };
          resultCount = 1; // For execution stats
          break;

        case 'distinct':
          if (!operation.field) {
            throw new Error('Field name is required for distinct operations');
          }

          const distinctQuery = operation.query || {};
          const distinctValues = await collection.distinct(operation.field, distinctQuery);
          resultCount = distinctValues.length;

          result = {
            field: operation.field,
            values: distinctValues.slice(0, operation.options?.limit || 100),
            totalUniqueValues: distinctValues.length,
            query: distinctQuery,
          };
          break;

        default:
          throw new Error(`Unsupported operation type: ${operation.type}`);
      }

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        operation: operation.type,
        collection: operation.collection,
        data: result,
        metadata: {
          executionTimeMs: executionTime,
          resultCount,
          connectionString: maskConnectionString(connectionString),
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        operation: operation.type,
        collection: operation.collection,
        error: errorMessage,
        metadata: {
          connectionString: maskConnectionString(connectionString),
        },
      };
    } finally {
      if (client) {
        await client.close();
      }
    }
  },
});

// Helper function to mask sensitive information in connection string
function maskConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    // If URL parsing fails, just mask the entire string
    return connectionString.replace(/\/\/[^@]+@/, '//***@');
  }
}

// Validation helper for MongoDB operations
export function validateMongoOperation(operation: any): string[] {
  const errors: string[] = [];

  if (!operation.collection || typeof operation.collection !== 'string') {
    errors.push('Collection name is required and must be a string');
  }

  switch (operation.type) {
    case 'find':
      // Find operations are flexible - query can be empty object
      break;

    case 'aggregate':
      if (!operation.pipeline || !Array.isArray(operation.pipeline)) {
        errors.push('Aggregation pipeline must be an array of stages');
      } else {
        // Validate that we only have read operations in the pipeline
        const writeOperations = ['$out', '$merge', '$replaceRoot', '$addFields', '$set', '$unset'];
        const hasWriteOps = operation.pipeline.some((stage: any) => 
          Object.keys(stage).some(key => writeOperations.includes(key))
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

    case 'count':
      // Count operations are flexible - query can be empty
      break;

    default:
      errors.push(`Unsupported operation type: ${operation.type}`);
  }

  return errors;
}