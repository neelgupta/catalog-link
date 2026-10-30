# Deploying CatalogLink to a server

One Ubuntu 24.04 server runs everything:

- **Nginx** handles HTTPS and forwards requests to the web app.
- **Web app** is Next.js on port 3000, reachable only from the server itself.
- **Worker** is BullMQ: sheet sync, photos, the Orders tab.
- **PostgreSQL 16** and **Redis 7** run on the same server.
- **PM2** keeps the web app and the worker running and restarts them after a reboot.

Replace these placeholders before running anything:

| Placeholder | Example |
|---|---|
| `catalog.example.com` | your domain (an A record must point to the server's IP) |
| `you@example.com` | your email for the HTTPS certificate |
| `DB_PASSWORD` | a strong password for the database user |

Run the commands as a normal user with `sudo`, not as root. Use at least 2 GB of RAM; the build needs it, and step 1 adds swap for small servers.

---

## OTP SMS: not needed for now

Mobile OTP login is switched off (`OTP_LOGIN_ENABLED` in `packages/core/src/features.ts`), so the server starts without any MSG91 settings. To turn it on later, see README, "MSG91 setup".

---

## 1. Prepare the server

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl build-essential nginx ufw

# Firewall: SSH and web only (the app's port 3000 stays closed)
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# 2 GB swap so the build doesn't run out of memory on small servers
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

sudo timedatectl set-timezone Asia/Kolkata
```

## 2. Node.js 24, pnpm and PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt -y install nodejs
sudo corepack enable                              # provides pnpm (version pinned in package.json)
sudo npm install -g pm2
node -v && pnpm -v && pm2 -v
```

## 3. PostgreSQL and Redis

```bash
sudo apt -y install postgresql redis-server
sudo systemctl enable --now postgresql redis-server

# Database user and database
sudo -u postgres psql -c "CREATE USER cataloglink WITH PASSWORD 'DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE cataloglink OWNER cataloglink;"

# Redis: local only, kept by systemd
sudo sed -i 's/^supervised .*/supervised systemd/' /etc/redis/redis.conf
sudo systemctl restart redis-server
redis-cli ping                                     # → PONG
```

Both listen on localhost only by default. Don't open ports 5432 or 6379 in the firewall.

## 4. Get the code

```bash
sudo mkdir -p /var/www /var/lib/cataloglink/media
sudo chown -R $USER:$USER /var/www /var/lib/cataloglink
cd /var/www
git clone https://github.com/neelgupta/catalog-link.git cataloglink
cd cataloglink
git checkout main          # or the branch you deploy, e.g. ui-simplify
```

Product photos and logos go to `/var/lib/cataloglink/media`, outside the code folder, so updates never touch them.

## 5. Settings (`.env`)

Generate the secrets:

```bash
echo "SESSION_SECRET=$(openssl rand -base64 48)"
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
echo "INTERNAL_API_SECRET=$(openssl rand -hex 24)"
```

Create `/var/www/cataloglink/.env` with `nano .env`:

```dotenv
DATABASE_URL=postgresql://cataloglink:DB_PASSWORD@localhost:5432/cataloglink
REDIS_URL=redis://localhost:6379
APP_URL=https://catalog.example.com
MEDIA_DIR=/var/lib/cataloglink/media

SESSION_SECRET=...paste...
ENCRYPTION_KEY=...paste...
INTERNAL_API_SECRET=...paste...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./secrets/google-sa.json

OTP_PROVIDER=off          # mobile OTP login is switched off for now

SEED_ADMIN_EMAIL=admin.cataloglink@gmail.com
SEED_ADMIN_PASSWORD=...a strong password...
```

```bash
chmod 600 .env
```

Rules for these settings:
- **`ENCRYPTION_KEY` never changes once set.** It encrypts the clients' Google sign-ins; a new key means every client has to reconnect Google.
- **`APP_URL` must be the real `https://` address.** Catalog links, QR codes, the Google sign-in return address and the worker's cache refresh all use it.
- **Don't put `NODE_ENV` in `.env`.** PM2 sets it (step 7).

Copy the Google service-account key from your computer (run this **on your computer**):

```bash
scp secrets/google-sa.json user@SERVER_IP:/var/www/cataloglink/secrets/google-sa.json
```

Then on the server: `chmod 600 /var/www/cataloglink/secrets/google-sa.json`

## 6. Install, set up the database, build

```bash
cd /var/www/cataloglink
pnpm install --frozen-lockfile   # don't set NODE_ENV=production here: the build tools are needed
pnpm db:generate                 # database client
pnpm db:deploy                   # creates all tables (applies every migration)
pnpm db:seed                     # Super Admin from SEED_ADMIN_*, the Starter plan, settings
pnpm --filter @cataloglink/web build
```

## 7. Start the app with PM2

```bash
cd /var/www/cataloglink
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd              # prints one sudo command: copy-paste and run it
pm2 status                       # cataloglink-web and cataloglink-worker: online
curl -s http://127.0.0.1:3000/api/health
```

## 8. Nginx and HTTPS

Create `/etc/nginx/sites-available/cataloglink` (`sudo nano …`):

```nginx
server {
    listen 80;
    server_name catalog.example.com;

    # Logo / banner / sheet template uploads (the app allows up to 10 MB)
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        # The real visitor IP, used by the login / order rate limits. Not appended to a
        # client-sent header, so it can't be faked.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/cataloglink /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Free HTTPS certificate (auto-renews)
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d catalog.example.com -m you@example.com --agree-tos --redirect -n
```

Open `https://catalog.example.com/login` and sign in with the Super Admin from `.env`.

## 9. Google Cloud console

In **APIs & Services → Credentials**, open your OAuth client and add:

- **Authorised JavaScript origins:** `https://catalog.example.com`
- **Authorised redirect URIs:** `https://catalog.example.com/api/v1/google/oauth/callback`

On the **OAuth consent screen**, either add each client's Gmail as a test user, or publish the app. Google verification is needed for other accounts.

## 10. Daily backups

```bash
sudo mkdir -p /var/backups/cataloglink && sudo chown $USER /var/backups/cataloglink
cat > ~/backup-cataloglink.sh <<'EOF'
#!/bin/sh
set -e
cd /var/backups/cataloglink
STAMP=$(date +%F)
. /var/www/cataloglink/.env
pg_dump "$DATABASE_URL" | gzip > "db-$STAMP.sql.gz"
tar -czf "media-$STAMP.tar.gz" -C /var/lib/cataloglink media
find . -name '*.gz' -mtime +14 -delete      # keep two weeks
EOF
chmod +x ~/backup-cataloglink.sh
(crontab -l 2>/dev/null; echo "30 2 * * * $HOME/backup-cataloglink.sh >> /var/backups/cataloglink/backup.log 2>&1") | crontab -
```

Copy the backups off the server now and then (e.g. `scp` or `rsync` to your computer). To restore a database dump into an empty database:

```bash
gunzip -c db-YYYY-MM-DD.sql.gz | psql "postgresql://cataloglink:DB_PASSWORD@localhost:5432/cataloglink"
```

---

## Updating to a new version

```bash
cd /var/www/cataloglink
git pull
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:deploy                       # applies new migrations, if any
pnpm --filter @cataloglink/web build
pm2 restart all
```

Always restart **both** processes after `db:deploy`, so they use the new database client.

## Everyday commands

```bash
pm2 status                           # are both running?
pm2 logs cataloglink-web --lines 100
pm2 logs cataloglink-worker --lines 100
pm2 restart cataloglink-web
curl -s https://catalog.example.com/api/health
sudo tail -f /var/log/nginx/error.log
```

## Troubleshooting

- **Web app won't start, "Invalid environment variables".** The message lists each bad setting.
- **502 Bad Gateway.** The web app isn't running: check `pm2 status` and `pm2 logs cataloglink-web`.
- **Photos or catalog don't update after a sync.** Check `pm2 logs cataloglink-worker`. `APP_URL` must be the public https address, and `INTERNAL_API_SECRET` must match for both processes (they read the same `.env`).
- **Google sign-in says `redirect_uri_mismatch`.** Step 9: the redirect URI must match `APP_URL` exactly.
- **Build killed / out of memory.** Add the swap from step 1, or use a server with more RAM.
