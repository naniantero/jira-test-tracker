# Test Tracker

A small self-hosted app for tracking manual test status. Admins and an agent create test cases, grouped by feature: an admin in the UI at Admin → Test cases, an agent (or a script) with the `tt` command-line tool, which writes straight to the database. The tracker stores the cases itself and talks to no other system. Testers mark each test case as Untested, Passed, Issue or Ready for retest, add comments with attachments, and see a timeline.

Stack: Next.js 16, Drizzle, Better Auth, and SQLite by default (libsql) or PostgreSQL (`pg`). With SQLite the database lives in one volume, `/data` (`app.db` in WAL mode); with PostgreSQL the container keeps no state. Attachments go to an Azure Blob or S3-compatible bucket; without one they are disabled.

## Test cases

A **group** (a feature or an epic, for example "Kirjautuminen") has a key, a title, an optional description and a position. A **test case** belongs to one group and has a key, a title, a Markdown description (preconditions, steps, expected result), a list of acceptance criteria, an optional **reference** and a position. The reference is free text, for example a ticket key like `PROJ-1035` or a URL; the sheet shows it as a link when it is an http(s) URL and as plain text otherwise.

- **Keys** match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`, are case-sensitive, and are unique across all groups (group keys among groups, case keys among cases). The same case key always means the same case. `tt sync` with a case key that exists in another group moves that case here, with its status and timeline; `tt case create` with an existing key fails, and a single case moves with `tt case update <key> --group <key>`.
- **Limits:** title 1-500 characters, description up to 50 000, up to 100 criteria of 1-5 000 characters each, reference up to 500.
- **Archiving** hides a case (or a group and its cases) from testers. An archived case keeps its status and timeline and gets them back when it is restored or its key returns in a sync. The tree also hides groups without active cases.
- **Changed since tested:** when a case that is not Untested gets a new title, description or criteria (from the CLI or the UI), it is flagged and the timeline says which fields changed and who changed them. The Changed tab and the alert in the sheet are for admins only, and an admin's _Keep status_ review clears the flag. Untested cases change silently, and reference, position and group changes never flag.
- **Content version:** every change to title, description or criteria raises the case's version. A status change carries the version the tester saw and is refused if the case changed in between ("This test case changed. Reload it to see the new version."), so a case cannot be passed against text that was just rewritten. Comments are not checked.

Admins manage groups and cases in the UI at **Admin → Test cases**: create, edit, archive and restore, move up or down, and move a case to another group. The UI and the CLI use the same library (`src/lib/cases/`), so validation, ordering and change flagging behave the same.

### The `tt` CLI

`tt` writes directly to the database the app uses, without a login: access to the database is the permission. It uses `DATABASE_URL` / `DATABASE_URL_FILE` or `DATABASE_PATH` like the app and needs none of the other variables. It never migrates; if the database is missing or behind it exits asking you to start the app once.

```bash
npm run cli -- <command>                          # in the repository
docker compose exec app node cli.mjs <command>    # in the container, SQLite compose file
docker compose -f docker-compose.postgres.yml exec app node cli.mjs <command>   # PostgreSQL compose file
docker compose exec -T app node cli.mjs sync --file - < login.json   # a local file through standard input (add -f docker-compose.postgres.yml for PostgreSQL)
```

```text
tt sync --file <path|-> [--dry-run] [--actor <name>]
tt group list
tt group export <key>
tt group create --key <key> --title <title> [--description <markdown>]
tt group update <key> [--title <title>] [--description <markdown>]
tt group archive <key>
tt group restore <key>
tt case list [--group <key>] [--archived]
tt case create --group <key> --key <key> --title <title>
    [--description <markdown> | --description-file <path|->] [--criterion <text>]... [--reference <ref>]
tt case update <key> [--title <title>] [--description <markdown> | --description-file <path|->]
    [--criterion <text>]... [--reference <ref>] [--group <key>]
