import { l as lib } from './_virtual__virtual-mongodb.mjs';
import { M as MastraError, E as ErrorCategory, a as ErrorDomain } from './error.mjs';
import { M as MastraBase } from './chunk-BMVFEBPE.mjs';
import { T as TABLE_WORKFLOW_SNAPSHOT, a as TABLE_EVALS, b as TABLE_MESSAGES, c as TABLE_THREADS, d as TABLE_TRACES, e as TABLE_SCHEMAS, f as TABLE_SCORERS, g as TABLE_RESOURCES, h as TABLE_AI_SPANS } from './storage.mjs';
import { M as MessageList } from './chunk-BOJNXNRV.mjs';
import { s as saveScorePayloadSchema } from './chunk-WP2KQXPV.mjs';

// src/storage/base.ts
function ensureDate(date) {
  if (!date) return void 0;
  return date instanceof Date ? date : new Date(date);
}
function serializeDate(date) {
  if (!date) return void 0;
  const dateObj = ensureDate(date);
  return dateObj?.toISOString();
}
function resolveMessageLimit({
  last,
  defaultLimit
}) {
  if (typeof last === "number") return Math.max(0, last);
  if (last === false) return 0;
  return defaultLimit;
}
var MastraStorage = class extends MastraBase {
  /** @deprecated import from { TABLE_WORKFLOW_SNAPSHOT } '@mastra/core/storage' instead */
  static TABLE_WORKFLOW_SNAPSHOT = TABLE_WORKFLOW_SNAPSHOT;
  /** @deprecated import from { TABLE_EVALS } '@mastra/core/storage' instead */
  static TABLE_EVALS = TABLE_EVALS;
  /** @deprecated import from { TABLE_MESSAGES } '@mastra/core/storage' instead */
  static TABLE_MESSAGES = TABLE_MESSAGES;
  /** @deprecated import from { TABLE_THREADS } '@mastra/core/storage' instead */
  static TABLE_THREADS = TABLE_THREADS;
  /** @deprecated import { TABLE_TRACES } from '@mastra/core/storage' instead */
  static TABLE_TRACES = TABLE_TRACES;
  hasInitialized = null;
  shouldCacheInit = true;
  stores;
  constructor({ name }) {
    super({
      component: "STORAGE",
      name
    });
  }
  get supports() {
    return {
      selectByIncludeResourceScope: false,
      resourceWorkingMemory: false,
      hasColumn: false,
      createTable: false,
      deleteMessages: false,
      aiTracing: false,
      indexManagement: false,
      getScoresBySpan: false
    };
  }
  ensureDate(date) {
    return ensureDate(date);
  }
  serializeDate(date) {
    return serializeDate(date);
  }
  /**
   * Resolves limit for how many messages to fetch
   *
   * @param last The number of messages to fetch
   * @param defaultLimit The default limit to use if last is not provided
   * @returns The resolved limit
   */
  resolveMessageLimit({
    last,
    defaultLimit
  }) {
    return resolveMessageLimit({ last, defaultLimit });
  }
  getSqlType(type) {
    switch (type) {
      case "text":
        return "TEXT";
      case "timestamp":
        return "TIMESTAMP";
      case "float":
        return "FLOAT";
      case "integer":
        return "INTEGER";
      case "bigint":
        return "BIGINT";
      case "jsonb":
        return "JSONB";
      default:
        return "TEXT";
    }
  }
  getDefaultValue(type) {
    switch (type) {
      case "text":
      case "uuid":
        return "DEFAULT ''";
      case "timestamp":
        return "DEFAULT '1970-01-01 00:00:00'";
      case "integer":
      case "float":
      case "bigint":
        return "DEFAULT 0";
      case "jsonb":
        return "DEFAULT '{}'";
      default:
        return "DEFAULT ''";
    }
  }
  batchTraceInsert({ records }) {
    if (this.stores?.traces) {
      return this.stores.traces.batchTraceInsert({ records });
    }
    return this.batchInsert({ tableName: TABLE_TRACES, records });
  }
  async getResourceById(_) {
    throw new Error(
      `Resource working memory is not supported by this storage adapter (${this.constructor.name}). Supported storage adapters: LibSQL (@mastra/libsql), PostgreSQL (@mastra/pg), Upstash (@mastra/upstash). To use per-resource working memory, switch to one of these supported storage adapters.`
    );
  }
  async saveResource(_) {
    throw new Error(
      `Resource working memory is not supported by this storage adapter (${this.constructor.name}). Supported storage adapters: LibSQL (@mastra/libsql), PostgreSQL (@mastra/pg), Upstash (@mastra/upstash). To use per-resource working memory, switch to one of these supported storage adapters.`
    );
  }
  async updateResource(_) {
    throw new Error(
      `Resource working memory is not supported by this storage adapter (${this.constructor.name}). Supported storage adapters: LibSQL (@mastra/libsql), PostgreSQL (@mastra/pg), Upstash (@mastra/upstash). To use per-resource working memory, switch to one of these supported storage adapters.`
    );
  }
  async deleteMessages(_messageIds) {
    throw new Error(
      `Message deletion is not supported by this storage adapter (${this.constructor.name}). The deleteMessages method needs to be implemented in the storage adapter.`
    );
  }
  async init() {
    if (this.shouldCacheInit && await this.hasInitialized) {
      return;
    }
    const tableCreationTasks = [
      this.createTable({
        tableName: TABLE_WORKFLOW_SNAPSHOT,
        schema: TABLE_SCHEMAS[TABLE_WORKFLOW_SNAPSHOT]
      }),
      this.createTable({
        tableName: TABLE_EVALS,
        schema: TABLE_SCHEMAS[TABLE_EVALS]
      }),
      this.createTable({
        tableName: TABLE_THREADS,
        schema: TABLE_SCHEMAS[TABLE_THREADS]
      }),
      this.createTable({
        tableName: TABLE_MESSAGES,
        schema: TABLE_SCHEMAS[TABLE_MESSAGES]
      }),
      this.createTable({
        tableName: TABLE_TRACES,
        schema: TABLE_SCHEMAS[TABLE_TRACES]
      }),
      this.createTable({
        tableName: TABLE_SCORERS,
        schema: TABLE_SCHEMAS[TABLE_SCORERS]
      })
    ];
    if (this.supports.resourceWorkingMemory) {
      tableCreationTasks.push(
        this.createTable({
          tableName: TABLE_RESOURCES,
          schema: TABLE_SCHEMAS[TABLE_RESOURCES]
        })
      );
    }
    if (this.supports.aiTracing) {
      tableCreationTasks.push(
        this.createTable({
          tableName: TABLE_AI_SPANS,
          schema: TABLE_SCHEMAS[TABLE_AI_SPANS]
        })
      );
    }
    this.hasInitialized = Promise.all(tableCreationTasks).then(() => true);
    await this.hasInitialized;
    await this?.alterTable?.({
      tableName: TABLE_MESSAGES,
      schema: TABLE_SCHEMAS[TABLE_MESSAGES],
      ifNotExists: ["resourceId"]
    });
    await this?.alterTable?.({
      tableName: TABLE_WORKFLOW_SNAPSHOT,
      schema: TABLE_SCHEMAS[TABLE_WORKFLOW_SNAPSHOT],
      ifNotExists: ["resourceId"]
    });
    await this?.alterTable?.({
      tableName: TABLE_SCORERS,
      schema: TABLE_SCHEMAS[TABLE_SCORERS],
      ifNotExists: ["spanId"]
    });
  }
  async persistWorkflowSnapshot({
    workflowName,
    runId,
    resourceId,
    snapshot
  }) {
    await this.init();
    const data = {
      workflow_name: workflowName,
      run_id: runId,
      resourceId,
      snapshot,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    this.logger.debug("Persisting workflow snapshot", { workflowName, runId, data });
    await this.insert({
      tableName: TABLE_WORKFLOW_SNAPSHOT,
      record: data
    });
  }
  async loadWorkflowSnapshot({
    workflowName,
    runId
  }) {
    if (!this.hasInitialized) {
      await this.init();
    }
    this.logger.debug("Loading workflow snapshot", { workflowName, runId });
    const d = await this.load({
      tableName: TABLE_WORKFLOW_SNAPSHOT,
      keys: { workflow_name: workflowName, run_id: runId }
    });
    return d ? d.snapshot : null;
  }
  async getScoresBySpan({
    traceId,
    spanId,
    pagination: _pagination
  }) {
    throw new MastraError({
      id: "SCORES_STORAGE_GET_SCORES_BY_SPAN_NOT_IMPLEMENTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      details: { traceId, spanId }
    });
  }
  /**
   * OBSERVABILITY
   */
  /**
   * Provides hints for AI tracing strategy selection by the DefaultExporter.
   * Storage adapters can override this to specify their preferred and supported strategies.
   */
  get aiTracingStrategy() {
    if (this.stores?.observability) {
      return this.stores.observability.aiTracingStrategy;
    }
    throw new MastraError({
      id: "MASTRA_STORAGE_TRACING_STRATEGY_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `AI tracing is not supported by this storage adapter (${this.constructor.name})`
    });
  }
  /**
   * Creates a single AI span record in the storage provider.
   */
  async createAISpan(span) {
    if (this.stores?.observability) {
      return this.stores.observability.createAISpan(span);
    }
    throw new MastraError({
      id: "MASTRA_STORAGE_CREATE_AI_SPAN_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `AI tracing is not supported by this storage adapter (${this.constructor.name})`
    });
  }
  /**
   * Updates a single AI span with partial data. Primarily used for realtime trace creation.
   */
  async updateAISpan(params) {
    if (this.stores?.observability) {
      return this.stores.observability.updateAISpan(params);
    }
    throw new MastraError({
      id: "MASTRA_STORAGE_UPDATE_AI_SPAN_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `AI tracing is not supported by this storage adapter (${this.constructor.name})`
    });
  }
  /**
   * Retrieves a single AI trace with all its associated spans.
   */
  async getAITrace(traceId) {
    if (this.stores?.observability) {
      return this.stores.observability.getAITrace(traceId);
    }
    throw new MastraError({
      id: "MASTRA_STORAGE_GET_AI_TRACE_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `AI tracing is not supported by this storage adapter (${this.constructor.name})`
    });
  }
  /**
   * Retrieves a paginated list of AI traces with optional filtering.
   */
  async getAITracesPaginated(args) {
    if (this.stores?.observability) {
      return this.stores.observability.getAITracesPaginated(args);
    }
    throw new MastraError({
      id: "MASTRA_STORAGE_GET_AI_TRACES_PAGINATED_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `AI tracing is not supported by this storage adapter (${this.constructor.name})`
    });
  }
  /**
   * Creates multiple AI spans in a single batch.
   */
  async batchCreateAISpans(args) {
    if (this.stores?.observability) {
      return this.stores.observability.batchCreateAISpans(args);
    }
    throw new MastraError({
      id: "MASTRA_STORAGE_BATCH_CREATE_AI_SPANS_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `AI tracing is not supported by this storage adapter (${this.constructor.name})`
    });
  }
  /**
   * Updates multiple AI spans in a single batch.
   */
  async batchUpdateAISpans(args) {
    if (this.stores?.observability) {
      return this.stores.observability.batchUpdateAISpans(args);
    }
    throw new MastraError({
      id: "MASTRA_STORAGE_BATCH_UPDATE_AI_SPANS_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `AI tracing is not supported by this storage adapter (${this.constructor.name})`
    });
  }
  /**
   * Deletes multiple AI traces and all their associated spans in a single batch operation.
   */
  async batchDeleteAITraces(args) {
    if (this.stores?.observability) {
      return this.stores.observability.batchDeleteAITraces(args);
    }
    throw new MastraError({
      id: "MASTRA_STORAGE_BATCH_DELETE_AI_TRACES_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `AI tracing is not supported by this storage adapter (${this.constructor.name})`
    });
  }
  /**
   * DATABASE INDEX MANAGEMENT
   * These methods delegate to the operations store for index management.
   * Storage adapters that support indexes should implement these in their operations class.
   */
  /**
   * Creates a database index on specified columns
   * @throws {MastraError} if not supported by the storage adapter
   */
  async createIndex(options) {
    if (this.stores?.operations) {
      return this.stores.operations.createIndex(options);
    }
    throw new MastraError({
      id: "MASTRA_STORAGE_CREATE_INDEX_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `Index management is not supported by this storage adapter (${this.constructor.name})`
    });
  }
  /**
   * Drops a database index by name
   * @throws {MastraError} if not supported by the storage adapter
   */
  async dropIndex(indexName) {
    if (this.stores?.operations) {
      return this.stores.operations.dropIndex(indexName);
    }
    throw new MastraError({
      id: "MASTRA_STORAGE_DROP_INDEX_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `Index management is not supported by this storage adapter (${this.constructor.name})`
    });
  }
  /**
   * Lists database indexes for a table or all tables
   * @throws {MastraError} if not supported by the storage adapter
   */
  async listIndexes(tableName) {
    if (this.stores?.operations) {
      return this.stores.operations.listIndexes(tableName);
    }
    throw new MastraError({
      id: "MASTRA_STORAGE_LIST_INDEXES_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `Index management is not supported by this storage adapter (${this.constructor.name})`
    });
  }
  /**
   * Gets detailed statistics for a specific index
   * @throws {MastraError} if not supported by the storage adapter
   */
  async describeIndex(indexName) {
    if (this.stores?.operations) {
      return this.stores.operations.describeIndex(indexName);
    }
    throw new MastraError({
      id: "MASTRA_STORAGE_DESCRIBE_INDEX_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `Index management is not supported by this storage adapter (${this.constructor.name})`
    });
  }
};

// src/storage/domains/legacy-evals/base.ts
var LegacyEvalsStorage = class extends MastraBase {
  constructor() {
    super({
      component: "STORAGE",
      name: "LEGACY_EVALS"
    });
  }
};

// src/storage/domains/memory/base.ts
var MemoryStorage = class extends MastraBase {
  constructor() {
    super({
      component: "STORAGE",
      name: "MEMORY"
    });
  }
  async deleteMessages(_messageIds) {
    throw new Error(
      `Message deletion is not supported by this storage adapter (${this.constructor.name}). The deleteMessages method needs to be implemented in the storage adapter.`
    );
  }
  async getResourceById(_) {
    throw new Error(
      `Resource working memory is not supported by this storage adapter (${this.constructor.name}). Supported storage adapters: LibSQL (@mastra/libsql), PostgreSQL (@mastra/pg), Upstash (@mastra/upstash). To use per-resource working memory, switch to one of these supported storage adapters.`
    );
  }
  async saveResource(_) {
    throw new Error(
      `Resource working memory is not supported by this storage adapter (${this.constructor.name}). Supported storage adapters: LibSQL (@mastra/libsql), PostgreSQL (@mastra/pg), Upstash (@mastra/upstash). To use per-resource working memory, switch to one of these supported storage adapters.`
    );
  }
  async updateResource(_) {
    throw new Error(
      `Resource working memory is not supported by this storage adapter (${this.constructor.name}). Supported storage adapters: LibSQL (@mastra/libsql), PostgreSQL (@mastra/pg), Upstash (@mastra/upstash). To use per-resource working memory, switch to one of these supported storage adapters.`
    );
  }
  castThreadOrderBy(v) {
    return v in THREAD_ORDER_BY_SET ? v : "createdAt";
  }
  castThreadSortDirection(v) {
    return v in THREAD_THREAD_SORT_DIRECTION_SET ? v : "DESC";
  }
};
var THREAD_ORDER_BY_SET = {
  createdAt: true,
  updatedAt: true
};
var THREAD_THREAD_SORT_DIRECTION_SET = {
  ASC: true,
  DESC: true
};

// src/storage/domains/operations/base.ts
var StoreOperations = class extends MastraBase {
  constructor() {
    super({
      component: "STORAGE",
      name: "OPERATIONS"
    });
  }
  getSqlType(type) {
    switch (type) {
      case "text":
        return "TEXT";
      case "timestamp":
        return "TIMESTAMP";
      case "float":
        return "FLOAT";
      case "integer":
        return "INTEGER";
      case "bigint":
        return "BIGINT";
      case "jsonb":
        return "JSONB";
      default:
        return "TEXT";
    }
  }
  getDefaultValue(type) {
    switch (type) {
      case "text":
      case "uuid":
        return "DEFAULT ''";
      case "timestamp":
        return "DEFAULT '1970-01-01 00:00:00'";
      case "integer":
      case "bigint":
      case "float":
        return "DEFAULT 0";
      case "jsonb":
        return "DEFAULT '{}'";
      default:
        return "DEFAULT ''";
    }
  }
  /**
   * DATABASE INDEX MANAGEMENT
   * Optional methods for database index management.
   * Storage adapters can override these to provide index management capabilities.
   */
  /**
   * Creates a database index on specified columns
   * @throws {MastraError} if not supported by the storage adapter
   */
  async createIndex(_options) {
    throw new MastraError({
      id: "MASTRA_STORAGE_CREATE_INDEX_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `Index management is not supported by this storage adapter`
    });
  }
  /**
   * Drops a database index by name
   * @throws {MastraError} if not supported by the storage adapter
   */
  async dropIndex(_indexName) {
    throw new MastraError({
      id: "MASTRA_STORAGE_DROP_INDEX_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `Index management is not supported by this storage adapter`
    });
  }
  /**
   * Lists database indexes for a table or all tables
   * @throws {MastraError} if not supported by the storage adapter
   */
  async listIndexes(_tableName) {
    throw new MastraError({
      id: "MASTRA_STORAGE_LIST_INDEXES_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `Index management is not supported by this storage adapter`
    });
  }
  /**
   * Gets detailed statistics for a specific index
   * @throws {MastraError} if not supported by the storage adapter
   */
  async describeIndex(_indexName) {
    throw new MastraError({
      id: "MASTRA_STORAGE_DESCRIBE_INDEX_NOT_SUPPORTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      text: `Index management is not supported by this storage adapter`
    });
  }
};

// src/storage/domains/scores/base.ts
var ScoresStorage = class extends MastraBase {
  constructor() {
    super({
      component: "STORAGE",
      name: "SCORES"
    });
  }
  async getScoresBySpan({
    traceId,
    spanId,
    pagination: _pagination
  }) {
    throw new MastraError({
      id: "SCORES_STORAGE_GET_SCORES_BY_SPAN_NOT_IMPLEMENTED",
      domain: "STORAGE" /* STORAGE */,
      category: "SYSTEM" /* SYSTEM */,
      details: { traceId, spanId }
    });
  }
};

// src/storage/domains/traces/base.ts
var TracesStorage = class extends MastraBase {
  constructor() {
    super({
      component: "STORAGE",
      name: "TRACES"
    });
  }
};

// src/storage/domains/workflows/base.ts
var WorkflowsStorage = class extends MastraBase {
  constructor() {
    super({
      component: "STORAGE",
      name: "WORKFLOWS"
    });
  }
};

// src/storage/utils.ts
function safelyParseJSON(input) {
  if (input && typeof input === "object") return input;
  if (input == null) return {};
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return input;
    }
  }
  return {};
}

