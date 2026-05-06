# Development Guide

## Prerequisites

- Node.js 20+
- npm 10+

## Local Setup

```bash
npm ci
cp .env.example .env
npm run dev
```

App runs on `http://localhost:5173`.

## Environment

Required Firebase variables are listed in `.env.example`.

For full Firebase configuration, see [FIREBASE_SETUP.md](../FIREBASE_SETUP.md).

## Scripts

- `npm run dev` - run Vite dev server
- `npm run test` - run Vitest in watch mode
- `npm run test:ci` - run Vitest once (CI mode)
- `npm run build` - run `tsc` and Vite production build
- `npm run verify` - run tests + production build
- `npm run preview` - preview production build locally

## Recommended Flow

1. Create a focused branch.
2. Implement minimal change set.
3. Run:

```bash
npm run verify
```

4. Update docs (`README`, `docs/*`, `AGENTS.md`) if behavior or workflow changed.

## Common Troubleshooting

### Firebase config missing

- Ensure `.env` exists.
- Ensure all Firebase vars start with `VITE_`.
- Restart `npm run dev` after `.env` changes.

### CI build mismatch

- Install with `npm ci` (not `npm install`) to use lockfile versions.
- Re-run `npm run verify` locally before pushing.
