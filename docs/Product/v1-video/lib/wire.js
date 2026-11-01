/* Shared helpers for V1 flow pages (flows/*.html).
 *
 * A flow page defines:
 *   render()          draws the current state into #root (call setWho() inside it)
 *   SCENES            { sceneId: async () => {...} }  one per narration entry, for videos
 *   PICTURES          { pictureId: async () => {...} } each leaves a finished still on screen
 * then calls boot().
 *
 * Everything division-specific comes from T (the graphics division's words).
 */

const DIVISIONS = {
  graphics: {
    name: "Graphics", work: "Job", works: "Jobs", board: "Job board", worker: "Technician", asset: "Vehicle",
    stages: ["Ready for production", "In production", "Production complete", "Ready for installation", "Installation in progress", "Completed"],
    assets: ["Vehicle", "Trailer"],
  },
  mechanical: {
    name: "Mechanical", work: "Service order", works: "Service orders", board: "Repair board", worker: "Technician", asset: "Unit",
    stages: ["Waiting to start", "Diagnosis", "Waiting on approval", "In repair", "Quality check", "Completed"],
    assets: ["Truck", "Trailer", "Equipment"],
  },
};
const T = DIVISIONS.graphics;

/* ---------- shared sample data (keep numbers consistent across flows) ---------- */
// One "Full wrap" saved package: [item, qty, unit, cost each, price each]
const WRAP = [
  ["Avery MPI 1105 wrap film", 62, "ft", 3.10, 7.50],
  ["Avery DOL 1460Z overlaminate", 62, "ft", 2.05, 4.50],
  ["Latex ink", 1, "job", 38, 85],
  ["Install supplies", 1, "job", 22, 45],
  ["Design", 4, "hr", 35, 95],
  ["Installation", 9, "hr", 28, 85],
];
const PRICE = WRAP.reduce((a, r) => a + r[1] * r[4], 0); // 2,019.00
const COST = WRAP.reduce((a, r) => a + r[1] * r[3], 0);  //   771.30
const money = (n) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hms = (s) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// Jobs on the board. "T1" = Technician 1, "OW" = Owner. Story job is G-1048 (Ridgeline Plumbing, Unit 14 full wrap).
const JOBS = [
  { no: "G-1052", cust: "Lancaster Kitchen Supply", what: "Box truck logo kit", who: "T1", date: "Nov 3", pri: "Normal", stage: 0 },
  { no: "G-1053", cust: "Conestoga Tree Care", what: "Bucket truck doors ×3", who: "OW", date: "Nov 4", pri: "Low", stage: 0 },
  { no: "G-1048", cust: "Ridgeline Plumbing", what: "Unit 14 · full wrap", who: "T1", date: "Nov 2", pri: "High", stage: 1 },
  { no: "G-1046", cust: "Brightway Movers", what: "Rear door graphics", who: "T1", date: "Oct 31", pri: "Normal", stage: 2 },
  { no: "G-1044", cust: "Keystone Dairy Co-op", what: "Tanker DOT lettering", who: "T1", date: "Oct 30", pri: "High", stage: 3 },
  { no: "G-1043", cust: "Millport School District", what: "Shop wall mural", who: "T1", date: "Oct 29", pri: "Normal", stage: 4 },
  { no: "G-1041", cust: "Ridgeline Plumbing", what: "Unit 9 · decal refresh", who: "T1", date: "Oct 27", pri: "Normal", stage: 5 },
];
const CUSTOMERS = ["Ridgeline Plumbing & Heating", "Keystone Dairy Co-op", "Lancaster Kitchen Supply", "Conestoga Tree Care", "Brightway Movers", "Millport School District"];

