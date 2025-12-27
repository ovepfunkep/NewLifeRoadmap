import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { webcrypto } from 'node:crypto';

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

async function getTelegramUpdates() {
  if (!BOT_TOKEN) return [];
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`;
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return data.result || [];
  } catch (e) {
    return [];
  }
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
  const updates = await getTelegramUpdates();
  for (const update of updates) {
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

  // 2. Scan for upcoming deadlines
  const now = new Date();
  const nodesSnapshot = await db.collectionGroup('nodes')
    .where('completed', '==', false)
    .where('deadline', '!=', null)
    .get();

  console.log(`Found ${nodesSnapshot.docs.length} incomplete tasks with deadlines.`);

  for (const doc of nodesSnapshot.docs) {
    const node = doc.data();
    if (!node.deadline || !node.reminders || node.reminders.length === 0) continue;

    const deadline = new Date(node.deadline);
    const userId = doc.ref.parent.parent?.id;
    if (!userId) continue;

    // Get user config for Chat ID and syncKey
    const userConfigSnap = await db.doc(`users/${userId}/security/config`).get();
    const userConfig = userConfigSnap.data();
    if (!userConfig?.telegramChatId) continue;

    const chatId = userConfig.telegramChatId;
    const mode = userConfig.mode; // 'gdrive' or 'firestore'
    const syncKey = userConfig.syncKey; // May be null if using GDrive mode
    const sentReminders = node.sentReminders || [];

    for (const intervalSeconds of node.reminders) {
      const reminderTime = new Date(deadline.getTime() - intervalSeconds * 1000);
      const reminderId = `${intervalSeconds}_${node.deadline}`;

      // Check if it's time to remind and not already sent
      if (now >= reminderTime && !sentReminders.includes(reminderId)) {
        console.log(`Sending reminder for node ${doc.id} to user ${userId}`);

        let title = 'Задача без названия';
        
        // Решаем, имеем ли мы право расшифровывать
        const canDecrypt = mode === 'firestore' && !!syncKey;

        if (node.isEncrypted && node.encryptedData) {
          // Старый формат (полное шифрование объекта)
          if (canDecrypt) {
            const decrypted = await decryptData(node.encryptedData, syncKey);
            if (decrypted && decrypted.title) title = decrypted.title;
          } else {
            title = '🔒 Зашифрованная задача (название недоступно)';
          }
        } else if (node.isTitleEncrypted || node.isFieldsEncrypted) {
          // Новый формат (шифрован только заголовок или заголовок + описание)
          if (canDecrypt) {
            const decrypted = await decryptData(node.title, syncKey);
            if (decrypted) title = decrypted;
          } else {
            title = '🔒 Зашифрованная задача (название недоступно)';
          }
        } else {
          title = node.title;
        }

        const deadlineStr = deadline.toLocaleString('ru-RU', { 
          day: '2-digit', month: '2-digit', year: 'numeric', 
          hour: '2-digit', minute: '2-digit',
          hour12: false
        });
        
        const text = `⏰ <b>Напоминание о дедлайне!</b>\n\n📌 <b>${title}</b>\n📅 Срок: ${deadlineStr}`;
        
        await sendTelegramMessage(chatId, text);

        // Update node to mark reminder as sent
        await doc.ref.update({
          sentReminders: FieldValue.arrayUnion(reminderId)
        });
      }
    }
  }

  console.log('--- Notification Job Finished ---');
}

run().catch(console.error);

