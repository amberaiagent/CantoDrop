// Platform defaults for the "hybrid" rule model: the dev sets CA, supply and
// target cap; these fields default unless the dev overrides them in advanced mode.

export const DEPOSIT_WALLET =
  process.env.DEPOSIT_WALLET || "H34PbZN5gxckdVs9wSEvtF4oVcXrzwXQtgMiwtYCJBAH";

export const DEFAULTS = {
  // Every holder from #1 to #200 is included; the bot always skips the
  // liquidity-pool wallet. (No top-N exclusion.)
  holderTopFrom: 1,
  holderTopTo: 200,
  capMultiplier: 2, // new holder snapshot + drop at every xN of cap
  splitPercent: 50, // % of the *remaining* balance dropped at each milestone
};

// Bounds for dev-overridable advanced fields.
export const LIMITS = {
  holderTopFromMin: 1,
  holderTopToMax: 2000,
  capMultiplierMin: 1.1,
  capMultiplierMax: 10,
  splitPercentMin: 1,
  splitPercentMax: 100,
  maxMilestonesPreview: 6,
};