const $ = (s) => document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- frames ---------- */
// Owner's desktop frame. `active` must match a nav label exactly.
const OWNER_NAV = [T.board, T.works, "Schedule", "Estimates", "Customers", "Invoices", "Time & payroll", "Materials & ordering", "Reports"];
function shell(active, body, url) {
  return `<div class="frame">
    <div class="frame-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url">app.otcfleet.com/${url}</span></div>
    <div class="topbar"><div class="logo">LOGO</div><div class="search">Search customers, ${T.works.toLowerCase()}, invoices…</div><div class="grow"></div>
      <span class="division">OTC Fleet Graphix</span><span class="user"><span class="av">OW</span>Owner</span></div>
    <div class="app"><div class="nav">${OWNER_NAV.map((n) => `<div class="${n === active ? "on" : ""}" data-k="nav-${slug(n)}">${n}</div>`).join("")}<div class="sep"></div><div class="${active === "Settings" ? "on" : ""}" data-k="nav-settings">Settings</div></div>
    <div class="screen">${body}</div></div></div>`;
}
// Technician's desktop frame. `right` is extra top-bar HTML (clock status, running timer).
function techShell(active, body, url, right = "") {
  const nav = ["My jobs", "Schedule", "My time"];
  return `<div class="frame">
    <div class="frame-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url">app.otcfleet.com/${url}</span></div>
    <div class="topbar"><div class="logo">LOGO</div><div class="search">Search my ${T.works.toLowerCase()}…</div><div class="grow"></div>
      ${right}<span class="user"><span class="av">T1</span>Technician</span></div>
    <div class="app"><div class="nav">${nav.map((n) => `<div class="${n === active ? "on" : ""}" data-k="nav-${slug(n)}">${n}</div>`).join("")}</div>
    <div class="screen">${body}</div></div></div>`;
}
// Phone frame, centered. `title` goes in the top bar, `right` beside it.
function phoneFrame(title, body, right = "") {
  return `<div class="phone-stage"><div class="phone"><div class="notch"></div><div class="p-top"><strong>${title}</strong>${right}</div><div class="p-body">${body}</div></div></div>`;
}
function boardCard(j, extra = "") {
  return `<div class="card ${extra}" data-k="card-${j.no}"><div class="row"><span class="no">${j.no}</span>${j.pri === "High" ? `<span class="pill solid">High</span>` : `<span class="pill">${j.pri}</span>`}</div>
    <div class="cust">${j.cust}</div><div>${j.what}</div>
    <div class="row"><span>${j.date}</span><span class="av sm">${j.who}</span></div>${j.note ? `<div class="small"><span class="pill dash">${j.note}</span></div>` : ""}</div>`;
}
// Full-screen title/end card.
function cardScreen(eyebrow, big, lede = "") {
  return `<div class="card-screen"><div class="eyebrow">${eyebrow}</div><h1 class="big">${big}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}<div class="stamp">Sketch · shows what each screen does, not the final design</div></div>`;
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Corner tag saying who is using the screen. kind: "owner" | "tech-desk" | "tech-phone" | null
function setWho(kind) {
  const w = $("#who");
  w.hidden = !kind;
  if (kind === "owner") w.innerHTML = `<span class="av">OW</span><span><b>Owner</b> · at the desk</span>`;
  if (kind === "tech-desk") w.innerHTML = `<span class="av">T1</span><span><b>Technician</b> · at the shop computer</span>`;
  if (kind === "tech-phone") w.innerHTML = `<span class="av">T1</span><span><b>Technician</b> · on a phone</span>`;
}

/* ---------- cursor ---------- */
let cur;
function center(k) {
  const el = document.querySelector(`[data-k="${k}"]`);
  if (!el) throw new Error("missing data-k=" + k);
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}
async function moveTo(k, dx = 0, dy = 0, ms = 700) {
  const [x, y] = Array.isArray(k) ? k : center(k);
  cur.style.transitionDuration = ms + "ms";
  cur.style.left = x + dx - 3 + "px";
  cur.style.top = y + dy - 2 + "px";
  await wait(ms + 60);
}
function ripple() {
  const r = document.createElement("div");
  r.className = "ripple";
  r.style.left = parseFloat(cur.style.left) + 3 + "px";
  r.style.top = parseFloat(cur.style.top) + 2 + "px";
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 600);
}
// Move to the element with data-k=k, click it, apply fn (state change) and re-render.
async function click(k, fn, after = 350) {
  await moveTo(k);
  ripple();
  await wait(120);
  if (fn) { fn(); render(); }
  await wait(after);
}
function toast(msg, ms = 2200) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function parkCursor() { cur.style.transitionDuration = "0ms"; cur.style.left = "1560px"; cur.style.top = "940px"; }
function hideCursor() { cur.style.display = "none"; }

function boot() {
  document.body.insertAdjacentHTML("beforeend", `<div id="root"></div><div id="who" hidden></div>
    <svg id="cursor" viewBox="0 0 28 34" aria-hidden="true"><path d="M3 2 L3 27 L9.5 21 L14 31 L18.5 29 L14 19.5 L23 19.5 Z" fill="#fbfbf9" stroke="#2b2b2b" stroke-width="2" stroke-linejoin="round"/></svg><div id="toasts"></div>`);
  cur = $("#cursor");
  window.director = { run: (id) => SCENES[id](), ids: Object.keys(typeof SCENES === "undefined" ? {} : SCENES) };
  window.pictures = { run: async (id) => { hideCursor(); await PICTURES[id](); }, ids: Object.keys(typeof PICTURES === "undefined" ? {} : PICTURES) };
  render();
}
