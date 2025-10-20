import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { databaseIntrospectionTool } from '../tools/database-introspection-tool';
import { mongodbGenerationTool } from '../tools/mongodb-generation-tool';
import { mongodbExecutionTool } from '../tools/mongodb-execution-tool';
import { databaseSeedingTool } from '../tools/database-seeding-tool';
import { RuntimeContext } from '@mastra/core/di';
import { DEFAULT_DB_NAME } from '../constants';

// Step 1: Get connection string and database name
const getConnectionStep = createStep({
  id: 'get-connection',
  inputSchema: z.object({}),
  outputSchema: z.object({
    connectionString: z.string(),
    dbName: z.string(),
  }),
  resumeSchema: z.object({
    connectionString: z.string(),
    dbName: z.string().optional(),
  }),
  suspendSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ resumeData, suspend }) => {
    if (!resumeData?.connectionString) {
      await suspend({
        message:
          'Please provide your MongoDB connection string (e.g., mongodb://user:password@localhost:27017 or mongodb+srv://user:password@cluster.mongodb.net) and optionally the database name (default: ' + DEFAULT_DB_NAME + '):',
      });

      return {
        connectionString: '',
        dbName: DEFAULT_DB_NAME,
      };
    }

    const { connectionString, dbName } = resumeData;
    return { 
      connectionString, 
      dbName: dbName || DEFAULT_DB_NAME 
    };
  },
});

