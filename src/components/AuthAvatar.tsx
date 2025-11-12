import { useState, useEffect } from 'react';
import { FiUser, FiLogOut } from 'react-icons/fi';
import { signInWithGoogle, signOutUser, getCurrentUser, onAuthChange } from '../firebase/auth';
import { Tooltip } from './Tooltip';
import { t } from '../i18n';

const isDev = import.meta.env.DEV;

function log(message: string, ...args: any[]) {
  if (isDev) {
    console.log(`[Auth] ${message}`, ...args);
  }
}

export function AuthAvatar() {
  const [user, setUser] = useState<{ email: string; uid: string; photoURL?: string | null } | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    log('Initializing auth state');
    const currentUser = getCurrentUser();
    if (currentUser) {
      log('User found:', currentUser.email);
      setUser({
        email: currentUser.email || '',
        uid: currentUser.uid,
        photoURL: currentUser.photoURL,
      });
    } else {
      setUser(null);
    }

    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        log('Auth state changed: signed in', firebaseUser.email);
        setUser({
          email: firebaseUser.email || '',
          uid: firebaseUser.uid,
          photoURL: firebaseUser.photoURL,
        });
      } else {
        log('Auth state changed: signed out');
        setUser(null);
      }
      // Сбрасываем состояние hover при изменении пользователя
      setIsHovered(false);
    });

    return () => {
      log('Cleaning up auth listener');
      unsubscribe();
    };
  }, []);

  const handleSignIn = async () => {
    try {
      log('Sign in initiated');
      await signInWithGoogle();
      log('Sign in successful');
    } catch (error) {
      log('Sign in error:', error);
      console.error('Sign in error:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      log('Sign out initiated');
      await signOutUser();
      log('Sign out successful');
    } catch (error) {
      log('Sign out error:', error);
      console.error('Sign out error:', error);
    }
  };

  if (user) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Tooltip text={user.email} position="right">
          <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-gray-300 dark:border-gray-600 cursor-pointer transition-all hover:border-accent">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.email}
                className="w-full h-full object-cover"
                onLoad={() => {
                  log('Google avatar loaded successfully:', user.photoURL);
                }}
                onError={(e) => {
                  log('Error loading Google avatar:', user.photoURL, e);
                  console.error('[Auth] Failed to load Google avatar:', user.photoURL);
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-700">
                <FiUser className="w-6 h-6 text-gray-600 dark:text-gray-400" />
              </div>
            )}
            {isHovered && (
              <Tooltip text={t('tooltip.signOut')}>
                <button
                  onClick={handleSignOut}
                  className="absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity z-10"
                  style={{ transform: 'translateY(-10px)' }}
                >
                  <FiLogOut className="w-3 h-3 text-white" />
                </button>
              </Tooltip>
            )}
          </div>
        </Tooltip>
      </div>
    );
  }

  return (
    <Tooltip text={t('tooltip.signIn')} position="right">
      <button
        onClick={handleSignIn}
        className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-gray-300 dark:border-gray-600 hover:border-accent transition-all bg-gray-100 dark:bg-gray-800"
        style={{ color: 'var(--accent)' }}
      >
        <FiUser className="w-6 h-6" />
      </button>
    </Tooltip>
  );
}



