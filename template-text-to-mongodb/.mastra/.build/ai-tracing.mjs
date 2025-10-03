import { RuntimeContext } from './@mastra-core-di.mjs';
import { M as MastraError } from './error.mjs';
import { WritableStream } from 'stream/web';
import { i as isVercelTool, v as validateToolInput } from './tools.mjs';
import { M as MastraBase } from './chunk-BMVFEBPE.mjs';
import { C as ConsoleLogger, L as LogLevel, R as RegisteredLogger } from './chunk-BN2M4UK5.mjs';
import { createHash } from 'crypto';
import { z } from './zod.mjs';
import { zodToJsonSchema } from './@mastra-core-utils-zod-to-json.mjs';
import { j as jsonSchema } from './_virtual__virtual-ai.mjs';
import { l as literalType, at as nullType, b as arrayType, a as anyType, o as objectType, c as booleanType, u as unionType, n as numberType, s as stringType, e as enumType, as as neverType, ah as intersectionType, U as ZodOptional, Z as ZodObject, R as ZodNull, k as ZodArray, a4 as ZodUnion, a0 as ZodString, T as ZodNumber, v as ZodDate, w as ZodDefault, Q as ZodNever } from './v3.mjs';
import { dV as ZodOptional$1, dU as ZodObject$1, dR as ZodNull$1, dg as ZodArray$1, ec as ZodUnion$1, da as ZodString$1, db as ZodNumber$1, de as ZodDate$1, ds as ZodDefault$1, o as object, dP as ZodNever$1, p as strictObject, ed as ZodUnknown, q as looseObject, e as array, u as union, d as string, n as number } from './schemas.mjs';


// -- Shims --
import cjsUrl from 'node:url';
import cjsPath from 'node:path';
import cjsModule from 'node:module';
const __filename = cjsUrl.fileURLToPath(import.meta.url);
const __dirname = cjsPath.dirname(__filename);
const require = cjsModule.createRequire(import.meta.url);
// src/tools/stream.ts
var ToolStream = class extends WritableStream {
  constructor({
    prefix,
    callId,
    name,
    runId
  }, originalStream) {
    super({
      async write(chunk) {
        const writer = originalStream?.getWriter();
        try {
          await writer?.write({
            type: `${prefix}-output`,
            runId,
            from: "USER",
            payload: {
              output: chunk,
              ...prefix === "workflow-step" ? {
                runId,
                stepName: name
              } : {
                [`${prefix}CallId`]: callId,
                [`${prefix}Name`]: name
              }
            }
          });
        } finally {
          writer?.releaseLock();
        }
      }
    });
  }
  async write(data) {
    const writer = this.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }
};

const parseAnyOf = (schema, refs) => {
    return schema.anyOf.length
        ? schema.anyOf.length === 1
            ? parseSchema(schema.anyOf[0], {
                ...refs,
                path: [...refs.path, "anyOf", 0],
            })
            : `z.union([${schema.anyOf
                .map((schema, i) => parseSchema(schema, { ...refs, path: [...refs.path, "anyOf", i] }))
                .join(", ")}])`
        : `z.any()`;
};

const parseBoolean = (_schema) => {
    return "z.boolean()";
};

const parseDefault = (_schema) => {
    return "z.any()";
};

const parseMultipleType = (schema, refs) => {
    return `z.union([${schema.type
        .map((type) => parseSchema({ ...schema, type }, { ...refs, withoutDefaults: true }))
        .join(", ")}])`;
};

const parseNot = (schema, refs) => {
    return `z.any().refine((value) => !${parseSchema(schema.not, {
        ...refs,
        path: [...refs.path, "not"],
    })}.safeParse(value).success, "Invalid input: Should NOT be valid against schema")`;
};

const parseNull = (_schema) => {
    return "z.null()";
};

const half = (arr) => {
    return [arr.slice(0, arr.length / 2), arr.slice(arr.length / 2)];
};

const originalIndex = Symbol("Original index");
const ensureOriginalIndex = (arr) => {
    let newArr = [];
    for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (typeof item === "boolean") {
            newArr.push(item ? { [originalIndex]: i } : { [originalIndex]: i, not: {} });
        }
        else if (originalIndex in item) {
            return arr;
        }
        else {
            newArr.push({ ...item, [originalIndex]: i });
        }
    }
    return newArr;
};
function parseAllOf(schema, refs) {
    if (schema.allOf.length === 0) {
        return "z.never()";
    }
    else if (schema.allOf.length === 1) {
        const item = schema.allOf[0];
        return parseSchema(item, {
            ...refs,
            path: [...refs.path, "allOf", item[originalIndex]],
        });
    }
    else {
        const [left, right] = half(ensureOriginalIndex(schema.allOf));
        return `z.intersection(${parseAllOf({ allOf: left }, refs)}, ${parseAllOf({
            allOf: right,
        }, refs)})`;
    }
}

function withMessage(schema, key, get) {
    const value = schema[key];
    let r = "";
    if (value !== undefined) {
        const got = get({ value, json: JSON.stringify(value) });
        if (got) {
            const opener = got[0];
            const prefix = got.length === 3 ? got[1] : "";
            const closer = got.length === 3 ? got[2] : got[1];
            r += opener;
            if (schema.errorMessage?.[key] !== undefined) {
                r += prefix + JSON.stringify(schema.errorMessage[key]);
            }
            r += closer;
        }
    }
    return r;
}

const parseArray = (schema, refs) => {
    if (Array.isArray(schema.items)) {
        return `z.tuple([${schema.items.map((v, i) => parseSchema(v, { ...refs, path: [...refs.path, "items", i] }))}])`;
    }
    let r = !schema.items
        ? "z.array(z.any())"
        : `z.array(${parseSchema(schema.items, {
            ...refs,
            path: [...refs.path, "items"],
        })})`;
    r += withMessage(schema, "minItems", ({ json }) => [
        `.min(${json}`,
        ", ",
        ")",
    ]);
    r += withMessage(schema, "maxItems", ({ json }) => [
        `.max(${json}`,
        ", ",
        ")",
    ]);
    return r;
};

const parseConst = (schema) => {
    return `z.literal(${JSON.stringify(schema.const)})`;
};

const parseEnum = (schema) => {
    if (schema.enum.length === 0) {
        return "z.never()";
    }
    else if (schema.enum.length === 1) {
        // union does not work when there is only one element
        return `z.literal(${JSON.stringify(schema.enum[0])})`;
    }
    else if (schema.enum.every((x) => typeof x === "string")) {
        return `z.enum([${schema.enum.map((x) => JSON.stringify(x))}])`;
    }
    else {
        return `z.union([${schema.enum
            .map((x) => `z.literal(${JSON.stringify(x)})`)
            .join(", ")}])`;
    }
};

const parseIfThenElse = (schema, refs) => {
    const $if = parseSchema(schema.if, { ...refs, path: [...refs.path, "if"] });
    const $then = parseSchema(schema.then, {
        ...refs,
        path: [...refs.path, "then"],
    });
    const $else = parseSchema(schema.else, {
        ...refs,
        path: [...refs.path, "else"],
    });
    return `z.union([${$then}, ${$else}]).superRefine((value,ctx) => {
  const result = ${$if}.safeParse(value).success
    ? ${$then}.safeParse(value)
    : ${$else}.safeParse(value);
  if (!result.success) {
    result.error.errors.forEach((error) => ctx.addIssue(error))
  }
})`;
};

const parseNumber = (schema) => {
    let r = "z.number()";
    if (schema.type === "integer") {
        r += withMessage(schema, "type", () => [".int(", ")"]);
    }
    else {
        r += withMessage(schema, "format", ({ value }) => {
            if (value === "int64") {
                return [".int(", ")"];
            }
        });
    }
    r += withMessage(schema, "multipleOf", ({ value, json }) => {
        if (value === 1) {
            if (r.startsWith("z.number().int(")) {
                return;
            }
            return [".int(", ")"];
        }
        return [`.multipleOf(${json}`, ", ", ")"];
    });
    if (typeof schema.minimum === "number") {
        if (schema.exclusiveMinimum === true) {
            r += withMessage(schema, "minimum", ({ json }) => [
                `.gt(${json}`,
                ", ",
                ")",
            ]);
        }
        else {
            r += withMessage(schema, "minimum", ({ json }) => [
                `.gte(${json}`,
                ", ",
                ")",
            ]);
        }
    }
    else if (typeof schema.exclusiveMinimum === "number") {
        r += withMessage(schema, "exclusiveMinimum", ({ json }) => [
            `.gt(${json}`,
            ", ",
            ")",
        ]);
    }
    if (typeof schema.maximum === "number") {
        if (schema.exclusiveMaximum === true) {
            r += withMessage(schema, "maximum", ({ json }) => [
                `.lt(${json}`,
                ", ",
                ")",
            ]);
        }
        else {
            r += withMessage(schema, "maximum", ({ json }) => [
                `.lte(${json}`,
                ", ",
                ")",
            ]);
        }
    }
    else if (typeof schema.exclusiveMaximum === "number") {
        r += withMessage(schema, "exclusiveMaximum", ({ json }) => [
            `.lt(${json}`,
            ", ",
            ")",
        ]);
    }
    return r;
};

const parseOneOf = (schema, refs) => {
    return schema.oneOf.length
        ? schema.oneOf.length === 1
            ? parseSchema(schema.oneOf[0], {
                ...refs,
                path: [...refs.path, "oneOf", 0],
            })
            : `z.any().superRefine((x, ctx) => {
    const schemas = [${schema.oneOf
                .map((schema, i) => parseSchema(schema, {
                ...refs,
                path: [...refs.path, "oneOf", i],
            }))
                .join(", ")}];
    const errors = schemas.reduce<z.ZodError[]>(
      (errors, schema) =>
        ((result) =>
          result.error ? [...errors, result.error] : errors)(
          schema.safeParse(x),
        ),
      [],
    );
    if (schemas.length - errors.length !== 1) {
      ctx.addIssue({
        path: ctx.path,
        code: "invalid_union",
        unionErrors: errors,
        message: "Invalid input: Should pass single schema",
      });
    }
  })`
        : "z.any()";
};

const expandJsdocs = (jsdocs) => {
    const lines = jsdocs.split("\n");
    const result = lines.length === 1
        ? lines[0]
        : `\n${lines.map(x => `* ${x}`)
            .join("\n")}\n`;
    return `/**${result}*/\n`;
};
const addJsdocs = (schema, parsed) => {
    const description = schema.description;
    if (!description) {
        return parsed;
    }
    return `\n${expandJsdocs(description)}${parsed}`;
};

function parseObject(objectSchema, refs) {
    let properties = undefined;
    if (objectSchema.properties) {
        if (!Object.keys(objectSchema.properties).length) {
            properties = "z.object({})";
        }
        else {
            properties = "z.object({ ";
            properties += Object.keys(objectSchema.properties)
                .map((key) => {
                const propSchema = objectSchema.properties[key];
                let result = `${JSON.stringify(key)}: ${parseSchema(propSchema, {
                    ...refs,
                    path: [...refs.path, "properties", key],
                })}`;
                if (refs.withJsdocs && typeof propSchema === "object") {
                    result = addJsdocs(propSchema, result);
                }
                const hasDefault = typeof propSchema === "object" && propSchema.default !== undefined;
                const required = Array.isArray(objectSchema.required)
                    ? objectSchema.required.includes(key)
                    : typeof propSchema === "object" && propSchema.required === true;
                const optional = !hasDefault && !required;
                return optional ? `${result}.optional()` : result;
            })
                .join(", ");
            properties += " })";
        }
    }
    const additionalProperties = objectSchema.additionalProperties !== undefined
        ? parseSchema(objectSchema.additionalProperties, {
            ...refs,
            path: [...refs.path, "additionalProperties"],
        })
        : undefined;
    let patternProperties = undefined;
    if (objectSchema.patternProperties) {
        const parsedPatternProperties = Object.fromEntries(Object.entries(objectSchema.patternProperties).map(([key, value]) => {
            return [
                key,
                parseSchema(value, {
                    ...refs,
                    path: [...refs.path, "patternProperties", key],
                }),
            ];
        }, {}));
        patternProperties = "";
        if (properties) {
            if (additionalProperties) {
                patternProperties += `.catchall(z.union([${[
                    ...Object.values(parsedPatternProperties),
                    additionalProperties,
                ].join(", ")}]))`;
            }
            else if (Object.keys(parsedPatternProperties).length > 1) {
                patternProperties += `.catchall(z.union([${Object.values(parsedPatternProperties).join(", ")}]))`;
            }
            else {
                patternProperties += `.catchall(${Object.values(parsedPatternProperties)})`;
            }
        }
        else {
            if (additionalProperties) {
                patternProperties += `z.record(z.union([${[
                    ...Object.values(parsedPatternProperties),
                    additionalProperties,
                ].join(", ")}]))`;
            }
            else if (Object.keys(parsedPatternProperties).length > 1) {
                patternProperties += `z.record(z.union([${Object.values(parsedPatternProperties).join(", ")}]))`;
            }
            else {
                patternProperties += `z.record(${Object.values(parsedPatternProperties)})`;
            }
        }
        patternProperties += ".superRefine((value, ctx) => {\n";
        patternProperties += "for (const key in value) {\n";
        if (additionalProperties) {
            if (objectSchema.properties) {
                patternProperties += `let evaluated = [${Object.keys(objectSchema.properties)
                    .map((key) => JSON.stringify(key))
                    .join(", ")}].includes(key)\n`;
            }
            else {
                patternProperties += `let evaluated = false\n`;
            }
        }
        for (const key in objectSchema.patternProperties) {
            patternProperties +=
                "if (key.match(new RegExp(" + JSON.stringify(key) + "))) {\n";
            if (additionalProperties) {
                patternProperties += "evaluated = true\n";
            }
            patternProperties +=
                "const result = " +
                    parsedPatternProperties[key] +
                    ".safeParse(value[key])\n";
            patternProperties += "if (!result.success) {\n";
            patternProperties += `ctx.addIssue({
          path: [...ctx.path, key],
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })\n`;
            patternProperties += "}\n";
            patternProperties += "}\n";
        }
        if (additionalProperties) {
            patternProperties += "if (!evaluated) {\n";
            patternProperties +=
                "const result = " + additionalProperties + ".safeParse(value[key])\n";
            patternProperties += "if (!result.success) {\n";
            patternProperties += `ctx.addIssue({
          path: [...ctx.path, key],
          code: 'custom',
          message: \`Invalid input: must match catchall schema\`,
          params: {
            issues: result.error.issues
          }
        })\n`;
            patternProperties += "}\n";
            patternProperties += "}\n";
        }
        patternProperties += "}\n";
        patternProperties += "})";
    }
    let output = properties
        ? patternProperties
            ? properties + patternProperties
            : additionalProperties
                ? additionalProperties === "z.never()"
                    ? properties + ".strict()"
                    : properties + `.catchall(${additionalProperties})`
                : properties
        : patternProperties
            ? patternProperties
            : additionalProperties
                ? `z.record(${additionalProperties})`
                : "z.record(z.any())";
    if (its.an.anyOf(objectSchema)) {
        output += `.and(${parseAnyOf({
            anyOf: objectSchema.anyOf.map((x) => typeof x === "object" &&
                !x.type &&
                (x.properties || x.additionalProperties || x.patternProperties)
                ? { ...x, type: "object" }
                : x),
        }, refs)})`;
    }
    if (its.a.oneOf(objectSchema)) {
        output += `.and(${parseOneOf({
            oneOf: objectSchema.oneOf.map((x) => typeof x === "object" &&
                !x.type &&
                (x.properties || x.additionalProperties || x.patternProperties)
                ? { ...x, type: "object" }
                : x),
        }, refs)})`;
    }
    if (its.an.allOf(objectSchema)) {
        output += `.and(${parseAllOf({
            allOf: objectSchema.allOf.map((x) => typeof x === "object" &&
                !x.type &&
                (x.properties || x.additionalProperties || x.patternProperties)
                ? { ...x, type: "object" }
                : x),
        }, refs)})`;
    }
    return output;
}