tt case archive <key>
tt case restore <key>
```

`--json` on any command prints one JSON document for machines. Commands that write take `--actor <name>` (default `CLI`), the name on the timeline events they add; those events have no user. Exit codes: 0 done, 1 invalid input or not found (validation errors are listed with their JSON path), 2 usage error. `tt` with no arguments prints the usage.

`npm run build` bundles the CLI into `dist/cli.mjs`; the image ships it as `/app/cli.mjs`.

### Sync

`tt sync` reads one group from a JSON file:

```json
{
  "schemaVersion": 1,
  "group": { "key": "login", "title": "Kirjautuminen", "description": "Optional, Markdown" },
  "cases": [
    {
      "key": "LOGIN-01",
      "title": "Väärä salasana lukitsee tunnuksen viidennellä yrityksellä",
      "description": "Markdown: preconditions, steps, expected result",
      "acceptanceCriteria": ["Viides väärä yritys lukitsee tunnuksen"],
      "reference": "PROJ-1035"
    }
  ]
}
```

**The file is the source of truth for its group.** In one transaction a sync upserts the group by key, upserts each case by key with its position taken from the file order, restores archived cases whose key returns, moves cases that currently sit in another group, and **archives the group's cases that are missing from the file**, including cases created in the UI. It overwrites edits made in the UI, with no guard. Other groups are never archived, even when a case moves out of them. Duplicate case keys in a file are an error; an empty `cases` array archives all of the group's cases.

So for an existing group always start from `tt group export <key> > <key>.json`, which carries the UI edits into the file, then edit the file. `tt sync --file <key>.json --dry-run` prints the plan (created, updated with the changed fields, moved, archived, restored, unchanged) and writes nothing; run it without `--dry-run` once the plan is right.

The format is described by [`schema/sync.schema.json`](schema/sync.schema.json), generated from the code with `npm run schema:generate`, and shown in [`examples/sync.example.json`](examples/sync.example.json).

### Agent skill

The agent skill in [`.claude/skills/test-cases/SKILL.md`](.claude/skills/test-cases/SKILL.md) describes the workflow for an agent: it gathers the sources (tickets and wiki pages over whatever MCP tools are connected, the codebase under test, and what the user gives), writes the cases, and syncs them after a dry run the user approves. To use it from another project, point `TEST_TRACKER_DIR` at this checkout and link the skill where your agent finds skills, for example:

```bash
export TEST_TRACKER_DIR=~/dev/test-tracker
ln -s "$TEST_TRACKER_DIR/.claude/skills/test-cases" ~/.claude/skills/test-cases   # Claude Code, Cursor
ln -s "$TEST_TRACKER_DIR/.claude/skills/test-cases" ~/.agents/skills/test-cases   # Codex and other agents reading .agents/skills
```

Without `TEST_TRACKER_DIR` the skill asks for the path. The codebase under test is the current directory, or a path you give.

## Development

```bash
cp .env.example .env.local   # then set BETTER_AUTH_SECRET, and ADMIN_USERNAME=admin, ADMIN_PASSWORD=admin-dev-1234
npm install
npm run dev                  # http://localhost:4100, sign in as admin / admin-dev-1234
npm run cli -- sync --file examples/sync.example.json   # optional: an example group of test cases
npm test                     # unit and database tests
npm run test:e2e             # Playwright, one suite, on SQLite, against a fake S3 (scripts/fake-s3.ts); test cases are seeded from e2e/fixtures/cases/*.json
```

The admin is created on the first boot only; `admin-dev-1234` is the local development default, never a password for a deployment. The e2e app listens on port 4101 and the fake S3 on 4103. Without `ATTACHMENTS_BUCKET_URL`, `npm run dev` runs with attachments disabled; see [Attachments](#attachments). Migrations run automatically at boot, on either backend.

**Schema changes** go into **both** `src/lib/db/schemas/sqlite.ts` and `src/lib/db/schemas/pg.ts`, then `npm run db:generate` writes a migration for each (`drizzle/sqlite/`, `drizzle/pg/`). `npm test` fails if the two schemas drift apart or a migration is missing. The Better Auth tables are generated: `npm run auth:generate:sqlite` and `npm run auth:generate:pg`.

**Test projects:** `unit` runs once; the database tests in `tests/db/` run once per backend, as `db:sqlite`, `db:pglite` (in-memory Postgres) and, when `TEST_POSTGRES_URL` is set, `db:postgres` against a real server. Without it that project is skipped with a notice. PGlite has a single connection, so only `db:postgres` really races concurrent transactions.

**Before a release, and whenever database or concurrency code changes,** run the tests and the e2e suite against real PostgreSQL too:

```bash
docker run -d --rm --name tt-pg-test -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=tracker_test -p 55432:5432 postgres:17
TEST_POSTGRES_URL=postgres://postgres:pg@localhost:55432/tracker_test npm test
docker stop tt-pg-test

