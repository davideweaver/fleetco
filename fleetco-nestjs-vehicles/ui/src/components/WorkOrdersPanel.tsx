import { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import type {
  Customer,
  LineKind,
  Principal,
  Vehicle,
  WorkOrder,
  WorkOrderDetail,
  WorkOrderStatus,
} from '../types';
import { EventStream } from './EventStream';
import { ProblemView } from './Problem';

const STATUSES: WorkOrderStatus[] = [
  'draft',
  'authorized',
  'in_progress',
  'completed',
  'cancelled',
];
const KINDS: LineKind[] = ['labor', 'part'];

export function WorkOrdersPanel({
  principal,
  customers,
}: {
  principal: Principal;
  customers: Customer[];
}): React.ReactElement {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [fleet, setFleet] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    try {
      const [page, vehiclePage] = await Promise.all([
        api.list<WorkOrder>('work-orders', principal, {
          limit: 100,
          status,
          customerId: fleet,
          search,
        }),
        api.list<Vehicle>('vehicles', principal, { limit: 100 }),
      ]);
      setOrders(page.items);
      setVehicles(vehiclePage.items);
    } catch (error) {
      setOrders([]);
      setLoadError(error);
    }
  }, [principal, status, fleet, search]);

  useEffect(() => {
    void load();
  }, [principal.tenantId, principal.role, principal.customerId]);

  // The detail endpoint is the only one that returns the lines, so a selection
  // means a second fetch rather than a lookup in the list.
  const loadDetail = useCallback(
    async (id: string): Promise<void> => {
      setActionError(null);
      try {
        setDetail(await api.get<WorkOrderDetail>('work-orders', principal, id));
      } catch (error) {
        setDetail(null);
        setActionError(error);
      }
    },
    [principal],
  );

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (selectedId !== null && !orders.some((order) => order.id === selectedId)) {
      setSelectedId(null);
    }
  }, [orders, selectedId]);

  async function act<T>(work: () => Promise<T>, success: string): Promise<void> {
    setActionError(null);
    setNote(null);
    try {
      await work();
      setNote(success);
      await load();
      if (selectedId !== null) await loadDetail(selectedId);
    } catch (error) {
      setActionError(error);
    }
  }

  const vehicleLabel = (id: string): string =>
    vehicles.find((vehicle) => vehicle.id === id)?.unitNumber ?? id.slice(0, 8);
  const fleetLabel = (id: string): string =>
    customers.find((customer) => customer.id === id)?.code ?? id.slice(0, 8);

  return (
    <div className="split">
      <div>
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>Work orders ({orders.length})</h3>
          <div className="row">
            <div className="col">
              <label>fleet</label>
              <select value={fleet} onChange={(event) => setFleet(event.target.value)}>
                <option value="">any</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.code}</option>
                ))}
              </select>
            </div>
            <div className="col">
              <label>status</label>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">any</option>
                {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div className="col grow">
              <label>search number or complaint</label>
              <input value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <button onClick={() => void load()}>apply</button>
          </div>

          <ProblemView error={loadError} />

          <table style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>number</th>
                <th>fleet</th>
                <th>unit</th>
                <th>status</th>
                <th>total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  aria-selected={order.id === selectedId}
                  onClick={() => setSelectedId(order.id)}
                >
                  <td className="mono">{order.number}</td>
                  <td className="mono">{fleetLabel(order.customerId)}</td>
                  <td className="mono">{vehicleLabel(order.vehicleId)}</td>
                  <td><span className={`pill ${order.status}`}>{order.status}</span></td>
                  <td className="mono">{money(order.totalCents)}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={5} className="dim">no work orders visible to this principal</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <CreateWorkOrder
          principal={principal}
          vehicles={vehicles}
          fleetLabel={fleetLabel}
          onDone={() => void load()}
        />
      </div>

      <div>
        {note !== null && <div className="ok-note">{note}</div>}
        <ProblemView error={actionError} />

        {detail === null ? (
          <div className="card"><h3>Detail</h3><p className="dim">Select a work order.</p></div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 14 }}>
              <h3>{detail.number} — {money(detail.totalCents)}</h3>
              <p className="id">{detail.id}</p>
              <p className="hint" style={{ marginTop: 0 }}>
                fleet <code>{fleetLabel(detail.customerId)}</code> · unit{' '}
                <code>{vehicleLabel(detail.vehicleId)}</code>
                {detail.authorizedAt !== null && <> · authorized</>}
                {detail.closedAt !== null && <> · closed</>}
              </p>
              <p className="dim" style={{ fontSize: 13 }}>{detail.complaint}</p>

              <div className="row">
                <div className="col">
                  <label>status transition</label>
                  <select
                    value={detail.status}
                    onChange={(event) =>
                      void act(
                        () =>
                          api.update('work-orders', principal, detail.id, {
                            status: event.target.value,
                          }),
                        `status → ${event.target.value}`,
                      )
                    }
                  >
                    {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
              </div>
              <p className="hint">
                Authorizing needs at least one line, an active fleet, and no credit hold — the
                last two cross the module boundary into <code>customers</code>. Both{' '}
                <code>completed</code> and <code>cancelled</code> are terminal.
              </p>
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
              <h3>Lines ({detail.lines.length})</h3>
              <table className="lines">
                <thead>
                  <tr>
                    <th>kind</th>
                    <th>description</th>
                    <th>qty</th>
                    <th>unit</th>
                    <th>amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
                    <tr key={line.id}>
                      <td><span className="pill">{line.kind}</span></td>
                      <td>{line.description}</td>
                      <td className="mono">{(line.quantity / 100).toFixed(2)}</td>
                      <td className="mono">{money(line.unitPriceCents)}</td>
                      <td className="mono">{money(line.amountCents)}</td>
                      <td>
                        <button
                          className="icon"
                          title="remove line"
                          aria-label={`remove ${line.description}`}
                          onClick={() =>
                            void act(
                              () => api.removeLine(principal, detail.id, line.id),
                              'line removed, order re-totalled',
                            )
                          }
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  {detail.lines.length === 0 && (
                    <tr><td colSpan={6} className="dim">no lines — the order cannot be authorized</td></tr>
                  )}
                </tbody>
              </table>

              <AddLine
                principal={principal}
                orderId={detail.id}
                onDone={() => void act(() => Promise.resolve(), 'line added, order re-totalled')}
                onError={setActionError}
              />
              <p className="hint">
                Quantity is hundredths — <code>150</code> is 1.5 hours. Lines are only editable
                while the order is <code>draft</code> or <code>authorized</code>.
              </p>
            </div>

            <EventStream
              resource="work-orders"
              principal={principal}
              id={detail.id}
              label={detail.number}
            />
          </>
        )}
      </div>
    </div>
  );
}

