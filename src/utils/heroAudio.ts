// Singleton Web Audio soundtrack controller for the homepage visual reel.
// Starts preloading and attempts immediate AudioContext unlock from app boot,
// while keeping <video> muted so mobile browsers never spawn OS lockscreen media bars.

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
let fallbackChangeHandler: ((useNative: boolean) => void) | null = null;

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
  return videoUrl === DEFAULT_HERO_VIDEO_URL ? DEFAULT_HERO_AUDIO_URL : videoUrl;
}

export function shouldUseNativeVideoAudio(videoUrl?: string | null): boolean {
  if (!videoUrl) return false;
  const audioUrl = resolveHeroAudioUrl(videoUrl);
  return audioUrl !== DEFAULT_HERO_AUDIO_URL && failedDecodeUrls.has(audioUrl);
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
      if (desiredEnabled && desiredAudioUrl === url && url !== DEFAULT_HERO_AUDIO_URL) {
        fallbackChangeHandler?.(true);
      }
      return null;
    });

  pendingFetches.set(url, task);
  return task;
}

async function tryStartPlayback(): Promise<void> {
  clearBrowserMediaSession();

  if (!desiredEnabled || !desiredAudioUrl || (typeof document !== 'undefined' && document.hidden)) {
    return;
  }

  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  if (!desiredEnabled || !desiredAudioUrl || document.hidden || ctx.state !== 'running') {
    return;
  }

  const targetUrl = desiredAudioUrl;
  const buffer = decodedBuffers.get(targetUrl) || (await fetchAndDecodeAudio(targetUrl));
  if (!buffer || !desiredEnabled || desiredAudioUrl !== targetUrl || document.hidden || ctx.state !== 'running') {
    return;
  }

  if (currentPlayingUrl === targetUrl && currentSource) {
    return;
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
  } catch {
    // Ignore audio start restrictions
  }
}

export async function unlockHeroAudioNow(): Promise<void> {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // ignore
    }
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
          tryStartPlayback();
        }
      })
      .catch(() => {});
  } else if (desiredEnabled && desiredAudioUrl && !document.hidden) {
    tryStartPlayback();
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
    tryStartPlayback();
  }
}

export function initHeroAudioEarly(): void {
  if (initializedEarly || typeof window === 'undefined' || typeof document === 'undefined') return;
  initializedEarly = true;

  // Avoid preloading hero audio on admin routes
  const isAdminRoute = window.location.pathname.startsWith('/admin') || window.location.hash.includes('admin');
  if (!isAdminRoute) {
    const ctx = getOrCreateAudioContext();
    ctx?.resume().catch(() => {});
    fetchAndDecodeAudio(DEFAULT_HERO_AUDIO_URL).catch(() => {});
  }

  const events: Array<keyof WindowEventMap> = [
    'pointerdown',
    'pointerup',
    'touchstart',
    'touchend',
    'mousedown',
    'mouseup',
    'click',
    'keydown'
  ];
  events.forEach((evt) => {
    window.addEventListener(evt, handleEarlyOrGlobalGesture, { capture: true, passive: true });
  });
  document.addEventListener('visibilitychange', handleVisibility);
}

export function syncHeroAudioState(options: {
  enabled: boolean;
  videoUrl?: string | null;
  getCurrentVideoTime?: () => number;
  onFallbackChange?: (useNative: boolean) => void;
}): void {
  initHeroAudioEarly();
  clearBrowserMediaSession();

  desiredEnabled = options.enabled;
  desiredAudioUrl = options.enabled && options.videoUrl ? resolveHeroAudioUrl(options.videoUrl) : null;
  videoTimeProvider = options.getCurrentVideoTime || null;
  fallbackChangeHandler = options.onFallbackChange || null;

  if (!desiredEnabled || !desiredAudioUrl) {
    stopCurrentSource();
    fallbackChangeHandler?.(false);
    return;
  }

  if (failedDecodeUrls.has(desiredAudioUrl) && desiredAudioUrl !== DEFAULT_HERO_AUDIO_URL) {
    stopCurrentSource();
    fallbackChangeHandler?.(true);
    return;
  }

  fallbackChangeHandler?.(false);

  // Warm cache & start immediately whenever AudioContext is allowed/running
  fetchAndDecodeAudio(desiredAudioUrl).then((buf) => {
    if (desiredEnabled && desiredAudioUrl) {
      if (!buf && desiredAudioUrl !== DEFAULT_HERO_AUDIO_URL) {
        fallbackChangeHandler?.(true);
      } else if (buf) {
        fallbackChangeHandler?.(false);
        tryStartPlayback();
      }
    }
  });
  tryStartPlayback();
}

export function stopHeroAudio(): void {
  desiredEnabled = false;
  desiredAudioUrl = null;
  fallbackChangeHandler = null;
  stopCurrentSource();
}
