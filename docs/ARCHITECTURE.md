# Architecture Overview

## High-Level Design

LifeRoadmap is an offline-first task system:

- local data lives in IndexedDB (`src/db.ts`)
- cloud sync uses Firebase (`src/firebase/**`)
- UI reconstructs task tree from flat nodes (`parentId`)
- conflict handling is done by sync comparison utilities

## Data Model

Primary entity: `Node` (`src/types.ts`).

Key points:

- persisted in flat form (`id`, `parentId`)
- tree is rebuilt in memory for rendering/navigation
- optional scheduling fields are carried through local + cloud + compare paths
- recurring tasks: `Node.recurrence` may use flat `weekdays` / `monthDays` plus one `timeStart` / `timeEnd` pair, or for weekly/monthly multi-interval rules a non-empty `scheduleVariants` array (each entry: days + time range); the same weekday or month-day may appear in several variants if the time ranges do not overlap; `normalizeRecurrenceVariants` in `src/utils/recurrence.ts` resolves legacy vs new shape when expanding to schedule slots

## Main Modules

- `src/pages/NodePage.tsx` - top-level orchestration
- `src/components/**` - UI widgets, lists, modals
- `src/db.ts` - IndexedDB read/write and tree reconstruction
- `src/firebase/sync.ts` - Firestore sync and normalization
- `src/utils/syncCompare.ts` - conflict significance checks
- `src/utils/recurrence.ts` - schedule slot expansion for week view
- `src/i18n.ts` - UI localization strings

## Runtime Flow

```mermaid
flowchart TD
  userAction[UserAction] --> uiState[ReactUI]
  uiState --> dbWrite[IndexedDBWrite]
  dbWrite --> syncQueue[SyncQueue]
  syncQueue --> firebaseSync[FirebaseSync]
  firebaseSync --> cloudState[CloudState]
  cloudState --> syncCompare[SyncCompare]
  syncCompare --> uiRefresh[UIRefresh]
```

## Sync and Safety Invariants

- Backward compatibility matters when extending `Node`.
- Any model field change must be propagated through:
  - `src/types.ts`
  - `src/db.ts`
  - `src/firebase/sync.ts`
  - `src/utils/syncCompare.ts`
- Do not weaken encryption/key-management behavior in security modules.

## Cloud sync and Firestore reads

- **Nodes** live in `users/{uid}/nodes` (one document per flat node). A full `getDocs` on that collection costs **one read per document** (including soft-deleted tombstones still present in the cloud).
- **Change log** documents under `users/{uid}/security` carry incremental hints; the client drains them in **pages** (`fetchChangeLogSincePage`) before attaching a live listener, and avoids **re-subscribing** the listener on every window focus (visibility uses `getSyncMeta` + `loadChangedNodesFromFirestore` instead).
- **Incremental pull into IndexedDB** (`loadCloudDataSilently` and change-log row application) compares **`updatedAt` per node** with [`pickNewerNodeByUpdatedAt`](../src/utils/syncCompare.ts): an incoming cloud payload must be **strictly newer** than the local row to overwrite it. Otherwise a local edit made after an older cloud revision was written (e.g. offline rename after a partial sync) would be lost when the change log cursor advanced.
- **Bulk push** (`syncAllNodesToFirestore`) should receive an in-memory **cloud snapshot** when you already loaded it, so the function does not run a second full `getDocs` for diff-only writes.
- **Operational verification**: use Firebase Console Firestore **Usage** (see `docs/DEVELOPMENT.md`).
- **Maintenance rules**: see [`firestore.rules`](../firestore.rules) (commented deny-all block). Publishing those rules triggers `permission-denied`; the app shows a **one-time** availability modal, then a **one-time** “restored” modal after the next successful Firestore operation (`CloudFirestoreHealthModals` + [`src/utils/cloudFirestoreHealth.ts`](../src/utils/cloudFirestoreHealth.ts)).

## Where to Start for Sensitive Changes

1. `AGENTS.md`
2. `src/types.ts`
3. `src/db.ts`
4. `src/firebase/sync.ts`
5. `src/utils/syncCompare.ts`
