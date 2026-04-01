import { pool } from '../db/pool.js';
import { type DomainEvent } from '../types/domain.js';
import { getTotalEventsInStore, loadAllEventsAfter } from './eventStore.js';

type ProjectionName = 'AccountSummaries' | 'TransactionHistory';

let running = false;

async function withProjectionEventDedup(projectionName: ProjectionName, event: DomainEvent, fn: () => Promise<void>) {
  const inserted = await pool.query(
    `
      INSERT INTO processed_events (projection_name, event_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING event_id
    `,
    [projectionName, event.eventId]
  );

  if (inserted.rowCount === 0) {
    return;
  }

  await fn();
}

async function projectAccountSummaries(event: DomainEvent) {
  await withProjectionEventDedup('AccountSummaries', event, async () => {
    if (event.eventType === 'AccountCreated') {
      await pool.query(
        `
          INSERT INTO account_summaries (account_id, owner_name, balance, currency, status, version)
          VALUES ($1, $2, $3, $4, 'OPEN', $5)
          ON CONFLICT (account_id) DO UPDATE SET
            owner_name = EXCLUDED.owner_name,
            balance = EXCLUDED.balance,
            currency = EXCLUDED.currency,
            status = EXCLUDED.status,
            version = EXCLUDED.version
        `,
        [
          event.aggregateId,
          String(event.eventData.ownerName),
          Number(event.eventData.initialBalance),
          String(event.eventData.currency),
          event.eventNumber
        ]
      );
    }

    if (event.eventType === 'MoneyDeposited') {
      await pool.query(
        `
          UPDATE account_summaries
          SET balance = balance + $1, version = $2
          WHERE account_id = $3
        `,
        [Number(event.eventData.amount), event.eventNumber, event.aggregateId]
      );
    }

    if (event.eventType === 'MoneyWithdrawn') {
      await pool.query(
        `
          UPDATE account_summaries
          SET balance = balance - $1, version = $2
          WHERE account_id = $3
        `,
        [Number(event.eventData.amount), event.eventNumber, event.aggregateId]
      );
    }

    if (event.eventType === 'AccountClosed') {
      await pool.query(
        `
          UPDATE account_summaries
          SET status = 'CLOSED', version = $1
          WHERE account_id = $2
        `,
        [event.eventNumber, event.aggregateId]
      );
    }
  });

  await pool.query(
    `
      UPDATE projection_checkpoints
      SET last_processed_global_position = GREATEST(last_processed_global_position, $1), updated_at = NOW()
      WHERE projection_name = 'AccountSummaries'
    `,
    [event.globalPosition]
  );
}

async function projectTransactionHistory(event: DomainEvent) {
  await withProjectionEventDedup('TransactionHistory', event, async () => {
    if (event.eventType === 'MoneyDeposited' || event.eventType === 'MoneyWithdrawn') {
      await pool.query(
        `
          INSERT INTO transaction_history (transaction_id, account_id, type, amount, description, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (transaction_id) DO NOTHING
        `,
        [
          String(event.eventData.transactionId),
          event.aggregateId,
          event.eventType === 'MoneyDeposited' ? 'DEPOSIT' : 'WITHDRAW',
          Number(event.eventData.amount),
          String(event.eventData.description ?? ''),
          event.timestamp
        ]
      );
    }
  });

  await pool.query(
    `
      UPDATE projection_checkpoints
      SET last_processed_global_position = GREATEST(last_processed_global_position, $1), updated_at = NOW()
      WHERE projection_name = 'TransactionHistory'
    `,
    [event.globalPosition]
  );
}

async function projectEvent(event: DomainEvent) {
  await projectAccountSummaries(event);
  await projectTransactionHistory(event);
}

export async function runProjectorBatch() {
  const checkpointResult = await pool.query(
    `
      SELECT MIN(last_processed_global_position) AS min_pos
      FROM projection_checkpoints
    `
  );

  const minPos = Number(checkpointResult.rows[0].min_pos ?? 0);
  const events = await loadAllEventsAfter(minPos);

  for (const event of events) {
    await projectEvent(event);
  }
}

export function startProjector() {
  if (running) {
    return;
  }

  running = true;

  setInterval(async () => {
    try {
      await runProjectorBatch();
    } catch (error) {
      console.error('Projector loop error:', error);
    }
  }, 400);
}

export async function rebuildProjections() {
  await pool.query('TRUNCATE TABLE account_summaries, transaction_history, processed_events');
  await pool.query("UPDATE projection_checkpoints SET last_processed_global_position = 0, updated_at = NOW()");
  await runProjectorBatch();
}

export async function getProjectionStatus() {
  const totalEventsInStore = await getTotalEventsInStore();
  const maxPosResult = await pool.query('SELECT COALESCE(MAX(global_position), 0) AS max_pos FROM events');
  const maxPos = Number(maxPosResult.rows[0].max_pos);
  const checkpoints = await pool.query(
    `
      SELECT projection_name, last_processed_global_position
      FROM projection_checkpoints
      ORDER BY projection_name ASC
    `
  );

  return {
    totalEventsInStore,
    projections: checkpoints.rows.map((row: any) => {
      const processed = Number(row.last_processed_global_position);
      return {
        name: row.projection_name,
        lastProcessedEventNumberGlobal: processed,
        lag: Math.max(maxPos - processed, 0)
      };
    })
  };
}