const parseString = (schema) => {
    let r = "z.string()";
    r += withMessage(schema, "format", ({ value }) => {
        switch (value) {
            case "email":
                return [".email(", ")"];
            case "ip":
                return [".ip(", ")"];
            case "ipv4":
                return ['.ip({ version: "v4"', ", message: ", " })"];
            case "ipv6":
                return ['.ip({ version: "v6"', ", message: ", " })"];
            case "uri":
                return [".url(", ")"];
            case "uuid":
                return [".uuid(", ")"];
            case "date-time":
                return [".datetime({ offset: true", ", message: ", " })"];
            case "time":
                return [".time(", ")"];
            case "date":
                return [".date(", ")"];
            case "binary":
                return [".base64(", ")"];
            case "duration":
                return [".duration(", ")"];
        }
    });
    r += withMessage(schema, "pattern", ({ json }) => [
        `.regex(new RegExp(${json})`,
        ", ",
        ")",
    ]);
    r += withMessage(schema, "minLength", ({ json }) => [
        `.min(${json}`,
        ", ",
        ")",
    ]);
    r += withMessage(schema, "maxLength", ({ json }) => [
        `.max(${json}`,
        ", ",
        ")",
    ]);
    r += withMessage(schema, "contentEncoding", ({ value }) => {
        if (value === "base64") {
            return [".base64(", ")"];
        }
    });
    const contentMediaType = withMessage(schema, "contentMediaType", ({ value }) => {
        if (value === "application/json") {
            return [
                ".transform((str, ctx) => { try { return JSON.parse(str); } catch (err) { ctx.addIssue({ code: \"custom\", message: \"Invalid JSON\" }); }}",
                ", ",
                ")"
            ];
        }
    });
    if (contentMediaType != "") {
        r += contentMediaType;
        r += withMessage(schema, "contentSchema", ({ value }) => {
            if (value && value instanceof Object) {
                return [
                    `.pipe(${parseSchema(value)}`,
                    ", ",
                    ")"
                ];
            }
        });
    }
    return r;
};

const omit = (obj, ...keys) => Object.keys(obj).reduce((acc, key) => {
    if (!keys.includes(key)) {
        acc[key] = obj[key];
    }
    return acc;
}, {});

/**
 * For compatibility with open api 3.0 nullable
 */
const parseNullable = (schema, refs) => {
    return `${parseSchema(omit(schema, "nullable"), refs, true)}.nullable()`;
};

const parseSchema = (schema, refs = { seen: new Map(), path: [] }, blockMeta) => {
    if (typeof schema !== "object")
        return schema ? "z.any()" : "z.never()";
    if (refs.parserOverride) {
        const custom = refs.parserOverride(schema, refs);
        if (typeof custom === "string") {
            return custom;
        }
    }
    let seen = refs.seen.get(schema);
    if (seen) {
        if (seen.r !== undefined) {
            return seen.r;
        }
        if (refs.depth === undefined || seen.n >= refs.depth) {
            return "z.any()";
        }
        seen.n += 1;
    }
    else {
        seen = { r: undefined, n: 0 };
        refs.seen.set(schema, seen);
    }
    let parsed = selectParser(schema, refs);
    if (!blockMeta) {
        if (!refs.withoutDescribes) {
            parsed = addDescribes(schema, parsed);
        }
        if (!refs.withoutDefaults) {
            parsed = addDefaults(schema, parsed);
        }
        parsed = addAnnotations(schema, parsed);
    }
    seen.r = parsed;
    return parsed;
};
const addDescribes = (schema, parsed) => {
    if (schema.description) {
        parsed += `.describe(${JSON.stringify(schema.description)})`;
    }
    return parsed;
};
const addDefaults = (schema, parsed) => {
    if (schema.default !== undefined) {
        parsed += `.default(${JSON.stringify(schema.default)})`;
    }
    return parsed;
};
const addAnnotations = (schema, parsed) => {
    if (schema.readOnly) {
        parsed += ".readonly()";
    }
    return parsed;
};
const selectParser = (schema, refs) => {
    if (its.a.nullable(schema)) {
        return parseNullable(schema, refs);
    }
    else if (its.an.object(schema)) {
        return parseObject(schema, refs);
    }
    else if (its.an.array(schema)) {
        return parseArray(schema, refs);
    }
    else if (its.an.anyOf(schema)) {
        return parseAnyOf(schema, refs);
    }
    else if (its.an.allOf(schema)) {
        return parseAllOf(schema, refs);
    }
    else if (its.a.oneOf(schema)) {
        return parseOneOf(schema, refs);
    }
    else if (its.a.not(schema)) {
        return parseNot(schema, refs);
    }
    else if (its.an.enum(schema)) {
        return parseEnum(schema); //<-- needs to come before primitives
    }
    else if (its.a.const(schema)) {
        return parseConst(schema);
    }
    else if (its.a.multipleType(schema)) {
        return parseMultipleType(schema, refs);
    }
    else if (its.a.primitive(schema, "string")) {
        return parseString(schema);
    }
    else if (its.a.primitive(schema, "number") ||
        its.a.primitive(schema, "integer")) {
        return parseNumber(schema);
    }
    else if (its.a.primitive(schema, "boolean")) {
        return parseBoolean();
    }
    else if (its.a.primitive(schema, "null")) {
        return parseNull();
    }
    else if (its.a.conditional(schema)) {
        return parseIfThenElse(schema, refs);
    }
    else {
        return parseDefault();
    }
};
const its = {
    an: {
        object: (x) => x.type === "object",
        array: (x) => x.type === "array",
        anyOf: (x) => x.anyOf !== undefined,
        allOf: (x) => x.allOf !== undefined,
        enum: (x) => x.enum !== undefined,
    },
    a: {
        nullable: (x) => x.nullable === true,
        multipleType: (x) => Array.isArray(x.type),
        not: (x) => x.not !== undefined,
        const: (x) => x.const !== undefined,
        primitive: (x, p) => x.type === p,
        conditional: (x) => Boolean("if" in x && x.if && "then" in x && "else" in x && x.then && x.else),
        oneOf: (x) => x.oneOf !== undefined,
    },
};

const jsonSchemaToZod = (schema, { module, name, type, noImport, ...rest } = {}) => {
    if (type && (!name || module !== "esm")) {
        throw new Error("Option `type` requires `name` to be set and `module` to be `esm`");
    }
    let result = parseSchema(schema, {
        module,
        name,
        path: [],
        seen: new Map(),
        ...rest,
    });
    const jsdocs = rest.withJsdocs && typeof schema !== "boolean" && schema.description
        ? expandJsdocs(schema.description)
        : "";
    if (module === "cjs") {
        result = `${jsdocs}module.exports = ${name ? `{ ${JSON.stringify(name)}: ${result} }` : result}
`;
        if (!noImport) {
            result = `${jsdocs}const { z } = require("zod")

${result}`;
        }
    }
    else if (module === "esm") {
        result = `${jsdocs}export ${name ? `const ${name} =` : `default`} ${result}
`;
        if (!noImport) {
            result = `import { z } from "zod"

${result}`;
        }
    }
    else if (name) {
        result = `${jsdocs}const ${name} = ${result}`;
    }
    if (type && name) {
        let typeName = typeof type === "string"
            ? type
            : `${name[0].toUpperCase()}${name.substring(1)}`;
        result += `export type ${typeName} = z.infer<typeof ${name}>
`;
    }
    return result;
};

// src/index.ts
function convertJsonSchemaToZod(schema) {
  function addMetadata(zodSchema, jsonSchema) {
    if (jsonSchema.description) {
      zodSchema = zodSchema.describe(jsonSchema.description);
    }
    return zodSchema;
  }
  if (schema.const !== void 0) {
    if (typeof schema.const === "string") {
      return addMetadata(literalType(schema.const), schema);
    } else if (typeof schema.const === "number") {
      return addMetadata(literalType(schema.const), schema);
    } else if (typeof schema.const === "boolean") {
      return addMetadata(literalType(schema.const), schema);
    } else if (schema.const === null) {
      return addMetadata(nullType(), schema);
    }
    return addMetadata(literalType(schema.const), schema);
  }
  if (schema.type) {
    switch (schema.type) {
      case "string": {
        if (schema.enum) {
          if (schema.enum.length === 0) {
            return addMetadata(stringType(), schema);
          }
          return addMetadata(enumType(schema.enum), schema);
        }
        let stringSchema = stringType();
        if (schema.minLength !== void 0) {
          stringSchema = stringSchema.min(schema.minLength);
        }
        if (schema.maxLength !== void 0) {
          stringSchema = stringSchema.max(schema.maxLength);
        }
        if (schema.pattern !== void 0) {
          const regex = new RegExp(schema.pattern);
          stringSchema = stringSchema.regex(regex);
        }
        return addMetadata(stringSchema, schema);
      }
      case "number":
      case "integer": {
        if (schema.enum) {
          if (schema.enum.length === 0) {
            return addMetadata(numberType(), schema);
          }
          const options = schema.enum.map((val) => literalType(val));
          if (options.length === 1) {
            return addMetadata(options[0], schema);
          }
          if (options.length >= 2) {
            const unionSchema = unionType([options[0], options[1], ...options.slice(2)]);
            return addMetadata(unionSchema, schema);
          }
        }
        let numberSchema = schema.type === "integer" ? numberType().int() : numberType();
        if (schema.minimum !== void 0) {
          numberSchema = numberSchema.min(schema.minimum);
        }
        if (schema.maximum !== void 0) {
          numberSchema = numberSchema.max(schema.maximum);
        }
        if (schema.exclusiveMinimum !== void 0) {
          numberSchema = numberSchema.gt(schema.exclusiveMinimum);
        }
        if (schema.exclusiveMaximum !== void 0) {
          numberSchema = numberSchema.lt(schema.exclusiveMaximum);
        }
        if (schema.multipleOf !== void 0) {
          numberSchema = numberSchema.multipleOf(schema.multipleOf);
        }
        return addMetadata(numberSchema, schema);
      }
      case "boolean":
        if (schema.enum) {
          if (schema.enum.length === 0) {
            return addMetadata(booleanType(), schema);
          }
          const options = schema.enum.map((val) => literalType(val));
          if (options.length === 1) {
            return addMetadata(options[0], schema);
          }
          if (options.length >= 2) {
            const unionSchema = unionType([options[0], options[1], ...options.slice(2)]);
            return addMetadata(unionSchema, schema);
          }
        }
        return addMetadata(booleanType(), schema);
      case "null":
        return addMetadata(nullType(), schema);
      case "object":
        if (schema.properties) {
          const shape = {};
          for (const [key, propSchema] of Object.entries(
            schema.properties
          )) {
            shape[key] = convertJsonSchemaToZod(propSchema);
          }
          if (schema.required && Array.isArray(schema.required)) {
            const required = new Set(schema.required);
            for (const key of Object.keys(shape)) {
              if (!required.has(key)) {
                shape[key] = shape[key].optional();
              }
            }
          } else {
            for (const key of Object.keys(shape)) {
              shape[key] = shape[key].optional();
            }
          }
          let zodSchema;
          if (schema.additionalProperties !== false) {
            zodSchema = objectType(shape).passthrough();
          } else {
            zodSchema = objectType(shape);
          }
          return addMetadata(zodSchema, schema);
        }
        return addMetadata(objectType({}), schema);
      case "array": {
        let arraySchema;
        if (schema.items) {
          arraySchema = arrayType(convertJsonSchemaToZod(schema.items));
        } else {
          arraySchema = arrayType(anyType());
        }
        if (schema.minItems !== void 0) {
          arraySchema = arraySchema.min(schema.minItems);
        }
        if (schema.maxItems !== void 0) {
          arraySchema = arraySchema.max(schema.maxItems);
        }
        if (schema.uniqueItems === true) {
          arraySchema = arraySchema.refine(
            (items) => {
              const seen = /* @__PURE__ */ new Set();
              return items.every((item) => {
                if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
                  if (seen.has(item)) return false;
                  seen.add(item);
                  return true;
                }
                const serialized = JSON.stringify(item);
                if (seen.has(serialized)) return false;
                seen.add(serialized);
                return true;
              });
            },
            { message: "Array items must be unique" }
          );
        }
        return addMetadata(arraySchema, schema);
      }
    }
  }
  if (schema.enum) {
    if (schema.enum.length === 0) {
      return addMetadata(neverType(), schema);
    }
    const allStrings = schema.enum.every((val) => typeof val === "string");
    if (allStrings) {
      return addMetadata(enumType(schema.enum), schema);
    } else {
      const options = schema.enum.map((val) => literalType(val));
      if (options.length === 1) {
        return addMetadata(options[0], schema);
      }
      if (options.length >= 2) {
        const unionSchema = unionType([options[0], options[1], ...options.slice(2)]);
        return addMetadata(unionSchema, schema);
      }
    }
  }
  if (schema.anyOf && schema.anyOf.length >= 2) {
    const schemas = schema.anyOf.map(convertJsonSchemaToZod);
    return addMetadata(
      unionType([schemas[0], schemas[1], ...schemas.slice(2)]),
      schema
    );
  }
  if (schema.allOf) {
    return addMetadata(
      schema.allOf.reduce(
        (acc, s) => intersectionType(acc, convertJsonSchemaToZod(s)),
        objectType({})
      ),
      schema
    );
  }
  if (schema.oneOf && schema.oneOf.length >= 2) {
    const schemas = schema.oneOf.map(convertJsonSchemaToZod);
    return addMetadata(
      unionType([schemas[0], schemas[1], ...schemas.slice(2)]),
      schema
    );
  }
  return addMetadata(anyType(), schema);
}

function convertZodSchemaToAISDKSchema(zodSchema, target = "jsonSchema7") {
  const jsonSchemaToUse = zodToJsonSchema(zodSchema, target);
  return jsonSchema(jsonSchemaToUse, {
    validate: (value) => {
      const result = zodSchema.safeParse(value);
      return result.success ? { success: true, value: result.data } : { success: false, error: result.error };
    }
  });
}
function isZodType$1(value) {
  return typeof value === "object" && value !== null && "_def" in value && "parse" in value && typeof value.parse === "function" && "safeParse" in value && typeof value.safeParse === "function";
}
function convertSchemaToZod(schema) {
  if (isZodType$1(schema)) {
    return schema;
  } else {
    const jsonSchemaToConvert = "jsonSchema" in schema ? schema.jsonSchema : schema;
    try {
      {
        return convertJsonSchemaToZod(jsonSchemaToConvert);
      }
    } catch (e) {
      const errorMessage = `[Schema Builder] Failed to convert schema parameters to Zod. Original schema: ${JSON.stringify(jsonSchemaToConvert)}`;
      console.error(errorMessage, e);
      throw new Error(errorMessage + (e instanceof Error ? `
${e.stack}` : "\nUnknown error object"));
    }
  }
}
function applyCompatLayer({
  schema,
  compatLayers,
  mode
}) {
  let zodSchema;
  if (!isZodType$1(schema)) {
    zodSchema = convertSchemaToZod(schema);
  } else {
    zodSchema = schema;
  }
  for (const compat of compatLayers) {
    if (compat.shouldApply()) {
      return mode === "jsonSchema" ? compat.processToJSONSchema(zodSchema) : compat.processToAISDKSchema(zodSchema);
    }
  }
  {
    return convertZodSchemaToAISDKSchema(zodSchema);
  }
}

