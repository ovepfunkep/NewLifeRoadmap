import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { webcrypto } from 'node:crypto';
import { computeNextReminderAt } from '../src/utils';
import { listOccurrenceAnchorsInRange } from '../src/utils/recurrence';
import type { NodeRecurrence } from '../src/types';

const crypto = webcrypto as unknown as Crypto;

// --- Crypto Utils (Copy from src/utils/crypto.ts for Node compatibility) ---

async function importKey(keyStr: string): Promise<any> {
  const keyBuffer = Buffer.from(keyStr, 'base64');
  return await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
}

async function decryptData(encryptedStr: string, keyStr: string): Promise<any> {
  try {
    const key = await importKey(keyStr);
    const combined = Buffer.from(encryptedStr, 'base64');
    
    if (combined.length < 13) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = combined.subarray(0, 12);
    const data = combined.subarray(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    return null;
  }
}

// --- Telegram Utils ---

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramMessage(chatId: string, text: string) {
  if (!BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
    if (!response.ok) {
      console.error(`Failed to send message to ${chatId}:`, await response.text());
    }
  } catch (e) {
    console.error('Error sending telegram message:', e);
  }
}

async function getTelegramUpdates(offset?: number) {
  if (!BOT_TOKEN) return [];
  let url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`;
  if (offset) url += `?offset=${offset}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return data.result || [];
  } catch (e) {
    return [];
  }
}

async function resolveNodeTitle(
  node: Record<string, unknown>,
  canDecrypt: boolean,
  syncKey: string | null | undefined
): Promise<string> {
  let title = 'Задача без названия';

  if (node.isEncrypted && node.encryptedData) {
    if (canDecrypt && syncKey) {
      const decrypted = await decryptData(node.encryptedData as string, syncKey);
      if (decrypted && decrypted.title) title = decrypted.title;
    } else {
      title = '🔒 Зашифрованная задача (название недоступно)';
    }
  } else if (node.isTitleEncrypted || node.isFieldsEncrypted) {
    if (canDecrypt && syncKey && typeof node.title === 'string') {
      const decrypted = await decryptData(node.title, syncKey);
      if (decrypted) title = decrypted;
    } else {
      title = '🔒 Зашифрованная задача (название недоступно)';
    }
  } else if (typeof node.title === 'string') {
    title = node.title;
  }

  return title;
}

// --- Main Logic ---

