# ADR-0002 — Controlled EC2 delivery

Status: prepared for review, not an executed production rollout.

BrewLite uses an existing single EC2 host with Docker Compose, Caddy and private PostgreSQL. Build on GitHub runners rather than the small EC2 host. Publish API/web linux/amd64 images to GHCR under the exact commit SHA; verify the release commit is reachable from main. Reuse CI gates and require the production GitHub Environment before SSH deployment.

Retain host runtime secrets, uploads and PostgreSQL volume. Verify SSH host keys using an independently checked known_hosts entry. Back up with pg_dump custom format and validate the archive listing before migration. Pending migrations require an explicit reviewed migration flag. Stop old API/web before schema changes. Never seed/reset/down -v.

An image rollback is safe only when no migration began. If migration started, halt automatic rollback and use reviewed forward fix or restore to a separate database. This handles the breaking PENDING_PAYMENT→PENDING enum rename; old images cannot be blindly restored against the new schema.

Trade-offs: one host has a maintenance window and no high availability. Backups on the same host are only a preflight safety copy; off-host backup/restore validation remains an operational requirement. SSH/registry credentials and production environment reviewers must be configured by repository administrators. A green local script test does not prove remote deployment.

References: https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows and https://docs.docker.com/build/ci/github-actions/.
