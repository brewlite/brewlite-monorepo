# CD configuration and release procedure

Prepared implementation; no GitHub run or AWS deployment performed in this work.

## Repository administrator setup

1. Create GitHub Environment `production`, restrict it to protected main/reviewed version tags, and configure required reviewers. Workflow `environment:` alone does NOT enable reviewers.
2. Add environment secrets DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY and DEPLOY_KNOWN_HOSTS. Store the real key only in GitHub Secrets; obtain known_hosts fingerprints through a trusted channel. Never use StrictHostKeyChecking=no.
3. Existing host path is /home/ubuntu/brewlite. Deployment user needs the approved passwordless sudo command needed by release.sh. Docker registry pull access must already be configured privately on the host for GHCR (read:packages for private images); workflow does not export GITHUB_TOKEN to EC2.
4. Retain deploy/.env.production (mode 600), uploads and volumes. Check SITE_DOMAIN/FRONTEND_ORIGIN, cookie Secure and SMTP privately. No secret gets built into images. Web embeds the public HTTPS origin; VNPay button defaults off because required demo uses mock wallet/card.
5. Inspect pending migrations, backup/restore plan, current image IDs and expected maintenance window. Do not start an older API after enum rename.

## Pipeline

CD runs on a v* tag push or manual dispatch. Quality reuses CI (web/API lint/unit/build, PostgreSQL integrations, deploy safety tests). Images use ghcr.io/<owner>/<repo>/api:<SHA> and /web:<SHA>. Publish job rejects a SHA not reachable from origin/main. Environment approval precedes verified SSH transfer/deploy, then public health/menu/login smoke tests.

Pending migration blocks default tag deploy before service changes. After reviewing its SQL and recovery plan, manually run CD on the approved main/release ref with allow_migrations=true. The script validates pg_dump backup, stops API/web, runs migrate deploy and starts the new images. No seed or operating inventory import is part of release.

Receipts: deploy/releases/<SHA>/<attempt> stores previous image IDs, previous compose and new image references; current stores the successful SHA. Backups stay private under deploy/backups. Do not upload database archives to Actions artifacts or Git.

## Failure / rollback

Without schema changes, release.sh restores previous image IDs if application startup/internal smoke fails. If migration began, automatic rollback is blocked: use a reviewed forward fix or restore the private dump to a separate recovery database and verify before any cutover. Never reset/drop the operating database.

If the final external smoke fails after internal smoke passed, the workflow fails and requires investigation; do not mark the release accepted or bypass protections. Check Caddy/DNS/public origin. Do not automatically restore an incompatible database/image pair.

## Evidence still required

Actual CI/CD URL, GHCR SHA images, environment approval, backup/restore rehearsal, HTTPS smoke output, release/tag notes and a demo recording. These cannot be honestly generated from uncommitted local code. Do not create a release/tag or deploy without the user's instruction.
