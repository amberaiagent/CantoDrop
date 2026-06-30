// Platform defaults for the "hybrid" rule model: the dev sets CA, supply and
// target cap; the distribution fields default unless overridden in advanced mode.

export const DEPOSIT_WALLET =
  process.env.DEPOSIT_WALLET || "5nss5tF1hCXZdmp9phgjPyJPrEovS5uLbqtKyy9bS3MA";

export const DEFAULTS = {
  // Every holder from #1 to #1000 is included; the bot always skips the
  // liquidity-pool wallet. Range is overridable (up to #1000).
  holderTopFrom: 1,
  holderTopTo: 1000,

  // Distribution across rounds.
  rounds: 5,                 // how many drop rounds
  splitPercent: 50,          // % dropped each round
  splitBasis: "remaining",   // "remaining" = % of current balance (tapers) |
                             // "total"     = % of the original locked amount (flat)

  // Cap progression — when each round fires.
  capMode: "multiply",       // "multiply" = ×capMultiplier of cap |
                             // "step"     = +capStep USD from the start target
  capMultiplier: 2,
  capStep: 100000,           // USD added each round in step mode
};

// Bounds for the dev-overridable advanced fields.
export const LIMITS = {
  holderTopFromMin: 1,
  holderTopToMax: 1000,
  roundsMin: 1,
  roundsMax: 30,
  capMultiplierMin: 1.1,
  capMultiplierMax: 10,
  capStepMin: 1000,
  splitPercentMin: 1,
  splitPercentMax: 100,
  maxRoundsPreview: 30,
};
