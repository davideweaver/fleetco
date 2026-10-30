import { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import type { Customer, CustomerStatus, Principal } from '../types';
import { EventStream } from './EventStream';
import { ProblemView } from './Problem';

const STATUSES: CustomerStatus[] = ['prospect', 'active', 'inactive'];
const TERMS = [0, 15, 30, 45, 60];

export function CustomersPanel({
  principal,
  customers,
  reload,
  loadError,
}: {
  principal: Principal;
  customers: Customer[];
  reload: (params?: { status?: string; search?: string }) => void;
  loadError: unknown;
}): React.ReactElement {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  const selected = customers.find((customer) => customer.id === selectedId) ?? null;

  // A selection made as one principal may not be visible as the next.
  useEffect(() => {
    if (selectedId !== null && !customers.some((customer) => customer.id === selectedId)) {
      setSelectedId(null);
    }
  }, [customers, selectedId]);

  const refresh = useCallback(() => {
    setActionError(null);
    reload({ status, search });
  }, [reload, status, search]);

  async function act<T>(work: () => Promise<T>, success: string): Promise<void> {
    setActionError(null);
    setNote(null);
    try {
      await work();
      setNote(success);
      reload({ status, search });
    } catch (error) {
      setActionError(error);
    }
  }

  return (
    <div className="split">
      <div>
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>Customers ({customers.length})</h3>
          <div className="row">
            <div className="col">
              <label>status</label>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">any</option>
                {STATUSES.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
            <div className="col grow">
              <label>search code or name</label>
              <input value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <button onClick={refresh}>apply</button>
          </div>

          <ProblemView error={loadError} />

          <table style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>code</th>
                <th>name</th>
                <th>status</th>
                <th>terms</th>
                <th>credit</th>
                <th>hold</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  aria-selected={customer.id === selectedId}
                  onClick={() => setSelectedId(customer.id)}
                >
                  <td className="mono">{customer.code}</td>
                  <td>{customer.name}</td>
                  <td><span className={`pill ${customer.status}`}>{customer.status}</span></td>
                  <td>net {customer.billingTermsNetDays}</td>
                  <td className="mono">{money(customer.creditLimitCents)}</td>
                  <td>{customer.isOnCreditHold ? <span className="pill hold">hold</span> : ''}</td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={6} className="dim">no customers visible to this principal</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <CreateCustomer principal={principal} onDone={refresh} />
      </div>

      <div>
        {note !== null && <div className="ok-note">{note}</div>}
        <ProblemView error={actionError} />

        {selected === null ? (
          <div className="card"><h3>Detail</h3><p className="dim">Select a customer.</p></div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 14 }}>
              <h3>{selected.code} — {selected.name}</h3>
              <p className="id">{selected.id}</p>

              <div className="row" style={{ marginBottom: 10 }}>
                <div className="col">
                  <label>status transition</label>
                  <select
                    value={selected.status}
                    onChange={(event) =>
                      void act(
                        () => api.update('customers', principal, selected.id, { status: event.target.value }),
                        `status → ${event.target.value}`,
                      )
                    }
                  >
                    {STATUSES.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() =>
                    void act(
                      () =>
                        api.update('customers', principal, selected.id, {
                          isOnCreditHold: !selected.isOnCreditHold,
                        }),
                      selected.isOnCreditHold ? 'credit hold cleared' : 'placed on credit hold',
                    )
                  }
                >
                  {selected.isOnCreditHold ? 'clear credit hold' : 'place on credit hold'}
                </button>

                {/*
                  Both fields in ONE request, which is the only way to see the
                  design: the patch is evaluated as a single resulting state,
                  not as a sequence, so clearing the hold and activating
                  together is allowed even though activating alone is refused.
                  Two separate buttons can never demonstrate that.
                */}
                <button
                  disabled={!selected.isOnCreditHold}
                  onClick={() =>
                    void act(
                      () =>
                        api.update('customers', principal, selected.id, {
                          isOnCreditHold: false,
                          status: 'active',
                        }),
                      'hold cleared and activated in one patch',
                    )
                  }
                >
                  clear hold + activate (one patch)
                </button>
              </div>
              <p className="hint">
                Try activating a customer that is on credit hold, or moving an active one back to
                prospect — both are refused by the service, not the database.
              </p>

              <EditCustomer
                principal={principal}
                customer={selected}
                onDone={(message) => void act(() => Promise.resolve(), message)}
                onError={setActionError}
              />
            </div>

            <EventStream
              resource="customers"
              principal={principal}
              id={selected.id}
              label={selected.code}
            />
          </>
        )}
      </div>
    </div>
  );
}