// src/schema-compatibility-v3.ts
var ALL_STRING_CHECKS = ["regex", "emoji", "email", "url", "uuid", "cuid", "min", "max"];
var ALL_NUMBER_CHECKS = [
  "min",
  // gte internally
  "max",
  // lte internally
  "multipleOf"
];
var ALL_ARRAY_CHECKS = ["min", "max", "length"];
var UNSUPPORTED_ZOD_TYPES = ["ZodIntersection", "ZodNever", "ZodNull", "ZodTuple", "ZodUndefined"];
var SUPPORTED_ZOD_TYPES = [
  "ZodObject",
  "ZodArray",
  "ZodUnion",
  "ZodString",
  "ZodNumber",
  "ZodDate",
  "ZodAny",
  "ZodDefault"
];
var SchemaCompatLayer = class {
  model;
  parent;
  /**
   * Creates a new schema compatibility instance.
   *
   * @param model - The language model this compatibility layer applies to
   */
  constructor(model, parent) {
    this.model = model;
    this.parent = parent;
  }
  /**
   * Gets the language model associated with this compatibility layer.
   *
   * @returns The language model instance
   */
  getModel() {
    return this.model;
  }
  getUnsupportedZodTypes() {
    return UNSUPPORTED_ZOD_TYPES;
  }
  /**
   * Type guard for optional Zod types
   */
  isOptional(v) {
    return v instanceof ZodOptional;
  }
  /**
   * Type guard for object Zod types
   */
  isObj(v) {
    return v instanceof ZodObject;
  }
  /**
   * Type guard for null Zod types
   */
  isNull(v) {
    return v instanceof ZodNull;
  }
  /**
   * Type guard for array Zod types
   */
  isArr(v) {
    return v instanceof ZodArray;
  }
  /**
   * Type guard for union Zod types
   */
  isUnion(v) {
    return v instanceof ZodUnion;
  }
  /**
   * Type guard for string Zod types
   */
  isString(v) {
    return v instanceof ZodString;
  }
  /**
   * Type guard for number Zod types
   */
  isNumber(v) {
    return v instanceof ZodNumber;
  }
  /**
   * Type guard for date Zod types
   */
  isDate(v) {
    return v instanceof ZodDate;
  }
  /**
   * Type guard for default Zod types
   */
  isDefault(v) {
    return v instanceof ZodDefault;
  }
  /**
   * Determines whether this compatibility layer should be applied for the current model.
   *
   * @returns True if this compatibility layer should be used, false otherwise
   * @abstract
   */
  shouldApply() {
    return this.parent.shouldApply();
  }
  /**
   * Returns the JSON Schema target format for this provider.
   *
   * @returns The schema target format, or undefined to use the default 'jsonSchema7'
   * @abstract
   */
  getSchemaTarget() {
    return this.parent.getSchemaTarget();
  }
  /**
   * Processes a specific Zod type according to the provider's requirements.
   *
   * @param value - The Zod type to process
   * @returns The processed Zod type
   * @abstract
   */
  processZodType(value) {
    return this.parent.processZodType(value);
  }
  /**
   * Default handler for Zod object types. Recursively processes all properties in the object.
   *
   * @param value - The Zod object to process
   * @returns The processed Zod object
   */
  defaultZodObjectHandler(value, options = { passthrough: true }) {
    const processedShape = Object.entries(value.shape).reduce((acc, [key, propValue]) => {
      acc[key] = this.processZodType(propValue);
      return acc;
    }, {});
    let result = objectType(processedShape);
    if (value._def.unknownKeys === "strict") {
      result = result.strict();
    }
    if (value._def.catchall && !(value._def.catchall instanceof ZodNever)) {
      result = result.catchall(value._def.catchall);
    }
    if (value.description) {
      result = result.describe(value.description);
    }
    if (options.passthrough && value._def.unknownKeys === "passthrough") {
      result = result.passthrough();
    }
    return result;
  }
  /**
   * Merges validation constraints into a parameter description.
   *
   * This helper method converts validation constraints that may not be supported
   * by a provider into human-readable descriptions.
   *
   * @param description - The existing parameter description
   * @param constraints - The validation constraints to merge
   * @returns The updated description with constraints, or undefined if no constraints
   */
  mergeParameterDescription(description, constraints) {
    if (Object.keys(constraints).length > 0) {
      return (description ? description + "\n" : "") + JSON.stringify(constraints);
    } else {
      return description;
    }
  }
  /**
   * Default handler for unsupported Zod types. Throws an error for specified unsupported types.
   *
   * @param value - The Zod type to check
   * @param throwOnTypes - Array of type names to throw errors for
   * @returns The original value if not in the throw list
   * @throws Error if the type is in the unsupported list
   */
  defaultUnsupportedZodTypeHandler(value, throwOnTypes = UNSUPPORTED_ZOD_TYPES) {
    if (throwOnTypes.includes(value._def?.typeName)) {
      throw new Error(`${this.model.modelId} does not support zod type: ${value._def?.typeName}`);
    }
    return value;
  }
  /**
   * Default handler for Zod array types. Processes array constraints according to provider support.
   *
   * @param value - The Zod array to process
   * @param handleChecks - Array constraints to convert to descriptions vs keep as validation
   * @returns The processed Zod array
   */
  defaultZodArrayHandler(value, handleChecks = ALL_ARRAY_CHECKS) {
    const zodArrayDef = value._def;
    const processedType = this.processZodType(zodArrayDef.type);
    let result = arrayType(processedType);
    const constraints = {};
    if (zodArrayDef.minLength?.value !== void 0) {
      if (handleChecks.includes("min")) {
        constraints.minLength = zodArrayDef.minLength.value;
      } else {
        result = result.min(zodArrayDef.minLength.value);
      }
    }
    if (zodArrayDef.maxLength?.value !== void 0) {
      if (handleChecks.includes("max")) {
        constraints.maxLength = zodArrayDef.maxLength.value;
      } else {
        result = result.max(zodArrayDef.maxLength.value);
      }
    }
    if (zodArrayDef.exactLength?.value !== void 0) {
      if (handleChecks.includes("length")) {
        constraints.exactLength = zodArrayDef.exactLength.value;
      } else {
        result = result.length(zodArrayDef.exactLength.value);
      }
    }
    const description = this.mergeParameterDescription(value.description, constraints);
    if (description) {
      result = result.describe(description);
    }
    return result;
  }
  /**
   * Default handler for Zod union types. Processes all union options.
   *
   * @param value - The Zod union to process
   * @returns The processed Zod union
   * @throws Error if union has fewer than 2 options
   */
  defaultZodUnionHandler(value) {
    const processedOptions = value._def.options.map((option) => this.processZodType(option));
    if (processedOptions.length < 2) throw new Error("Union must have at least 2 options");
    let result = unionType(processedOptions);
    if (value.description) {
      result = result.describe(value.description);
    }
    return result;
  }
  /**
   * Default handler for Zod string types. Processes string validation constraints.
   *
   * @param value - The Zod string to process
   * @param handleChecks - String constraints to convert to descriptions vs keep as validation
   * @returns The processed Zod string
   */
  defaultZodStringHandler(value, handleChecks = ALL_STRING_CHECKS) {
    const constraints = {};
    const checks = value._def.checks || [];
    const newChecks = [];
    for (const check of checks) {
      if ("kind" in check) {
        if (handleChecks.includes(check.kind)) {
          switch (check.kind) {
            case "regex": {
              constraints.regex = {
                pattern: check.regex.source,
                flags: check.regex.flags
              };
              break;
            }
            case "emoji": {
              constraints.emoji = true;
              break;
            }
            case "email": {
              constraints.email = true;
              break;
            }
            case "url": {
              constraints.url = true;
              break;
            }
            case "uuid": {
              constraints.uuid = true;
              break;
            }
            case "cuid": {
              constraints.cuid = true;
              break;
            }
            case "min": {
              constraints.minLength = check.value;
              break;
            }
            case "max": {
              constraints.maxLength = check.value;
              break;
            }
          }
        } else {
          newChecks.push(check);
        }
      }
    }
    let result = stringType();
    for (const check of newChecks) {
      result = result._addCheck(check);
    }
    const description = this.mergeParameterDescription(value.description, constraints);
    if (description) {
      result = result.describe(description);
    }
    return result;
  }
  /**
   * Default handler for Zod number types. Processes number validation constraints.
   *
   * @param value - The Zod number to process
   * @param handleChecks - Number constraints to convert to descriptions vs keep as validation
   * @returns The processed Zod number
   */
  defaultZodNumberHandler(value, handleChecks = ALL_NUMBER_CHECKS) {
    const constraints = {};
    const checks = value._def.checks || [];
    const newChecks = [];
    for (const check of checks) {
      if ("kind" in check) {
        if (handleChecks.includes(check.kind)) {
          switch (check.kind) {
            case "min":
              if (check.inclusive) {
                constraints.gte = check.value;
              } else {
                constraints.gt = check.value;
              }
              break;
            case "max":
              if (check.inclusive) {
                constraints.lte = check.value;
              } else {
                constraints.lt = check.value;
              }
              break;
            case "multipleOf": {
              constraints.multipleOf = check.value;
              break;
            }
          }
        } else {
          newChecks.push(check);
        }
      }
    }
    let result = numberType();
    for (const check of newChecks) {
      switch (check.kind) {
        case "int":
          result = result.int();
          break;
        case "finite":
          result = result.finite();
          break;
        default:
          result = result._addCheck(check);
      }
    }
    const description = this.mergeParameterDescription(value.description, constraints);
    if (description) {
      result = result.describe(description);
    }
    return result;
  }
  /**
   * Default handler for Zod date types. Converts dates to ISO strings with constraint descriptions.
   *
   * @param value - The Zod date to process
   * @returns A Zod string schema representing the date in ISO format
   */
  defaultZodDateHandler(value) {
    const constraints = {};
    const checks = value._def.checks || [];
    for (const check of checks) {
      if ("kind" in check) {
        switch (check.kind) {
          case "min":
            const minDate = new Date(check.value);
            if (!isNaN(minDate.getTime())) {
              constraints.minDate = minDate.toISOString();
            }
            break;
          case "max":
            const maxDate = new Date(check.value);
            if (!isNaN(maxDate.getTime())) {
              constraints.maxDate = maxDate.toISOString();
            }
            break;
        }
      }
    }
    constraints.dateFormat = "date-time";
    let result = stringType().describe("date-time");
    const description = this.mergeParameterDescription(value.description, constraints);
    if (description) {
      result = result.describe(description);
    }
    return result;
  }
  /**
   * Default handler for Zod optional types. Processes the inner type and maintains optionality.
   *
   * @param value - The Zod optional to process
   * @param handleTypes - Types that should be processed vs passed through
   * @returns The processed Zod optional
   */
  defaultZodOptionalHandler(value, handleTypes = SUPPORTED_ZOD_TYPES) {
    if (handleTypes.includes(value._def.innerType._def.typeName)) {
      return this.processZodType(value._def.innerType).optional();
    } else {
      return value;
    }
  }
  /**
   * Processes a Zod object schema and converts it to an AI SDK Schema.
   *
   * @param zodSchema - The Zod object schema to process
   * @returns An AI SDK Schema with provider-specific compatibility applied
   */
  processToAISDKSchema(zodSchema) {
    const processedSchema = this.processZodType(zodSchema);
    return convertZodSchemaToAISDKSchema(processedSchema, this.getSchemaTarget());
  }
  /**
   * Processes a Zod object schema and converts it to a JSON Schema.
   *
   * @param zodSchema - The Zod object schema to process
   * @returns A JSONSchema7 object with provider-specific compatibility applied
   */
  processToJSONSchema(zodSchema) {
    return this.processToAISDKSchema(zodSchema).jsonSchema;
  }
};
var ALL_STRING_CHECKS2 = [
  "regex",
  "emoji",
  "email",
  "url",
  "uuid",
  "cuid",
  "min_length",
  "max_length",
  "string_format"
];
var ALL_NUMBER_CHECKS2 = ["greater_than", "less_than", "multiple_of"];
var ALL_ARRAY_CHECKS2 = ["min", "max", "length"];
var UNSUPPORTED_ZOD_TYPES2 = ["ZodIntersection", "ZodNever", "ZodNull", "ZodTuple", "ZodUndefined"];
var SUPPORTED_ZOD_TYPES2 = [
  "ZodObject",
  "ZodArray",
  "ZodUnion",
  "ZodString",
  "ZodNumber",
  "ZodDate",
  "ZodAny",
  "ZodDefault"
];
var SchemaCompatLayer2 = class {
  model;
  parent;
  /**
   * Creates a new schema compatibility instance.
   *
   * @param model - The language model this compatibility layer applies to
   */
  constructor(model, parent) {
    this.model = model;
    this.parent = parent;
  }
  /**
   * Gets the language model associated with this compatibility layer.
   *
   * @returns The language model instance
   */
  getModel() {
    return this.model;
  }
  getUnsupportedZodTypes() {
    return UNSUPPORTED_ZOD_TYPES2;
  }
  /**
   * Type guard for optional Zod types
   */
  isOptional(v) {
    return v instanceof ZodOptional$1;
  }
  /**
   * Type guard for object Zod types
   */
  isObj(v) {
    return v instanceof ZodObject$1;
  }
  /**
   * Type guard for null Zod types
   */
  isNull(v) {
    return v instanceof ZodNull$1;
  }
  /**
   * Type guard for array Zod types
   */
  isArr(v) {
    return v instanceof ZodArray$1;
  }
  /**
   * Type guard for union Zod types
   */
  isUnion(v) {
    return v instanceof ZodUnion$1;
  }
  /**
   * Type guard for string Zod types
   */
  isString(v) {
    return v instanceof ZodString$1;
  }
  /**
   * Type guard for number Zod types
   */
  isNumber(v) {
    return v instanceof ZodNumber$1;
  }
  /**
   * Type guard for date Zod types
   */
  isDate(v) {
    return v instanceof ZodDate$1;
  }
  /**
   * Type guard for default Zod types
   */
  isDefault(v) {
    return v instanceof ZodDefault$1;
  }
  /**
   * Determines whether this compatibility layer should be applied for the current model.
   *
   * @returns True if this compatibility layer should be used, false otherwise
   * @abstract
   */
  shouldApply() {
    return this.parent.shouldApply();
  }
  /**
   * Returns the JSON Schema target format for this provider.
   *
   * @returns The schema target format, or undefined to use the default 'jsonSchema7'
   * @abstract
   */
  getSchemaTarget() {
    return this.parent.getSchemaTarget();
  }
  /**
   * Processes a specific Zod type according to the provider's requirements.
   *
   * @param value - The Zod type to process
   * @returns The processed Zod type
   * @abstract
   */
  processZodType(value) {
    return this.parent.processZodType(value);
  }
  /**
   * Default handler for Zod object types. Recursively processes all properties in the object.
   *
   * @param value - The Zod object to process
   * @returns The processed Zod object
   */
  defaultZodObjectHandler(value, options = { passthrough: true }) {
    const processedShape = Object.entries(value.shape).reduce((acc, [key, propValue]) => {
      acc[key] = this.processZodType(propValue);
      return acc;
    }, {});
    let result = object(processedShape);
    if (value._zod.def.catchall instanceof ZodNever$1) {
      result = strictObject(processedShape);
    }
    if (value._zod.def.catchall && !(value._zod.def.catchall instanceof ZodNever$1)) {
      result = result.catchall(value._zod.def.catchall);
    }
    if (value.description) {
      result = result.describe(value.description);
    }
    if (options.passthrough && value._zod.def.catchall instanceof ZodUnknown) {
      result = looseObject(processedShape);
    }
    return result;
  }
  /**
   * Merges validation constraints into a parameter description.
   *
   * This helper method converts validation constraints that may not be supported
   * by a provider into human-readable descriptions.
   *
   * @param description - The existing parameter description
   * @param constraints - The validation constraints to merge
   * @returns The updated description with constraints, or undefined if no constraints
   */
  mergeParameterDescription(description, constraints) {
    if (Object.keys(constraints).length > 0) {
      return (description ? description + "\n" : "") + JSON.stringify(constraints);
    } else {
      return description;
    }
  }
  /**
   * Default handler for unsupported Zod types. Throws an error for specified unsupported types.
   *
   * @param value - The Zod type to check
   * @param throwOnTypes - Array of type names to throw errors for
   * @returns The original value if not in the throw list
   * @throws Error if the type is in the unsupported list
   */
  defaultUnsupportedZodTypeHandler(value, throwOnTypes = UNSUPPORTED_ZOD_TYPES2) {
    if (throwOnTypes.includes(value.constructor.name)) {
      throw new Error(`${this.model.modelId} does not support zod type: ${value.constructor.name}`);
    }
    return value;
  }
  /**
   * Default handler for Zod array types. Processes array constraints according to provider support.
   *
   * @param value - The Zod array to process
   * @param handleChecks - Array constraints to convert to descriptions vs keep as validation
   * @returns The processed Zod array
   */
  defaultZodArrayHandler(value, handleChecks = ALL_ARRAY_CHECKS2) {
    const zodArrayDef = value._zod.def;
    const processedType = this.processZodType(zodArrayDef.element);
    let result = array(processedType);
    const constraints = {};
    if (zodArrayDef.checks) {
      for (const check of zodArrayDef.checks) {
        if (check._zod.def.check === "min_length") {
          if (handleChecks.includes("min")) {
            constraints.minLength = check._zod.def.minimum;
          } else {
            result = result.min(check._zod.def.minimum);
          }
        }
        if (check._zod.def.check === "max_length") {
          if (handleChecks.includes("max")) {
            constraints.maxLength = check._zod.def.maximum;
          } else {
            result = result.max(check._zod.def.maximum);
          }
        }
        if (check._zod.def.check === "length_equals") {
          if (handleChecks.includes("length")) {
            constraints.exactLength = check._zod.def.length;
          } else {
            result = result.length(check._zod.def.length);
          }
        }
      }
    }
    const metaDescription = value.meta()?.description;
    const legacyDescription = value.description;
    const description = this.mergeParameterDescription(metaDescription || legacyDescription, constraints);
    if (description) {
      result = result.describe(description);
    }
    return result;
  }
  /**
   * Default handler for Zod union types. Processes all union options.
   *
   * @param value - The Zod union to process
   * @returns The processed Zod union
   * @throws Error if union has fewer than 2 options
   */
  defaultZodUnionHandler(value) {
    const processedOptions = value._zod.def.options.map((option) => this.processZodType(option));
    if (processedOptions.length < 2) throw new Error("Union must have at least 2 options");
    let result = union(processedOptions);
    if (value.description) {
      result = result.describe(value.description);
    }
    return result;
  }
  /**
   * Default handler for Zod string types. Processes string validation constraints.
   *
   * @param value - The Zod string to process
   * @param handleChecks - String constraints to convert to descriptions vs keep as validation
   * @returns The processed Zod string
   */
  defaultZodStringHandler(value, handleChecks = ALL_STRING_CHECKS2) {
    const constraints = {};
    const checks = value._zod.def.checks || [];
    const newChecks = [];
    if (checks) {
      for (const check of checks) {
        if (handleChecks.includes(check._zod.def.check)) {
          switch (check._zod.def.check) {
            case "min_length":
              constraints.minLength = check._zod.def.minimum;
              break;
            case "max_length":
              constraints.maxLength = check._zod.def.maximum;
              break;
            case "string_format":
              {
                switch (check._zod.def.format) {
                  case "email":
                    constraints.email = true;
                    break;
                  case "url":
                    constraints.url = true;
                    break;
                  case "emoji":
                    constraints.emoji = true;
                    break;
                  case "uuid":
                    constraints.uuid = true;
                    break;
                  case "cuid":
                    constraints.cuid = true;
                    break;
                  case "regex":
                    constraints.regex = {
                      // @ts-expect-error - fix later
                      pattern: check._zod.def.pattern,
                      // @ts-expect-error - fix later
                      flags: check._zod.def.flags
                    };
                    break;
                }
              }
              break;
          }
        } else {
          newChecks.push(check);
        }
      }
    }
    let result = string();
    for (const check of newChecks) {
      result = result.check(check);
    }
    const metaDescription = value.meta()?.description;
    const legacyDescription = value.description;
    const description = this.mergeParameterDescription(metaDescription || legacyDescription, constraints);
    if (description) {
      result = result.describe(description);
    }
    return result;
  }
  /**
   * Default handler for Zod number types. Processes number validation constraints.
   *
   * @param value - The Zod number to process
   * @param handleChecks - Number constraints to convert to descriptions vs keep as validation
   * @returns The processed Zod number
   */
  defaultZodNumberHandler(value, handleChecks = ALL_NUMBER_CHECKS2) {
    const constraints = {};
    const checks = value._zod.def.checks || [];
    const newChecks = [];
    if (checks) {
      for (const check of checks) {
        if (handleChecks.includes(check._zod.def.check)) {
          switch (check._zod.def.check) {
            case "greater_than":
              if (check._zod.def.inclusive) {
                constraints.gte = check._zod.def.value;
              } else {
                constraints.gt = check._zod.def.value;
              }
              break;
            case "less_than":
              if (check._zod.def.inclusive) {
                constraints.lte = check._zod.def.value;
              } else {
                constraints.lt = check._zod.def.value;
              }
              break;
            case "multiple_of": {
              constraints.multipleOf = check._zod.def.value;
              break;
            }
          }
        } else {
          newChecks.push(check);
        }
      }
    }
    let result = number();
    for (const check of newChecks) {
      switch (check._zod.def.check) {
        case "number_format": {
          switch (check._zod.def.format) {
            case "safeint":
              result = result.int();
              break;
          }
          break;
        }
        default:
          result = result.check(check);
      }
    }
    const description = this.mergeParameterDescription(value.description, constraints);
    if (description) {
      result = result.describe(description);
    }
    return result;
  }
  /**
   * Default handler for Zod date types. Converts dates to ISO strings with constraint descriptions.
   *
   * @param value - The Zod date to process
   * @returns A Zod string schema representing the date in ISO format
   */
  defaultZodDateHandler(value) {
    const constraints = {};
    const checks = value._zod.def.checks || [];
    if (checks) {
      for (const check of checks) {
        switch (check._zod.def.check) {
          case "less_than":
            const minDate = new Date(check._zod.def.value);
            if (!isNaN(minDate.getTime())) {
              constraints.minDate = minDate.toISOString();
            }
            break;
          case "greater_than":
            const maxDate = new Date(check._zod.def.value);
            if (!isNaN(maxDate.getTime())) {
              constraints.maxDate = maxDate.toISOString();
            }
            break;
        }
      }
    }
    constraints.dateFormat = "date-time";
    let result = string().describe("date-time");
    const description = this.mergeParameterDescription(value.description, constraints);
    if (description) {
      result = result.describe(description);
    }
    return result;
  }
  /**
   * Default handler for Zod optional types. Processes the inner type and maintains optionality.
   *
   * @param value - The Zod optional to process
   * @param handleTypes - Types that should be processed vs passed through
   * @returns The processed Zod optional
   */
  defaultZodOptionalHandler(value, handleTypes = SUPPORTED_ZOD_TYPES2) {
    if (handleTypes.includes(value.constructor.name)) {
      return this.processZodType(value._zod.def.innerType).optional();
    } else {
      return value;
    }
  }
  /**
   * Processes a Zod object schema and converts it to an AI SDK Schema.
   *
   * @param zodSchema - The Zod object schema to process
   * @returns An AI SDK Schema with provider-specific compatibility applied
   */
  processToAISDKSchema(zodSchema) {
    const processedSchema = this.processZodType(zodSchema);
    return convertZodSchemaToAISDKSchema(processedSchema, this.getSchemaTarget());
  }
  /**
   * Processes a Zod object schema and converts it to a JSON Schema.
   *
   * @param zodSchema - The Zod object schema to process
   * @returns A JSONSchema7 object with provider-specific compatibility applied
   */
  processToJSONSchema(zodSchema) {
    return this.processToAISDKSchema(zodSchema).jsonSchema;
  }
};

