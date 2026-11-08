# BrewLite AWS deployment kit — PREPARATION, not a completed deployment

The production files are kept separate from the Windows development `docker-compose.yml`.
There are no real secrets in this kit. It does not change your local PostgreSQL volume.

## Contents
- `compose.prod.yml`: Next.js, NestJS, PostgreSQL 16, Caddy reverse proxy.
- `deploy/Caddyfile`: public HTTPS; `/api/*` -> NestJS, other requests -> Next.js.
- `deploy/.env.production.example`: template, not an actual secrets file.

## Before using this on EC2
1. Verify the *local, uncommitted* `apps/api/src/commerce/product-image.controller.ts` writes uploaded images beneath `/app/uploads/products` **inside the container**, or adjust the mount to the actual path. No local production image upload code was available to verify automatically.
2. Check whether product images stored in the database use absolute `localhost` URLs; those won't work on the public domain. Make a safe migration plan; do not directly rewrite a live database.
3. Choose a stable domain or subdomain, point DNS A to the EC2 public IPv4. For long-lived VNPay callback URLs, use a stable IP strategy; an auto-assigned public IPv4 can change after stop/start.
4. In the AWS security group, only SSH 22 from YOUR IP, and HTTP 80/HTTPS 443 from the Internet are needed. Do NOT publicly expose 3000, 3001, 5432, 5433.
5. On the EC2 host, create a private `deploy/.env.production` based on the example. Give it mode 600. Fill SITE_DOMAIN, DB credentials, DATABASE_URL, JWT_SECRET, SMTP and VNPay values. Never commit or paste secrets into chat.
6. Ensure `deploy/.env.production`, `uploads/`, and Docker archives are excluded by the project `.gitignore` before adding any files to Git.
7. Make an external, tested `pg_dump` backup from the Windows Postgres before restoring or migrating on EC2. Do not use migrate reset, seed, docker compose down -v, or overwrite the current database.
8. The existing Docker images on Windows are for local smoke testing; build a new production **frontend** image with `--build-arg NEXT_PUBLIC_API_URL=https://YOUR_DOMAIN` because `NEXT_PUBLIC_API_URL` is embedded at build time. Build API from the latest local code too (the GitHub branch may be stale).
9. Keep Docker build on Windows/CI rather than the 2GiB EC2 host. Export linux/amd64 images and transfer them only after testing.
10. Confirm login cookies (Secure in production), CORS origin, VNPay signed IPN, and SMTP on HTTPS. Do not mark payments successful based only on the return URL.

## Commands to use LATER (when domain, images, backups, secrets are ready)

Windows PowerShell, from `D:\brewlite-monorepo`:

```powershell
$domain = "YOUR_REAL_DOMAIN"
docker build --platform linux/amd64 --progress=plain -f apps/api/Dockerfile -t brewlite-api:prod apps/api
docker build --platform linux/amd64 --progress=plain --build-arg "NEXT_PUBLIC_API_URL=https://$domain" -f apps/web/Dockerfile -t brewlite-web:prod apps/web
# Validate local images. Do not push secrets.
```

Ubuntu EC2, in the directory containing `compose.prod.yml` and `deploy/`:

```bash
# Only after .env.production is filled privately and images have been loaded:
chmod 600 deploy/.env.production
mkdir -p uploads
chmod 700 uploads
# Check username/UID and upload destination before starting API.
docker compose --env-file deploy/.env.production -f compose.prod.yml config --quiet
# Warning: do not post `docker compose config` output; it can expose secrets.
# Start PostgreSQL only; restore a VALIDATED backup and review migrations before API starts.
docker compose --env-file deploy/.env.production -f compose.prod.yml up -d postgres
```

Do NOT run `docker compose up -d` for the whole stack until the above checks and DB restore are complete.

## Next steps in conversation
- Verify the local upload path and the API URL handling.
- Decide a domain/subdomain; prepare nonpublic credentials on EC2.
- Take and verify a PostgreSQL backup.
- Rebuild frontend with actual domain and transfer images; restore database and apply pending migrations.
- Start services, check HTTPS and `/api/health`, then register VNPay Sandbox IPN/return URLs.
