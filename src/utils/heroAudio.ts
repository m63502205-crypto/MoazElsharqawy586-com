// Singleton Web Audio soundtrack controller for the homepage hero reel.
// Plays extracted lightweight MP3 audio via Web Audio API while keeping <video>
// permanently muted so mobile browsers never spawn OS lockscreen media bars.

const DEFAULT_HERO_VIDEO_URL = '/assets/aistudio/VID-20261023-WA0156_a7a2c2e2.mp4';
const DEFAULT_HERO_AUDIO_URL = '/assets/aistudio/hero-audio.mp3';
const VISITOR_MUTE_STORAGE_KEY = 'nfp_hero_visitor_muted';

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentPlayingUrl: string | null = null;
let desiredEnabled = false;
let desiredAudioUrl: string | null = null;
let externalVideoActive = false;
let visitorMutedState = false;
let videoTimeProvider: (() => number) | null = null;
let initializedEarly = false;
let userInteracted = false;

const interactionListeners = new Set<() => void>();
const stateChangeListeners = new Set<() => void>();

const decodedBuffers = new Map<string, AudioBuffer>();
const failedDecodeUrls = new Set<string>();
const pendingFetches = new Map<string, Promise<AudioBuffer | null>>();

function readStoredVisitorMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage?.getItem(VISITOR_MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

visitorMutedState = readStoredVisitorMuted();

function notifyStateListeners(): void {
  stateChangeListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // Ignore subscriber error
    }
  });
}

export function isVisitorHeroAudioMuted(): boolean {
  return visitorMutedState;
}

export function setVisitorHeroAudioMuted(muted: boolean): void {
  visitorMutedState = Boolean(muted);
  if (typeof window !== 'undefined') {
    try {
      if (visitorMutedState) {
        window.sessionStorage?.setItem(VISITOR_MUTE_STORAGE_KEY, '1');
      } else {
        window.sessionStorage?.removeItem(VISITOR_MUTE_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures
    }
  }
  if (visitorMutedState) {
    stopCurrentSource();
  } else {
    void unlockHeroAudioNow();
  }
  notifyStateListeners();
}

export function onHeroAudioStateChange(cb: () => void): () => void {
  stateChangeListeners.add(cb);
  return () => {
    stateChangeListeners.delete(cb);
  };
}

export function isHeroAudioCurrentlyPlaying(): boolean {
  return Boolean(currentSource && audioCtx?.state === 'running' && desiredEnabled && !visitorMutedState && !externalVideoActive);
}

export function setExternalVideoAudioActive(active: boolean): void {
  const next = Boolean(active);
  if (externalVideoActive === next) return;
  externalVideoActive = next;
  if (externalVideoActive) {
    stopCurrentSource();
  } else if (canPlayHeroAudioNow()) {
    void tryStartPlayback();
  }
  notifyStateListeners();
}

export function hasVisitorInteracted(): boolean {
  return userInteracted;
}

export function onVisitorFirstInteraction(cb: () => void): () => void {
  if (userInteracted) {
    cb();
    return () => {};
  }
  interactionListeners.add(cb);
  return () => {
    interactionListeners.delete(cb);
  };
}

function markVisitorInteracted(): void {
  if (userInteracted) return;
  userInteracted = true;
  interactionListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // Ignore listener errors
    }
  });
  interactionListeners.clear();
}

function getAudioContextClass(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

function getOrCreateAudioContext(): AudioContext | null {
  const Ctx = getAudioContextClass();
  if (!Ctx) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctx();
    audioCtx.onstatechange = () => {
      if (audioCtx?.state === 'running' && canPlayHeroAudioNow()) {
        startDecodedBufferNow();
      }
      notifyStateListeners();
    };
  }
  return audioCtx;
}

function canPlayHeroAudioNow(): boolean {
  return Boolean(
    desiredEnabled &&
      desiredAudioUrl &&
      !visitorMutedState &&
      !externalVideoActive &&
      (typeof document === 'undefined' || !document.hidden)
  );
}

export function clearBrowserMediaSession(): void {
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      const actions: Array<'play' | 'pause' | 'seekbackward' | 'seekforward' | 'previoustrack' | 'nexttrack' | 'stop'> = [
        'play',
        'pause',
        'seekbackward',
        'seekforward',
        'previoustrack',
        'nexttrack',
        'stop'
      ];
      for (const act of actions) {
        try {
          navigator.mediaSession.setActionHandler(act, null);
        } catch {
          // ignore unsupported action handler
        }
      }
    } catch {
      // Ignore browser MediaSession restrictions
    }
  }
}

