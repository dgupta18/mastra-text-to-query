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

export const databaseIntrospectionTool = createTool({
  id: 'database-introspection',
  inputSchema: z.object({
    connectionString: z.string().describe('MongoDB connection string'),
    dbName: z.string().optional().describe('Database name (default: ' + DEFAULT_DB_NAME + ')'),
  }),
  description: 'Introspects a MongoDB database to understand its schema, collections, document structures, and indexes',
  execute: async ({ context: { connectionString, dbName } }) => {
    let client: MongoClient | null = null;

    try {
      console.log('🔌 Connecting to MongoDB for introspection...');
      const { client: mongoClient, db } = await createDatabaseConnection(connectionString, dbName || DEFAULT_DB_NAME);
      client = mongoClient;
      console.log('✅ Connected to MongoDB for introspection');

      // Get all collections
      const collections = await db.listCollections().toArray();
      
      const collectionDetails = [];
      const documentSchemas = [];
      const indexDetails = [];
      const collectionStats = [];

      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        const collection = db.collection(collectionName);

        try {
          // Get collection stats
          const stats = await db.command({ collStats: collectionName });
          collectionStats.push({
            name: collectionName,
            documentCount: stats.count || 0,
            averageObjectSize: stats.avgObjSize || 0,
            storageSize: stats.storageSize || 0,
            totalIndexSize: stats.totalIndexSize || 0,
            indexCount: stats.nindexes || 0,
          });

          // Get collection indexes
          const indexes = await collection.listIndexes().toArray();
          indexDetails.push({
            collectionName,
            indexes: indexes.map((index: any) => ({
              name: index.name,
              key: index.key,
              unique: index.unique || false,
              sparse: index.sparse || false,
              background: index.background || false,
              expireAfterSeconds: index.expireAfterSeconds,
            })),
          });

          // Sample documents to infer schema
          const sampleSize = Math.min(100, stats.count || 0);
          const sampleDocuments = await collection.aggregate([
            { $sample: { size: sampleSize } }
          ]).toArray();

          // Analyze document structure
          const fieldAnalysis = analyzeDocumentFields(sampleDocuments);
          documentSchemas.push({
            collectionName,
            sampleSize: sampleDocuments.length,
            fields: fieldAnalysis,
          });

          collectionDetails.push({
            name: collectionName,
            type: collectionInfo.type || 'collection',
            options: (collectionInfo as any).options || {},
          });

        } catch (error) {
          console.warn(`Failed to analyze collection ${collectionName}:`, error);
          collectionDetails.push({
            name: collectionName,
            type: collectionInfo.type || 'collection',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Get database stats
      const dbStats = await db.stats();

      return {
        database: {
          name: db.databaseName,
          collections: dbStats.collections || 0,
          dataSize: dbStats.dataSize || 0,
          storageSize: dbStats.storageSize || 0,
          indexSize: dbStats.indexSize || 0,
        },
        collections: collectionDetails,
        schemas: documentSchemas,
        indexes: indexDetails,
        stats: collectionStats,
        summary: {
          totalCollections: collections.length,
          totalDocuments: collectionStats.reduce((sum, stat) => sum + stat.documentCount, 0),
          totalIndexes: indexDetails.reduce((sum, detail) => sum + detail.indexes.length, 0),
          avgDocumentsPerCollection: collectionStats.length > 0 
            ? Math.round(collectionStats.reduce((sum, stat) => sum + stat.documentCount, 0) / collectionStats.length)
            : 0,
        },
      };

    } catch (error) {
      throw new Error(`Failed to introspect MongoDB database: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (client) {
        await client.close();
      }
    }
  },
});

// Helper function to analyze document fields and infer schema
function analyzeDocumentFields(documents: any[]): any {
  if (documents.length === 0) {
    return {};
  }

  const fieldStats: { [key: string]: any } = {};

  // Analyze each document
  documents.forEach(doc => {
    analyzeObject(doc, fieldStats, '');
  });

  // Calculate statistics for each field
  const totalDocs = documents.length;
  const result: { [key: string]: any } = {};

  Object.keys(fieldStats).forEach(fieldPath => {
    const stats = fieldStats[fieldPath];
    const types = Object.keys(stats.types);
    const mostCommonType = types.reduce((a, b) => 
      stats.types[a] > stats.types[b] ? a : b
    );

    result[fieldPath] = {
      type: mostCommonType,
      alternativeTypes: types.filter(t => t !== mostCommonType),
      presence: (stats.count / totalDocs * 100).toFixed(1) + '%',
      count: stats.count,
      samples: stats.samples.slice(0, 3), // First 3 sample values
      isRequired: stats.count === totalDocs,
      isArray: stats.isArray,
      hasNullValues: stats.hasNull,
    };
  });

  return result;
}

function analyzeObject(obj: any, fieldStats: any, prefix: string) {
  if (obj === null || obj === undefined) {
    return;
  }

  Object.keys(obj).forEach(key => {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    const valueType = getValueType(value);

    if (!fieldStats[fieldPath]) {
      fieldStats[fieldPath] = {
        types: {},
        count: 0,
        samples: [],
        isArray: false,
        hasNull: false,
      };
    }

    const field = fieldStats[fieldPath];
    field.count++;

    // Track type statistics
    if (!field.types[valueType]) {
      field.types[valueType] = 0;
    }
    field.types[valueType]++;

    // Track sample values (limit to prevent memory issues)
    if (field.samples.length < 10 && !field.samples.includes(value)) {
      if (valueType !== 'object' && valueType !== 'array') {
        field.samples.push(value);
      }
    }

    // Special handling for arrays
    if (Array.isArray(value)) {
      field.isArray = true;
      // Analyze array elements
      value.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          analyzeObject(item, fieldStats, `${fieldPath}[${index}]`);
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      // Recursively analyze nested objects
      analyzeObject(value, fieldStats, fieldPath);
    }

    if (value === null) {
      field.hasNull = true;
    }
  });
}

function getValueType(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (typeof value === 'object') {
    // Check for MongoDB ObjectId
    if (value._bsontype === 'ObjectId' || (value.constructor && value.constructor.name === 'ObjectId')) {
      return 'objectId';
    }
    return 'object';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'double';
  }
  return typeof value;
}