# fleetco-ui

A rudimentary harness for driving the `customers` and `vehicles` modules by
hand. Not a product surface — an instrument for watching the API behave, so the
rules and the tenancy model can be seen rather than read.

## Running it

The API must be up first (see the project README):

```bash
# in the project root
docker run -d --name fleetco-pg \
  -e POSTGRES_USER=fleetco -e POSTGRES_PASSWORD=fleetco -e POSTGRES_DB=fleetco \
  -p 5432:5432 postgres:16-alpine
set -a && . ./.env && set +a
npm run migrate && npm run seed      # seed also writes ui/public/dev-principals.json
npm run build && npm start

# then, in ui/
npm install && npm run dev           # http://127.0.0.1:5173
```

## Two things worth knowing

**No CORS.** The API sets no CORS headers and should not — it is a first-party
backend with one first-party caller. `vite.config.ts` proxies `/v1` and
`/health` to `127.0.0.1:3000`, so the browser's origin matches the API's and
the spike needs no change to be driven from a UI.

**No `EventSource`.** Identity is a request header, and `EventSource` cannot
send one, so the built-in SSE client is unusable against an authenticated
stream. `openStream` in `src/api.ts` reads the response body as a stream and
splits frames by hand — about thirty lines, and the standard way around it.

## What to try

The harness is arranged around the things that are hard to see in a test run:

- **Switch tenants** in the *Acting as* bar. Both lists change completely. No
  request can reach another tenant, because the tenant comes from the principal
  and never from the URL or the body.
- **Switch to the `portal` role** and pin it to one fleet. Customers drops to
  one row; vehicles drops to that fleet's trucks only. Those are two *different*
  scope mappings — `customers.id` versus `vehicles.customer_id` — which is why
  the scope chokepoint had to become a parameter rather than a copy.
- **Activate a vehicle whose fleet is not active.** Refused. That rule crosses
  the module boundary: `vehicles` cannot read `customers.customers`, so it asks
  `CustomersService`.
- **Lower an odometer.** Refused against the locked current value.
- **Retire a vehicle, then try to un-retire it.** `retired` is terminal.
- **Activate a customer that is on credit hold.** Refused. Then press
  **clear hold + activate (one patch)** — allowed, because the patch is
  evaluated as one resulting state rather than as a sequence. That button
  exists precisely because two separate controls can never demonstrate it.
- **Open an event stream with `Last-Event-ID: 0`**, then edit the same entity
  in the detail pane above it. The replayed history arrives first, then the
  live frame — no second tab needed, the stream stays open across edits.
- **Open a work order on a unit, then try to authorize it with no lines.**
  Refused — there is nothing to approve. Add a labour line (quantity is
  hundredths, so `150` is 1.5 hours) and watch the order re-total.
- **Put the fleet on credit hold, then authorize the order.** Refused, and the
  rule lives in `workorders` while the fact lives in `customers` — the only
  way this module learns it is by asking `CustomersService`.
- **Start work, then try to add a line.** Refused: lines are editable only
  while the order is `draft` or `authorized`.
- **Retire a unit, then try to open a work order against it.** Refused.
- **Add a vehicle with a unit number another fleet already uses.** Allowed —
  unit numbers are unique per fleet, which the seed already shows: both fleets
  run a `TRK-101`. Reuse one inside the *same* fleet, or reuse a VIN anywhere in
  the tenant, and it is refused with a `409`.
- **Retire a vehicle, deactivate its fleet, then try to reactivate the truck.**
  The refusal names the transition (`retired` is terminal), not the fleet —
  this module's own rules are checked before it asks the customers module.

Every refusal is rendered with the API's own `kind`, message and structured
context, which is the most useful thing on the screen.