docker run -d --rm --name tt-pg-e2e -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=tracker_e2e -p 55433:5432 postgres:17
E2E_DATABASE_URL=postgres://postgres:pg@localhost:55433/tracker_e2e npm run test:e2e
docker stop tt-pg-e2e
```

Both wipe their database: `npm test` refuses a database whose name does not contain `test`, the e2e run one whose name does not contain `e2e`.

### Repository layout

The code still calls a test case a _story_ and a group an _epic_ in places (`src/lib/stories/`, `src/components/story/`, `src/components/tree/epic-row.tsx`).

| Path                                    | Contents                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/(app)/`                        | The signed-in app: the tree and test case sheet for testers, Admin → Test cases (`admin/cases/`) and Admin → Users (`admin/users/`). |
| `src/app/login/`, `src/app/api/`        | The login page; the health check, attachment download and Better Auth routes.                                                        |
| `src/lib/cases/`                        | Groups and test cases: validation, reads, writes, sync and change flagging, shared by the admin UI and the CLI.                      |
| `src/lib/stories/`                      | Test statuses, timeline events and progress.                                                                                         |
| `src/lib/db/`                           | Backend selection, connections, migrations at boot, and the SQLite and PostgreSQL schemas.                                           |
| `src/lib/attachments/`, `src/lib/auth/` | Attachment storage (Azure Blob, S3) and file type checks; Better Auth and users.                                                     |
| `src/cli/`                              | The `tt` CLI.                                                                                                                        |
| `src/components/`                       | UI components; `src/components/ui/` is the design system.                                                                            |
| `src/i18n/`                             | UI messages (`messages/en.json`).                                                                                                    |
| `drizzle/sqlite/`, `drizzle/pg/`        | Generated migrations, one set per backend.                                                                                           |
| `schema/`, `examples/`                  | The sync file's JSON Schema and an example file.                                                                                     |
| `scripts/`                              | Backup, admin promotion, the CLI bundle, schema generation, and the e2e database setup and fake S3.                                  |
| `tests/`, `e2e/`                        | Vitest unit and database tests; the Playwright suite and its fixtures.                                                               |
| `.claude/skills/test-cases/`            | The agent skill.                                                                                                                     |

## Configuration

