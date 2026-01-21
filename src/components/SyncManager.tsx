import { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthChange } from '../firebase/auth';
import { loadAllNodesFromFirestore, hasDataInFirestore, syncAllNodesToFirestore, getSyncMeta, loadChangedNodesFromFirestore, subscribeToChangeLog, normalizeNodeFromPayload, getClientId, cleanupChangeLog } from '../firebase/sync';
import { getAllNodesFlat, clearAllNodes } from '../db';
import { SyncConflictDialog } from './SyncConflictDialog';
import { hasDifferences } from '../utils/syncCompare';
import { useToast } from '../hooks/useToast';
import { t } from '../i18n';
import { openDB } from 'idb';
import { User } from 'firebase/auth';
import { initSecurity } from '../utils/securityManager';

function log(..._args: any[]) {
  // console.log('[SyncManager]', ..._args);
}

// Событие для уведомления об обновлении данных
const DATA_UPDATED_EVENT = 'syncManager:dataUpdated';

const syncChannel = typeof window !== 'undefined' ? new BroadcastChannel('sync_updates') : null;

if (syncChannel) {
  syncChannel.onmessage = (event) => {
    if (event.data === 'dataUpdated') {
      window.dispatchEvent(new CustomEvent(DATA_UPDATED_EVENT, { detail: { fromBroadcast: true } }));
    }
  };
}

// Слушаем локальные обновления, чтобы переслать их в другие вкладки
if (typeof window !== 'undefined') {
  window.addEventListener(DATA_UPDATED_EVENT, (event: any) => {
    // Если событие пришло не из броадкаста, значит оно локальное — рассылаем остальным
    if (syncChannel && !event.detail?.fromBroadcast) {
      syncChannel.postMessage('dataUpdated');
    }
  });
}