// src/schema-compatibility.ts
var SchemaCompatLayer3 = class {
  model;
  v3Layer;
  v4Layer;
  /**
   * Creates a new schema compatibility instance.
   *
   * @param model - The language model this compatibility layer applies to
   */
  constructor(model) {
    this.model = model;
    this.v3Layer = new SchemaCompatLayer(model, this);
    this.v4Layer = new SchemaCompatLayer2(model, this);
  }
  /**
   * Gets the language model associated with this compatibility layer.
   *
   * @returns The language model instance
   */
  getModel() {
    return this.model;
  }
  getUnsupportedZodTypes(v) {
    if ("_zod" in v) {
      return this.v4Layer.getUnsupportedZodTypes();
    } else {
      return this.v3Layer.getUnsupportedZodTypes();
    }
  }
  isOptional(v) {
    if ("_zod" in v) {
      return this.v4Layer.isOptional(v);
    } else {
      return this.v3Layer.isOptional(v);
    }
  }
  isObj(v) {
    if ("_zod" in v) {
      return this.v4Layer.isObj(v);
    } else {
      return this.v3Layer.isObj(v);
    }
  }
  isNull(v) {
    if ("_zod" in v) {
      return this.v4Layer.isNull(v);
    } else {
      return this.v3Layer.isNull(v);
    }
  }
  isArr(v) {
    if ("_zod" in v) {
      return this.v4Layer.isArr(v);
    } else {
      return this.v3Layer.isArr(v);
    }
  }
  isUnion(v) {
    if ("_zod" in v) {
      return this.v4Layer.isUnion(v);
    } else {
      return this.v3Layer.isUnion(v);
    }
  }
  isString(v) {
    if ("_zod" in v) {
      return this.v4Layer.isString(v);
    } else {
      return this.v3Layer.isString(v);
    }
  }
  isNumber(v) {
    if ("_zod" in v) {
      return this.v4Layer.isNumber(v);
    } else {
      return this.v3Layer.isNumber(v);
    }
  }
  isDate(v) {
    if ("_zod" in v) {
      return this.v4Layer.isDate(v);
    } else {
      return this.v3Layer.isDate(v);
    }
  }
  isDefault(v) {
    if ("_zod" in v) {
      return this.v4Layer.isDefault(v);
    } else {
      return this.v3Layer.isDefault(v);
    }
  }
  defaultZodObjectHandler(value, options = { passthrough: true }) {
    if ("_zod" in value) {
      return this.v4Layer.defaultZodObjectHandler(value, options);
    } else {
      return this.v3Layer.defaultZodObjectHandler(value, options);
    }
  }
  /**
   * Merges validation constraints into a parameter description.
   *
   * This helper method converts validation constraints that may not be supported
   * by a provider into human-readable descriptions.
   *
   * @param description - The existing parameter description
   * @param constraints - The validation constraints to merge
   * @returns The updated description with constraints, or undefined if no constraints
   */
  mergeParameterDescription(description, constraints) {
    return this.v3Layer.mergeParameterDescription(description, constraints);
  }
  /**
   * Default handler for unsupported Zod types. Throws an error for specified unsupported types.
   *
   * @param value - The Zod type to check
   * @param throwOnTypes - Array of type names to throw errors for
   * @returns The original value if not in the throw list
   * @throws Error if the type is in the unsupported list
   */
  defaultUnsupportedZodTypeHandler(value, throwOnTypes) {
    if ("_zod" in value) {
      return this.v4Layer.defaultUnsupportedZodTypeHandler(
        // @ts-expect-error - fix later
        value,
        throwOnTypes ?? UNSUPPORTED_ZOD_TYPES2
      );
    } else {
      return this.v3Layer.defaultUnsupportedZodTypeHandler(
        value,
        throwOnTypes ?? UNSUPPORTED_ZOD_TYPES
      );
    }
  }
  defaultZodArrayHandler(value, handleChecks = ALL_ARRAY_CHECKS) {
    if ("_zod" in value) {
      return this.v4Layer.defaultZodArrayHandler(value, handleChecks);
    } else {
      return this.v3Layer.defaultZodArrayHandler(value, handleChecks);
    }
  }
  defaultZodUnionHandler(value) {
    if ("_zod" in value) {
      return this.v4Layer.defaultZodUnionHandler(value);
    } else {
      return this.v3Layer.defaultZodUnionHandler(value);
    }
  }
  defaultZodStringHandler(value, handleChecks = ALL_STRING_CHECKS) {
    if ("_zod" in value) {
      return this.v4Layer.defaultZodStringHandler(value);
    } else {
      return this.v3Layer.defaultZodStringHandler(value, handleChecks);
    }
  }
  defaultZodNumberHandler(value, handleChecks = ALL_NUMBER_CHECKS) {
    if ("_zod" in value) {
      return this.v4Layer.defaultZodNumberHandler(value);
    } else {
      return this.v3Layer.defaultZodNumberHandler(value, handleChecks);
    }
  }
  defaultZodDateHandler(value) {
    if ("_zod" in value) {
      return this.v4Layer.defaultZodDateHandler(value);
    } else {
      return this.v3Layer.defaultZodDateHandler(value);
    }
  }
  defaultZodOptionalHandler(value, handleTypes) {
    if ("_zod" in value) {
      return this.v4Layer.defaultZodOptionalHandler(value, handleTypes ?? SUPPORTED_ZOD_TYPES2);
    } else {
      return this.v3Layer.defaultZodOptionalHandler(value, handleTypes ?? SUPPORTED_ZOD_TYPES);
    }
  }
  /**
   * Processes a Zod object schema and converts it to an AI SDK Schema.
   *
   * @param zodSchema - The Zod object schema to process
   * @returns An AI SDK Schema with provider-specific compatibility applied
   */
  processToAISDKSchema(zodSchema) {
    const processedSchema = this.processZodType(zodSchema);
    return convertZodSchemaToAISDKSchema(processedSchema, this.getSchemaTarget());
  }
  /**
   * Processes a Zod object schema and converts it to a JSON Schema.
   *
   * @param zodSchema - The Zod object schema to process
   * @returns A JSONSchema7 object with provider-specific compatibility applied
   */
  processToJSONSchema(zodSchema) {
    return this.processToAISDKSchema(zodSchema).jsonSchema;
  }
};

// src/zodTypes.ts
function isOptional2(z10) {
  return (v) => v instanceof z10["ZodOptional"];
}
function isObj2(z10) {
  return (v) => v instanceof z10["ZodObject"];
}
function isNull(z10) {
  return (v) => v instanceof z10["ZodNull"];
}
function isArr2(z10) {
  return (v) => v instanceof z10["ZodArray"];
}
function isUnion2(z10) {
  return (v) => v instanceof z10["ZodUnion"];
}
function isString2(z10) {
  return (v) => v instanceof z10["ZodString"];
}
function isNumber2(z10) {
  return (v) => v instanceof z10["ZodNumber"];
}
function isDate(z10) {
  return (v) => v instanceof z10["ZodDate"];
}
function isDefault(z10) {
  return (v) => v instanceof z10["ZodDefault"];
}

// src/provider-compats/anthropic.ts
var AnthropicSchemaCompatLayer = class extends SchemaCompatLayer3 {
  constructor(model) {
    super(model);
  }
  getSchemaTarget() {
    return "jsonSchema7";
  }
  shouldApply() {
    return this.getModel().modelId.includes("claude");
  }
  processZodType(value) {
    if (isOptional2(z)(value)) {
      const handleTypes = [
        "ZodObject",
        "ZodArray",
        "ZodUnion",
        "ZodNever",
        "ZodUndefined",
        "ZodTuple"
      ];
      if (this.getModel().modelId.includes("claude-3.5-haiku")) handleTypes.push("ZodString");
      return this.defaultZodOptionalHandler(value, handleTypes);
    } else if (isObj2(z)(value)) {
      return this.defaultZodObjectHandler(value);
    } else if (isArr2(z)(value)) {
      return this.defaultZodArrayHandler(value, []);
    } else if (isUnion2(z)(value)) {
      return this.defaultZodUnionHandler(value);
    } else if (isString2(z)(value)) {
      if (this.getModel().modelId.includes("claude-3.5-haiku")) {
        return this.defaultZodStringHandler(value, ["max", "min"]);
      } else {
        return value;
      }
    }
    return this.defaultUnsupportedZodTypeHandler(value, [
      "ZodNever",
      "ZodTuple",
      "ZodUndefined"
    ]);
  }
};
var DeepSeekSchemaCompatLayer = class extends SchemaCompatLayer3 {
  constructor(model) {
    super(model);
  }
  getSchemaTarget() {
    return "jsonSchema7";
  }
  shouldApply() {
    return this.getModel().modelId.includes("deepseek") && !this.getModel().modelId.includes("r1");
  }
  processZodType(value) {
    if (isOptional2(z)(value)) {
      return this.defaultZodOptionalHandler(value, ["ZodObject", "ZodArray", "ZodUnion", "ZodString", "ZodNumber"]);
    } else if (isObj2(z)(value)) {
      return this.defaultZodObjectHandler(value);
    } else if (isArr2(z)(value)) {
      return this.defaultZodArrayHandler(value, ["min", "max"]);
    } else if (isUnion2(z)(value)) {
      return this.defaultZodUnionHandler(value);
    } else if (isString2(z)(value)) {
      return this.defaultZodStringHandler(value);
    }
    return value;
  }
};
var GoogleSchemaCompatLayer = class extends SchemaCompatLayer3 {
  constructor(model) {
    super(model);
  }
  getSchemaTarget() {
    return "jsonSchema7";
  }
  shouldApply() {
    return this.getModel().provider.includes("google") || this.getModel().modelId.includes("google");
  }
  processZodType(value) {
    if (isOptional2(z)(value)) {
      return this.defaultZodOptionalHandler(value, ["ZodObject", "ZodArray", "ZodUnion", "ZodString", "ZodNumber"]);
    } else if (isNull(z)(value)) {
      return anyType().refine((v) => v === null, { message: "must be null" }).describe(value.description || "must be null");
    } else if (isObj2(z)(value)) {
      return this.defaultZodObjectHandler(value);
    } else if (isArr2(z)(value)) {
      return this.defaultZodArrayHandler(value, []);
    } else if (isUnion2(z)(value)) {
      return this.defaultZodUnionHandler(value);
    } else if (isString2(z)(value)) {
      return this.defaultZodStringHandler(value);
    } else if (isNumber2(z)(value)) {
      return this.defaultZodNumberHandler(value);
    }
    return this.defaultUnsupportedZodTypeHandler(value);
  }
};
var MetaSchemaCompatLayer = class extends SchemaCompatLayer3 {
  constructor(model) {
    super(model);
  }
  getSchemaTarget() {
    return "jsonSchema7";
  }
  shouldApply() {
    return this.getModel().modelId.includes("meta");
  }
  processZodType(value) {
    if (isOptional2(z)(value)) {
      return this.defaultZodOptionalHandler(value, ["ZodObject", "ZodArray", "ZodUnion", "ZodString", "ZodNumber"]);
    } else if (isObj2(z)(value)) {
      return this.defaultZodObjectHandler(value);
    } else if (isArr2(z)(value)) {
      return this.defaultZodArrayHandler(value, ["min", "max"]);
    } else if (isUnion2(z)(value)) {
      return this.defaultZodUnionHandler(value);
    } else if (isNumber2(z)(value)) {
      return this.defaultZodNumberHandler(value);
    } else if (isString2(z)(value)) {
      return this.defaultZodStringHandler(value);
    }
    return value;
  }
};
var OpenAISchemaCompatLayer = class extends SchemaCompatLayer3 {
  constructor(model) {
    super(model);
  }
  getSchemaTarget() {
    return `jsonSchema7`;
  }
  shouldApply() {
    if (!this.getModel().supportsStructuredOutputs && (this.getModel().provider.includes(`openai`) || this.getModel().modelId.includes(`openai`))) {
      return true;
    }
    return false;
  }
  processZodType(value) {
    if (isOptional2(z)(value)) {
      return this.defaultZodOptionalHandler(value, [
        "ZodObject",
        "ZodArray",
        "ZodUnion",
        "ZodString",
        "ZodNever",
        "ZodUndefined",
        "ZodTuple"
      ]);
    } else if (isObj2(z)(value)) {
      return this.defaultZodObjectHandler(value);
    } else if (isUnion2(z)(value)) {
      return this.defaultZodUnionHandler(value);
    } else if (isArr2(z)(value)) {
      return this.defaultZodArrayHandler(value);
    } else if (isString2(z)(value)) {
      const model = this.getModel();
      const checks = ["emoji"];
      if (model.modelId.includes("gpt-4o-mini")) {
        return this.defaultZodStringHandler(value, ["emoji", "regex"]);
      }
      return this.defaultZodStringHandler(value, checks);
    }
    return this.defaultUnsupportedZodTypeHandler(value, [
      "ZodNever",
      "ZodUndefined",
      "ZodTuple"
    ]);
  }
};
var OpenAIReasoningSchemaCompatLayer = class extends SchemaCompatLayer3 {
  constructor(model) {
    super(model);
  }
  getSchemaTarget() {
    return `openApi3`;
  }
  isReasoningModel() {
    return this.getModel().modelId.includes(`o3`) || this.getModel().modelId.includes(`o4`) || this.getModel().modelId.includes(`o1`);
  }
  shouldApply() {
    if ((this.getModel().supportsStructuredOutputs || this.isReasoningModel()) && (this.getModel().provider.includes(`openai`) || this.getModel().modelId.includes(`openai`))) {
      return true;
    }
    return false;
  }
  processZodType(value) {
    if (isOptional2(z)(value)) {
      const innerZodType = this.processZodType(value._def.innerType);
      return innerZodType.nullable();
    } else if (isObj2(z)(value)) {
      return this.defaultZodObjectHandler(value, { passthrough: false });
    } else if (isArr2(z)(value)) {
      return this.defaultZodArrayHandler(value);
    } else if (isUnion2(z)(value)) {
      return this.defaultZodUnionHandler(value);
    } else if (isDefault(z)(value)) {
      const defaultDef = value._def;
      const innerType = defaultDef.innerType;
      const defaultValue = typeof defaultDef.defaultValue === "function" ? defaultDef.defaultValue() : defaultDef.defaultValue;
      const constraints = {};
      if (defaultValue !== void 0) {
        constraints.defaultValue = defaultValue;
      }
      const description = this.mergeParameterDescription(value.description, constraints);
      let result = this.processZodType(innerType);
      if (description) {
        result = result.describe(description);
      }
      return result;
    } else if (isNumber2(z)(value)) {
      return this.defaultZodNumberHandler(value);
    } else if (isString2(z)(value)) {
      return this.defaultZodStringHandler(value);
    } else if (isDate(z)(value)) {
      return this.defaultZodDateHandler(value);
    } else if (value.constructor.name === "ZodAny") {
      return stringType().describe(
        (value.description ?? "") + `
Argument was an "any" type, but you (the LLM) do not support "any", so it was cast to a "string" type`
      );
    }
    return this.defaultUnsupportedZodTypeHandler(value);
  }
};

