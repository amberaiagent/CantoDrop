import { randomBytes } from "crypto";
import { DEPOSIT_WALLET, LIMITS } from "./config.js";

// ─────────────────────────────────────────────────────────────────────────
// In-memory order store (no persistence yet).
// Orders live only for the current server run and are lost on restart.
// Swap this module for a DB-backed one when we're ready to persist.
// ─────────────────────────────────────────────────────────────────────────
const orders = new Map(); // reference -> order object

// Human-friendly, unambiguous reference code used as the Solana transfer memo.
// e.g. CANTO-7F3A9C2B. No 0/O/1/I to avoid copy mistakes.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeReference() {
  const bytes = randomBytes(8);
  let code = "";
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return `TRENCH-${code}`;
}

/** Create a new pending order (kept in memory). Identity is the CA only. */
export async function createOrder(input) {
  let reference = makeReference();
  while (orders.has(reference)) reference = makeReference();

  const order = {
    reference,
    token_mint: input.tokenMint,
    token_name: input.tokenName ?? null,
    token_ticker: input.tokenTicker ?? null,
    deposit_amount: input.depositAmount,
    supply_percent: input.supplyPercent,
    target_market_cap: input.targetMarketCap,
    holder_top_from: input.holderTopFrom,
    holder_top_to: input.holderTopTo,
    rounds: input.rounds,
    split_percent: input.splitPercent,
    split_basis: input.splitBasis,
    cap_mode: input.capMode,
    cap_multiplier: input.capMultiplier,
    cap_step: input.capStep,
    deposit_wallet: DEPOSIT_WALLET,
    status: "pending",
    // updated by the bot once it sees on-chain activity
    current_market_cap: 0,
    canto_round: 0, // how many x2 rounds have fired
    funded_tx: null,
    funded_amount: null,
    created_at: new Date().toISOString(),
  };

  orders.set(reference, order);
  return order;
}

export async function getOrderByReference(reference) {
  return orders.get(reference) || null;
}

/** All orders, newest first — feeds the public Live Pool. */
export async function getAllOrders() {
  return [...orders.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export const ORDER_STATUSES = ["pending", "funded", "active", "completed", "cancelled"];

/**
 * Update a single order (the bot calls this to move it through its lifecycle:
 * funded → active → completed, and to push current_market_cap / canto_round).
 * Returns the updated order, or null if the reference is unknown.
 */
export async function updateOrder(reference, fields = {}) {
  const order = orders.get(reference);
  if (!order) return null;

  if (fields.status !== undefined) {
    if (!ORDER_STATUSES.includes(fields.status)) {
      throw new Error(`invalid status: ${fields.status}`);
    }
    order.status = fields.status;
  }
  if (fields.currentMarketCap !== undefined) order.current_market_cap = Number(fields.currentMarketCap);
  if (fields.cantoRound !== undefined) order.canto_round = Number(fields.cantoRound);
  if (fields.fundedAmount !== undefined) order.funded_amount = String(fields.fundedAmount);
  if (fields.fundedTx !== undefined) order.funded_tx = String(fields.fundedTx);

  return order;
}

/**
 * Build the per-round drop schedule for the preview / confirmation / token page.
 *
 * Each round: a fresh top-holder snapshot is taken at the round's market cap, and
 * a slice of the supply is distributed. Two knobs control the shape:
 *   splitBasis "remaining" → drop = splitPercent% of the current balance (tapers)
 *   splitBasis "total"     → drop = splitPercent% of the original locked amount (flat)
 *   capMode "multiply"     → cap_i = targetCap × capMultiplier^i
 *   capMode "step"         → cap_i = targetCap + capStep × i
 */
export function milestonePreview(order) {
  const deposit = Number(order.deposit_amount ?? order.depositAmount);
  const targetCap = Number(order.target_market_cap ?? order.targetMarketCap);
  const rounds = Math.min(Number(order.rounds ?? order.roundsCount ?? 5), LIMITS.maxRoundsPreview);
  const split = Number(order.split_percent ?? order.splitPercent) / 100;
  const basis = (order.split_basis ?? order.splitBasis ?? "remaining");
  const capMode = (order.cap_mode ?? order.capMode ?? "multiply");
  const mult = Number(order.cap_multiplier ?? order.capMultiplier ?? 2);
  const step = Number(order.cap_step ?? order.capStep ?? 0);

  const rows = [];
  let remaining = deposit;
  for (let i = 0; i < rounds && remaining > 0.0000001; i++) {
    const cap = capMode === "step" ? targetCap + step * i : targetCap * Math.pow(mult, i);
    let drop = basis === "total" ? deposit * split : remaining * split;
    if (drop > remaining) drop = remaining; // never overshoot the balance
    rows.push({
      milestone: i + 1,
      marketCap: cap,
      dropAmount: drop,
      remainingAfter: Math.max(remaining - drop, 0),
    });
    remaining -= drop;
  }
  return rows;
}
