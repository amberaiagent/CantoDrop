// canto — order form, live canto-schedule preview, confirmation, live pool feed.

const $ = (id) => document.getElementById(id);
const form = $("order-form");
const submitBtn = $("submit-btn");
const formError = $("form-error");
const livePreview = $("live-preview");
const previewBody = $("preview-body");
const modal = $("confirm-modal");

let CONFIG = { defaults: { holderTopFrom: 1, holderTopTo: 200, capMultiplier: 2, splitPercent: 50 } };

// ── helpers ────────────────────────────────────────────────────────────
const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: Number(n) >= 1000 ? 0 : 2 });
const fmtUsd = (n) => "$" + fmt(n);
const shortCa = (ca) => (ca && ca.length > 12 ? ca.slice(0, 4) + "…" + ca.slice(-4) : ca);
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n) => ROMAN[n] || String(n);

function clearErrors() {
  formError.textContent = "";
  document.querySelectorAll(".err").forEach((e) => (e.textContent = ""));
  document.querySelectorAll("input.invalid").forEach((i) => i.classList.remove("invalid"));
}
function showFieldError(field, msg) {
  const el = document.querySelector(`.err[data-err="${field}"]`);
  if (el) el.textContent = msg;
  const input = document.querySelector(`[name="${field}"]`);
  if (input) input.classList.add("invalid");
}
function readForm() {
  const data = {};
  new FormData(form).forEach((v, k) => (data[k] = String(v).trim()));
  return data;
}

// ── bootstrap defaults ─────────────────────────────────────────────────
fetch("/api/config").then((r) => r.json()).then((cfg) => {
  CONFIG = cfg;
  const d = cfg.defaults;
  document.querySelectorAll(".mult-echo").forEach((e) => (e.textContent = d.capMultiplier));
}).catch(() => {});

// ── live drop-schedule preview (mirrors the server formula) ─────────────
function computeSchedule() {
  const d = readForm();
  const deposit = Number(String(d.depositAmount).replace(/[, _]/g, ""));
  const cap0 = Number(String(d.targetMarketCap).replace(/[, _$]/g, ""));
  const rounds = Math.min(Math.max(parseInt(d.rounds, 10) || CONFIG.defaults.rounds || 5, 1), 30);
  const split = Number(d.splitPercent || CONFIG.defaults.splitPercent) / 100;
  const basis = d.splitBasis || CONFIG.defaults.splitBasis || "remaining";
  const capMode = d.capMode || CONFIG.defaults.capMode || "multiply";
  const mult = Number(d.capMultiplier || CONFIG.defaults.capMultiplier || 2);
  const step = Number(String(d.capStep || "").replace(/[, _$]/g, "")) || CONFIG.defaults.capStep || 0;

  if (!(deposit > 0) || !(cap0 > 0) || !(split > 0)) return null;

  const rows = [];
  let remaining = deposit;
  for (let i = 0; i < rounds && remaining > 1e-7; i++) {
    const cap = capMode === "step" ? cap0 + step * i : cap0 * Math.pow(mult, i);
    let drop = basis === "total" ? deposit * split : remaining * split;
    if (drop > remaining) drop = remaining;
    rows.push({ m: i + 1, cap, drop, rem: Math.max(remaining - drop, 0) });
    remaining -= drop;
  }
  return rows;
}

function computePreview() {
  const rows = computeSchedule();
  if (!rows || !rows.length) {
    previewBody.innerHTML = '<p class="preview-empty">Enter supply and a target cap to preview the rounds.</p>';
    return;
  }
  renderInfographic(rows);
}