// src/ai-tracing/types.ts
var AISpanType = /* @__PURE__ */ ((AISpanType2) => {
  AISpanType2["AGENT_RUN"] = "agent_run";
  AISpanType2["GENERIC"] = "generic";
  AISpanType2["LLM_GENERATION"] = "llm_generation";
  AISpanType2["LLM_CHUNK"] = "llm_chunk";
  AISpanType2["MCP_TOOL_CALL"] = "mcp_tool_call";
  AISpanType2["TOOL_CALL"] = "tool_call";
  AISpanType2["WORKFLOW_RUN"] = "workflow_run";
  AISpanType2["WORKFLOW_STEP"] = "workflow_step";
  AISpanType2["WORKFLOW_CONDITIONAL"] = "workflow_conditional";
  AISpanType2["WORKFLOW_CONDITIONAL_EVAL"] = "workflow_conditional_eval";
  AISpanType2["WORKFLOW_PARALLEL"] = "workflow_parallel";
  AISpanType2["WORKFLOW_LOOP"] = "workflow_loop";
  AISpanType2["WORKFLOW_SLEEP"] = "workflow_sleep";
  AISpanType2["WORKFLOW_WAIT_EVENT"] = "workflow_wait_event";
  return AISpanType2;
})(AISpanType || {});

// src/ai-tracing/spans/base.ts
function isSpanInternal(spanType, flags) {
  if (flags === void 0 || flags === 0 /* NONE */) {
    return false;
  }
  switch (spanType) {
    // Workflow-related spans
    case "workflow_run" /* WORKFLOW_RUN */:
    case "workflow_step" /* WORKFLOW_STEP */:
    case "workflow_conditional" /* WORKFLOW_CONDITIONAL */:
    case "workflow_conditional_eval" /* WORKFLOW_CONDITIONAL_EVAL */:
    case "workflow_parallel" /* WORKFLOW_PARALLEL */:
    case "workflow_loop" /* WORKFLOW_LOOP */:
    case "workflow_sleep" /* WORKFLOW_SLEEP */:
    case "workflow_wait_event" /* WORKFLOW_WAIT_EVENT */:
      return (flags & 1 /* WORKFLOW */) !== 0;
    // Agent-related spans
    case "agent_run" /* AGENT_RUN */:
      return (flags & 2 /* AGENT */) !== 0;
    // Tool-related spans
    case "tool_call" /* TOOL_CALL */:
    case "mcp_tool_call" /* MCP_TOOL_CALL */:
      return (flags & 4 /* TOOL */) !== 0;
    // LLM-related spans
    case "llm_generation" /* LLM_GENERATION */:
    case "llm_chunk" /* LLM_CHUNK */:
      return (flags & 8 /* LLM */) !== 0;
    // Default: never internal
    default:
      return false;
  }
}
var BaseAISpan = class {
  name;
  type;
  attributes;
  parent;
  startTime;
  endTime;
  isEvent;
  isInternal;
  aiTracing;
  input;
  output;
  errorInfo;
  metadata;
  constructor(options, aiTracing) {
    this.name = options.name;
    this.type = options.type;
    this.attributes = deepClean(options.attributes) || {};
    this.metadata = deepClean(options.metadata);
    this.parent = options.parent;
    this.startTime = /* @__PURE__ */ new Date();
    this.aiTracing = aiTracing;
    this.isEvent = options.isEvent ?? false;
    this.isInternal = isSpanInternal(this.type, options.tracingPolicy?.internal);
    if (this.isEvent) {
      this.output = deepClean(options.output);
    } else {
      this.input = deepClean(options.input);
    }
  }
  createChildSpan(options) {
    return this.aiTracing.startSpan({ ...options, parent: this, isEvent: false });
  }
  createEventSpan(options) {
    return this.aiTracing.startSpan({ ...options, parent: this, isEvent: true });
  }
  /** Returns `TRUE` if the span is the root span of a trace */
  get isRootSpan() {
    return !this.parent;
  }
  /** Get the closest parent spanId that isn't an internal span */
  getParentSpanId(includeInternalSpans) {
    if (!this.parent) return void 0;
    if (includeInternalSpans) return this.parent.id;
    if (this.parent.isInternal) return this.parent.getParentSpanId(includeInternalSpans);
    return this.parent.id;
  }
  /** Returns a lightweight span ready for export */
  exportSpan(includeInternalSpans) {
    return {
      id: this.id,
      traceId: this.traceId,
      name: this.name,
      type: this.type,
      attributes: this.attributes,
      metadata: this.metadata,
      startTime: this.startTime,
      endTime: this.endTime,
      input: this.input,
      output: this.output,
      errorInfo: this.errorInfo,
      isEvent: this.isEvent,
      isRootSpan: this.isRootSpan,
      parentSpanId: this.getParentSpanId(includeInternalSpans)
    };
  }
};
var DEFAULT_KEYS_TO_STRIP = /* @__PURE__ */ new Set([
  "logger",
  "experimental_providerMetadata",
  "providerMetadata",
  "steps",
  "tracingContext"
]);
function deepClean(value, options = {}, _seen = /* @__PURE__ */ new WeakSet(), _depth = 0) {
  const { keysToStrip = DEFAULT_KEYS_TO_STRIP, maxDepth = 10 } = options;
  if (_depth > maxDepth) {
    return "[MaxDepth]";
  }
  if (value === null || typeof value !== "object") {
    try {
      JSON.stringify(value);
      return value;
    } catch (error) {
      return `[${error instanceof Error ? error.message : String(error)}]`;
    }
  }
  if (_seen.has(value)) {
    return "[Circular]";
  }
  _seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => deepClean(item, options, _seen, _depth + 1));
  }
  const cleaned = {};
  for (const [key, val] of Object.entries(value)) {
    if (keysToStrip.has(key)) {
      continue;
    }
    try {
      cleaned[key] = deepClean(val, options, _seen, _depth + 1);
    } catch (error) {
      cleaned[key] = `[${error instanceof Error ? error.message : String(error)}]`;
    }
  }
  return cleaned;
}

// src/ai-tracing/spans/default.ts
var DefaultAISpan = class extends BaseAISpan {
  id;
  traceId;
  constructor(options, aiTracing) {
    super(options, aiTracing);
    this.id = generateSpanId();
    if (!options.parent) {
      this.traceId = generateTraceId();
    } else {
      this.traceId = options.parent.traceId;
    }
  }
  end(options) {
    if (this.isEvent) {
      return;
    }
    this.endTime = /* @__PURE__ */ new Date();
    if (options?.output !== void 0) {
      this.output = deepClean(options.output);
    }
    if (options?.attributes) {
      this.attributes = { ...this.attributes, ...deepClean(options.attributes) };
    }
    if (options?.metadata) {
      this.metadata = { ...this.metadata, ...deepClean(options.metadata) };
    }
  }
  error(options) {
    if (this.isEvent) {
      return;
    }
    const { error, endSpan = true, attributes, metadata } = options;
    this.errorInfo = error instanceof MastraError ? {
      id: error.id,
      details: error.details,
      category: error.category,
      domain: error.domain,
      message: error.message
    } : {
      message: error.message
    };
    if (attributes) {
      this.attributes = { ...this.attributes, ...deepClean(attributes) };
    }
    if (metadata) {
      this.metadata = { ...this.metadata, ...deepClean(metadata) };
    }
    if (endSpan) {
      this.end();
    } else {
      this.update({});
    }
  }
  update(options) {
    if (this.isEvent) {
      return;
    }
    if (options.input !== void 0) {
      this.input = deepClean(options.input);
    }
    if (options.output !== void 0) {
      this.output = deepClean(options.output);
    }
    if (options.attributes) {
      this.attributes = { ...this.attributes, ...deepClean(options.attributes) };
    }
    if (options.metadata) {
      this.metadata = { ...this.metadata, ...deepClean(options.metadata) };
    }
  }
  get isValid() {
    return true;
  }
  async export() {
    return JSON.stringify({
      spanId: this.id,
      traceId: this.traceId,
      startTime: this.startTime,
      endTime: this.endTime,
      attributes: this.attributes,
      metadata: this.metadata
    });
  }
};
function generateSpanId() {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 8; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function generateTraceId() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// src/ai-tracing/spans/no-op.ts
var NoOpAISpan = class extends BaseAISpan {
  id;
  traceId;
  constructor(options, aiTracing) {
    super(options, aiTracing);
    this.id = "no-op";
    this.traceId = "no-op-trace";
  }
  end(_options) {
  }
  error(_options) {
  }
  update(_options) {
  }
  get isValid() {
    return false;
  }
};

// src/ai-tracing/tracers/base.ts
var BaseAITracing = class extends MastraBase {
  config;
  constructor(config) {
    super({ component: RegisteredLogger.AI_TRACING, name: config.serviceName });
    this.config = {
      serviceName: config.serviceName,
      name: config.name,
      sampling: config.sampling ?? { type: "always" /* ALWAYS */ },
      exporters: config.exporters ?? [],
      processors: config.processors ?? [],
      includeInternalSpans: config.includeInternalSpans ?? false
    };
  }
  /**
   * Override setLogger to add AI tracing specific initialization log
   */
  __setLogger(logger) {
    super.__setLogger(logger);
    this.logger.debug(
      `[AI Tracing] Initialized [service=${this.config.serviceName}] [instance=${this.config.name}] [sampling=${this.config.sampling.type}]`
    );
  }
  // ============================================================================
  // Protected getters for clean config access
  // ============================================================================
  get exporters() {
    return this.config.exporters || [];
  }
  get processors() {
    return this.config.processors || [];
  }
  // ============================================================================
  // Public API - Single type-safe span creation method
  // ============================================================================
  /**
   * Start a new span of a specific AISpanType
   */
  startSpan(options) {
    const { customSamplerOptions, ...createSpanOptions } = options;
    if (!this.shouldSample(customSamplerOptions)) {
      return new NoOpAISpan(createSpanOptions, this);
    }
    const span = this.createSpan(createSpanOptions);
    if (span.isEvent) {
      this.emitSpanEnded(span);
    } else {
      this.wireSpanLifecycle(span);
      this.emitSpanStarted(span);
    }
    return span;
  }
  // ============================================================================
  // Configuration Management
  // ============================================================================
  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }
  // ============================================================================
  // Plugin Access
  // ============================================================================
  /**
   * Get all exporters
   */
  getExporters() {
    return [...this.exporters];
  }
  /**
   * Get all processors
   */
  getProcessors() {
    return [...this.processors];
  }
  /**
   * Get the logger instance (for exporters and other components)
   */
  getLogger() {
    return this.logger;
  }
  // ============================================================================
  // Span Lifecycle Management
  // ============================================================================
  /**
   * Automatically wires up AI tracing lifecycle events for any span
   * This ensures all spans emit events regardless of implementation
   */
  wireSpanLifecycle(span) {
    if (!this.config.includeInternalSpans && span.isInternal) {
      return;
    }
    const originalEnd = span.end.bind(span);
    const originalUpdate = span.update.bind(span);
    span.end = (options) => {
      if (span.isEvent) {
        this.logger.warn(`End event is not available on event spans`);
        return;
      }
      originalEnd(options);
      this.emitSpanEnded(span);
    };
    span.update = (options) => {
      if (span.isEvent) {
        this.logger.warn(`Update() is not available on event spans`);
        return;
      }
      originalUpdate(options);
      this.emitSpanUpdated(span);
    };
  }
  // ============================================================================
  // Utility Methods
  // ============================================================================
  /**
   * Check if an AI trace should be sampled
   */
  shouldSample(options) {
    const { sampling } = this.config;
    switch (sampling.type) {
      case "always" /* ALWAYS */:
        return true;
      case "never" /* NEVER */:
        return false;
      case "ratio" /* RATIO */:
        if (sampling.probability === void 0 || sampling.probability < 0 || sampling.probability > 1) {
          this.logger.warn(
            `Invalid sampling probability: ${sampling.probability}. Expected value between 0 and 1. Defaulting to no sampling.`
          );
          return false;
        }
        return Math.random() < sampling.probability;
      case "custom" /* CUSTOM */:
        return sampling.sampler(options);
      default:
        throw new Error(`Sampling strategy type not implemented: ${sampling.type}`);
    }
  }
  /**
   * Process a span through all processors
   */
  processSpan(span) {
    for (const processor of this.processors) {
      if (!span) {
        break;
      }
      try {
        span = processor.process(span);
      } catch (error) {
        this.logger.error(`[AI Tracing] Processor error [name=${processor.name}]`, error);
      }
    }
    return span;
  }
  // ============================================================================
  // Event-driven Export Methods
  // ============================================================================
  getSpanForExport(span) {
    if (!span.isValid) return void 0;
    if (span.isInternal && !this.config.includeInternalSpans) return void 0;
    const processedSpan = this.processSpan(span);
    return processedSpan?.exportSpan(this.config.includeInternalSpans);
  }
  /**
   * Emit a span started event
   */
  emitSpanStarted(span) {
    const exportedSpan = this.getSpanForExport(span);
    if (exportedSpan) {
      this.exportEvent({ type: "span_started" /* SPAN_STARTED */, exportedSpan }).catch((error) => {
        this.logger.error("[AI Tracing] Failed to export span_started event", error);
      });
    }
  }
  /**
   * Emit a span ended event (called automatically when spans end)
   */
  emitSpanEnded(span) {
    const exportedSpan = this.getSpanForExport(span);
    if (exportedSpan) {
      this.exportEvent({ type: "span_ended" /* SPAN_ENDED */, exportedSpan }).catch((error) => {
        this.logger.error("[AI Tracing] Failed to export span_ended event", error);
      });
    }
  }
  /**
   * Emit a span updated event
   */
  emitSpanUpdated(span) {
    const exportedSpan = this.getSpanForExport(span);
    if (exportedSpan) {
      this.exportEvent({ type: "span_updated" /* SPAN_UPDATED */, exportedSpan }).catch((error) => {
        this.logger.error("[AI Tracing] Failed to export span_updated event", error);
      });
    }
  }
  /**
   * Export tracing event through all exporters (realtime mode)
   */
  async exportEvent(event) {
    const exportPromises = this.exporters.map(async (exporter) => {
      try {
        if (exporter.exportEvent) {
          await exporter.exportEvent(event);
          this.logger.debug(`[AI Tracing] Event exported [exporter=${exporter.name}] [type=${event.type}]`);
        }
      } catch (error) {
        this.logger.error(`[AI Tracing] Export error [exporter=${exporter.name}]`, error);
      }
    });
    await Promise.allSettled(exportPromises);
  }
  // ============================================================================
  // Lifecycle Management
  // ============================================================================
  /**
   * Initialize AI tracing (called by Mastra during component registration)
   */
  init() {
    this.logger.debug(`[AI Tracing] Initialization started [name=${this.name}]`);
    this.logger.info(`[AI Tracing] Initialized successfully [name=${this.name}]`);
  }
  /**
   * Shutdown AI tracing and clean up resources
   */
  async shutdown() {
    this.logger.debug(`[AI Tracing] Shutdown started [name=${this.name}]`);
    const shutdownPromises = [...this.exporters.map((e) => e.shutdown()), ...this.processors.map((p) => p.shutdown())];
    await Promise.allSettled(shutdownPromises);
    this.logger.info(`[AI Tracing] Shutdown completed [name=${this.name}]`);
  }
};

