import { ZodError, z } from 'zod';
import { applyEvent } from '../domain/account.js';
import { type AccountState, emptyState } from '../types/domain.js';
import { appendEvent, loadEventsByAggregate } from './eventStore.js';
import { loadSnapshot, upsertSnapshot } from './snapshotStore.js';

const createAccountSchema = z.object({
  accountId: z.string().min(1),
  ownerName: z.string().min(1),
  initialBalance: z.number().min(0),
  currency: z.string().length(3)
});

const moneySchema = z.object({
  amount: z.number().positive(),
  description: z.string().optional().default(''),
  transactionId: z.string().min(1)
});

const closeSchema = z.object({
  reason: z.string().optional().default('')
});

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function formatValidationError(err: ZodError): string {
  return err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
}

export async function loadAccountState(accountId: string, upToTimestamp?: string): Promise<AccountState> {
  const snapshot = await loadSnapshot(accountId);
  let state = snapshot?.state ?? emptyState(accountId);
  const afterEventNumber = snapshot?.lastEventNumber ?? 0;
  const events = await loadEventsByAggregate(accountId, afterEventNumber, upToTimestamp);

  for (const event of events) {
    state = applyEvent(state, event);
  }

  return state;
}

async function maybeSnapshot(accountId: string, eventNumber: number, state: AccountState) {
  // Requirement allows 50 or 51 boundary; we use 51st/101st/... trigger.
  if ((eventNumber - 1) % 50 === 0 && eventNumber > 1) {
    await upsertSnapshot(accountId, state, eventNumber - 1);
  }
}

export async function createAccount(input: unknown) {
  const cmd = createAccountSchema.parse(input);
  const current = await loadAccountState(cmd.accountId);

  if (current.exists) {
    throw new HttpError(409, 'Account already exists.');
  }

  const event = await appendEvent({
    aggregateId: cmd.accountId,
    eventType: 'AccountCreated',
    eventData: {
      accountId: cmd.accountId,
      ownerName: cmd.ownerName,
      initialBalance: Number(cmd.initialBalance.toFixed(4)),
      currency: cmd.currency.toUpperCase()
    },
    expectedEventNumber: 1
  });

  const next = applyEvent(emptyState(cmd.accountId), event);
  await maybeSnapshot(cmd.accountId, event.eventNumber, next);
}

export async function depositMoney(accountId: string, input: unknown) {
  const cmd = moneySchema.parse(input);
  const current = await loadAccountState(accountId);

  if (!current.exists) {
    throw new HttpError(404, 'Account not found.');
  }

  if (current.status === 'CLOSED') {
    throw new HttpError(409, 'Account is closed.');
  }

  if (current.processedTransactionIds.has(cmd.transactionId)) {
    throw new HttpError(409, 'Duplicate transactionId.');
  }

  const event = await appendEvent({
    aggregateId: accountId,
    eventType: 'MoneyDeposited',
    eventData: {
      amount: Number(cmd.amount.toFixed(4)),
      description: cmd.description,
      transactionId: cmd.transactionId
    },
    expectedEventNumber: current.lastEventNumber + 1
  });

  const next = applyEvent(current, event);
  await maybeSnapshot(accountId, event.eventNumber, next);
}

export async function withdrawMoney(accountId: string, input: unknown) {
  const cmd = moneySchema.parse(input);
  const current = await loadAccountState(accountId);

  if (!current.exists) {
    throw new HttpError(404, 'Account not found.');
  }

  if (current.status === 'CLOSED') {
    throw new HttpError(409, 'Account is closed.');
  }

  if (current.processedTransactionIds.has(cmd.transactionId)) {
    throw new HttpError(409, 'Duplicate transactionId.');
  }

  if (current.balance < cmd.amount) {
    throw new HttpError(409, 'Insufficient funds.');
  }

  const event = await appendEvent({
    aggregateId: accountId,
    eventType: 'MoneyWithdrawn',
    eventData: {
      amount: Number(cmd.amount.toFixed(4)),
      description: cmd.description,
      transactionId: cmd.transactionId
    },
    expectedEventNumber: current.lastEventNumber + 1
  });

  const next = applyEvent(current, event);
  await maybeSnapshot(accountId, event.eventNumber, next);
}

export async function closeAccount(accountId: string, input: unknown) {
  const cmd = closeSchema.parse(input);
  void cmd;
  const current = await loadAccountState(accountId);

  if (!current.exists) {
    throw new HttpError(404, 'Account not found.');
  }

  if (current.balance !== 0) {
    throw new HttpError(409, 'Account balance must be zero before closing.');
  }

  if (current.status === 'CLOSED') {
    throw new HttpError(409, 'Account already closed.');
  }

  const event = await appendEvent({
    aggregateId: accountId,
    eventType: 'AccountClosed',
    eventData: {
      reason: cmd.reason
    },
    expectedEventNumber: current.lastEventNumber + 1
  });

  const next = applyEvent(current, event);
  await maybeSnapshot(accountId, event.eventNumber, next);
}
