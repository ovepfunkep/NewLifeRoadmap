import { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthChange } from '../firebase/auth';
import { loadAllNodesFromFirestore, hasDataInFirestore, syncAllNodesToFirestore } from '../firebase/sync';
import { getAllNodes, clearAllNodes } from '../db';
import { SyncConflictDialog } from './SyncConflictDialog';
import { hasDifferences, compareNodes } from '../utils/syncCompare';
import { useToast } from '../hooks/useToast';
import { t } from '../i18n';
import { openDB } from 'idb';
import { User } from 'firebase/auth';

const isDev = import.meta.env.DEV;

function log(message: string, ...args: any[]) {
  if (isDev) {
    console.log(`[SyncManager] ${message}`, ...args);
  }
}

// Событие для уведомления об обновлении данных
const DATA_UPDATED_EVENT = 'syncManager:dataUpdated';

// Функция для отправки события об обновлении данных
function notifyDataUpdated() {
  log('Notifying components about data update');
  window.dispatchEvent(new CustomEvent(DATA_UPDATED_EVENT));
}

export function SyncManager() {
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [localNodes, setLocalNodes] = useState<any[]>([]);
  const [cloudNodes, setCloudNodes] = useState<any[]>([]);
  const { showToast, removeToast } = useToast();
  const isInitialLoadRef = useRef<boolean>(true); // Флаг первой загрузки
  const checkToastIdRef = useRef<string | null>(null); // Ref для ID тоста проверки
  const previousUserRef = useRef<User | null>(null); // Отслеживание предыдущего состояния пользователя
  const isFirstAuthCheckRef = useRef<boolean>(true); // Флаг первого вызова onAuthChange
  const silentLoadInProgressRef = useRef<boolean>(false); // Флаг, что тихая загрузка уже выполняется
  const lastSilentLoadHashRef = useRef<string | null>(null); // Хеш последних загруженных данных для предотвращения повторной загрузки

  // Автоматическая загрузка данных из облака без проверки конфликтов
  const loadCloudDataSilently = useCallback(async () => {
    // Предотвращаем повторную загрузку, если она уже выполняется
    if (silentLoadInProgressRef.current) {
      log('[loadCloudDataSilently] Already in progress, skipping');
      return;
    }

    try {
      silentLoadInProgressRef.current = true;
      log('[loadCloudDataSilently] Starting silent load for already logged in user');
      
      // Проверяем наличие интернета перед попыткой загрузки
      log(`[loadCloudDataSilently] navigator.onLine: ${navigator.onLine}`);
      if (!navigator.onLine) {
        log('[loadCloudDataSilently] Device is offline, skipping');
        silentLoadInProgressRef.current = false;
        return;
      }
      
      // Сначала проверяем локальные данные
      log('[loadCloudDataSilently] Loading local nodes...');
      const localNodes = await getAllNodes();
      log(`[loadCloudDataSilently] Loaded ${localNodes.length} local nodes`);
      
      // Проверяем наличие данных в облаке с обработкой ошибок сети
      let hasCloudData = false;
      try {
        log('[loadCloudDataSilently] Checking for cloud data...');
        hasCloudData = await hasDataInFirestore();
        log(`[loadCloudDataSilently] hasCloudData: ${hasCloudData}`);
      } catch (error: any) {
        log(`[loadCloudDataSilently] Error checking cloud data:`, error);
        // Если ошибка связана с сетью или офлайн режимом, пропускаем загрузку
        if (error?.code === 'unavailable' || error?.message?.includes('offline') || !navigator.onLine) {
          log('[loadCloudDataSilently] Network error or offline mode, skipping:', error?.message || error);
          silentLoadInProgressRef.current = false;
          return;
        }
        throw error; // Пробрасываем другие ошибки
      }
      
      if (!hasCloudData) {
        log('[loadCloudDataSilently] No cloud data found, skipping');
        silentLoadInProgressRef.current = false;
        return;
      }
      
      let cloud: any[] = [];
      try {
        log('[loadCloudDataSilently] Loading cloud nodes...');
        cloud = await loadAllNodesFromFirestore();
        log(`[loadCloudDataSilently] Loaded ${cloud.length} cloud nodes`);
      } catch (error: any) {
        log(`[loadCloudDataSilently] Error loading cloud nodes:`, error);
        // Если ошибка связана с сетью или офлайн режимом, пропускаем загрузку
        if (error?.code === 'unavailable' || error?.message?.includes('offline') || !navigator.onLine) {
          log('[loadCloudDataSilently] Network error while loading, skipping:', error?.message || error);
          silentLoadInProgressRef.current = false;
          return;
        }
        throw error; // Пробрасываем другие ошибки
      }
      
      if (cloud.length === 0) {
        log('[loadCloudDataSilently] Cloud data is empty, skipping');
        silentLoadInProgressRef.current = false;
        return;
      }
      
      // Сравниваем данные перед загрузкой
      log('[loadCloudDataSilently] Comparing local and cloud data...');
      const hasDiff = hasDifferences(localNodes, cloud);
      log(`[loadCloudDataSilently] Data differs: ${hasDiff}`);
      
      // Если данные совпадают, не загружаем и не перезагружаем
      if (!hasDiff) {
        log('[loadCloudDataSilently] Local and cloud data are identical, no need to reload');
        silentLoadInProgressRef.current = false;
        return;
      }
      
      log('[loadCloudDataSilently] Data differs, loading cloud data to local DB...');
      
      // Тихо загружаем облачные данные
      let db: Awaited<ReturnType<typeof openDB>> | null = null;
      try {
        log('[loadCloudDataSilently] Clearing local nodes...');
        await clearAllNodes();
        
        log('[loadCloudDataSilently] Opening DB...');
        db = await openDB('LifeRoadmapDB', 2);
        const tx = db.transaction('nodes', 'readwrite');
        
        log(`[loadCloudDataSilently] Saving ${cloud.length} nodes to local DB...`);
        for (const node of cloud) {
          await tx.store.put(node);
        }
        
        await tx.done;
        log(`[loadCloudDataSilently] Successfully loaded ${cloud.length} nodes from cloud to local DB`);
        
        // Уведомляем компоненты об обновлении данных вместо перезагрузки страницы
        log('[loadCloudDataSilently] Notifying components about data update...');
        notifyDataUpdated();
        silentLoadInProgressRef.current = false;
      } catch (error) {
        log('[loadCloudDataSilently] Error loading cloud data:', error);
        console.error('[loadCloudDataSilently] Error loading cloud data:', error);
        // При ошибке сбрасываем флаг, чтобы можно было повторить попытку
        silentLoadInProgressRef.current = false;
      } finally {
        if (db) {
          try {
            await db.close();
          } catch (closeError) {
            console.error('Error closing DB:', closeError);
          }
        }
      }
    } catch (error: any) {
      log('[loadCloudDataSilently] Error in silent cloud load:', error);
      console.error('[loadCloudDataSilently] Error in silent cloud load:', error);
      silentLoadInProgressRef.current = false;
    }
  }, []);

  const handleFirstSync = useCallback(async (isNewLogin: boolean) => {
    try {
      log(`[handleFirstSync] Starting sync, isNewLogin: ${isNewLogin}`);
      
      // Если пользователь уже был залогинен (не новый логин), просто загружаем данные из облака
      if (!isNewLogin) {
        log('[handleFirstSync] User already logged in, loading cloud data silently');
        await loadCloudDataSilently();
        return;
      }
      
      log('[handleFirstSync] New login detected, checking for conflicts');
      
      // Показываем тост о проверке синхронизации только при новом логине
      const checkToastId = showToast(t('toast.syncChecking'), undefined, {
        isLoading: true,
        persistent: true
      });
      checkToastIdRef.current = checkToastId;
      
      // Делаем снимок локальных данных СРАЗУ, до любых изменений
      log('[handleFirstSync] Loading local nodes snapshot...');
      const localSnapshot = await getAllNodes();
      log(`[handleFirstSync] Loaded ${localSnapshot.length} local nodes`);
      
      // Проверяем наличие данных в облаке
      log('[handleFirstSync] Checking for cloud data...');
      const hasCloudData = await hasDataInFirestore();
      log(`[handleFirstSync] hasCloudData: ${hasCloudData}`);
      
      if (hasCloudData) {
        log('[handleFirstSync] Cloud data exists, loading...');
        const cloud = await loadAllNodesFromFirestore();
        log(`[handleFirstSync] Loaded ${cloud.length} cloud nodes`);
        
        // Сравниваем снимок локальных данных с облачными данными
        log('[handleFirstSync] Comparing local and cloud data...');
        const diff = compareNodes(localSnapshot, cloud);
        log(`[handleFirstSync] Diff: localOnly=${diff.localOnly.length}, cloudOnly=${diff.cloudOnly.length}, different=${diff.different.length}`);
        
        // Показываем конфликт ТОЛЬКО если локальных данных больше чем облачных
        // И это новый логин
        const hasLocalMore = diff.localOnly.length > 0 || diff.different.length > 0;
        const hasCloudMore = diff.cloudOnly.length > 0;
        
        log(`[handleFirstSync] hasLocalMore: ${hasLocalMore}, hasCloudMore: ${hasCloudMore}`);
        
        // Если в облаке данных больше или равное количество - просто загружаем облачные данные
        if (hasCloudMore && !hasLocalMore) {
          log('[handleFirstSync] Cloud has more data and no local changes, loading cloud data');
          // Закрываем тост проверки
          if (checkToastIdRef.current) {
            removeToast(checkToastIdRef.current);
            checkToastIdRef.current = null;
          }
          
          // Загружаем облачные данные
          let db: Awaited<ReturnType<typeof openDB>> | null = null;
          try {
            log('[handleFirstSync] Clearing local nodes...');
            await clearAllNodes();
            
            log('[handleFirstSync] Opening DB...');
            db = await openDB('LifeRoadmapDB', 2);
            const tx = db.transaction('nodes', 'readwrite');
            
            log(`[handleFirstSync] Saving ${cloud.length} nodes to local DB...`);
            for (const node of cloud) {
              await tx.store.put(node);
            }
            
            await tx.done;
            log(`[handleFirstSync] Successfully loaded ${cloud.length} nodes from cloud to local DB`);
            // Уведомляем компоненты об обновлении данных вместо перезагрузки страницы
            log('[handleFirstSync] Notifying components about data update...');
            notifyDataUpdated();
          } catch (error) {
            log('[handleFirstSync] Error loading cloud data:', error);
            console.error('[handleFirstSync] Error loading cloud data:', error);
          } finally {
            if (db) {
              try {
                await db.close();
              } catch (closeError) {
                console.error('Error closing DB:', closeError);
              }
            }
          }
          isInitialLoadRef.current = false;
          return;
        }
        
        // Показываем конфликт только если локальных данных больше
        if (hasLocalMore) {
          log('[handleFirstSync] Local has more data, showing conflict dialog');
          setLocalNodes(localSnapshot);
          setCloudNodes(cloud);
          setShowConflictDialog(true);
          // Закрываем тост проверки при показе диалога конфликта
          if (checkToastIdRef.current) {
            removeToast(checkToastIdRef.current);
            checkToastIdRef.current = null;
          }
        } else {
          log('[handleFirstSync] No differences or cloud has more data, data is in sync');
          // Закрываем тост проверки, если конфликтов нет
          if (checkToastIdRef.current) {
            removeToast(checkToastIdRef.current);
            checkToastIdRef.current = null;
          }
        }
        isInitialLoadRef.current = false;
      } else {
        log('[handleFirstSync] No cloud data, skipping conflict check');
        // Закрываем тост проверки, если данных в облаке нет
        if (checkToastIdRef.current) {
          removeToast(checkToastIdRef.current);
          checkToastIdRef.current = null;
        }
        isInitialLoadRef.current = false;
      }
    } catch (error) {
      log('[handleFirstSync] Error in first sync:', error);
      console.error('[handleFirstSync] Sync error:', error);
      // Закрываем тост проверки при ошибке
      if (checkToastIdRef.current) {
        removeToast(checkToastIdRef.current);
        checkToastIdRef.current = null;
      }
      isInitialLoadRef.current = false;
    }
  }, [showToast, removeToast, loadCloudDataSilently]);

  useEffect(() => {
    log('[useEffect] Initializing sync manager');
    log(`[useEffect] isFirstAuthCheckRef.current: ${isFirstAuthCheckRef.current}`);
    log(`[useEffect] previousUserRef.current: ${previousUserRef.current ? 'exists' : 'null'}`);
    log(`[useEffect] __isProgrammaticReload: ${(window as any).__isProgrammaticReload}`);
    
    // Очищаем флаг сессии при монтировании компонента (новая сессия браузера)
    // Но не очищаем при программной перезагрузке страницы
    if (!(window as any).__isProgrammaticReload) {
      log('[useEffect] Not a programmatic reload, clearing session flags');
      lastSilentLoadHashRef.current = null;
    } else {
      log('[useEffect] Programmatic reload detected, keeping session flags');
    }
    
    const unsubscribe = onAuthChange(async (user) => {
      log(`[onAuthChange] Auth state changed, user: ${user ? `exists (${user.uid})` : 'null'}`);
      log(`[onAuthChange] isFirstAuthCheckRef.current: ${isFirstAuthCheckRef.current}`);
      log(`[onAuthChange] previousUserRef.current: ${previousUserRef.current ? 'exists' : 'null'}`);
      
      if (user) {
        // Определяем, это новый логин или пользователь уже был залогинен
        // Если это первый вызов и пользователь уже залогинен - это не новый логин
        // Если предыдущего пользователя не было (null) - это новый логин
        const isNewLogin = isFirstAuthCheckRef.current 
          ? false // При первой проверке пользователь уже был залогинен при загрузке страницы
          : previousUserRef.current === null; // Если предыдущего пользователя не было - это новый логин
        
        log(`[onAuthChange] User signed in, isNewLogin: ${isNewLogin}`);
        previousUserRef.current = user;
        isFirstAuthCheckRef.current = false;
        
        await handleFirstSync(isNewLogin);
      } else {
        log('[onAuthChange] User signed out or not logged in');
        // При первом вызове, если пользователь не залогинен, устанавливаем previousUserRef в null
        if (isFirstAuthCheckRef.current) {
          previousUserRef.current = null;
          isFirstAuthCheckRef.current = false;
        } else {
          previousUserRef.current = null;
        }
        // Сбрасываем флаги при выходе
        silentLoadInProgressRef.current = false;
        lastSilentLoadHashRef.current = null;
        setShowConflictDialog(false);
      }
    });

    return () => {
      log('[useEffect] Cleaning up sync manager');
      unsubscribe();
    };
  }, [handleFirstSync]);

  const handleChooseLocal = async () => {
    try {
      log('[handleChooseLocal] User chose local data, syncing to cloud');
      
      // Проверяем авторизацию перед синхронизацией
      const { getCurrentUser } = await import('../firebase/auth');
      const user = getCurrentUser();
      if (!user) {
        log('[handleChooseLocal] User not authenticated, cannot sync');
        setShowConflictDialog(false);
        showToast('Необходимо войти в аккаунт для синхронизации');
        return;
      }
      
      setShowConflictDialog(false);
      showToast('Синхронизация с облаком...');
      
      // Запускаем синхронизацию в фоне, не блокируя UI
      (async () => {
        try {
          await syncAllNodesToFirestore(localNodes);
          showToast('Локальные данные сохранены в облако');
          log('[handleChooseLocal] Local data synced to cloud');
        } catch (error) {
          log('[handleChooseLocal] Error syncing local data:', error);
          console.error('[handleChooseLocal] Error syncing local data:', error);
          showToast('Ошибка синхронизации');
        }
      })();
    } catch (error) {
      log('[handleChooseLocal] Error in handleChooseLocal:', error);
      console.error('[handleChooseLocal] Error in handleChooseLocal:', error);
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
      // Уведомляем компоненты об обновлении данных вместо перезагрузки страницы
      notifyDataUpdated();
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

