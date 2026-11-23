import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  type Unsubscribe
} from 'firebase/firestore';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { LiveStream, PublicPortalData, SiteSettings } from '../types';

const DEFAULT_BUNDLED_HERO_VIDEO = '/assets/aistudio/VID-20261023-WA0156_a7a2c2e2.mp4';
const LIVE_SYNC_CHANNEL = 'nfp_live_sync_bus';
const LIVE_SYNC_STORAGE_KEY = 'nfp_live_sync_ping';

export type LiveSyncScope = 'public' | 'admin' | 'all';

export interface LiveSyncSignal {
  scope: LiveSyncScope;
  entity?: string;
  ts: number;
  origin?: string;
}

const INSTANCE_ORIGIN_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const inProcessSyncListeners = new Set<(signal: LiveSyncSignal) => void>();

export function broadcastLiveSyncEvent(scope: LiveSyncScope = 'all', entity?: string): void {
  const signal: LiveSyncSignal = {
    scope,
    entity,
    ts: Date.now(),
    origin: INSTANCE_ORIGIN_ID
  };
  inProcessSyncListeners.forEach(cb => {
    try {
      cb(signal);
    } catch {
      // ignore listener errors
    }
  });

  if (typeof window === 'undefined') return;
  try {
    if ('BroadcastChannel' in window) {
      const ch = new BroadcastChannel(LIVE_SYNC_CHANNEL);
      ch.postMessage(signal);
      ch.close();
    }
  } catch {
    // ignore BroadcastChannel restrictions in sandboxed iframes
  }
  try {
    localStorage.setItem(LIVE_SYNC_STORAGE_KEY, JSON.stringify(signal));
  } catch {
    // ignore storage quota / private mode
  }
}

export function subscribeLiveSyncBus(onSignal: (signal: LiveSyncSignal) => void): () => void {
  inProcessSyncListeners.add(onSignal);
  let channel: BroadcastChannel | null = null;

  if (typeof window !== 'undefined') {
    try {
      if ('BroadcastChannel' in window) {
        channel = new BroadcastChannel(LIVE_SYNC_CHANNEL);
        channel.onmessage = (ev: MessageEvent) => {
          const payload = ev?.data as LiveSyncSignal | undefined;
          if (payload && payload.origin !== INSTANCE_ORIGIN_ID) {
            onSignal(payload);
          }
        };
      }
    } catch {
      channel = null;
    }
  }

  const handleStorage = (ev: StorageEvent) => {
    if (ev.key !== LIVE_SYNC_STORAGE_KEY || !ev.newValue) return;
    try {
      const payload = JSON.parse(ev.newValue) as LiveSyncSignal;
      if (payload && payload.origin !== INSTANCE_ORIGIN_ID) {
        onSignal(payload);
      }
    } catch {
      // ignore invalid JSON
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }

  return () => {
    inProcessSyncListeners.delete(onSignal);
    if (channel) {
      try {
        channel.close();
      } catch {
        // ignore
      }
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage);
    }
  };
}

export const BOOTSTRAPPED_ADMIN_EMAILS = [
  'moazmahmoud586@gmail.com',
  'm63502205@gmail.com',
  'nassard131@gmail.com',
  'aymanmoussadunes67@gmail.com'
];

export type PublicCollectionName =
  | 'party_leaders'
  | 'secretariat_leaders'
  | 'secretariats'
  | 'secretariat_members'
  | 'initiatives'
  | 'news'
  | 'events'
  | 'media'
  | 'pages';

export type PrivateCollectionName =
  | 'applications'
  | 'members'
  | 'roles'
  | 'admin_users'
  | 'audit_logs'
  | 'subscribers'
  | 'email_dispatch_logs';

export const PUBLIC_COLLECTIONS: PublicCollectionName[] = [
  'party_leaders',
  'secretariat_leaders',
  'secretariats',
  'secretariat_members',
  'initiatives',
  'news',
  'events',
  'media',
  'pages'
];

const SEO_UPGRADE_CUTOFF_ISO = '2026-11-23T15:00:00.000Z';

const localUploadReachableCache = new Map<string, boolean>();
const localUploadPendingChecks = new Map<string, Promise<boolean>>();