| Variable                            | Required | Description                                                                                                                                                             |
| ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                | yes      | Session signing secret, 32+ characters (`openssl rand -base64 32`).                                                                                                     |
| `BETTER_AUTH_URL`                   | yes      | Public base URL of the app. Must be the public **https** origin in production (see below).                                                                              |
| `DATABASE_URL`                      | no       | `postgres://…` or `postgresql://…` selects PostgreSQL; unset or empty selects SQLite. See [Database](#database).                                                        |
| `DATABASE_PATH`                     | no       | SQLite file, used when `DATABASE_URL` is empty. Default `./data/app.db`; `/data/app.db` in the image. Must not contain `%`, `?` or `#` (it is opened as a `file:` URI). |
| `ATTACHMENTS_BUCKET_URL`            | no       | Bucket for attachments; unset disables them. See [Attachments](#attachments).                                                                                           |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | no       | Bootstrap admin, set both or neither. Username 3-32 chars, password 10+ chars.                                                                                          |

### Secrets from a secret store

`DATABASE_URL`, `BETTER_AUTH_SECRET` and `ADMIN_PASSWORD` can each be read from a file instead: set `<NAME>_FILE` to its path, for example `BETTER_AUTH_SECRET_FILE=/run/secrets/BETTER_AUTH_SECRET`. One trailing newline is dropped. Setting both `<NAME>` and `<NAME>_FILE` is an error. This keeps the app independent of the secret store: anything that mounts secrets as files works (the Kubernetes Secrets Store CSI driver with Azure Key Vault, Vault Agent, Docker secrets), and the values stay out of the container's environment. `scripts/promote-admin.mjs`, `scripts/backup.mjs` and the `tt` CLI read `DATABASE_URL_FILE` too.

On Kubernetes with Azure Key Vault (the Secrets Store CSI driver with its Azure provider, and workload identity):

```yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: test-tracker
spec:
  provider: azure
  parameters:
    clientID: <workload identity client id>
    keyvaultName: <key vault name>
    tenantId: <tenant id>
    objects: |
      array:
        - |
          objectName: better-auth-secret
          objectType: secret
          objectAlias: BETTER_AUTH_SECRET
---
# In the Deployment's pod spec (the service account carries the workload identity):
containers:
  - name: app
    env:
      - { name: BETTER_AUTH_SECRET_FILE, value: /run/secrets/BETTER_AUTH_SECRET }
    volumeMounts:
      - { name: secrets, mountPath: /run/secrets, readOnly: true }
volumes:
  - name: secrets
    csi:
      driver: secrets-store.csi.k8s.io
      readOnly: true
      volumeAttributes:
        secretProviderClass: test-tracker
```

The app reads the files once at boot, so restart the pods after rotating a secret.

## Attachments

Comments can carry attachments (images, PDFs, text files) only when `ATTACHMENTS_BUCKET_URL` is set. Without it the comment form has no file picker, paste and drop add nothing, the server rejects files, and the timeline and `/api/attachments/<id>` show no attachments, also ones stored earlier. The URL picks the store:

- **Azure Blob Storage:** `https://<account>.blob.core.windows.net/<container>[/<prefix>]`. Credentials come from `DefaultAzureCredential`: workload identity on AKS, a managed identity, or `az login` locally. The identity needs the _Storage Blob Data Contributor_ role on the container. SAS tokens in the URL are rejected.
- **S3 or S3-compatible:** `s3://<bucket>[/<prefix>][?endpoint=<url>&region=<region>]`. Credentials come from the AWS SDK's default chain (`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, web identity, `AWS_SHARED_CREDENTIALS_FILE`, an instance role). Without `region` the SDK's `AWS_REGION` applies. For MinIO, Cloudflare R2 and others set `endpoint`; requests then use path-style URLs.

Objects are named `<prefix><uuid>.<ext>` and keep the verified content type. The app only puts, gets and deletes single objects, so a policy limited to those actions on the prefix is enough. A malformed URL makes the app exit at boot.

## Database

- `DATABASE_URL` starting with `postgres://` or `postgresql://` selects PostgreSQL, and `DATABASE_PATH` is ignored.
- `DATABASE_URL` unset or empty selects SQLite at `DATABASE_PATH`. Any other value, or a malformed URL, makes the app exit with status 1 at boot.
- The boot log names the choice without credentials, for example `[boot] database: postgres db:5432/tracker`.
- If PostgreSQL is not reachable yet (connection refused, host not found, timeout, server still starting), the app logs `[boot] database not reachable yet (<code>), retrying…` and retries for about 60 seconds, then exits with status 1. Any other database error at boot (wrong password, missing database, …) exits at once with `[boot] database error (<code>): <database>`, so a restart policy can take over.
- Boot and idle-connection logs show only the error code. Database errors logged while serving a request can include PostgreSQL's message, which may name the role.

PostgreSQL needs a **dedicated database owned by the app's role**: the app creates its tables and Drizzle's migration table in schema `public` at boot. Sharing a database with other apps or using another schema (`search_path`) is not supported. Percent-encode special characters in the password (`/` as `%2F`, `@` as `%40`, …). TLS is configured only through URL parameters, for example `?sslmode=verify-full` (add `&sslrootcert=/path/ca.pem` for a private CA). With the bundled `pg` driver, `sslmode=require` (like `prefer` and `verify-ca`) also verifies the certificate and host name, as `verify-full` does. For a private or self-signed CA pass `sslrootcert=…`; for libpq's meaning of `require` (encrypted, not verified) use `?uselibpqcompat=true&sslmode=require`.

**PostgreSQL quick start** with the bundled compose file (app and `postgres:17`, with a `pgdata` volume for the database):

```bash
cp .env.example .env
# edit .env: BETTER_AUTH_SECRET, BETTER_AUTH_URL, ADMIN_USERNAME, ADMIN_PASSWORD, and add POSTGRES_PASSWORD (URL-safe characters)
docker compose -f docker-compose.postgres.yml up -d --build
curl -fsS localhost:4100/api/health   # {"ok":true}
```

## Running with Docker

```bash
cp .env.example .env
# edit .env: BETTER_AUTH_SECRET, BETTER_AUTH_URL, ADMIN_USERNAME, ADMIN_PASSWORD
docker compose up -d --build
curl -fsS localhost:4100/api/health   # {"ok":true}
```

`.env` is gitignored; never commit real secrets. The compose file refuses to start if `BETTER_AUTH_SECRET` or `BETTER_AUTH_URL` is missing. It publishes on host port 4100 (container port 3000); set `APP_PORT` to change that.

These commands use the default compose file (SQLite). For PostgreSQL, add `-f docker-compose.postgres.yml`, which also refuses to start without `POSTGRES_PASSWORD`.

### First admin

On boot, if `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set **and the user table is empty**, that user is created as an admin. Once any user exists the variables are ignored, so they cannot add or reset an admin later. Sign in, create other users under Admin, and remove the two variables afterwards if you like (the account stays).

If no admin can sign in any more, promote an existing user (here `alice`) from inside the container, then sign in as them and reset passwords under Admin. The script uses the app's database on either backend:

```bash
docker compose exec app node scripts/promote-admin.mjs alice   # Promoted.
```

### Behind a reverse proxy

The container is expected to sit behind a TLS-terminating proxy (possibly with Basic Auth), but the app is hardened as if it were public.

- **`BETTER_AUTH_URL` must be the public https origin** (for example `https://tracker.example.com`). Secure cookies are derived from it; with an `http://` URL the `Secure` flag is dropped.
- **Overwrite `X-Forwarded-For` with the single client IP.** The login rate limit (5 attempts / 60 s) is per IP and Better Auth only trusts a single-valued header. Do not append to an incoming value, otherwise all users share one bucket (one attacker can lock everybody out) or a client-supplied header bypasses the limit. nginx:
  ```nginx
  proxy_set_header X-Forwarded-For $remote_addr;   # not $proxy_add_x_forwarded_for
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Host $host;
  ```
- **Allow request bodies of at least 55 MB.** A comment can carry 5 attachments of 10 MB each via Server Actions (nginx: `client_max_body_size 60m;`).

### Backups

Back up the database and the attachment bucket together (with the bucket's own tools, for example versioning or replication). Backups made as described here (`scripts/backup.mjs` for SQLite, `pg_dump` for PostgreSQL) hold everything the tracker stores: groups, test cases, test statuses, comments and the attachment records.

**SQLite:**

```bash
# Consistent online snapshot of the database (VACUUM INTO; refuses to overwrite an existing file)
docker compose exec app node scripts/backup.mjs /data/backups/app-$(date +%F).db
docker compose cp app:/data/backups ./backup-db
```

Snapshots in `/data/backups` live on the same volume, so copy them off the host too.

**Restore:** stop the app (`docker compose down`), put the snapshot at `/data/app.db` (for example with a throwaway container: `docker run --rm -v <project>_data:/data -v "$PWD":/b node:24-bookworm-slim sh -c 'rm -f /data/app.db-wal /data/app.db-shm; cp /b/app-2026-11-17.db /data/app.db; chown -R node:node /data'`), then `docker compose up -d`. If you bind-mount a host directory on `/data` instead of the named volume, make it writable for uid 1000 (`node`).

**PostgreSQL:** `scripts/backup.mjs` refuses and points here. Use `pg_dump` in custom format and `pg_restore`. The app image has no Postgres tools, so with the compose file run them in the `db` service; against another server use `pg_dump -Fc -f tracker.dump "$DATABASE_URL"` and `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" tracker.dump`.

```bash
docker compose -f docker-compose.postgres.yml exec -T db pg_dump -U tracker -Fc tracker > tracker-$(date +%F).dump
```

**Restore:** stop the app, restore the dump over the existing tables, start the app:

```bash
docker compose -f docker-compose.postgres.yml stop app
docker compose -f docker-compose.postgres.yml exec -T db pg_restore -U tracker -d tracker --clean --if-exists --no-owner < tracker-2026-11-17.dump
docker compose -f docker-compose.postgres.yml start app
```
