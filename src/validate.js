import { DEFAULTS, LIMITS } from "./config.js";

// Solana addresses are base58 (no 0, O, I, l), 32–44 chars.
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isSolanaAddress(s) {
  return typeof s === "string" && SOLANA_RE.test(s.trim());
}

class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

function num(value, field, { min, max, integer = false } = {}) {
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) throw new ValidationError(field, `${field} must be a number`);
  if (integer && !Number.isInteger(n)) throw new ValidationError(field, `${field} must be a whole number`);
  if (min != null && n < min) throw new ValidationError(field, `${field} must be ≥ ${min}`);
  if (max != null && n > max) throw new ValidationError(field, `${field} must be ≤ ${max}`);
  return n;
}

/**
 * Validate + normalize the incoming order payload from the form.
 * Only the CA is identity now — name/ticker are resolved on-chain by the bot.
 * Throws ValidationError {field, message} on bad input.
 */
export function parseOrderInput(body = {}) {
  const tokenMint = String(body.tokenMint ?? "").trim();
  if (!tokenMint) throw new ValidationError("tokenMint", "Token contract address is required.");
  if (!isSolanaAddress(tokenMint)) {
    throw new ValidationError("tokenMint", "That doesn't look like a valid Solana contract address (CA).");
  }

  // deposit_amount: whole token units, stored as exact integer string.
  const depositRaw = String(body.depositAmount ?? "").trim().replace(/[, _]/g, "");
  if (!/^\d+$/.test(depositRaw) || depositRaw === "0") {
    throw new ValidationError("depositAmount", "Supply to lock must be a positive whole number of tokens.");
  }
  const depositAmount = depositRaw.replace(/^0+/, "");

  const supplyPercent =
    body.supplyPercent === "" || body.supplyPercent == null
      ? null
      : num(body.supplyPercent, "supplyPercent", { min: 0, max: 100 });

  const targetMarketCap = num(
    String(body.targetMarketCap ?? "").replace(/[, _$]/g, ""),
    "targetMarketCap",
    { min: 1 }
  );

  // Advanced (optional) — fall back to platform defaults.
  const holderTopFrom = body.holderTopFrom == null || body.holderTopFrom === ""
    ? DEFAULTS.holderTopFrom
    : num(body.holderTopFrom, "holderTopFrom", { min: LIMITS.holderTopFromMin, integer: true });

  const holderTopTo = body.holderTopTo == null || body.holderTopTo === ""
    ? DEFAULTS.holderTopTo
    : num(body.holderTopTo, "holderTopTo", { max: LIMITS.holderTopToMax, integer: true });

  if (holderTopTo <= holderTopFrom) {
    throw new ValidationError("holderTopTo", "Top-to must be greater than top-from.");
  }

  const capMultiplier = body.capMultiplier == null || body.capMultiplier === ""
    ? DEFAULTS.capMultiplier
    : num(body.capMultiplier, "capMultiplier", { min: LIMITS.capMultiplierMin, max: LIMITS.capMultiplierMax });

  const splitPercent = body.splitPercent == null || body.splitPercent === ""
    ? DEFAULTS.splitPercent
    : num(body.splitPercent, "splitPercent", { min: LIMITS.splitPercentMin, max: LIMITS.splitPercentMax });

  return {
    tokenMint,
    depositAmount,
    supplyPercent,
    targetMarketCap,
    holderTopFrom,
    holderTopTo,
    capMultiplier,
    splitPercent,
  };
}

export { ValidationError };