export async function isLocalUploadReachable(rawUrl?: string): Promise<boolean> {
  const clean = String(rawUrl || '').split('?')[0].trim();
  if (!clean) return false;
  if (!clean.startsWith('/uploads/')) return true;
  if (localUploadReachableCache.has(clean)) {
    return Boolean(localUploadReachableCache.get(clean));
  }
  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    return true;
  }
  const existing = localUploadPendingChecks.get(clean);
  if (existing) return existing;

  const task = fetch(clean, { method: 'HEAD', cache: 'no-store' })
    .then(res => {
      const contentType = String(res.headers.get('content-type') || '').toLowerCase();
      const valid = res.ok && !contentType.includes('text/html');
      localUploadReachableCache.set(clean, valid);
      localUploadPendingChecks.delete(clean);
      return valid;
    })
    .catch(() => {
      localUploadReachableCache.set(clean, false);
      localUploadPendingChecks.delete(clean);
      return false;
    });

  localUploadPendingChecks.set(clean, task);
  return task;
}

function resolveHeroVideoSync(cloudHeroVideo: string, localHeroVideo: string): string {
  const cloudClean = String(cloudHeroVideo || '').trim();
  const localClean = String(localHeroVideo || '').trim();
  if (!cloudClean) return localClean || DEFAULT_BUNDLED_HERO_VIDEO;
  if (cloudClean.startsWith('/uploads/')) {
    const known = localUploadReachableCache.get(cloudClean.split('?')[0]);
    if (known === false) {
      return localClean && (!localClean.startsWith('/uploads/') || localUploadReachableCache.get(localClean.split('?')[0]) === true)
        ? localClean
        : DEFAULT_BUNDLED_HERO_VIDEO;
    }
    if (known === undefined) {
      // Trigger async check so any subsequent snapshot/render resolves cleanly; meanwhile preserve verified local fallback if cloud upload isn't verified yet
      void isLocalUploadReachable(cloudClean);
      if (localClean && !localClean.startsWith('/uploads/')) {
        return localClean;
      }
    }
  }
  return cloudClean;
}

export function toFirestoreDocId(rawId: string): string {
  const cleaned = String(rawId || 'item')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) return 'item_' + Date.now();
  return cleaned.slice(0, 128);
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export function isFirebaseAdminReady(): boolean {
  const u = auth.currentUser;
  return Boolean(u && u.email && u.emailVerified);
}

export async function signInWithGoogleForAdmin(): Promise<{
  idToken: string;
  email: string;
  uid: string;
}> {
  const cred = await signInWithPopup(auth, googleProvider);
  const idToken = await cred.user.getIdToken(true);
  return {
    idToken,
    email: (cred.user.email || '').toLowerCase(),
    uid: cred.user.uid
  };
}

export async function signOutFirebaseAdmin(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // ignore
  }
}

async function hashStringShort(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .slice(0, 10)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16);
}

async function compressDataUrlForFirestore(dataUrl: string): Promise<{ mime: string; base64: string } | null> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const origMime = match[1];
  const origBase64 = match[2];

  // Strictly obey firestore.rules dataBase64.size() <= 900000
  if (origBase64.length <= 820000) {
    return { mime: origMime, base64: origBase64 };
  }

  if (typeof document === 'undefined' || !origMime.startsWith('image/')) {
    return null;
  }

  return await new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        const maxDim = 1400;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        for (const quality of [0.82, 0.7, 0.58, 0.45]) {
          const next = canvas.toDataURL('image/jpeg', quality);
          const b64 = next.split(',')[1] || '';
          if (b64.length <= 820000) {
            resolve({ mime: 'image/jpeg', base64: b64 });
            return;
          }
        }
        resolve(null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

const uploadedAssetUrlCache = new Map<string, string>();

export async function persistImageUrlToFirestore(rawUrl: string): Promise<string> {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('/api/public/firestore-asset/')) return trimmed;
  if (trimmed.startsWith('/assets/')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (!isFirebaseAdminReady()) return trimmed;

  const cached = uploadedAssetUrlCache.get(trimmed);
  if (cached) return cached;

  let dataUrl = trimmed;
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/api/public/inline-asset/') || trimmed.startsWith('/api/')) {
    try {
      const resp = await fetch(trimmed);
      if (!resp.ok) return trimmed;
      const blob = await resp.blob();
      if (!blob.type.startsWith('image/')) return trimmed;
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('read error'));
        reader.readAsDataURL(blob);
      });
    } catch {
      return trimmed;
    }
  }

  if (!dataUrl.startsWith('data:image/')) {
    return trimmed;
  }

  const prepared = await compressDataUrlForFirestore(dataUrl);
  if (!prepared) return trimmed;

  const hash = await hashStringShort(prepared.base64.slice(0, 8192) + ':' + prepared.base64.length);
  const assetId = `asset_${hash}`;
  const targetPath = `uploads_public/${assetId}`;

  try {
    const ref = doc(db, 'uploads_public', assetId);
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        id: assetId,
        mime: prepared.mime.slice(0, 64),
        dataBase64: prepared.base64,
        isPublic: true,
        createdAt: new Date().toISOString()
      });
    }
    const resolved = `/api/public/firestore-asset/${assetId}`;
    uploadedAssetUrlCache.set(trimmed, resolved);
    return resolved;
  } catch (error) {
    console.warn('Could not persist asset to Firestore:', error);
    return trimmed;
  }
}

