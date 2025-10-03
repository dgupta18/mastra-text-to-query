# Template Text-to-MongoDB

A Mastra template to build a system enabling MongoDB database introspection and natural language to MongoDB query conversion. In this template, you'll be able to ask questions about a dataset in natural language and receive answers in natural language. Behind the scenes, the system will convert the natural language query to a MongoDB query using AI-powered database introspection and translation.

## Architecture

### Core Components

1. **MongoDB Agent** (`src/mastra/agents/mongodb-agent.ts`)
   - AI agent that orchestrates the entire workflow
   - Handles natural language processing and query generation
   - Provides intelligent responses and explanations

2. **Tools** (`src/mastra/tools/`)
   - `database-introspection-tool.ts`: Analyzes MongoDB database structure
   - `database-seeding-tool.ts`: Seeds databases with sample collections and documents
   - `mongodb-execution-tool.ts`: Safely executes MongoDB queries
   - `mongodb-generation-tool.ts`: Converts natural language to MongoDB queries

3. **Workflow** (`src/mastra/workflows/database-query-workflow.ts`)
   - Orchestrates the complete process from connection to results
   - Handles user interactions and data flow
   - Manages error states and recovery

## Getting Started

### Prerequisites

- Node.js 20.9.0 or higher
- pnpm
- MongoDB database (MongoDB Atlas deployment required)
- OpenAI API key

### Installation

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   
   Configure your `.env` file with:
   ```
   OPENAI_API_KEY=your_openai_api_key
   MONGODB_URI=your_mongodb_connection_string
   ```

### Usage

#### Development Mode
```bash
pnpm dev
```

#### Production Build
```bash
pnpm build
pnpm start
```

### Example Interactions

1. **Connect to Database**:
   - Provide MongoDB connection string
   - System introspects database structure
   - Optional seeding with sample data

2. **Natural Language Queries**:
   - "Show me all users from New York"
   - "What are the top 5 products by sales?"
   - "Find all orders placed in the last month"
   - "Group customers by country and count them"

3. **AI-Generated MongoDB Queries**:
   - Aggregation pipelines for complex analysis
   - Find operations for simple document retrieval
   - Proper indexing recommendations
   - Query optimization suggestions

## Configuration

### Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key for AI-powered query generation
- `MONGODB_URI`: Default MongoDB connection string
- `LOG_LEVEL`: Logging level (optional; default: 'info')

## Development

### Project Structure

```
template-text-to-mongodb/
├── src/
│   └── mastra/
│       ├── agents/
│       │   └── mongodb-agent.ts
│       ├── tools/
│       │   ├── database-introspection-tool.ts
│       │   ├── database-seeding-tool.ts
│       │   ├── mongodb-execution-tool.ts
│       │   └── mongodb-generation-tool.ts
│       ├── workflows/
│       │   └── database-query-workflow.ts
│       └── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

## License

Apache-2.0

---

**Note**: This template is designed for educational and demonstration purposes. For production use, ensure proper security measures, error handling, and performance optimization are in place.