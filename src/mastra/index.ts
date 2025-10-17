import { Mastra } from '@mastra/core/mastra';
import { MongoDBStore } from '@mastra/mongodb';
import { PinoLogger } from '@mastra/loggers';
import { mongodbAgent } from './agents/mongodb-agent';
import { databaseQueryWorkflow } from './workflows/database-query-workflow';

export const mastra = new Mastra({
  agents: { mongodbAgent },
  workflows: {
    databaseQueryWorkflow,
  },
  storage: new MongoDBStore({
    url: process.env.MONGODB_URL || 'mongodb://localhost:27017',
    dbName: process.env.MONGODB_DB_NAME || 'mastra-text-to-query',
  }),
  logger: new PinoLogger({
    name: 'Mastra MongoDB',
    level: 'info',
  }),
  observability: {
    default: {
      enabled: true,
    },
  },
});