var MongoDBConnector = class _MongoDBConnector {
  #client;
  #dbName;
  #handler;
  #isConnected;
  #db;
  constructor(options) {
    this.#client = options.client;
    this.#dbName = options.dbName;
    this.#handler = options.handler;
    this.#isConnected = false;
  }
  static fromDatabaseConfig(config) {
    if (!config.url?.trim().length) {
      throw new Error(
        "MongoDBStore: url must be provided and cannot be empty. Passing an empty string may cause fallback to local MongoDB defaults."
      );
    }
    if (!config.dbName?.trim().length) {
      throw new Error(
        "MongoDBStore: dbName must be provided and cannot be empty. Passing an empty string may cause fallback to local MongoDB defaults."
      );
    }
    return new _MongoDBConnector({
      client: new lib.MongoClient(config.url, config.options),
      dbName: config.dbName,
      handler: void 0
    });
  }
  static fromConnectionHandler(handler) {
    return new _MongoDBConnector({
      client: void 0,
      dbName: void 0,
      handler
    });
  }
  async getConnection() {
    if (this.#client) {
      if (this.#isConnected && this.#db) {
        return this.#db;
      }
      await this.#client.connect();
      this.#db = this.#client.db(this.#dbName);
      this.#isConnected = true;
      return this.#db;
    }
    throw new Error("MongoDBStore: client cannot be empty. Check your MongoDBConnector configuration.");
  }
  async getCollection(collectionName) {
    if (this.#handler) {
      return this.#handler.getCollection(collectionName);
    }
    const db = await this.getConnection();
    return db.collection(collectionName);
  }
  async close() {
    if (this.#client) {
      await this.#client.close();
      this.#isConnected = false;
      return;
    }
    if (this.#handler) {
      await this.#handler.close();
    }
  }
};
function transformEvalRow(row) {
  let testInfoValue = null;
  if (row.test_info) {
    try {
      testInfoValue = typeof row.test_info === "string" ? safelyParseJSON(row.test_info) : row.test_info;
    } catch (e) {
      console.warn("Failed to parse test_info:", e);
    }
  }
  let resultValue;
  try {
    resultValue = typeof row.result === "string" ? safelyParseJSON(row.result) : row.result;
  } catch (e) {
    console.warn("Failed to parse result:", e);
    throw new Error("Invalid result format");
  }
  return {
    agentName: row.agent_name,
    input: row.input,
    output: row.output,
    result: resultValue,
    metricName: row.metric_name,
    instructions: row.instructions,
    testInfo: testInfoValue,
    globalRunId: row.global_run_id,
    runId: row.run_id,
    createdAt: row.createdAt
  };
}
var LegacyEvalsMongoDB = class extends LegacyEvalsStorage {
  operations;
  constructor({ operations }) {
    super();
    this.operations = operations;
  }
  /** @deprecated use getEvals instead */
  async getEvalsByAgentName(agentName, type) {
    try {
      const query = {
        agent_name: agentName
      };
      if (type === "test") {
        query["test_info"] = { $ne: null };
      }
      if (type === "live") {
        query["test_info"] = null;
      }
      const collection = await this.operations.getCollection(TABLE_EVALS);
      const documents = await collection.find(query).sort({ created_at: "desc" }).toArray();
      const result = documents.map((row) => transformEvalRow(row));
      return result.filter((row) => {
        if (type === "live") {
          return !Boolean(row.testInfo?.testPath);
        }
        if (type === "test") {
          return row.testInfo?.testPath !== null;
        }
        return true;
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("no such table")) {
        return [];
      }
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_EVALS_BY_AGENT_NAME_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { agentName }
        },
        error
      );
    }
  }
  async getEvals(options = {}) {
    const { agentName, type, page = 0, perPage = 100, dateRange } = options;
    const fromDate = dateRange?.start;
    const toDate = dateRange?.end;
    const currentOffset = page * perPage;
    const query = {};
    if (agentName) {
      query["agent_name"] = agentName;
    }
    if (type === "test") {
      query["test_info"] = { $ne: null };
    } else if (type === "live") {
      query["test_info"] = null;
    }
    if (fromDate || toDate) {
      query["createdAt"] = {};
      if (fromDate) {
        query["createdAt"]["$gte"] = fromDate;
      }
      if (toDate) {
        query["createdAt"]["$lte"] = toDate;
      }
    }
    try {
      const collection = await this.operations.getCollection(TABLE_EVALS);
      let total = 0;
      if (page === 0 || perPage < 1e3) {
        total = await collection.countDocuments(query);
      }
      if (total === 0) {
        return {
          evals: [],
          total: 0,
          page,
          perPage,
          hasMore: false
        };
      }
      const documents = await collection.find(query).sort({ created_at: "desc" }).skip(currentOffset).limit(perPage).toArray();
      const evals = documents.map((row) => transformEvalRow(row));
      const filteredEvals = evals.filter((row) => {
        if (type === "live") {
          return !Boolean(row.testInfo?.testPath);
        }
        if (type === "test") {
          return row.testInfo?.testPath !== null;
        }
        return true;
      });
      const hasMore = currentOffset + filteredEvals.length < total;
      return {
        evals: filteredEvals,
        total,
        page,
        perPage,
        hasMore
      };
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_EVALS_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            agentName: agentName || "all",
            type: type || "all",
            page,
            perPage
          }
        },
        error
      );
    }
  }
};