function EditCustomer({
  principal,
  customer,
  onDone,
  onError,
}: {
  principal: Principal;
  customer: Customer;
  onDone: (message: string) => void;
  onError: (error: unknown) => void;
}): React.ReactElement {
  const [name, setName] = useState(customer.name);
  const [creditLimitCents, setCreditLimit] = useState(String(customer.creditLimitCents));
  const [laborRateCents, setLaborRate] = useState(String(customer.defaultLaborRateCents));
  const [terms, setTerms] = useState(String(customer.billingTermsNetDays));

  useEffect(() => {
    setName(customer.name);
    setCreditLimit(String(customer.creditLimitCents));
    setLaborRate(String(customer.defaultLaborRateCents));
    setTerms(String(customer.billingTermsNetDays));
  }, [customer]);

  async function save(): Promise<void> {
    try {
      await api.update('customers', principal, customer.id, {
        name,
        creditLimitCents: Number(creditLimitCents),
        defaultLaborRateCents: Number(laborRateCents),
        billingTermsNetDays: Number(terms),
      });
      onDone('saved');
    } catch (error) {
      onError(error);
    }
  }

  return (
    <div className="row">
      <div className="col grow">
        <label>name</label>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="col">
        <label>credit limit (cents)</label>
        <input style={{ width: 110 }} value={creditLimitCents} onChange={(event) => setCreditLimit(event.target.value)} />
      </div>
      <div className="col">
        <label>labor rate (cents/hr)</label>
        <input style={{ width: 110 }} value={laborRateCents} onChange={(event) => setLaborRate(event.target.value)} />
      </div>
      <div className="col">
        <label>net days</label>
        <select value={terms} onChange={(event) => setTerms(event.target.value)}>
          {TERMS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <button className="primary" onClick={() => void save()}>save</button>
    </div>
  );
}

function CreateCustomer({
  principal,
  onDone,
}: {
  principal: Principal;
  onDone: () => void;
}): React.ReactElement {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [creditLimitCents, setCreditLimit] = useState('500000');
  const [laborRateCents, setLaborRate] = useState('14500');
  const [terms, setTerms] = useState('30');
  const [error, setError] = useState<unknown>(null);

  async function submit(): Promise<void> {
    setError(null);
    try {
      await api.create('customers', principal, {
        code,
        name,
        creditLimitCents: Number(creditLimitCents),
        defaultLaborRateCents: Number(laborRateCents),
        billingTermsNetDays: Number(terms),
      });
      setCode('');
      setName('');
      onDone();
    } catch (failure) {
      setError(failure);
    }
  }

  return (
    <div className="card">
      <h3>Add a customer</h3>
      <div className="row">
        <div className="col">
          <label>code</label>
          <input style={{ width: 110 }} value={code} onChange={(event) => setCode(event.target.value)} placeholder="ACME" />
        </div>
        <div className="col grow">
          <label>name</label>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Trucking" />
        </div>
        <div className="col">
          <label>credit limit (cents)</label>
          <input style={{ width: 110 }} value={creditLimitCents} onChange={(event) => setCreditLimit(event.target.value)} />
        </div>
        <div className="col">
          <label>labor rate (cents/hr)</label>
          <input style={{ width: 110 }} value={laborRateCents} onChange={(event) => setLaborRate(event.target.value)} />
        </div>
        <div className="col">
          <label>net days</label>
          <select value={terms} onChange={(event) => setTerms(event.target.value)}>
            {TERMS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <button className="primary" onClick={() => void submit()} disabled={code === '' || name === ''}>
          create
        </button>
      </div>
      <p className="hint">
        Every customer starts as a <code>prospect</code>. Net terms above zero with a zero credit
        limit is refused; a labor rate over $1,000/hr is refused as a cents mix-up.
      </p>
      <ProblemView error={error} />
    </div>
  );
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}
