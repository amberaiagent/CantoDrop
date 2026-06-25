// Resolve a Solana token's name + ticker from its mint (CA) via DexScreener.
// No API key needed; works well for pump.fun / meme / game tokens that have a pool.
// Results are cached briefly so the form-preview fetch and the create call don't
// both hit the network.

const cache = new Map(); // mint -> { data, ts }
const TTL_MS = 5 * 60 * 1000;

export async function resolveToken(mint) {
  const cached = cache.get(mint);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.data;

  let data = { name: null, ticker: null, totalSupply: null };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);
    if (res.ok) {
      const json = await res.json();
      const pairs = Array.isArray(json.pairs) ? json.pairs : [];
      // Only trust a Solana pair where our mint is the BASE token. (DexScreener
      // returns pairs across all chains; the same address string can exist on
      // another SVM chain, and we never want to guess the wrong token.)
      const p = pairs.find(
        (x) =>
          x.chainId === "solana" &&
          x.baseToken?.address?.toLowerCase() === mint.toLowerCase()
      );
      if (p?.baseToken) {
        // total supply ≈ fully-diluted valuation / price (DexScreener gives both).
        const fdv = Number(p.fdv);
        const price = Number(p.priceUsd);
        const totalSupply = fdv > 0 && price > 0 ? Math.round(fdv / price) : null;
        data = {
          name: p.baseToken.name || null,
          ticker: p.baseToken.symbol || null,
          totalSupply,
        };
      }
    }
  } catch {
    // network/timeout/abort → leave nulls; caller falls back to the CA
  }
  cache.set(mint, { data, ts: Date.now() });
  return data;
}
