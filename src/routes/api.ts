import { Router } from 'express';
import { ZodError } from 'zod';
import { pool } from '../db/pool.js';
import {
  HttpError,
  closeAccount,
  createAccount,
  depositMoney,
  formatValidationError,
  loadAccountState,
  withdrawMoney
} from '../services/accountService.js';
import { loadEventsByAggregate } from '../services/eventStore.js';
import { getProjectionStatus, rebuildProjections } from '../services/projectionService.js';

export const apiRouter = Router();

function handleError(res: any, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: formatValidationError(error) });
  }

  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (typeof error === 'object' && error && 'code' in error && (error as any).code === '23505') {
    return res.status(409).json({ message: 'Conflict while writing event.' });
  }

  console.error(error);
  return res.status(500).json({ message: 'Internal server error.' });
}

apiRouter.post('/accounts', async (req, res) => {
  try {
    await createAccount(req.body);
    return res.status(202).json({ message: 'Command accepted.' });
  } catch (error) {
    return handleError(res, error);
  }
});

apiRouter.post('/accounts/:accountId/deposit', async (req, res) => {
  try {
    await depositMoney(req.params.accountId, req.body);
    return res.status(202).json({ message: 'Command accepted.' });
  } catch (error) {
    return handleError(res, error);
  }
});

apiRouter.post('/accounts/:accountId/withdraw', async (req, res) => {
  try {
    await withdrawMoney(req.params.accountId, req.body);
    return res.status(202).json({ message: 'Command accepted.' });
  } catch (error) {
    return handleError(res, error);
  }
});

apiRouter.post('/accounts/:accountId/close', async (req, res) => {
  try {
    await closeAccount(req.params.accountId, req.body);
    return res.status(202).json({ message: 'Command accepted.' });
  } catch (error) {
    return handleError(res, error);
  }
});

apiRouter.get('/accounts/:accountId', async (req, res) => {
  const result = await pool.query(
    `
      SELECT account_id, owner_name, balance, currency, status
      FROM account_summaries
      WHERE account_id = $1
    `,
    [req.params.accountId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ message: 'Account not found.' });
  }

  const row = result.rows[0];
  return res.status(200).json({
    accountId: row.account_id,
    ownerName: row.owner_name,
    balance: Number(row.balance),
    currency: row.currency,
    status: row.status
  });
});

apiRouter.get('/accounts/:accountId/events', async (req, res) => {
  const events = await loadEventsByAggregate(req.params.accountId);

  return res.status(200).json(
    events.map((event) => ({
      eventId: event.eventId,
      eventType: event.eventType,
      eventNumber: event.eventNumber,
      data: event.eventData,
      timestamp: event.timestamp
    }))
  );
});

apiRouter.get('/accounts/:accountId/balance-at/:timestamp', async (req, res) => {
  const parsed = new Date(decodeURIComponent(req.params.timestamp));

  if (Number.isNaN(parsed.getTime())) {
    return res.status(400).json({ message: 'Invalid timestamp.' });
  }

  const state = await loadAccountState(req.params.accountId, parsed.toISOString());

  if (!state.exists) {
    return res.status(404).json({ message: 'Account not found.' });
  }

  return res.status(200).json({
    accountId: req.params.accountId,
    balanceAt: Number(state.balance.toFixed(4)),
    timestamp: parsed.toISOString()
  });
});

apiRouter.get('/accounts/:accountId/transactions', async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize ?? 10), 1), 100);
  const offset = (page - 1) * pageSize;

  const countResult = await pool.query(
    `
      SELECT COUNT(*)::bigint AS total_count
      FROM transaction_history
      WHERE account_id = $1
    `,
    [req.params.accountId]
  );

  const totalCount = Number(countResult.rows[0].total_count);

  const itemsResult = await pool.query(
    `
      SELECT transaction_id, type, amount, description, timestamp
      FROM transaction_history
      WHERE account_id = $1
      ORDER BY timestamp DESC
      OFFSET $2 LIMIT $3
    `,
    [req.params.accountId, offset, pageSize]
  );

  return res.status(200).json({
    currentPage: page,
    pageSize,
    totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize),
    totalCount,
    items: itemsResult.rows.map((row: any) => ({
      transactionId: row.transaction_id,
      type: row.type,
      amount: Number(row.amount),
      description: row.description,
      timestamp: new Date(row.timestamp).toISOString()
    }))
  });
});

apiRouter.post('/projections/rebuild', async (_req, res) => {
  try {
    await rebuildProjections();
    return res.status(202).json({ message: 'Projection rebuild initiated.' });
  } catch (error) {
    return handleError(res, error);
  }
});

apiRouter.get('/projections/status', async (_req, res) => {
  try {
    const status = await getProjectionStatus();
    return res.status(200).json(status);
  } catch (error) {
    return handleError(res, error);
  }
});
