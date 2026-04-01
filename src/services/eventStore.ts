import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { type DomainEvent } from '../types/domain.js';

function mapEvent(row: any): DomainEvent {
  return {
    eventId: row.event_id,
    aggregateId: row.aggregate_id,
    aggregateType: row.aggregate_type,
    eventType: row.event_type,
    eventData: row.event_data,
    eventNumber: row.event_number,
    timestamp: new Date(row.timestamp).toISOString(),
    version: row.version,
    globalPosition: Number(row.global_position)
  };
}

export async function loadEventsByAggregate(
  accountId: string,
  afterEventNumber = 0,
  upToTimestamp?: string
): Promise<DomainEvent[]> {
  const values: unknown[] = [accountId, afterEventNumber];
  let sql = `
    SELECT global_position, event_id, aggregate_id, aggregate_type, event_type, event_data, event_number, timestamp, version
    FROM events
    WHERE aggregate_id = $1 AND event_number > $2
  `;

  if (upToTimestamp) {
    values.push(upToTimestamp);
    sql += ' AND timestamp <= $3';
  }

  sql += ' ORDER BY event_number ASC';

  const result = await pool.query(sql, values);
  return result.rows.map(mapEvent);
}

export async function loadAllEventsAfter(globalPosition: number): Promise<DomainEvent[]> {
  const result = await pool.query(
    `
      SELECT global_position, event_id, aggregate_id, aggregate_type, event_type, event_data, event_number, timestamp, version
      FROM events
      WHERE global_position > $1
      ORDER BY global_position ASC
      LIMIT 500
    `,
    [globalPosition]
  );

  return result.rows.map(mapEvent);
}

export async function appendEvent(params: {
  aggregateId: string;
  eventType: DomainEvent['eventType'];
  eventData: Record<string, unknown>;
  expectedEventNumber: number;
}) {
  const eventId = randomUUID();
  const { aggregateId, eventType, eventData, expectedEventNumber } = params;

  const result = await pool.query(
    `
      INSERT INTO events (event_id, aggregate_id, aggregate_type, event_type, event_data, event_number)
      VALUES ($1, $2, 'BankAccount', $3, $4::jsonb, $5)
      RETURNING global_position, event_id, aggregate_id, aggregate_type, event_type, event_data, event_number, timestamp, version
    `,
    [eventId, aggregateId, eventType, JSON.stringify(eventData), expectedEventNumber]
  );

  return mapEvent(result.rows[0]);
}

export async function getTotalEventsInStore(): Promise<number> {
  const result = await pool.query('SELECT COUNT(*)::bigint AS count FROM events');
  return Number(result.rows[0].count);
}
