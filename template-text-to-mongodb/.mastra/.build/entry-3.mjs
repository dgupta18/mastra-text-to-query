import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { MongoClient } from 'mongodb';

const createDatabaseConnection = async (connectionString) => {
  const client = new MongoClient(connectionString, {
    serverSelectionTimeoutMS: 3e4,
    // 30 seconds
    connectTimeoutMS: 3e4,
    // 30 seconds
    socketTimeoutMS: 6e4
    // 1 minute
  });
  await client.connect();
  const url = new URL(connectionString);
  const dbName = url.pathname.slice(1) || "test";
  const db = client.db(dbName);
  return { client, db };
};
const mongodbExecutionTool = createTool({
  id: "mongodb-execution",
  inputSchema: z.object({
    connectionString: z.string().describe("MongoDB connection string"),
    operation: z.object({
      type: z.enum(["find", "aggregate", "count", "distinct"]).describe("Type of MongoDB operation"),
      collection: z.string().describe("Collection name to query"),
      query: z.any().optional().describe("MongoDB query object for find operations"),
      pipeline: z.array(z.any()).optional().describe("Aggregation pipeline for aggregate operations"),
      field: z.string().optional().describe("Field name for distinct operations"),
      options: z.object({
        limit: z.number().optional().default(100),
        skip: z.number().optional().default(0),
        sort: z.any().optional(),
        projection: z.any().optional()
      }).optional().default({})
    })
  }),
  description: "Safely executes read-only MongoDB operations including find, aggregate, count, and distinct queries",
  execute: async ({ context: { connectionString, operation } }) => {
    let client = null;
    try {
      console.log(`\u{1F50C} Connecting to MongoDB to execute ${operation.type} operation...`);
      const { client: mongoClient, db } = await createDatabaseConnection(connectionString);
      client = mongoClient;
      console.log("\u2705 Connected to MongoDB for query execution");
      const collection = db.collection(operation.collection);
      const startTime = Date.now();
      let result;
      let resultCount = 0;
      switch (operation.type) {
        case "find":
          const findQuery = operation.query || {};
          const findOptions = {
            limit: operation.options?.limit || 100,
            skip: operation.options?.skip || 0,
            sort: operation.options?.sort,
            projection: operation.options?.projection
          };
          const findCursor = collection.find(findQuery, findOptions);
          result = await findCursor.toArray();
          resultCount = result.length;
          const totalCount = await collection.countDocuments(findQuery);
          result = {
            documents: result,
            totalCount,
            returnedCount: resultCount,
            hasMore: (operation.options?.skip || 0) + resultCount < totalCount,
            query: findQuery,
            options: findOptions
          };
          break;
        case "aggregate":
          if (!operation.pipeline || !Array.isArray(operation.pipeline)) {
            throw new Error("Aggregation pipeline is required for aggregate operations");
          }
          const pipeline = [...operation.pipeline];
          const hasLimit = pipeline.some((stage) => "$limit" in stage);
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
            appliedLimit: operation.options?.limit || 100
          };
          break;
        case "count":
          const countQuery = operation.query || {};
          const count = await collection.countDocuments(countQuery);
          result = {
            count,
            query: countQuery
          };
          resultCount = 1;
          break;
        case "distinct":
          if (!operation.field) {
            throw new Error("Field name is required for distinct operations");
          }
          const distinctQuery = operation.query || {};
          const distinctValues = await collection.distinct(operation.field, distinctQuery);
          resultCount = distinctValues.length;
          result = {
            field: operation.field,
            values: distinctValues.slice(0, operation.options?.limit || 100),
            totalUniqueValues: distinctValues.length,
            query: distinctQuery
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
          connectionString: maskConnectionString(connectionString)
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        operation: operation.type,
        collection: operation.collection,
        error: errorMessage,
        metadata: {
          connectionString: maskConnectionString(connectionString)
        }
      };
    } finally {
      if (client) {
        await client.close();
      }
    }
  }
});
function maskConnectionString(connectionString) {
  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    return connectionString.replace(/\/\/[^@]+@/, "//***@");
  }
}
function validateMongoOperation(operation) {
  const errors = [];
  if (!operation.collection || typeof operation.collection !== "string") {
    errors.push("Collection name is required and must be a string");
  }
  switch (operation.type) {
    case "find":
      break;
    case "aggregate":
      if (!operation.pipeline || !Array.isArray(operation.pipeline)) {
        errors.push("Aggregation pipeline must be an array of stages");
      } else {
        const writeOperations = ["$out", "$merge", "$replaceRoot", "$addFields", "$set", "$unset"];
        const hasWriteOps = operation.pipeline.some(
          (stage) => Object.keys(stage).some((key) => writeOperations.includes(key))
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
    case "count":
      break;
    default:
      errors.push(`Unsupported operation type: ${operation.type}`);
  }
  return errors;
}

export { mongodbExecutionTool, validateMongoOperation };
