# Watchnoc Node.js SDK 🟢

Observability and error tracking for Node.js backend services. Capture server-side logs, identify bottlenecks, and monitor request lifecycles.

## 🚀 Features

- **⚡ Low Latency**: Fast, asynchronous log ingestion.
- **🚨 Automated Error Capture**: `captureException` for handled errors; wire up `process.on('uncaughtException'/'unhandledRejection')` yourself to forward fatals.
- **🔗 Request Id Tracking**: Automatically correlates logs within a single request context.
- **🛠️ Framework Support**: Built-in support for Express, Fastify, NestJS, and plain `http`.
- **🗄️ Database Monitoring**: Automatic instrumentation for Prisma, MongoDB, Drizzle, Mongoose, TypeORM, and `pg`.
- **🔍 N+1 Detection**: Automatically identify and alert on inefficient database access patterns.
- **🔒 Redaction by default**: emails, card numbers, bearer/basic tokens, AWS keys, and JWTs are stripped from values; fields named like `password`, `token`, `secret`, `authorization`, etc. are stripped entirely regardless of value shape.

---

## 🏗️ Installation

```bash
npm install @watchnoc/node
```

This package is ESM-only (`"type": "module"`). Use `import`, not `require`.

---

## 🚦 Quick Start

### 1. Initialize

Set the API key via environment variable rather than hardcoding it in source:

```bash
export WATCHNOC_API_KEY=your_api_key
```

```javascript
import { init } from '@watchnoc/node';

init({
  service: 'order-service',
  environment: process.env.NODE_ENV,
});
```

`apiKey` can also be passed explicitly to `init({ apiKey: '...' })`, but avoid committing it to source control.

By default the SDK refuses to send data over plaintext `http://` to any host other than localhost — set `httpUrl`/`WATCHNOC_HTTP_URL` to an `https://` endpoint for remote collectors, or pass `allowInsecureHttp: true` if you understand the risk (e.g. a trusted private network).

## 📡 Framework Integrations

### Express
```javascript
import express from 'express';
import { watchnocMiddleware } from '@watchnoc/node';

const app = express();
app.use(watchnocMiddleware());
```

### Fastify
```javascript
import Fastify from 'fastify';
import { watchnocPlugin } from '@watchnoc/node';

const fastify = Fastify();
fastify.register(watchnocPlugin);
```

### NestJS
```javascript
import { WatchnocMiddleware } from '@watchnoc/node';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(WatchnocMiddleware).forRoutes('*');
  }
}
```

### Plain `http`
```javascript
import { createServer } from 'http';
import { watchnocHttpHandler } from '@watchnoc/node';

createServer(watchnocHttpHandler((req, res) => {
  // ... your handler
})).listen(3000);
```

---

## 🗄️ Database Integrations

Connect Watchnoc once to your database client to automatically track query performance, slow queries, and N+1 patterns. Captured SQL/filters have literal values stripped before being sent — see [Data captured & redaction](#-data-captured--redaction).

### Prisma
```javascript
import { instrumentPrisma } from '@watchnoc/node';
const prisma = new PrismaClient();

instrumentPrisma(prisma);
```

### MongoDB
```javascript
import { instrumentMongoDB } from '@watchnoc/node';
const client = new MongoClient(url);

instrumentMongoDB(client);
```

### Drizzle
```javascript
import { watchnocDrizzleLogger } from '@watchnoc/node';
const db = drizzle(sqlite, { logger: watchnocDrizzleLogger });
```

### node-postgres (pg)
```javascript
import { instrumentPg } from '@watchnoc/node';
const pool = new Pool();

instrumentPg(pool);
```

### Mongoose / TypeORM
- **Mongoose**: Call `instrumentMongoose(connection)` at startup.
- **TypeORM**: Add `WatchnocTypeORMLogger` to your `DataSourceOptions`.

### Manual Error Logging

```javascript
import { captureException, log } from '@watchnoc/node';

try {
  // ... business logic
} catch (err) {
  captureException(err, { extra: 'context' });
}

log.info('order placed', { orderId });
```

---

## 🛠️ Advanced Usage

### Context Management
Watchnoc uses `AsyncLocalStorage` to track context across asynchronous calls without manual passing.

```javascript
import { Context, log } from '@watchnoc/node';

Context.run({ requestId: 'abc' }, () => {
  // All logs inside this block will have requestId: 'abc'
  log.info('Inside context');
});
```

### N+1 Query Detection
Watchnoc automatically detects N+1 patterns when you use our database integrations. Insights are generated when the same query is executed multiple times within a single request context.

You can configure thresholds in `init()`:
```javascript
init({
  nPlusOneThreshold: 5, // Alert after 5 repetitive queries (default: 5)
  slowQueryMs: 100,     // Threshold for slow query alerts (default: 100)
});
```

---

## 🔒 Data captured & redaction

This SDK forwards whatever you pass to `log.*`/`captureException`, plus SQL text, Mongo filters, and HTTP URLs captured by the built-in instrumentation. To keep secrets and PII out of your observability backend:

- **Value-pattern redaction** (`redact: true` by default) replaces emails, card-number-shaped digit runs, `pk_`/`sk_` API keys, `Bearer`/`Basic` auth headers, AWS access key IDs, JWTs, and SSNs wherever they appear in a string.
- **Key-name redaction** independently strips any metadata field whose name looks like `password`, `token`, `secret`, `apiKey`, `authorization`, `credential`, `ssn`, `creditCard`, `cvv`, `cookie`, etc. — this catches secrets that don't match a value pattern (e.g. a raw password string). It's recursive, so nested objects and arrays are covered too.
- SQL captured by the database integrations has string/numeric literals replaced with `?` before being sent; Mongo filters are reduced to a value-shape (`<string>`, `<number>`, ...) rather than raw values.
- Every field is truncated at `maxFieldChars` (default 8192 characters) before being sent.
- Override or extend the defaults with `redactPatterns`, `sensitiveKeyPattern`, and `maxFieldChars` in `init()`.

None of this is a substitute for not logging secrets in the first place — treat it as defense in depth, not a guarantee.

## 🔐 Transport security

- The gRPC transport uses TLS for any non-loopback address by default (pass `tlsCert` for a custom CA).
- The HTTP transport (and its use as a gRPC fallback) refuses plaintext `http://` to non-loopback hosts unless `allowInsecureHttp: true` is set.
- The API key is sent as `x-api-key` on every request/stream — keep it out of source control and rotate it if it leaks.

## Reporting a vulnerability

See [SECURITY.md](./SECURITY.md).
