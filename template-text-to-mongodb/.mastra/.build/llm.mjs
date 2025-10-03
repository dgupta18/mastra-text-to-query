import { M as MastraBase } from './chunk-BMVFEBPE.mjs';
import { g as getDefaultExportFromCjs } from './_commonjsHelpers.mjs';
import { M as MastraError } from './error.mjs';

// A simple TTL cache with max capacity option, ms resolution,
// autopurge, and reasonably optimized performance
// Relies on the fact that integer Object keys are kept sorted,
// and managed very efficiently by V8.

/* istanbul ignore next */
const perf =
  typeof performance === 'object' &&
  performance &&
  typeof performance.now === 'function'
    ? performance
    : Date;

const now = () => perf.now();
const isPosInt = n => n && n === Math.floor(n) && n > 0 && isFinite(n);
const isPosIntOrInf = n => n === Infinity || isPosInt(n);

class TTLCache {
  constructor({
    max = Infinity,
    ttl,
    updateAgeOnGet = false,
    checkAgeOnGet = false,
    noUpdateTTL = false,
    dispose,
    noDisposeOnSet = false,
  } = {}) {
    // {[expirationTime]: [keys]}
    this.expirations = Object.create(null);
    // {key=>val}
    this.data = new Map();
    // {key=>expiration}
    this.expirationMap = new Map();
    if (ttl !== undefined && !isPosIntOrInf(ttl)) {
      throw new TypeError(
        'ttl must be positive integer or Infinity if set'
      )
    }
    if (!isPosIntOrInf(max)) {
      throw new TypeError('max must be positive integer or Infinity')
    }
    this.ttl = ttl;
    this.max = max;
    this.updateAgeOnGet = !!updateAgeOnGet;
    this.checkAgeOnGet = !!checkAgeOnGet;
    this.noUpdateTTL = !!noUpdateTTL;
    this.noDisposeOnSet = !!noDisposeOnSet;
    if (dispose !== undefined) {
      if (typeof dispose !== 'function') {
        throw new TypeError('dispose must be function if set')
      }
      this.dispose = dispose;
    }

    this.timer = undefined;
    this.timerExpiration = undefined;
  }

  setTimer(expiration, ttl) {
    if (this.timerExpiration < expiration) {
      return
    }

    if (this.timer) {
      clearTimeout(this.timer);
    }

    const t = setTimeout(() => {
      this.timer = undefined;
      this.timerExpiration = undefined;
      this.purgeStale();
      for (const exp in this.expirations) {
        this.setTimer(exp, exp - now());
        break
      }
    }, ttl);

    /* istanbul ignore else - affordance for non-node envs */
    if (t.unref) t.unref();

    this.timerExpiration = expiration;
    this.timer = t;
  }

  // hang onto the timer so we can clearTimeout if all items
  // are deleted.  Deno doesn't have Timer.unref(), so it
  // hangs otherwise.
  cancelTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timerExpiration = undefined;
      this.timer = undefined;
    }
  }

  /* istanbul ignore next */
  cancelTimers() {
    process.emitWarning(
      'TTLCache.cancelTimers has been renamed to ' +
        'TTLCache.cancelTimer (no "s"), and will be removed in the next ' +
        'major version update'
    );
    return this.cancelTimer()
  }

  clear() {
    const entries =
      this.dispose !== TTLCache.prototype.dispose ? [...this] : [];
    this.data.clear();
    this.expirationMap.clear();
    // no need for any purging now
    this.cancelTimer();
    this.expirations = Object.create(null);
    for (const [key, val] of entries) {
      this.dispose(val, key, 'delete');
    }
  }

  setTTL(key, ttl = this.ttl) {
    const current = this.expirationMap.get(key);
    if (current !== undefined) {
      // remove from the expirations list, so it isn't purged
      const exp = this.expirations[current];
      if (!exp || exp.length <= 1) {
        delete this.expirations[current];
      } else {
        this.expirations[current] = exp.filter(k => k !== key);
      }
    }

    if (ttl !== Infinity) {
      const expiration = Math.floor(now() + ttl);
      this.expirationMap.set(key, expiration);
      if (!this.expirations[expiration]) {
        this.expirations[expiration] = [];
        this.setTimer(expiration, ttl);
      }
      this.expirations[expiration].push(key);
    } else {
      this.expirationMap.set(key, Infinity);
    }
  }

  set(
    key,
    val,
    {
      ttl = this.ttl,
      noUpdateTTL = this.noUpdateTTL,
      noDisposeOnSet = this.noDisposeOnSet,
    } = {}
  ) {
    if (!isPosIntOrInf(ttl)) {
      throw new TypeError('ttl must be positive integer or Infinity')
    }
    if (this.expirationMap.has(key)) {
      if (!noUpdateTTL) {
        this.setTTL(key, ttl);
      }
      // has old value
      const oldValue = this.data.get(key);
      if (oldValue !== val) {
        this.data.set(key, val);
        if (!noDisposeOnSet) {
          this.dispose(oldValue, key, 'set');
        }
      }
    } else {
      this.setTTL(key, ttl);
      this.data.set(key, val);
    }

    while (this.size > this.max) {
      this.purgeToCapacity();
    }

    return this
  }

  has(key) {
    return this.data.has(key)
  }

  getRemainingTTL(key) {
    const expiration = this.expirationMap.get(key);
    return expiration === Infinity
      ? expiration
      : expiration !== undefined
      ? Math.max(0, Math.ceil(expiration - now()))
      : 0
  }

  get(
    key,
    {
      updateAgeOnGet = this.updateAgeOnGet,
      ttl = this.ttl,
      checkAgeOnGet = this.checkAgeOnGet,
    } = {}
  ) {
    const val = this.data.get(key);
    if (checkAgeOnGet && this.getRemainingTTL(key) === 0) {
      this.delete(key);
      return undefined
    }
    if (updateAgeOnGet) {
      this.setTTL(key, ttl);
    }
    return val
  }

  dispose(_, __) {}

  delete(key) {
    const current = this.expirationMap.get(key);
    if (current !== undefined) {
      const value = this.data.get(key);
      this.data.delete(key);
      this.expirationMap.delete(key);
      const exp = this.expirations[current];
      if (exp) {
        if (exp.length <= 1) {
          delete this.expirations[current];
        } else {
          this.expirations[current] = exp.filter(k => k !== key);
        }
      }
      this.dispose(value, key, 'delete');
      if (this.size === 0) {
        this.cancelTimer();
      }
      return true
    }
    return false
  }

  purgeToCapacity() {
    for (const exp in this.expirations) {
      const keys = this.expirations[exp];
      if (this.size - keys.length >= this.max) {
        delete this.expirations[exp];
        const entries = [];
        for (const key of keys) {
          entries.push([key, this.data.get(key)]);
          this.data.delete(key);
          this.expirationMap.delete(key);
        }
        for (const [key, val] of entries) {
          this.dispose(val, key, 'evict');
        }
      } else {
        const s = this.size - this.max;
        const entries = [];
        for (const key of keys.splice(0, s)) {
          entries.push([key, this.data.get(key)]);
          this.data.delete(key);
          this.expirationMap.delete(key);
        }
        for (const [key, val] of entries) {
          this.dispose(val, key, 'evict');
        }
        return
      }
    }
  }

  get size() {
    return this.data.size
  }

  purgeStale() {
    const n = Math.ceil(now());
    for (const exp in this.expirations) {
      if (exp === 'Infinity' || exp > n) {
        return
      }

      /* istanbul ignore next
       * mysterious need for a guard here?
       * https://github.com/isaacs/ttlcache/issues/26 */
      const keys = [...(this.expirations[exp] || [])];
      const entries = [];
      delete this.expirations[exp];
      for (const key of keys) {
        entries.push([key, this.data.get(key)]);
        this.data.delete(key);
        this.expirationMap.delete(key);
      }
      for (const [key, val] of entries) {
        this.dispose(val, key, 'stale');
      }
    }
    if (this.size === 0) {
      this.cancelTimer();
    }
  }

  *entries() {
    for (const exp in this.expirations) {
      for (const key of this.expirations[exp]) {
        yield [key, this.data.get(key)];
      }
    }
  }
  *keys() {
    for (const exp in this.expirations) {
      for (const key of this.expirations[exp]) {
        yield key;
      }
    }
  }
  *values() {
    for (const exp in this.expirations) {
      for (const key of this.expirations[exp]) {
        yield this.data.get(key);
      }
    }
  }
  [Symbol.iterator]() {
    return this.entries()
  }
}

var ttlcache = TTLCache;

var TTLCache$1 = /*@__PURE__*/getDefaultExportFromCjs(ttlcache);

