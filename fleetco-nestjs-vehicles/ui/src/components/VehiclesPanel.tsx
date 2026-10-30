import { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import type { Customer, Principal, Vehicle, VehicleClass, VehicleStatus } from '../types';
import { EventStream } from './EventStream';
import { ProblemView } from './Problem';

const STATUSES: VehicleStatus[] = ['out_of_service', 'active', 'retired'];
const CLASSES: VehicleClass[] = ['light_duty', 'medium_duty', 'heavy_duty', 'trailer'];

export function VehiclesPanel({
  principal,
  customers,
}: {
  principal: Principal;
  customers: Customer[];
}): React.ReactElement {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [status, setStatus] = useState('');
  const [fleet, setFleet] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    try {
      const page = await api.list<Vehicle>('vehicles', principal, {
        limit: 100,
        status,
        customerId: fleet,
        search,
      });
      setVehicles(page.items);
    } catch (error) {
      setVehicles([]);
      setLoadError(error);
    }
  }, [principal, status, fleet, search]);

  useEffect(() => {
    void load();
  }, [principal.tenantId, principal.role, principal.customerId]);

  const selected = vehicles.find((vehicle) => vehicle.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId !== null && !vehicles.some((vehicle) => vehicle.id === selectedId)) {
      setSelectedId(null);
    }
  }, [vehicles, selectedId]);

  async function act<T>(work: () => Promise<T>, success: string): Promise<void> {
    setActionError(null);
    setNote(null);
    try {
      await work();
      setNote(success);
      await load();
    } catch (error) {
      setActionError(error);
    }
  }

  const fleetName = (id: string): string => {
    const match = customers.find((customer) => customer.id === id);
    return match === undefined ? id.slice(0, 8) : match.code;
  };

  return (
    <div className="split">
      <div>
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>Vehicles ({vehicles.length})</h3>
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
              <label>search unit or VIN</label>
              <input value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <button onClick={() => void load()}>apply</button>
          </div>

          <ProblemView error={loadError} />

          <table style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>unit</th>
                <th>fleet</th>
                <th>vehicle</th>
                <th>VIN</th>
                <th>status</th>
                <th>odometer</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => (
                <tr
                  key={vehicle.id}
                  aria-selected={vehicle.id === selectedId}
                  onClick={() => setSelectedId(vehicle.id)}
                >
                  <td className="mono">{vehicle.unitNumber}</td>
                  <td className="mono">{fleetName(vehicle.customerId)}</td>
                  <td>{vehicle.modelYear} {vehicle.make} {vehicle.model}</td>
                  <td className="id">{vehicle.vin}</td>
                  <td><span className={`pill ${vehicle.status}`}>{vehicle.status}</span></td>
                  <td className="mono">{vehicle.odometerMiles.toLocaleString('en-US')}</td>
                </tr>
              ))}
              {vehicles.length === 0 && (
                <tr><td colSpan={6} className="dim">no vehicles visible to this principal</td></tr>
              )}
            </tbody>
          </table>
          {principal.role === 'portal' && (
            <p className="hint">
              A <code>portal</code> principal is scoped on <code>vehicles.customer_id</code>, not on
              the primary key — a different mapping from the customers module, and the reason the
              scope chokepoint has to be a parameter rather than a copy.
            </p>
          )}
        </div>

        <CreateVehicle principal={principal} customers={customers} onDone={() => void load()} />
      </div>

      <div>
        {note !== null && <div className="ok-note">{note}</div>}
        <ProblemView error={actionError} />

        {selected === null ? (
          <div className="card"><h3>Detail</h3><p className="dim">Select a vehicle.</p></div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 14 }}>
              <h3>{selected.unitNumber} — {selected.make} {selected.model}</h3>
              <p className="id">{selected.id}</p>
              <p className="hint" style={{ marginTop: 0 }}>
                fleet <code>{fleetName(selected.customerId)}</code> · VIN{' '}
                <code>{selected.vin}</code>
              </p>

              <div className="row" style={{ marginBottom: 10 }}>
                <div className="col">
                  <label>status transition</label>
                  <select
                    value={selected.status}
                    onChange={(event) =>
                      void act(
                        () => api.update('vehicles', principal, selected.id, { status: event.target.value }),
                        `status → ${event.target.value}`,
                      )
                    }
                  >
                    {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
                <button
                  onClick={() =>
                    void act(
                      () =>
                        api.update('vehicles', principal, selected.id, {
                          lastServicedAt: new Date().toISOString(),
                        }),
                      'marked serviced now',
                    )
                  }
                >
                  mark serviced
                </button>
              </div>
              <p className="hint">
                Activating a vehicle whose fleet is not <code>active</code> is refused — that rule
                crosses the module boundary and is the only place this module asks the customers
                module a question. <code>retired</code> is terminal.
              </p>

              <EditVehicle
                principal={principal}
                vehicle={selected}
                onSaved={() => void act(() => Promise.resolve(), 'saved')}
                onError={setActionError}
              />
            </div>

            <EventStream
              resource="vehicles"
              principal={principal}
              id={selected.id}
              label={selected.unitNumber}
            />
          </>
        )}
      </div>
    </div>
  );
}