// src/ai-tracing/tracers/default.ts
var DefaultAITracing = class extends BaseAITracing {
  constructor(config) {
    super(config);
  }
  createSpan(options) {
    return new DefaultAISpan(options, this);
  }
};
var CoreToolBuilder = class extends MastraBase {
  originalTool;
  options;
  logType;
  constructor(input) {
    super({ name: "CoreToolBuilder" });
    this.originalTool = input.originalTool;
    this.options = input.options;
    this.logType = input.logType;
  }
  // Helper to get parameters based on tool type
  getParameters = () => {
    if (isVercelTool(this.originalTool)) {
      return this.originalTool.parameters ?? objectType({});
    }
    return this.originalTool.inputSchema ?? objectType({});
  };
  getOutputSchema = () => {
    if ("outputSchema" in this.originalTool) return this.originalTool.outputSchema;
    return null;
  };
  // For provider-defined tools, we need to include all required properties
  buildProviderTool(tool) {
    if ("type" in tool && tool.type === "provider-defined" && "id" in tool && typeof tool.id === "string" && tool.id.includes(".")) {
      const parameters = this.getParameters();
      const outputSchema = this.getOutputSchema();
      return {
        type: "provider-defined",
        id: tool.id,
        args: "args" in this.originalTool ? this.originalTool.args : {},
        description: tool.description,
        parameters: convertZodSchemaToAISDKSchema(parameters),
        ...outputSchema ? { outputSchema: convertZodSchemaToAISDKSchema(outputSchema) } : {},
        execute: this.originalTool.execute ? this.createExecute(
          this.originalTool,
          { ...this.options, description: this.originalTool.description },
          this.logType
        ) : void 0
      };
    }
    return void 0;
  }
  createLogMessageOptions({ agentName, toolName, type }) {
    if (!agentName) {
      return {
        start: `Executing tool ${toolName}`,
        error: `Failed tool execution`
      };
    }
    const prefix = `[Agent:${agentName}]`;
    const toolType = type === "toolset" ? "toolset" : "tool";
    return {
      start: `${prefix} - Executing ${toolType} ${toolName}`,
      error: `${prefix} - Failed ${toolType} execution`
    };
  }
  createExecute(tool, options, logType) {
    const { logger, mastra: _mastra, memory: _memory, runtimeContext, ...rest } = options;
    const { start, error } = this.createLogMessageOptions({
      agentName: options.agentName,
      toolName: options.name,
      type: logType
    });
    const execFunction = async (args, execOptions) => {
      const toolSpan = options.tracingContext?.currentSpan?.createChildSpan({
        type: "tool_call" /* TOOL_CALL */,
        name: `tool: '${options.name}'`,
        input: args,
        attributes: {
          toolId: options.name,
          toolDescription: options.description,
          toolType: logType || "tool"
        },
        tracingPolicy: options.tracingPolicy
      });
      try {
        let result;
        if (isVercelTool(tool)) {
          result = await tool?.execute?.(args, execOptions);
        } else {
          const wrappedMastra = options.mastra ? wrapMastra(options.mastra, { currentSpan: toolSpan }) : options.mastra;
          result = await tool?.execute?.(
            {
              context: args,
              threadId: options.threadId,
              resourceId: options.resourceId,
              mastra: wrappedMastra,
              memory: options.memory,
              runId: options.runId,
              runtimeContext: options.runtimeContext ?? new RuntimeContext(),
              writer: new ToolStream(
                {
                  prefix: "tool",
                  callId: execOptions.toolCallId,
                  name: options.name,
                  runId: options.runId
                },
                options.writableStream || execOptions.writableStream
              ),
              tracingContext: { currentSpan: toolSpan }
            },
            execOptions
          );
        }
        toolSpan?.end({ output: result });
        return result ?? void 0;
      } catch (error2) {
        toolSpan?.error({ error: error2 });
        throw error2;
      }
    };
    return async (args, execOptions) => {
      let logger2 = options.logger || this.logger;
      try {
        logger2.debug(start, { ...rest, args });
        const parameters = this.getParameters();
        const { data, error: error2 } = validateToolInput(parameters, args, options.name);
        if (error2) {
          logger2.warn(`Tool input validation failed for '${options.name}'`, {
            toolName: options.name,
            errors: error2.validationErrors,
            args
          });
          return error2;
        }
        args = data;
        return await new Promise((resolve, reject) => {
          setImmediate(async () => {
            try {
              const result = await execFunction(args, execOptions);
              resolve(result);
            } catch (err) {
              reject(err);
            }
          });
        });
      } catch (err) {
        const mastraError = new MastraError(
          {
            id: "TOOL_EXECUTION_FAILED",
            domain: "TOOL" /* TOOL */,
            category: "USER" /* USER */,
            details: {
              errorMessage: String(error),
              argsJson: JSON.stringify(args),
              model: rest.model?.modelId ?? ""
            }
          },
          err
        );
        logger2.trackException(mastraError);
        logger2.error(error, { ...rest, error: mastraError, args });
        return mastraError;
      }
    };
  }
  buildV5() {
    const builtTool = this.build();
    if (!builtTool.parameters) {
      throw new Error("Tool parameters are required");
    }
    return {
      ...builtTool,
      inputSchema: builtTool.parameters,
      onInputStart: "onInputStart" in this.originalTool ? this.originalTool.onInputStart : void 0,
      onInputDelta: "onInputDelta" in this.originalTool ? this.originalTool.onInputDelta : void 0,
      onInputAvailable: "onInputAvailable" in this.originalTool ? this.originalTool.onInputAvailable : void 0
    };
  }
  build() {
    const providerTool = this.buildProviderTool(this.originalTool);
    if (providerTool) {
      return providerTool;
    }
    const definition = {
      type: "function",
      description: this.originalTool.description,
      parameters: this.getParameters(),
      outputSchema: this.getOutputSchema(),
      requireApproval: this.options.requireApproval,
      execute: this.originalTool.execute ? this.createExecute(
        this.originalTool,
        { ...this.options, description: this.originalTool.description },
        this.logType
      ) : void 0
    };
    const model = this.options.model;
    const schemaCompatLayers = [];
    if (model) {
      const supportsStructuredOutputs = model.specificationVersion !== "v2" ? model.supportsStructuredOutputs ?? false : false;
      const modelInfo = {
        modelId: model.modelId,
        supportsStructuredOutputs,
        provider: model.provider
      };
      schemaCompatLayers.push(
        new OpenAIReasoningSchemaCompatLayer(modelInfo),
        new OpenAISchemaCompatLayer(modelInfo),
        new GoogleSchemaCompatLayer(modelInfo),
        new AnthropicSchemaCompatLayer(modelInfo),
        new DeepSeekSchemaCompatLayer(modelInfo),
        new MetaSchemaCompatLayer(modelInfo)
      );
    }
    const processedSchema = applyCompatLayer({
      schema: this.getParameters(),
      compatLayers: schemaCompatLayers,
      mode: "aiSdkSchema"
    });
    let processedOutputSchema;
    if (this.getOutputSchema()) {
      processedOutputSchema = applyCompatLayer({
        schema: this.getOutputSchema(),
        compatLayers: schemaCompatLayers,
        mode: "aiSdkSchema"
      });
    }
    return {
      ...definition,
      id: "id" in this.originalTool ? this.originalTool.id : void 0,
      parameters: processedSchema,
      outputSchema: processedOutputSchema
    };
  }
};

// src/utils.ts
var delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function deepMerge(target, source) {
  const output = { ...target };
  if (!source) return output;
  Object.keys(source).forEach((key) => {
    const targetValue = output[key];
    const sourceValue = source[key];
    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      output[key] = sourceValue;
    } else if (sourceValue instanceof Object && targetValue instanceof Object && !Array.isArray(sourceValue) && !Array.isArray(targetValue)) {
      output[key] = deepMerge(targetValue, sourceValue);
    } else if (sourceValue !== void 0) {
      output[key] = sourceValue;
    }
  });
  return output;
}
function generateEmptyFromSchema(schema) {
  try {
    const parsedSchema = JSON.parse(schema);
    if (!parsedSchema || parsedSchema.type !== "object" || !parsedSchema.properties) return {};
    const obj = {};
    const TYPE_DEFAULTS = {
      string: "",
      array: [],
      object: {},
      number: 0,
      integer: 0,
      boolean: false
    };
    for (const [key, prop] of Object.entries(parsedSchema.properties)) {
      obj[key] = TYPE_DEFAULTS[prop.type] ?? null;
    }
    return obj;
  } catch {
    return {};
  }
}
function resolveSerializedZodOutput(schema) {
  return Function("z", `"use strict";return (${schema});`)(z);
}
function isZodType(value) {
  return typeof value === "object" && value !== null && "_def" in value && "parse" in value && typeof value.parse === "function" && "safeParse" in value && typeof value.safeParse === "function";
}
function createDeterministicId(input) {
  return createHash("sha256").update(input).digest("hex").slice(0, 8);
}
function setVercelToolProperties(tool) {
  const inputSchema = convertVercelToolParameters(tool);
  const toolId = !("id" in tool) ? tool.description ? `tool-${createDeterministicId(tool.description)}` : `tool-${Math.random().toString(36).substring(2, 9)}` : tool.id;
  return {
    ...tool,
    id: toolId,
    inputSchema
  };
}
function ensureToolProperties(tools) {
  const toolsWithProperties = Object.keys(tools).reduce((acc, key) => {
    const tool = tools?.[key];
    if (tool) {
      if (isVercelTool(tool)) {
        acc[key] = setVercelToolProperties(tool);
      } else {
        acc[key] = tool;
      }
    }
    return acc;
  }, {});
  return toolsWithProperties;
}
function convertVercelToolParameters(tool) {
  const schema = tool.parameters ?? objectType({});
  return isZodType(schema) ? schema : resolveSerializedZodOutput(jsonSchemaToZod(schema));
}
function makeCoreTool(originalTool, options, logType) {
  return new CoreToolBuilder({ originalTool, options, logType }).build();
}
function createMastraProxy({ mastra, logger }) {
  return new Proxy(mastra, {
    get(target, prop) {
      const hasProp = Reflect.has(target, prop);
      if (hasProp) {
        const value = Reflect.get(target, prop);
        const isFunction = typeof value === "function";
        if (isFunction) {
          return value.bind(target);
        }
        return value;
      }
      if (prop === "logger") {
        logger.warn(`Please use 'getLogger' instead, logger is deprecated`);
        return Reflect.apply(target.getLogger, target, []);
      }
      if (prop === "telemetry") {
        logger.warn(`Please use 'getTelemetry' instead, telemetry is deprecated`);
        return Reflect.apply(target.getTelemetry, target, []);
      }
      if (prop === "storage") {
        logger.warn(`Please use 'getStorage' instead, storage is deprecated`);
        return Reflect.get(target, "storage");
      }
      if (prop === "agents") {
        logger.warn(`Please use 'getAgents' instead, agents is deprecated`);
        return Reflect.apply(target.getAgents, target, []);
      }
      if (prop === "tts") {
        logger.warn(`Please use 'getTTS' instead, tts is deprecated`);
        return Reflect.apply(target.getTTS, target, []);
      }
      if (prop === "vectors") {
        logger.warn(`Please use 'getVectors' instead, vectors is deprecated`);
        return Reflect.apply(target.getVectors, target, []);
      }
      if (prop === "memory") {
        logger.warn(`Please use 'getMemory' instead, memory is deprecated`);
        return Reflect.get(target, "memory");
      }
      return Reflect.get(target, prop);
    }
  });
}
function checkEvalStorageFields(traceObject, logger) {
  const missingFields = [];
  if (!traceObject.input) missingFields.push("input");
  if (!traceObject.output) missingFields.push("output");
  if (!traceObject.agentName) missingFields.push("agent_name");
  if (!traceObject.metricName) missingFields.push("metric_name");
  if (!traceObject.instructions) missingFields.push("instructions");
  if (!traceObject.globalRunId) missingFields.push("global_run_id");
  if (!traceObject.runId) missingFields.push("run_id");
  if (missingFields.length > 0) {
    if (logger) {
      logger.warn("Skipping evaluation storage due to missing required fields", {
        missingFields,
        runId: traceObject.runId,
        agentName: traceObject.agentName
      });
    } else {
      console.warn("Skipping evaluation storage due to missing required fields", {
        missingFields,
        runId: traceObject.runId,
        agentName: traceObject.agentName
      });
    }
    return false;
  }
  return true;
}
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let retryCount = 0;
  let lastError = null;
  while (retryCount < maxRetries) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Request failed with status: ${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retryCount++;
      if (retryCount >= maxRetries) {
        break;
      }
      const delay2 = Math.min(1e3 * Math.pow(2, retryCount) * 1e3, 1e4);
      await new Promise((resolve) => setTimeout(resolve, delay2));
    }
  }
  throw lastError || new Error("Request failed after multiple retry attempts");
}