// src/cache/base.ts
var MastraServerCache = class extends MastraBase {
  constructor({ name }) {
    super({
      component: "SERVER_CACHE",
      name
    });
  }
};
var InMemoryServerCache = class extends MastraServerCache {
  cache = new TTLCache$1({
    max: 1e3,
    ttl: 1e3 * 60 * 5
  });
  constructor() {
    super({ name: "InMemoryServerCache" });
  }
  async get(key) {
    return this.cache.get(key);
  }
  async set(key, value) {
    this.cache.set(key, value);
  }
  async listLength(key) {
    const list = this.cache.get(key);
    if (!Array.isArray(list)) {
      throw new Error(`${key} is not an array`);
    }
    return list.length;
  }
  async listPush(key, value) {
    const list = this.cache.get(key);
    if (Array.isArray(list)) {
      list.push(value);
    } else {
      this.cache.set(key, [value]);
    }
  }
  async listFromTo(key, from, to = -1) {
    const list = this.cache.get(key);
    if (Array.isArray(list)) {
      const endIndex = to === -1 ? void 0 : to + 1;
      return list.slice(from, endIndex);
    }
    return [];
  }
  async delete(key) {
    this.cache.delete(key);
  }
  async clear() {
    this.cache.clear();
  }
};

// src/llm/model/provider-registry.generated.ts
var PROVIDER_REGISTRY = {
  "moonshotai-cn": {
    url: "https://api.moonshot.cn/v1/chat/completions",
    apiKeyEnvVar: "MOONSHOT_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Moonshot AI (China)",
    models: ["kimi-k2-0711-preview", "kimi-k2-0905-preview", "kimi-k2-turbo-preview"],
    docUrl: "https://platform.moonshot.cn/docs/api/chat",
    gateway: "models.dev"
  },
  lucidquery: {
    url: "https://lucidquery.com/api/v1/chat/completions",
    apiKeyEnvVar: "LUCIDQUERY_API_KEY",
    apiKeyHeader: "Authorization",
    name: "LucidQuery AI",
    models: ["lucidnova-rf1-100b", "lucidquery-nexus-coder"],
    docUrl: "https://lucidquery.com/api/docs",
    gateway: "models.dev"
  },
  moonshotai: {
    url: "https://api.moonshot.ai/v1/chat/completions",
    apiKeyEnvVar: "MOONSHOT_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Moonshot AI",
    models: ["kimi-k2-0711-preview", "kimi-k2-0905-preview", "kimi-k2-turbo-preview"],
    docUrl: "https://platform.moonshot.ai/docs/api/chat",
    gateway: "models.dev"
  },
  "zai-coding-plan": {
    url: "https://api.z.ai/api/coding/paas/v4/chat/completions",
    apiKeyEnvVar: "ZHIPU_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Z.AI Coding Plan",
    models: ["glm-4.5", "glm-4.5-air", "glm-4.5-flash", "glm-4.5v", "glm-4.6"],
    docUrl: "https://docs.z.ai/devpack/overview",
    gateway: "models.dev"
  },
  alibaba: {
    url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    apiKeyEnvVar: "DASHSCOPE_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Alibaba",
    models: ["qwen3-coder-plus"],
    docUrl: "https://www.alibabacloud.com/help/en/model-studio/models",
    gateway: "models.dev"
  },
  xai: {
    url: "https://api.x.ai/v1/chat/completions",
    apiKeyEnvVar: "XAI_API_KEY",
    apiKeyHeader: "Authorization",
    name: "xAI",
    models: [
      "grok-2",
      "grok-2-1212",
      "grok-2-latest",
      "grok-2-vision",
      "grok-2-vision-1212",
      "grok-2-vision-latest",
      "grok-3",
      "grok-3-fast",
      "grok-3-fast-latest",
      "grok-3-latest",
      "grok-3-mini",
      "grok-3-mini-fast",
      "grok-3-mini-fast-latest",
      "grok-3-mini-latest",
      "grok-4",
      "grok-4-fast",
      "grok-4-fast-non-reasoning",
      "grok-beta",
      "grok-code-fast-1",
      "grok-vision-beta"
    ],
    docUrl: "https://docs.x.ai/docs/models",
    gateway: "models.dev"
  },
  nvidia: {
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    apiKeyEnvVar: "NVIDIA_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Nvidia",
    models: [
      "black-forest-labs/flux.1-dev",
      "deepseek-ai/deepseek-v3.1",
      "google/gemma-3-27b-it",
      "microsoft/phi-4-mini-instruct",
      "moonshotai/kimi-k2-instruct",
      "nvidia/cosmos-nemotron-34b",
      "nvidia/llama-3.1-nemotron-ultra-253b-v1",
      "nvidia/nemoretriever-ocr-v1",
      "nvidia/parakeet-tdt-0.6b-v2",
      "openai/gpt-oss-120b",
      "openai/whisper-large-v3",
      "qwen/qwen3-235b-a22b",
      "qwen/qwen3-coder-480b-a35b-instruct"
    ],
    docUrl: "https://docs.api.nvidia.com/nim/",
    gateway: "models.dev"
  },
  upstage: {
    url: "https://api.upstage.ai/chat/completions",
    apiKeyEnvVar: "UPSTAGE_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Upstage",
    models: ["solar-mini", "solar-pro2"],
    docUrl: "https://developers.upstage.ai/docs/apis/chat",
    gateway: "models.dev"
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKeyEnvVar: "GROQ_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Groq",
    models: [
      "deepseek-r1-distill-llama-70b",
      "gemma2-9b-it",
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
      "llama-guard-3-8b",
      "llama3-70b-8192",
      "llama3-8b-8192",
      "meta-llama/llama-4-maverick-17b-128e-instruct",
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "meta-llama/llama-guard-4-12b",
      "mistral-saba-24b",
      "moonshotai/kimi-k2-instruct",
      "moonshotai/kimi-k2-instruct-0905",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen-qwq-32b",
      "qwen/qwen3-32b"
    ],
    docUrl: "https://console.groq.com/docs/models",
    gateway: "models.dev"
  },
  "github-copilot": {
    url: "https://api.githubcopilot.com/chat/completions",
    apiKeyEnvVar: "GITHUB_TOKEN",
    apiKeyHeader: "Authorization",
    name: "GitHub Copilot",
    models: [
      "claude-3.5-sonnet",
      "claude-3.7-sonnet",
      "claude-3.7-sonnet-thought",
      "claude-opus-4",
      "claude-opus-41",
      "claude-sonnet-4",
      "claude-sonnet-4.5",
      "gemini-2.0-flash-001",
      "gemini-2.5-pro",
      "gpt-4.1",
      "gpt-4o",
      "gpt-5",
      "gpt-5-mini",
      "grok-code-fast-1",
      "o3",
      "o3-mini",
      "o4-mini"
    ],
    docUrl: "https://docs.github.com/en/copilot",
    gateway: "models.dev"
  },
  mistral: {
    url: "https://api.mistral.ai/v1/chat/completions",
    apiKeyEnvVar: "MISTRAL_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Mistral",
    models: [
      "codestral-latest",
      "devstral-medium-2507",
      "devstral-small-2505",
      "devstral-small-2507",
      "magistral-medium-latest",
      "magistral-small",
      "ministral-3b-latest",
      "ministral-8b-latest",
      "mistral-large-latest",
      "mistral-medium-2505",
      "mistral-medium-2508",
      "mistral-medium-latest",
      "mistral-nemo",
      "mistral-small-latest",
      "open-mistral-7b",
      "open-mixtral-8x22b",
      "open-mixtral-8x7b",
      "pixtral-12b",
      "pixtral-large-latest"
    ],
    docUrl: "https://docs.mistral.ai/getting-started/models/",
    gateway: "models.dev"
  },
  vercel: {
    url: "https://ai-gateway.vercel.sh/v1/chat/completions",
    apiKeyEnvVar: "AI_GATEWAY_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Vercel AI Gateway",
    models: [
      "amazon/nova-lite",
      "amazon/nova-micro",
      "amazon/nova-pro",
      "anthropic/claude-3-5-haiku",
      "anthropic/claude-3-haiku",
      "anthropic/claude-3-opus",
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3.7-sonnet",
      "anthropic/claude-4-1-opus",
      "anthropic/claude-4-opus",
      "anthropic/claude-4-sonnet",
      "anthropic/claude-4.5-sonnet",
      "cerebras/qwen3-coder",
      "deepseek/deepseek-r1",
      "deepseek/deepseek-r1-distill-llama-70b",
      "google/gemini-2.0-flash",
      "google/gemini-2.0-flash-lite",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "meta/llama-3.3-70b",
      "meta/llama-4-maverick",
      "meta/llama-4-scout",
      "mistral/codestral",
      "mistral/magistral-medium",
      "mistral/magistral-small",
      "mistral/ministral-3b",
      "mistral/ministral-8b",
      "mistral/mistral-large",
      "mistral/mistral-small",
      "mistral/mixtral-8x22b-instruct",
      "mistral/pixtral-12b",
      "mistral/pixtral-large",
      "moonshotai/kimi-k2",
      "morph/morph-v3-fast",
      "morph/morph-v3-large",
      "openai/gpt-4-turbo",
      "openai/gpt-4.1",
      "openai/gpt-4.1-mini",
      "openai/gpt-4.1-nano",
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "openai/o1",
      "openai/o3",
      "openai/o3-mini",
      "openai/o4-mini",
      "vercel/v0-1.0-md",
      "vercel/v0-1.5-md",
      "xai/grok-2",
      "xai/grok-2-vision",
      "xai/grok-3",
      "xai/grok-3-fast",
      "xai/grok-3-mini",
      "xai/grok-3-mini-fast",
      "xai/grok-4",
      "xai/grok-4-fast",
      "xai/grok-4-fast-non-reasoning",
      "xai/grok-code-fast-1"
    ],
    docUrl: "https://github.com/vercel/ai/tree/5eb85cc45a259553501f535b8ac79a77d0e79223/packages/gateway",
    gateway: "models.dev"
  },
  deepseek: {
    url: "https://api.deepseek.com/chat/completions",
    apiKeyEnvVar: "DEEPSEEK_API_KEY",
    apiKeyHeader: "Authorization",
    name: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    docUrl: "https://platform.deepseek.com/api-docs/pricing",
    gateway: "models.dev"
  },
  "alibaba-cn": {
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    apiKeyEnvVar: "DASHSCOPE_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Alibaba (China)",
    models: ["qwen3-coder-plus"],
    docUrl: "https://www.alibabacloud.com/help/en/model-studio/models",
    gateway: "models.dev"
  },
  venice: {
    url: "https://api.venice.ai/api/v1/chat/completions",
    apiKeyEnvVar: "VENICE_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Venice AI",
    models: [
      "deepseek-coder-v2-lite",
      "deepseek-r1-671b",
      "dolphin-2.9.2-qwen2-72b",
      "llama-3.1-405b",
      "llama-3.2-3b",
      "llama-3.3-70b",
      "mistral-31-24b",
      "qwen-2.5-coder-32b",
      "qwen-2.5-qwq-32b",
      "qwen-2.5-vl",
      "qwen3-235b",
      "qwen3-4b",
      "venice-uncensored"
    ],
    docUrl: "https://docs.venice.ai",
    gateway: "models.dev"
  },
  chutes: {
    url: "https://llm.chutes.ai/v1/chat/completions",
    apiKeyEnvVar: "CHUTES_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Chutes",
    models: [
      "Qwen/Qwen3-235B-A22B-Instruct-2507",
      "Qwen/Qwen3-235B-A22B-Thinking-2507",
      "Qwen/Qwen3-30B-A3B",
      "Qwen/Qwen3-30B-A3B-Instruct-2507",
      "Qwen/Qwen3-30B-A3B-Thinking-2507",
      "Qwen/Qwen3-Coder-30B-A3B-Instruct",
      "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",
      "Qwen/Qwen3-Next-80B-A3B-Instruct",
      "Qwen/Qwen3-Next-80B-A3B-Thinking",
      "chutesai/Devstral-Small-2505",
      "chutesai/Mistral-Small-3.2-24B-Instruct-2506",
      "deepseek-ai/DeepSeek-R1-0528",
      "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
      "deepseek-ai/DeepSeek-R1-Distill-Llama-70B",
      "deepseek-ai/DeepSeek-V3-0324",
      "deepseek-ai/DeepSeek-V3.1",
      "deepseek-ai/DeepSeek-V3.1-Terminus",
      "deepseek-ai/DeepSeek-V3.1-turbo",
      "deepseek-ai/DeepSeek-V3.1:THINKING",
      "meituan-longcat/LongCat-Flash-Chat-FP8",
      "moonshotai/Kimi-Dev-72B",
      "moonshotai/Kimi-K2-Instruct-0905",
      "moonshotai/Kimi-K2-Instruct-75k",
      "moonshotai/Kimi-VL-A3B-Thinking",
      "openai/gpt-oss-120b",
      "tngtech/DeepSeek-R1T-Chimera",
      "tngtech/DeepSeek-TNG-R1T2-Chimera",
      "zai-org/GLM-4.5-Air",
      "zai-org/GLM-4.5-FP8",
      "zai-org/GLM-4.5-turbo",
      "zai-org/GLM-4.6-FP8"
    ],
    docUrl: "https://llm.chutes.ai/v1/models",
    gateway: "models.dev"
  },
  cortecs: {
    url: "https://api.cortecs.ai/v1/chat/completions",
    apiKeyEnvVar: "CORTECS_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Cortecs",
    models: [
      "claude-sonnet-4",
      "deepseek-v3-0324",
      "gemini-2.5-pro",
      "gpt-4.1",
      "gpt-oss-120b",
      "kimi-k2-instruct",
      "llama-3.1-405b-instruct",
      "nova-pro-v1",
      "qwen3-32b",
      "qwen3-coder-480b-a35b-instruct"
    ],
    docUrl: "https://api.cortecs.ai/v1/models",
    gateway: "models.dev"
  },
  "github-models": {
    url: "https://models.github.ai/inference/chat/completions",
    apiKeyEnvVar: "GITHUB_TOKEN",
    apiKeyHeader: "Authorization",
    name: "GitHub Models",
    models: [
      "ai21-labs/ai21-jamba-1.5-large",
      "ai21-labs/ai21-jamba-1.5-mini",
      "cohere/cohere-command-a",
      "cohere/cohere-command-r",
      "cohere/cohere-command-r-08-2024",
      "cohere/cohere-command-r-plus",
      "cohere/cohere-command-r-plus-08-2024",
      "core42/jais-30b-chat",
      "deepseek/deepseek-r1",
      "deepseek/deepseek-r1-0528",
      "deepseek/deepseek-v3-0324",
      "meta/llama-3.2-11b-vision-instruct",
      "meta/llama-3.2-90b-vision-instruct",
      "meta/llama-3.3-70b-instruct",
      "meta/llama-4-maverick-17b-128e-instruct-fp8",
      "meta/llama-4-scout-17b-16e-instruct",
      "meta/meta-llama-3-70b-instruct",
      "meta/meta-llama-3-8b-instruct",
      "meta/meta-llama-3.1-405b-instruct",
      "meta/meta-llama-3.1-70b-instruct",
      "meta/meta-llama-3.1-8b-instruct",
      "microsoft/mai-ds-r1",
      "microsoft/phi-3-medium-128k-instruct",
      "microsoft/phi-3-medium-4k-instruct",
      "microsoft/phi-3-mini-128k-instruct",
      "microsoft/phi-3-mini-4k-instruct",
      "microsoft/phi-3-small-128k-instruct",
      "microsoft/phi-3-small-8k-instruct",
      "microsoft/phi-3.5-mini-instruct",
      "microsoft/phi-3.5-moe-instruct",
      "microsoft/phi-3.5-vision-instruct",
      "microsoft/phi-4",
      "microsoft/phi-4-mini-instruct",
      "microsoft/phi-4-mini-reasoning",
      "microsoft/phi-4-multimodal-instruct",
      "microsoft/phi-4-reasoning",
      "mistral-ai/codestral-2501",
      "mistral-ai/ministral-3b",
      "mistral-ai/mistral-large-2411",
      "mistral-ai/mistral-medium-2505",
      "mistral-ai/mistral-nemo",
      "mistral-ai/mistral-small-2503",
      "openai/gpt-4.1",
      "openai/gpt-4.1-mini",
      "openai/gpt-4.1-nano",
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "openai/o1",
      "openai/o1-mini",
      "openai/o1-preview",
      "openai/o3",
      "openai/o3-mini",
      "openai/o4-mini",
      "xai/grok-3",
      "xai/grok-3-mini"
    ],
    docUrl: "https://docs.github.com/en/github-models",
    gateway: "models.dev"
  },
  togetherai: {
    url: "https://api.together.xyz/v1/chat/completions",
    apiKeyEnvVar: "TOGETHER_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Together AI",
    models: [
      "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",
      "deepseek-ai/DeepSeek-R1",
      "deepseek-ai/DeepSeek-V3",
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "moonshotai/Kimi-K2-Instruct",
      "openai/gpt-oss-120b"
    ],
    docUrl: "https://docs.together.ai/docs/serverless-models",
    gateway: "models.dev"
  },
  baseten: {
    url: "https://inference.baseten.co/v1/chat/completions",
    apiKeyEnvVar: "BASETEN_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Baseten",
    models: ["Qwen3/Qwen3-Coder-480B-A35B-Instruct", "moonshotai/Kimi-K2-Instruct-0905"],
    docUrl: "https://docs.baseten.co/development/model-apis/overview",
    gateway: "models.dev"
  },
  huggingface: {
    url: "https://router.huggingface.co/v1/chat/completions",
    apiKeyEnvVar: "HF_TOKEN",
    apiKeyHeader: "Authorization",
    name: "Hugging Face",
    models: [
      "Qwen/Qwen3-235B-A22B-Thinking-2507",
      "Qwen/Qwen3-Coder-480B-A35B-Instruct",
      "Qwen/Qwen3-Next-80B-A3B-Instruct",
      "Qwen/Qwen3-Next-80B-A3B-Thinking",
      "deepseek-ai/DeepSeek-R1-0528",
      "deepseek-ai/Deepseek-V3-0324",
      "moonshotai/Kimi-K2-Instruct",
      "moonshotai/Kimi-K2-Instruct-0905",
      "zai-org/GLM-4.5",
      "zai-org/GLM-4.5-Air",
      "zai-org/GLM-4.6"
    ],
    docUrl: "https://huggingface.co/docs/inference-providers",
    gateway: "models.dev"
  },
  opencode: {
    url: "https://opencode.ai/zen/v1/chat/completions",
    apiKeyEnvVar: "OPENCODE_API_KEY",
    apiKeyHeader: "Authorization",
    name: "opencode zen",
    models: [
      "claude-3-5-haiku",
      "claude-opus-4-1",
      "claude-sonnet-4",
      "claude-sonnet-4-5",
      "code-supernova",
      "gpt-5",
      "grok-code",
      "kimi-k2",
      "qwen3-coder",
      "qwen3-max"
    ],
    docUrl: "https://opencode.ai/docs",
    gateway: "models.dev"
  },
  fastrouter: {
    url: "https://go.fastrouter.ai/api/v1/chat/completions",
    apiKeyEnvVar: "FASTROUTER_API_KEY",
    apiKeyHeader: "Authorization",
    name: "FastRouter",
    models: [
      "anthropic/claude-opus-4.1",
      "anthropic/claude-sonnet-4",
      "deepseek-ai/deepseek-r1-distill-llama-70b",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "moonshotai/kimi-k2",
      "openai/gpt-4.1",
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3-coder",
      "x-ai/grok-4"
    ],
    docUrl: "https://fastrouter.ai/models",
    gateway: "models.dev"
  },
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/chat/completions",
    apiKeyEnvVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Google",
    models: [
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash-lite-preview-06-17",
      "gemini-2.5-flash-lite-preview-09-2025",
      "gemini-2.5-flash-preview-04-17",
      "gemini-2.5-flash-preview-05-20",
      "gemini-2.5-flash-preview-09-2025",
      "gemini-2.5-pro",
      "gemini-2.5-pro-preview-05-06",
      "gemini-2.5-pro-preview-06-05",
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
      "gemini-live-2.5-flash-preview-native-audio"
    ],
    docUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    gateway: "models.dev"
  },
  inception: {
    url: "https://api.inceptionlabs.ai/v1/chat/completions",
    apiKeyEnvVar: "INCEPTION_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Inception",
    models: ["mercury", "mercury-coder"],
    docUrl: "https://platform.inceptionlabs.ai/docs",
    gateway: "models.dev"
  },
  wandb: {
    url: "https://api.inference.wandb.ai/v1/chat/completions",
    apiKeyEnvVar: "WANDB_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Weights & Biases",
    models: [
      "Qwen/Qwen3-235B-A22B-Instruct-2507",
      "Qwen/Qwen3-235B-A22B-Thinking-2507",
      "Qwen/Qwen3-Coder-480B-A35B-Instruct",
      "deepseek-ai/DeepSeek-R1-0528",
      "deepseek-ai/DeepSeek-V3-0324",
      "meta-llama/Llama-3.1-8B-Instruct",
      "meta-llama/Llama-3.3-70B-Instruct",
      "meta-llama/Llama-4-Scout-17B-16E-Instruct",
      "microsoft/Phi-4-mini-instruct",
      "moonshotai/Kimi-K2-Instruct"
    ],
    docUrl: "https://weave-docs.wandb.ai/guides/integrations/inference/",
    gateway: "models.dev"
  },
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    apiKeyEnvVar: "OPENAI_API_KEY",
    apiKeyHeader: "Authorization",
    name: "OpenAI",
    models: [
      "gpt-3.5-turbo",
      "gpt-4",
      "gpt-4-turbo",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "gpt-4o",
      "gpt-4o-2024-05-13",
      "gpt-4o-2024-08-06",
      "gpt-4o-2024-11-20",
      "gpt-4o-mini",
      "gpt-5",
      "gpt-5-chat-latest",
      "gpt-5-mini",
      "gpt-5-nano",
      "o1",
      "o1-mini",
      "o1-preview",
      "o1-pro",
      "o3",
      "o3-deep-research",
      "o3-mini",
      "o3-pro",
      "o4-mini",
      "o4-mini-deep-research"
    ],
    docUrl: "https://platform.openai.com/docs/models",
    gateway: "models.dev"
  },
  "zhipuai-coding-plan": {
    url: "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
    apiKeyEnvVar: "ZHIPU_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Zhipu AI Coding Plan",
    models: ["glm-4.5", "glm-4.5-air", "glm-4.5-flash", "glm-4.5v", "glm-4.6"],
    docUrl: "https://docs.bigmodel.cn/cn/coding-plan/overview",
    gateway: "models.dev"
  },
  perplexity: {
    url: "https://api.perplexity.ai/chat/completions",
    apiKeyEnvVar: "PERPLEXITY_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Perplexity",
    models: ["sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro"],
    docUrl: "https://docs.perplexity.ai",
    gateway: "models.dev"
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    apiKeyHeader: "Authorization",
    name: "OpenRouter",
    models: [
      "anthropic/claude-3.5-haiku",
      "anthropic/claude-3.7-sonnet",
      "anthropic/claude-opus-4",
      "anthropic/claude-opus-4.1",
      "anthropic/claude-sonnet-4",
      "anthropic/claude-sonnet-4.5",
      "cognitivecomputations/dolphin3.0-mistral-24b",
      "cognitivecomputations/dolphin3.0-r1-mistral-24b",
      "deepseek/deepseek-chat-v3-0324",
      "deepseek/deepseek-chat-v3.1",
      "deepseek/deepseek-r1-0528-qwen3-8b:free",
      "deepseek/deepseek-r1-0528:free",
      "deepseek/deepseek-r1-distill-llama-70b",
      "deepseek/deepseek-r1-distill-qwen-14b",
      "deepseek/deepseek-r1:free",
      "deepseek/deepseek-v3-base:free",
      "deepseek/deepseek-v3.1-terminus",
      "featherless/qwerky-72b",
      "google/gemini-2.0-flash-001",
      "google/gemini-2.0-flash-exp:free",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-pro-preview-05-06",
      "google/gemini-2.5-pro-preview-06-05",
      "google/gemma-2-9b-it:free",
      "google/gemma-3-12b-it",
      "google/gemma-3-27b-it",
      "google/gemma-3n-e4b-it",
      "google/gemma-3n-e4b-it:free",
      "meta-llama/llama-3.2-11b-vision-instruct",
      "meta-llama/llama-3.3-70b-instruct:free",
      "meta-llama/llama-4-scout:free",
      "microsoft/mai-ds-r1:free",
      "mistralai/codestral-2508",
      "mistralai/devstral-medium-2507",
      "mistralai/devstral-small-2505",
      "mistralai/devstral-small-2505:free",
      "mistralai/devstral-small-2507",
      "mistralai/mistral-7b-instruct:free",
      "mistralai/mistral-medium-3",
      "mistralai/mistral-medium-3.1",
      "mistralai/mistral-nemo:free",
      "mistralai/mistral-small-3.1-24b-instruct",
      "mistralai/mistral-small-3.2-24b-instruct",
      "mistralai/mistral-small-3.2-24b-instruct:free",
      "moonshotai/kimi-dev-72b:free",
      "moonshotai/kimi-k2",
      "moonshotai/kimi-k2-0905",
      "moonshotai/kimi-k2:free",
      "nousresearch/deephermes-3-llama-3-8b-preview",
      "nousresearch/hermes-4-405b",
      "nousresearch/hermes-4-70b",
      "openai/gpt-4.1",
      "openai/gpt-4.1-mini",
      "openai/gpt-4o-mini",
      "openai/gpt-5",
      "openai/gpt-5-chat",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "openai/o4-mini",
      "openrouter/cypher-alpha:free",
      "openrouter/horizon-alpha",
      "openrouter/horizon-beta",
      "openrouter/sonoma-dusk-alpha",
      "openrouter/sonoma-sky-alpha",
      "qwen/qwen-2.5-coder-32b-instruct",
      "qwen/qwen2.5-vl-32b-instruct:free",
      "qwen/qwen2.5-vl-72b-instruct",
      "qwen/qwen2.5-vl-72b-instruct:free",
      "qwen/qwen3-14b:free",
      "qwen/qwen3-235b-a22b-07-25",
      "qwen/qwen3-235b-a22b-07-25:free",
      "qwen/qwen3-235b-a22b-thinking-2507",
      "qwen/qwen3-235b-a22b:free",
      "qwen/qwen3-30b-a3b-instruct-2507",
      "qwen/qwen3-30b-a3b:free",
      "qwen/qwen3-32b:free",
      "qwen/qwen3-8b:free",
      "qwen/qwen3-coder",
      "qwen/qwen3-coder:free",
      "qwen/qwen3-max",
      "qwen/qwen3-next-80b-a3b-instruct",
      "qwen/qwq-32b:free",
      "rekaai/reka-flash-3",
      "sarvamai/sarvam-m:free",
      "thudm/glm-z1-32b:free",
      "tngtech/deepseek-r1t2-chimera:free",
      "x-ai/grok-3",
      "x-ai/grok-3-beta",
      "x-ai/grok-3-mini",
      "x-ai/grok-3-mini-beta",
      "x-ai/grok-4",
      "x-ai/grok-4-fast",
      "x-ai/grok-4-fast:free",
      "x-ai/grok-code-fast-1",
      "z-ai/glm-4.5",
      "z-ai/glm-4.5-air",
      "z-ai/glm-4.5-air:free",
      "z-ai/glm-4.5v",
      "z-ai/glm-4.6"
    ],
    docUrl: "https://openrouter.ai/models",
    gateway: "models.dev"
  },
  synthetic: {
    url: "https://api.synthetic.new/v1/chat/completions",
    apiKeyEnvVar: "SYNTHETIC_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Synthetic",
    models: [
      "hf:Qwen/Qwen2.5-Coder-32B-Instruct",
      "hf:Qwen/Qwen3-235B-A22B-Instruct-2507",
      "hf:Qwen/Qwen3-235B-A22B-Thinking-2507",
      "hf:Qwen/Qwen3-Coder-480B-A35B-Instruct",
      "hf:deepseek-ai/DeepSeek-R1",
      "hf:deepseek-ai/DeepSeek-R1-0528",
      "hf:deepseek-ai/DeepSeek-V3",
      "hf:deepseek-ai/DeepSeek-V3-0324",
      "hf:deepseek-ai/DeepSeek-V3.1",
      "hf:deepseek-ai/DeepSeek-V3.1-Terminus",
      "hf:meta-llama/Llama-3.1-405B-Instruct",
      "hf:meta-llama/Llama-3.1-70B-Instruct",
      "hf:meta-llama/Llama-3.1-8B-Instruct",
      "hf:meta-llama/Llama-3.3-70B-Instruct",
      "hf:meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
      "hf:meta-llama/Llama-4-Scout-17B-16E-Instruct",
      "hf:moonshotai/Kimi-K2-Instruct",
      "hf:moonshotai/Kimi-K2-Instruct-0905",
      "hf:openai/gpt-oss-120b",
      "hf:zai-org/GLM-4.5"
    ],
    docUrl: "https://synthetic.new/pricing",
    gateway: "models.dev"
  },
  deepinfra: {
    url: "https://api.deepinfra.com/v1/openai/chat/completions",
    apiKeyEnvVar: "DEEPINFRA_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Deep Infra",
    models: [
      "Qwen/Qwen3-Coder-480B-A35B-Instruct",
      "Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo",
      "moonshotai/Kimi-K2-Instruct",
      "zai-org/GLM-4.5"
    ],
    docUrl: "https://deepinfra.com/models",
    gateway: "models.dev"
  },
  zhipuai: {
    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    apiKeyEnvVar: "ZHIPU_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Zhipu AI",
    models: ["glm-4.5", "glm-4.5-air", "glm-4.5-flash", "glm-4.5v", "glm-4.6"],
    docUrl: "https://docs.z.ai/guides/overview/pricing",
    gateway: "models.dev"
  },
  submodel: {
    url: "https://llm.submodel.ai/v1/chat/completions",
    apiKeyEnvVar: "SUBMODEL_INSTAGEN_ACCESS_KEY",
    apiKeyHeader: "Authorization",
    name: "submodel",
    models: [
      "Qwen/Qwen3-235B-A22B-Instruct-2507",
      "Qwen/Qwen3-235B-A22B-Thinking-2507",
      "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",
      "deepseek-ai/DeepSeek-R1-0528",
      "deepseek-ai/DeepSeek-V3-0324",
      "deepseek-ai/DeepSeek-V3.1",
      "openai/gpt-oss-120b",
      "zai-org/GLM-4.5-Air",
      "zai-org/GLM-4.5-FP8"
    ],
    docUrl: "https://submodel.gitbook.io",
    gateway: "models.dev"
  },
  zai: {
    url: "https://api.z.ai/api/paas/v4/chat/completions",
    apiKeyEnvVar: "ZHIPU_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Z.AI",
    models: ["glm-4.5", "glm-4.5-air", "glm-4.5-flash", "glm-4.5v", "glm-4.6"],
    docUrl: "https://docs.z.ai/guides/overview/pricing",
    gateway: "models.dev"
  },
  inference: {
    url: "https://inference.net/v1/chat/completions",
    apiKeyEnvVar: "INFERENCE_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Inference",
    models: [
      "google/gemma-3",
      "meta/llama-3.1-8b-instruct",
      "meta/llama-3.2-11b-vision-instruct",
      "meta/llama-3.2-1b-instruct",
      "meta/llama-3.2-3b-instruct",
      "mistral/mistral-nemo-12b-instruct",
      "osmosis/osmosis-structure-0.6b",
      "qwen/qwen-2.5-7b-vision-instruct",
      "qwen/qwen3-embedding-4b"
    ],
    docUrl: "https://inference.net/models",
    gateway: "models.dev"
  },
  requesty: {
    url: "https://router.requesty.ai/v1/chat/completions",
    apiKeyEnvVar: "REQUESTY_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Requesty",
    models: [
      "anthropic/claude-3-7-sonnet",
      "anthropic/claude-4-sonnet-20250522",
      "anthropic/claude-opus-4",
      "anthropic/claude-opus-4-1-20250805",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "openai/gpt-4.1",
      "openai/gpt-4.1-mini",
      "openai/gpt-4o-mini",
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
      "openai/o4-mini"
    ],
    docUrl: "https://requesty.ai/solution/llm-routing/models",
    gateway: "models.dev"
  },
  morph: {
    url: "https://api.morphllm.com/v1/chat/completions",
    apiKeyEnvVar: "MORPH_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Morph",
    models: ["auto", "morph-v3-fast", "morph-v3-large"],
    docUrl: "https://docs.morphllm.com/api-reference/introduction",
    gateway: "models.dev"
  },
  lmstudio: {
    url: "http://127.0.0.1:1234/v1/chat/completions",
    apiKeyEnvVar: "LMSTUDIO_API_KEY",
    apiKeyHeader: "Authorization",
    name: "LMStudio",
    models: ["openai/gpt-oss-20b", "qwen/qwen3-30b-a3b-2507", "qwen/qwen3-coder-30b"],
    docUrl: "https://lmstudio.ai/models",
    gateway: "models.dev"
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/chat/completions",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    apiKeyHeader: "x-api-key",
    name: "Anthropic",
    models: [
      "claude-3-5-haiku-20241022",
      "claude-3-5-sonnet-20240620",
      "claude-3-5-sonnet-20241022",
      "claude-3-7-sonnet-20250219",
      "claude-3-haiku-20240307",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-opus-4-1-20250805",
      "claude-opus-4-20250514",
      "claude-sonnet-4-20250514",
      "claude-sonnet-4-5-20250929"
    ],
    docUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
    gateway: "models.dev"
  },
  "fireworks-ai": {
    url: "https://api.fireworks.ai/inference/v1/chat/completions",
    apiKeyEnvVar: "FIREWORKS_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Fireworks AI",
    models: [
      "accounts/fireworks/models/deepseek-r1-0528",
      "accounts/fireworks/models/deepseek-v3-0324",
      "accounts/fireworks/models/deepseek-v3p1",
      "accounts/fireworks/models/glm-4p5",
      "accounts/fireworks/models/glm-4p5-air",
      "accounts/fireworks/models/gpt-oss-120b",
      "accounts/fireworks/models/gpt-oss-20b",
      "accounts/fireworks/models/kimi-k2-instruct",
      "accounts/fireworks/models/qwen3-235b-a22b",
      "accounts/fireworks/models/qwen3-coder-480b-a35b-instruct"
    ],
    docUrl: "https://fireworks.ai/docs/",
    gateway: "models.dev"
  },
  modelscope: {
    url: "https://api-inference.modelscope.cn/v1/chat/completions",
    apiKeyEnvVar: "MODELSCOPE_API_KEY",
    apiKeyHeader: "Authorization",
    name: "ModelScope",
    models: [
      "Qwen/Qwen3-235B-A22B-Instruct-2507",
      "Qwen/Qwen3-235B-A22B-Thinking-2507",
      "Qwen/Qwen3-30B-A3B-Instruct-2507",
      "Qwen/Qwen3-30B-A3B-Thinking-2507",
      "Qwen/Qwen3-Coder-30B-A3B-Instruct",
      "Qwen/Qwen3-Coder-480B-A35B-Instruct",
      "ZhipuAI/GLM-4.5"
    ],
    docUrl: "https://modelscope.cn/docs/model-service/API-Inference/intro",
    gateway: "models.dev"
  },
  llama: {
    url: "https://api.llama.com/compat/v1/chat/completions",
    apiKeyEnvVar: "LLAMA_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Llama",
    models: [
      "cerebras-llama-4-maverick-17b-128e-instruct",
      "cerebras-llama-4-scout-17b-16e-instruct",
      "groq-llama-4-maverick-17b-128e-instruct",
      "llama-3.3-70b-instruct",
      "llama-3.3-8b-instruct",
      "llama-4-maverick-17b-128e-instruct-fp8",
      "llama-4-scout-17b-16e-instruct-fp8"
    ],
    docUrl: "https://llama.developer.meta.com/docs/models",
    gateway: "models.dev"
  },
  cerebras: {
    url: "https://api.cerebras.ai/v1/chat/completions",
    apiKeyEnvVar: "CEREBRAS_API_KEY",
    apiKeyHeader: "Authorization",
    name: "Cerebras",
    models: ["gpt-oss-120b", "qwen-3-235b-a22b-instruct-2507", "qwen-3-coder-480b"],
    docUrl: "https://inference-docs.cerebras.ai/models/overview",
    gateway: "models.dev"
  },
  netlify: {
    apiKeyEnvVar: ["NETLIFY_TOKEN", "NETLIFY_SITE_ID"],
    apiKeyHeader: "Authorization",
    name: "Netlify",
    gateway: "netlify",
    models: [
      "anthropic/claude-3-5-haiku-20241022",
      "anthropic/claude-opus-4-20250514",
      "anthropic/claude-sonnet-4-20250514",
      "anthropic/claude-3-7-sonnet-20250219",
      "anthropic/claude-3-5-haiku-latest",
      "anthropic/claude-3-haiku-20240307",
      "anthropic/claude-opus-4-1-20250805",
      "anthropic/claude-sonnet-4-5-20250929",
      "anthropic/claude-3-7-sonnet-latest",
      "gemini/gemini-2.5-pro",
      "gemini/gemini-2.5-flash",
      "gemini/gemini-flash-lite-latest",
      "gemini/gemini-2.0-flash-lite",
      "gemini/gemini-2.5-flash-image-preview",
      "gemini/gemini-flash-latest",
      "gemini/gemini-2.5-flash-preview-09-2025",
      "gemini/gemini-2.5-flash-lite-preview-09-2025",
      "gemini/gemini-2.5-flash-lite",
      "gemini/gemini-2.0-flash",
      "openai/o4-mini",
      "openai/o3",
      "openai/o3-mini",
      "openai/codex-mini-latest",
      "openai/gpt-5-codex",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
      "openai/gpt-4.1",
      "openai/gpt-4.1-mini",
      "openai/gpt-4.1-nano",
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "openai/gpt-5"
    ],
    docUrl: "https://docs.netlify.com/build/ai-gateway/overview/"
  }
};
function getProviderConfig(providerId) {
  return PROVIDER_REGISTRY[providerId];
}
function parseModelString(modelString) {
  const firstSlashIndex = modelString.indexOf("/");
  if (firstSlashIndex !== -1) {
    const provider = modelString.substring(0, firstSlashIndex);
    const modelId = modelString.substring(firstSlashIndex + 1);
    if (provider && modelId) {
      return {
        provider,
        modelId
      };
    }
  }
  return {
    provider: null,
    modelId: modelString
  };
}

