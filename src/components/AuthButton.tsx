import { useState, useEffect } from 'react';
import { FiUser, FiLogIn, FiLogOut } from 'react-icons/fi';
import { signInWithGoogle, signOutUser, getCurrentUser, onAuthChange } from '../firebase/auth';
import { syncAllNodesToFirestore, loadAllNodesFromFirestore, hasDataInFirestore } from '../firebase/sync';
import { saveNode, getAllNodes } from '../db';
import { useToast } from '../hooks/useToast';
import { t } from '../i18n';
import { Tooltip } from './Tooltip';

export function AuthButton() {
  const [user, setUser] = useState<{ email: string; uid: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    // Проверяем текущего пользователя при загрузке
    const currentUser = getCurrentUser();
    if (currentUser) {
      setUser({ email: currentUser.email || '', uid: currentUser.uid });
    }

    // Подписываемся на изменения авторизации
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        setUser({ email: firebaseUser.email || '', uid: firebaseUser.uid });
        // При первом входе синхронизируем данные
        await handleFirstSync();
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleFirstSync = async () => {
    try {
      setSyncing(true);
      const hasCloudData = await hasDataInFirestore();
      
      if (hasCloudData) {
        // Загружаем данные из облака
        const cloudNodes = await loadAllNodesFromFirestore();
        if (cloudNodes.length > 0) {
          // Сохраняем все узлы в IndexedDB (сохраняем только корневые, дети сохранятся автоматически)
          const rootNodes = cloudNodes.filter(node => !node.parentId);
          for (const node of rootNodes) {
            await saveNode(node);
          }
          showToast(t('toast.syncSuccess'));
        }
      } else {
        // Загружаем локальные данные в облако
        const localNodes = await getAllNodes();
        await syncAllNodesToFirestore(localNodes);
        showToast(t('toast.syncSuccess'));
      }
    } catch (error) {
      console.error('Sync error:', error);
      showToast(t('toast.syncError'));
    } finally {
      setSyncing(false);
    }
  };

  const handleSignIn = async () => {
    try {
      setSyncing(true);
      await signInWithGoogle();
      // handleFirstSync будет вызван автоматически через onAuthChange
    } catch (error) {
      console.error('Sign in error:', error);
      showToast(t('toast.syncError'));
      setSyncing(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      showToast(t('toast.syncSuccess'));
    } catch (error) {
      console.error('Sign out error:', error);
      showToast(t('toast.syncError'));
    }
  };

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <Tooltip text={`${t('sync.signedInAs')} ${user.email}`}>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
            <FiUser className="w-4 h-4" />
            <span className="max-w-[150px] truncate">{user.email}</span>
            {syncing && <span className="text-xs">({t('sync.syncing')})</span>}
          </div>
        </Tooltip>
        <Tooltip text={t('sync.signOut')}>
          <button
            onClick={handleSignOut}
            disabled={syncing}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
          >
            <FiLogOut className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <Tooltip text={t('sync.signIn')}>
      <button
        onClick={handleSignIn}
        disabled={syncing}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
      >
        <FiLogIn className="w-4 h-4" />
        <span>{t('sync.signIn')}</span>
      </button>
    </Tooltip>
  );
}