// src/ai-tracing/exporters/cloud.ts
var CloudExporter = class {
  name = "mastra-cloud-ai-tracing-exporter";
  config;
  buffer;
  flushTimer = null;
  logger;
  isDisabled = false;
  constructor(config = {}) {
    this.logger = config.logger ?? new ConsoleLogger({ level: LogLevel.INFO });
    const accessToken = config.accessToken ?? process.env.MASTRA_CLOUD_ACCESS_TOKEN;
    if (!accessToken) {
      this.logger.warn(
        "CloudExporter disabled: MASTRA_CLOUD_ACCESS_TOKEN environment variable not set. \u{1F680} Sign up for Mastra Cloud at https://cloud.mastra.ai to see your AI traces online and obtain your access token."
      );
      this.isDisabled = true;
    }
    const endpoint = config.endpoint ?? process.env.MASTRA_CLOUD_AI_TRACES_ENDPOINT ?? "https://api.mastra.ai/ai/spans/publish";
    this.config = {
      maxBatchSize: config.maxBatchSize ?? 1e3,
      maxBatchWaitMs: config.maxBatchWaitMs ?? 5e3,
      maxRetries: config.maxRetries ?? 3,
      accessToken: accessToken || "",
      // Empty string if no token
      endpoint,
      logger: this.logger
    };
    this.buffer = {
      spans: [],
      totalSize: 0
    };
  }
  async exportEvent(event) {
    if (this.isDisabled) {
      return;
    }
    if (event.type !== "span_ended" /* SPAN_ENDED */) {
      return;
    }
    this.addToBuffer(event);
    if (this.shouldFlush()) {
      this.flush().catch((error) => {
        this.logger.error("Batch flush failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      });
    } else if (this.buffer.totalSize === 1) {
      this.scheduleFlush();
    }
  }
  addToBuffer(event) {
    if (this.buffer.totalSize === 0) {
      this.buffer.firstEventTime = /* @__PURE__ */ new Date();
    }
    const spanRecord = this.formatSpan(event.exportedSpan);
    this.buffer.spans.push(spanRecord);
    this.buffer.totalSize++;
  }
  formatSpan(span) {
    const spanRecord = {
      traceId: span.traceId,
      spanId: span.id,
      parentSpanId: span.parentSpanId ?? null,
      name: span.name,
      spanType: span.type,
      attributes: span.attributes ?? null,
      metadata: span.metadata ?? null,
      startedAt: span.startTime,
      endedAt: span.endTime ?? null,
      input: span.input ?? null,
      output: span.output ?? null,
      error: span.errorInfo,
      isEvent: span.isEvent,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: null
    };
    return spanRecord;
  }
  shouldFlush() {
    if (this.buffer.totalSize >= this.config.maxBatchSize) {
      return true;
    }
    if (this.buffer.firstEventTime && this.buffer.totalSize > 0) {
      const elapsed = Date.now() - this.buffer.firstEventTime.getTime();
      if (elapsed >= this.config.maxBatchWaitMs) {
        return true;
      }
    }
    return false;
  }
  scheduleFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flush().catch((error) => {
        const mastraError = new MastraError(
          {
            id: `CLOUD_AI_TRACING_FAILED_TO_SCHEDULE_FLUSH`,
            domain: "MASTRA_OBSERVABILITY" /* MASTRA_OBSERVABILITY */,
            category: "USER" /* USER */
          },
          error
        );
        this.logger.trackException(mastraError);
        this.logger.error("Scheduled flush failed", mastraError);
      });
    }, this.config.maxBatchWaitMs);
  }
  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.totalSize === 0) {
      return;
    }
    const startTime = Date.now();
    const spansCopy = [...this.buffer.spans];
    const flushReason = this.buffer.totalSize >= this.config.maxBatchSize ? "size" : "time";
    this.resetBuffer();
    try {
      await this.batchUpload(spansCopy);
      const elapsed = Date.now() - startTime;
      this.logger.debug("Batch flushed successfully", {
        batchSize: spansCopy.length,
        flushReason,
        durationMs: elapsed
      });
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: `CLOUD_AI_TRACING_FAILED_TO_BATCH_UPLOAD`,
          domain: "MASTRA_OBSERVABILITY" /* MASTRA_OBSERVABILITY */,
          category: "USER" /* USER */,
          details: {
            droppedBatchSize: spansCopy.length
          }
        },
        error
      );
      this.logger.trackException(mastraError);
      this.logger.error("Batch upload failed after all retries, dropping batch", mastraError);
    }
  }
  /**
   * Uploads spans to cloud API using fetchWithRetry for all retry logic
   */
  async batchUpload(spans) {
    const url = `${this.config.endpoint}`;
    const headers = {
      Authorization: `Bearer ${this.config.accessToken}`,
      "Content-Type": "application/json"
    };
    const options = {
      method: "POST",
      headers,
      body: JSON.stringify({ spans })
    };
    await fetchWithRetry(url, options, this.config.maxRetries);
  }
  resetBuffer() {
    this.buffer.spans = [];
    this.buffer.firstEventTime = void 0;
    this.buffer.totalSize = 0;
  }
  async shutdown() {
    if (this.isDisabled) {
      return;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.totalSize > 0) {
      this.logger.info("Flushing remaining events on shutdown", {
        remainingEvents: this.buffer.totalSize
      });
      try {
        await this.flush();
      } catch (error) {
        const mastraError = new MastraError(
          {
            id: `CLOUD_AI_TRACING_FAILED_TO_FLUSH_REMAINING_EVENTS_DURING_SHUTDOWN`,
            domain: "MASTRA_OBSERVABILITY" /* MASTRA_OBSERVABILITY */,
            category: "USER" /* USER */,
            details: {
              remainingEvents: this.buffer.totalSize
            }
          },
          error
        );
        this.logger.trackException(mastraError);
        this.logger.error("Failed to flush remaining events during shutdown", mastraError);
      }
    }
    this.logger.info("CloudExporter shutdown complete");
  }
};