// bar-chart infographic of the per-round drop amounts
function renderInfographic(rows) {
  const max = Math.max(...rows.map((r) => r.drop), 1);
  const total = rows.reduce((s, r) => s + r.drop, 0);
  const n = rows.length;
  const W = 560, H = 178, padB = 24, padT = 8;
  const gap = n > 16 ? 2 : n > 10 ? 4 : 6;
  const bw = (W - gap * (n - 1)) / n;
  let bars = "";
  rows.forEach((r, i) => {
    const h = (r.drop / max) * (H - padB - padT);
    const x = i * (bw + gap), y = H - padB - h;
    bars += `<rect class="ld-fill" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(bw, 1).toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="2"><title>Round ${r.m}: ${fmt(r.drop)} @ ${fmtUsd(r.cap)}</title></rect>`;
    if (n <= 14) bars += `<text class="ld-label" x="${(x + bw / 2).toFixed(1)}" y="${H - padB + 15}" text-anchor="middle">${r.m}</text>`;
  });
  const shown = rows.length > 6 ? rows.slice(0, 5) : rows;
  const list = shown.map((r) =>
    `<div class="mile"><div><div class="m-canto">Round ${r.m}</div><div class="m-cap">at ${fmtUsd(r.cap)} cap</div></div><div><div class="m-amt">${fmt(r.drop)}</div><div class="m-rem">${fmt(r.rem)} left</div></div></div>`
  ).join("") + (rows.length > 6 ? `<div class="caption" style="padding-top:10px">+ ${rows.length - 5} more rounds</div>` : "");
  const leftover = rows[rows.length - 1].rem;
  previewBody.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;margin-bottom:10px" role="img" aria-label="Drop schedule">
      <line x1="0" y1="${H - padB}" x2="${W}" y2="${H - padB}" stroke="var(--line-strong)" stroke-width="1"/>
      ${bars}
    </svg>
    <div class="caption" style="margin-bottom:8px">${n} rounds · ${fmt(total)} tokens dropped${leftover > 0.5 ? ` · ${fmt(leftover)} left in pool` : ""}</div>
    ${list}`;
}

form.addEventListener("input", computePreview);

// ── advanced: presets + cap-mode toggle ─────────────────────────────────
const PRESETS = {
  halving: { rounds: 6, splitPercent: 50, splitBasis: "remaining", capMode: "multiply", capMultiplier: 2 },
  eq10:    { rounds: 10, splitPercent: 10, splitBasis: "total", capMode: "step", capStep: 50000 },
  eq5:     { rounds: 5, splitPercent: 20, splitBasis: "total", capMode: "multiply", capMultiplier: 2 },
  gentle:  { rounds: 20, splitPercent: 5, splitBasis: "remaining", capMode: "step", capStep: 50000 },
};
function syncCapMode() {
  const mode = $("capMode").value;
  $("mult-field").hidden = mode !== "multiply";
  $("step-field").hidden = mode !== "step";
}
$("presets").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-preset]");
  if (!btn) return;
  const p = PRESETS[btn.dataset.preset];
  if (!p) return;
  $("rounds").value = p.rounds;
  $("splitPercent").value = p.splitPercent;
  $("splitBasis").value = p.splitBasis;
  $("capMode").value = p.capMode;
  if (p.capMultiplier != null) $("capMultiplier").value = p.capMultiplier;
  if (p.capStep != null) $("capStep").value = p.capStep;
  document.querySelectorAll("#presets .chip").forEach((c) => c.classList.toggle("active", c === btn));
  syncCapMode();
  computePreview();
});
$("capMode").addEventListener("change", () => { syncCapMode(); computePreview(); });
syncCapMode();

// ── ladder section: gallery of standard distribution systems ────────────
const LADDER_SYSTEMS = [
  { name: "Halving 50% ×2", sub: "fast taper, fewer rounds", rounds: 5, split: 50, basis: "remaining" },
  { name: "10 × 10%", sub: "flat, 10 even rounds", rounds: 10, split: 10, basis: "total" },
  { name: "5 × 20%", sub: "flat, 5 even rounds", rounds: 5, split: 20, basis: "total" },
  { name: "20 × 5% gentle", sub: "soft taper, easy on the chart", rounds: 20, split: 5, basis: "remaining" },
];
function miniSchedule(s) {
  const rows = []; let rem = 100; const p = s.split / 100;
  for (let i = 0; i < s.rounds; i++) { let d = s.basis === "total" ? 100 * p : rem * p; if (d > rem) d = rem; rows.push(d); rem -= d; }
  return rows;
}
function miniBars(rows) {
  const max = Math.max(...rows, 1); const n = rows.length;
  const W = 320, H = 120, padB = 16, padT = 16;
  const gap = n > 10 ? 2 : 5; const bw = (W - gap * (n - 1)) / n;
  let s = `<line x1="0" y1="${H - padB}" x2="${W}" y2="${H - padB}" stroke="var(--line-strong)" stroke-width="1"/>`;
  rows.forEach((d, i) => {
    const h = (d / max) * (H - padB - padT); const x = i * (bw + gap); const y = H - padB - h;
    s += `<rect class="ld-fill" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(bw, 1).toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="2"/>`;
    if (n <= 10) {
      s += `<circle class="ld-snapshot" cx="${(x + bw / 2).toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`;
      s += `<text class="ld-label" x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle">${Math.round(d)}%</text>`;
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
}
function renderLadderSystems() {
  const el = $("ladder-systems"); if (!el) return;
  el.innerHTML = LADDER_SYSTEMS.map((s) =>
    `<div class="ladder-card"><div class="lc-name">${s.name}</div><div class="lc-sub">${s.sub}</div>${miniBars(miniSchedule(s))}</div>`
  ).join("");
}
renderLadderSystems();

// ── supply ⇄ percent linking ────────────────────────────────────────────
// Most tokens are 1,000,000,000 supply (so 10,000,000 = 1%). If the CA resolves
// to a real total supply, we use that instead.
const DEFAULT_SUPPLY = 1_000_000_000;
let totalSupply = DEFAULT_SUPPLY;
const depEl = $("depositAmount");
const pctEl = $("supplyPercent");
const basisEl = $("supply-basis");
let syncing = false;

