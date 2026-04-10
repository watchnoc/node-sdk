# Watchnoc Node.js SDK 🟢

Observability and error tracking for Node.js backend services. Capture server-side logs, identify bottlenecks, and monitor request lifecycles.

## 🚀 Features

- **⚡ Low Latency**: Fast, asynchronous log ingestion.
- **🚨 Automated Error Capture**: Handles `uncaughtException` and `unhandledRejection`.
- **🔗 Request Id Tracking**: Automatically correlates logs within a single request context.
- **🛠️ Framework Support**: Built-in support for Express, Fastify, and NestJS.
- **🗄️ Database Monitoring**: Automatic instrumentation for Prisma, MongoDB, Drizzle, Mongoose, and more.
- **🔍 N+1 Detection**: Automatically identify and alert on inefficient database access patterns.

---

## 🏗️ Installation

```bash
npm install @Watchnoc/node
```

---

## 🚦 Quick Start

### 1. Initialize

```javascript
const Watchnoc = require('@Watchnoc/node');

Watchnoc.init({
  apiKey: 'your_api_key',
  serviceName: 'order-service',
});
```

## 📡 Framework Integrations

### Express
```javascript
const app = require('express')();
app.use(Watchnoc.expressMiddleware());
```

### Fastify
```javascript
const fastify = require('fastify')();
const { WatchnocFastifyPlugin } = require('@Watchnoc/node');

fastify.register(WatchnocFastifyPlugin);
```

### NestJS
```javascript
import { WatchnocInterceptor } from '@Watchnoc/node';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: WatchnocInterceptor }],
})
export class AppModule {}
```

---

## 🗄️ Database Integrations

Connect Watchnoc once to your database client to automatically track query performance, slow queries, and N+1 patterns.

### Prisma
```javascript
const { instrumentPrisma } = require('@Watchnoc/node');
const prisma = new PrismaClient();

instrumentPrisma(prisma);
```

### MongoDB
```javascript
const { instrumentMongoDB } = require('@Watchnoc/node');
const client = new MongoClient(url);

instrumentMongoDB(client);
```

### Drizzle
```javascript
const { WatchnocDrizzleLogger } = require('@Watchnoc/node');
const db = drizzle(sqlite, { logger: WatchnocDrizzleLogger });
```

### node-postgres (pg)
```javascript
const { instrumentPg } = require('@Watchnoc/node');
const pool = new Pool();

instrumentPg(pool);
```

### Mongoose / TypeORM
- **Mongoose**: Call `instrumentMongoose()` at startup.
- **TypeORM**: Add `WatchnocTypeORMLogger` to your ConnectionOptions.

### 3. Manual Error Logging

```javascript
try {
  // ... business logic
} catch (err) {
  Watchnoc.captureError(err, { extra: 'context' });
}
```

---

## 🛠️ Advanced Usage

### Context Management
Watchnoc uses `AsyncLocalStorage` to track context across asynchronous calls without manual passing.

```javascript
const { withContext, log } = require('@Watchnoc/node');

withContext({ requestId: 'abc' }, () => {
  // All logs inside this block will have requestId: 'abc'
  log.info('Inside context');
});
```

### N+1 Query Detection
Watchnoc automatically detects N+1 patterns when you use our database integrations. Insights are generated when the same query is executed multiple times within a single request context.

You can configure thresholds in `Watchnoc.init()`:
```javascript
Watchnoc.init({
  apiKey: '...',
  nPlusOneThreshold: 5, // Alert after 5 repetitive queries (default: 5)
  slowQueryMs: 100,      // Threshold for slow query alerts (default: 500)
});
```
