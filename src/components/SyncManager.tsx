import { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthChange } from '../firebase/auth';
import { loadAllNodesFromFirestore, hasDataInFirestore, syncAllNodesToFirestore } from '../firebase/sync';
import { getAllNodesFlat, clearAllNodes } from '../db';
import { SyncConflictDialog } from './SyncConflictDialog';
import { hasDifferences, compareNodes } from '../utils/syncCompare';
import { useToast } from '../hooks/useToast';
import { t } from '../i18n';
import { openDB } from 'idb';
import { User } from 'firebase/auth';
import { initSecurity } from '../utils/securityManager';

function log(...args: any[]) {
  console.log('[SyncManager]', ...args);
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

  // Автоматическая загрузка данных из облака и синхронизация (бидирекциональная)
  const loadCloudDataSilently = useCallback(async () => {
    // Предотвращаем повторную загрузку, если она уже выполняется
    if (silentLoadInProgressRef.current) {
      log('[loadCloudDataSilently] Already in progress, skipping');
      return;
    }

    try {
      silentLoadInProgressRef.current = true;
      log('[loadCloudDataSilently] Starting silent bidirectional sync');
      
      if (!navigator.onLine) {
        log('[loadCloudDataSilently] Device is offline, skipping');
        silentLoadInProgressRef.current = false;
        return;
      }
      
      const local = await getAllNodesFlat();
      
      let hasCloudData = false;
      try {
        hasCloudData = await hasDataInFirestore();
      } catch (error: any) {
        if (error?.code === 'unavailable' || error?.message?.includes('offline')) {
          silentLoadInProgressRef.current = false;
          return;
        }
        throw error;
      }
      
      if (!hasCloudData) {
        // Если в облаке пусто, а локально есть данные - выгружаем их (первичная выгрузка)
        if (local.length > 0) {
          log('[loadCloudDataSilently] Cloud is empty, uploading local nodes');
          await syncAllNodesToFirestore(local);
        }
        silentLoadInProgressRef.current = false;
        return;
      }
      
      const cloud = await loadAllNodesFromFirestore();
      if (cloud.length === 0) {
        silentLoadInProgressRef.current = false;
        return;
      }
      
      // Сравниваем ВСЕ узлы без фильтрации по достижимости
      const rawDiff = compareNodes(local, cloud);
      const hasAnyDiff = rawDiff.localOnly.length > 0 || rawDiff.cloudOnly.length > 0 || rawDiff.different.length > 0;
      
      if (!hasAnyDiff) {
        log('[loadCloudDataSilently] No differences found');
        silentLoadInProgressRef.current = false;
        return;
      }

      log('[loadCloudDataSilently] Differences found, performing silent LWW merge');
      
      const localMap = new Map(local.map(n => [n.id, n]));
      const cloudMap = new Map(cloud.map(n => [n.id, n]));
      const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);
      const mergedNodes: any[] = [];
      let hasChanges = false;
      
      for (const id of allIds) {
        const lNode = localMap.get(id);
        const cNode = cloudMap.get(id);
        
        if (!lNode) {
          log(`[loadCloudDataSilently] Node ${id} only in cloud, taking it`);
          mergedNodes.push({ ...cNode, children: [] });
          hasChanges = true;
        } else if (!cNode) {
          log(`[loadCloudDataSilently] Node ${id} only local, keeping it`);
          mergedNodes.push({ ...lNode, children: [] });
          hasChanges = true; // Нужно выгрузить в облако
        } else {
          const lTime = new Date(lNode.updatedAt || 0).getTime();
          const cTime = new Date(cNode.updatedAt || 0).getTime();
          
          if (cTime > lTime) {
            log(`[loadCloudDataSilently] Node ${id} cloud is newer (${cTime} > ${lTime}), updating local`);
            mergedNodes.push({ ...cNode, children: [] });
            hasChanges = true;
          } else if (lTime > cTime) {
            log(`[loadCloudDataSilently] Node ${id} local is newer (${lTime} > ${cTime}), will update cloud`);
            mergedNodes.push({ ...lNode, children: [] });
            hasChanges = true; 
          } else {
            mergedNodes.push({ ...lNode, children: [] });
          }
        }
      }
      
      if (hasChanges) {
        let db: Awaited<ReturnType<typeof openDB>> | null = null;
        try {
          db = await openDB('LifeRoadmapDB', 2);
          const tx = db.transaction('nodes', 'readwrite');
          for (const node of mergedNodes) {
            await tx.store.put(node);
          }
          await tx.done;
          
          // Синхронизируем результат обратно в облако
          await syncAllNodesToFirestore(mergedNodes);
          notifyDataUpdated();
          log('[loadCloudDataSilently] Silent merge complete and synced to cloud');
        } finally {
          if (db) await db.close();
        }
      }
      
      silentLoadInProgressRef.current = false;
    } catch (error: any) {
      log('[loadCloudDataSilently] Error:', error);
      silentLoadInProgressRef.current = false;
    }
  }, []);

  useEffect(() => {
    const handleActivate = async () => {
      if (document.hidden) return;
      const { getCurrentUser } = await import('../firebase/auth');
      const { getActiveSyncKey } = await import('../utils/securityManager');
      if (!getCurrentUser() || !getActiveSyncKey()) return;
      await loadCloudDataSilently();
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
  }, [loadCloudDataSilently]);

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
        const cloud = await loadAllNodesFromFirestore();
        
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
          await syncAllNodesToFirestore(mergedNodes);
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
        // Сохраняем пользователя сразу
        previousUserRef.current = user;

        // Инициализируем систему безопасности (проверяем кэш/конфиг)
        log('[onAuthChange] Initializing security for user', user.uid);
        try {
          const { initialized } = await initSecurity(user.uid);
          
          // Обновляем часовой пояс пользователя при каждом входе, если безопасность инициализирована
          if (initialized) {
            const { saveUserSecurityConfig } = await import('../firebase/security');
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            await saveUserSecurityConfig(user.uid, { timezone });
          }

          // Если по какой-то причине не инициализировано (например, закрыли вкладку после логина, но до выбора)
          // то можно было бы показать модал, но сейчас мы перенесли выбор в AuthAvatar.
          // Если initialized === false, значит выбор еще не сделан.
          if (!initialized) {
            log('[onAuthChange] Security not initialized, waiting for choice');
            isFirstAuthCheckRef.current = false;
            return;
          }
        } catch (err) {
          console.error('[onAuthChange] Security init failed', err);
          return;
        }

        // Определяем, это новый логин или пользователь уже был залогинен
        // Если это первый вызов и пользователь уже залогинен - это не новый логин
        // Если предыдущего пользователя не было (null) - это новый логин
        const isNewLogin = isFirstAuthCheckRef.current 
          ? false // При первой проверке пользователь уже был залогинен при загрузке страницы
          : previousUserRef.current === null; // Если предыдущего пользователя не было - это новый логин
        
        log(`[onAuthChange] User signed in, isNewLogin: ${isNewLogin}`);
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

    // Слушатель инициализации безопасности (вызывается после выбора в AuthAvatar)
    const handleSecurityInit = async (e: any) => {
      const { userId } = e.detail;
      log('[security:initialized] event received for user', userId);
      // Если это тот же пользователь, запускаем синхронизацию
      if (previousUserRef.current && previousUserRef.current.uid === userId) {
        await handleFirstSync(true); // Считаем это новым логином
      }
    };

    window.addEventListener('security:initialized', handleSecurityInit as EventListener);

    return () => {
      log('[useEffect] Cleaning up sync manager');
      unsubscribe();
      window.removeEventListener('security:initialized', handleSecurityInit as EventListener);
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
      await syncAllNodesToFirestore(mergedNodes);
      
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
