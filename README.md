# Template Text-to-MongoDB

A Mastra template to build a system enabling MongoDB database introspection and natural language to MongoDB query conversion. In this template, you'll be able to ask questions about a dataset in natural language and receive an executable MongoDB query. Behind the scenes, the system will convert the natural language query to a MongoDB query using AI-powered database introspection and translation.

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
   MONGODB_DB_NAME=your_db_name
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

#### Testing the workflow

Run the app in development mode. In your browser, navigate to the Playground (usually at `http://localhost:4111/`). Go to the `Workflows` tab and click `database-query-workflow`. Here, you can view each step of the workflow.

## Architecture

### Core Components

- **MongoDB Agent** (`src/mastra/agents/mongodb-agent.ts`): AI agent that orchestrates the natural language processing and MongoDB query generation

- **Tools** (`src/mastra/tools/`)
   - `database-introspection-tool.ts`: Analyzes MongoDB database structure
   - `database-seeding-tool.ts`: Seeds databases with sample collections and documents
   - `mongodb-execution-tool.ts`: Executes MongoDB queries
   - `mongodb-generation-tool.ts`: Converts natural language to MongoDB queries

- **Workflow** (`src/mastra/workflows/database-query-workflow.ts`): Handles user interactions and data flow

## MongoDB usage & troubleshooting (quick)

If you run into validation errors when executing generated MongoDB operations (for example, the execution step reports that "operation.options.limit: Expected number, received null"), here are a few quick checks:

- Ensure the generated operation does not contain explicit `null` values for `limit`, `skip`, or `field`. The runtime expects numbers or undefined, not `null`.
- For `aggregate` operations, make sure `pipeline` is an actual array of stage objects (not a JSON string or a single string). Example:

   Correct: `{ type: "aggregate", collection: "products", pipeline: [ { "$group": { "_id": null, "avg": { "$avg": "$price" } } } ] }`

   Incorrect: `{ type: "aggregate", collection: "products", pipeline: "[{ \"$group\": { ... }}]" }`

- When reviewing operations in the review step you can modify the operation before approving it; common edits include removing `null` and setting `options.limit` to a number (e.g. 100) or ensuring `pipeline` is an array.

Try-it: to reproduce the review+execute flow locally, run the dev server and exercise the workflow through the Mastra UI.

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