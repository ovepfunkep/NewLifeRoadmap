import { useEffect } from 'react';
import { initDB } from '../db';
import { tryCreateWeeklyBackupIfDue, WEEKLY_BACKUP_CHANGED_EVENT } from '../utils/weeklyLocalBackup';

/** При загрузке и при смене настроек бэкапа: тихий weekly-снимок, если тумблер включён и прошла неделя. */
export function WeeklyBackupScheduler() {
  useEffect(() => {
    const run = () => {
      void (async () => {
        try {
          await initDB();
          await tryCreateWeeklyBackupIfDue();
        } catch {
          // без тоста
        }
      })();
    };
    run();
    window.addEventListener(WEEKLY_BACKUP_CHANGED_EVENT, run);
    return () => window.removeEventListener(WEEKLY_BACKUP_CHANGED_EVENT, run);
  }, []);
  return null;
}
