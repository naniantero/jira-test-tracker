<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Design system

Build UI from the existing design tokens (the CSS variables and Tailwind theme in `src/app/globals.css`, used through classes such as `bg-muted` and `text-muted-foreground`) and the existing components in `src/components/ui/`. No hard-coded colours, ad hoc font sizes or one-off copies of an existing component. Set text styles through the variants of `Heading` and `Text` rather than combining `text-*` and `font-*` classes by hand. Changing the design system itself (adding, removing or changing a token, or adding or changing a component in `src/components/ui/`) needs the user's confirmation first: ask before making the change.

## Verifying

Verify changes with `npm test` and `npm run test:e2e`, which use their own test values and a fake S3. `npm run dev` reads `.env.local`.

## Commits

The repository is public. Commit messages contain only the change: no `Co-authored-by`, `Generated-by`, `Made-with` or similar trailers naming an AI tool or agent (Cursor, Claude or any other), and no agent session links. If a tool adds them automatically, remove them before pushing.
