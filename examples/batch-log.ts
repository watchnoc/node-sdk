import { WatchnocClient } from '@watchnoc/node';

const client = new WatchnocClient({
  apiKey: process.env.WATCHNOC_API_KEY ?? 'pk_test',
  batchMax: 3,
  batchFlushMs: 5000,
});

client.info('one');
client.info('two');
client.info('three');

await client.shutdown();