// Step 2: Ask if user wants to seed database
const seedDatabaseStep = createStep({
  id: 'seed-database',
  inputSchema: z.object({
    connectionString: z.string(),
    dbName: z.string(),
  }),
  outputSchema: z.object({
    connectionString: z.string(),
    dbName: z.string(),
    seeded: z.boolean(),
    seedResult: z
      .object({
        success: z.boolean(),
        message: z.string(),
        seedType: z.string().optional(),
        collectionsCreated: z.array(z.string()).optional(),
        recordCount: z.number().optional(),
      })
      .optional(),
  }),
  resumeSchema: z.object({
    seedDatabase: z.boolean().optional(),
    seedType: z.enum(['ecommerce', 'social', 'financial']).optional(),
  }),
  suspendSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend, runtimeContext }) => {
    const { connectionString, dbName } = inputData;

    if (resumeData === undefined) {
      await suspend({
        message:
          "Would you like to seed the database with sample data? Choose 'ecommerce', 'social', 'financial', or 'false' to skip seeding:",
      });

      return {
        connectionString,
        dbName,
        seeded: false,
      };
    }

    const { seedDatabase, seedType } = resumeData;

    if (!seedDatabase && !seedType) {
      return {
        connectionString,
        dbName,
        seeded: false,
      };
    }

    try {
      // Use the database seeding tool
      if (!databaseSeedingTool.execute) {
        throw new Error('Database seeding tool is not available');
      }

      const seedResult = await databaseSeedingTool.execute({
        context: { 
          connectionString, 
          dbName,
          seedType: seedType || 'ecommerce',
          dropExisting: false,
          recordCount: 100,
        },
        runtimeContext: runtimeContext || new RuntimeContext(),
      });

      // Type guard to ensure we have seed result
      if (!seedResult || typeof seedResult !== 'object') {
        throw new Error('Invalid seed result returned from seeding tool');
      }

      return {
        connectionString,
        dbName,
        seeded: true,
        seedResult: seedResult as any,
      };
    } catch (error) {
      throw new Error(`Failed to seed database: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

// Step 3: Introspect database
const introspectDatabaseStep = createStep({
  id: 'introspect-database',
  inputSchema: z.object({
    connectionString: z.string(),
    dbName: z.string(),
    seeded: z.boolean(),
    seedResult: z
      .object({
        success: z.boolean(),
        message: z.string(),
        seedType: z.string().optional(),
        collectionsCreated: z.array(z.string()).optional(),
        recordCount: z.number().optional(),
      })
      .optional(),
  }),
  outputSchema: z.object({
    connectionString: z.string(),
    dbName: z.string(),
    schema: z.any(),
    schemaPresentation: z.string(),
    seeded: z.boolean(),
    seedResult: z
      .object({
        success: z.boolean(),
        message: z.string(),
        seedType: z.string().optional(),
        collectionsCreated: z.array(z.string()).optional(),
        recordCount: z.number().optional(),
      })
      .optional(),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    const { connectionString, dbName, seeded, seedResult } = inputData;

    try {
      // Use the database introspection tool
      if (!databaseIntrospectionTool.execute) {
        throw new Error('Database introspection tool is not available');
      }

      const schemaData = await databaseIntrospectionTool.execute({
        context: { connectionString, dbName },
        runtimeContext: runtimeContext || new RuntimeContext(),
      });

      // Type guard to ensure we have schema data
      if (!schemaData || typeof schemaData !== 'object') {
        throw new Error('Invalid schema data returned from introspection');
      }

      // Create a human-readable presentation
      const schemaPresentation = createSchemaPresentation(schemaData);

      return {
        connectionString,
        dbName,
        schema: schemaData,
        schemaPresentation,
        seeded,
        seedResult,
      };
    } catch (error) {
      throw new Error(`Failed to introspect database: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

// Step 4: Get natural language query and generate MongoDB operation
const generateMongoDBStep = createStep({
  id: 'generate-mongodb',
  inputSchema: z.object({
    connectionString: z.string(),
    dbName: z.string(),
    schema: z.any(),
    schemaPresentation: z.string(),
    seeded: z.boolean(),
    seedResult: z
      .object({
        success: z.boolean(),
        message: z.string(),
        seedType: z.string().optional(),
        collectionsCreated: z.array(z.string()).optional(),
        recordCount: z.number().optional(),
      })
      .optional(),
  }),
  outputSchema: z.object({
    connectionString: z.string(),
    dbName: z.string(),
    naturalLanguageQuery: z.string(),
    generatedOperation: z.object({
      operation: z.object({
        type: z.enum(['find', 'aggregate', 'count', 'distinct']),
        collection: z.string(),
        query: z.any().optional(),
        pipeline: z.array(z.any()).optional(),
        field: z.string().optional(),
        options: z.any().optional(),
      }),
      explanation: z.string(),
      confidence: z.number(),
      assumptions: z.array(z.string()),
      collections_used: z.array(z.string()),
      queryComplexity: z.enum(['simple', 'moderate', 'complex']),
    }),
    schemaPresentation: z.string(),
    seeded: z.boolean(),
  }),
  resumeSchema: z.object({
    naturalLanguageQuery: z.string(),
  }),
  suspendSchema: z.object({
    schemaPresentation: z.string(),
    message: z.string(),
    seeded: z.boolean(),
    seedResult: z
      .object({
        success: z.boolean(),
        message: z.string(),
        seedType: z.string().optional(),
        collectionsCreated: z.array(z.string()).optional(),
        recordCount: z.number().optional(),
      })
      .optional(),
  }),
  execute: async ({ inputData, resumeData, suspend, runtimeContext }) => {
    const { connectionString, dbName, schema, schemaPresentation, seeded, seedResult } = inputData;

    if (!resumeData?.naturalLanguageQuery) {
      await suspend({
        schemaPresentation,
        message: "Please enter your natural language query (e.g., 'Show me the top 10 products by price', 'Count users by city', 'Find all orders from last month'):",
        seeded,
        seedResult,
      });

      return {
        connectionString,
        dbName,
        naturalLanguageQuery: '',
        generatedOperation: {
          operation: {
            type: 'find' as const,
            collection: '',
          },
          explanation: '',
          confidence: 0,
          assumptions: [],
          collections_used: [],
          queryComplexity: 'simple' as const,
        },
        schemaPresentation,
        seeded,
      };
    }

    const { naturalLanguageQuery } = resumeData;

    try {
      // Generate MongoDB operation from natural language query
      if (!mongodbGenerationTool.execute) {
        throw new Error('MongoDB generation tool is not available');
      }

      const generatedOperation = await mongodbGenerationTool.execute({
        context: {
          naturalLanguageQuery,
          databaseSchema: schema,
        },
        runtimeContext: runtimeContext || new RuntimeContext(),
      });

      // Type guard for generated operation
      if (!generatedOperation || typeof generatedOperation !== 'object') {
        throw new Error('Invalid MongoDB generation result');
      }

      return {
        connectionString,
        dbName,
        naturalLanguageQuery,
        generatedOperation: generatedOperation as any,
        schemaPresentation,
        seeded,
      };
    } catch (error) {
      throw new Error(`Failed to generate MongoDB operation: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

// Step 5: Review operation and execute query
//
// Note: This step builds an explicit sanitized `opForTool` object before
// calling the execution tool. The sanitizer removes explicit nulls and
// provides sensible defaults for numeric options (limit, skip). Keep this
// behavior if modifying the step: it prevents common validation errors where
// the execution tool rejects `null` values for fields that should be numbers.
const reviewAndExecuteStep = createStep({
  id: 'review-and-execute',
  inputSchema: z.object({
    connectionString: z.string(),
    dbName: z.string(),
    naturalLanguageQuery: z.string(),
    generatedOperation: z.object({
      operation: z.object({
        type: z.enum(['find', 'aggregate', 'count', 'distinct']),
        collection: z.string(),
        query: z.any().optional(),
        pipeline: z.array(z.any()).optional(),
        field: z.string().optional(),
        options: z.any().optional(),
      }),
      explanation: z.string(),
      confidence: z.number(),
      assumptions: z.array(z.string()),
      collections_used: z.array(z.string()),
      queryComplexity: z.enum(['simple', 'moderate', 'complex']),
    }),
    schemaPresentation: z.string(),
    seeded: z.boolean(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    finalOperation: z.any(),
    queryResult: z.any(),
    modifications: z.string().optional(),
    resultCount: z.number().optional(),
    error: z.string().optional(),
  }),
  resumeSchema: z.object({
    approved: z.boolean().optional(),
    modifiedOperation: z.any().optional(),
  }),
  suspendSchema: z.object({
    generatedOperation: z.object({
      operation: z.object({
        type: z.enum(['find', 'aggregate', 'count', 'distinct']),
        collection: z.string(),
        query: z.any().optional(),
        pipeline: z.array(z.any()).optional(),
        field: z.string().optional(),
        options: z.any().optional(),
      }),
      explanation: z.string(),
      confidence: z.number(),
      assumptions: z.array(z.string()),
      collections_used: z.array(z.string()),
      queryComplexity: z.enum(['simple', 'moderate', 'complex']),
    }),
    message: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend, runtimeContext }) => {
    const { connectionString, dbName, naturalLanguageQuery, generatedOperation } = inputData;

    if (!resumeData) {
      await suspend({
        generatedOperation,
        message:
          "Do you want to approve this MongoDB operation or make modifications? (approved: true/false, modifiedOperation: {...} if needed)",
      });

      return {
        success: false,
        finalOperation: generatedOperation.operation,
        queryResult: null,
      };
    }

    const { approved, modifiedOperation } = resumeData;

    const finalOperation = modifiedOperation || generatedOperation.operation;

    if (!approved) {
      return {
        success: false,
        finalOperation,
        queryResult: null,
        modifications: modifiedOperation ? 'Operation was modified but not approved' : 'Operation was not approved',
      };
    }

    try {
      // Execute the MongoDB operation
      if (!mongodbExecutionTool.execute) {
        throw new Error('MongoDB execution tool is not available');
      }

      // Build an explicit operation object for the tool to avoid passing explicit nulls
      const opForTool: any = {
        type: finalOperation.type,
        collection: finalOperation.collection,
      };

      if (finalOperation.pipeline) opForTool.pipeline = finalOperation.pipeline;
      if (finalOperation.query) opForTool.query = finalOperation.query;
      if (finalOperation.field) opForTool.field = finalOperation.field;

      // Normalize options with sensible defaults
      const opts = finalOperation.options || {};
      opForTool.options = {
        limit: typeof opts.limit === 'number' ? opts.limit : 100,
        skip: typeof opts.skip === 'number' ? opts.skip : 0,
      } as any;

      if (opts.sort) opForTool.options.sort = opts.sort;
      if (opts.projection) opForTool.options.projection = opts.projection;

      console.log('opForTool:', opForTool);

      const result = await mongodbExecutionTool.execute({
        context: {
          connectionString,
          dbName,
          operation: opForTool,
        },
        runtimeContext: runtimeContext || new RuntimeContext(),
      });

      // Type guard for execution result
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid MongoDB execution result');
      }

      const executionResult = result as any;
      if (executionResult.error) {
        throw new Error("Error during execution: " + executionResult.message);
      }

      return {
        success: executionResult.success || false,
        finalOperation,
        queryResult: executionResult.data || null,
        modifications: modifiedOperation ? 'Operation was modified by user' : undefined,
        resultCount: executionResult.metadata?.resultCount || 0,
      };
    } catch (error) {
      return {
        success: false,
        finalOperation,
        queryResult: null,
        modifications: modifiedOperation ? 'Operation was modified by user' : undefined,
        error: `Failed to execute MongoDB operation: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// Define the main database query workflow
export const databaseQueryWorkflow = createWorkflow({
  id: 'database-query-workflow',
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    finalOperation: z.any(),
    queryResult: z.any(),
    modifications: z.string().optional(),
    resultCount: z.number().optional(),
    error: z.string().optional(),
  }),
  steps: [getConnectionStep, seedDatabaseStep, introspectDatabaseStep, generateMongoDBStep, reviewAndExecuteStep],
});

databaseQueryWorkflow
  .then(getConnectionStep)
  .then(seedDatabaseStep)
  .then(introspectDatabaseStep)
  .then(generateMongoDBStep)
  .then(reviewAndExecuteStep)
  .commit();

// Helper function to create human-readable schema presentation
function createSchemaPresentation(schema: any): string {
  let presentation = '# MongoDB Database Schema Overview\n\n';

  presentation += `## Database: ${schema.database.name}\n\n`;
  presentation += `### Summary\n`;
  presentation += `- **Collections**: ${schema.summary.totalCollections}\n`;
  presentation += `- **Total Documents**: ${schema.summary.totalDocuments.toLocaleString()}\n`;
  presentation += `- **Total Indexes**: ${schema.summary.totalIndexes}\n`;
  presentation += `- **Avg Documents/Collection**: ${schema.summary.avgDocumentsPerCollection.toLocaleString()}\n\n`;

  presentation += `## Collections and Document Schemas\n\n`;

  schema.schemas.forEach((collectionSchema: any) => {
    const stats = schema.stats.find((s: any) => s.name === collectionSchema.collectionName);
    const indexes = schema.indexes.find((i: any) => i.collectionName === collectionSchema.collectionName);

    presentation += `### ${collectionSchema.collectionName}`;
    if (stats) {
      presentation += ` (${stats.documentCount.toLocaleString()} documents)`;
    }
    presentation += `\n\n`;

    if (stats) {
      presentation += `**Collection Stats:**\n`;
      presentation += `- Documents: ${stats.documentCount.toLocaleString()}\n`;
      presentation += `- Average Document Size: ${Math.round(stats.averageObjectSize)} bytes\n`;
      presentation += `- Storage Size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB\n`;
      presentation += `- Index Count: ${stats.indexCount}\n\n`;
    }

    presentation += `**Document Schema** (based on ${collectionSchema.sampleSize} sample documents):\n\n`;
    presentation += `| Field Path | Type | Presence | Required | Sample Values |\n`;
    presentation += `|------------|------|----------|----------|--------------|\n`;

    Object.entries(collectionSchema.fields).forEach(([fieldPath, fieldInfo]: [string, any]) => {
      const types = fieldInfo.alternativeTypes && fieldInfo.alternativeTypes.length > 0
        ? `${fieldInfo.type} (${fieldInfo.alternativeTypes.join(', ')})`
        : fieldInfo.type;
      
      const required = fieldInfo.isRequired ? '✓' : '✗';
      const samples = fieldInfo.samples && fieldInfo.samples.length > 0
        ? fieldInfo.samples.slice(0, 2).map((s: any) => 
            typeof s === 'string' ? `"${s}"` : String(s)
          ).join(', ')
        : '';

      presentation += `| ${fieldPath} | ${types} | ${fieldInfo.presence} | ${required} | ${samples} |\n`;
    });

    if (indexes && indexes.indexes.length > 0) {
      presentation += `\n**Indexes:**\n`;
      indexes.indexes.forEach((index: any) => {
        presentation += `- **${index.name}**: ${JSON.stringify(index.key)}`;
        if (index.unique) presentation += ' [UNIQUE]';
        if (index.sparse) presentation += ' [SPARSE]';
        presentation += '\n';
      });
    }

    presentation += `\n`;
  });

  presentation += `## MongoDB Query Capabilities\n\n`;
  presentation += `Based on the analyzed schema, you can perform various operations:\n\n`;
  presentation += `### Find Operations\n`;
  presentation += `- Simple document retrieval with filters\n`;
  presentation += `- Text search using regex patterns\n`;
  presentation += `- Range queries on numeric and date fields\n`;
  presentation += `- Projection to select specific fields\n\n`;

  presentation += `### Aggregation Operations\n`;
  presentation += `- Group documents by field values\n`;
  presentation += `- Calculate sums, averages, counts, min/max\n`;
  presentation += `- Sort and limit results\n`;
  presentation += `- Transform document structures\n`;
  presentation += `- Join data from multiple collections using $lookup\n\n`;

  presentation += `### Count & Distinct Operations\n`;
  presentation += `- Count documents matching criteria\n`;
  presentation += `- Get unique values for specific fields\n`;
  presentation += `- Analyze data distribution patterns\n\n`;

  presentation += `---\n\n`;
  presentation += `**MongoDB schema introspection complete!**\n`;
  presentation += `You can now use natural language to:\n`;
  presentation += `- Query documents and collections\n`;
  presentation += `- Perform aggregations and analytics\n`;
  presentation += `- Explore data relationships and patterns\n`;
  presentation += `- Get insights about your document structure\n`;

  return presentation;
}