function notifyDataUpdated() {
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
  const changeUnsubRef = useRef<null | (() => void)>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const clientIdRef = useRef<string>(getClientId());
  
  // Ключ для хранения времени последней синхронизации в localStorage
  const LAST_SYNC_TIME_KEY = 'last_local_sync_time';
  
  // Время последнего изменения в облаке, о котором мы знаем
  const lastCloudChangeRef = useRef<string | null>(localStorage.getItem(LAST_SYNC_TIME_KEY));
  const lastChangeSeenRef = useRef<string | null>(null);
  const getChangeKey = (userId: string) => `last_seen_change_${userId}`;

  // Автоматическая загрузка данных из облака и синхронизация (бидирекциональная)
  const loadCloudDataSilently = useCallback(async () => {
    // Предотвращаем повторную загрузку, если она уже выполняется
    if (silentLoadInProgressRef.current) {
      log('[loadCloudDataSilently] Already in progress, skipping');
      return;
    }

    try {
      silentLoadInProgressRef.current = true;
      log('[loadCloudDataSilently] Starting silent incremental sync');
      
      if (!navigator.onLine) {
        log('[loadCloudDataSilently] Device is offline, skipping');
        silentLoadInProgressRef.current = false;
        return;
      }

      // Проверка метаданных для экономии квот
      const meta = await getSyncMeta();
      if (!meta) {
        log('[loadCloudDataSilently] No cloud metadata found');
        silentLoadInProgressRef.current = false;
        return;
      }

      const lastLocalSyncTime = lastCloudChangeRef.current;
      
      if (lastLocalSyncTime === meta.lastChangedAt) {
        log('[loadCloudDataSilently] Cloud data unchanged (meta check), skipping fetch');
        silentLoadInProgressRef.current = false;
        return;
      }
      
      let changedNodes: any[] = [];
      let hasChanges = false;

      if (!lastLocalSyncTime) {
        log('[loadCloudDataSilently] No last sync time, skipping full fetch (change log will handle)');
        lastCloudChangeRef.current = meta.lastChangedAt;
        localStorage.setItem(LAST_SYNC_TIME_KEY, meta.lastChangedAt);
        silentLoadInProgressRef.current = false;
        return;
      } else {
        log(`[loadCloudDataSilently] Fetching changes since ${lastLocalSyncTime}`);
        changedNodes = await loadChangedNodesFromFirestore(lastLocalSyncTime);
        hasChanges = changedNodes.length > 0;
      }

      if (hasChanges) {
        let db: Awaited<ReturnType<typeof openDB>> | null = null;
        try {
          db = await openDB('LifeRoadmapDB', 2);
          const tx = db.transaction('nodes', 'readwrite');
          
          // При инкрементальной загрузке мы просто обновляем полученные узлы.
          // LWW логика здесь упрощена: облако всегда выигрывает для входящих изменений, 
          // так как мы запрашиваем только то, что новее нашего lastLocalSyncTime.
          for (const node of changedNodes) {
            await tx.store.put(node);
          }
          await tx.done;
          
          log(`[loadCloudDataSilently] Local DB updated with ${changedNodes.length} nodes, notifying components`);
          notifyDataUpdated();
        } finally {
          if (db) await db.close();
        }
      } else {
        log('[loadCloudDataSilently] No changed nodes returned from cloud');
      }

      // Обновляем локальный маркер времени в любом случае, если проверка прошла успешно
      lastCloudChangeRef.current = meta.lastChangedAt;
      localStorage.setItem(LAST_SYNC_TIME_KEY, meta.lastChangedAt);
      
      silentLoadInProgressRef.current = false;
    } catch (error: any) {
      log('[loadCloudDataSilently] Error:', error);
      
      // Обработка превышения квоты или таймаута
      if (error?.code === 'resource-exhausted' || error?.message?.includes('TIMEOUT_SYNC')) {
        showToast(t('toast.syncError') || 'Облако временно недоступно (превышена квота)', undefined, { type: 'error' });
      }
      
      silentLoadInProgressRef.current = false;
    } finally {
      silentLoadInProgressRef.current = false;
    }
  }, []);

  const applyFullCloudSnapshot = useCallback(async () => {
    const cloud = await loadAllNodesFromFirestore(true);
    let db: Awaited<ReturnType<typeof openDB>> | null = null;
    try {
      await clearAllNodes();
      db = await openDB('LifeRoadmapDB', 2);
      const tx = db.transaction('nodes', 'readwrite');
      for (const node of cloud) {
        await tx.store.put(node);
      }
      await tx.done;
      notifyDataUpdated();
    } finally {
      if (db) await db.close();
    }
  }, []);

  const startChangeListener = useCallback(async (userId: string) => {
    if (changeUnsubRef.current) {
      changeUnsubRef.current();
      changeUnsubRef.current = null;
    }

    const cleanupKey = `last_change_cleanup_${userId}`;
    const lastCleanup = localStorage.getItem(cleanupKey);
    if (!lastCleanup || Date.now() - new Date(lastCleanup).getTime() > 24 * 60 * 60 * 1000) {
      try {
        await cleanupChangeLog(userId);
      } finally {
        localStorage.setItem(cleanupKey, new Date().toISOString());
      }
    }

    const key = getChangeKey(userId);
    let since = localStorage.getItem(key);
    if (!since) {
      const meta = await getSyncMeta();
      since = meta?.lastChangedAt || new Date().toISOString();
      localStorage.setItem(key, since);
    }
    lastChangeSeenRef.current = since;

    changeUnsubRef.current = subscribeToChangeLog(userId, since, async (changes) => {
      let maxUpdatedAt = lastChangeSeenRef.current || '';
      let fullSyncRequired = false;
      const nodesToUpsert: any[] = [];

      for (const change of changes) {
        if (change.updatedAt && change.updatedAt > maxUpdatedAt) {
          maxUpdatedAt = change.updatedAt;
        }
        if (change.updatedBy && change.updatedBy === clientIdRef.current) {
          continue;
        }
        if (change.type === 'bulk' || change.fullSyncRequired) {
          fullSyncRequired = true;
          continue;
        }
        if (change.payload) {
          const node = await normalizeNodeFromPayload(change.payload, change.nodeId);
          nodesToUpsert.push(node);
        }
      }

      if (fullSyncRequired) {
        await applyFullCloudSnapshot();
      } else if (nodesToUpsert.length > 0) {
        let db: Awaited<ReturnType<typeof openDB>> | null = null;
        try {
          db = await openDB('LifeRoadmapDB', 2);
          const tx = db.transaction('nodes', 'readwrite');
          for (const node of nodesToUpsert) {
            await tx.store.put(node);
          }
          await tx.done;
          notifyDataUpdated();
        } finally {
          if (db) await db.close();
        }
      }

      if (maxUpdatedAt) {
        lastChangeSeenRef.current = maxUpdatedAt;
        localStorage.setItem(key, maxUpdatedAt);
      }
    }, (error) => {
      console.error('[SyncManager] Change log subscription error:', error);
    });
  }, [applyFullCloudSnapshot]);

  useEffect(() => {
    const handleActivate = async () => {
      if (document.hidden) return;
      if (currentUserIdRef.current) {
        await startChangeListener(currentUserIdRef.current);
      }
    };

    const handleVisibility = () => {
      void handleActivate();
    };

    const handleFocus = () => {
      void handleActivate();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [startChangeListener]);

  const handleFirstSync = useCallback(async (isNewLogin: boolean) => {
    try {
      log(`[handleFirstSync] Starting sync, isNewLogin: ${isNewLogin}`);
      
      if (!isNewLogin) {
        await loadCloudDataSilently();
        return;
      }
      
      const checkToastId = showToast(t('toast.syncChecking'), undefined, {
        isLoading: true,
        persistent: true
      });
      checkToastIdRef.current = checkToastId;
      
      const local = await getAllNodesFlat();
      const hasCloudData = await hasDataInFirestore();
      
      if (hasCloudData) {
        const cloud = await loadAllNodesFromFirestore(true);
        
        // Сравниваем ВСЕ узлы (без фильтра buildReachableNodes, который мог скрывать данные)
        const hasRealDiff = hasDifferences(local, cloud);
        
        if (hasRealDiff) {
          log('[handleFirstSync] Real differences found, showing conflict dialog');
          setLocalNodes(local);
          setCloudNodes(cloud);
          setShowConflictDialog(true);
          
          if (checkToastIdRef.current) {
            removeToast(checkToastIdRef.current);
            checkToastIdRef.current = null;
          }
          return;
        }

        // Если значимых различий нет, делаем тихий мерж (LWW) для всех узлов
        log('[handleFirstSync] No significant differences, performing silent merge');
        const localMap = new Map(local.map(n => [n.id, n]));
        const cloudMap = new Map(cloud.map(n => [n.id, n]));
        const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);
        const mergedNodes: any[] = [];
        
        for (const id of allIds) {
          const lNode = localMap.get(id);
          const cNode = cloudMap.get(id);
          if (!lNode) mergedNodes.push({ ...cNode, children: [] });
          else if (!cNode) mergedNodes.push({ ...lNode, children: [] });
          else {
            const lTime = new Date(lNode.updatedAt || 0).getTime();
            const cTime = new Date(cNode.updatedAt || 0).getTime();
            const winner = cTime > lTime ? cNode : lNode;
            mergedNodes.push({ ...winner, children: [] });
          }
        }

        let db: Awaited<ReturnType<typeof openDB>> | null = null;
        try {
          await clearAllNodes();
          db = await openDB('LifeRoadmapDB', 2);
          const tx = db.transaction('nodes', 'readwrite');
          for (const node of mergedNodes) await tx.store.put(node);
          await tx.done;
          
          // Гарантируем, что облако тоже получит финальное состояние
          await syncAllNodesToFirestore(mergedNodes, cloud);
          notifyDataUpdated();
        } finally {
          if (db) await db.close();
          if (checkToastIdRef.current) {
            removeToast(checkToastIdRef.current);
            checkToastIdRef.current = null;
          }
        }
      } else {
        // Если в облаке пусто - выгружаем локальные данные
        if (local.length > 0) {
          await syncAllNodesToFirestore(local);
        }
        if (checkToastIdRef.current) {
          removeToast(checkToastIdRef.current);
          checkToastIdRef.current = null;
        }
      }
    } catch (error) {
      console.error('[handleFirstSync] Sync error:', error);
      if (checkToastIdRef.current) {
        removeToast(checkToastIdRef.current);
        checkToastIdRef.current = null;
      }
    } finally {
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
        const isNewLogin = isFirstAuthCheckRef.current 
          ? false 
          : previousUserRef.current === null;
        
        // Сохраняем пользователя сразу
        previousUserRef.current = user;
        currentUserIdRef.current = user.uid;

        // Инициализируем систему безопасности (проверяем кэш/конфиг)
        log('[onAuthChange] Initializing security for user', user.uid);
        try {
          const { initialized } = await initSecurity(user.uid);
          
          if (initialized) {
            const { saveUserSecurityConfig } = await import('../firebase/security');
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            await saveUserSecurityConfig(user.uid, { timezone });
          }

          if (!initialized) {
            log('[onAuthChange] Security not initialized, waiting for choice');
            isFirstAuthCheckRef.current = false;
            return;
          }
        } catch (err) {
          console.error('[onAuthChange] Security init failed', err);
          return;
        }

        log(`[onAuthChange] User signed in, isNewLogin: ${isNewLogin}`);
        isFirstAuthCheckRef.current = false;
        
        await handleFirstSync(isNewLogin);
        await startChangeListener(user.uid);
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
        currentUserIdRef.current = null;
        if (changeUnsubRef.current) {
          changeUnsubRef.current();
          changeUnsubRef.current = null;
        }
      }
    });

    // Слушатель инициализации безопасности (вызывается после выбора в AuthAvatar)
    const handleSecurityInit = async (e: any) => {
      const { userId } = e.detail;
      log('[security:initialized] event received for user', userId);
      // Если это тот же пользователь, запускаем синхронизацию
      if (previousUserRef.current && previousUserRef.current.uid === userId) {
        await handleFirstSync(true); // Считаем это новым логином
        await startChangeListener(userId);
      }
    };

    window.addEventListener('security:initialized', handleSecurityInit as EventListener);

    return () => {
      log('[useEffect] Cleaning up sync manager');
      unsubscribe();
      window.removeEventListener('security:initialized', handleSecurityInit as EventListener);
    };
  }, [handleFirstSync, startChangeListener]);

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

  const handleMerge = async () => {
    let db: Awaited<ReturnType<typeof openDB>> | null = null;
    try {
      log('[handleMerge] Starting smart merge...');
      
      // Сливаем данные: для каждого узла берем тот, у которого новее updatedAt
      const localMap = new Map(localNodes.map(n => [n.id, n]));
      const cloudMap = new Map(cloudNodes.map(n => [n.id, n]));
      
      const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);
      const mergedNodes: any[] = [];
      
      for (const id of allIds) {
        const local = localMap.get(id);
        const cloud = cloudMap.get(id);
        
        if (!local) {
          mergedNodes.push(cloud);
        } else if (!cloud) {
          mergedNodes.push(local);
        } else {
          const localTime = new Date(local.updatedAt || 0).getTime();
          const cloudTime = new Date(cloud.updatedAt || 0).getTime();
          
          if (cloudTime > localTime) {
            mergedNodes.push(cloud);
          } else {
            mergedNodes.push(local);
          }
        }
      }
      
      log(`[handleMerge] Merge result: ${mergedNodes.length} nodes`);
      
      // Сохраняем результат в локальную БД
      await clearAllNodes();
      db = await openDB('LifeRoadmapDB', 2);
      const tx = db.transaction('nodes', 'readwrite');
      for (const node of mergedNodes) {
        await tx.store.put(node);
      }
      await tx.done;
      
      // Синхронизируем результат с облаком
      await syncAllNodesToFirestore(mergedNodes, cloudNodes);
      
      setShowConflictDialog(false);
      showToast(t('toast.syncSuccess') || 'Данные объединены');
      notifyDataUpdated();
    } catch (error) {
      log('[handleMerge] Error during merge:', error);
      console.error('[handleMerge] Error during merge:', error);
      showToast(t('toast.syncError') || 'Ошибка при объединении');
    } finally {
      if (db) await db.close();
    }
  };

  return (
    <>
      {showConflictDialog && (
        <SyncConflictDialog
          localNodes={localNodes}
          cloudNodes={cloudNodes}
          onChooseLocal={handleChooseLocal}
          onChooseCloud={handleChooseCloud}
          onMerge={handleMerge}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
