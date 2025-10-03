#!/usr/bin/env node
import { config } from 'dotenv';
import { mastra } from './src/mastra/index.js';

// Load environment variables
config();

async function main() {
  console.log('🚀 MongoDB Text-to-Query System Starting...\n');

  // Example usage of the MongoDB agent
  try {
    const agent = mastra.getAgent('mongodbAgent');
    
    if (!agent) {
      console.error('❌ MongoDB agent not found');
      return;
    }

    console.log('✅ MongoDB Agent loaded successfully');
    console.log('📋 Available capabilities:');
    console.log('   - Database connection and introspection');
    console.log('   - Sample data seeding');
    console.log('   - Natural language to MongoDB query conversion');
    console.log('   - Safe query execution and result interpretation\n');

    console.log('🔧 To get started:');
    console.log('   1. Set your OPENAI_API_KEY in .env file');
    console.log('   2. Use the Mastra framework to interact with the agent');
    console.log('   3. Provide a MongoDB connection string when prompted');
    console.log('   4. Ask natural language questions about your data\n');

    console.log('💡 Example queries you can try:');
    console.log('   - "Show me all products sorted by price"');
    console.log('   - "Count users by city"');
    console.log('   - "Find the top 10 best-selling products"');
    console.log('   - "What are the unique categories in the products collection?"');
    console.log('   - "Show me orders from the last month"');
    console.log('   - "Group customers by country and count them"\n');

    console.log('🔗 The system supports:');
    console.log('   - MongoDB find operations');
    console.log('   - Complex aggregation pipelines');
    console.log('   - Count and distinct operations');
    console.log('   - Schema introspection and analysis');
    console.log('   - Sample data generation for testing\n');

    console.log('🛡️  Safety features:');
    console.log('   - Read-only operations (no data modification)');
    console.log('   - Query validation and error handling');
    console.log('   - Connection pooling and timeout management');
    console.log('   - Result limiting to prevent large responses\n');

  } catch (error) {
    console.error('❌ Error initializing MongoDB agent:', error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { mastra };