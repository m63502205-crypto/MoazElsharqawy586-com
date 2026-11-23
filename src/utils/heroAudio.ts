// Singleton Web Audio soundtrack controller for the homepage visual reel.
// Plays extracted lightweight MP3 audio via Web Audio API while keeping <video>
// permanently muted so mobile browsers never spawn OS lockscreen media bars.

const DEFAULT_HERO_VIDEO_URL = '/assets/aistudio/VID-20261023-WA0156_a7a2c2e2.mp4';
const DEFAULT_HERO_AUDIO_URL = '/assets/aistudio/hero-audio.mp3';

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentPlayingUrl: string | null = null;
let desiredEnabled = false;
let desiredAudioUrl: string | null = null;
let videoTimeProvider: (() => number) | null = null;
let initializedEarly = false;

const decodedBuffers = new Map<string, AudioBuffer>();
const failedDecodeUrls = new Set<string>();
const pendingFetches = new Map<string, Promise<AudioBuffer | null>>();

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
      if (audioCtx?.state === 'running' && desiredEnabled && desiredAudioUrl && !document.hidden) {
        startDecodedBufferNow();
      }
    };
  }
  return audioCtx;
}

export function clearBrowserMediaSession(): void {
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
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
  if (failedDecodeUrls.has(url)) {
    return null;
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
    .catch(() => {
      failedDecodeUrls.add(url);
      pendingFetches.delete(url);
      return null;
    });

  pendingFetches.set(url, task);
  return task;
}

function startDecodedBufferNow(): boolean {
  clearBrowserMediaSession();

  if (!desiredEnabled || !desiredAudioUrl || (typeof document !== 'undefined' && document.hidden)) {
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
      }
    };
    return true;
  } catch {
    return false;
  }
}

async function tryStartPlayback(): Promise<void> {
  clearBrowserMediaSession();

  if (!desiredEnabled || !desiredAudioUrl || (typeof document !== 'undefined' && document.hidden)) {
    return;
  }

  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  // Attempt synchronous start first if already decoded & running
  if (ctx.state === 'running' && startDecodedBufferNow()) {
    return;
  }

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Browser autoplay policy waiting for first interaction
    }
  }

  if (!desiredEnabled || !desiredAudioUrl || document.hidden) {
    return;
  }

  const targetUrl = desiredAudioUrl;
  if (!decodedBuffers.has(targetUrl)) {
    await fetchAndDecodeAudio(targetUrl);
  }

  if (!desiredEnabled || desiredAudioUrl !== targetUrl || document.hidden) {
    return;
  }

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  startDecodedBufferNow();
}

export async function unlockHeroAudioNow(): Promise<void> {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  // Synchronously kick resume + buffer playback inside user gesture when buffer is cached
  if (ctx.state === 'suspended') {
    const resumePromise = ctx.resume().catch(() => undefined);
    if (desiredEnabled && desiredAudioUrl && !document.hidden && decodedBuffers.has(desiredAudioUrl)) {
      // If browser transitions state synchronously or on microtask, try immediately
      startDecodedBufferNow();
    }
    await resumePromise;
  }

  if (desiredEnabled && desiredAudioUrl && !document.hidden) {
    await tryStartPlayback();
  }
}

function handleEarlyOrGlobalGesture(): void {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume()
      .then(() => {
        if (desiredEnabled && desiredAudioUrl && !document.hidden) {
          if (!startDecodedBufferNow()) {
            void tryStartPlayback();
          }
        }
      })
      .catch(() => {});
  } else if (desiredEnabled && desiredAudioUrl && !document.hidden) {
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
  } else if (desiredEnabled && desiredAudioUrl) {
    void tryStartPlayback();
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

    const ctx = getOrCreateAudioContext();
    ctx?.resume().catch(() => {});
    fetchAndDecodeAudio(preloadUrl)
      .then((buf) => {
        if (buf && desiredEnabled && desiredAudioUrl === preloadUrl) {
          void tryStartPlayback();
        }
      })
      .catch(() => {});
  }

  const events: Array<keyof WindowEventMap> = [
    'pointerdown',
    'pointerup',
    'touchstart',
    'touchend',
    'touchmove',
    'mousedown',
    'mouseup',
    'click',
    'keydown',
    'wheel'
  ];
  events.forEach((evt) => {
    window.addEventListener(evt, handleEarlyOrGlobalGesture, { capture: true, passive: true });
  });
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('focus', () => {
    if (desiredEnabled && desiredAudioUrl && !document.hidden) {
      void tryStartPlayback();
    }
  });
  window.addEventListener('pageshow', () => {
    if (desiredEnabled && desiredAudioUrl && !document.hidden) {
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

  desiredEnabled = options.enabled;
  desiredAudioUrl = options.enabled && options.videoUrl ? resolveHeroAudioUrl(options.videoUrl) : null;
  videoTimeProvider = options.getCurrentVideoTime || null;

  if (!desiredEnabled || !desiredAudioUrl) {
    stopCurrentSource();
    return;
  }

  const targetUrl = desiredAudioUrl;
  fetchAndDecodeAudio(targetUrl).then((buf) => {
    if (buf && desiredEnabled && desiredAudioUrl === targetUrl && !document.hidden) {
      if (!startDecodedBufferNow()) {
        void tryStartPlayback();
      }
    }
  });
  void tryStartPlayback();
}

export function stopHeroAudio(): void {
  desiredEnabled = false;
  desiredAudioUrl = null;
  stopCurrentSource();
}