function EditVehicle({
  principal,
  vehicle,
  onSaved,
  onError,
}: {
  principal: Principal;
  vehicle: Vehicle;
  onSaved: () => void;
  onError: (error: unknown) => void;
}): React.ReactElement {
  const [unitNumber, setUnitNumber] = useState(vehicle.unitNumber);
  const [odometer, setOdometer] = useState(String(vehicle.odometerMiles));
  const [vehicleClass, setVehicleClass] = useState<string>(vehicle.vehicleClass);

  useEffect(() => {
    setUnitNumber(vehicle.unitNumber);
    setOdometer(String(vehicle.odometerMiles));
    setVehicleClass(vehicle.vehicleClass);
  }, [vehicle]);

  async function save(): Promise<void> {
    try {
      await api.update('vehicles', principal, vehicle.id, {
        unitNumber,
        odometerMiles: Number(odometer),
        vehicleClass,
      });
      onSaved();
    } catch (error) {
      onError(error);
    }
  }

  return (
    <>
      <div className="row">
        <div className="col">
          <label>unit number</label>
          <input style={{ width: 110 }} value={unitNumber} onChange={(event) => setUnitNumber(event.target.value)} />
        </div>
        <div className="col">
          <label>odometer (miles)</label>
          <input style={{ width: 110 }} value={odometer} onChange={(event) => setOdometer(event.target.value)} />
        </div>
        <div className="col grow">
          <label>class</label>
          <select value={vehicleClass} onChange={(event) => setVehicleClass(event.target.value)}>
            {CLASSES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <button className="primary" onClick={() => void save()}>save</button>
      </div>
      <p className="hint">
        Lower the odometer and save — it is refused against the locked current value, because a
        rollback is either a typo or fraud.
      </p>
    </>
  );
}

function CreateVehicle({
  principal,
  customers,
  onDone,
}: {
  principal: Principal;
  customers: Customer[];
  onDone: () => void;
}): React.ReactElement {
  const [customerId, setCustomerId] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [vin, setVin] = useState('');
  const [make, setMake] = useState('Freightliner');
  const [model, setModel] = useState('Cascadia');
  const [modelYear, setModelYear] = useState('2023');
  const [vehicleClass, setVehicleClass] = useState<string>('heavy_duty');
  const [odometer, setOdometer] = useState('100000');
  const [error, setError] = useState<unknown>(null);

  async function submit(): Promise<void> {
    setError(null);
    try {
      await api.create('vehicles', principal, {
        customerId,
        unitNumber,
        vin,
        make,
        model,
        modelYear: Number(modelYear),
        vehicleClass,
        odometerMiles: Number(odometer),
      });
      setUnitNumber('');
      setVin('');
      onDone();
    } catch (failure) {
      setError(failure);
    }
  }

  return (
    <div className="card">
      <h3>Add a vehicle</h3>
      <div className="row">
        <div className="col">
          <label>fleet</label>
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">— pick a fleet —</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>
            ))}
          </select>
        </div>
        <div className="col">
          <label>unit number</label>
          <input style={{ width: 100 }} value={unitNumber} onChange={(event) => setUnitNumber(event.target.value)} placeholder="TRK-14" />
        </div>
        <div className="col">
          <label>VIN (17, no I/O/Q)</label>
          <input style={{ width: 170 }} value={vin} onChange={(event) => setVin(event.target.value)} placeholder="1FUJGLDR9CSBF1234" />
        </div>
        <div className="col">
          <label>year</label>
          <input style={{ width: 70 }} value={modelYear} onChange={(event) => setModelYear(event.target.value)} />
        </div>
        <div className="col">
          <label>make</label>
          <input style={{ width: 110 }} value={make} onChange={(event) => setMake(event.target.value)} />
        </div>
        <div className="col">
          <label>model</label>
          <input style={{ width: 110 }} value={model} onChange={(event) => setModel(event.target.value)} />
        </div>
        <div className="col">
          <label>class</label>
          <select value={vehicleClass} onChange={(event) => setVehicleClass(event.target.value)}>
            {CLASSES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className="col">
          <label>odometer</label>
          <input style={{ width: 90 }} value={odometer} onChange={(event) => setOdometer(event.target.value)} />
        </div>
        <button
          className="primary"
          onClick={() => void submit()}
          disabled={customerId === '' || unitNumber === '' || vin === ''}
        >
          create
        </button>
      </div>
      <p className="hint">
        Unit numbers are unique <em>per fleet</em>; VINs are unique per tenant. A vehicle is added{' '}
        <code>out_of_service</code> — a new unit is not yet cleared for work.
      </p>
      <ProblemView error={error} />
    </div>
  );
}