// src/storage/domains/utils.ts
function formatDateForMongoDB(date) {
  return typeof date === "string" ? new Date(date) : date;
}

// src/storage/domains/memory/index.ts
var MemoryStorageMongoDB = class extends MemoryStorage {
  operations;
  constructor({ operations }) {
    super();
    this.operations = operations;
  }
  parseRow(row) {
    let content = row.content;
    if (typeof content === "string") {
      try {
        content = JSON.parse(content);
      } catch {
      }
    }
    const result = {
      id: row.id,
      content,
      role: row.role,
      createdAt: formatDateForMongoDB(row.createdAt),
      threadId: row.thread_id,
      resourceId: row.resourceId
    };
    if (row.type && row.type !== "v2") result.type = row.type;
    return result;
  }
  async _getIncludedMessages({
    threadId,
    selectBy
  }) {
    if (!threadId.trim()) throw new Error("threadId must be a non-empty string");
    const include = selectBy?.include;
    if (!include) return null;
    const collection = await this.operations.getCollection(TABLE_MESSAGES);
    const includedMessages = [];
    for (const inc of include) {
      const { id, withPreviousMessages = 0, withNextMessages = 0 } = inc;
      const searchThreadId = inc.threadId || threadId;
      const allMessages = await collection.find({ thread_id: searchThreadId }).sort({ createdAt: 1 }).toArray();
      const targetIndex = allMessages.findIndex((msg) => msg.id === id);
      if (targetIndex === -1) continue;
      const startIndex = Math.max(0, targetIndex - withPreviousMessages);
      const endIndex = Math.min(allMessages.length - 1, targetIndex + withNextMessages);
      for (let i = startIndex; i <= endIndex; i++) {
        includedMessages.push(allMessages[i]);
      }
    }
    const seen = /* @__PURE__ */ new Set();
    const dedupedMessages = includedMessages.filter((msg) => {
      if (seen.has(msg.id)) return false;
      seen.add(msg.id);
      return true;
    });
    return dedupedMessages.map((row) => this.parseRow(row));
  }
  async getMessages({
    threadId,
    resourceId,
    selectBy,
    format
  }) {
    try {
      if (!threadId.trim()) throw new Error("threadId must be a non-empty string");
      const messages = [];
      const limit = resolveMessageLimit({ last: selectBy?.last, defaultLimit: 40 });
      if (selectBy?.include?.length) {
        const includeMessages = await this._getIncludedMessages({ threadId, selectBy });
        if (includeMessages) {
          messages.push(...includeMessages);
        }
      }
      const excludeIds = messages.map((m) => m.id);
      const collection = await this.operations.getCollection(TABLE_MESSAGES);
      const query = { thread_id: threadId };
      if (excludeIds.length > 0) {
        query.id = { $nin: excludeIds };
      }
      if (limit > 0) {
        const remainingMessages = await collection.find(query).sort({ createdAt: -1 }).limit(limit).toArray();
        messages.push(...remainingMessages.map((row) => this.parseRow(row)));
      }
      messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const list = new MessageList().add(messages, "memory");
      if (format === "v2") return list.get.all.v2();
      return list.get.all.v1();
    } catch (error) {
      throw new MastraError(
        {
          id: "MONGODB_STORE_GET_MESSAGES_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId, resourceId: resourceId ?? "" }
        },
        error
      );
    }
  }
  async getMessagesById({
    messageIds,
    format
  }) {
    if (messageIds.length === 0) return [];
    try {
      const collection = await this.operations.getCollection(TABLE_MESSAGES);
      const rawMessages = await collection.find({ id: { $in: messageIds } }).sort({ createdAt: -1 }).toArray();
      const list = new MessageList().add(rawMessages.map(this.parseRow), "memory");
      if (format === `v1`) return list.get.all.v1();
      return list.get.all.v2();
    } catch (error) {
      throw new MastraError(
        {
          id: "MONGODB_STORE_GET_MESSAGES_BY_ID_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { messageIds: JSON.stringify(messageIds) }
        },
        error
      );
    }
  }
  async getMessagesPaginated(args) {
    const { threadId, resourceId, format, selectBy } = args;
    const { page = 0, perPage: perPageInput, dateRange } = selectBy?.pagination || {};
    const perPage = perPageInput !== void 0 ? perPageInput : resolveMessageLimit({ last: selectBy?.last, defaultLimit: 40 });
    const fromDate = dateRange?.start;
    const toDate = dateRange?.end;
    const messages = [];
    if (selectBy?.include?.length) {
      try {
        const includeMessages = await this._getIncludedMessages({ threadId, selectBy });
        if (includeMessages) {
          messages.push(...includeMessages);
        }
      } catch (error) {
        throw new MastraError(
          {
            id: "MONGODB_STORE_GET_MESSAGES_PAGINATED_GET_INCLUDE_MESSAGES_FAILED",
            domain: ErrorDomain.STORAGE,
            category: ErrorCategory.THIRD_PARTY,
            details: { threadId, resourceId: resourceId ?? "" }
          },
          error
        );
      }
    }
    try {
      if (!threadId.trim()) throw new Error("threadId must be a non-empty string");
      const currentOffset = page * perPage;
      const collection = await this.operations.getCollection(TABLE_MESSAGES);
      const query = { thread_id: threadId };
      if (fromDate) {
        query.createdAt = { ...query.createdAt, $gte: fromDate };
      }
      if (toDate) {
        query.createdAt = { ...query.createdAt, $lte: toDate };
      }
      const total = await collection.countDocuments(query);
      if (total === 0 && messages.length === 0) {
        return {
          messages: [],
          total: 0,
          page,
          perPage,
          hasMore: false
        };
      }
      const excludeIds = messages.map((m) => m.id);
      if (excludeIds.length > 0) {
        query.id = { $nin: excludeIds };
      }
      const dataResult = await collection.find(query).sort({ createdAt: -1 }).skip(currentOffset).limit(perPage).toArray();
      messages.push(...dataResult.map((row) => this.parseRow(row)));
      const messagesToReturn = format === "v1" ? new MessageList().add(messages, "memory").get.all.v1() : new MessageList().add(messages, "memory").get.all.v2();
      return {
        messages: messagesToReturn,
        total,
        page,
        perPage,
        hasMore: (page + 1) * perPage < total
      };
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: "MONGODB_STORE_GET_MESSAGES_PAGINATED_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId, resourceId: resourceId ?? "" }
        },
        error
      );
      this.logger?.trackException?.(mastraError);
      this.logger?.error?.(mastraError.toString());
      return { messages: [], total: 0, page, perPage, hasMore: false };
    }
  }
  async saveMessages({
    messages,
    format
  }) {
    if (messages.length === 0) return messages;
    try {
      const threadId = messages[0]?.threadId;
      if (!threadId) {
        throw new Error("Thread ID is required");
      }
      const collection = await this.operations.getCollection(TABLE_MESSAGES);
      const threadsCollection = await this.operations.getCollection(TABLE_THREADS);
      const messagesToInsert = messages.map((message) => {
        const time = message.createdAt || /* @__PURE__ */ new Date();
        if (!message.threadId) {
          throw new Error(
            "Expected to find a threadId for message, but couldn't find one. An unexpected error has occurred."
          );
        }
        if (!message.resourceId) {
          throw new Error(
            "Expected to find a resourceId for message, but couldn't find one. An unexpected error has occurred."
          );
        }
        return {
          updateOne: {
            filter: { id: message.id },
            update: {
              $set: {
                id: message.id,
                thread_id: message.threadId,
                content: typeof message.content === "object" ? JSON.stringify(message.content) : message.content,
                role: message.role,
                type: message.type || "v2",
                createdAt: formatDateForMongoDB(time),
                resourceId: message.resourceId
              }
            },
            upsert: true
          }
        };
      });
      await Promise.all([
        collection.bulkWrite(messagesToInsert),
        threadsCollection.updateOne({ id: threadId }, { $set: { updatedAt: /* @__PURE__ */ new Date() } })
      ]);
      const list = new MessageList().add(messages, "memory");
      if (format === "v2") return list.get.all.v2();
      return list.get.all.v1();
    } catch (error) {
      throw new MastraError(
        {
          id: "MONGODB_STORE_SAVE_MESSAGES_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY
        },
        error
      );
    }
  }
  async updateMessages({
    messages
  }) {
    if (messages.length === 0) {
      return [];
    }
    const messageIds = messages.map((m) => m.id);
    const collection = await this.operations.getCollection(TABLE_MESSAGES);
    const existingMessages = await collection.find({ id: { $in: messageIds } }).toArray();
    const existingMessagesParsed = existingMessages.map((msg) => this.parseRow(msg));
    if (existingMessagesParsed.length === 0) {
      return [];
    }
    const threadIdsToUpdate = /* @__PURE__ */ new Set();
    const bulkOps = [];
    for (const existingMessage of existingMessagesParsed) {
      const updatePayload = messages.find((m) => m.id === existingMessage.id);
      if (!updatePayload) continue;
      const { id, ...fieldsToUpdate } = updatePayload;
      if (Object.keys(fieldsToUpdate).length === 0) continue;
      threadIdsToUpdate.add(existingMessage.threadId);
      if (updatePayload.threadId && updatePayload.threadId !== existingMessage.threadId) {
        threadIdsToUpdate.add(updatePayload.threadId);
      }
      const updateDoc = {};
      const updatableFields = { ...fieldsToUpdate };
      if (updatableFields.content) {
        const newContent = {
          ...existingMessage.content,
          ...updatableFields.content,
          // Deep merge metadata if it exists on both
          ...existingMessage.content?.metadata && updatableFields.content.metadata ? {
            metadata: {
              ...existingMessage.content.metadata,
              ...updatableFields.content.metadata
            }
          } : {}
        };
        updateDoc.content = JSON.stringify(newContent);
        delete updatableFields.content;
      }
      for (const key in updatableFields) {
        if (Object.prototype.hasOwnProperty.call(updatableFields, key)) {
          const dbKey = key === "threadId" ? "thread_id" : key;
          let value = updatableFields[key];
          if (typeof value === "object" && value !== null) {
            value = JSON.stringify(value);
          }
          updateDoc[dbKey] = value;
        }
      }
      if (Object.keys(updateDoc).length > 0) {
        bulkOps.push({
          updateOne: {
            filter: { id },
            update: { $set: updateDoc }
          }
        });
      }
    }
    if (bulkOps.length > 0) {
      await collection.bulkWrite(bulkOps);
    }
    if (threadIdsToUpdate.size > 0) {
      const threadsCollection = await this.operations.getCollection(TABLE_THREADS);
      await threadsCollection.updateMany(
        { id: { $in: Array.from(threadIdsToUpdate) } },
        { $set: { updatedAt: /* @__PURE__ */ new Date() } }
      );
    }
    const updatedMessages = await collection.find({ id: { $in: messageIds } }).toArray();
    return updatedMessages.map((row) => this.parseRow(row));
  }
  async getResourceById({ resourceId }) {
    try {
      const collection = await this.operations.getCollection(TABLE_RESOURCES);
      const result = await collection.findOne({ id: resourceId });
      if (!result) {
        return null;
      }
      return {
        id: result.id,
        workingMemory: result.workingMemory || "",
        metadata: typeof result.metadata === "string" ? safelyParseJSON(result.metadata) : result.metadata,
        createdAt: formatDateForMongoDB(result.createdAt),
        updatedAt: formatDateForMongoDB(result.updatedAt)
      };
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_RESOURCE_BY_ID_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { resourceId }
        },
        error
      );
    }
  }
  async saveResource({ resource }) {
    try {
      const collection = await this.operations.getCollection(TABLE_RESOURCES);
      await collection.updateOne(
        { id: resource.id },
        {
          $set: {
            ...resource,
            metadata: JSON.stringify(resource.metadata)
          }
        },
        { upsert: true }
      );
      return resource;
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_SAVE_RESOURCE_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { resourceId: resource.id }
        },
        error
      );
    }
  }
  async updateResource({
    resourceId,
    workingMemory,
    metadata
  }) {
    try {
      const existingResource = await this.getResourceById({ resourceId });
      if (!existingResource) {
        const newResource = {
          id: resourceId,
          workingMemory: workingMemory || "",
          metadata: metadata || {},
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date()
        };
        return this.saveResource({ resource: newResource });
      }
      const updatedResource = {
        ...existingResource,
        workingMemory: workingMemory !== void 0 ? workingMemory : existingResource.workingMemory,
        metadata: metadata ? { ...existingResource.metadata, ...metadata } : existingResource.metadata,
        updatedAt: /* @__PURE__ */ new Date()
      };
      const collection = await this.operations.getCollection(TABLE_RESOURCES);
      const updateDoc = { updatedAt: updatedResource.updatedAt };
      if (workingMemory !== void 0) {
        updateDoc.workingMemory = workingMemory;
      }
      if (metadata) {
        updateDoc.metadata = JSON.stringify(updatedResource.metadata);
      }
      await collection.updateOne({ id: resourceId }, { $set: updateDoc });
      return updatedResource;
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_UPDATE_RESOURCE_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { resourceId }
        },
        error
      );
    }
  }
  async getThreadById({ threadId }) {
    try {
      const collection = await this.operations.getCollection(TABLE_THREADS);
      const result = await collection.findOne({ id: threadId });
      if (!result) {
        return null;
      }
      return {
        ...result,
        metadata: typeof result.metadata === "string" ? safelyParseJSON(result.metadata) : result.metadata
      };
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_THREAD_BY_ID_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId }
        },
        error
      );
    }
  }
  async getThreadsByResourceId({ resourceId }) {
    try {
      const collection = await this.operations.getCollection(TABLE_THREADS);
      const results = await collection.find({ resourceId }).sort({ updatedAt: -1 }).toArray();
      if (!results.length) {
        return [];
      }
      return results.map((result) => ({
        ...result,
        metadata: typeof result.metadata === "string" ? safelyParseJSON(result.metadata) : result.metadata
      }));
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_THREADS_BY_RESOURCE_ID_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { resourceId }
        },
        error
      );
    }
  }
  async getThreadsByResourceIdPaginated(args) {
    try {
      const { resourceId, page, perPage } = args;
      const collection = await this.operations.getCollection(TABLE_THREADS);
      const query = { resourceId };
      const total = await collection.countDocuments(query);
      const threads = await collection.find(query).sort({ updatedAt: -1 }).skip(page * perPage).limit(perPage).toArray();
      return {
        threads: threads.map((thread) => ({
          id: thread.id,
          title: thread.title,
          resourceId: thread.resourceId,
          createdAt: formatDateForMongoDB(thread.createdAt),
          updatedAt: formatDateForMongoDB(thread.updatedAt),
          metadata: thread.metadata || {}
        })),
        total,
        page,
        perPage,
        hasMore: (page + 1) * perPage < total
      };
    } catch (error) {
      throw new MastraError(
        {
          id: "MONGODB_STORE_GET_THREADS_BY_RESOURCE_ID_PAGINATED_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { resourceId: args.resourceId }
        },
        error
      );
    }
  }
  async saveThread({ thread }) {
    try {
      const collection = await this.operations.getCollection(TABLE_THREADS);
      await collection.updateOne(
        { id: thread.id },
        {
          $set: {
            ...thread,
            metadata: thread.metadata
          }
        },
        { upsert: true }
      );
      return thread;
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_SAVE_THREAD_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId: thread.id }
        },
        error
      );
    }
  }
  async updateThread({
    id,
    title,
    metadata
  }) {
    const thread = await this.getThreadById({ threadId: id });
    if (!thread) {
      throw new MastraError({
        id: "STORAGE_MONGODB_STORE_UPDATE_THREAD_NOT_FOUND",
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.THIRD_PARTY,
        details: { threadId: id, status: 404 },
        text: `Thread ${id} not found`
      });
    }
    const updatedThread = {
      ...thread,
      title,
      metadata: {
        ...thread.metadata,
        ...metadata
      }
    };
    try {
      const collection = await this.operations.getCollection(TABLE_THREADS);
      await collection.updateOne(
        { id },
        {
          $set: {
            title,
            metadata: updatedThread.metadata
          }
        }
      );
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_UPDATE_THREAD_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId: id }
        },
        error
      );
    }
    return updatedThread;
  }
  async deleteThread({ threadId }) {
    try {
      const collectionMessages = await this.operations.getCollection(TABLE_MESSAGES);
      await collectionMessages.deleteMany({ thread_id: threadId });
      const collectionThreads = await this.operations.getCollection(TABLE_THREADS);
      await collectionThreads.deleteOne({ id: threadId });
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_DELETE_THREAD_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId }
        },
        error
      );
    }
  }
};
var StoreOperationsMongoDB = class extends StoreOperations {
  #connector;
  constructor(config) {
    super();
    this.#connector = config.connector;
  }
  async getCollection(collectionName) {
    return this.#connector.getCollection(collectionName);
  }
  async hasColumn(_table, _column) {
    return true;
  }
  async createTable() {
  }
  async alterTable(_args) {
  }
  async clearTable({ tableName }) {
    try {
      const collection = await this.getCollection(tableName);
      await collection.deleteMany({});
    } catch (error) {
      if (error instanceof Error) {
        const matstraError = new MastraError(
          {
            id: "STORAGE_MONGODB_STORE_CLEAR_TABLE_FAILED",
            domain: ErrorDomain.STORAGE,
            category: ErrorCategory.THIRD_PARTY,
            details: { tableName }
          },
          error
        );
        this.logger.error(matstraError.message);
        this.logger?.trackException(matstraError);
      }
    }
  }
  async dropTable({ tableName }) {
    try {
      const collection = await this.getCollection(tableName);
      await collection.drop();
    } catch (error) {
      if (error instanceof Error && error.message.includes("ns not found")) {
        return;
      }
      throw new MastraError(
        {
          id: "MONGODB_STORE_DROP_TABLE_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName }
        },
        error
      );
    }
  }
  processJsonbFields(tableName, record) {
    const schema = TABLE_SCHEMAS[tableName];
    return Object.fromEntries(
      Object.entries(schema).map(([key, value]) => {
        if (value.type === "jsonb" && record[key] && typeof record[key] === "string") {
          return [key, safelyParseJSON(record[key])];
        }
        return [key, record[key]];
      })
    );
  }
  async insert({ tableName, record }) {
    try {
      const collection = await this.getCollection(tableName);
      const recordToInsert = this.processJsonbFields(tableName, record);
      await collection.insertOne(recordToInsert);
    } catch (error) {
      if (error instanceof Error) {
        const matstraError = new MastraError(
          {
            id: "STORAGE_MONGODB_STORE_INSERT_FAILED",
            domain: ErrorDomain.STORAGE,
            category: ErrorCategory.THIRD_PARTY,
            details: { tableName }
          },
          error
        );
        this.logger.error(matstraError.message);
        this.logger?.trackException(matstraError);
      }
    }
  }
  async batchInsert({ tableName, records }) {
    if (!records.length) {
      return;
    }
    try {
      const collection = await this.getCollection(tableName);
      const processedRecords = records.map((record) => this.processJsonbFields(tableName, record));
      await collection.insertMany(processedRecords);
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_BATCH_INSERT_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName }
        },
        error
      );
    }
  }
  async load({ tableName, keys }) {
    this.logger.info(`Loading ${tableName} with keys ${JSON.stringify(keys)}`);
    try {
      const collection = await this.getCollection(tableName);
      return await collection.find(keys).toArray();
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_LOAD_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName }
        },
        error
      );
    }
  }
};
function transformScoreRow(row) {
  let scorerValue = null;
  if (row.scorer) {
    try {
      scorerValue = typeof row.scorer === "string" ? safelyParseJSON(row.scorer) : row.scorer;
    } catch (e) {
      console.warn("Failed to parse scorer:", e);
    }
  }
  let preprocessStepResultValue = null;
  if (row.preprocessStepResult) {
    try {
      preprocessStepResultValue = typeof row.preprocessStepResult === "string" ? safelyParseJSON(row.preprocessStepResult) : row.preprocessStepResult;
    } catch (e) {
      console.warn("Failed to parse preprocessStepResult:", e);
    }
  }
  let analyzeStepResultValue = null;
  if (row.analyzeStepResult) {
    try {
      analyzeStepResultValue = typeof row.analyzeStepResult === "string" ? safelyParseJSON(row.analyzeStepResult) : row.analyzeStepResult;
    } catch (e) {
      console.warn("Failed to parse analyzeStepResult:", e);
    }
  }
  let inputValue = null;
  if (row.input) {
    try {
      inputValue = typeof row.input === "string" ? safelyParseJSON(row.input) : row.input;
    } catch (e) {
      console.warn("Failed to parse input:", e);
    }
  }
  let outputValue = null;
  if (row.output) {
    try {
      outputValue = typeof row.output === "string" ? safelyParseJSON(row.output) : row.output;
    } catch (e) {
      console.warn("Failed to parse output:", e);
    }
  }
  let entityValue = null;
  if (row.entity) {
    try {
      entityValue = typeof row.entity === "string" ? safelyParseJSON(row.entity) : row.entity;
    } catch (e) {
      console.warn("Failed to parse entity:", e);
    }
  }
  let runtimeContextValue = null;
  if (row.runtimeContext) {
    try {
      runtimeContextValue = typeof row.runtimeContext === "string" ? safelyParseJSON(row.runtimeContext) : row.runtimeContext;
    } catch (e) {
      console.warn("Failed to parse runtimeContext:", e);
    }
  }
  let metadataValue = null;
  if (row.metadata) {
    try {
      metadataValue = typeof row.metadata === "string" ? safelyParseJSON(row.metadata) : row.metadata;
    } catch (e) {
      console.warn("Failed to parse metadata:", e);
    }
  }
  return {
    id: row.id,
    entityId: row.entityId,
    entityType: row.entityType,
    scorerId: row.scorerId,
    traceId: row.traceId,
    spanId: row.spanId,
    runId: row.runId,
    scorer: scorerValue,
    preprocessStepResult: preprocessStepResultValue,
    preprocessPrompt: row.preprocessPrompt,
    analyzeStepResult: analyzeStepResultValue,
    generateScorePrompt: row.generateScorePrompt,
    score: row.score,
    analyzePrompt: row.analyzePrompt,
    reasonPrompt: row.reasonPrompt,
    metadata: metadataValue,
    input: inputValue,
    output: outputValue,
    additionalContext: row.additionalContext,
    runtimeContext: runtimeContextValue,
    entity: entityValue,
    source: row.source,
    resourceId: row.resourceId,
    threadId: row.threadId,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt)
  };
}
var ScoresStorageMongoDB = class extends ScoresStorage {
  operations;
  constructor({ operations }) {
    super();
    this.operations = operations;
  }
  async getScoreById({ id }) {
    try {
      const collection = await this.operations.getCollection(TABLE_SCORERS);
      const document = await collection.findOne({ id });
      if (!document) {
        return null;
      }
      return transformScoreRow(document);
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_SCORE_BY_ID_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { id }
        },
        error
      );
    }
  }
  async saveScore(score) {
    let validatedScore;
    try {
      validatedScore = saveScorePayloadSchema.parse(score);
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_SAVE_SCORE_VALIDATION_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY
        },
        error
      );
    }
    try {
      const now = /* @__PURE__ */ new Date();
      const scoreId = `score-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const scoreData = {
        id: scoreId,
        entityId: validatedScore.entityId,
        entityType: validatedScore.entityType,
        scorerId: validatedScore.scorerId,
        traceId: validatedScore.traceId || "",
        spanId: validatedScore.spanId || "",
        runId: validatedScore.runId,
        scorer: typeof validatedScore.scorer === "string" ? safelyParseJSON(validatedScore.scorer) : validatedScore.scorer,
        preprocessStepResult: typeof validatedScore.preprocessStepResult === "string" ? safelyParseJSON(validatedScore.preprocessStepResult) : validatedScore.preprocessStepResult,
        analyzeStepResult: typeof validatedScore.analyzeStepResult === "string" ? safelyParseJSON(validatedScore.analyzeStepResult) : validatedScore.analyzeStepResult,
        score: validatedScore.score,
        reason: validatedScore.reason,
        preprocessPrompt: validatedScore.preprocessPrompt,
        generateScorePrompt: validatedScore.generateScorePrompt,
        generateReasonPrompt: validatedScore.generateReasonPrompt,
        analyzePrompt: validatedScore.analyzePrompt,
        input: typeof validatedScore.input === "string" ? safelyParseJSON(validatedScore.input) : validatedScore.input,
        output: typeof validatedScore.output === "string" ? safelyParseJSON(validatedScore.output) : validatedScore.output,
        additionalContext: validatedScore.additionalContext,
        runtimeContext: typeof validatedScore.runtimeContext === "string" ? safelyParseJSON(validatedScore.runtimeContext) : validatedScore.runtimeContext,
        entity: typeof validatedScore.entity === "string" ? safelyParseJSON(validatedScore.entity) : validatedScore.entity,
        source: validatedScore.source,
        resourceId: validatedScore.resourceId || "",
        threadId: validatedScore.threadId || "",
        createdAt: now,
        updatedAt: now
      };
      const collection = await this.operations.getCollection(TABLE_SCORERS);
      await collection.insertOne(scoreData);
      const savedScore = {
        ...score,
        id: scoreId,
        createdAt: now,
        updatedAt: now
      };
      return { score: savedScore };
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_SAVE_SCORE_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { scorerId: score.scorerId, runId: score.runId }
        },
        error
      );
    }
  }
  async getScoresByScorerId({
    scorerId,
    pagination,
    entityId,
    entityType,
    source
  }) {
    try {
      const query = { scorerId };
      if (entityId) {
        query.entityId = entityId;
      }
      if (entityType) {
        query.entityType = entityType;
      }
      if (source) {
        query.source = source;
      }
      const collection = await this.operations.getCollection(TABLE_SCORERS);
      const total = await collection.countDocuments(query);
      const currentOffset = pagination.page * pagination.perPage;
      if (total === 0) {
        return {
          scores: [],
          pagination: {
            total: 0,
            page: pagination.page,
            perPage: pagination.perPage,
            hasMore: false
          }
        };
      }
      const documents = await collection.find(query).sort({ createdAt: "desc" }).skip(currentOffset).limit(pagination.perPage).toArray();
      const scores = documents.map((row) => transformScoreRow(row));
      const hasMore = currentOffset + scores.length < total;
      return {
        scores,
        pagination: {
          total,
          page: pagination.page,
          perPage: pagination.perPage,
          hasMore
        }
      };
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_SCORES_BY_SCORER_ID_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { scorerId, page: pagination.page, perPage: pagination.perPage }
        },
        error
      );
    }
  }
  async getScoresByRunId({
    runId,
    pagination
  }) {
    try {
      const collection = await this.operations.getCollection(TABLE_SCORERS);
      const total = await collection.countDocuments({ runId });
      const currentOffset = pagination.page * pagination.perPage;
      if (total === 0) {
        return {
          scores: [],
          pagination: {
            total: 0,
            page: pagination.page,
            perPage: pagination.perPage,
            hasMore: false
          }
        };
      }
      const documents = await collection.find({ runId }).sort({ createdAt: "desc" }).skip(currentOffset).limit(pagination.perPage).toArray();
      const scores = documents.map((row) => transformScoreRow(row));
      const hasMore = currentOffset + scores.length < total;
      return {
        scores,
        pagination: {
          total,
          page: pagination.page,
          perPage: pagination.perPage,
          hasMore
        }
      };
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_SCORES_BY_RUN_ID_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { runId, page: pagination.page, perPage: pagination.perPage }
        },
        error
      );
    }
  }
  async getScoresByEntityId({
    entityId,
    entityType,
    pagination
  }) {
    try {
      const collection = await this.operations.getCollection(TABLE_SCORERS);
      const total = await collection.countDocuments({ entityId, entityType });
      const currentOffset = pagination.page * pagination.perPage;
      if (total === 0) {
        return {
          scores: [],
          pagination: {
            total: 0,
            page: pagination.page,
            perPage: pagination.perPage,
            hasMore: false
          }
        };
      }
      const documents = await collection.find({ entityId, entityType }).sort({ createdAt: "desc" }).skip(currentOffset).limit(pagination.perPage).toArray();
      const scores = documents.map((row) => transformScoreRow(row));
      const hasMore = currentOffset + scores.length < total;
      return {
        scores,
        pagination: {
          total,
          page: pagination.page,
          perPage: pagination.perPage,
          hasMore
        }
      };
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_SCORES_BY_ENTITY_ID_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { entityId, entityType, page: pagination.page, perPage: pagination.perPage }
        },
        error
      );
    }
  }
  async getScoresBySpan({
    traceId,
    spanId,
    pagination
  }) {
    try {
      const query = { traceId, spanId };
      const collection = await this.operations.getCollection(TABLE_SCORERS);
      const total = await collection.countDocuments(query);
      const currentOffset = pagination.page * pagination.perPage;
      if (total === 0) {
        return {
          scores: [],
          pagination: {
            total: 0,
            page: pagination.page,
            perPage: pagination.perPage,
            hasMore: false
          }
        };
      }
      const documents = await collection.find(query).sort({ createdAt: "desc" }).skip(currentOffset).limit(pagination.perPage).toArray();
      const scores = documents.map((row) => transformScoreRow(row));
      const hasMore = currentOffset + scores.length < total;
      return {
        scores,
        pagination: {
          total,
          page: pagination.page,
          perPage: pagination.perPage,
          hasMore
        }
      };
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_SCORES_BY_SPAN_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { traceId, spanId, page: pagination.page, perPage: pagination.perPage }
        },
        error
      );
    }
  }
};
var TracesStorageMongoDB = class extends TracesStorage {
  operations;
  constructor({ operations }) {
    super();
    this.operations = operations;
  }
  async getTraces(args) {
    if (args.fromDate || args.toDate) {
      args.dateRange = {
        start: args.fromDate,
        end: args.toDate
      };
    }
    try {
      const result = await this.getTracesPaginated(args);
      return result.traces;
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_TRACES_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY
        },
        error
      );
    }
  }
  async getTracesPaginated(args) {
    const { name, scope, page = 0, perPage = 100, attributes, filters, dateRange } = args;
    const fromDate = dateRange?.start;
    const toDate = dateRange?.end;
    const currentOffset = page * perPage;
    const query = {};
    if (name) {
      query["name"] = new RegExp(name);
    }
    if (scope) {
      query["scope"] = scope;
    }
    if (attributes) {
      query["$and"] = Object.entries(attributes).map(([key, value]) => ({
        [`attributes.${key}`]: value
      }));
    }
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        query[key] = value;
      });
    }
    if (fromDate || toDate) {
      query["createdAt"] = {};
      if (fromDate) {
        query["createdAt"]["$gte"] = fromDate;
      }
      if (toDate) {
        query["createdAt"]["$lte"] = toDate;
      }
    }
    try {
      const collection = await this.operations.getCollection(TABLE_TRACES);
      const total = await collection.countDocuments(query);
      if (total === 0) {
        return {
          traces: [],
          total: 0,
          page,
          perPage,
          hasMore: false
        };
      }
      const result = await collection.find(query, {
        sort: { startTime: -1 }
      }).limit(perPage).skip(currentOffset).toArray();
      const traces = result.map((row) => ({
        id: row.id,
        parentSpanId: row.parentSpanId,
        traceId: row.traceId,
        name: row.name,
        scope: row.scope,
        kind: row.kind,
        status: safelyParseJSON(row.status),
        events: safelyParseJSON(row.events),
        links: safelyParseJSON(row.links),
        attributes: safelyParseJSON(row.attributes),
        startTime: row.startTime,
        endTime: row.endTime,
        other: safelyParseJSON(row.other),
        createdAt: row.createdAt
      }));
      return {
        traces,
        total,
        page,
        perPage,
        hasMore: currentOffset + traces.length < total
      };
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_TRACES_PAGINATED_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY
        },
        error
      );
    }
  }
  async batchTraceInsert({ records }) {
    this.logger.debug("Batch inserting traces", { count: records.length });
    await this.operations.batchInsert({
      tableName: TABLE_TRACES,
      records
    });
  }
};
var WorkflowsStorageMongoDB = class extends WorkflowsStorage {
  operations;
  constructor({ operations }) {
    super();
    this.operations = operations;
  }
  updateWorkflowResults({
    // workflowName,
    // runId,
    // stepId,
    // result,
    // runtimeContext,
  }) {
    throw new Error("Method not implemented.");
  }
  updateWorkflowState({
    // workflowName,
    // runId,
    // opts,
  }) {
    throw new Error("Method not implemented.");
  }
  async persistWorkflowSnapshot({
    workflowName,
    runId,
    resourceId,
    snapshot
  }) {
    try {
      const collection = await this.operations.getCollection(TABLE_WORKFLOW_SNAPSHOT);
      await collection.updateOne(
        { workflow_name: workflowName, run_id: runId },
        {
          $set: {
            workflow_name: workflowName,
            run_id: runId,
            resourceId,
            snapshot,
            createdAt: /* @__PURE__ */ new Date(),
            updatedAt: /* @__PURE__ */ new Date()
          }
        },
        { upsert: true }
      );
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_PERSIST_WORKFLOW_SNAPSHOT_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { workflowName, runId }
        },
        error
      );
    }
  }
  async loadWorkflowSnapshot({
    workflowName,
    runId
  }) {
    try {
      const result = await this.operations.load({
        tableName: TABLE_WORKFLOW_SNAPSHOT,
        keys: {
          workflow_name: workflowName,
          run_id: runId
        }
      });
      if (!result?.length) {
        return null;
      }
      return typeof result[0].snapshot === "string" ? safelyParseJSON(result[0].snapshot) : result[0].snapshot;
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_LOAD_WORKFLOW_SNAPSHOT_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { workflowName, runId }
        },
        error
      );
    }
  }
  async getWorkflowRuns(args) {
    const options = args || {};
    try {
      const query = {};
      if (options.workflowName) {
        query["workflow_name"] = options.workflowName;
      }
      if (options.fromDate) {
        query["createdAt"] = { $gte: options.fromDate };
      }
      if (options.toDate) {
        if (query["createdAt"]) {
          query["createdAt"].$lte = options.toDate;
        } else {
          query["createdAt"] = { $lte: options.toDate };
        }
      }
      if (options.resourceId) {
        query["resourceId"] = options.resourceId;
      }
      const collection = await this.operations.getCollection(TABLE_WORKFLOW_SNAPSHOT);
      const total = await collection.countDocuments(query);
      let cursor = collection.find(query).sort({ createdAt: -1 });
      if (options.offset) {
        cursor = cursor.skip(options.offset);
      }
      if (options.limit) {
        cursor = cursor.limit(options.limit);
      }
      const results = await cursor.toArray();
      const runs = results.map((row) => this.parseWorkflowRun(row));
      return {
        runs,
        total
      };
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_WORKFLOW_RUNS_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { workflowName: options.workflowName || "unknown" }
        },
        error
      );
    }
  }
  async getWorkflowRunById(args) {
    try {
      const query = {};
      if (args.runId) {
        query["run_id"] = args.runId;
      }
      if (args.workflowName) {
        query["workflow_name"] = args.workflowName;
      }
      const collection = await this.operations.getCollection(TABLE_WORKFLOW_SNAPSHOT);
      const result = await collection.findOne(query);
      if (!result) {
        return null;
      }
      return this.parseWorkflowRun(result);
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_GET_WORKFLOW_RUN_BY_ID_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { runId: args.runId }
        },
        error
      );
    }
  }
  parseWorkflowRun(row) {
    let parsedSnapshot = row.snapshot;
    if (typeof parsedSnapshot === "string") {
      try {
        parsedSnapshot = typeof row.snapshot === "string" ? safelyParseJSON(row.snapshot) : row.snapshot;
      } catch (e) {
        console.warn(`Failed to parse snapshot for workflow ${row.workflow_name}: ${e}`);
      }
    }
    return {
      workflowName: row.workflow_name,
      runId: row.run_id,
      snapshot: parsedSnapshot,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      resourceId: row.resourceId
    };
  }
};

// src/storage/index.ts
var loadConnector = (config) => {
  try {
    if ("connectorHandler" in config) {
      return MongoDBConnector.fromConnectionHandler(config.connectorHandler);
    }
  } catch (error) {
    throw new MastraError(
      {
        id: "STORAGE_MONGODB_STORE_CONSTRUCTOR_FAILED",
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.USER,
        details: { connectionHandler: true }
      },
      error
    );
  }
  try {
    return MongoDBConnector.fromDatabaseConfig({
      options: config.options,
      url: config.url,
      dbName: config.dbName
    });
  } catch (error) {
    throw new MastraError(
      {
        id: "STORAGE_MONGODB_STORE_CONSTRUCTOR_FAILED",
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.USER,
        details: { url: config?.url, dbName: config?.dbName }
      },
      error
    );
  }
};
var MongoDBStore = class extends MastraStorage {
  #connector;
  stores;
  get supports() {
    return {
      selectByIncludeResourceScope: true,
      resourceWorkingMemory: true,
      hasColumn: false,
      createTable: false,
      deleteMessages: false,
      getScoresBySpan: true
    };
  }
  constructor(config) {
    super({ name: "MongoDBStore" });
    this.stores = {};
    this.#connector = loadConnector(config);
    const operations = new StoreOperationsMongoDB({
      connector: this.#connector
    });
    const memory = new MemoryStorageMongoDB({
      operations
    });
    const traces = new TracesStorageMongoDB({
      operations
    });
    const legacyEvals = new LegacyEvalsMongoDB({
      operations
    });
    const scores = new ScoresStorageMongoDB({
      operations
    });
    const workflows = new WorkflowsStorageMongoDB({
      operations
    });
    this.stores = {
      operations,
      memory,
      traces,
      legacyEvals,
      scores,
      workflows
    };
  }
  async createTable({
    tableName,
    schema
  }) {
    return this.stores.operations.createTable({ tableName, schema });
  }
  async alterTable(_args) {
    return this.stores.operations.alterTable(_args);
  }
  async dropTable({ tableName }) {
    return this.stores.operations.dropTable({ tableName });
  }
  async clearTable({ tableName }) {
    return this.stores.operations.clearTable({ tableName });
  }
  async insert({ tableName, record }) {
    return this.stores.operations.insert({ tableName, record });
  }
  async batchInsert({ tableName, records }) {
    return this.stores.operations.batchInsert({ tableName, records });
  }
  async load({ tableName, keys }) {
    return this.stores.operations.load({ tableName, keys });
  }
  async getThreadById({ threadId }) {
    return this.stores.memory.getThreadById({ threadId });
  }
  async getThreadsByResourceId({ resourceId }) {
    return this.stores.memory.getThreadsByResourceId({ resourceId });
  }
  async saveThread({ thread }) {
    return this.stores.memory.saveThread({ thread });
  }
  async updateThread({
    id,
    title,
    metadata
  }) {
    return this.stores.memory.updateThread({ id, title, metadata });
  }
  async deleteThread({ threadId }) {
    return this.stores.memory.deleteThread({ threadId });
  }
  async getMessages({
    threadId,
    selectBy,
    format
  }) {
    return this.stores.memory.getMessages({ threadId, selectBy, format });
  }
  async getMessagesById({
    messageIds,
    format
  }) {
    return this.stores.memory.getMessagesById({ messageIds, format });
  }
  async saveMessages(args) {
    return this.stores.memory.saveMessages(args);
  }
  async getThreadsByResourceIdPaginated(_args) {
    return this.stores.memory.getThreadsByResourceIdPaginated(_args);
  }
  async getMessagesPaginated(_args) {
    return this.stores.memory.getMessagesPaginated(_args);
  }
  async updateMessages(_args) {
    return this.stores.memory.updateMessages(_args);
  }
  async getTraces(args) {
    return this.stores.traces.getTraces(args);
  }
  async getTracesPaginated(args) {
    return this.stores.traces.getTracesPaginated(args);
  }
  async getWorkflowRuns(args) {
    return this.stores.workflows.getWorkflowRuns(args);
  }
  async getEvals(options = {}) {
    return this.stores.legacyEvals.getEvals(options);
  }
  async getEvalsByAgentName(agentName, type) {
    return this.stores.legacyEvals.getEvalsByAgentName(agentName, type);
  }
  async updateWorkflowResults({
    workflowName,
    runId,
    stepId,
    result,
    runtimeContext
  }) {
    return this.stores.workflows.updateWorkflowResults({ workflowName, runId, stepId, result, runtimeContext });
  }
  async updateWorkflowState({
    workflowName,
    runId,
    opts
  }) {
    return this.stores.workflows.updateWorkflowState({ workflowName, runId, opts });
  }
  async persistWorkflowSnapshot({
    workflowName,
    runId,
    resourceId,
    snapshot
  }) {
    return this.stores.workflows.persistWorkflowSnapshot({ workflowName, runId, resourceId, snapshot });
  }
  async loadWorkflowSnapshot({
    workflowName,
    runId
  }) {
    return this.stores.workflows.loadWorkflowSnapshot({ workflowName, runId });
  }
  async getWorkflowRunById({
    runId,
    workflowName
  }) {
    return this.stores.workflows.getWorkflowRunById({ runId, workflowName });
  }
  async close() {
    try {
      await this.#connector.close();
    } catch (error) {
      throw new MastraError(
        {
          id: "STORAGE_MONGODB_STORE_CLOSE_FAILED",
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.USER
        },
        error
      );
    }
  }
  /**
   * SCORERS
   */
  async getScoreById({ id }) {
    return this.stores.scores.getScoreById({ id });
  }
  async saveScore(score) {
    return this.stores.scores.saveScore(score);
  }
  async getScoresByRunId({
    runId,
    pagination
  }) {
    return this.stores.scores.getScoresByRunId({ runId, pagination });
  }
  async getScoresByEntityId({
    entityId,
    entityType,
    pagination
  }) {
    return this.stores.scores.getScoresByEntityId({ entityId, entityType, pagination });
  }
  async getScoresByScorerId({
    scorerId,
    pagination,
    entityId,
    entityType,
    source
  }) {
    return this.stores.scores.getScoresByScorerId({ scorerId, pagination, entityId, entityType, source });
  }
  async getScoresBySpan({
    traceId,
    spanId,
    pagination
  }) {
    return this.stores.scores.getScoresBySpan({ traceId, spanId, pagination });
  }
  /**
   * RESOURCES
   */
  async getResourceById({ resourceId }) {
    return this.stores.memory.getResourceById({ resourceId });
  }
  async saveResource({ resource }) {
    return this.stores.memory.saveResource({ resource });
  }
  async updateResource({
    resourceId,
    workingMemory,
    metadata
  }) {
    return this.stores.memory.updateResource({
      resourceId,
      workingMemory,
      metadata
    });
  }
};

export { MongoDBStore };
