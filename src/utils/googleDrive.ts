/**
 * Утилиты для работы с Google Drive API (appDataFolder)
 */

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';
const SYNC_KEY_FILENAME = 'sync_key.txt';

async function getAccessToken(): Promise<string> {
  const token = localStorage.getItem('google_access_token');
  if (!token) throw new Error('No Google access token found');
  return token;
}

export async function getSyncKeyFromGoogleDrive(): Promise<string | null> {
  try {
    const token = await getAccessToken();
    
    // 1. Ищем файл в appDataFolder
    const searchUrl = `${DRIVE_API_URL}?q=name='${SYNC_KEY_FILENAME}'&spaces=appDataFolder&fields=files(id)`;
    const response = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      const fileId = data.files[0].id;
      
      // 2. Скачиваем содержимое файла
      const downloadUrl = `${DRIVE_API_URL}/${fileId}?alt=media`;
      const contentResponse = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      return await contentResponse.text();
    }
    
    return null;
  } catch (error) {
    console.error('[GoogleDrive] Error getting sync key:', error);
    return null;
  }
}

export async function saveSyncKeyToGoogleDrive(syncKey: string): Promise<void> {
  try {
    const token = await getAccessToken();
    
    // 1. Ищем, существует ли файл
    const searchUrl = `${DRIVE_API_URL}?q=name='${SYNC_KEY_FILENAME}'&spaces=appDataFolder&fields=files(id)`;
    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const searchData = await searchResponse.json();
    
    const metadata = {
      name: SYNC_KEY_FILENAME,
      parents: ['appDataFolder']
    };

    if (searchData.files && searchData.files.length > 0) {
      // Файл существует - обновляем
      const fileId = searchData.files[0].id;
      const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
      
      await fetch(uploadUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain'
        },
        body: syncKey
      });
    } else {
      // Файла нет - создаем
      // Multipart upload: metadata + content
      const boundary = 'foo_bar_baz';
      const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      
      const body = `--${boundary}\r\n` +
                   'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                   JSON.stringify(metadata) + '\r\n' +
                   `--${boundary}\r\n` +
                   'Content-Type: text/plain\r\n\r\n' +
                   syncKey + '\r\n' +
                   `--${boundary}--`;
      
      await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
      });
    }
  } catch (error) {
    console.error('[GoogleDrive] Error saving sync key:', error);
    throw error;
  }
}