function stopCurrentSource(): void {
  if (currentSource) {
    try {
      currentSource.stop();
      currentSource.disconnect();
    } catch {
      // Ignore already-stopped source
    }
    currentSource = null;
  }
  currentPlayingUrl = null;
}

export function resolveHeroAudioUrl(videoUrl: string): string {
  const trimmed = String(videoUrl || '').trim();
  if (!trimmed || trimmed === DEFAULT_HERO_VIDEO_URL) {
    return DEFAULT_HERO_AUDIO_URL;
  }
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/assets/')) {
    return `/api/public/hero-audio?src=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

function readBootHeroSettings(): { heroVideoUrl: string; heroDefaultMuted: boolean; heroMediaType: string } | null {
  if (typeof document === 'undefined') return null;
  try {
    const el = document.getElementById('__NFP_INITIAL_DATA__');
    if (!el || !el.textContent) return null;
    const parsed = JSON.parse(el.textContent);
    const s = parsed?.settings;
    if (!s || typeof s !== 'object') return null;
    return {
      heroVideoUrl: String(s.heroVideoUrl || DEFAULT_HERO_VIDEO_URL),
      heroDefaultMuted: Boolean(s.heroDefaultMuted),
      heroMediaType: String(s.heroMediaType || 'video')
    };
  } catch {
    return null;
  }
}

async function fetchAndDecodeAudio(url: string): Promise<AudioBuffer | null> {
  if (decodedBuffers.has(url)) {
    return decodedBuffers.get(url) || null;
  }
  if (pendingFetches.has(url)) {
    return pendingFetches.get(url)!;
  }

  const ctx = getOrCreateAudioContext();
  if (!ctx) {
    failedDecodeUrls.add(url);
    return null;
  }

  const task = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error('Audio fetch failed');
      return res.arrayBuffer();
    })
    .then((arr) => ctx.decodeAudioData(arr))
    .then((decoded) => {
      decodedBuffers.set(url, decoded);
      failedDecodeUrls.delete(url);
      pendingFetches.delete(url);
      return decoded;
    })
    .catch(async () => {
      pendingFetches.delete(url);
      if (url !== DEFAULT_HERO_AUDIO_URL) {
        const fallback = await fetchAndDecodeAudio(DEFAULT_HERO_AUDIO_URL);
        if (fallback) {
          decodedBuffers.set(url, fallback);
          failedDecodeUrls.delete(url);
          return fallback;
        }
      }
      failedDecodeUrls.add(url);
      return null;
    });

  pendingFetches.set(url, task);
  return task;
}

function startDecodedBufferNow(): boolean {
  clearBrowserMediaSession();

  if (!canPlayHeroAudioNow() || !desiredAudioUrl) {
    return false;
  }

  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;

  const targetUrl = desiredAudioUrl;
  const buffer = decodedBuffers.get(targetUrl);
  if (!buffer) return false;

  if (currentPlayingUrl === targetUrl && currentSource && ctx.state === 'running') {
    return true;
  }

  if (ctx.state !== 'running') {
    return false;
  }

  stopCurrentSource();

  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(ctx.destination);

    const rawTime = videoTimeProvider ? videoTimeProvider() : 0;
    const offset = buffer.duration > 0 ? Math.max(0, rawTime) % buffer.duration : 0;
    source.start(0, offset);

    currentSource = source;
    currentPlayingUrl = targetUrl;
    source.onended = () => {
      if (currentSource === source) {
        currentSource = null;
        currentPlayingUrl = null;
        notifyStateListeners();
      }
    };
    notifyStateListeners();
    return true;
  } catch {
    return false;
  }
}

async function tryStartPlayback(attemptAutoResume = false): Promise<void> {
  clearBrowserMediaSession();

  if (!canPlayHeroAudioNow() || !desiredAudioUrl) {
    return;
  }

  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  if (ctx.state === 'running' && startDecodedBufferNow()) {
    return;
  }

  // Try resuming AudioContext cleanly on permitted browsers or once visitor has interacted
  if (ctx.state === 'suspended' && (userInteracted || attemptAutoResume)) {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  if (!canPlayHeroAudioNow() || !desiredAudioUrl) {
    return;
  }

  const targetUrl = desiredAudioUrl;
  if (!decodedBuffers.has(targetUrl)) {
    await fetchAndDecodeAudio(targetUrl);
  }

  if (!canPlayHeroAudioNow() || desiredAudioUrl !== targetUrl) {
    return;
  }

  if (ctx.state === 'running') {
    startDecodedBufferNow();
  }
}

export async function unlockHeroAudioNow(): Promise<void> {
  markVisitorInteracted();
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    const resumePromise = ctx.resume().catch(() => undefined);
    if (canPlayHeroAudioNow() && desiredAudioUrl && decodedBuffers.has(desiredAudioUrl)) {
      startDecodedBufferNow();
    }
    await resumePromise;
  }

  if (canPlayHeroAudioNow()) {
    await tryStartPlayback();
  }
}

function handleGenuineUserGesture(): void {
  markVisitorInteracted();
  if (!canPlayHeroAudioNow()) return;

  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  if (ctx.state === 'running' && currentSource && currentPlayingUrl === desiredAudioUrl) {
    return;
  }

  if (ctx.state === 'suspended') {
    // Call resume() synchronously inside genuine user gesture (critical for iOS Safari / Android Chrome)
    const resumePromise = ctx.resume().catch(() => undefined);
    if (desiredAudioUrl && decodedBuffers.has(desiredAudioUrl)) {
      startDecodedBufferNow();
    }
    void resumePromise.then(() => {
      if (canPlayHeroAudioNow()) {
        if (!startDecodedBufferNow()) {
          void tryStartPlayback();
        }
      }
    });
  } else {
    if (!startDecodedBufferNow()) {
      void tryStartPlayback();
    }
  }
}

function handleVisibility(): void {
  if (typeof document === 'undefined') return;
  if (document.hidden) {
    stopCurrentSource();
    if (audioCtx && audioCtx.state === 'running') {
      audioCtx.suspend().catch(() => {});
    }
  } else if (canPlayHeroAudioNow()) {
    void tryStartPlayback(true);
  }
}

export function initHeroAudioEarly(): void {
  if (initializedEarly || typeof window === 'undefined' || typeof document === 'undefined') return;
  initializedEarly = true;

  const isAdminRoute = window.location.pathname.startsWith('/admin') || window.location.hash.includes('admin');
  if (!isAdminRoute) {
    const boot = readBootHeroSettings();
    const preloadUrl = boot ? resolveHeroAudioUrl(boot.heroVideoUrl) : DEFAULT_HERO_AUDIO_URL;

    if (boot && !boot.heroDefaultMuted && boot.heroMediaType !== 'images') {
      desiredEnabled = true;
      desiredAudioUrl = preloadUrl;
    }

    // Preload and decode hero audio early; start automatically if browser permits unmuted playback
    fetchAndDecodeAudio(preloadUrl)
      .then((buf) => {
        if (buf && canPlayHeroAudioNow()) {
          void tryStartPlayback(true);
        }
      })
      .catch(() => {});
  }

  // Unlock cleanly on the first genuine site-wide interaction (Android, iOS Safari, Desktop) without polling timers
  const activationEvents: Array<keyof WindowEventMap> = [
    'pointerdown',
    'touchstart',
    'touchend',
    'click',
    'keydown'
  ];
  activationEvents.forEach((evt) => {
    window.addEventListener(evt, handleGenuineUserGesture, { capture: true, passive: true });
  });
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('focus', () => {
    if (canPlayHeroAudioNow() && userInteracted) {
      void tryStartPlayback();
    }
  });
}

export function syncHeroAudioState(options: {
  enabled: boolean;
  videoUrl?: string | null;
  getCurrentVideoTime?: () => number;
}): void {
  initHeroAudioEarly();
  clearBrowserMediaSession();

  const nextEnabled = options.enabled;
  const nextAudioUrl = nextEnabled && options.videoUrl ? resolveHeroAudioUrl(options.videoUrl) : null;
  if (options.getCurrentVideoTime) {
    videoTimeProvider = options.getCurrentVideoTime;
  }

  if (!nextEnabled || !nextAudioUrl) {
    desiredEnabled = false;
    desiredAudioUrl = null;
    stopCurrentSource();
    notifyStateListeners();
    return;
  }

  // Avoid stuttering or restarting across page transitions when the exact same soundtrack is already playing
  if (
    desiredEnabled &&
    desiredAudioUrl === nextAudioUrl &&
    currentPlayingUrl === nextAudioUrl &&
    currentSource &&
    audioCtx?.state === 'running'
  ) {
    return;
  }

  desiredEnabled = true;
  desiredAudioUrl = nextAudioUrl;

  const targetUrl = desiredAudioUrl;
  fetchAndDecodeAudio(targetUrl).then((buf) => {
    if (buf && canPlayHeroAudioNow() && desiredAudioUrl === targetUrl) {
      if (!startDecodedBufferNow()) {
        void tryStartPlayback(true);
      }
    }
  });
  void tryStartPlayback(true);
}

export function stopHeroAudio(): void {
  desiredEnabled = false;
  desiredAudioUrl = null;
  externalVideoActive = false;
  stopCurrentSource();
  notifyStateListeners();
}
