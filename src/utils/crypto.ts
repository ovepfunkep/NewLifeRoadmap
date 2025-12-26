/**
 * Утилиты для клиентского шифрования данных (E2EE) с использованием AES-GCM.
 */

// Импортируем ключ из строки (base64)
async function importKey(keyStr: string): Promise<CryptoKey> {
  const keyBuffer = Uint8Array.from(atob(keyStr), c => c.charCodeAt(0));
  return await window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

// Генерируем новый случайный ключ и возвращаем его как base64
export async function generateEncryptionKey(): Promise<string> {
  const key = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const exported = await window.crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

// Шифруем объект
export async function encryptData(data: any, keyStr: string): Promise<string> {
  const key = await importKey(keyStr);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedData = new TextEncoder().encode(JSON.stringify(data));
  
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedData
  );

  // Собираем IV + зашифрованные данные в один base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

// Дешифруем строку обратно в объект
export async function decryptData(encryptedStr: string, keyStr: string): Promise<any> {
  try {
    const key = await importKey(keyStr);
    const combined = Uint8Array.from(atob(encryptedStr), c => c.charCodeAt(0));
    
    if (combined.length < 13) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    // В дев-режиме можно оставить лог, в продакшене лучше убрать
    if (import.meta.env.DEV) {
      // console.error('[Crypto] Decryption failed');
    }
    throw e;
  }
}

