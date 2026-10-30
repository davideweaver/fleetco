import { useCallback, useEffect, useState } from 'react';

import { api } from './api';
import type { Customer, Principal } from './types';
import { CustomersPanel } from './components/CustomersPanel';
import { PrincipalBar } from './components/PrincipalBar';
import { VehiclesPanel } from './components/VehiclesPanel';
import { WorkOrdersPanel } from './components/WorkOrdersPanel';

const STORAGE_KEY = 'fleetco.principal';

const EMPTY_PRINCIPAL: Principal = {
  userId: '00000000-0000-7000-8000-000000000001',
  tenantId: '',
  role: 'staff',
};

/**
 * The customers list is loaded once, here, and handed to both panels — the
 * vehicles panel needs it to name fleets and to populate its fleet picker.
 *
 * That is the UI's version of the dependency the backend has: `vehicles` cannot
 * read `customers.customers`, so it asks the customers module. Here the client
 * asks the customers *endpoint*, and gets the same tenant scoping for free.
 */
export function App(): React.ReactElement {
  const [principal, setPrincipal] = useState<Principal>(loadPrincipal);
  const [tab, setTab] = useState<'customers' | 'vehicles' | 'work-orders'>('customers');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [health, setHealth] = useState<string>('…');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(principal));
  }, [principal]);

  const reload = useCallback(
    (params: { status?: string; search?: string } = {}) => {
      if (principal.tenantId === '') {
        setCustomers([]);
        return;
      }
      setLoadError(null);
      api
        .list<Customer>('customers', principal, { limit: 100, ...params })
        .then((page) => setCustomers(page.items))
        .catch((error: unknown) => {
          setCustomers([]);
          setLoadError(error);
        });
    },
    [principal],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const tick = (): void => {
      api
        .health()
        .then((result) => setHealth(`${result.status} · outbox pending ${result.outboxPending}`))
        .catch(() => setHealth('unreachable — is the API running on :3000?'));
    };
    tick();
    const timer = setInterval(tick, 5_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <header className="top">
        <h1>Fleetco — module harness</h1>
        <span className="dim" style={{ fontSize: 12 }}>
          customers · vehicles · work orders on NestJS
        </span>
        <span className="health">{health}</span>
      </header>

      <div className="tabs">
        <button aria-selected={tab === 'customers'} onClick={() => setTab('customers')}>
          Customers
        </button>
        <button aria-selected={tab === 'vehicles'} onClick={() => setTab('vehicles')}>
          Vehicles
        </button>
        <button aria-selected={tab === 'work-orders'} onClick={() => setTab('work-orders')}>
          Work orders
        </button>
      </div>

      <main>
        <div className="panel">
          <PrincipalBar principal={principal} onChange={setPrincipal} customers={customers} />

          {principal.tenantId === '' ? (
            <div className="card">
              <h3>Pick a tenant</h3>
              <p className="dim">
                Choose a seeded tenant above, or paste a tenant id. Every request needs a
                principal — there is no unauthenticated view of tenant data, by design.
              </p>
            </div>
          ) : tab === 'customers' ? (
            <CustomersPanel
              principal={principal}
              customers={customers}
              reload={reload}
              loadError={loadError}
            />
          ) : tab === 'vehicles' ? (
            <VehiclesPanel principal={principal} customers={customers} />
          ) : (
            <WorkOrdersPanel principal={principal} customers={customers} />
          )}
        </div>
      </main>
    </>
  );
}

function loadPrincipal(): Principal {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === null) return EMPTY_PRINCIPAL;
  try {
    return { ...EMPTY_PRINCIPAL, ...(JSON.parse(stored) as Partial<Principal>) };
  } catch {
    return EMPTY_PRINCIPAL;
  }
}