const toInt = (s) => Math.floor(Number(String(s).replace(/[, _]/g, "")) || 0);
const trimPct = (n) => {
  // up to 4 decimals, no trailing zeros
  return parseFloat(n.toFixed(4)).toString();
};
function setBasis(real) {
  basisEl.textContent = real
    ? `Tokens and % are linked. Based on this token's supply of ${fmt(totalSupply)}.`
    : `Tokens and % are linked. Based on a ${fmt(DEFAULT_SUPPLY)} supply (paste a CA to use its real supply).`;
}
// percent → tokens
pctEl.addEventListener("input", () => {
  if (syncing) return;
  const p = Number(pctEl.value);
  if (pctEl.value === "" || !Number.isFinite(p)) return;
  syncing = true;
  depEl.value = Math.round((totalSupply * p) / 100);
  syncing = false;
});
// tokens → percent
depEl.addEventListener("input", () => {
  if (syncing) return;
  const a = toInt(depEl.value);
  if (depEl.value === "" || !(totalSupply > 0)) return;
  syncing = true;
  pctEl.value = a > 0 ? trimPct((a / totalSupply) * 100) : "";
  syncing = false;
});

// ── resolve token name/ticker (and real supply) from the CA as you type ──
const tokenFound = $("token-found");
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
let tokenTimer = null;
$("tokenMint").addEventListener("input", (e) => {
  const mint = e.target.value.trim();
  tokenFound.textContent = "";
  tokenFound.className = "token-found";
  clearTimeout(tokenTimer);
  if (!SOLANA_RE.test(mint)) { totalSupply = DEFAULT_SUPPLY; setBasis(false); return; }
  tokenFound.textContent = "Looking up token…";
  tokenTimer = setTimeout(async () => {
    try {
      const r = await (await fetch("/api/token/" + encodeURIComponent(mint))).json();
      if (r.found) {
        tokenFound.className = "token-found ok";
        tokenFound.textContent = `✓ ${r.name || ""}${r.ticker ? ` ($${r.ticker})` : ""}`.trim();
      } else {
        tokenFound.className = "token-found dim";
        tokenFound.textContent = "Token not listed yet. You can still create the order.";
      }
      // adopt the real supply if we got one, and re-derive the linked field
      totalSupply = r.totalSupply > 0 ? r.totalSupply : DEFAULT_SUPPLY;
      setBasis(r.totalSupply > 0);
      if (pctEl.value !== "") {
        syncing = true; depEl.value = Math.round((totalSupply * Number(pctEl.value)) / 100); syncing = false;
      } else if (depEl.value !== "") {
        const a = toInt(depEl.value);
        syncing = true; pctEl.value = a > 0 ? trimPct((a / totalSupply) * 100) : ""; syncing = false;
      }
      computePreview();
    } catch {
      tokenFound.textContent = "";
    }
  }, 450);
});
setBasis(false);

// ── submit ──────────────────────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();
  submitBtn.disabled = true;
  submitBtn.textContent = "Creating…";
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(readForm()),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      if (json.field) showFieldError(json.field, json.error);
      else formError.textContent = json.error || "Something went wrong.";
      return;
    }
    openConfirm(json);
    pushToast(json.order);
    form.reset();
    tokenFound.textContent = "";
    tokenFound.className = "token-found";
    totalSupply = DEFAULT_SUPPLY;
    setBasis(false);
    computePreview();
    loadPool(true);
  } catch {
    formError.textContent = "Network error. Please try again.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create order";
  }
});

