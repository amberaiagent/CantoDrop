# Deploying Canto Drop

The flow is the same as the previous project: **push the code to GitHub, the server
pulls it, and Docker runs it.** Orders are currently in-memory, so a redeploy/restart
resets the pool (see the persistence note at the bottom).

---

## 1. One-time: put the project on GitHub (from your PC)

```powershell
cd "C:\Users\user\Desktop\Canto Drop"
git init
git branch -M main
git remote add origin https://github.com/<your-username>/canto-drop.git
.\git_push.ps1 "initial commit"
```

After that, every time you change something, just run:

```powershell
.\git_push.ps1 "what you changed"
```

(`git_push.sh` is the same helper for Linux/Mac.)

> `.env` is **gitignored on purpose** — it holds `ADMIN_TOKEN` and never goes to GitHub.
> You create `.env` directly on the server (step 2).

---

## 2. One-time: set up the server

Requires Docker + Docker Compose on the server.

```bash
# pull the code
git clone https://github.com/<your-username>/canto-drop.git
cd canto-drop

# create the .env on the server (NOT committed)
cp .env.example .env
nano .env          # set ADMIN_TOKEN (and PORT if not 3000)

# build + run
docker compose up -d --build
```

The site is now on `http://<server-ip>:3000` (and `/admin`).

Put it behind a domain + HTTPS with a reverse proxy (nginx / Caddy / Cloudflare Tunnel)
pointing at port 3000 — your friend can wire that up.

---

## 3. Updating after a change

On your PC:

```powershell
.\git_push.ps1 "fix copy on the pool"
```

On the server:

```bash
cd canto-drop
git pull
docker compose up -d --build
```

That rebuilds and restarts the container with the new code.

Useful server commands:

```bash
docker compose logs -f         # watch logs
docker compose restart         # restart without rebuilding
docker compose down            # stop
```

---

## Files in this kit
- `Dockerfile` — builds the Node app image (`node:22-alpine`, prod deps only).
- `.dockerignore` — keeps `node_modules`, `.git`, `.env` out of the image.
- `docker-compose.yml` — runs the web service; has a commented Postgres service for later.
- `git_push.ps1` / `git_push.sh` — stage + commit + push helpers.
- `.github/workflows/docker-build.yml` — GitHub Action that builds the image on every push (catches Dockerfile breakage early).

---

## When you turn on persistence (Postgres)
Right now orders live in memory and reset on restart. To keep them:
1. Uncomment the `db:` service and `volumes:` in `docker-compose.yml`.
2. In `.env` set `DATABASE_URL=postgres://canto:canto@db:5432/canto_drop`.
3. Point `src/orders.js` at the database (the schema is already in `db/schema.sql`;
   run `npm run db:init` once). See the README "Enabling persistence later" note.
