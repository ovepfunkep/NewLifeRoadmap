# AGENTS Guide

This file is the shared context for AI coding agents and contributors.

## Mission

Keep LifeRoadmap stable as an offline-first, encrypted task system while shipping focused improvements.

## Mandatory Pre-Read for Data/Sync Changes

Before touching persistence, sync, encryption, or task model:

1. `src/types.ts`
2. `src/db.ts`
3. `src/firebase/sync.ts`
4. `src/utils/syncCompare.ts`
5. `docs/ARCHITECTURE.md`

## Core Invariants

- Tasks are stored in flat form with `parentId`; tree is reconstructed in memory.
- IndexedDB (`src/db.ts`) is the local source of truth.
- Cloud sync must preserve compatibility with older payloads.
- Sync conflict logic is centralized in `src/utils/syncCompare.ts`.
- Encryption/security flows in `src/firebase/security.ts` and `src/utils/securityManager.ts` must not be weakened.
- New model fields must be propagated through:
  - `src/types.ts`
  - local DB serialization paths
  - Firebase normalization/sync
  - conflict comparison utilities

## Safety Rules

- Never commit secrets (`.env`, keys, tokens, service credentials).
- Do not log plaintext sensitive data from encrypted fields.
- Avoid destructive git operations unless explicitly requested by the user.
- Keep changes minimal and reversible; prefer small targeted edits.

## File Ownership Map

- UI behavior and modals: `src/components/**`
- Screen-level orchestration: `src/pages/**`
- Domain model: `src/types.ts`
- Local persistence: `src/db.ts`
- Cloud sync/auth/security: `src/firebase/**`
- Cross-cutting utilities: `src/utils.ts`, `src/utils/**`
- Localization: `src/i18n.ts`
- Automation and deployment: `.github/workflows/**`

## Verification (`npm run verify`)

**Run before you consider the task done** when the change is **non-trivial**: logic, state, hooks, data flow, types, sync/DB/security, routing, or anything that can break TypeScript or tests.

**Always run `npm run verify` before a commit or PR** you intend to merge (or ensure CI is green). That is the safety net for integrators.

**You may skip a local `verify` run** when the diff is **purely presentational** and obviously type-safe—for example only Tailwind classes, static layout/copy in `i18n.ts` with no new keys wired into logic, or asset swaps. In those cases, say in the PR/description that checks were skipped as cosmetic-only; still run verify once before merge if CI is not trusted for the branch.

**Docs/rules-only tasks:** document that runtime checks were skipped (same as before).

Command:

```bash
npm run verify
```

## Documentation Update Policy

When behavior or workflow changes, update related docs in the same task:

- `README.md` for onboarding-level changes
- `docs/DEVELOPMENT.md` for setup/scripts/process
- `docs/ARCHITECTURE.md` for structural/data-flow changes

