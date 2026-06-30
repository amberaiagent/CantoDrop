# trench

Website + database for an automated **linear holder-airdrop** platform on Solana.

A token dev opens a **drop order**: they commit a slice of supply and a target market cap.
When the cap is hit, a bot snapshots holders ranked **#1–#200** (excluding the liquidity-pool
wallet) and distributes the supply evenly among them. At every **×2** of the cap a fresh
snapshot is taken and the next slice (50% of what's left) is dropped: a linear, halving payout.

This repo is **only the site + DB**. The drop bot is separate and is the writer for everything
after a deposit lands; the site only creates `pending` orders and reads status.

## Stack
- Node + Express (ESM), static frontend (no build step)
- PostgreSQL (`pg`)
- Solana — deposits are manual transfers to one shared platform wallet, matched by a **memo (reference code)**

## Setup

Orders are currently kept **in memory** (no persistence) — they reset when the
server restarts. Nothing is written to disk yet.

```bash
npm install
cp .env.example .env        # optional: set PORT / DEPOSIT_WALLET
npm start                   # → http://localhost:3000
```

### Enabling persistence later
The Postgres layer is already written but not wired into the running path:
`db/schema.sql`, `db/pool.js`, `scripts/init-db.js`. To switch on persistence,
set `DATABASE_URL` in `.env`, run `npm run db:init`, and point `src/orders.js`
at the DB instead of the in-memory `Map`.

`.env`:
- `PORT` — http port (default 3000)
- `DATABASE_URL` — Postgres connection string
- `DEPOSIT_WALLET` — the shared public wallet devs send supply to
  (default `H34PbZN5gxckdVs9wSEvtF4oVcXrzwXQtgMiwtYCJBAH`)

## Flow
1. Dev fills the form (just the **CA**, supply amount, target cap; advanced: holder range, multiplier, split). The site resolves the token **name + ticker from the CA via DexScreener** (shown live under the field and stored on the order).
2. `POST /api/orders` validates, inserts a `pending` row, returns a **deposit wallet + memo code**.
3. Dev sends the tokens to the wallet **with that memo**.
4. Your bot watches the wallet, matches the incoming SPL transfer by **memo + token mint**,
   updates the order to `funded`, then drives `active → completed` as milestones fire.
5. Anyone can check status at `/order/<reference>`.

## HTTP API
| Method | Path | Purpose |
| --- | --- | --- |
| `GET`  | `/api/config` | platform defaults + limits (used by the form) |
| `GET`  | `/api/token/:mint` | resolve a token's `name` + `ticker` from its CA (DexScreener, Solana base-token only) |
| `POST` | `/api/orders` | create an order → `{ order, deposit:{wallet,memo,amount,tokenMint}, preview }` |
| `GET`  | `/api/orders` | list every order, newest first (powers the public Live Pool) |
| `GET`  | `/api/orders/:reference` | fetch one order + canto schedule |
| `PATCH`| `/api/orders/:reference` | **bot only** — move an order's status / push market cap + round |
| `GET`  | `/order/:reference` (or `/token/:reference`) | human status page |

### Moving orders by hand — the admin panel

Open **`/admin`** (e.g. `http://localhost:3000/admin`). It asks for the admin password
(`ADMIN_TOKEN` from `.env`), then lists every order and lets you move each one through its
statuses with buttons (waiting → funded → active → completed / cancelled) and type in the
current market cap + which canto round fired. Changes hit the public Live Pool instantly.
Use this to follow the bot manually instead of the API below. If `ADMIN_TOKEN` is left blank,
the panel and the PATCH endpoint are open (local dev only).

### Moving an order through its lifecycle (PATCH)

The admin panel is just a UI over this endpoint. The bot can call it directly.
Accepted fields: `status`
(`pending` · `funded` · `active` · `completed` · `cancelled`), `currentMarketCap`,
`cantoRound`, `fundedAmount`, `fundedTx`.

```bash
# mark funded (deposit landed)
curl -X PATCH localhost:3000/api/orders/CANTO-XXXXXXXX \
  -H "Content-Type: application/json" \
  -d '{"status":"funded","fundedAmount":"100000000","fundedTx":"5xab…"}'

# target cap reached → drops running; push live cap + which canto fired
curl -X PATCH localhost:3000/api/orders/CANTO-XXXXXXXX \
  -H "Content-Type: application/json" \
  -d '{"status":"active","currentMarketCap":75000,"cantoRound":1}'

# all rounds done
curl -X PATCH localhost:3000/api/orders/CANTO-XXXXXXXX \
  -H "Content-Type: application/json" \
  -d '{"status":"completed","cantoRound":6}'
```

The Live Pool polls every 6s, so the row's badge + progress bar update on their own.
Set `ADMIN_TOKEN` in `.env` to require the bot to send `-H "x-admin-token: <token>"`;
if unset, the endpoint is open (handy locally).

## Database contract (for the bot)

Table `orders` (see [`db/schema.sql`](db/schema.sql)). The bot owns these transitions:

- **Match a deposit:** find the `pending` order where `reference` == the transfer **memo**
  and `token_mint` == the SPL mint received. Set `status='funded'`, `funded_tx`,
  `funded_amount`, `funded_at`.
- **Start drops:** when market cap ≥ `target_market_cap`, set `status='active'`.
- **Distribute:** snapshot holders ranked `holder_top_from`..`holder_top_to`, split evenly.
  Re-snapshot + drop `split_percent`% of the remaining balance at every `cap_multiplier`× of cap.
- **Finish:** when the balance is exhausted, set `status='completed'`.

All numeric columns are returned as exact decimal **strings** by `pg` (token amounts can exceed
2^53) — keep them as strings / BigInt in the bot.

## Deployment
Docker + GitHub flow (push code → server pulls → `docker compose up`). Full step-by-step,
including the `git_push` helper and server setup, is in **[DEPLOY.md](DEPLOY.md)**.

## Project layout
```
server.js            Express app + routes
src/
  config.js          platform defaults (holder range, ×2, 50/50) + deposit wallet
  validate.js        input validation (Solana CA, amounts, advanced fields)
  orders.js          insert/read order + milestone preview
db/
  schema.sql         orders table + trigger
  pool.js            pg pool
scripts/init-db.js   apply schema (npm run db:init)
public/              index.html (landing+form), order.html (status), style.css, app.js
```
