---
name: test-cases
description: Writes manual test scenarios into the local test tracker from tickets, specs and code, and creates, updates, reorders or archives test cases and groups with the tracker's `tt` CLI. Use when the user asks for test cases, test scenarios or a test plan for a feature, ticket, branch or pull request, or wants to change test cases already in the tracker.
---

# Test cases in the tracker

Test cases live in groups, one group per feature. They are written with the `tt` CLI, which writes straight to the
tracker's database. A sync file is the source of truth for its group: syncing it overwrites edits made in the UI and
archives the group's cases missing from the file.

## 1. Locate the tracker and the codebase

**Tracker** (`$TT` below): the first that applies.

1. The current directory, if it is the tracker repository (`package.json` with `"name": "test-tracker"` and
   `src/cli/main.ts`).
2. The directory in `TEST_TRACKER_DIR`.
3. Ask the user for the path, or whether the tracker runs in a container.

Run the CLI as `npm --prefix "$TT" run -s cli -- <command>`; `tt <command>` below means this. npm runs it inside `$TT`, so it uses that checkout's
database (`DATABASE_URL`, `DATABASE_URL_FILE` or `DATABASE_PATH`, default `$TT/data/app.db`), and relative file paths
resolve against `$TT`: pass sync files on standard input (`--file -`) or as absolute paths. In a container:
`docker compose exec -T app node cli.mjs <command>`, files on standard input.

Check the connection first with `group list`. If the CLI says the database is not migrated, the app has to be started
once (`npm run dev` in `$TT`); ask the user to do it rather than starting it yourself.

**Codebase under test**: a path the user gave, otherwise the current directory unless it is the tracker itself. When
the current directory is the tracker and no path was given, ask which codebase the tests are for, or work from the
tickets alone.

## 2. Gather the sources

Work from what exists; never invent behaviour. Use every source that is available and skip the ones that are not.

- **Issue tracker and wiki over MCP**, if any such tools are connected (for example Atlassian Jira and Confluence,
  Linear, GitHub or GitLab issues). Look at the tools you have; if none fit, skip this source and do not ask the user
  to install one. Read the ticket, its acceptance criteria, description, comments, subtasks, linked issues and linked
  wiki pages. Note the ticket key or URL for `reference`.
- **The codebase**: the code paths the feature touches (routes, UI, forms and their validation, error messages,
  permission checks, feature flags, configuration) and the existing automated tests, which show intended behaviour
  and edge cases. For a branch or pull request, start from its diff against the main branch (`git -C <path> diff`,
  `git -C <path> log`). Don't read `.env` files or other secrets.
- **What the user gave**: a spec, notes, screenshots, a pasted ticket.

When sources conflict (the ticket says one thing, the code does another), don't pick a side: write the case from the
ticket and list the conflict for the user.

## 3. Plan the group

1. `tt group list`. If a group for the feature exists, start from its current content, so edits made in the UI are
   kept: `tt group export <key> > /tmp/<key>.json` (path outside `$TT`, absolute). Add, change and remove cases
   in that file.
2. Otherwise pick a new group key (short, lowercase, e.g. `checkout`), a title and a one-line description.

Keys match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` and are unique across all groups; a case key from another group moves
that case here. Case keys are their identity: use a prefix and a number (`CHECKOUT-01`), never reuse or renumber
an existing key, and give new cases the next free numbers. File order is the display order.

## 4. Write the cases

Write in the language of the sources (or the language the user writes in), consistently within a group.

- **One behaviour per case**, testable by a person in the running app in a few minutes.
- **Title**: the expected outcome as a statement ("Wrong password five times locks the account").
- **Description** (Markdown): `**Precondition:**` when there is one, numbered steps a tester can follow without
  reading code, and `**Expected result:**`. Use the names the UI shows, not code identifiers.
- **Acceptance criteria**: short checkable statements; each one passes or fails on its own.
- **Reference**: the ticket key or URL the case comes from, when there is one.
- **Coverage**: the main flow, then validation and error messages, permissions and roles, boundaries and empty
  states, and what the change could break nearby. Skip what a tester cannot observe.

Mark assumptions in the plan you show the user, not in the cases.

Sync file format: `$TT/schema/sync.schema.json` (JSON Schema), example `$TT/examples/sync.example.json`:

```json
{
  "schemaVersion": 1,
  "group": { "key": "login", "title": "Login", "description": "Signing in and account lockout." },
  "cases": [
    {
      "key": "LOGIN-01",
      "title": "Wrong password five times locks the account",
      "description": "**Precondition:** the user has an active account.\n\n1. Open the login page.\n2. Enter the right username and a wrong password five times.\n\n**Expected result:** the account is locked and an error is shown.",
      "acceptanceCriteria": ["The fifth wrong attempt locks the account", "The lock is shown as an error"],
      "reference": "PROJ-123"
    }
  ]
}
```

## 5. Dry run, approval, sync

1. Dry run, which validates the file and writes nothing:
   `npm --prefix "$TT" run -s cli -- sync --file - --dry-run --actor "<your name>" < /tmp/<key>.json`
2. Show the user the plan (created, updated with changed fields, moved, restored, archived), the sources used, the
   assumptions and open questions. Point out archived cases and changes to cases already tested: those are flagged
   "Changed since tested" for the testers. The plan carries no status: check it with
   `tt case list --group <key> --json`, and the source group of a moved case (any status other than `untested` means
   tested).
3. Only after the user approves: the same command without `--dry-run`.

For a single change, `tt case create`, `tt case update <key>` and `tt case archive|restore <key>` also exist.
Add `--json` to any command for machine-readable output; `tt --help` lists everything.
