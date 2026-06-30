# trench drop bot

The bot that executes every order on [trenchdrop.xyz](https://trenchdrop.xyz).
It is **public on purpose** — anyone can read exactly what it does. There is no
hidden logic: the schedule it runs is the same formula the website previews.

## What it does
Every `POLL_INTERVAL` seconds it reads all orders from the public API and:

1. **Pending → Funded.** Watches the pool wallet for an incoming SPL transfer
   whose **memo == the order code** and **mint == the order's CA**, then records
   the funded amount + tx.
2. **Funded/Active → drops.** Reads the live market cap (DexScreener). Each time
   the next round's cap threshold is reached, it snapshots holders **#from–#to**
   (excluding the liquidity pool + any configured addresses), and sends an
   **even** cut of that round's amount to each.
3. **Completed.** After the last round, the order is marked completed.

All status changes are written back through the public API, so they show up live
on the site's pool and token pages.

## Setup
```bash
cd bot
npm install
cp .env.example .env     # fill in RPC, wallet secret, admin token
node index.js            # starts the loop (DRY_RUN by default)
```

`.env` (never committed — it holds the wallet key):
- `RPC_URL` — Solana RPC. **Helius recommended** (holder enumeration needs an
  indexed endpoint). Free key at helius.dev.
- `DEPOSIT_WALLET_SECRET` — private key of the pool wallet
  (`76Ex3DWvSnXwozo1rHDeKys5KA8mzbjSV9LMy1nmHCbT`), base58 or JSON byte array.
- `API_BASE` — `https://trenchdrop.xyz`
- `ADMIN_TOKEN` — same value as the site's `.env`.
- `DRY_RUN` — `true` = simulate only. **Keep true until tested.**
- `EXCLUDE_ADDRESSES` — extra wallets to never reward (team, CEX, MM…).

## Safety / going live
- **DRY_RUN is on by default.** The bot logs the holders it would pay and the
  amount each, and sends nothing. Watch the logs first.
- **Test on devnet** before mainnet: point `RPC_URL` at a devnet endpoint and
  use a devnet token + wallet.
- The pool wallet needs **SOL** for fees and for creating recipient token
  accounts (~0.002 SOL each; ~2 SOL covers 1000 holders).
- LP detection uses the DexScreener pool address; for a brand-new token verify
  the LP is excluded, and add it (and team wallets) to `EXCLUDE_ADDRESSES`.
- Flip `DRY_RUN=false` only when you're satisfied with the dry-run output.

## Run modes
- `node index.js` — continuous loop.
- `node index.js --once` — single pass (good for cron / debugging).

## Files
```
index.js        main loop + round engine
src/config.js   env + wallet keypair
src/api.js      reads/writes orders via the public trench API
src/market.js   market cap + LP address (DexScreener)
src/chain.js    holders snapshot, deposit detection, sending the drops
src/engine.js   the round schedule (same formula as the website)
```
