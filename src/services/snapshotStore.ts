import { pool } from '../db/pool.js';
import { type AccountState } from '../types/domain.js';

export async function loadSnapshot(accountId: string): Promise<{ lastEventNumber: number; state: AccountState } | null> {
  const result = await pool.query(
    `
      SELECT snapshot_data, last_event_number
      FROM snapshots
      WHERE aggregate_id = $1
    `,
    [accountId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  const data = row.snapshot_data as any;
  return {
    lastEventNumber: Number(row.last_event_number),
    state: {
      ...data,
      processedTransactionIds: new Set<string>(data.processedTransactionIds ?? [])
    } as AccountState
  };
}

export async function upsertSnapshot(accountId: string, state: AccountState, lastEventNumber: number) {
  const snapshotData = {
    ...state,
    processedTransactionIds: Array.from(state.processedTransactionIds)
  };

  await pool.query(
    `
      INSERT INTO snapshots (aggregate_id, snapshot_data, last_event_number)
      VALUES ($1, $2::jsonb, $3)
      ON CONFLICT (aggregate_id)
      DO UPDATE SET snapshot_data = EXCLUDED.snapshot_data, last_event_number = EXCLUDED.last_event_number, created_at = NOW()
    `,
    [accountId, JSON.stringify(snapshotData), lastEventNumber]
  );
}
