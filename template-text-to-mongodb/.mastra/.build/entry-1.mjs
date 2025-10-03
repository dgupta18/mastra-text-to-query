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
const databaseIntrospectionTool = createTool({
  id: "database-introspection",
  inputSchema: z.object({
    connectionString: z.string().describe("MongoDB connection string")
  }),
  description: "Introspects a MongoDB database to understand its schema, collections, document structures, and indexes",
  execute: async ({ context: { connectionString } }) => {
    let client = null;
    try {
      console.log("\u{1F50C} Connecting to MongoDB for introspection...");
      const { client: mongoClient, db } = await createDatabaseConnection(connectionString);
      client = mongoClient;
      console.log("\u2705 Connected to MongoDB for introspection");
      const collections = await db.listCollections().toArray();
      const collectionDetails = [];
      const documentSchemas = [];
      const indexDetails = [];
      const collectionStats = [];
      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        const collection = db.collection(collectionName);
        try {
          const stats = await db.command({ collStats: collectionName });
          collectionStats.push({
            name: collectionName,
            documentCount: stats.count || 0,
            averageObjectSize: stats.avgObjSize || 0,
            storageSize: stats.storageSize || 0,
            totalIndexSize: stats.totalIndexSize || 0,
            indexCount: stats.nindexes || 0
          });
          const indexes = await collection.listIndexes().toArray();
          indexDetails.push({
            collectionName,
            indexes: indexes.map((index) => ({
              name: index.name,
              key: index.key,
              unique: index.unique || false,
              sparse: index.sparse || false,
              background: index.background || false,
              expireAfterSeconds: index.expireAfterSeconds
            }))
          });
          const sampleSize = Math.min(100, stats.count || 0);
          const sampleDocuments = await collection.aggregate([
            { $sample: { size: sampleSize } }
          ]).toArray();
          const fieldAnalysis = analyzeDocumentFields(sampleDocuments);
          documentSchemas.push({
            collectionName,
            sampleSize: sampleDocuments.length,
            fields: fieldAnalysis
          });
          collectionDetails.push({
            name: collectionName,
            type: collectionInfo.type || "collection",
            options: collectionInfo.options || {}
          });
        } catch (error) {
          console.warn(`Failed to analyze collection ${collectionName}:`, error);
          collectionDetails.push({
            name: collectionName,
            type: collectionInfo.type || "collection",
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      const dbStats = await db.stats();
      return {
        database: {
          name: db.databaseName,
          collections: dbStats.collections || 0,
          dataSize: dbStats.dataSize || 0,
          storageSize: dbStats.storageSize || 0,
          indexSize: dbStats.indexSize || 0
        },
        collections: collectionDetails,
        schemas: documentSchemas,
        indexes: indexDetails,
        stats: collectionStats,
        summary: {
          totalCollections: collections.length,
          totalDocuments: collectionStats.reduce((sum, stat) => sum + stat.documentCount, 0),
          totalIndexes: indexDetails.reduce((sum, detail) => sum + detail.indexes.length, 0),
          avgDocumentsPerCollection: collectionStats.length > 0 ? Math.round(collectionStats.reduce((sum, stat) => sum + stat.documentCount, 0) / collectionStats.length) : 0
        }
      };
    } catch (error) {
      throw new Error(`Failed to introspect MongoDB database: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (client) {
        await client.close();
      }
    }
  }
});
function analyzeDocumentFields(documents) {
  if (documents.length === 0) {
    return {};
  }
  const fieldStats = {};
  documents.forEach((doc) => {
    analyzeObject(doc, fieldStats, "");
  });
  const totalDocs = documents.length;
  const result = {};
  Object.keys(fieldStats).forEach((fieldPath) => {
    const stats = fieldStats[fieldPath];
    const types = Object.keys(stats.types);
    const mostCommonType = types.reduce(
      (a, b) => stats.types[a] > stats.types[b] ? a : b
    );
    result[fieldPath] = {
      type: mostCommonType,
      alternativeTypes: types.filter((t) => t !== mostCommonType),
      presence: (stats.count / totalDocs * 100).toFixed(1) + "%",
      count: stats.count,
      samples: stats.samples.slice(0, 3),
      // First 3 sample values
      isRequired: stats.count === totalDocs,
      isArray: stats.isArray,
      hasNullValues: stats.hasNull
    };
  });
  return result;
}
function analyzeObject(obj, fieldStats, prefix) {
  if (obj === null || obj === void 0) {
    return;
  }
  Object.keys(obj).forEach((key) => {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    const valueType = getValueType(value);
    if (!fieldStats[fieldPath]) {
      fieldStats[fieldPath] = {
        types: {},
        count: 0,
        samples: [],
        isArray: false,
        hasNull: false
      };
    }
    const field = fieldStats[fieldPath];
    field.count++;
    if (!field.types[valueType]) {
      field.types[valueType] = 0;
    }
    field.types[valueType]++;
    if (field.samples.length < 10 && !field.samples.includes(value)) {
      if (valueType !== "object" && valueType !== "array") {
        field.samples.push(value);
      }
    }
    if (Array.isArray(value)) {
      field.isArray = true;
      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          analyzeObject(item, fieldStats, `${fieldPath}[${index}]`);
        }
      });
    } else if (typeof value === "object" && value !== null) {
      analyzeObject(value, fieldStats, fieldPath);
    }
    if (value === null) {
      field.hasNull = true;
    }
  });
}
function getValueType(value) {
  if (value === null) return "null";
  if (value === void 0) return "undefined";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (typeof value === "object") {
    if (value._bsontype === "ObjectId" || value.constructor && value.constructor.name === "ObjectId") {
      return "objectId";
    }
    return "object";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "double";
  }
  return typeof value;
}

export { databaseIntrospectionTool };
