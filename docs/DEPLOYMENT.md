# Deploying MindEase Oasis

The app is production-ready but not deployed. This guide covers two options:

- **A. Managed:** Render (API + PostgreSQL) and Vercel (website). Least maintenance.
- **B. One VPS:** Ubuntu with Nginx, PM2 and PostgreSQL. Full control, lowest cost.

## How the pieces fit

```
Browser ──https──> Website (Next.js) ──/api/* rewrite──> API (NestJS) ──> PostgreSQL
                                                          ├─> SSLCommerz (payments)
                                                          ├─> Gmail SMTP (email)
                                                          └─> Google Gemini (AI chat)
```

- **Website calls only:** the browser only ever talks to the website. `/api/*` is forwarded to the API, so login cookies stay first-party.
- **API_URL is baked in at build time:** the website reads `API_URL` when it is built. Rebuild the website if the API address changes.
- **SSLCommerz callbacks:** SSLCommerz sends the browser back to `https://<website>/api/payments/sslcommerz/...`. Its background notification (IPN) goes to the same address, so the website must be publicly reachable over HTTPS.

## Before you start (both options)

1. **Generate the two secrets once** and keep them in a password manager:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_ACCESS_SECRET
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # DATA_ENCRYPTION_KEY
   ```
   - **`DATA_ENCRYPTION_KEY` encrypts chats, notes and messages.** If you lose it, that data can't be read, and backups don't include it.
   - **Moving existing data:** to carry over data from development, copy the same key you used there.
2. **SSLCommerz:**
   - **Testing:** keep `SSLCOMMERZ_SANDBOX=true` while you test.
   - **Going live:** apply for a live store, then set `SSLCOMMERZ_SANDBOX=false` with the live Store ID and password.
3. **Email:** a Gmail App Password works for a demo or a small launch (about 500 emails a day). Use a transactional provider for more.
4. **Startup checks:** with `NODE_ENV=production` the API refuses to start if any of these is missing or weak:
   - `JWT_ACCESS_SECRET` of at least 32 characters
   - an `https://` `WEB_ORIGIN`
   - SSLCommerz credentials
   - `DATA_ENCRYPTION_KEY`

### API environment (production)

| Variable | Example | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `4000` | Render sets this itself |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/mindease?sslmode=require` | |
| `WEB_ORIGIN` | `https://mindease.example.com` | The website's public URL |
| `JWT_ACCESS_SECRET` | *(generated)* | |
| `DATA_ENCRYPTION_KEY` | *(generated)* | |
| `TRUST_PROXY` | `1` | One proxy (Render/Nginx) in front of the API |
| `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` | | |
| `SSLCOMMERZ_SANDBOX` | `true` → `false` when live | |
| `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | | Optional; emails are logged without them |
| `GEMINI_API_KEY` | | A paid key for real traffic (the free tier allows 5 requests per minute per model) |
| `UPLOAD_DIR` | `/var/lib/mindease/uploads` | **Must be persistent storage** (doctor licences) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | | Strong password; the seed refuses the default in production |

## A. Render + Vercel

### 1. Database and API on Render

1. **Database:** in Render, choose **New → PostgreSQL** and copy its *Internal Database URL*.
2. **API service:** choose **New → Web Service** and connect the GitHub repo.
   - **Root directory:** *(leave empty, i.e. the repo root)*
   - **Build command:**
     `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @mindease/shared build && pnpm --filter api build && pnpm --filter api exec prisma migrate deploy`
   - **Start command:** `pnpm --filter api start:prod`
   - **Health check path:** `/api/health`
   - **Environment:** the table above, with `TRUST_PROXY=1`.
3. **Licence storage:** add a **Disk** (e.g. 1 GB) mounted at `/var/lib/mindease`, and set `UPLOAD_DIR=/var/lib/mindease/uploads`. Without a disk, uploaded licences disappear on every deploy.
4. **First deploy:** run the seed once from the service's **Shell**: `pnpm --filter api exec prisma db seed`. Demo doctors are only created outside production.

### 2. Website on Vercel

1. **New project:** **Add New → Project**, import the repo, and set **Root Directory** to `apps/web`. Vercel detects Next.js and pnpm.
2. **Environment variable:** `API_URL=https://<your-api>.onrender.com`. This is used at build time, so redeploy after changing it.
3. **Domain:** add your domain (e.g. `mindease.example.com`), then set the API's `WEB_ORIGIN` to exactly that URL.

### 3. After going live

