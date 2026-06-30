// Market cap + the liquidity-pool address, from DexScreener (no key needed).
// Same source the website uses for ticker/supply, so the numbers match.

export async function getMarketData(mint) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const pairs = (json.pairs || []).filter((p) => p.chainId === "solana");
    // The pair where our mint is the base token, with the deepest liquidity.
    const mine = pairs
      .filter((p) => p.baseToken?.address?.toLowerCase() === mint.toLowerCase())
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const p = mine[0];
    if (!p) return null;
    const priceUsd = Number(p.priceUsd) || 0;
    const fdv = Number(p.fdv) || 0;
    return {
      marketCap: Number(p.marketCap) || fdv, // marketCap if given, else FDV
      priceUsd,
      totalSupply: priceUsd > 0 && fdv > 0 ? Math.round(fdv / priceUsd) : null,
      // the AMM pool account(s) — excluded from holder snapshots
      pairAddress: p.pairAddress || null,
    };
  } catch {
    return null;
  }
}
