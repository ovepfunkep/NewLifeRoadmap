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
      log('Silent load already in progress, skipping');
      return;
    }

    // Проверяем, не была ли уже выполнена загрузка в этой сессии
    const sessionKey = 'syncManager_silentLoadDone';
    if (sessionStorage.getItem(sessionKey) === 'true') {
      log('Silent load already done in this session, skipping');
      return;
    }

    try {
      silentLoadInProgressRef.current = true;
      log('Loading cloud data silently (user already logged in)');
      
      // Сначала проверяем локальные данные
      const localNodes = await getAllNodes();
      log(`Loaded ${localNodes.length} local nodes`);
      
      // Проверяем наличие данных в облаке
      const hasCloudData = await hasDataInFirestore();
      if (!hasCloudData) {
        log('No cloud data, skipping silent load');
        sessionStorage.setItem(sessionKey, 'true');
        return;
      }
      
      const cloud = await loadAllNodesFromFirestore();
      log(`Loaded ${cloud.length} cloud nodes`);
      
      if (cloud.length === 0) {
        log('No cloud data to load');
        sessionStorage.setItem(sessionKey, 'true');
        return;
      }
      
      // Сравниваем данные перед загрузкой
      const diff = compareNodes(localNodes, cloud);
      const hasDiff = hasDifferences(localNodes, cloud);
      
      // Если данные совпадают, не загружаем и не перезагружаем
      if (!hasDiff) {
        log('Local and cloud data are identical, no need to reload');
        sessionStorage.setItem(sessionKey, 'true');
        return;
      }
      
      // Вычисляем хеш облачных данных для предотвращения повторной загрузки тех же данных
      const cloudDataHash = JSON.stringify(cloud.map(n => ({ id: n.id, updatedAt: n.updatedAt }))).slice(0, 100);
      if (lastSilentLoadHashRef.current === cloudDataHash) {
        log('Cloud data hash matches last load, skipping to prevent reload loop');
        sessionStorage.setItem(sessionKey, 'true');
        return;
      }
      
      log('Data differs, loading cloud data');
      
      // Тихо загружаем облачные данные
      let db: Awaited<ReturnType<typeof openDB>> | null = null;
      try {
        await clearAllNodes();
        db = await openDB('LifeRoadmapDB', 2);
        const tx = db.transaction('nodes', 'readwrite');
        
        for (const node of cloud) {
          await tx.store.put(node);
        }
        
        await tx.done;
        log(`Silently loaded ${cloud.length} nodes from cloud to local DB`);
        
        // Сохраняем хеш загруженных данных
        lastSilentLoadHashRef.current = cloudDataHash;
        
        // Помечаем, что загрузка выполнена в этой сессии
        sessionStorage.setItem(sessionKey, 'true');
        
        // Перезагружаем страницу для применения изменений
        (window as any).__isProgrammaticReload = true;
        window.location.reload();
      } catch (error) {
        log('Error silently loading cloud data:', error);
        console.error('Error silently loading cloud data:', error);
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
    } catch (error) {
      log('Error in silent cloud load:', error);
      console.error('Error in silent cloud load:', error);
      silentLoadInProgressRef.current = false;
    }
  }, []);

  const handleFirstSync = useCallback(async (isNewLogin: boolean) => {
    try {
      // Если пользователь уже был залогинен (не новый логин), просто загружаем данные из облака
      if (!isNewLogin) {
        log('User already logged in, loading cloud data silently');
        await loadCloudDataSilently();
        return;
      }
      
      log('Starting first sync check (new login)');
      
      // Показываем тост о проверке синхронизации только при новом логине
      const checkToastId = showToast(t('toast.syncChecking'), undefined, {
        isLoading: true,
        persistent: true
      });
      checkToastIdRef.current = checkToastId;
      
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
        const diff = compareNodes(localSnapshot, cloud);
        
        // Если в облаке данных больше и локальных изменений нет, тихо загружаем облачные данные
        if (diff.cloudOnly.length > 0 && diff.localOnly.length === 0 && diff.different.length === 0) {
          log('Cloud has more data and no local changes, silently loading cloud data');
          // Закрываем тост проверки
          if (checkToastIdRef.current) {
            removeToast(checkToastIdRef.current);
            checkToastIdRef.current = null;
          }
          
          // Тихо загружаем облачные данные
          let db: Awaited<ReturnType<typeof openDB>> | null = null;
          try {
            await clearAllNodes();
            db = await openDB('LifeRoadmapDB', 2);
            const tx = db.transaction('nodes', 'readwrite');
            
            for (const node of cloud) {
              await tx.store.put(node);
            }
            
            await tx.done;
            log(`Silently loaded ${cloud.length} nodes from cloud to local DB`);
            // Перезагружаем страницу для применения изменений
            (window as any).__isProgrammaticReload = true;
            window.location.reload();
          } catch (error) {
            log('Error silently loading cloud data:', error);
            console.error('Error silently loading cloud data:', error);
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
              const currentDiff = compareNodes(currentLocal, currentCloud);
              
              // Проверяем, можно ли тихо загрузить облачные данные
              if (currentDiff.cloudOnly.length > 0 && currentDiff.localOnly.length === 0 && currentDiff.different.length === 0) {
                log('After delay: cloud has more data and no local changes, silently loading');
                // Тихо загружаем облачные данные
                let db: Awaited<ReturnType<typeof openDB>> | null = null;
                try {
                  await clearAllNodes();
                  db = await openDB('LifeRoadmapDB', 2);
                  const tx = db.transaction('nodes', 'readwrite');
                  
                  for (const node of currentCloud) {
                    await tx.store.put(node);
                  }
                  
                  await tx.done;
                  log(`Silently loaded ${currentCloud.length} nodes from cloud to local DB`);
                  (window as any).__isProgrammaticReload = true;
                  window.location.reload();
                } catch (error) {
                  log('Error silently loading cloud data:', error);
                  console.error('Error silently loading cloud data:', error);
                } finally {
                  if (db) {
                    try {
                      await db.close();
                    } catch (closeError) {
                      console.error('Error closing DB:', closeError);
                    }
                  }
                }
                if (checkToastIdRef.current) {
                  removeToast(checkToastIdRef.current);
                  checkToastIdRef.current = null;
                }
              } else if (hasDifferences(currentLocal, currentCloud)) {
                log('Differences still exist after delay, showing conflict dialog');
                setLocalNodes(currentLocal);
                setCloudNodes(currentCloud);
                setShowConflictDialog(true);
                // Закрываем тост проверки при показе диалога конфликта
                if (checkToastIdRef.current) {
                  removeToast(checkToastIdRef.current);
                  checkToastIdRef.current = null;
                }
              } else {
                log('Differences resolved during delay, no conflict');
                // Закрываем тост проверки, если конфликтов нет
                if (checkToastIdRef.current) {
                  removeToast(checkToastIdRef.current);
                  checkToastIdRef.current = null;
                }
              }
              isInitialLoadRef.current = false;
            }, 3000);
          } else {
            log('Differences detected, showing conflict dialog');
            setLocalNodes(localSnapshot);
            setCloudNodes(cloud);
            setShowConflictDialog(true);
            // Закрываем тост проверки при показе диалога конфликта
            if (checkToastIdRef.current) {
              removeToast(checkToastIdRef.current);
              checkToastIdRef.current = null;
            }
          }
        } else {
          log('No differences, data is in sync');
          // Закрываем тост проверки, если конфликтов нет
          if (checkToastIdRef.current) {
            removeToast(checkToastIdRef.current);
            checkToastIdRef.current = null;
          }
          isInitialLoadRef.current = false;
        }
      } else {
        log('No cloud data, skipping conflict check');
        // Закрываем тост проверки, если данных в облаке нет
        if (checkToastIdRef.current) {
          removeToast(checkToastIdRef.current);
          checkToastIdRef.current = null;
        }
        isInitialLoadRef.current = false;
      }
    } catch (error) {
      log('Error in first sync:', error);
      console.error('Sync error:', error);
      // Закрываем тост проверки при ошибке
      if (checkToastIdRef.current) {
        removeToast(checkToastIdRef.current);
        checkToastIdRef.current = null;
      }
      isInitialLoadRef.current = false;
    }
  }, [showToast, removeToast, loadCloudDataSilently]);

  useEffect(() => {
    log('Initializing sync manager');
    
    // Очищаем флаг сессии при монтировании компонента (новая сессия браузера)
    // Но не очищаем при программной перезагрузке страницы
    if (!(window as any).__isProgrammaticReload) {
      sessionStorage.removeItem('syncManager_silentLoadDone');
      lastSilentLoadHashRef.current = null;
    }
    
    const unsubscribe = onAuthChange(async (user) => {
      if (user) {
        // Определяем, это новый логин или пользователь уже был залогинен
        // Если это первый вызов и пользователь уже залогинен - это не новый логин
        // Если предыдущего пользователя не было (null) - это новый логин
        const isNewLogin = isFirstAuthCheckRef.current 
          ? false // При первой проверке пользователь уже был залогинен при загрузке страницы
          : previousUserRef.current === null; // Если предыдущего пользователя не было - это новый логин
        
        log(`User signed in, isNewLogin: ${isNewLogin}`);
        previousUserRef.current = user;
        isFirstAuthCheckRef.current = false;
        
        await handleFirstSync(isNewLogin);
      } else {
        log('User signed out or not logged in');
        // При первом вызове, если пользователь не залогинен, устанавливаем previousUserRef в null
        if (isFirstAuthCheckRef.current) {
          previousUserRef.current = null;
          isFirstAuthCheckRef.current = false;
        } else {
          previousUserRef.current = null;
        }
        // Сбрасываем флаги при выходе
        silentLoadInProgressRef.current = false;
        sessionStorage.removeItem('syncManager_silentLoadDone');
        lastSilentLoadHashRef.current = null;
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

