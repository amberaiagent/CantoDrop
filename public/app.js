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
  $("holderTopFrom").placeholder = d.holderTopFrom;
  $("holderTopTo").placeholder = d.holderTopTo;
  $("capMultiplier").placeholder = d.capMultiplier;
  $("splitPercent").placeholder = d.splitPercent;
}).catch(() => {});

// ── live canto-schedule preview (mirrors the server formula) ────────────
function computePreview() {
  const d = readForm();
  const deposit = Number(String(d.depositAmount).replace(/[, _]/g, ""));
  const cap0 = Number(String(d.targetMarketCap).replace(/[, _$]/g, ""));
  const mult = Number(d.capMultiplier || CONFIG.defaults.capMultiplier);
  const split = Number(d.splitPercent || CONFIG.defaults.splitPercent) / 100;

  if (!(deposit > 0) || !(cap0 > 0) || !(mult > 1) || !(split > 0)) {
    previewBody.innerHTML = '<p class="preview-empty">Enter supply and a target cap to preview the rounds.</p>';
    return;
  }
  const MAX = 6;
  let remaining = deposit, cap = cap0;
  const rows = [];
  for (let i = 0; i < MAX && remaining > 1e-7; i++) {
    const drop = i === MAX - 1 ? remaining : remaining * split;
    rows.push({ m: i + 1, cap, drop, rem: Math.max(remaining - drop, 0) });
    remaining -= drop; cap *= mult;
  }
  previewBody.innerHTML = rows.map((r) => `
    <div class="mile">
      <div>
        <div class="m-canto">Canto ${roman(r.m)}</div>
        <div class="m-cap">at ${fmtUsd(r.cap)} cap</div>
      </div>
      <div>
        <div class="m-amt">${fmt(r.drop)}</div>
        <div class="m-rem">${fmt(r.rem)} left</div>
      </div>
    </div>`).join("");
}
form.addEventListener("input", computePreview);

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
    ${ci("Holders", `#${order.holderTopFrom}–#${order.holderTopTo} · ×${order.capMultiplier}`)}
  `;
  $("cb-wallet").textContent = deposit.wallet;
  $("cb-memo").textContent = deposit.memo;
  $("confirm-preview").innerHTML =
    '<h3 style="font-size:17px;margin:18px 0 6px">Canto schedule</h3>' +
    preview.map((r) => `<div class="mile"><div class="m-canto">Canto ${roman(r.milestone)} <span class="m-cap">@ ${fmtUsd(r.marketCap)}</span></div><div class="m-amt">${fmt(r.dropAmount)}</div></div>`).join("");
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
$("lookup-link").addEventListener("click", (e) => {
  e.preventDefault();
  const code = prompt("Enter your order code (e.g. CANTO-XXXXXXXX):");
  if (code && code.trim()) location.href = `/order/${encodeURIComponent(code.trim())}`;
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