const IMAGE_FIELD_KEYS = new Set([
  'photoUrl',
  'coverImage',
  'coverUrl',
  'imageUrl',
  'logoUrl',
  'officialLogo',
  'seoShareImage',
  'entranceImageUrl',
  'heroPosterUrl',
  'posterUrl'
]);

async function normalizeRecordAssetsForFirestore(record: any): Promise<any> {
  if (!record || typeof record !== 'object') return record;
  if (Array.isArray(record)) {
    const arr = [];
    for (const item of record) {
      arr.push(await normalizeRecordAssetsForFirestore(item));
    }
    return arr;
  }

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(record)) {
    if (v === undefined) continue;
    if (IMAGE_FIELD_KEYS.has(k) && typeof v === 'string') {
      out[k] = await persistImageUrlToFirestore(v);
    } else if ((k === 'galleryImages' || k === 'images' || k === 'heroImages') && Array.isArray(v)) {
      const nextList = [];
      for (const imgVal of v) {
        nextList.push(typeof imgVal === 'string' ? await persistImageUrlToFirestore(imgVal) : imgVal);
      }
      out[k] = nextList;
    } else if (k === 'heroSlides' && Array.isArray(v)) {
      const nextSlides = [];
      for (const slide of v) {
        if (slide && typeof slide === 'object') {
          nextSlides.push({
            ...slide,
            url: slide.type === 'image' && typeof slide.url === 'string' ? await persistImageUrlToFirestore(slide.url) : slide.url,
            posterUrl: typeof slide.posterUrl === 'string' ? await persistImageUrlToFirestore(slide.posterUrl) : slide.posterUrl
          });
        } else {
          nextSlides.push(slide);
        }
      }
      out[k] = nextSlides;
    } else if ((k === 'activities' || k === 'assistantSecretaries') && Array.isArray(v)) {
      out[k] = await normalizeRecordAssetsForFirestore(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function readTombstoneSet(): Promise<Set<string>> {
  try {
    const snap = await getDoc(doc(db, 'site_config', 'portal_tombstones'));
    if (!snap.exists()) return new Set();
    const rawList = snap.data()?.data?.deletedKeys;
    if (!Array.isArray(rawList)) return new Set();
    return new Set(rawList.filter((x: unknown): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

async function updateTombstones(mutate: (set: Set<string>) => boolean): Promise<void> {
  if (!isFirebaseAdminReady()) return;
  const ref = doc(db, 'site_config', 'portal_tombstones');
  try {
    const current = await readTombstoneSet();
    const changed = mutate(current);
    if (!changed) return;
    await setDoc(ref, {
      id: 'portal_tombstones',
      isPublic: true,
      data: { deletedKeys: Array.from(current) },
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'site_config/portal_tombstones');
  }
}

export async function syncPublicRecordToFirestore(col: PublicCollectionName, record: any): Promise<void> {
  if (!isFirebaseAdminReady() || !record || !record.id) return;
  const safeId = toFirestoreDocId(String(record.id));
  const path = `${col}/${safeId}`;
  try {
    const normalized = stripUndefinedDeep(await normalizeRecordAssetsForFirestore(record));
    const nowIso = new Date().toISOString();
    await setDoc(doc(db, col, safeId), {
      id: safeId,
      isPublic: true,
      data: { ...normalized, id: String(record.id), updatedAt: normalized.updatedAt || nowIso },
      updatedAt: nowIso
    });
    await updateTombstones(set => {
      const k1 = `${col}:${record.id}`;
      const k2 = `${col}:${safeId}`;
      const had1 = set.delete(k1);
      const had2 = set.delete(k2);
      return had1 || had2;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deletePublicRecordFromFirestore(col: PublicCollectionName, rawId: string): Promise<void> {
  if (!isFirebaseAdminReady() || !rawId) return;
  const safeId = toFirestoreDocId(rawId);
  const path = `${col}/${safeId}`;
  try {
    await deleteDoc(doc(db, col, safeId));
    await updateTombstones(set => {
      const k1 = `${col}:${rawId}`;
      const k2 = `${col}:${safeId}`;
      const sizeBefore = set.size;
      set.add(k1);
      set.add(k2);
      return set.size !== sizeBefore;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncSiteConfigToFirestore(configId: 'public' | 'livestream', payload: any): Promise<void> {
  if (!isFirebaseAdminReady() || !payload) return;
  const path = `site_config/${configId}`;
  try {
    const normalized = stripUndefinedDeep(await normalizeRecordAssetsForFirestore(payload));
    await setDoc(doc(db, 'site_config', configId), {
      id: configId,
      isPublic: true,
      data: normalized,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncPrivateRecordToFirestore(col: PrivateCollectionName, record: any): Promise<void> {
  if (!isFirebaseAdminReady() || !record || !record.id) return;
  const safeId = toFirestoreDocId(String(record.id));
  const path = `${col}/${safeId}`;
  try {
    const clean = stripUndefinedDeep(record);
    await setDoc(doc(db, col, safeId), {
      id: safeId,
      data: clean,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deletePrivateRecordFromFirestore(col: PrivateCollectionName, rawId: string): Promise<void> {
  if (!isFirebaseAdminReady() || !rawId) return;
  const safeId = toFirestoreDocId(rawId);
  const path = `${col}/${safeId}`;
  try {
    await deleteDoc(doc(db, col, safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function mergeCollectionWithTombstones(
  col: PublicCollectionName,
  localItems: any[],
  cloudDocs: Array<{ id: string; data: any; updatedAt: string }>,
  tombstones: Set<string>,
  matchBySlug = false
): any[] {
  const isDeleted = (item: any) => {
    const rawId = String(item?.id || '');
    const safeId = toFirestoreDocId(rawId);
    return tombstones.has(`${col}:${rawId}`) || tombstones.has(`${col}:${safeId}`);
  };

  const map = new Map<string, any>();
  for (const item of localItems || []) {
    if (!item || !item.id || isDeleted(item)) continue;
    const key = matchBySlug && item.slug ? `slug:${item.slug}` : `id:${item.id}`;
    map.set(key, item);
  }

  for (const docItem of cloudDocs) {
    const raw = docItem.data;
    if (!raw || !raw.id || isDeleted(raw)) continue;
    const key = matchBySlug && raw.slug ? `slug:${raw.slug}` : `id:${raw.id}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, raw);
    } else {
      const existingTs = String(existing.updatedAt || existing.createdAt || '');
      const cloudTs = String(raw.updatedAt || docItem.updatedAt || '');
      if (!existingTs || (Boolean(cloudTs) && cloudTs >= existingTs)) {
        map.set(key, raw);
      }
    }
  }

  return Array.from(map.values());
}

type CloudDocEntry = { id: string; data: any; updatedAt: string };

interface LiveSnapshotStoreState {
  siteConfigDocs: Map<string, CloudDocEntry>;
  collections: Record<PublicCollectionName, Map<string, CloudDocEntry>>;
  deletedKeysDuringSession: Set<string>;
}

function createEmptySnapshotStore(): LiveSnapshotStoreState {
  return {
    siteConfigDocs: new Map(),
    collections: {
      party_leaders: new Map(),
      secretariat_leaders: new Map(),
      secretariats: new Map(),
      secretariat_members: new Map(),
      initiatives: new Map(),
      news: new Map(),
      events: new Map(),
      media: new Map(),
      pages: new Map()
    },
    deletedKeysDuringSession: new Set()
  };
}

const sharedLiveStore: LiveSnapshotStoreState = createEmptySnapshotStore();
let hasAnyLiveSnapshotData = false;

function logStructuredFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  try {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo:
          auth.currentUser?.providerData?.map(provider => ({
            providerId: provider.providerId,
            email: provider.email
          })) || []
      },
      operationType,
      path
    };
    console.warn('Firestore Error: ', JSON.stringify(errInfo));
  } catch {
    console.warn('Firestore Error:', error);
  }
}

function mergeSnapshotStoreIntoPortalData(
  baseData: PublicPortalData,
  store: LiveSnapshotStoreState
): PublicPortalData {
  const tombstones = new Set<string>();
  const tombDoc = store.siteConfigDocs.get('portal_tombstones');
  const rawCloudTombs = tombDoc?.data?.deletedKeys;
  if (Array.isArray(rawCloudTombs)) {
    for (const k of rawCloudTombs) {
      if (typeof k === 'string' && k) tombstones.add(k);
    }
  }
  if (Array.isArray(baseData.deletedTombstones)) {
    for (const k of baseData.deletedTombstones) {
      if (typeof k === 'string' && k) tombstones.add(k);
    }
  }
  for (const k of store.deletedKeysDuringSession) {
    tombstones.add(k);
  }

  let nextSettings: SiteSettings = { ...baseData.settings };
  let nextLiveStream: LiveStream = baseData.liveStream
    ? { ...baseData.liveStream }
    : { id: 'live-1', title: '', description: '', streamUrl: '', isActive: false, platform: 'youtube' };

  const publicCfg = store.siteConfigDocs.get('public');
  if (publicCfg?.data) {
    const cloudSettings = publicCfg.data as Partial<SiteSettings>;
    const cloudUpdated = String(cloudSettings.updatedAt || publicCfg.updatedAt || '');
    const localUpdated = String(nextSettings.updatedAt || '');
    const isPreUpgradeSnapshot =
      (cloudSettings.rosterVersion || 0) < 9 && (!cloudUpdated || cloudUpdated < SEO_UPGRADE_CUTOFF_ISO);
    const isNewerThanLocal = !localUpdated || (Boolean(cloudUpdated) && cloudUpdated >= localUpdated);
    if (isNewerThanLocal) {
      const safeHeroVideoUrl = resolveHeroVideoSync(
        String(cloudSettings.heroVideoUrl || ''),
        String(nextSettings.heroVideoUrl || '')
      );
      nextSettings = {
        ...nextSettings,
        ...cloudSettings,
        heroVideoUrl: safeHeroVideoUrl,
        seoTitle: isPreUpgradeSnapshot ? nextSettings.seoTitle : (cloudSettings.seoTitle || nextSettings.seoTitle),
        officialSiteUrl: isPreUpgradeSnapshot ? nextSettings.officialSiteUrl : (cloudSettings.officialSiteUrl || nextSettings.officialSiteUrl),
        googleAnalyticsId: cloudSettings.googleAnalyticsId || nextSettings.googleAnalyticsId,
        googleTagManagerId: cloudSettings.googleTagManagerId || nextSettings.googleTagManagerId,
        googleSiteVerification: cloudSettings.googleSiteVerification || nextSettings.googleSiteVerification
      };
    }
  }

  const liveCfg = store.siteConfigDocs.get('livestream');
  if (liveCfg?.data) {
    const cloudLiveUpdated = String(liveCfg.data.updatedAt || liveCfg.updatedAt || '');
    const localLiveUpdated = String(nextLiveStream.updatedAt || '');
    if (!localLiveUpdated || (Boolean(cloudLiveUpdated) && cloudLiveUpdated >= localLiveUpdated)) {
      nextLiveStream = { ...nextLiveStream, ...liveCfg.data };
    }
  }

  const getCloudList = (col: PublicCollectionName) => Array.from(store.collections[col].values());

  const partyLeaders = mergeCollectionWithTombstones(
    'party_leaders',
    baseData.partyLeaders,
    getCloudList('party_leaders'),
    tombstones
  )
    .filter(l => l.isVisible !== false)
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

  const secretariatLeaders = mergeCollectionWithTombstones(
    'secretariat_leaders',
    baseData.secretariatLeaders,
    getCloudList('secretariat_leaders'),
    tombstones
  )
    .filter(l => l.isVisible !== false)
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

  const specializedSecretariats = mergeCollectionWithTombstones(
    'secretariats',
    baseData.specializedSecretariats,
    getCloudList('secretariats'),
    tombstones,
    true
  )
    .filter(s => s.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

  const secretariatMembers = mergeCollectionWithTombstones(
    'secretariat_members',
    baseData.secretariatMembers,
    getCloudList('secretariat_members'),
    tombstones
  );

  const initiatives = mergeCollectionWithTombstones(
    'initiatives',
    baseData.initiatives,
    getCloudList('initiatives'),
    tombstones
  ).filter(i => i.isVisible !== false);

  const news = mergeCollectionWithTombstones(
    'news',
    baseData.news,
    getCloudList('news'),
    tombstones
  )
    .filter(n => !n.isDraft)
    .sort((a, b) => new Date(b.publishDate || b.createdAt || 0).getTime() - new Date(a.publishDate || a.createdAt || 0).getTime());

  const events = mergeCollectionWithTombstones(
    'events',
    baseData.events,
    getCloudList('events'),
    tombstones
  )
    .filter(e => e.isVisible !== false)
    .sort((a, b) => new Date(b.dateTime || b.createdAt || 0).getTime() - new Date(a.dateTime || a.createdAt || 0).getTime());

  const media = mergeCollectionWithTombstones(
    'media',
    baseData.media,
    getCloudList('media'),
    tombstones
  )
    .filter(m => m.isVisible !== false)
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

  const pages = mergeCollectionWithTombstones(
    'pages',
    baseData.pages || [],
    getCloudList('pages'),
    tombstones
  ).filter(p => p.isPublished !== false);

  return {
    ...baseData,
    settings: nextSettings,
    liveStream: nextLiveStream,
    partyLeaders,
    secretariatLeaders,
    specializedSecretariats,
    secretariatMembers,
    initiatives,
    news,
    events,
    media,
    pages,
    deletedTombstones: Array.from(tombstones)
  };
}

export function mergeWithCurrentLiveSnapshots(baseData: PublicPortalData): PublicPortalData {
  if (!hasAnyLiveSnapshotData) return baseData;
  return mergeSnapshotStoreIntoPortalData(baseData, sharedLiveStore);
}

export async function hydratePortalDataFromFirestore(baseData: PublicPortalData): Promise<PublicPortalData> {
  try {
    const heroUrlCandidate = String(baseData.settings?.heroVideoUrl || '').trim();
    if (heroUrlCandidate.startsWith('/uploads/')) {
      await isLocalUploadReachable(heroUrlCandidate);
    }

    const tombstones = await readTombstoneSet();
    if (Array.isArray(baseData.deletedTombstones)) {
      for (const k of baseData.deletedTombstones) {
        if (typeof k === 'string' && k) tombstones.add(k);
      }
    }

    const [
      siteConfigSnap,
      partyLeadersSnap,
      secretariatLeadersSnap,
      secretariatsSnap,
      secretariatMembersSnap,
      initiativesSnap,
      newsSnap,
      eventsSnap,
      mediaSnap,
      pagesSnap
    ] = await Promise.all([
      getDocs(query(collection(db, 'site_config'), where('isPublic', '==', true))),
      getDocs(query(collection(db, 'party_leaders'), where('isPublic', '==', true))),
      getDocs(query(collection(db, 'secretariat_leaders'), where('isPublic', '==', true))),
      getDocs(query(collection(db, 'secretariats'), where('isPublic', '==', true))),
      getDocs(query(collection(db, 'secretariat_members'), where('isPublic', '==', true))),
      getDocs(query(collection(db, 'initiatives'), where('isPublic', '==', true))),
      getDocs(query(collection(db, 'news'), where('isPublic', '==', true))),
      getDocs(query(collection(db, 'events'), where('isPublic', '==', true))),
      getDocs(query(collection(db, 'media'), where('isPublic', '==', true))),
      getDocs(query(collection(db, 'pages'), where('isPublic', '==', true)))
    ]);

    const toRecords = (snap: Awaited<ReturnType<typeof getDocs>>) =>
      snap.docs.map(d => {
        const v: any = d.data();
        return { id: String(v.id || d.id), data: v.data || {}, updatedAt: String(v.updatedAt || '') };
      });

    sharedLiveStore.siteConfigDocs.clear();
    for (const d of siteConfigSnap.docs) {
      const v: any = d.data();
      sharedLiveStore.siteConfigDocs.set(d.id, {
        id: String(v.id || d.id),
        data: v.data || {},
        updatedAt: String(v.updatedAt || '')
      });
    }

    const snapMap: Record<PublicCollectionName, Awaited<ReturnType<typeof getDocs>>> = {
      party_leaders: partyLeadersSnap,
      secretariat_leaders: secretariatLeadersSnap,
      secretariats: secretariatsSnap,
      secretariat_members: secretariatMembersSnap,
      initiatives: initiativesSnap,
      news: newsSnap,
      events: eventsSnap,
      media: mediaSnap,
      pages: pagesSnap
    };

    for (const colName of PUBLIC_COLLECTIONS) {
      const colMap = sharedLiveStore.collections[colName];
      colMap.clear();
      for (const rec of toRecords(snapMap[colName])) {
        colMap.set(rec.id, rec);
      }
    }
    hasAnyLiveSnapshotData = true;

    const publicDoc = sharedLiveStore.siteConfigDocs.get('public');
    const cloudHeroUrl = String(publicDoc?.data?.heroVideoUrl || '').trim();
    if (cloudHeroUrl.startsWith('/uploads/')) {
      await isLocalUploadReachable(cloudHeroUrl);
    }

    return mergeSnapshotStoreIntoPortalData(
      {
        ...baseData,
        deletedTombstones: Array.from(tombstones)
      },
      sharedLiveStore
    );
  } catch (error) {
    logStructuredFirestoreError(error, OperationType.LIST, 'public_portal_hydration');
    return baseData;
  }
}

export function subscribeLivePortalData(
  getBaseData: () => PublicPortalData | null,
  onMergedData: (nextData: PublicPortalData) => void
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  let disposed = false;
  let flushQueued = false;

  const flushNow = () => {
    flushQueued = false;
    if (disposed) return;
    const base = getBaseData();
    if (!base) return;

    const publicDoc = sharedLiveStore.siteConfigDocs.get('public');
    const cloudHeroUrl = String(publicDoc?.data?.heroVideoUrl || '').trim();
    if (cloudHeroUrl.startsWith('/uploads/')) {
      const cleanPath = cloudHeroUrl.split('?')[0];
      if (!localUploadReachableCache.has(cleanPath)) {
        void isLocalUploadReachable(cloudHeroUrl).then(reachable => {
          if (!disposed && !reachable) {
            scheduleFlush();
          }
        });
      }
    }

    const merged = mergeSnapshotStoreIntoPortalData(base, sharedLiveStore);
    onMergedData(merged);
  };

  const scheduleFlush = () => {
    if (disposed || flushQueued) return;
    flushQueued = true;
    queueMicrotask(flushNow);
  };

  try {
    const siteCfgQuery = query(collection(db, 'site_config'), where('isPublic', '==', true));
    const uSite = onSnapshot(
      siteCfgQuery,
      snap => {
        for (const change of snap.docChanges()) {
          const docId = change.doc.id;
          if (change.type === 'removed') {
            sharedLiveStore.siteConfigDocs.delete(docId);
          } else {
            const v: any = change.doc.data();
            sharedLiveStore.siteConfigDocs.set(docId, {
              id: String(v.id || docId),
              data: v.data || {},
              updatedAt: String(v.updatedAt || '')
            });
          }
        }
        hasAnyLiveSnapshotData = true;
        scheduleFlush();
      },
      err => {
        logStructuredFirestoreError(err, OperationType.GET, 'site_config');
      }
    );
    unsubs.push(uSite);
  } catch (error) {
    logStructuredFirestoreError(error, OperationType.GET, 'site_config');
  }

  for (const colName of PUBLIC_COLLECTIONS) {
    try {
      const q = query(collection(db, colName), where('isPublic', '==', true));
      let hasReceivedInitial = false;
      const u = onSnapshot(
        q,
        snap => {
          const colMap = sharedLiveStore.collections[colName];
          if (!hasReceivedInitial) {
            colMap.clear();
            for (const d of snap.docs) {
              const v: any = d.data();
              const recId = String(v.id || d.id);
              colMap.set(recId, {
                id: recId,
                data: v.data || {},
                updatedAt: String(v.updatedAt || '')
              });
            }
            hasReceivedInitial = true;
          } else {
            for (const change of snap.docChanges()) {
              const v: any = change.doc.data();
              const docKey = String(v?.id || change.doc.id);
              const rawItemId = String(v?.data?.id || docKey);
              if (change.type === 'removed') {
                colMap.delete(docKey);
                sharedLiveStore.deletedKeysDuringSession.add(`${colName}:${rawItemId}`);
                sharedLiveStore.deletedKeysDuringSession.add(`${colName}:${toFirestoreDocId(rawItemId)}`);
              } else {
                colMap.set(docKey, {
                  id: docKey,
                  data: v.data || {},
                  updatedAt: String(v.updatedAt || '')
                });
                sharedLiveStore.deletedKeysDuringSession.delete(`${colName}:${rawItemId}`);
                sharedLiveStore.deletedKeysDuringSession.delete(`${colName}:${toFirestoreDocId(rawItemId)}`);
              }
            }
          }
          hasAnyLiveSnapshotData = true;
          scheduleFlush();
        },
        err => {
          logStructuredFirestoreError(err, OperationType.GET, colName);
        }
      );
      unsubs.push(u);
    } catch (error) {
      logStructuredFirestoreError(error, OperationType.GET, colName);
    }
  }

  return () => {
    disposed = true;
    flushQueued = false;
    unsubs.forEach(u => u());
  };
}

export function subscribePublicFirestoreChanges(onChange: () => void): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const initialBurst = new Set<string>();

  const scheduleRefresh = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      onChange();
    }, 150);
  };

  const watchCols = ['site_config', ...PUBLIC_COLLECTIONS];
  for (const colName of watchCols) {
    try {
      const q = query(collection(db, colName), where('isPublic', '==', true));
      const u = onSnapshot(
        q,
        () => {
          if (!initialBurst.has(colName)) {
            initialBurst.add(colName);
            return;
          }
          scheduleRefresh();
        },
        err => {
          logStructuredFirestoreError(err, OperationType.GET, colName);
        }
      );
      unsubs.push(u);
    } catch (error) {
      logStructuredFirestoreError(error, OperationType.GET, colName);
    }
  }

  return () => {
    if (timer) clearTimeout(timer);
    unsubs.forEach(u => u());
  };
}

export function subscribeAdminFirestoreChanges(
  includePrivateCollections: boolean,
  onChange: (collectionName: string) => void
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingCol = 'all';
  const initialBurst = new Set<string>();

  const trigger = (col: string) => {
    pendingCol = col;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      onChange(pendingCol);
    }, 180);
  };

  for (const colName of ['site_config', ...PUBLIC_COLLECTIONS]) {
    try {
      const q = query(collection(db, colName), where('isPublic', '==', true));
      const u = onSnapshot(
        q,
        () => {
          if (!initialBurst.has(colName)) {
            initialBurst.add(colName);
            return;
          }
          trigger(colName);
        },
        err => {
          logStructuredFirestoreError(err, OperationType.LIST, colName);
        }
      );
      unsubs.push(u);
    } catch (error) {
      logStructuredFirestoreError(error, OperationType.LIST, colName);
    }
  }

  if (includePrivateCollections && isFirebaseAdminReady()) {
    const privateCols: PrivateCollectionName[] = [
      'applications',
      'members',
      'roles',
      'admin_users',
      'audit_logs'
    ];
    for (const colName of privateCols) {
      try {
        const u = onSnapshot(
          collection(db, colName),
          () => {
            if (!initialBurst.has(colName)) {
              initialBurst.add(colName);
              return;
            }
            trigger(colName);
          },
          err => {
            logStructuredFirestoreError(err, OperationType.LIST, colName);
          }
        );
        unsubs.push(u);
      } catch (error) {
        logStructuredFirestoreError(error, OperationType.LIST, colName);
      }
    }
  }

  return () => {
    if (timer) clearTimeout(timer);
    unsubs.forEach(u => u());
  };
}

let lastAdminReconcileAt = 0;

export async function reconcileAdminFirestore(localFullDb: any): Promise<boolean> {
  if (!isFirebaseAdminReady() || !localFullDb) return false;
  const now = Date.now();
  if (now - lastAdminReconcileAt < 10000) return false;
  lastAdminReconcileAt = now;

  try {
    const tombstones = await readTombstoneSet();
    const mappings: Array<{ col: PublicCollectionName; items: any[]; matchBySlug?: boolean }> = [
      { col: 'party_leaders', items: localFullDb.partyLeaders || [] },
      { col: 'secretariat_leaders', items: localFullDb.secretariatLeaders || [] },
      { col: 'secretariats', items: localFullDb.specializedSecretariats || [], matchBySlug: true },
      { col: 'secretariat_members', items: localFullDb.secretariatMembers || [] },
      { col: 'initiatives', items: localFullDb.initiatives || [] },
      { col: 'news', items: localFullDb.news || [] },
      { col: 'events', items: localFullDb.events || [] },
      { col: 'media', items: localFullDb.media || [] },
      { col: 'pages', items: localFullDb.pages || [] }
    ];

    // Push any newer local items or missing items (excluding tombstoned ones) to Firestore
    for (const { col, items } of mappings) {
      const snap = await getDocs(collection(db, col));
      const cloudMap = new Map<string, any>();
      for (const d of snap.docs) {
        const val: any = d.data();
        if (val?.data?.id) {
          cloudMap.set(String(val.data.id), { data: val.data, updatedAt: String(val.updatedAt || '') });
        }
      }

      for (const item of items) {
        if (!item || !item.id) continue;
        const safeId = toFirestoreDocId(String(item.id));
        if (tombstones.has(`${col}:${item.id}`) || tombstones.has(`${col}:${safeId}`)) {
          continue;
        }
        const cloud = cloudMap.get(String(item.id));
        const localTs = String(item.updatedAt || item.createdAt || '');
        if (!cloud || (localTs && cloud.updatedAt && localTs > cloud.updatedAt)) {
          await syncPublicRecordToFirestore(col, item);
        }
      }
    }

    // Ensure site_config/public reflects latest settings if cloud was pre-upgrade
    if (localFullDb.settings) {
      const publicCfgSnap = await getDoc(doc(db, 'site_config', 'public'));
      const cfgData: any = publicCfgSnap.exists() ? publicCfgSnap.data() : null;
      const cloudUpdated = String(cfgData?.updatedAt || '');
      const cloudVer = cfgData?.data?.rosterVersion || 0;
      if (!cfgData || (cloudVer < 9 && (!cloudUpdated || cloudUpdated < SEO_UPGRADE_CUTOFF_ISO))) {
        await syncSiteConfigToFirestore('public', localFullDb.settings);
      }
    }
    if (localFullDb.liveStream) {
      const lsSnap = await getDoc(doc(db, 'site_config', 'livestream'));
      if (!lsSnap.exists()) {
        await syncSiteConfigToFirestore('livestream', localFullDb.liveStream);
      }
    }

    return true;
  } catch (error) {
    console.warn('Background Firestore reconcile notice:', error);
    return false;
  }
}