// src/llm/model/gateways/base.ts
var MastraModelGateway = class {
};

// src/llm/model/gateways/models-dev.ts
var OPENAI_COMPATIBLE_OVERRIDES = {
  openai: {
    url: "https://api.openai.com/v1/chat/completions"
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/chat/completions",
    apiKeyHeader: "x-api-key"
  },
  cerebras: {
    url: "https://api.cerebras.ai/v1/chat/completions"
  },
  xai: {
    url: "https://api.x.ai/v1/chat/completions"
  },
  mistral: {
    url: "https://api.mistral.ai/v1/chat/completions"
  },
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/chat/completions"
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions"
  },
  togetherai: {
    url: "https://api.together.xyz/v1/chat/completions"
  },
  deepinfra: {
    url: "https://api.deepinfra.com/v1/openai/chat/completions"
  },
  perplexity: {
    url: "https://api.perplexity.ai/chat/completions"
  },
  vercel: {
    url: "https://ai-gateway.vercel.sh/v1/chat/completions",
    apiKeyEnvVar: "AI_GATEWAY_API_KEY"
  }
};
var ModelsDevGateway = class extends MastraModelGateway {
  name = "models.dev";
  prefix = void 0;
  // No prefix for registry gateway
  providerConfigs = {};
  constructor(providerConfigs) {
    super();
    if (providerConfigs) this.providerConfigs = providerConfigs;
  }
  async fetchProviders() {
    console.info("Fetching providers from models.dev API...");
    const response = await fetch("https://models.dev/api.json");
    if (!response.ok) {
      throw new Error(`Failed to fetch from models.dev: ${response.statusText}`);
    }
    const data = await response.json();
    const providerConfigs = {};
    for (const [providerId, providerInfo] of Object.entries(data)) {
      if (!providerInfo || typeof providerInfo !== "object" || !providerInfo.models) continue;
      const normalizedId = providerId;
      const isOpenAICompatible = providerInfo.npm === "@ai-sdk/openai-compatible" || providerInfo.npm === "@ai-sdk/gateway" || // Vercel AI Gateway is OpenAI-compatible
      normalizedId in OPENAI_COMPATIBLE_OVERRIDES;
      const hasApiAndEnv = providerInfo.api && providerInfo.env && providerInfo.env.length > 0;
      if (isOpenAICompatible || hasApiAndEnv) {
        const modelIds = Object.keys(providerInfo.models).sort();
        let url = providerInfo.api || OPENAI_COMPATIBLE_OVERRIDES[normalizedId]?.url;
        if (url && !url.includes("/chat/completions") && !url.includes("/messages")) {
          url = url.replace(/\/$/, "") + "/chat/completions";
        }
        if (!url) {
          console.info(`Skipping ${normalizedId}: No API URL available`);
          continue;
        }
        const apiKeyEnvVar = providerInfo.env?.[0] || `${normalizedId.toUpperCase().replace(/-/g, "_")}_API_KEY`;
        const apiKeyHeader = OPENAI_COMPATIBLE_OVERRIDES[normalizedId]?.apiKeyHeader || "Authorization";
        providerConfigs[normalizedId] = {
          url,
          apiKeyEnvVar,
          apiKeyHeader,
          name: providerInfo.name || providerId.charAt(0).toUpperCase() + providerId.slice(1),
          models: modelIds.filter((id) => !id.includes(`codex`)),
          // codex requires responses api
          docUrl: providerInfo.doc,
          // Include documentation URL if available
          gateway: `models.dev`
        };
      } else {
        console.info(`Skipped provider ${providerInfo.name}`);
      }
    }
    this.providerConfigs = providerConfigs;
    console.info(`Found ${Object.keys(providerConfigs).length} OpenAI-compatible providers`);
    console.info("Providers:", Object.keys(providerConfigs).sort());
    return providerConfigs;
  }
  buildUrl(modelId, envVars) {
    const [provider, ...modelParts] = modelId.split("/");
    if (!provider || !modelParts.length) {
      return false;
    }
    const config = this.providerConfigs[provider];
    if (!config?.url) {
      return false;
    }
    const baseUrlEnvVar = `${provider.toUpperCase().replace(/-/g, "_")}_BASE_URL`;
    const customBaseUrl = envVars[baseUrlEnvVar];
    return customBaseUrl || config.url;
  }
  buildHeaders(modelId, envVars) {
    const [provider] = modelId.split("/");
    if (!provider) {
      return {};
    }
    const config = this.providerConfigs[provider];
    if (!config) {
      return {};
    }
    const apiKey = typeof config.apiKeyEnvVar === `string` ? envVars[config.apiKeyEnvVar] : void 0;
    if (!apiKey) {
      return {};
    }
    const headers = {};
    if (config.apiKeyHeader === "Authorization" || !config.apiKeyHeader) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    } else {
      headers[config.apiKeyHeader] = apiKey;
    }
    if (provider === "anthropic") {
      headers["anthropic-version"] = "2023-06-01";
    }
    return headers;
  }
};

