import { useEffect, useState } from 'react';

import type { Customer, Principal, Role } from '../types';

/**
 * The identity switcher, and the point of the whole harness.
 *
 * Tenancy is invisible in a UI that only ever speaks as one user. Switching
 * tenant or dropping to a `portal` role pinned to one fleet is the manual
 * version of what `leak.test.ts` asserts, and the lists below visibly shrink
 * when you do it.
 *
 * Presets come from `public/dev-principals.json`, which `npm run seed` writes.
 * That file is seed output, like the console text — not an API endpoint. The
 * API deliberately has no "list tenants" route, because a tenant is something
 * a principal *has*, never something a caller may choose.
 */
type Preset = {
  label: string;
  tenantId: string;
  userId: string;
  customers: { id: string; code: string; name: string }[];
};

export function PrincipalBar({
  principal,
  onChange,
  customers,
}: {
  principal: Principal;
  onChange: (next: Principal) => void;
  customers: Customer[];
}): React.ReactElement {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetError, setPresetError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/dev-principals.json')
      .then((response) => (response.ok ? (response.json() as Promise<Preset[]>) : []))
      .then((loaded) => {
        setPresets(loaded);
        setPresetError(loaded.length === 0 ? 'no presets — run `npm run seed` in the API' : null);
      })
      .catch(() => setPresetError('no presets — run `npm run seed` in the API'));
  }, []);

  /** Portal principals must carry exactly one customerId; others must carry none. */
  function setRole(role: Role): void {
    if (role === 'portal') {
      const fleets =
        presets.find((preset) => preset.tenantId === principal.tenantId)?.customers ?? customers;
      const first = fleets[0]?.id ?? '';
      onChange({ ...principal, role, customerId: principal.customerId ?? first });
    } else {
      onChange({ userId: principal.userId, tenantId: principal.tenantId, role });
    }
  }

  function applyPreset(label: string): void {
    const preset = presets.find((candidate) => candidate.label === label);
    if (preset === undefined) return;
    onChange({ userId: preset.userId, tenantId: preset.tenantId, role: 'staff' });
  }

  /**
   * Fleet choices come from the seed presets, never from the `customers` list.
   *
   * The list is already scoped by the principal being edited, so once the role
   * is `portal` it contains exactly the one fleet you are pinned to — which
   * made it impossible to switch to a sibling fleet, and therefore impossible
   * to see the cross-customer refusals at all. The scoped list is the right
   * answer everywhere else in the app and the wrong answer here.
   */
  const portalChoices =
    presets
      .find((preset) => preset.tenantId === principal.tenantId)
      ?.customers.map((customer) => ({ id: customer.id, label: `${customer.code} — ${customer.name}` })) ?? [];

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3>Acting as</h3>
      <div className="row">
        <div className="col">
          <label>tenant preset</label>
          <select
            value={presets.find((preset) => preset.tenantId === principal.tenantId)?.label ?? ''}
            onChange={(event) => applyPreset(event.target.value)}
          >
            <option value="">— pick a seeded tenant —</option>
            {presets.map((preset) => (
              <option key={preset.label} value={preset.label}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div className="col">
          <label>role</label>
          <select value={principal.role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="staff">staff</option>
            <option value="operator">operator</option>
            <option value="portal">portal</option>
          </select>
        </div>

        {principal.role === 'portal' && (
          <div className="col grow">
            <label>pinned to fleet</label>
            <select
              value={principal.customerId ?? ''}
              onChange={(event) => onChange({ ...principal, customerId: event.target.value })}
            >
              <option value="">— pick a fleet —</option>
              {portalChoices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="col grow">
          <label>tenant id</label>
          <input
            value={principal.tenantId}
            onChange={(event) => onChange({ ...principal, tenantId: event.target.value })}
          />
        </div>
      </div>

      <p className="hint">
        Sent as <code>x-fleetco-principal</code> on every request. Spike scaffolding — the real
        thing is a session token, and the guard refuses to start in production.
        {presetError !== null && <> · <span className="dim">{presetError}</span></>}
      </p>
    </div>
  );
}
