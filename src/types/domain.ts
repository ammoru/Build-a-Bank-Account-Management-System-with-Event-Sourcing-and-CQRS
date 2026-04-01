export type AccountStatus = 'OPEN' | 'CLOSED';

export type EventType =
  | 'AccountCreated'
  | 'MoneyDeposited'
  | 'MoneyWithdrawn'
  | 'AccountClosed';

export type DomainEvent = {
  eventId: string;
  aggregateId: string;
  aggregateType: 'BankAccount';
  eventType: EventType;
  eventData: Record<string, unknown>;
  eventNumber: number;
  timestamp: string;
  version: number;
  globalPosition: number;
};

export type AccountState = {
  exists: boolean;
  accountId: string;
  ownerName: string;
  balance: number;
  currency: string;
  status: AccountStatus;
  lastEventNumber: number;
  processedTransactionIds: Set<string>;
};

export const emptyState = (accountId: string): AccountState => ({
  exists: false,
  accountId,
  ownerName: '',
  balance: 0,
  currency: 'USD',
  status: 'OPEN',
  lastEventNumber: 0,
  processedTransactionIds: new Set<string>()
});