// ── confirmation modal ──────────────────────────────────────────────────
function openConfirm({ order, deposit, preview }) {
  $("ok-ref").textContent = order.reference;
  const tokenLine = order.tokenName || order.tokenTicker
    ? ci("Token", `${order.tokenName || ""}${order.tokenTicker ? ` ($${order.tokenTicker})` : ""}`.trim())
    : "";
  $("confirm-grid").innerHTML = `
    ${tokenLine}
    ${ci("Contract (CA)", order.tokenMint)}
    ${ci("Supply to send", fmt(deposit.amount) + " tokens")}
    ${ci("Target cap", fmtUsd(order.targetMarketCap))}
    ${ci("Holders", `#${order.holderTopFrom}–#${order.holderTopTo}`)}
    ${ci("Rounds", `${order.rounds} × ${order.splitPercent}% ${order.splitBasis === "total" ? "of total" : "of rem."}`)}
  `;
  $("cb-wallet").textContent = deposit.wallet;
  $("cb-memo").textContent = deposit.memo;
  $("confirm-preview").innerHTML =
    '<h3 style="font-size:17px;margin:18px 0 6px">Drop schedule</h3>' +
    preview.map((r) => `<div class="mile"><div class="m-canto">Round ${r.milestone} <span class="m-cap">@ ${fmtUsd(r.marketCap)}</span></div><div class="m-amt">${fmt(r.dropAmount)}</div></div>`).join("");
  $("goto-status").href = `/order/${order.reference}`;
  modal.hidden = false;
}
function ci(label, val) {
  return `<div class="ci"><span class="ci-label">${label}</span><span class="ci-val">${val}</span></div>`;
}
$("modal-close").addEventListener("click", () => (modal.hidden = true));
modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

// ── copy buttons ────────────────────────────────────────────────────────
document.querySelectorAll(".btn-copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($(btn.dataset.copy).textContent);
      const old = btn.textContent; btn.textContent = "Copied ✓";
      setTimeout(() => (btn.textContent = old), 1400);
    } catch {}
  });
});

// ── lookup ──────────────────────────────────────────────────────────────
const lookupModal = $("lookup-modal");
const lookupInput = $("lookup-input");
const lookupErr = $("lookup-err");
function openLookup() {
  lookupErr.textContent = "";
  lookupInput.value = "";
  lookupModal.hidden = false;
  setTimeout(() => lookupInput.focus(), 50);
}
function closeLookup() { lookupModal.hidden = true; }

$("lookup-link").addEventListener("click", (e) => { e.preventDefault(); openLookup(); });
$("lookup-close").addEventListener("click", closeLookup);
$("lookup-cancel").addEventListener("click", closeLookup);
lookupModal.addEventListener("click", (e) => { if (e.target === lookupModal) closeLookup(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !lookupModal.hidden) closeLookup(); });
$("lookup-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = lookupInput.value.trim().toUpperCase();
  if (!code) { lookupErr.textContent = "Enter your order code."; return; }
  location.href = `/order/${encodeURIComponent(code)}`;
});

// ── toast feed (request submitted) ──────────────────────────────────────
function pushToast(order) {
  const stack = $("toast-stack");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="t-top"><span class="t-ref">${order.reference}</span><span class="badge active">in progress</span></div>
    <div class="t-body">Order submitted · <b>${fmt(order.depositAmount)}</b> ${order.tokenTicker ? "$"+order.tokenTicker : "tokens"} · ${shortCa(order.tokenMint)}</div>`;
  stack.appendChild(el);
  setTimeout(() => { el.style.transition = "opacity .4s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 400); }, 6000);
}

// ── live pool ───────────────────────────────────────────────────────────
const poolBody = $("pool-body");
let poolFilter = "all";
let seen = new Set();
let firstPoolLoad = true;
const STATUS_LABEL = { pending: "waiting", funded: "funded", active: "active", completed: "completed", cancelled: "cancelled" };

async function loadPool(force) {
  try {
    const { orders } = await (await fetch("/api/orders")).json();
    renderPool(orders || []);
  } catch {
    if (force) poolBody.innerHTML = '<div class="pool-empty">Couldn\'t load the pool.</div>';
  }
}
function renderPool(orders) {
  const filtered = orders.filter((o) => poolFilter === "all" || o.status === poolFilter);
  if (!filtered.length) {
    poolBody.innerHTML = `<div class="pool-empty">${orders.length ? "No orders match this filter." : "No orders yet. Be the first to open one."}</div>`;
  } else {
    poolBody.innerHTML = filtered.map((o) => {
      const isNew = !firstPoolLoad && !seen.has(o.reference);
      const pct = o.targetMarketCap > 0 ? Math.min(100, (Number(o.currentMarketCap) / Number(o.targetMarketCap)) * 100) : 0;
      const tk = o.tokenTicker ? `$${o.tokenTicker}` : "";
      return `
      <div class="pool-row ${isNew ? "new" : ""}">
        <a class="ca" href="/order/${o.reference}" title="${o.tokenMint}">
          ${tk ? `<b class="tkr">${tk}</b> ` : ""}<span class="castub">${shortCa(o.tokenMint)}</span>
        </a>
        <span class="num">${fmt(o.depositAmount)}</span>
        <span class="num col-target">${fmtUsd(o.targetMarketCap)}</span>
        <span class="col-progress"><span class="prog"><i style="width:${pct}%"></i></span></span>
        <span><span class="badge ${o.status}">${STATUS_LABEL[o.status] || o.status}</span></span>
      </div>`;
    }).join("");
  }
  orders.forEach((o) => seen.add(o.reference));
  firstPoolLoad = false;
}
$("pool-filters").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll(".pool-filters .chip").forEach((c) => c.classList.toggle("active", c === chip));
  poolFilter = chip.dataset.filter;
  loadPool(true);
});
loadPool(true);
setInterval(loadPool, 6000);
