import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { computeNextReminderAt } from '../src/utils';

// Initialize Firebase Admin
const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!saJson) {
  console.error('❌ Error: FIREBASE_SERVICE_ACCOUNT_JSON is not defined.');
  console.log('Ensure you are running with: npx tsx --env-file=.env scripts/backfillNextReminder.ts');
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(saJson);
  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }
} catch (e) {
  console.error('❌ Error parsing FIREBASE_SERVICE_ACCOUNT_JSON. Make sure it is a valid JSON string.');
  process.exit(1);
}

const db = getFirestore();

async function run() {
  console.log('--- Starting nextReminderAt backfill ---');

  const batchSize = 400;
  let totalScanned = 0;
  let totalUpdated = 0;
  let usersProcessed = 0;

  const usersSnap = await db.collection('users').get();

  let batch = db.batch();
  let batchUpdates = 0;

  const flushBatch = async () => {
    if (batchUpdates === 0) return;
    await batch.commit();
    totalUpdated += batchUpdates;
    batch = db.batch();
    batchUpdates = 0;
  };

  for (const userDoc of usersSnap.docs) {
    usersProcessed += 1;
    const nodesSnap = await userDoc.ref.collection('nodes').get();

    for (const doc of nodesSnap.docs) {
      totalScanned += 1;
      const data = doc.data();
      const current = data.nextReminderAt;
      const needsBackfill = current === undefined || current === null;
      if (!needsBackfill) continue;

      const nextReminderAt = computeNextReminderAt({
        deadline: data.deadline ?? null,
        reminders: data.reminders,
        sentReminders: data.sentReminders,
        completed: data.completed,
      });

      const normalizedNextReminderAt = nextReminderAt ?? 0;
      batch.update(doc.ref, { nextReminderAt: normalizedNextReminderAt });
      batchUpdates += 1;

      if (batchUpdates >= batchSize) {
        await flushBatch();
        console.log(`Scanned ${totalScanned}, updated ${totalUpdated}, users ${usersProcessed}`);
      }
    }
  }

  await flushBatch();
  console.log(`Scanned ${totalScanned}, updated ${totalUpdated}, users ${usersProcessed}`);

  console.log('--- Backfill finished ---');
}

run().catch(console.error);
