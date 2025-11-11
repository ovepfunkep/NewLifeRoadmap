import { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthChange } from '../firebase/auth';
import { loadAllNodesFromFirestore, hasDataInFirestore, syncAllNodesToFirestore } from '../firebase/sync';
import { getAllNodes, clearAllNodes } from '../db';
import { SyncConflictDialog } from './SyncConflictDialog';
import { hasDifferences } from '../utils/syncCompare';
import { useToast } from '../hooks/useToast';
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
  const isInitialLoadRef = useRef<boolean>(true); // Флаг первой загрузки

  const handleFirstSync = useCallback(async () => {
    try {
      log('Starting first sync check');
      
      // Делаем снимок локальных данных СРАЗУ, до любых изменений
      const localSnapshot = await getAllNodes();
      log(`Loaded ${localSnapshot.length} local nodes snapshot`);
      
      // Проверяем наличие данных в облаке
      const hasCloudData = await hasDataInFirestore();
      
      if (hasCloudData) {
        log('Cloud data exists, loading...');
        const cloud = await loadAllNodesFromFirestore();
        log(`Loaded ${cloud.length} cloud nodes`);
        
        // Сравниваем снимок локальных данных с облачными данными
        if (hasDifferences(localSnapshot, cloud)) {
          // Если это первая загрузка, даем время на синхронизацию локальных изменений
          // Не показываем конфликт сразу после загрузки страницы
          if (isInitialLoadRef.current) {
            log('Initial load detected, waiting before conflict check');
            // Ждем 3 секунды перед проверкой конфликтов на первой загрузке
            setTimeout(async () => {
              // Повторно проверяем локальные данные после задержки
              const currentLocal = await getAllNodes();
              const currentCloud = await loadAllNodesFromFirestore();
              
              if (hasDifferences(currentLocal, currentCloud)) {
                log('Differences still exist after delay, showing conflict dialog');
                setLocalNodes(currentLocal);
                setCloudNodes(currentCloud);
                setShowConflictDialog(true);
              } else {
                log('Differences resolved during delay, no conflict');
              }
              isInitialLoadRef.current = false;
            }, 3000);
          } else {
            log('Differences detected, showing conflict dialog');
            setLocalNodes(localSnapshot);
            setCloudNodes(cloud);
            setShowConflictDialog(true);
          }
        } else {
          log('No differences, data is in sync');
          isInitialLoadRef.current = false;
        }
      } else {
        log('No cloud data, skipping conflict check');
        isInitialLoadRef.current = false;
      }
    } catch (error) {
      log('Error in first sync:', error);
      console.error('Sync error:', error);
      isInitialLoadRef.current = false;
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
      setShowConflictDialog(false);
      showToast('Синхронизация с облаком...');
      
      // Запускаем синхронизацию в фоне, не блокируя UI
      (async () => {
        try {
          await syncAllNodesToFirestore(localNodes);
          showToast('Локальные данные сохранены в облако');
          log('Local data synced to cloud');
        } catch (error) {
          log('Error syncing local data:', error);
          console.error('Error syncing local data:', error);
          showToast('Ошибка синхронизации');
        }
      })();
    } catch (error) {
      log('Error in handleChooseLocal:', error);
      console.error('Error in handleChooseLocal:', error);
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