// Initialize Firebase Admin
const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!saJson) {
  console.error('❌ Error: FIREBASE_SERVICE_ACCOUNT_JSON is not defined.');
  console.log('Ensure you are running with: npx tsx --env-file=.env scripts/notify.ts');
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
  console.log('--- Starting Notification Job ---');

  // 1. Process /start commands from Telegram to link Chat IDs
  // We store last processed update_id in a special document to avoid duplicates
  const botStateRef = db.doc('system/bot_state');
  const botStateSnap = await botStateRef.get();
  const lastUpdateId = botStateSnap.exists ? botStateSnap.data()?.lastUpdateId : 0;

  const updates = await getTelegramUpdates(lastUpdateId ? lastUpdateId + 1 : undefined);
  let maxUpdateId = lastUpdateId;

  for (const update of updates) {
    if (update.update_id > maxUpdateId) maxUpdateId = update.update_id;

    const message = update.message;
    if (message?.text?.startsWith('/start ')) {
      const uid = message.text.split(' ')[1];
      const chatId = message.chat.id.toString();
      
      if (uid) {
        console.log(`Linking UID ${uid} to Chat ID ${chatId}`);
        await db.doc(`users/${uid}/security/config`).set({
          telegramChatId: chatId,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        
        await sendTelegramMessage(chatId, '✅ <b>Telegram успешно привязан!</b>\nТеперь вы будете получать уведомления о дедлайнах.');
      }
    }
  }

  if (maxUpdateId > lastUpdateId) {
    await botStateRef.set({ lastUpdateId: maxUpdateId }, { merge: true });
  }

  // 2. Scan for upcoming deadlines
  const now = new Date();
  const sendWindowMs = 10 * 60 * 1000; // 10 minutes
  const scanUntilMs = now.getTime() + sendWindowMs;

  const nodesSnapshot = await db.collectionGroup('nodes')
    .where('completed', '==', false)
    .where('nextReminderAt', '>', 0)
    .where('nextReminderAt', '<=', scanUntilMs)
    .get();

  console.log(`Found ${nodesSnapshot.docs.length} incomplete tasks with scheduled reminders.`);

  for (const doc of nodesSnapshot.docs) {
    const node = doc.data() as Record<string, unknown>;
    if (!node.reminders || !Array.isArray(node.reminders) || node.reminders.length === 0) continue;

    const userId = doc.ref.parent.parent?.id;
    if (!userId) continue;

    // Get user config for Chat ID and syncKey
    const userConfigSnap = await db.doc(`users/${userId}/security/config`).get();
    const userConfig = userConfigSnap.data();
    if (!userConfig?.telegramChatId) continue;

    const chatId = userConfig.telegramChatId;
    const mode = userConfig.mode; // 'gdrive' or 'firestore'
    const syncKey = userConfig.syncKey; // May be null if using GDrive mode
    const userTimezone = userConfig.timezone || 'UTC'; // NEW: Get user timezone
    const canDecrypt = mode === 'firestore' && !!syncKey;

    const sentReminders = Array.isArray(node.sentReminders)
      ? node.sentReminders.filter((item: unknown): item is string => typeof item === 'string')
      : [];
    const sentSet = new Set(sentReminders);
    const newlySent: string[] = [];

    const rawIntervals = (node.reminders as unknown[]).filter(
      (s): s is number => typeof s === 'number' && Number.isFinite(s) && s > 0
    );

    const isRecurringNoDeadline = Boolean(node.isRecurring && node.recurrence && !node.deadline);

    if (isRecurringNoDeadline) {
      const rule = node.recurrence as NodeRecurrence;
      const createdAtIso =
        typeof node.createdAt === 'string' ? node.createdAt : '1970-01-01T00:00:00.000Z';
      const recurringIntervals = rawIntervals.filter((s) => s >= 3600);
      const maxSec = recurringIntervals.length ? Math.max(...recurringIntervals) : 0;
      const padMs = maxSec * 1000 + sendWindowMs + 800 * 86400000;
      const scanBack = new Date(now.getTime() - padMs);
      const scanFwd = new Date(now.getTime() + padMs);
      const events = listOccurrenceAnchorsInRange(rule, createdAtIso, scanBack, scanFwd);

      let titleResolved: string | null = null;

      for (const { eventMs, eventIso } of events) {
        for (const intervalSeconds of recurringIntervals) {
          const reminderId = `${intervalSeconds}_${eventIso}`;
          const reminderTime = new Date(eventMs - intervalSeconds * 1000);
          if (now.getTime() >= reminderTime.getTime() - sendWindowMs && !sentSet.has(reminderId)) {
            console.log(`Sending recurring reminder for node ${doc.id} to user ${userId}`);
            if (titleResolved === null) {
              titleResolved = await resolveNodeTitle(node, canDecrypt, syncKey ?? null);
            }
            const whenStr = new Date(eventMs).toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: userTimezone,
            });
            const text = `⏰ <b>Напоминание о повторяющейся задаче!</b>\n\n📌 <b>${titleResolved}</b>\n📅 Ближайшее время: ${whenStr}`;
            await sendTelegramMessage(chatId, text);

            sentSet.add(reminderId);
            newlySent.push(reminderId);
          }
        }
      }
    } else {
      if (!node.deadline) continue;

      const deadline = new Date(node.deadline as string);
      for (const intervalSeconds of rawIntervals) {
        const reminderTime = new Date(deadline.getTime() - intervalSeconds * 1000);
        const reminderId = `${intervalSeconds}_${node.deadline}`;

        // Отправляем, если до времени напоминания осталось 10 минут или оно уже прошло
        if (now.getTime() >= reminderTime.getTime() - sendWindowMs && !sentSet.has(reminderId)) {
          console.log(`Sending reminder for node ${doc.id} to user ${userId}`);
          const title = await resolveNodeTitle(node, canDecrypt, syncKey ?? null);

          const deadlineStr = deadline.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: userTimezone,
          });

          const text = `⏰ <b>Напоминание о дедлайне!</b>\n\n📌 <b>${title}</b>\n📅 Срок: ${deadlineStr}`;
          await sendTelegramMessage(chatId, text);

          sentSet.add(reminderId);
          newlySent.push(reminderId);
        }
      }
    }

    const nextReminderAt = computeNextReminderAt({
      deadline: (node.deadline as string | null | undefined) ?? null,
      reminders: node.reminders as number[],
      sentReminders: Array.from(sentSet),
      completed: node.completed as boolean,
      isRecurring: node.isRecurring as boolean | undefined,
      recurrence: (node.recurrence as NodeRecurrence | null | undefined) ?? null,
      createdAt: node.createdAt as string | undefined,
    });

    const currentNextReminderAt = node.nextReminderAt ?? null;
    if (newlySent.length > 0 || nextReminderAt !== currentNextReminderAt) {
      const updatePayload: Record<string, any> = {
        nextReminderAt: nextReminderAt ?? null,
      };
      if (newlySent.length > 0) {
        updatePayload.sentReminders = FieldValue.arrayUnion(...newlySent);
      }
      await doc.ref.update(updatePayload);
    }
  }

  console.log('--- Notification Job Finished ---');
}

run().catch(console.error);