// src/llm/model/gateways/netlify.ts
var NetlifyGateway = class extends MastraModelGateway {
  name = "netlify";
  prefix = "netlify";
  // All providers will be prefixed with "netlify/"
  tokenCache = new InMemoryServerCache();
  async fetchProviders() {
    console.info("Fetching providers from Netlify AI Gateway...");
    const response = await fetch("https://api.netlify.com/api/v1/ai-gateway/providers");
    if (!response.ok) {
      throw new Error(`Failed to fetch from Netlify: ${response.statusText}`);
    }
    const data = await response.json();
    const netlify = {
      apiKeyEnvVar: ["NETLIFY_TOKEN", "NETLIFY_SITE_ID"],
      apiKeyHeader: "Authorization",
      // Netlify uses standard Bearer auth
      name: `Netlify`,
      gateway: `netlify`,
      models: [],
      docUrl: "https://docs.netlify.com/build/ai-gateway/overview/"
    };
    for (const [providerId, provider] of Object.entries(data.providers)) {
      for (const model of provider.models) {
        netlify.models.push(`${providerId}/${model}`);
      }
    }
    console.info(`Found ${Object.keys(data.providers).length} models via Netlify Gateway`);
    return { netlify };
  }
  async buildUrl(modelId, envVars) {
    if (!modelId.startsWith(`${this.prefix}/`)) {
      return false;
    }
    const parts = modelId.split("/");
    if (parts.length < 3) {
      return false;
    }
    const provider = parts[1];
    if (!provider) {
      return false;
    }
    const siteId = envVars["NETLIFY_SITE_ID"];
    const netlifyToken = envVars["NETLIFY_TOKEN"];
    if (!netlifyToken) {
      throw new MastraError({
        id: "NETLIFY_GATEWAY_NO_TOKEN",
        domain: "LLM",
        category: "UNKNOWN",
        text: `Missing NETLIFY_TOKEN environment variable required for model: ${modelId}`
      });
    }
    if (!siteId) {
      throw new MastraError({
        id: "NETLIFY_GATEWAY_NO_SITE_ID",
        domain: "LLM",
        category: "UNKNOWN",
        text: `Missing NETLIFY_SITE_ID environment variable required for model: ${modelId}`
      });
    }
    try {
      const tokenData = await this.getOrFetchToken(siteId, netlifyToken);
      return `${tokenData.url}chat/completions`;
    } catch (error) {
      throw new MastraError({
        id: "NETLIFY_GATEWAY_TOKEN_ERROR",
        domain: "LLM",
        category: "UNKNOWN",
        text: `Failed to get Netlify AI Gateway token for model ${modelId}: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
  /**
   * Get cached token or fetch a new site-specific AI Gateway token from Netlify
   */
  async getOrFetchToken(siteId, netlifyToken) {
    const cacheKey = `netlify-token:${siteId}:${netlifyToken}`;
    const cached = await this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() / 1e3 + 60) {
      return { token: cached.token, url: cached.url };
    }
    const response = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/ai-gateway/token`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${netlifyToken}`
      }
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get Netlify AI Gateway token: ${response.status} ${error}`);
    }
    const tokenResponse = await response.json();
    await this.tokenCache.set(cacheKey, {
      token: tokenResponse.token,
      url: tokenResponse.url,
      expiresAt: tokenResponse.expires_at
    });
    return { token: tokenResponse.token, url: tokenResponse.url };
  }
  async buildHeaders(modelId, envVars) {
    const siteId = envVars["NETLIFY_SITE_ID"];
    const netlifyToken = envVars["NETLIFY_TOKEN"];
    if (!netlifyToken) {
      throw new MastraError({
        id: "NETLIFY_GATEWAY_NO_TOKEN",
        domain: "LLM",
        category: "UNKNOWN",
        text: `Missing NETLIFY_TOKEN environment variable required for model: ${modelId}`
      });
    }
    if (!siteId) {
      throw new MastraError({
        id: "NETLIFY_GATEWAY_NO_SITE_ID",
        domain: "LLM",
        category: "UNKNOWN",
        text: `Missing NETLIFY_SITE_ID environment variable required for model: ${modelId}`
      });
    }
    try {
      const tokenData = await this.getOrFetchToken(siteId, netlifyToken);
      return {
        Authorization: `Bearer ${tokenData.token}`
      };
    } catch (error) {
      throw new MastraError({
        id: "NETLIFY_GATEWAY_TOKEN_ERROR",
        domain: "LLM",
        category: "UNKNOWN",
        text: `Failed to get Netlify AI Gateway token for model ${modelId}: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
};

// src/llm/model/gateway-resolver.ts
function getStaticProvidersByGateway(name) {
  return Object.fromEntries(Object.entries(PROVIDER_REGISTRY).filter(([_provider, config]) => config.gateway === name));
}
var gateways = [new NetlifyGateway(), new ModelsDevGateway(getStaticProvidersByGateway(`models.dev`))];
function findGatewayForModel(modelId) {
  const prefixedGateway = gateways.find((g) => g.prefix && modelId.startsWith(`${g.prefix}/`));
  if (prefixedGateway) {
    return prefixedGateway;
  }
  const unprefixedGateways = gateways.filter((g) => !g.prefix);
  for (const gateway of unprefixedGateways) {
    return gateway;
  }
  return null;
}
async function resolveModelConfig(modelId, envVars = process.env) {
  const gateway = findGatewayForModel(modelId);
  if (!gateway) {
    return { url: false, headers: {}, resolvedModelId: modelId };
  }
  const url = await gateway.buildUrl(modelId, envVars);
  if (url === false) {
    return { url: false, headers: {}, resolvedModelId: modelId };
  }
  const headers = gateway.buildHeaders ? await gateway.buildHeaders(modelId, envVars) : {};
  let resolvedModelId = modelId;
  const prefix = gateway.prefix ? `${gateway.prefix}/` : null;
  if (prefix && resolvedModelId.startsWith(prefix)) {
    resolvedModelId = resolvedModelId.substring(prefix.length);
  }
  const firstSlashIndex = resolvedModelId.indexOf("/");
  if (firstSlashIndex !== -1) {
    resolvedModelId = resolvedModelId.substring(firstSlashIndex + 1);
  }
  return { url, headers, resolvedModelId };
}

// src/llm/model/openai-compatible.ts
function resolveApiKey({ provider, apiKey }) {
  if (apiKey) return apiKey;
  if (provider) {
    const config = getProviderConfig(provider);
    if (typeof config?.apiKeyEnvVar === `string`) {
      return process.env[config.apiKeyEnvVar];
    }
    if (Array.isArray(config?.apiKeyEnvVar)) {
      for (const key of config.apiKeyEnvVar) {
        if (process.env[key]) return process.env[key];
      }
    }
  }
  return void 0;
}
var OpenAICompatibleModel = class {
  specificationVersion = "v2";
  defaultObjectGenerationMode = "json";
  supportsStructuredOutputs = true;
  supportsImageUrls = true;
  supportedUrls = {};
  modelId;
  provider;
  config;
  fullModelId;
  // Store the full model ID for gateway resolution
  constructor(config) {
    let parsedConfig;
    if (typeof config === "string") {
      let isUrl = false;
      try {
        new URL(config);
        isUrl = true;
      } catch {
      }
      if (isUrl) {
        parsedConfig = {
          id: "unknown",
          url: config
        };
        this.provider = "openai-compatible";
        this.fullModelId = "unknown";
        this.config = { id: "unknown", url: config };
      } else {
        this.fullModelId = config;
        const firstSlashIndex = config.indexOf("/");
        if (firstSlashIndex !== -1) {
          const provider = config.substring(0, firstSlashIndex);
          const modelId = config.substring(firstSlashIndex + 1);
          parsedConfig = {
            id: modelId,
            apiKey: resolveApiKey({ provider })
          };
          this.provider = provider;
        } else {
          throw new Error(`Invalid model string: "${config}". Use "provider/model" format or a direct URL.`);
        }
      }
    } else {
      parsedConfig = config;
      this.fullModelId = config.id;
      const parsed = parseModelString(config.id);
      this.provider = parsed.provider || "openai-compatible";
      if (parsed.provider && parsed.modelId !== config.id) {
        parsedConfig.id = parsed.modelId;
      }
      if (!parsedConfig.apiKey) {
        parsedConfig.apiKey = resolveApiKey({ provider: parsed.provider || void 0 });
      }
    }
    this.modelId = parsedConfig.id;
    this.config = parsedConfig;
  }
  convertMessagesToOpenAI(messages) {
    return messages.map((msg) => {
      if (msg.role === "system") {
        return {
          role: "system",
          content: msg.content
        };
      }
      if (msg.role === "user") {
        const contentParts = msg.content.map((part) => {
          if (part.type === "text") {
            return { type: "text", text: part.text };
          }
          if (part.type === "file") {
            return {
              type: "image_url",
              image_url: { url: part.data }
            };
          }
          return null;
        }).filter(Boolean);
        if (contentParts.every((p) => p?.type === "text")) {
          return {
            role: "user",
            content: contentParts.map((p) => p?.text || "").join("")
          };
        }
        return {
          role: "user",
          content: contentParts
        };
      }
      if (msg.role === "assistant") {
        const textContent = msg.content.filter((part) => part.type === "text").map((part) => part.text).join("");
        const toolCalls = msg.content.filter((part) => part.type === "tool-call").map((part) => ({
          id: part.toolCallId,
          type: "function",
          function: {
            name: part.toolName,
            arguments: JSON.stringify(part.input || {})
          }
        }));
        return {
          role: "assistant",
          content: textContent || null,
          ...toolCalls.length > 0 && { tool_calls: toolCalls }
        };
      }
      if (msg.role === "tool") {
        return msg.content.map((toolResponse) => ({
          role: "tool",
          tool_call_id: toolResponse.toolCallId,
          content: JSON.stringify(toolResponse.output)
        }));
      }
      return msg;
    }).flat();
  }
  convertToolsToOpenAI(tools) {
    if (!tools || Object.keys(tools).length === 0) return void 0;
    return Object.entries(tools).map(([name, tool]) => {
      if (tool.type === "function") {
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema || {}
          }
        };
      }
      return {
        type: "function",
        function: {
          name,
          description: `Provider tool: ${name}`,
          parameters: {}
        }
      };
    });
  }
  mapFinishReason(reason) {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
      case "max_tokens":
        return "length";
      case "tool_calls":
      case "function_call":
        return "tool-calls";
      case "content_filter":
        return "content-filter";
      default:
        return "unknown";
    }
  }
  /**
   * Resolve URL and headers for the request
   * This is called fresh for each request to ensure we get the latest values
   * (e.g., Netlify tokens can expire and need to be refreshed)
   */
  async resolveRequestConfig() {
    const shouldUseGateway = !this.config.url;
    if (shouldUseGateway) {
      const { url, headers, resolvedModelId } = await resolveModelConfig(this.fullModelId);
      if (url === false) {
        throw new Error(`No gateway can handle model: ${this.fullModelId}`);
      }
      const finalHeaders = {
        "Content-Type": "application/json",
        ...headers,
        ...this.config.headers
      };
      return { url, headers: finalHeaders, modelId: resolvedModelId };
    } else {
      if (!this.config.url) {
        throw new Error("URL is required for OpenAI-compatible model");
      }
      const headers = {
        "Content-Type": "application/json",
        ...this.config.headers
      };
      if (this.config.apiKey) {
        const providerConfig = this.provider !== "openai-compatible" ? getProviderConfig(this.provider) : void 0;
        if (providerConfig?.apiKeyHeader === "x-api-key") {
          headers["x-api-key"] = this.config.apiKey;
        } else {
          headers["Authorization"] = `Bearer ${this.config.apiKey}`;
        }
      }
      return { url: this.config.url, headers, modelId: this.modelId };
    }
  }
  validateApiKey() {
    const willUseGateway = !this.config.url;
    if (willUseGateway) {
      return;
    }
    if (!this.config.apiKey && this.provider !== "openai-compatible") {
      const providerConfig = getProviderConfig(this.provider);
      if (providerConfig?.apiKeyEnvVar) {
        throw new Error(
          `API key not found for provider "${this.provider}". Please set the ${providerConfig.apiKeyEnvVar} environment variable.`
        );
      } else {
        throw new Error(
          `API key not found for provider "${this.provider}". Please provide an API key in the configuration.`
        );
      }
    }
  }
  async doGenerate() {
    throw new Error(
      "doGenerate is not supported by OpenAICompatibleModel. Mastra only uses streaming (doStream) for all LLM calls."
    );
  }
  async doStream(options) {
    try {
      this.validateApiKey();
    } catch (error) {
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: "error",
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }),
        warnings: []
      };
    }
    try {
      const { url, headers, modelId: resolvedModelId } = await this.resolveRequestConfig();
      const { prompt, tools, toolChoice, providerOptions } = options;
      const body = {
        messages: this.convertMessagesToOpenAI(prompt),
        model: resolvedModelId,
        stream: true,
        ...providerOptions
      };
      const openAITools = this.convertToolsToOpenAI(tools);
      if (openAITools) {
        body.tools = openAITools;
        if (toolChoice) {
          body.tool_choice = toolChoice.type === "none" ? "none" : toolChoice.type === "required" ? "required" : toolChoice.type === "auto" ? "auto" : toolChoice.type === "tool" ? { type: "function", function: { name: toolChoice.toolName } } : "auto";
        }
      }
      if (options.responseFormat?.type === "json") {
        body.response_format = {
          type: "json_schema",
          json_schema: {
            name: "response",
            strict: true,
            schema: options.responseFormat.schema
          }
        };
      }
      const fetchArgs = {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: options.abortSignal
      };
      const response = await fetch(url, fetchArgs);
      if (!response.ok) {
        const error = await response.text();
        if (response.status === 401 || response.status === 403) {
          const providerConfig = getProviderConfig(this.provider);
          if (providerConfig?.apiKeyEnvVar) {
            throw new Error(
              `Authentication failed for provider "${this.provider}". Please ensure the ${providerConfig.apiKeyEnvVar} environment variable is set with a valid API key.`
            );
          }
        }
        throw new Error(`OpenAI-compatible API error: ${response.status} - ${error}`);
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not readable");
      }
      const decoder = new TextDecoder();
      let buffer = "";
      let sentStart = false;
      const toolCallBuffers = /* @__PURE__ */ new Map();
      const mapFinishReason = this.mapFinishReason.bind(this);
      const modelId = this.modelId;
      let isActiveText = false;
      const stream = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue({
              type: "stream-start",
              warnings: []
            });
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                for (const [_, toolCall] of toolCallBuffers) {
                  if (!toolCall.sent && toolCall.id && toolCall.name && toolCall.args) {
                    controller.enqueue({
                      type: "tool-call",
                      toolCallId: toolCall.id,
                      toolName: toolCall.name,
                      input: toolCall.args || "{}"
                    });
                  }
                }
                controller.close();
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";
              for (const line of lines) {
                if (line.trim() === "" || line.trim() === "data: [DONE]") {
                  continue;
                }
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (!sentStart && data.id) {
                      controller.enqueue({
                        type: "response-metadata",
                        id: data.id,
                        modelId: data.model || modelId,
                        timestamp: new Date(data.created ? data.created * 1e3 : Date.now())
                      });
                      sentStart = true;
                    }
                    const choice = data.choices?.[0];
                    if (!choice) continue;
                    if (choice.delta?.content) {
                      if (!isActiveText) {
                        controller.enqueue({ type: "text-start", id: "text-1" });
                        isActiveText = true;
                      }
                      controller.enqueue({
                        type: "text-delta",
                        id: "text-1",
                        delta: choice.delta.content
                      });
                    } else if (isActiveText) {
                      controller.enqueue({ type: "text-end", id: "text-1" });
                      isActiveText = false;
                    }
                    if (choice.delta?.tool_calls) {
                      for (const toolCall of choice.delta.tool_calls) {
                        const index = toolCall.index;
                        if (!toolCallBuffers.has(index)) {
                          if (toolCall.id && toolCall.function?.name) {
                            controller.enqueue({
                              type: "tool-input-start",
                              id: toolCall.id,
                              toolName: toolCall.function.name
                            });
                          }
                          toolCallBuffers.set(index, {
                            id: toolCall.id || "",
                            name: toolCall.function?.name || "",
                            args: ""
                          });
                        }
                        const buffer2 = toolCallBuffers.get(index);
                        if (toolCall.id) {
                          buffer2.id = toolCall.id;
                        }
                        if (toolCall.function?.name) {
                          buffer2.name = toolCall.function.name;
                        }
                        if (toolCall.function?.arguments) {
                          buffer2.args += toolCall.function.arguments;
                          controller.enqueue({
                            type: "tool-input-delta",
                            id: buffer2.id,
                            delta: toolCall.function.arguments
                          });
                          try {
                            JSON.parse(buffer2.args);
                            if (buffer2.id && buffer2.name) {
                              controller.enqueue({
                                type: "tool-input-end",
                                id: buffer2.id
                              });
                              controller.enqueue({
                                type: "tool-call",
                                toolCallId: buffer2.id,
                                toolName: buffer2.name,
                                input: buffer2.args
                              });
                              toolCallBuffers.set(index, {
                                id: buffer2.id,
                                name: buffer2.name,
                                args: buffer2.args,
                                sent: true
                              });
                            }
                          } catch {
                          }
                        }
                      }
                    }
                    if (choice.finish_reason) {
                      toolCallBuffers.clear();
                      controller.enqueue({
                        type: "finish",
                        finishReason: mapFinishReason(choice.finish_reason),
                        usage: data.usage ? {
                          inputTokens: data.usage.prompt_tokens || 0,
                          outputTokens: data.usage.completion_tokens || 0,
                          totalTokens: data.usage.total_tokens || 0
                        } : {
                          inputTokens: 0,
                          outputTokens: 0,
                          totalTokens: 0
                        }
                      });
                    }
                  } catch (e) {
                    console.error("Error parsing SSE data:", e);
                  }
                }
              }
            }
          } catch (error) {
            return {
              stream: new ReadableStream({
                start(controller2) {
                  controller2.enqueue({
                    type: "error",
                    error: error instanceof Error ? error.message : String(error)
                  });
                }
              }),
              warnings: []
            };
          }
        }
      });
      return {
        stream,
        request: { body: JSON.stringify(body) },
        response: { headers: Object.fromEntries(response.headers.entries()) },
        warnings: []
      };
    } catch (error) {
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: "error",
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }),
        warnings: []
      };
    }
  }
};

export { InMemoryServerCache as I, OpenAICompatibleModel as O, PROVIDER_REGISTRY as P, getProviderConfig as g };
