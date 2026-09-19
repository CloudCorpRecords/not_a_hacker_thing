import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getQueuedCaptures,
  updateCaptureStatus,
  updateEvidenceState,
  QueuedCapture,
  EvidenceUploadState,
} from '../lib/db';
import {
  submitCapture,
  requestEvidenceUploadUrl,
  completeEvidenceUpload,
} from '@workspace/api-client-react';

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
       const pendingItems = items.filter(isRetryableCapture);

      for (const item of pendingItems) {
        if (!item.id) continue;
        const metadataPending =
          item.status !== 'synced' &&
          (item.status === 'pending' ||
            item.status === 'syncing' ||
            (item.status === 'failed' && (item.errorType === undefined || item.errorType === 'network')));
        if (metadataPending) {
          await updateCaptureStatus(item.id, 'syncing');
        }
        setQueue(q => q.map(x => x.id === item.id ? { ...x, status: 'syncing' } : x));

        let metadataSucceeded = item.status === 'synced' || Boolean(item.serverCrewDayId);
        try {
          let serverCrewDayId = item.serverCrewDayId;
          if (metadataPending) {
            const result = await submitCapture(projectId, item.payload);
            serverCrewDayId = result.crewDayId;
            metadataSucceeded = true;
            await updateCaptureStatus(
              item.id,
              'synced',
              undefined,
              {
                serverCrewDayId,
                serverItemIds: result.items.map(productionItem => productionItem.id),
              },
            );
          }
          await syncEvidence(item, serverCrewDayId, projectId);
          await updateCaptureStatus(item.id, 'synced', undefined);
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
          // Production metadata and media have different retry state. Once the
          // capture exists on the server, retain that fact while showing the
          // evidence error on the individual media item.
          if (metadataSucceeded) {
            await updateCaptureStatus(item.id, 'synced', message);
          } else {
            await updateCaptureStatus(item.id, 'failed', message, { errorType });
          }
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

function isRetryableCapture(item: QueuedCapture) {
  const metadataRetryable =
    item.status === 'pending' ||
    item.status === 'syncing' ||
    (item.status === 'failed' && (item.errorType === undefined || item.errorType === 'network'));
  const evidenceRetryable = (item.evidence ?? []).some(
    evidence =>
      evidence.status === 'pending' ||
      evidence.status === 'uploading' ||
      (evidence.status === 'failed' && (evidence.errorType === undefined || evidence.errorType === 'network')),
  );
  return metadataRetryable || evidenceRetryable || (item.status === 'synced' && !item.evidence);
}

async function digestSha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function syncEvidence(item: QueuedCapture, serverCrewDayId: number | undefined, projectId: number) {
  if (!item.id || !serverCrewDayId) {
    throw new Error('Capture metadata has not returned a server crew-day identifier');
  }
  const media = [
    ...(item.photoBlobs ?? []).map((blob, index) => ({ blob, kind: 'photo' as const, index })),
    ...(item.audioBlobs ?? []).map((blob, index) => ({ blob, kind: 'audio' as const, index })),
  ];
  const states: EvidenceUploadState[] = media.map(({ kind, index }) => {
    const prior = item.evidence?.find(evidence => evidence.kind === kind && evidence.index === index);
    return prior ?? {
      externalId: `${item.externalId}:${kind}:${index}`,
      kind,
      index,
      status: 'pending',
    };
  });
  if (media.length === 0) {
    await updateEvidenceState(item.id, []);
    return;
  }
  await updateEvidenceState(item.id, states);

  for (let index = 0; index < media.length; index += 1) {
    const { blob, kind } = media[index];
    const state = states[index];
    if (state.status === 'completed') continue;
    state.status = 'uploading';
    state.error = undefined;
    state.errorType = undefined;
    await updateEvidenceState(item.id, [...states]);
    try {
      const contentType = blob.type || (kind === 'photo' ? 'image/jpeg' : 'audio/webm');
      const upload = await requestEvidenceUploadUrl(projectId, {
        externalId: state.externalId,
        captureExternalId: item.externalId,
        kind,
        contentType,
        byteSize: blob.size,
        sha256: await digestSha256(blob),
        capturedAt: item.payload.capturedAt,
      });
      state.evidenceId = upload.evidenceId;
      if (!upload.uploadRequired) {
        if (upload.status === 'ready' || upload.status === 'manual_review') {
          state.status = 'completed';
          await updateEvidenceState(item.id, [...states]);
          continue;
        }
        throw new Error(`Evidence is already ${upload.status}; retry after processing completes`);
      }
      if (!upload.uploadURL) {
        throw new Error('Evidence upload URL was not provided');
      }
      const response = await fetch(upload.uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
      });
      if (!response.ok) throw new Error(`Evidence upload failed (${response.status})`);
      const completed = await completeEvidenceUpload(projectId, upload.evidenceId, { actor: 'field-sync' });
      if (completed.status !== 'ready' && completed.status !== 'manual_review') {
        throw new Error(`Evidence was not finalized (status: ${completed.status})`);
      }
      state.status = 'completed';
      await updateEvidenceState(item.id, [...states]);
    } catch (error: unknown) {
      const apiError = error as { status?: number; data?: { error?: string } };
      state.status = 'failed';
      state.errorType =
        apiError.status === 409 ? 'conflict' :
        apiError.status === 400 || apiError.status === 422 ? 'validation' :
        'network';
      state.error = apiError.data?.error ?? (error instanceof Error ? error.message : 'Evidence upload failed');
      await updateEvidenceState(item.id, [...states], state.error);
      throw error;
    }
  }
}
