import { useEffect, useState, useMemo, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetFieldContext, useListFieldHistory, useListProposals, useListConfirmedFacts, useGetProgressSummary, FieldContext, CaptureInput, ProductionItem, CaptureItemInput } from '@workspace/api-client-react';
import { ChevronLeft, WifiOff, CloudUpload, Camera, Mic, MapPin, Check, Plus, Trash2, Loader2, ListChecks, History, AlertTriangle, StopCircle } from 'lucide-react';
import { useCaptureQueue } from '@/hooks/use-capture-queue';
import { addCaptureToQueue, getCaptureDraft, putCaptureDraft, QueuedCapture } from '@/lib/db';

// Simple random ID generator since we might not have uuid
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function isRetryableCapture(capture: QueuedCapture) {
  return (
    capture.status === 'pending' ||
    capture.status === 'syncing' ||
    (capture.status === 'failed' && (capture.errorType === undefined || capture.errorType === 'network'))
  );
}

export function FieldCaptureApp() {
  const params = useParams();
  const projectId = Number(params.id);
  const [, setLocation] = useLocation();

  // Queries
  const { data: remoteContext, isLoading: isLoadingContext } = useGetFieldContext(projectId);
  
  // Local state for context caching
  const [context, setContext] = useState<FieldContext | null>(null);

  useEffect(() => {
    if (remoteContext) {
      setContext(remoteContext);
      localStorage.setItem(`fiberops_context_${projectId}`, JSON.stringify(remoteContext));
    } else if (!context) {
      const cached = localStorage.getItem(`fiberops_context_${projectId}`);
      if (cached) {
        setContext(JSON.parse(cached));
      }
    }
  }, [remoteContext, projectId, context]);

  // Queue
  const { queue, isSyncing, syncQueue, loadQueue } = useCaptureQueue(projectId);

  // Tabs
  const [activeTab, setActiveTab] = useState<'capture' | 'queue' | 'history'>('capture');

  // Network state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Shared context state for history filtering
  const [currentCrewId, setCurrentCrewId] = useState<number>(() => {
    const cached = localStorage.getItem('fiberops_last_crew');
    return cached ? Number(cached) : 0;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isLoadingContext && !context) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!context) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background p-6 text-center">
        <div className="max-w-md">
          <AlertTriangle className="mx-auto text-destructive mb-4" size={48} />
          <h2 className="text-xl font-serif mb-2">Context Not Available</h2>
          <p className="text-muted-foreground mb-6">You are offline and haven't loaded this project yet. Please connect to the internet.</p>
          <button onClick={() => setLocation('/')} className="bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium">Return Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Header */}
      <header className="flex-none bg-sidebar border-b border-border/60 p-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setLocation(`/projects/${projectId}`)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors active:scale-95"
            data-testid="button-back-to-project"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="font-serif text-lg leading-tight line-clamp-1">{context.project.name}</h1>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Field Capture</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isOnline ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-destructive/10 text-destructive rounded-full text-xs font-medium border border-destructive/20" data-testid="status-offline">
              <WifiOff size={14} /> Offline
            </div>
          ) : (
            <button 
              onClick={syncQueue}
              disabled={isSyncing || !queue.some(isRetryableCapture)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium border border-primary/20 disabled:opacity-50 active:scale-95 transition-transform"
              data-testid="button-sync"
            >
              {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
              {queue.filter(q => q.status !== 'synced').length} Pending
            </button>
          )}
        </div>
      </header>

      {/* Main scrollable area */}
      <main className="flex-1 overflow-y-auto bg-card/30">
        {activeTab === 'capture' && (
          <CaptureForm 
            context={context} 
            onCaptureSaved={() => {
              loadQueue();
              if (navigator.onLine) {
                syncQueue();
              }
            }}
             onCrewChanged={setCurrentCrewId}
          />
        )}
        {activeTab === 'queue' && (
          <QueueView queue={queue} isSyncing={isSyncing} onSync={syncQueue} />
        )}
        {activeTab === 'history' && (
           <HistoryView
             projectId={projectId}
             currentCrewId={currentCrewId || (context.crews[0]?.id || 0)}
             context={context}
           />
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="flex-none bg-sidebar border-t border-border/60 pb-safe">
        <div className="flex">
          <button 
            onClick={() => setActiveTab('capture')}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 ${activeTab === 'capture' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid="tab-capture"
          >
            <Camera size={20} className={activeTab === 'capture' ? 'fill-primary/20' : ''} />
            <span className="text-[10px] font-medium uppercase tracking-wide">Capture</span>
          </button>
          <button 
            onClick={() => setActiveTab('queue')}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 relative ${activeTab === 'queue' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid="tab-queue"
          >
            <ListChecks size={20} />
            <span className="text-[10px] font-medium uppercase tracking-wide">Queue</span>
             {queue.some(q => q.status !== 'synced') && (
              <span className="absolute top-2 right-[calc(50%-16px)] w-2.5 h-2.5 bg-destructive rounded-full border-2 border-sidebar"></span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 ${activeTab === 'history' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid="tab-history"
          >
            <History size={20} />
            <span className="text-[10px] font-medium uppercase tracking-wide">History</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

// Below are the sub-components which we can pull out if needed, but keeping them here for cohesion and speed.
// Let's implement them fully.

function CaptureForm({ context, onCaptureSaved, onCrewChanged }: { context: FieldContext, onCaptureSaved: () => void, onCrewChanged: (crewId: number) => void }) {
  // Persistence for choices
  const [siteId, setSiteId] = useState<number>(() => {
    const cached = localStorage.getItem('fiberops_last_site');
    return cached ? Number(cached) : (context.sites[0]?.id || 0);
  });
  
  const [crewId, setCrewId] = useState<number>(() => {
    const cached = localStorage.getItem('fiberops_last_crew');
    const initialCrew = cached ? Number(cached) : (context.crews[0]?.id || 0);
    return initialCrew;
  });

  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Persist selections
  useEffect(() => {
    if (siteId) localStorage.setItem('fiberops_last_site', siteId.toString());
  }, [siteId]);
  
  useEffect(() => {
    if (crewId) {
      localStorage.setItem('fiberops_last_crew', crewId.toString());
      onCrewChanged(crewId);
    }
  }, [crewId, onCrewChanged]);

  const availableWorkTypes = useMemo(() => {
    const crew = context.crews.find(candidate => candidate.id === crewId);
    return context.workTypes.filter(workType => {
      const isCertified = crew?.certifiedWorkTypeIds?.includes(workType.id) ?? false;
      const isPlanned = context.plans.some(
        plan => plan.siteId === siteId && plan.workTypeId === workType.id,
      );
      return isCertified && isPlanned;
    });
  }, [context.crews, context.plans, context.workTypes, crewId, siteId]);

  // Capture Items
  const [items, setItems] = useState<Array<{ workTypeId: number, quantity: number, note: string }>>([
    { workTypeId: context.workTypes[0]?.id || 0, quantity: 1, note: '' }
  ]);

  useEffect(() => {
    const fallbackWorkTypeId = availableWorkTypes[0]?.id;
    if (!fallbackWorkTypeId) return;
    setItems(currentItems =>
      currentItems.map(item =>
        availableWorkTypes.some(workType => workType.id === item.workTypeId)
          ? item
          : { ...item, workTypeId: fallbackWorkTypeId },
      ),
    );
  }, [availableWorkTypes]);

  // Media (stubbed as state for blobs)
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoBlob(file);
      setPhotoUrl(URL.createObjectURL(file));
    }
  };

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [audioUrl, photoUrl]);

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        mediaStreamRef.current = null;
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          setAudioBlob(blob);
          setAudioUrl(URL.createObjectURL(blob));
        };
        recorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone permission denied or error", err);
      }
    }
  };

  const removeAudio = () => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  };

  // Location state
  const [location, setLocation] = useState<{ latitude: number, longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'prompt' | 'loading' | 'granted' | 'denied'>('prompt');
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    getCaptureDraft(context.project.id)
      .then(draft => {
        if (!active || !draft) return;
        setSiteId(draft.siteId);
        setCrewId(draft.crewId);
        setDate(draft.workDate);
        setItems(draft.items);
        setPhotoBlob(draft.photoBlob);
        setPhotoUrl(draft.photoBlob ? URL.createObjectURL(draft.photoBlob) : null);
        setAudioBlob(draft.audioBlob);
        setAudioUrl(draft.audioBlob ? URL.createObjectURL(draft.audioBlob) : null);
        setLocation(draft.location);
        setLocationStatus(draft.location ? 'granted' : 'prompt');
      })
      .catch(error => console.error('Failed to restore field draft', error))
      .finally(() => {
        if (active) setDraftLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [context.project.id]);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => {
      putCaptureDraft({
        projectId: context.project.id,
        siteId,
        crewId,
        workDate: date,
        items,
        photoBlob,
        audioBlob,
        location,
        updatedAt: Date.now(),
      }).catch(error => console.error('Failed to save field draft', error));
    }, 100);
    return () => window.clearTimeout(timer);
  }, [
    audioBlob,
    context.project.id,
    crewId,
    date,
    draftLoaded,
    items,
    location,
    photoBlob,
    siteId,
  ]);

  const captureLocation = () => {
    setLocationStatus('loading');
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocationStatus('granted');
      },
      (err) => {
        console.error(err);
        setLocationStatus('denied');
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 5_000 },
    );
  };

  // Form errors
  const [formError, setFormError] = useState<string | null>(null);

  const handleAddItem = () => {
    setItems([...items, { workTypeId: availableWorkTypes[0]?.id || 0, quantity: 1, note: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, field: 'workTypeId' | 'quantity' | 'note', value: string | number) => {
    const newItems = [...items];
    (newItems[index] as Record<string, string | number>)[field] = value;
    setItems(newItems);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!siteId || !crewId || items.length === 0 || !photoBlob) {
      setFormError("Missing required fields (site, crew, at least one item, and photo).");
      return;
    }
    if (availableWorkTypes.length === 0) {
      setFormError("This crew has no planned, certified work at the selected site.");
      return;
    }

    // Check quantity valid
    if (items.some(i => i.quantity <= 0)) {
      setFormError("Quantities must be greater than 0.");
      return;
    }

    const payload: CaptureInput = {
      externalId: generateId(),
      siteId,
      crewId,
      workDate: date,
      capturedAt: new Date().toISOString(),
      ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}),
      items: items.map(item => ({
        externalId: generateId(),
        workTypeId: item.workTypeId,
        quantity: Number(item.quantity),
        unit: context.workTypes.find(w => w.id === item.workTypeId)?.unit || 'each',
        note: item.note
      }))
    };

    await addCaptureToQueue({
      projectId: context.project.id,
      externalId: payload.externalId,
      payload,
      photoBlobs: [photoBlob],
      audioBlobs: audioBlob ? [audioBlob] : [],
      status: 'pending',
      createdAt: Date.now()
    });

    // Reset form
    setItems([{ workTypeId: availableWorkTypes[0]?.id || 0, quantity: 1, note: '' }]);
    setPhotoBlob(null);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    
    // Animate or notify success
    onCaptureSaved();
  };

  return (
    <div className="p-4 space-y-6 pb-20">
      {/* Context Selection */}
      <section className="bg-card border border-border/60 rounded-xl p-4 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Site</label>
          <select 
            value={siteId} 
            onChange={e => setSiteId(Number(e.target.value))}
            className="w-full bg-input/50 border border-border rounded-lg p-3 text-base focus:ring-2 focus:ring-primary focus:outline-none"
            data-testid="select-site"
          >
            {context.sites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Crew</label>
            <select 
              value={crewId} 
              onChange={e => setCrewId(Number(e.target.value))}
              className="w-full bg-input/50 border border-border rounded-lg p-3 text-base focus:ring-2 focus:ring-primary focus:outline-none"
              data-testid="select-crew"
            >
              {context.crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Date</label>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)}
              className="w-full bg-input/50 border border-border rounded-lg p-3 text-base focus:ring-2 focus:ring-primary focus:outline-none"
              data-testid="input-date"
            />
          </div>
        </div>
      </section>

      {/* Production Items */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg">Production Details</h2>
          <button 
            onClick={handleAddItem}
            className="text-primary font-medium text-sm flex items-center gap-1 active:scale-95"
            data-testid="button-add-item"
          >
            <Plus size={16} /> Add Item
          </button>
        </div>

        {items.map((item, idx) => {
          const wType = context.workTypes.find(w => w.id === item.workTypeId);
          return (
            <div key={idx} className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm relative group">
              {items.length > 1 && (
                <button 
                  onClick={() => handleRemoveItem(idx)}
                  className="absolute top-3 right-3 text-muted-foreground hover:text-destructive active:scale-95 p-1 z-10"
                  data-testid={`button-remove-item-${idx}`}
                >
                  <Trash2 size={18} />
                </button>
              )}
              <div className="p-4 border-b border-border/40 bg-muted/10 pr-12">
                <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Work Type</label>
                <select 
                  value={item.workTypeId} 
                  onChange={e => handleUpdateItem(idx, 'workTypeId', Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-lg p-3 text-base focus:ring-2 focus:ring-primary focus:outline-none"
                  data-testid={`select-work-type-${idx}`}
                >
                   {availableWorkTypes.map(w => (
                     <option key={w.id} value={w.id}>{w.name} ({w.unit})</option>
                   ))}
                </select>
              </div>
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Quantity</div>
                  <div className="flex items-baseline gap-1">
                    <input 
                      type="number" 
                      min="0.01"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => handleUpdateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-24 bg-transparent font-mono text-2xl border-b border-border focus:border-primary focus:outline-none"
                      data-testid={`input-quantity-${idx}`}
                    />
                    <span className="text-sm text-muted-foreground">{wType?.unit || ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-xl border border-border/50 shrink-0">
                  <button 
                    onClick={() => handleUpdateItem(idx, 'quantity', Math.max(0.01, Number((item.quantity - 1).toFixed(2))))}
                    className="w-12 h-12 flex items-center justify-center bg-background rounded-lg shadow-sm border border-border active:scale-95 active:bg-muted transition-all"
                    data-testid={`button-decrement-${idx}`}
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button 
                    onClick={() => handleUpdateItem(idx, 'quantity', Number((item.quantity + 1).toFixed(2)))}
                    className="w-12 h-12 flex items-center justify-center bg-background rounded-lg shadow-sm border border-border active:scale-95 active:bg-muted transition-all"
                    data-testid={`button-increment-${idx}`}
                  >
                    <ChevronLeft size={24} className="rotate-180" />
                  </button>
                </div>
              </div>
              <div className="p-4 pt-0">
                <input
                  type="text"
                  placeholder="Optional notes or context..."
                  value={item.note}
                  onChange={e => handleUpdateItem(idx, 'note', e.target.value)}
                  className="w-full bg-input/20 border-b border-border/50 p-2 text-sm focus:border-primary focus:outline-none rounded-none placeholder:text-muted-foreground/60"
                  data-testid={`input-note-${idx}`}
                />
              </div>
            </div>
          );
        })}
      </section>

      {/* Evidence */}
      <section className="space-y-4">
        <h2 className="font-serif text-lg">Evidence</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className={`relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer active:scale-95 transition-all ${photoUrl ? 'border-primary bg-primary/5' : 'border-border/60 bg-card hover:bg-muted/20'}`} data-testid="label-photo-upload">
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} data-testid="input-photo" />
            {photoUrl ? (
              <div className="absolute inset-0 rounded-xl overflow-hidden">
                <img src={photoUrl} alt="Preview" className="w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white shadow-lg backdrop-blur-[2px]">
                  <Check size={32} />
                </div>
              </div>
            ) : (
              <>
                <Camera size={32} className="text-muted-foreground mb-3" />
                <span className="text-sm font-medium text-foreground">Take Photo</span>
                <span className="text-xs text-destructive mt-1 font-medium">* Required</span>
              </>
            )}
          </label>
          <button 
            onClick={audioUrl ? removeAudio : toggleRecording}
            className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl active:scale-95 transition-all ${
              audioUrl ? 'border-primary bg-primary/5' : 
              isRecording ? 'border-destructive bg-destructive/5' : 
              'border-border/60 bg-card hover:bg-muted/20'
            }`}
            data-testid="button-audio-record"
          >
            {audioUrl ? (
              <>
                <Check size={32} className="text-primary mb-3" />
                <span className="text-sm font-medium text-foreground">Recorded</span>
                <span className="text-xs text-muted-foreground mt-1">Tap to discard</span>
              </>
            ) : isRecording ? (
              <>
                <StopCircle size={32} className="text-destructive animate-pulse mb-3" />
                <span className="text-sm font-medium text-destructive">Recording...</span>
                <span className="text-xs text-muted-foreground mt-1">Tap to stop</span>
              </>
            ) : (
              <>
                <Mic size={32} className="text-muted-foreground mb-3" />
                <span className="text-sm font-medium text-foreground">Voice Note</span>
                <span className="text-xs text-muted-foreground mt-1">Optional</span>
              </>
            )}
          </button>
        </div>
        
        <button
          onClick={captureLocation}
          disabled={locationStatus === 'loading' || locationStatus === 'granted'}
          className={`w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
            locationStatus === 'granted' ? 'border-primary bg-primary/5 text-primary' :
            locationStatus === 'denied' ? 'border-destructive/30 bg-destructive/5 text-destructive' :
            'border-border/60 bg-card hover:bg-muted/20 text-foreground active:scale-95'
          }`}
          data-testid="button-capture-location"
        >
          {locationStatus === 'loading' ? (
            <Loader2 className="animate-spin" size={20} />
          ) : locationStatus === 'granted' ? (
            <Check size={20} />
          ) : (
            <MapPin size={20} />
          )}
          <span className="font-medium">
            {locationStatus === 'granted' ? 'Location Captured' : 
             locationStatus === 'denied' ? 'Location Access Denied' : 
             locationStatus === 'loading' ? 'Locating...' : 'Capture Location (Optional)'}
          </span>
        </button>
        
        {formError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl" data-testid="error-capture-form">
            {formError}
          </div>
        )}
      </section>

      {/* Submit */}
      <button 
        onClick={handleSubmit}
        disabled={!siteId || !crewId || items.length === 0 || !photoBlob}
        className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-medium text-lg shadow-md active:scale-95 active:shadow-sm transition-all disabled:opacity-50 disabled:active:scale-100 mt-8"
        data-testid="button-submit-capture"
      >
        Save Capture
      </button>
    </div>
  );
}

function QueueView({ queue, isSyncing, onSync }: { queue: QueuedCapture[], isSyncing: boolean, onSync: () => void }) {
  const pendingCount = queue.filter(q => q.status !== 'synced').length;
  const retryableCount = queue.filter(isRetryableCapture).length;

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
        <Check size={48} className="text-primary/50 mb-4" />
        <h3 className="font-serif text-xl text-foreground mb-2">All Caught Up</h3>
        <p className="text-sm">No captures in the local queue.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-20">
      <div className="flex justify-between items-end mb-2">
        <h2 className="font-serif text-xl">Queue</h2>
        <button 
          onClick={onSync} 
          disabled={isSyncing || retryableCount === 0}
          className="text-sm font-medium text-primary flex items-center gap-1 active:scale-95 disabled:opacity-50"
          data-testid="button-sync-queue"
        >
          {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
          Sync Pending ({retryableCount})
        </button>
      </div>
      
      {queue.map(item => (
        <div key={item.id} className="bg-card border border-border/60 rounded-xl p-4 shadow-sm relative overflow-hidden">
          {item.status === 'syncing' && (
            <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          )}
          <div className="flex justify-between items-start mb-3">
            <div className="font-mono text-xs text-muted-foreground">
              {new Date(item.createdAt).toLocaleString()}
            </div>
            <div className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-bold ${
              item.status === 'failed' ? 'bg-destructive/10 text-destructive border border-destructive/20' : 
              item.status === 'synced' ? 'bg-primary/10 text-primary border border-primary/20' :
              item.status === 'syncing' ? 'bg-secondary/10 text-secondary-foreground border border-secondary/30' :
              'bg-muted text-muted-foreground border border-border/50'
            }`} data-testid={`status-${item.id}`}>
              {item.status === 'failed' && item.errorType ? `${item.errorType} error` : item.status}
            </div>
          </div>
          
          <div className="space-y-2">
            {item.payload.items.map((pi: CaptureItemInput, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
                <span className="font-medium text-foreground">Type #{pi.workTypeId}</span>
                <span className="font-mono">{pi.quantity} {pi.unit}</span>
              </div>
            ))}
          </div>

          {item.status === 'failed' && item.error && (
            <div className={`mt-3 p-2 border rounded-md text-xs ${
              item.errorType === 'conflict' ? 'bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400' :
              item.errorType === 'validation' ? 'bg-destructive/10 border-destructive/20 text-destructive' :
              'bg-destructive/5 border-destructive/20 text-destructive'
            }`} data-testid={`error-${item.id}`}>
              <div className="font-bold mb-0.5">{item.errorType?.toUpperCase() || 'ERROR'}</div>
              {item.error}
            </div>
          )}
          
          {item.status === 'synced' && item.serverItemIds && (
            <div className="mt-3 p-2 bg-primary/5 border border-primary/20 rounded-md text-xs text-primary font-mono" data-testid={`success-${item.id}`}>
               Production synced • evidence stored locally • IDs: {item.serverItemIds.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function HistoryView({
  projectId,
  currentCrewId,
  context,
}: {
  projectId: number;
  currentCrewId: number;
  context: FieldContext;
}) {
  const { data: historyItems, isLoading: isLoadingHistory, error: historyError } = useListFieldHistory(projectId);
  const { data: proposals, isLoading: isLoadingProposals } = useListProposals(projectId);
  const { data: facts, isLoading: isLoadingFacts } = useListConfirmedFacts(projectId);
  const { data: summary, isLoading: isLoadingSummary } = useGetProgressSummary(projectId);

  const isLoading = isLoadingHistory || isLoadingSummary || isLoadingProposals || isLoadingFacts;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-6 text-muted-foreground">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (historyError) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
        <AlertTriangle size={32} className="text-destructive mb-3" />
        <p className="text-sm">Failed to load history. You might be offline.</p>
      </div>
    );
  }

  // Combine all items and deduplicate by ID to ensure we have a complete view
  const allItemsMap = new Map<number, ProductionItem>();
  [...(historyItems || []), ...(proposals || []), ...(facts || [])].forEach(item => {
    allItemsMap.set(item.id, item);
  });
  
  const allItems = Array.from(allItemsMap.values());

  // Filter history by current crew if possible
  const crewFacts = allItems.filter(f => f.crewId === currentCrewId);
  const displayFacts = crewFacts.length > 0 ? crewFacts : allItems;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = [
    yesterday.getFullYear(),
    String(yesterday.getMonth() + 1).padStart(2, '0'),
    String(yesterday.getDate()).padStart(2, '0'),
  ].join('-');
  const yesterdayConfirmed = displayFacts.filter(
    item => item.status === 'confirmed' && item.workDate === yesterdayKey,
  );

  if (displayFacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
        <History size={48} className="opacity-20 mb-4" />
        <h3 className="font-serif text-xl text-foreground mb-2">No History</h3>
        <p className="text-sm">No recorded work items found for this project.</p>
      </div>
    );
  }

  // Sort by date descending
  const sorted = [...displayFacts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="p-4 space-y-6 pb-20">
      <div className="flex justify-between items-end mb-2">
        <h2 className="font-serif text-xl">Recent Outcomes</h2>
        {crewFacts.length > 0 && <span className="text-xs text-muted-foreground">Filtered to Crew</span>}
      </div>
      <div
        className="bg-primary text-primary-foreground rounded-xl p-4 flex items-center justify-between shadow-sm"
        data-testid="summary-yesterday-confirmed"
      >
        <div>
          <div className="text-xs font-mono uppercase tracking-wider opacity-80">Yesterday confirmed</div>
          <div className="text-sm mt-1">{yesterdayConfirmed.length} work item{yesterdayConfirmed.length === 1 ? '' : 's'}</div>
        </div>
        <div className="text-3xl font-serif">{yesterdayConfirmed.length}</div>
      </div>
      {sorted.map(fact => {
        const lastReview = fact.auditEvents?.slice().reverse().find(e => ['confirmed', 'refused', 'corrected'].includes(e.decision));
        const reviewer = lastReview?.actor || 'Unknown';
        
        // Find remaining in summary
        const row = summary?.rows.find(r => r.workTypeId === fact.workTypeId);
        const remaining = row ? row.remainingQuantity : '?';

        return (
          <div key={fact.id} className="bg-card border border-border/60 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-medium text-foreground text-base">
                  {context.workTypes.find(workType => workType.id === fact.workTypeId)?.name ?? `Work Type #${fact.workTypeId}`}
                </div>
                {row && <div className="text-xs text-muted-foreground font-mono mt-1">Remaining: {remaining} {fact.unit}</div>}
              </div>
              <div className="text-right">
                <div className="font-mono text-xl">{fact.quantity} <span className="text-xs text-muted-foreground">{fact.unit}</span></div>
              </div>
            </div>

            {fact.refusalReason && (
              <div className="my-3 p-2.5 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg flex gap-2 items-start">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{fact.refusalReason}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs mt-4 pt-3 border-t border-border/40">
              <div className="text-muted-foreground flex flex-col gap-0.5">
                <span>{new Date(fact.createdAt).toLocaleDateString()}</span>
                {lastReview && <span className="text-[10px] font-mono opacity-80">By: {reviewer}</span>}
              </div>
              <div className={`px-2.5 py-1 border rounded-md font-mono uppercase tracking-wider text-[10px] font-bold flex items-center gap-1.5 ${
                fact.status === 'refused' ? 'bg-destructive/10 text-destructive border-destructive/30' :
                fact.status === 'confirmed' ? 'bg-primary/10 text-primary border-primary/30' :
                'bg-secondary/20 text-secondary-foreground border-secondary/30'
              }`}>
                {fact.status === 'confirmed' && <Check size={12} strokeWidth={3} />}
                {fact.status}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
