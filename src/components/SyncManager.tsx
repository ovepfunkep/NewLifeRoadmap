import { useState, useEffect, useCallback } from 'react';
import { onAuthChange, getCurrentUser } from '../firebase/auth';
import { loadAllNodesFromFirestore, hasDataInFirestore, syncAllNodesToFirestore } from '../firebase/sync';
import { getAllNodes, clearAllNodes } from '../db';
import { SyncConflictDialog } from './SyncConflictDialog';
import { hasDifferences } from '../utils/syncCompare';
import { useToast } from '../hooks/useToast';
import { t } from '../i18n';
import { Node } from '../types';
import { openDB } from 'idb';

const isDev = import.meta.env.DEV;

function log(message: string, ...args: any[]) {
  if (isDev) {
    console.log(`[SyncManager] ${message}`, ...args);
  }
}

export function SyncManager() {
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [localNodes, setLocalNodes] = useState<any[]>([]);
  const [cloudNodes, setCloudNodes] = useState<any[]>([]);
  const { showToast } = useToast();

  const handleFirstSync = useCallback(async () => {
    try {
      log('Starting first sync check');
      
      // Загружаем локальные данные
      const local = await getAllNodes();
      log(`Loaded ${local.length} local nodes`);
      setLocalNodes(local);

      // Проверяем наличие данных в облаке
      const hasCloudData = await hasDataInFirestore();
      
      if (hasCloudData) {
        log('Cloud data exists, loading...');
        const cloud = await loadAllNodesFromFirestore();
        log(`Loaded ${cloud.length} cloud nodes`);
        setCloudNodes(cloud);

        // Проверяем различия
        if (hasDifferences(local, cloud)) {
          log('Differences detected, showing conflict dialog');
          setShowConflictDialog(true);
        } else {
          log('No differences, data is in sync');
        }
      } else {
        log('No cloud data, skipping conflict check');
        // Не загружаем локальные данные в облако автоматически
        // Пользователь должен сделать это вручную
      }
    } catch (error) {
      log('Error in first sync:', error);
      console.error('Sync error:', error);
    }
  }, []);

  useEffect(() => {
    log('Initializing sync manager');
    
    const unsubscribe = onAuthChange(async (user) => {
      if (user) {
        log('User signed in, checking sync status');
        await handleFirstSync();
      } else {
        log('User signed out');
        setShowConflictDialog(false);
      }
    });

    return () => {
      log('Cleaning up sync manager');
      unsubscribe();
    };
  }, [handleFirstSync]);

  const handleChooseLocal = async () => {
    try {
      log('User chose local data, syncing to cloud');
      await syncAllNodesToFirestore(localNodes);
      setShowConflictDialog(false);
      showToast('Локальные данные сохранены в облако');
      log('Local data synced to cloud');
    } catch (error) {
      log('Error syncing local data:', error);
      console.error('Error syncing local data:', error);
      showToast('Ошибка синхронизации');
    }
  };

  const handleChooseCloud = async () => {
    let db: Awaited<ReturnType<typeof openDB>> | null = null;
    try {
      log('User chose cloud data, loading to local');
      // Очищаем локальную БД (кроме корневого узла)
      await clearAllNodes();
      
      // Сохраняем все узлы напрямую в БД, чтобы избежать рекурсивного сохранения детей
      db = await openDB('LifeRoadmapDB', 2);
      const tx = db.transaction('nodes', 'readwrite');
      
      // Сохраняем все узлы из облака
      for (const node of cloudNodes) {
        await tx.store.put(node);
      }
      
      await tx.done;
      
      log(`Loaded ${cloudNodes.length} nodes from cloud to local DB`);
      setShowConflictDialog(false);
      showToast('Облачные данные загружены');
      // Перезагружаем страницу для применения изменений
      window.location.reload();
    } catch (error) {
      log('Error loading cloud data:', error);
      console.error('Error loading cloud data:', error);
      showToast('Ошибка загрузки данных');
    } finally {
      // Всегда закрываем БД, даже при ошибке
      if (db) {
        try {
          await db.close();
        } catch (closeError) {
          console.error('Error closing DB:', closeError);
        }
      }
    }
  };

  const handleCancel = () => {
    log('User cancelled conflict resolution');
    setShowConflictDialog(false);
  };

  if (!showConflictDialog) {
    return null;
  }

  return (
    <SyncConflictDialog
      localNodes={localNodes}
      cloudNodes={cloudNodes}
      onChooseLocal={handleChooseLocal}
      onChooseCloud={handleChooseCloud}
      onCancel={handleCancel}
    />
  );
}

