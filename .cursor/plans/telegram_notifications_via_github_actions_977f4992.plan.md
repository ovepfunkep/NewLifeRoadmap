---
name: Telegram Notifications via GitHub Actions
overview: Implementation of a free notification system using GitHub Actions as a scheduler to process Telegram linking and send deadline reminders with title decryption for Standard protection mode.
todos:
  - id: update-types-and-modal
    content: Update Node interface and SecurityChoiceModal text
    status: completed
  - id: implement-reminder-ui
    content: Implement reminder selection UI in NodePage
    status: cancelled
  - id: add-tg-linking-ui
    content: Add Link Telegram button with deep link logic
    status: completed
  - id: create-notification-script
    content: Create the GitHub Action notification script (scripts/notify.ts)
    status: completed
  - id: setup-github-workflow
    content: Setup GitHub Workflow YAML file
    status: completed
---

# Plan: Telegram Notifications via GitHub Actions

Implement a cost-free notification system by leveraging GitHub Actions to poll for Telegram bot updates and send deadline reminders.

## User Interface & Data Changes

- Add `reminders` and `sentReminders` fields to the `Node` interface in [`src/types.ts`](src/types.ts).
- Update [`src/components/SecurityChoiceModal.tsx`](src/components/SecurityChoiceModal.tsx) with revised protection level descriptions.
- Add a "Telegram Notifications" section in [`src/pages/NodePage.tsx`](src/pages/NodePage.tsx) that appears when a deadline is set, allowing users to choose reminder intervals.
- Add a "Link Telegram" button in the user profile/settings that generates a deep link to the bot with the user UID.

## GitHub Action Logic

- Create a Node.js script in `scripts/notify.ts` that:
- Connects to Firestore using `firebase-admin`.
- Checks Telegram `getUpdates` for `/start [UID]` commands to link chat IDs.
- Queries Firestore for incomplete nodes with upcoming deadlines.
- Decrypts titles using the user's stored `syncKey` (only for Firestore mode).
- Sends reminders and updates `sentReminders` to prevent duplicate messages.
- Configure `.github/workflows/notify.yml` to run the script every 15 minutes.

## Security & Secrets

- Use GitHub Secrets to store:
- `TELEGRAM_BOT_TOKEN`