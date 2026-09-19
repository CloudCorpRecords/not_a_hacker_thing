import { useState, useEffect, useCallback, useRef } from 'react';
import { getQueuedCaptures, updateCaptureStatus, QueuedCapture } from '../lib/db';
import { submitCapture } from '@workspace/api-client-react';

export function useCaptureQueue(projectId: number) {
  const [queue, setQueue] = useState<QueuedCapture[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncLock = useRef(false);

  const loadQueue = useCallback(async () => {
    try {
      const items = await getQueuedCaptures(projectId);
      setQueue(items);
    } catch (e) {
      console.error("Failed to load queue", e);
    }
  }, [projectId]);

  const syncQueue = useCallback(async () => {
    if (syncLock.current || !navigator.onLine) return;
    syncLock.current = true;
    setIsSyncing(true);

    try {
      const items = await getQueuedCaptures(projectId);
      const pendingItems = items.filter(i =>
        i.status === 'pending' ||
        i.status === 'syncing' ||
        (i.status === 'failed' && (i.errorType === undefined || i.errorType === 'network'))
      );

      for (const item of pendingItems) {
        if (!item.id) continue;
        await updateCaptureStatus(item.id, 'syncing');
        setQueue(q => q.map(x => x.id === item.id ? { ...x, status: 'syncing' } : x));

        try {
          const result = await submitCapture(projectId, item.payload);
          await updateCaptureStatus(
            item.id,
            'synced',
            undefined,
            { serverItemIds: result.items.map(productionItem => productionItem.id) },
          );
        } catch (error: unknown) {
          console.error("Sync error for item", item.externalId, error);
          const apiError = error as { status?: number; data?: { error?: string }; message?: string };
          const status = apiError.status;
          const errorType =
            status === 409 ? 'conflict' :
            status === 400 || status === 422 ? 'validation' :
            'network';
          const message =
            apiError.data?.error ??
            (errorType === 'network'
              ? 'No connection. This capture will retry when signal returns.'
              : apiError.message || 'Capture could not be synced.');
          await updateCaptureStatus(item.id, 'failed', message, { errorType });
        }
      }
    } finally {
      await loadQueue();
      setIsSyncing(false);
      syncLock.current = false;
    }
  }, [projectId, loadQueue]);

  useEffect(() => {
    loadQueue();
    // Start initial sync if online
    if (navigator.onLine) {
      syncQueue();
    }
    const handleOnline = () => {
      syncQueue();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [loadQueue, syncQueue]);

  return { queue, isSyncing, syncQueue, loadQueue };
}