function AddLine({
  principal,
  orderId,
  onDone,
  onError,
}: {
  principal: Principal;
  orderId: string;
  onDone: () => void;
  onError: (error: unknown) => void;
}): React.ReactElement {
  const [kind, setKind] = useState<string>('labor');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [unitPriceCents, setUnitPrice] = useState('14500');

  async function submit(): Promise<void> {
    try {
      await api.addLine(principal, orderId, {
        kind,
        description,
        quantity: Number(quantity),
        unitPriceCents: Number(unitPriceCents),
      });
      setDescription('');
      onDone();
    } catch (error) {
      onError(error);
    }
  }

  return (
    <div className="row" style={{ marginTop: 10 }}>
      <div className="col">
        <label>kind</label>
        <select value={kind} onChange={(event) => setKind(event.target.value)}>
          {KINDS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <div className="col grow">
        <label>description</label>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Replace air dryer cartridge"
        />
      </div>
      <div className="col">
        <label>qty (×100)</label>
        <input style={{ width: 80 }} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      </div>
      <div className="col">
        <label>unit price (cents)</label>
        <input style={{ width: 100 }} value={unitPriceCents} onChange={(event) => setUnitPrice(event.target.value)} />
      </div>
      <button className="primary" onClick={() => void submit()} disabled={description === ''}>
        add line
      </button>
    </div>
  );
}

function CreateWorkOrder({
  principal,
  vehicles,
  fleetLabel,
  onDone,
}: {
  principal: Principal;
  vehicles: Vehicle[];
  fleetLabel: (id: string) => string;
  onDone: () => void;
}): React.ReactElement {
  const [vehicleId, setVehicleId] = useState('');
  const [number, setNumber] = useState('');
  const [complaint, setComplaint] = useState('Driver reports air brakes slow to release.');
  const [odometerInMiles, setOdometer] = useState('412500');
  const [error, setError] = useState<unknown>(null);

  async function submit(): Promise<void> {
    setError(null);
    try {
      await api.create('work-orders', principal, {
        vehicleId,
        number,
        complaint,
        odometerInMiles: Number(odometerInMiles),
      });
      setNumber('');
      onDone();
    } catch (failure) {
      setError(failure);
    }
  }

  return (
    <div className="card">
      <h3>Open a work order</h3>
      <div className="row">
        <div className="col">
          <label>unit</label>
          <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
            <option value="">— pick a unit —</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.unitNumber} ({fleetLabel(vehicle.customerId)}){vehicle.status === 'retired' ? ' — retired' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="col">
          <label>number</label>
          <input style={{ width: 110 }} value={number} onChange={(event) => setNumber(event.target.value)} placeholder="RO-1001" />
        </div>
        <div className="col grow">
          <label>complaint</label>
          <input value={complaint} onChange={(event) => setComplaint(event.target.value)} />
        </div>
        <div className="col">
          <label>odometer in</label>
          <input style={{ width: 90 }} value={odometerInMiles} onChange={(event) => setOdometer(event.target.value)} />
        </div>
        <button className="primary" onClick={() => void submit()} disabled={vehicleId === '' || number === ''}>
          open
        </button>
      </div>
      <p className="hint">
        The fleet is derived from the unit, never supplied — a caller cannot choose who gets
        billed. A retired unit is refused.
      </p>
      <ProblemView error={error} />
    </div>
  );
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}
