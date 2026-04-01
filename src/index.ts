import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { apiRouter } from './routes/api.js';
import { pool } from './db/pool.js';
import { startProjector } from './services/projectionService.js';

dotenv.config();

const app = express();
const apiPort = Number(process.env.API_PORT ?? 8080);

app.use(cors());
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ status: 'ok' });
  } catch {
    return res.status(503).json({ status: 'db-unavailable' });
  }
});

app.use('/api', apiRouter);

app.listen(apiPort, () => {
  startProjector();
  console.log(`Bank ES/CQRS API listening on port ${apiPort}`);
});
