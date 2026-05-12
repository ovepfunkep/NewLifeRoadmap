import { useEffect, useState } from 'react';
import { CloudAvailabilityNoticeModal } from './CloudAvailabilityNoticeModal';
import {
  subscribeCloudFirestoreHealth,
  type CloudFirestoreHealthEvent,
} from '../utils/cloudFirestoreHealth';

/** Подписка на глобальное состояние доступности Firestore → модалки один раз за инцидент. */
export function CloudFirestoreHealthModals() {
  const [variant, setVariant] = useState<CloudFirestoreHealthEvent | null>(null);

  useEffect(() => {
    return subscribeCloudFirestoreHealth((ev) => {
      setVariant(ev);
    });
  }, []);

  if (!variant) return null;

  return (
    <CloudAvailabilityNoticeModal variant={variant} onClose={() => setVariant(null)} />
  );
}
