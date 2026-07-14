import express from 'express';
import type { Request, Response } from 'express';
import { init, log, watchnocMiddleware } from '@watchnoc/node';

init({ apiKey: process.env.WATCHNOC_API_KEY ?? 'pk_test' });

const app = express();
app.use(watchnocMiddleware());

app.get('/ping', (_req: Request, res: Response) => {
  log.info('ping');
  res.json({ ok: true });
});

app.listen(3001);
