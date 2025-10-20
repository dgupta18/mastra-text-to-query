import { Mastra } from '@mastra/core/mastra';
import { MongoDBStore } from '@mastra/mongodb';
import { PinoLogger } from '@mastra/loggers';
import { MongoClient } from 'mongodb';
import { mongodbAgent } from './agents/mongodb-agent';
import { databaseQueryWorkflow } from './workflows/database-query-workflow';

// Custom function to clean up workflow snapshots
async function cleanupWorkflowSnapshots() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'mastra-text-to-query';

  let client;
  
  try {
    client = new MongoClient(mongoUri);
    await client.connect();
    
    const db = client.db(dbName);
    
    // Clean up workflow-related collections
    
    let cleanedCount = 0;
    
    const workflowCollection = 'mastra_workflow_snapshots';
    try {
      const collection = db.collection(workflowCollection);
      const deleteResult = await collection.deleteMany({});
      if (deleteResult.deletedCount > 0) {
        cleanedCount += deleteResult.deletedCount;
      }
    } catch (error) {
      // Collection might not exist, that's okay
    }
  } catch (error) {
    console.warn('⚠️  Could not auto-clean workflow snapshots:', error instanceof Error ? error.message : String(error));
  } finally {
    if (client) {
      await client.close();
    }
  }
}

export const mastra = new Mastra({
agents: { mongodbAgent },
  workflows: {
    databaseQueryWorkflow,
  },
  storage: new MongoDBStore({
    url: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    dbName: process.env.MONGODB_DB_NAME || 'mastra-text-to-query',
  }),
  logger: new PinoLogger({
    name: 'Mastra MongoDB',
    level: 'info',
  }),
});

export async function initializeMastra() {
  await cleanupWorkflowSnapshots();
  return mastra;
}