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
import { initSecurity } from '../utils/securityManager';

function log(..._args: any[]) {
  // Debug logging disabled
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
      
      // Исключаем зашифрованные данные из сравнения, если дешифровка не удалась
      const filteredCloud = cloud.filter(node => !node.isEncrypted || (node.isEncrypted && node.title));
      
      const rawDiff = compareNodes(localNodes, filteredCloud);
      const hasAnyDiff = rawDiff.localOnly.length > 0 || rawDiff.cloudOnly.length > 0 || rawDiff.different.length > 0;
      
      // Если данные полностью идентичны, ничего не делаем
      if (!hasAnyDiff || filteredCloud.length === 0) {
        log('[loadCloudDataSilently] No differences found, skipping');
        silentLoadInProgressRef.current = false;
        return;
      }
      
      log('[loadCloudDataSilently] Merging cloud data with local DB...');
      
      // Сливаем облачные данные с локальными на основе даты обновления
      let db: Awaited<ReturnType<typeof openDB>> | null = null;
      try {
        log('[loadCloudDataSilently] Opening DB...');
        db = await openDB('LifeRoadmapDB', 2);
        
        // Получаем все локальные узлы для сравнения
        const localNodes = await getAllNodes();
        const localMap = new Map(localNodes.map(n => [n.id, n]));
        
        const tx = db.transaction('nodes', 'readwrite');
        let updateCount = 0;
        let skipCount = 0;
        let newCount = 0;
        
        log(`[loadCloudDataSilently] Processing ${filteredCloud.length} nodes from cloud...`);
        
        for (const cloudNode of filteredCloud) {
          const localNode = localMap.get(cloudNode.id);
          
          if (!localNode) {
            // Нового узла нет локально - сохраняем (без детей!)
            const { children, ...nodeToSave } = cloudNode;
            await tx.store.put({ ...nodeToSave, children: [] } as any);
            newCount++;
          } else {
            // Узел есть и там и там - сравниваем даты
            const cloudUpdated = cloudNode.updatedAt ? new Date(cloudNode.updatedAt).getTime() : 0;
            const localUpdated = localNode.updatedAt ? new Date(localNode.updatedAt).getTime() : 0;
            
            if (cloudUpdated > localUpdated) {
              // Облачный узел свежее - обновляем локально (без детей!)
              const { children, ...nodeToSave } = cloudNode;
              await tx.store.put({ ...nodeToSave, children: [] } as any);
              updateCount++;
            } else {
              // Локальный узел свежее или такой же - пропускаем
              skipCount++;
            }
          }
        }
        
        await tx.done;
        log(`[loadCloudDataSilently] Sync complete: ${newCount} new, ${updateCount} updated, ${skipCount} skipped (local was fresher)`);
        
        // Уведомляем компоненты об обновлении данных
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
        
        // ВАЖНО: Перед сравнением строим карту только достижимых узлов из обоих источников.
        // Это предотвращает ложные конфликты из-за "осиротевших" узлов в БД.
        const buildReachableNodes = (flatNodes: any[]) => {
          const map = new Map<string, any>();
          flatNodes.forEach(n => map.set(n.id, { ...n, children: [] }));
          
          const reachable = new Set<string>();
          const traverse = (id: string) => {
            if (reachable.has(id)) return;
            reachable.add(id);
            const node = map.get(id);
            if (!node) return;
            flatNodes.filter(n => n.parentId === id).forEach(child => traverse(child.id));
          };
          
          if (map.has('root-node')) traverse('root-node');
          // Также считаем "корневыми" все узлы без parentId (на всякий случай)
          flatNodes.filter(n => !n.parentId).forEach(n => traverse(n.id));
          
          return flatNodes.filter(n => reachable.has(n.id));
        };

        const reachableLocal = buildReachableNodes(localSnapshot);
        const reachableCloud = buildReachableNodes(cloud);
        
        log(`[handleFirstSync] Reachable nodes: local=${reachableLocal.length}/${localSnapshot.length}, cloud=${reachableCloud.length}/${cloud.length}`);

        // Сравниваем только достижимые узлы
        log('[handleFirstSync] Comparing reachable local and cloud data...');
        const hasRealDiff = hasDifferences(reachableLocal, reachableCloud);
        
        // 1. Если реальных различий нет - ничего не показываем
        if (!hasRealDiff) {
          log('[handleFirstSync] No significant differences found, checking for technical updates...');
          
          const rawDiff = compareNodes(reachableLocal, reachableCloud);
          const hasTechnicalDiff = rawDiff.localOnly.length > 0 || rawDiff.cloudOnly.length > 0 || rawDiff.different.length > 0;
          
          if (hasTechnicalDiff) {
            log('[handleFirstSync] Performing silent merge for technical updates');
            // ... (мерж ниже)
          } else {
            log('[handleFirstSync] Data is perfectly in sync');
            if (checkToastIdRef.current) {
              removeToast(checkToastIdRef.current);
              checkToastIdRef.current = null;
            }
            isInitialLoadRef.current = false;
            return;
          }
        } else {
          // 2. Есть реальные различия - показываем диалог
          log('[handleFirstSync] Real differences found, showing conflict dialog');
          setLocalNodes(reachableLocal);
          setCloudNodes(reachableCloud);
          setShowConflictDialog(true);
          
          if (checkToastIdRef.current) {
            removeToast(checkToastIdRef.current);
            checkToastIdRef.current = null;
          }
          isInitialLoadRef.current = false;
          return;
        }

        // 3. Выполняем тихий мерж (LWW)
        const localMap = new Map(reachableLocal.map(n => [n.id, n]));
        const cloudMap = new Map(reachableCloud.map(n => [n.id, n]));
        const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);
        const mergedNodes: any[] = [];
        
        for (const id of allIds) {
          const local = localMap.get(id);
          const cloudNode = cloudMap.get(id);
          if (!local) {
            const { children, ...rest } = cloudNode;
            mergedNodes.push({ ...rest, children: [] });
          }
          else if (!cloudNode) {
            const { children, ...rest } = local;
            mergedNodes.push({ ...rest, children: [] });
          }
          else {
            const localTime = new Date(local.updatedAt || 0).getTime();
            const cloudTime = new Date(cloudNode.updatedAt || 0).getTime();
            const winner = cloudTime > localTime ? cloudNode : local;
            const { children, ...rest } = winner;
            mergedNodes.push({ ...rest, children: [] });
          }
        }

        let db: Awaited<ReturnType<typeof openDB>> | null = null;
        try {
          await clearAllNodes();
          db = await openDB('LifeRoadmapDB', 2);
          const tx = db.transaction('nodes', 'readwrite');
          for (const node of mergedNodes) await tx.store.put(node);
          await tx.done;
          await syncAllNodesToFirestore(mergedNodes);
          notifyDataUpdated();
        } catch (error) {
          console.error('[handleFirstSync] Silent merge error:', error);
        } finally {
          if (db) await db.close();
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