// src/ai-tracing/exporters/default.ts
function resolveStrategy(userConfig, storage, logger) {
  if (userConfig.strategy && userConfig.strategy !== "auto") {
    const hints = storage.aiTracingStrategy;
    if (hints.supported.includes(userConfig.strategy)) {
      return userConfig.strategy;
    }
    logger.warn("User-specified AI tracing strategy not supported by storage adapter, falling back to auto-selection", {
      userStrategy: userConfig.strategy,
      storageAdapter: storage.constructor.name,
      supportedStrategies: hints.supported,
      fallbackStrategy: hints.preferred
    });
  }
  return storage.aiTracingStrategy.preferred;
}
var DefaultExporter = class {
  name = "tracing-default-exporter";
  logger;
  mastra = null;
  config;
  resolvedStrategy;
  buffer;
  flushTimer = null;
  // Track all spans that have been created, persists across flushes
  allCreatedSpans = /* @__PURE__ */ new Set();
  constructor(config = {}, logger) {
    if (logger) {
      this.logger = logger;
    } else {
      this.logger = new ConsoleLogger({ level: LogLevel.INFO });
    }
    this.config = {
      maxBatchSize: config.maxBatchSize ?? 1e3,
      maxBufferSize: config.maxBufferSize ?? 1e4,
      maxBatchWaitMs: config.maxBatchWaitMs ?? 5e3,
      maxRetries: config.maxRetries ?? 4,
      retryDelayMs: config.retryDelayMs ?? 500,
      strategy: config.strategy ?? "auto"
    };
    this.buffer = {
      creates: [],
      updates: [],
      insertOnly: [],
      seenSpans: /* @__PURE__ */ new Set(),
      spanSequences: /* @__PURE__ */ new Map(),
      completedSpans: /* @__PURE__ */ new Set(),
      outOfOrderCount: 0,
      totalSize: 0
    };
    this.resolvedStrategy = "batch-with-updates";
  }
  strategyInitialized = false;
  /**
   * Register the Mastra instance (called after Mastra construction is complete)
   */
  __registerMastra(mastra) {
    this.mastra = mastra;
  }
  /**
   * Initialize the exporter (called after all dependencies are ready)
   */
  init(_config) {
    if (!this.mastra) {
      throw new Error("DefaultExporter: init() called before __registerMastra()");
    }
    const storage = this.mastra.getStorage();
    if (!storage) {
      this.logger.warn("DefaultExporter disabled: Storage not available. Traces will not be persisted.");
      return;
    }
    this.initializeStrategy(storage);
  }
  /**
   * Initialize the resolved strategy once storage is available
   */
  initializeStrategy(storage) {
    if (this.strategyInitialized) return;
    this.resolvedStrategy = resolveStrategy(this.config, storage, this.logger);
    this.strategyInitialized = true;
    this.logger.info("AI tracing exporter initialized", {
      strategy: this.resolvedStrategy,
      source: this.config.strategy !== "auto" ? "user" : "auto",
      storageAdapter: storage.constructor.name,
      maxBatchSize: this.config.maxBatchSize,
      maxBatchWaitMs: this.config.maxBatchWaitMs
    });
  }
  /**
   * Builds a unique span key for tracking
   */
  buildSpanKey(traceId, spanId) {
    return `${traceId}:${spanId}`;
  }
  /**
   * Gets the next sequence number for a span
   */
  getNextSequence(spanKey) {
    const current = this.buffer.spanSequences.get(spanKey) || 0;
    const next = current + 1;
    this.buffer.spanSequences.set(spanKey, next);
    return next;
  }
  /**
   * Handles out-of-order span updates by logging and skipping
   */
  handleOutOfOrderUpdate(event) {
    this.logger.warn("Out-of-order span update detected - skipping event", {
      spanId: event.exportedSpan.id,
      traceId: event.exportedSpan.traceId,
      spanName: event.exportedSpan.name,
      eventType: event.type
    });
  }
  /**
   * Adds an event to the appropriate buffer based on strategy
   */
  addToBuffer(event) {
    const spanKey = this.buildSpanKey(event.exportedSpan.traceId, event.exportedSpan.id);
    if (this.buffer.totalSize === 0) {
      this.buffer.firstEventTime = /* @__PURE__ */ new Date();
    }
    switch (event.type) {
      case "span_started" /* SPAN_STARTED */:
        if (this.resolvedStrategy === "batch-with-updates") {
          const createRecord = this.buildCreateRecord(event.exportedSpan);
          this.buffer.creates.push(createRecord);
          this.buffer.seenSpans.add(spanKey);
          this.allCreatedSpans.add(spanKey);
        }
        break;
      case "span_updated" /* SPAN_UPDATED */:
        if (this.resolvedStrategy === "batch-with-updates") {
          if (this.allCreatedSpans.has(spanKey)) {
            this.buffer.updates.push({
              traceId: event.exportedSpan.traceId,
              spanId: event.exportedSpan.id,
              updates: this.buildUpdateRecord(event.exportedSpan),
              sequenceNumber: this.getNextSequence(spanKey)
            });
          } else {
            this.handleOutOfOrderUpdate(event);
            this.buffer.outOfOrderCount++;
          }
        }
        break;
      case "span_ended" /* SPAN_ENDED */:
        if (this.resolvedStrategy === "batch-with-updates") {
          if (this.allCreatedSpans.has(spanKey)) {
            this.buffer.updates.push({
              traceId: event.exportedSpan.traceId,
              spanId: event.exportedSpan.id,
              updates: this.buildUpdateRecord(event.exportedSpan),
              sequenceNumber: this.getNextSequence(spanKey)
            });
            this.buffer.completedSpans.add(spanKey);
          } else if (event.exportedSpan.isEvent) {
            const createRecord = this.buildCreateRecord(event.exportedSpan);
            this.buffer.creates.push(createRecord);
            this.buffer.seenSpans.add(spanKey);
            this.allCreatedSpans.add(spanKey);
            this.buffer.completedSpans.add(spanKey);
          } else {
            this.handleOutOfOrderUpdate(event);
            this.buffer.outOfOrderCount++;
          }
        } else if (this.resolvedStrategy === "insert-only") {
          const createRecord = this.buildCreateRecord(event.exportedSpan);
          this.buffer.insertOnly.push(createRecord);
          this.buffer.completedSpans.add(spanKey);
          this.allCreatedSpans.add(spanKey);
        }
        break;
    }
    this.buffer.totalSize = this.buffer.creates.length + this.buffer.updates.length + this.buffer.insertOnly.length;
  }
  /**
   * Checks if buffer should be flushed based on size or time triggers
   */
  shouldFlush() {
    if (this.buffer.totalSize >= this.config.maxBufferSize) {
      return true;
    }
    if (this.buffer.totalSize >= this.config.maxBatchSize) {
      return true;
    }
    if (this.buffer.firstEventTime && this.buffer.totalSize > 0) {
      const elapsed = Date.now() - this.buffer.firstEventTime.getTime();
      if (elapsed >= this.config.maxBatchWaitMs) {
        return true;
      }
    }
    return false;
  }
  /**
   * Resets the buffer after successful flush
   */
  resetBuffer(completedSpansToCleanup = /* @__PURE__ */ new Set()) {
    this.buffer.creates = [];
    this.buffer.updates = [];
    this.buffer.insertOnly = [];
    this.buffer.seenSpans.clear();
    this.buffer.spanSequences.clear();
    this.buffer.completedSpans.clear();
    this.buffer.outOfOrderCount = 0;
    this.buffer.firstEventTime = void 0;
    this.buffer.totalSize = 0;
    for (const spanKey of completedSpansToCleanup) {
      this.allCreatedSpans.delete(spanKey);
    }
  }
  /**
   * Schedules a flush using setTimeout
   */
  scheduleFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flush().catch((error) => {
        this.logger.error("Scheduled flush failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }, this.config.maxBatchWaitMs);
  }
  /**
   * Serializes span attributes to storage record format
   * Handles all AI span types and their specific attributes
   */
  serializeAttributes(span) {
    if (!span.attributes) {
      return null;
    }
    try {
      return JSON.parse(
        JSON.stringify(span.attributes, (_key, value) => {
          if (value instanceof Date) {
            return value.toISOString();
          }
          if (typeof value === "object" && value !== null) {
            return value;
          }
          return value;
        })
      );
    } catch (error) {
      this.logger.warn("Failed to serialize span attributes, storing as null", {
        spanId: span.id,
        spanType: span.type,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
  buildCreateRecord(span) {
    return {
      traceId: span.traceId,
      spanId: span.id,
      parentSpanId: span.parentSpanId ?? null,
      name: span.name,
      scope: null,
      spanType: span.type,
      attributes: this.serializeAttributes(span),
      metadata: span.metadata ?? null,
      links: null,
      startedAt: span.startTime,
      endedAt: span.endTime ?? null,
      input: span.input,
      output: span.output,
      error: span.errorInfo,
      isEvent: span.isEvent
    };
  }
  buildUpdateRecord(span) {
    return {
      name: span.name,
      scope: null,
      attributes: this.serializeAttributes(span),
      metadata: span.metadata ?? null,
      links: null,
      endedAt: span.endTime ?? null,
      input: span.input,
      output: span.output,
      error: span.errorInfo
    };
  }
  /**
   * Handles realtime strategy - processes each event immediately
   */
  async handleRealtimeEvent(event, storage) {
    const span = event.exportedSpan;
    const spanKey = this.buildSpanKey(span.traceId, span.id);
    if (span.isEvent) {
      if (event.type === "span_ended" /* SPAN_ENDED */) {
        await storage.createAISpan(this.buildCreateRecord(event.exportedSpan));
      } else {
        this.logger.warn(`Tracing event type not implemented for event spans: ${event.type}`);
      }
    } else {
      switch (event.type) {
        case "span_started" /* SPAN_STARTED */:
          await storage.createAISpan(this.buildCreateRecord(event.exportedSpan));
          this.allCreatedSpans.add(spanKey);
          break;
        case "span_updated" /* SPAN_UPDATED */:
          await storage.updateAISpan({
            traceId: span.traceId,
            spanId: span.id,
            updates: this.buildUpdateRecord(span)
          });
          break;
        case "span_ended" /* SPAN_ENDED */:
          await storage.updateAISpan({
            traceId: span.traceId,
            spanId: span.id,
            updates: this.buildUpdateRecord(span)
          });
          this.allCreatedSpans.delete(spanKey);
          break;
        default:
          this.logger.warn(`Tracing event type not implemented for span spans: ${event.type}`);
      }
    }
  }
  /**
   * Handles batch-with-updates strategy - buffers events and processes in batches
   */
  handleBatchWithUpdatesEvent(event) {
    this.addToBuffer(event);
    if (this.shouldFlush()) {
      this.flush().catch((error) => {
        this.logger.error("Batch flush failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      });
    } else if (this.buffer.totalSize === 1) {
      this.scheduleFlush();
    }
  }
  /**
   * Handles insert-only strategy - only processes SPAN_ENDED events in batches
   */
  handleInsertOnlyEvent(event) {
    if (event.type === "span_ended" /* SPAN_ENDED */) {
      this.addToBuffer(event);
      if (this.shouldFlush()) {
        this.flush().catch((error) => {
          this.logger.error("Batch flush failed", {
            error: error instanceof Error ? error.message : String(error)
          });
        });
      } else if (this.buffer.totalSize === 1) {
        this.scheduleFlush();
      }
    }
  }
  /**
   * Calculates retry delay using exponential backoff
   */
  calculateRetryDelay(attempt) {
    return this.config.retryDelayMs * Math.pow(2, attempt);
  }
  /**
   * Flushes the current buffer to storage with retry logic
   */
  async flush() {
    if (!this.mastra) {
      this.logger.debug("Cannot flush traces. Mastra instance not registered yet.");
      return;
    }
    const storage = this.mastra.getStorage();
    if (!storage) {
      this.logger.debug("Cannot flush traces. Mastra storage is not initialized");
      return;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.totalSize === 0) {
      return;
    }
    const startTime = Date.now();
    const flushReason = this.buffer.totalSize >= this.config.maxBufferSize ? "overflow" : this.buffer.totalSize >= this.config.maxBatchSize ? "size" : "time";
    const bufferCopy = {
      creates: [...this.buffer.creates],
      updates: [...this.buffer.updates],
      insertOnly: [...this.buffer.insertOnly],
      seenSpans: new Set(this.buffer.seenSpans),
      spanSequences: new Map(this.buffer.spanSequences),
      completedSpans: new Set(this.buffer.completedSpans),
      outOfOrderCount: this.buffer.outOfOrderCount,
      firstEventTime: this.buffer.firstEventTime,
      totalSize: this.buffer.totalSize
    };
    this.resetBuffer();
    await this.flushWithRetries(storage, bufferCopy, 0);
    const elapsed = Date.now() - startTime;
    this.logger.debug("Batch flushed", {
      strategy: this.resolvedStrategy,
      batchSize: bufferCopy.totalSize,
      flushReason,
      durationMs: elapsed,
      outOfOrderCount: bufferCopy.outOfOrderCount > 0 ? bufferCopy.outOfOrderCount : void 0
    });
  }
  /**
   * Attempts to flush with exponential backoff retry logic
   */
  async flushWithRetries(storage, buffer, attempt) {
    try {
      if (this.resolvedStrategy === "batch-with-updates") {
        if (buffer.creates.length > 0) {
          await storage.batchCreateAISpans({ records: buffer.creates });
        }
        if (buffer.updates.length > 0) {
          const sortedUpdates = buffer.updates.sort((a, b) => {
            const spanCompare = this.buildSpanKey(a.traceId, a.spanId).localeCompare(
              this.buildSpanKey(b.traceId, b.spanId)
            );
            if (spanCompare !== 0) return spanCompare;
            return a.sequenceNumber - b.sequenceNumber;
          });
          await storage.batchUpdateAISpans({ records: sortedUpdates });
        }
      } else if (this.resolvedStrategy === "insert-only") {
        if (buffer.insertOnly.length > 0) {
          await storage.batchCreateAISpans({ records: buffer.insertOnly });
        }
      }
      for (const spanKey of buffer.completedSpans) {
        this.allCreatedSpans.delete(spanKey);
      }
    } catch (error) {
      if (attempt < this.config.maxRetries) {
        const retryDelay = this.calculateRetryDelay(attempt);
        this.logger.warn("Batch flush failed, retrying", {
          attempt: attempt + 1,
          maxRetries: this.config.maxRetries,
          nextRetryInMs: retryDelay,
          error: error instanceof Error ? error.message : String(error)
        });
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return this.flushWithRetries(storage, buffer, attempt + 1);
      } else {
        this.logger.error("Batch flush failed after all retries, dropping batch", {
          finalAttempt: attempt + 1,
          maxRetries: this.config.maxRetries,
          droppedBatchSize: buffer.totalSize,
          error: error instanceof Error ? error.message : String(error)
        });
        for (const spanKey of buffer.completedSpans) {
          this.allCreatedSpans.delete(spanKey);
        }
      }
    }
  }
  async exportEvent(event) {
    if (!this.mastra) {
      this.logger.debug("Cannot export AI tracing event. Mastra instance not registered yet.");
      return;
    }
    const storage = this.mastra.getStorage();
    if (!storage) {
      this.logger.debug("Cannot store traces. Mastra storage is not initialized");
      return;
    }
    if (!this.strategyInitialized) {
      this.initializeStrategy(storage);
    }
    switch (this.resolvedStrategy) {
      case "realtime":
        await this.handleRealtimeEvent(event, storage);
        break;
      case "batch-with-updates":
        this.handleBatchWithUpdatesEvent(event);
        break;
      case "insert-only":
        this.handleInsertOnlyEvent(event);
        break;
    }
  }
  async shutdown() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.totalSize > 0) {
      this.logger.info("Flushing remaining events on shutdown", {
        remainingEvents: this.buffer.totalSize
      });
      try {
        await this.flush();
      } catch (error) {
        this.logger.error("Failed to flush remaining events during shutdown", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    this.logger.info("DefaultExporter shutdown complete");
  }
};

// src/ai-tracing/span_processors/sensitive-data-filter.ts
var SensitiveDataFilter = class {
  name = "sensitive-data-filter";
  sensitiveFields;
  redactionToken;
  redactionStyle;
  constructor(options = {}) {
    this.sensitiveFields = (options.sensitiveFields || [
      "password",
      "token",
      "secret",
      "key",
      "apikey",
      "auth",
      "authorization",
      "bearer",
      "bearertoken",
      "jwt",
      "credential",
      "clientsecret",
      "privatekey",
      "refresh",
      "ssn"
    ]).map((f) => this.normalizeKey(f));
    this.redactionToken = options.redactionToken ?? "[REDACTED]";
    this.redactionStyle = options.redactionStyle ?? "full";
  }
  /**
   * Process a span by filtering sensitive data across its key fields.
   * Fields processed: attributes, metadata, input, output, errorInfo.
   *
   * @param span - The input span to filter
   * @returns A new span with sensitive values redacted
   */
  process(span) {
    span.attributes = this.tryFilter(span.attributes);
    span.metadata = this.tryFilter(span.metadata);
    span.input = this.tryFilter(span.input);
    span.output = this.tryFilter(span.output);
    span.errorInfo = this.tryFilter(span.errorInfo);
    return span;
  }
  /**
   * Recursively filter objects/arrays for sensitive keys.
   * Handles circular references by replacing with a marker.
   */
  deepFilter(obj, seen = /* @__PURE__ */ new WeakSet()) {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }
    if (seen.has(obj)) {
      return "[Circular Reference]";
    }
    seen.add(obj);
    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepFilter(item, seen));
    }
    const filtered = {};
    for (const key of Object.keys(obj)) {
      const normKey = this.normalizeKey(key);
      if (this.isSensitive(normKey)) {
        if (obj[key] && typeof obj[key] === "object") {
          filtered[key] = this.deepFilter(obj[key], seen);
        } else {
          filtered[key] = this.redactValue(obj[key]);
        }
      } else {
        filtered[key] = this.deepFilter(obj[key], seen);
      }
    }
    return filtered;
  }
  tryFilter(value) {
    try {
      return this.deepFilter(value);
    } catch {
      return { error: { processor: this.name } };
    }
  }
  /**
   * Normalize keys by lowercasing and stripping non-alphanumeric characters.
   * Ensures consistent matching for variants like "api-key", "api_key", "Api Key".
   */
  normalizeKey(key) {
    return key.toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  /**
   * Check whether a normalized key exactly matches any sensitive field.
   * Both key and sensitive fields are normalized by removing all non-alphanumeric
   * characters and converting to lowercase before comparison.
   *
   * Examples:
   * - "api_key", "api-key", "ApiKey" all normalize to "apikey" → MATCHES "apikey"
   * - "promptTokens", "prompt_tokens" normalize to "prompttokens" → DOES NOT MATCH "token"
   */
  isSensitive(normalizedKey) {
    return this.sensitiveFields.some((sensitiveField) => {
      return normalizedKey === sensitiveField;
    });
  }
  /**
   * Redact a sensitive value.
   * - Full style: replaces with a fixed token.
   * - Partial style: shows 3 chars at start and end, hides the middle.
   *
   * Non-string values are converted to strings before partial redaction.
   */
  redactValue(value) {
    if (this.redactionStyle === "full") {
      return this.redactionToken;
    }
    const str = String(value);
    const len = str.length;
    if (len <= 6) {
      return this.redactionToken;
    }
    return str.slice(0, 3) + "\u2026" + str.slice(len - 3);
  }
  async shutdown() {
  }
};

// src/ai-tracing/registry.ts
var AITracingRegistry = class {
  instances = /* @__PURE__ */ new Map();
  defaultInstance;
  configSelector;
  /**
   * Register a tracing instance
   */
  register(name, instance, isDefault = false) {
    if (this.instances.has(name)) {
      throw new Error(`AI Tracing instance '${name}' already registered`);
    }
    this.instances.set(name, instance);
    if (isDefault || !this.defaultInstance) {
      this.defaultInstance = instance;
    }
  }
  /**
   * Get a tracing instance by name
   */
  get(name) {
    return this.instances.get(name);
  }
  /**
   * Get the default tracing instance
   */
  getDefault() {
    return this.defaultInstance;
  }
  /**
   * Set the tracing selector function
   */
  setSelector(selector) {
    this.configSelector = selector;
  }
  /**
   * Get the selected tracing instance based on context
   */
  getSelected(options) {
    if (this.configSelector) {
      const selected = this.configSelector(options, this.instances);
      if (selected && this.instances.has(selected)) {
        return this.instances.get(selected);
      }
    }
    return this.defaultInstance;
  }
  /**
   * Unregister a tracing instance
   */
  unregister(name) {
    return this.instances.delete(name);
  }
  /**
   * Shutdown all instances and clear the registry
   */
  async shutdown() {
    const shutdownPromises = Array.from(this.instances.values()).map((instance) => instance.shutdown());
    await Promise.allSettled(shutdownPromises);
    this.instances.clear();
  }
  /**
   * Clear all instances without shutdown
   */
  clear() {
    this.instances.clear();
    this.defaultInstance = void 0;
    this.configSelector = void 0;
  }
  /**
   * Get all registered instances
   */
  getAll() {
    return new Map(this.instances);
  }
};
var aiTracingRegistry = new AITracingRegistry();
function registerAITracing(name, instance, isDefault = false) {
  aiTracingRegistry.register(name, instance, isDefault);
}
function setSelector(selector) {
  aiTracingRegistry.setSelector(selector);
}
function getSelectedAITracing(options) {
  return aiTracingRegistry.getSelected(options);
}
async function shutdownAITracingRegistry() {
  await aiTracingRegistry.shutdown();
}
function getAllAITracing() {
  return aiTracingRegistry.getAll();
}
function isAITracingInstance(obj) {
  return obj instanceof BaseAITracing;
}
function setupAITracing(config) {
  if (!config) {
    return;
  }
  if (config.default?.enabled && config.configs?.["default"]) {
    throw new Error(
      "Cannot use 'default' as a custom config name when default tracing is enabled. Please rename your custom config to avoid conflicts."
    );
  }
  if (config.default?.enabled) {
    const defaultInstance = new DefaultAITracing({
      serviceName: "mastra",
      name: "default",
      sampling: { type: "always" /* ALWAYS */ },
      exporters: [new DefaultExporter(), new CloudExporter()],
      processors: [new SensitiveDataFilter()]
    });
    registerAITracing("default", defaultInstance, true);
  }
  if (config.configs) {
    const instances = Object.entries(config.configs);
    instances.forEach(([name, tracingDef], index) => {
      const instance = isAITracingInstance(tracingDef) ? tracingDef : new DefaultAITracing({ ...tracingDef, name });
      const isDefault = !config.default?.enabled && index === 0;
      registerAITracing(name, instance, isDefault);
    });
  }
  if (config.configSelector) {
    setSelector(config.configSelector);
  }
}
function selectFields(obj, fields) {
  if (!obj || typeof obj !== "object") {
    return obj;
  }
  const result = {};
  for (const field of fields) {
    const value = getNestedValue(obj, field);
    if (value !== void 0) {
      setNestedValue(result, field, value);
    }
  }
  return result;
}
function getNestedValue(obj, path) {
  return path.split(".").reduce((current, key) => {
    return current && typeof current === "object" ? current[key] : void 0;
  }, obj);
}
function setNestedValue(obj, path, value) {
  const keys = path.split(".");
  const lastKey = keys.pop();
  if (!lastKey) {
    return;
  }
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    return current[key];
  }, obj);
  target[lastKey] = value;
}
function getValidTraceId(span) {
  return span?.isValid ? span.traceId : void 0;
}
function getOrCreateSpan(options) {
  const { type, attributes, tracingContext, runtimeContext, ...rest } = options;
  const metadata = {
    ...rest.metadata ?? {},
    ...rest.tracingOptions?.metadata ?? {}
  };
  if (tracingContext?.currentSpan) {
    return tracingContext.currentSpan.createChildSpan({
      type,
      attributes,
      ...rest,
      metadata
    });
  }
  const aiTracing = getSelectedAITracing({
    runtimeContext
  });
  return aiTracing?.startSpan({
    type,
    attributes,
    ...rest,
    metadata,
    customSamplerOptions: {
      runtimeContext,
      metadata
    }
  });
}

// src/ai-tracing/context.ts
var AGENT_GETTERS = ["getAgent", "getAgentById"];
var AGENT_METHODS_TO_WRAP = ["generate", "stream", "generateLegacy", "streamLegacy"];
var WORKFLOW_GETTERS = ["getWorkflow", "getWorkflowById"];
var WORKFLOW_METHODS_TO_WRAP = ["execute", "createRun", "createRunAsync"];
function isNoOpSpan(span) {
  return span.constructor.name === "NoOpAISpan" || span.__isNoOp === true;
}
function isMastra(mastra) {
  const hasAgentGetters = AGENT_GETTERS.every((method) => typeof mastra?.[method] === "function");
  const hasWorkflowGetters = WORKFLOW_GETTERS.every((method) => typeof mastra?.[method] === "function");
  return hasAgentGetters && hasWorkflowGetters;
}
function wrapMastra(mastra, tracingContext) {
  if (!tracingContext.currentSpan || isNoOpSpan(tracingContext.currentSpan)) {
    return mastra;
  }
  if (!isMastra(mastra)) {
    return mastra;
  }
  try {
    return new Proxy(mastra, {
      get(target, prop) {
        try {
          if (AGENT_GETTERS.includes(prop)) {
            return (...args) => {
              const agent = target[prop](...args);
              return wrapAgent(agent, tracingContext);
            };
          }
          if (WORKFLOW_GETTERS.includes(prop)) {
            return (...args) => {
              const workflow = target[prop](...args);
              return wrapWorkflow(workflow, tracingContext);
            };
          }
          const value = target[prop];
          return typeof value === "function" ? value.bind(target) : value;
        } catch (error) {
          console.warn("AI Tracing: Failed to wrap method, falling back to original", error);
          const value = target[prop];
          return typeof value === "function" ? value.bind(target) : value;
        }
      }
    });
  } catch (error) {
    console.warn("AI Tracing: Failed to create proxy, using original Mastra instance", error);
    return mastra;
  }
}
function wrapAgent(agent, tracingContext) {
  if (!tracingContext.currentSpan || isNoOpSpan(tracingContext.currentSpan)) {
    return agent;
  }
  try {
    return new Proxy(agent, {
      get(target, prop) {
        try {
          if (AGENT_METHODS_TO_WRAP.includes(prop)) {
            return (input, options = {}) => {
              return target[prop](input, {
                ...options,
                tracingContext
              });
            };
          }
          const value = target[prop];
          return typeof value === "function" ? value.bind(target) : value;
        } catch (error) {
          console.warn("AI Tracing: Failed to wrap agent method, falling back to original", error);
          const value = target[prop];
          return typeof value === "function" ? value.bind(target) : value;
        }
      }
    });
  } catch (error) {
    console.warn("AI Tracing: Failed to create agent proxy, using original instance", error);
    return agent;
  }
}
function wrapWorkflow(workflow, tracingContext) {
  if (!tracingContext.currentSpan || isNoOpSpan(tracingContext.currentSpan)) {
    return workflow;
  }
  try {
    return new Proxy(workflow, {
      get(target, prop) {
        try {
          if (WORKFLOW_METHODS_TO_WRAP.includes(prop)) {
            if (prop === "createRun" || prop === "createRunAsync") {
              return async (options = {}) => {
                const run = await target[prop](options);
                return run ? wrapRun(run, tracingContext) : run;
              };
            }
            return (input, options = {}) => {
              return target[prop](input, {
                ...options,
                tracingContext
              });
            };
          }
          const value = target[prop];
          return typeof value === "function" ? value.bind(target) : value;
        } catch (error) {
          console.warn("AI Tracing: Failed to wrap workflow method, falling back to original", error);
          const value = target[prop];
          return typeof value === "function" ? value.bind(target) : value;
        }
      }
    });
  } catch (error) {
    console.warn("AI Tracing: Failed to create workflow proxy, using original instance", error);
    return workflow;
  }
}
function wrapRun(run, tracingContext) {
  if (!tracingContext.currentSpan || isNoOpSpan(tracingContext.currentSpan)) {
    return run;
  }
  try {
    return new Proxy(run, {
      get(target, prop) {
        try {
          if (prop === "start") {
            return (startOptions = {}) => {
              return target.start({
                ...startOptions,
                tracingContext: startOptions.tracingContext ?? tracingContext
              });
            };
          }
          const value = target[prop];
          return typeof value === "function" ? value.bind(target) : value;
        } catch (error) {
          console.warn("AI Tracing: Failed to wrap run method, falling back to original", error);
          const value = target[prop];
          return typeof value === "function" ? value.bind(target) : value;
        }
      }
    });
  } catch (error) {
    console.warn("AI Tracing: Failed to create run proxy, using original instance", error);
    return run;
  }
}

export { AISpanType as A, DeepSeekSchemaCompatLayer as D, GoogleSchemaCompatLayer as G, MetaSchemaCompatLayer as M, OpenAIReasoningSchemaCompatLayer as O, ToolStream as T, shutdownAITracingRegistry as a, generateEmptyFromSchema as b, convertSchemaToZod as c, deepMerge as d, OpenAISchemaCompatLayer as e, fetchWithRetry as f, getAllAITracing as g, AnthropicSchemaCompatLayer as h, applyCompatLayer as i, isZodType as j, delay as k, ensureToolProperties as l, makeCoreTool as m, createMastraProxy as n, getOrCreateSpan as o, getValidTraceId as p, selectFields as q, checkEvalStorageFields as r, setupAITracing as s, wrapMastra as w };
