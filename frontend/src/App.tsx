import { useMemo, useState } from 'react';

type ApiMsg = { message?: string };

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

async function callApi(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });

  const body = await response.json().catch(() => ({}));
  return { response, body };
}

export function App() {
  const [accountId, setAccountId] = useState('acc-test-12345');
  const [ownerName, setOwnerName] = useState('Jane Doe');
  const [currency, setCurrency] = useState('USD');
  const [initialBalance, setInitialBalance] = useState('0');

  const [amount, setAmount] = useState('10');
  const [description, setDescription] = useState('Sample transaction');
  const [transactionId, setTransactionId] = useState(`txn-${Date.now()}`);

  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [accountSummary, setAccountSummary] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any>(null);
  const [timestamp, setTimestamp] = useState(new Date().toISOString());
  const [balanceAt, setBalanceAt] = useState<any>(null);
  const [projectionStatus, setProjectionStatus] = useState<any>(null);

  const readableApiBase = useMemo(() => apiBase, []);

  const log = (text: string) => setStatusLog((prev) => [text, ...prev].slice(0, 20));

  async function createAccount() {
    const { response, body } = await callApi('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        accountId,
        ownerName,
        initialBalance: Number(initialBalance),
        currency
      })
    });
    log(`Create account -> ${response.status} ${(body as ApiMsg).message ?? ''}`);
  }

  async function deposit() {
    const { response, body } = await callApi(`/api/accounts/${accountId}/deposit`, {
      method: 'POST',
      body: JSON.stringify({ amount: Number(amount), description, transactionId })
    });
    log(`Deposit -> ${response.status} ${(body as ApiMsg).message ?? ''}`);
    setTransactionId(`txn-${Date.now()}`);
  }

  async function withdraw() {
    const { response, body } = await callApi(`/api/accounts/${accountId}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ amount: Number(amount), description, transactionId })
    });
    log(`Withdraw -> ${response.status} ${(body as ApiMsg).message ?? ''}`);
    setTransactionId(`txn-${Date.now()}`);
  }

  async function closeAccount() {
    const { response, body } = await callApi(`/api/accounts/${accountId}/close`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'User requested close' })
    });
    log(`Close account -> ${response.status} ${(body as ApiMsg).message ?? ''}`);
  }

  async function loadSummary() {
    const { response, body } = await callApi(`/api/accounts/${accountId}`);
    setAccountSummary(body);
    log(`Load summary -> ${response.status}`);
  }

  async function loadEvents() {
    const { response, body } = await callApi(`/api/accounts/${accountId}/events`);
    setEvents(Array.isArray(body) ? body : []);
    log(`Load events -> ${response.status}`);
  }

  async function loadTransactions(page = 1) {
    const { response, body } = await callApi(`/api/accounts/${accountId}/transactions?page=${page}&pageSize=10`);
    setTransactions(body);
    log(`Load transactions -> ${response.status}`);
  }

  async function loadBalanceAt() {
    const { response, body } = await callApi(`/api/accounts/${accountId}/balance-at/${encodeURIComponent(timestamp)}`);
    setBalanceAt(body);
    log(`Balance at -> ${response.status}`);
  }

  async function rebuildProjections() {
    const { response, body } = await callApi('/api/projections/rebuild', { method: 'POST' });
    log(`Rebuild projections -> ${response.status} ${(body as ApiMsg).message ?? ''}`);
  }

  async function loadProjectionStatus() {
    const { response, body } = await callApi('/api/projections/status');
    setProjectionStatus(body);
    log(`Projection status -> ${response.status}`);
  }

  return (
    <main className="shell">
      <h1>Bank Account ES + CQRS Demo</h1>
      <p className="hint">API base: {readableApiBase}</p>

      <section className="grid">
        <div className="card">
          <h2>Create Account</h2>
          <input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="accountId" />
          <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="ownerName" />
          <input value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} placeholder="initialBalance" />
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="currency" />
          <button onClick={createAccount}>Create</button>
        </div>

        <div className="card">
          <h2>Deposit / Withdraw</h2>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="amount" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="description" />
          <input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="transactionId" />
          <div className="row">
            <button onClick={deposit}>Deposit</button>
            <button onClick={withdraw}>Withdraw</button>
            <button onClick={closeAccount}>Close</button>
          </div>
        </div>

        <div className="card">
          <h2>Queries</h2>
          <div className="row">
            <button onClick={loadSummary}>Summary</button>
            <button onClick={loadEvents}>Events</button>
            <button onClick={() => loadTransactions(1)}>Transactions</button>
          </div>
          <input value={timestamp} onChange={(e) => setTimestamp(e.target.value)} placeholder="ISO timestamp" />
          <button onClick={loadBalanceAt}>Balance At Timestamp</button>
        </div>

        <div className="card">
          <h2>Projections</h2>
          <div className="row">
            <button onClick={rebuildProjections}>Rebuild</button>
            <button onClick={loadProjectionStatus}>Status</button>
          </div>
          <pre>{JSON.stringify(projectionStatus, null, 2)}</pre>
        </div>
      </section>

      <section className="grid">
        <div className="card"><h2>Account Summary</h2><pre>{JSON.stringify(accountSummary, null, 2)}</pre></div>
        <div className="card"><h2>Balance At</h2><pre>{JSON.stringify(balanceAt, null, 2)}</pre></div>
        <div className="card"><h2>Transactions</h2><pre>{JSON.stringify(transactions, null, 2)}</pre></div>
        <div className="card"><h2>Events</h2><pre>{JSON.stringify(events, null, 2)}</pre></div>
      </section>

      <section className="card">
        <h2>Action Log</h2>
        <ul>
          {statusLog.map((line, idx) => (
            <li key={`${line}-${idx}`}>{line}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