- **SSLCommerz merchant panel:** no URL settings are needed; each payment sends its own callback URLs.
- **Check it works:**
  - `https://<website>/api/health` returns `{"status":"ok","db":"up"}`.
  - Register a test account, and you receive the verification email.
  - A sandbox payment completes and lands on the result page.

## B. One Ubuntu VPS

Suggested size: 2 vCPU and 2 GB RAM (e.g. a DigitalOcean droplet in Singapore or Bangalore for low latency from Bangladesh).

1. **Install the software:**
   ```bash
   sudo apt update && sudo apt install -y nginx postgresql postgresql-client certbot python3-certbot-nginx
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs
   sudo corepack enable && sudo npm i -g pm2
   ```
2. **Create the database:**
   ```bash
   sudo -u postgres createuser -P mindease        # choose a password
   sudo -u postgres createdb -O mindease mindease
   ```
3. **Get the code and build:**
   ```bash
   sudo mkdir -p /srv/mindease /var/lib/mindease/uploads /var/backups/mindease && sudo chown -R $USER /srv/mindease /var/lib/mindease /var/backups/mindease
   git clone https://github.com/shihab1400/APWT_full_stack.git /srv/mindease && cd /srv/mindease
   cp apps/api/.env.example apps/api/.env   # fill in the production values (table above), TRUST_PROXY=loopback
   pnpm install --frozen-lockfile
   pnpm --filter api exec prisma migrate deploy && pnpm --filter api exec prisma db seed
   API_URL=http://127.0.0.1:4000 pnpm build
   ```
4. **Run both apps with PM2:**
   ```bash
   pm2 start "pnpm --filter api start:prod" --name mindease-api
   pm2 start "pnpm --filter web start --port 3000" --name mindease-web
   pm2 save && pm2 startup     # follow the printed command so they start on boot
   ```
5. **Nginx and HTTPS.** Create `/etc/nginx/sites-available/mindease`:
   ```nginx
   server {
     server_name mindease.example.com;
     client_max_body_size 6m;                 # licence uploads are up to 5 MB
     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_buffering off;                   # live notifications and chat (Server-Sent Events)
       proxy_read_timeout 15m;
     }
   }
   ```
   Then:
   ```bash
   sudo ln -s /etc/nginx/sites-available/mindease /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d mindease.example.com
   ```
   Only Nginx is exposed: keep ports 3000 and 4000 closed (`sudo ufw allow 'Nginx Full' && sudo ufw allow OpenSSH && sudo ufw enable`).
6. **Updates:**
   ```bash
   git pull && pnpm install --frozen-lockfile && pnpm --filter api exec prisma migrate deploy && API_URL=http://127.0.0.1:4000 pnpm build && pm2 restart all
   ```

## Backups

`pnpm db:backup` writes a compressed `pg_dump` archive and keeps the newest 14 (`BACKUP_DIR`, `BACKUP_KEEP`).

- **VPS, daily at 02:00:**
  ```bash
  crontab -e
  0 2 * * * cd /srv/mindease && BACKUP_DIR=/var/backups/mindease pnpm --filter api db:backup >> /var/log/mindease-backup.log 2>&1
  ```
  Copy `/var/backups/mindease` off the server regularly (e.g. `rclone` to Google Drive), as the test plan asks for off-site copies.
- **Render:** paid PostgreSQL plans include daily backups with point-in-time recovery. You can also run `db:backup` from a Cron Job service.
- **This Windows PC:** in Task Scheduler, create a daily task that runs `pnpm --filter api db:backup` with "Start in" set to the project folder.
- **Restore** (replaces everything in the target database):
  ```bash
  pnpm --filter api db:restore backups/mindease-20261025-0200.dump --yes
  ```
  Test restores now and then into a scratch database by setting `DATABASE_URL` for that one command.

## Security checklist

- [ ] HTTPS only; `WEB_ORIGIN` is the https URL (cookies are `Secure` in production).
- [ ] `JWT_ACCESS_SECRET` and `DATA_ENCRYPTION_KEY` are random, stored in a password manager, and never committed.
- [ ] Seeded admin password changed, or set strong via `SEED_ADMIN_PASSWORD`.
- [ ] `UPLOAD_DIR` is on persistent storage and is not served by Nginx.
- [ ] Ports 3000, 4000 and 5432 are not reachable from the internet.
- [ ] Daily backups run, with off-site copies; a restore has been tested.
- [ ] A paid Gemini key if real users will chat.
