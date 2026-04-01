import { type AccountState, type DomainEvent, emptyState } from '../types/domain.js';

export function applyEvent(state: AccountState, event: DomainEvent): AccountState {
  const next = {
    ...state,
    processedTransactionIds: new Set(state.processedTransactionIds),
    lastEventNumber: event.eventNumber
  };

  switch (event.eventType) {
    case 'AccountCreated': {
      return {
        ...next,
        exists: true,
        ownerName: String(event.eventData.ownerName),
        balance: Number(event.eventData.initialBalance),
        currency: String(event.eventData.currency),
        status: 'OPEN'
      };
    }
    case 'MoneyDeposited': {
      const txId = String(event.eventData.transactionId);
      next.processedTransactionIds.add(txId);
      return {
        ...next,
        balance: next.balance + Number(event.eventData.amount)
      };
    }
    case 'MoneyWithdrawn': {
      const txId = String(event.eventData.transactionId);
      next.processedTransactionIds.add(txId);
      return {
        ...next,
        balance: next.balance - Number(event.eventData.amount)
      };
    }
    case 'AccountClosed': {
      return {
        ...next,
        status: 'CLOSED'
      };
    }
    default:
      return next;
  }
}

export function rehydrate(accountId: string, events: DomainEvent[]): AccountState {
  let state = emptyState(accountId);
  for (const event of events) {
    state = applyEvent(state, event);
  }
  return state;
}
