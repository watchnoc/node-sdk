import { WatchnocClient } from '@watchnoc/node';

const client = new WatchnocClient({ apiKey: process.env.WATCHNOC_API_KEY ?? 'pk_test' });

client.info('Hello from @Watchnoc/node', { env: process.env.NODE_ENV ?? 'dev' });

await client.flush();
await client.shutdown();

