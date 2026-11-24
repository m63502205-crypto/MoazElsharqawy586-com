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
  type QuerySnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { LiveStream, PublicPortalData, SiteSettings } from '../types';

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

export const PRIVATE_COLLECTIONS: PrivateCollectionName[] = [
  'applications',
  'members',
  'roles',
  'admin_users',
  'audit_logs',
  'subscribers',
  'email_dispatch_logs'
];

const SEO_UPGRADE_CUTOFF_ISO = '2026-11-23T15:00:00.000Z';
const LIVE_SYNC_CHANNEL_NAME = 'nfp_portal_live_sync';

export interface CloudDocRecord {
  id: string;
  data: any;
  updatedAt: string;
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

// ============================================================================
// REAL-TIME IN-MEMORY LIVE MERGE ENGINE
// ============================================================================

const liveCloudCollections = new Map<string, CloudDocRecord[]>();
const livePrivateCollections = new Map<string, CloudDocRecord[]>();
const liveLoadedCols = new Set<string>();
const liveForceOverrideDocs = new Map<string, Map<string, CloudDocRecord>>();
const liveRemovedDocKeys = new Set<string>();

let liveBasePublicData: PublicPortalData | null = null;
let liveBaseAdminDb: any | null = null;

type PublicLiveListener = (merged: PublicPortalData) => void;
type AdminLiveListener = {
  onMergedDb: (mergedDb: any, changedCols: string[]) => void;
  onLocalBroadcast?: () => void;
};

const publicLiveListeners = new Set<PublicLiveListener>();
const adminLiveListeners = new Set<AdminLiveListener>();
let activePublicUnsubs: Unsubscribe[] = [];
let activePrivateUnsubs: Unsubscribe[] = [];
let publicBroadcastTimer: ReturnType<typeof setTimeout> | null = null;
let broadcastChannel: BroadcastChannel | null = null;
let broadcastListenerAttached = false;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(LIVE_SYNC_CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return broadcastChannel;
}

function logFirestoreSnapshotError(error: unknown, path: string): void {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType: OperationType.GET,
    path,
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null
    }
  };
  console.warn('Firestore live listener notice:', JSON.stringify(errInfo));
}

function getPublicFieldForCollection(col: PublicCollectionName): keyof PublicPortalData {
  switch (col) {
    case 'party_leaders':
      return 'partyLeaders';
    case 'secretariat_leaders':
      return 'secretariatLeaders';
    case 'secretariats':
      return 'specializedSecretariats';
    case 'secretariat_members':
      return 'secretariatMembers';
    case 'initiatives':
      return 'initiatives';
    case 'news':
      return 'news';
    case 'events':
      return 'events';
    case 'media':
      return 'media';
    case 'pages':
      return 'pages';
  }
}

function getPrivateFieldForCollection(col: PrivateCollectionName): string {
  switch (col) {
    case 'applications':
      return 'applications';
    case 'members':
      return 'members';
    case 'roles':
      return 'roles';
    case 'admin_users':
      return 'admins';
    case 'audit_logs':
      return 'auditLogs';
    case 'subscribers':
      return 'subscribers';
    case 'email_dispatch_logs':
      return 'emailDispatchLogs';
  }
}

function markDocRemovedInSession(col: string, rawId: string) {
  if (!rawId) return;
  const safeId = toFirestoreDocId(rawId);
  liveRemovedDocKeys.add(`${col}:${rawId}`);
  liveRemovedDocKeys.add(`${col}:${safeId}`);
  const colOverrides = liveForceOverrideDocs.get(col);
  if (colOverrides) {
    colOverrides.delete(rawId);
    colOverrides.delete(safeId);
  }
}

function markDocUpsertedInSession(col: string, record: CloudDocRecord) {
  if (!record) return;
  const rawId = String(record.data?.id || record.id || '');
  if (!rawId) return;
  const safeId = toFirestoreDocId(rawId);
  liveRemovedDocKeys.delete(`${col}:${rawId}`);
  liveRemovedDocKeys.delete(`${col}:${safeId}`);

  let colOverrides = liveForceOverrideDocs.get(col);
  if (!colOverrides) {
    colOverrides = new Map();
    liveForceOverrideDocs.set(col, colOverrides);
  }
  colOverrides.set(rawId, record);
  colOverrides.set(safeId, record);
}

function extractTombstoneSet(
  siteConfigDocs: CloudDocRecord[],
  extraTombstones?: string[]
): Set<string> {
  const tombstones = new Set<string>(liveRemovedDocKeys);
  const tombDoc = siteConfigDocs.find(d => d.id === 'portal_tombstones');
  const rawList = tombDoc?.data?.deletedKeys;
  if (Array.isArray(rawList)) {
    for (const k of rawList) {
      if (typeof k === 'string' && k) tombstones.add(k);
    }
  }
  if (Array.isArray(extraTombstones)) {
    for (const k of extraTombstones) {
      if (typeof k === 'string' && k) tombstones.add(k);
    }
  }
  return tombstones;
}

function mergeCollectionWithTombstones(
  col: string,
  localItems: any[],
  cloudDocs: CloudDocRecord[],
  tombstones: Set<string>,
  matchBySlug = false
): any[] {
  const isDeleted = (item: any, docId?: string) => {
    const rawId = String(item?.id || docId || '');
    if (!rawId) return true;
    const safeId = toFirestoreDocId(rawId);
    return tombstones.has(`${col}:${rawId}`) || tombstones.has(`${col}:${safeId}`);
  };

  const colOverrides = liveForceOverrideDocs.get(col);
  const map = new Map<string, any>();

  for (const item of localItems || []) {
    if (!item || !item.id || isDeleted(item)) continue;
    const key = matchBySlug && item.slug ? `slug:${item.slug}` : `id:${item.id}`;
    map.set(key, item);
  }

  for (const docItem of cloudDocs) {
    const raw = docItem.data;
    if (!raw || !raw.id || isDeleted(raw, docItem.id)) continue;
    const key = matchBySlug && raw.slug ? `slug:${raw.slug}` : `id:${raw.id}`;
    const existing = map.get(key);
    const hasLiveOverride =
      colOverrides?.has(String(raw.id)) || colOverrides?.has(String(docItem.id));

    if (!existing || hasLiveOverride) {
      map.set(key, raw);
    } else {
      const existingTs = String(existing.updatedAt || existing.createdAt || '');
      const cloudTs = String(raw.updatedAt || docItem.updatedAt || '');
      if (!existingTs || (Boolean(cloudTs) && cloudTs > existingTs)) {
        map.set(key, raw);
      }
    }
  }

  return Array.from(map.values());
}

function mergeSiteConfigIntoBase(
  baseSettings: SiteSettings,
  baseLiveStream: LiveStream | undefined,
  siteConfigDocs: CloudDocRecord[]
): { settings: SiteSettings; liveStream: LiveStream } {
  let nextSettings: SiteSettings = { ...baseSettings };
  let nextLiveStream: LiveStream = baseLiveStream
    ? { ...baseLiveStream }
    : { id: 'live-1', title: '', description: '', streamUrl: '', isActive: false, platform: 'youtube' };

  const cfgOverrides = liveForceOverrideDocs.get('site_config');

  for (const cfgDoc of siteConfigDocs) {
    if (cfgDoc.id === 'public' && cfgDoc.data) {
      const cloudSettings = cfgDoc.data as Partial<SiteSettings>;
      const cloudUpdated = String(cloudSettings.updatedAt || cfgDoc.updatedAt || '');
      const localUpdated = String(nextSettings.updatedAt || '');
      const isPreUpgradeSnapshot =
        (cloudSettings.rosterVersion || 0) < 9 && (!cloudUpdated || cloudUpdated < SEO_UPGRADE_CUTOFF_ISO);
      const hasLiveOverride = Boolean(cfgOverrides?.has('public'));
      const isNewerThanLocal =
        hasLiveOverride || !localUpdated || (Boolean(cloudUpdated) && cloudUpdated > localUpdated);

      if (isNewerThanLocal) {
        nextSettings = {
          ...nextSettings,
          ...cloudSettings,
          seoTitle: isPreUpgradeSnapshot ? nextSettings.seoTitle : (cloudSettings.seoTitle || nextSettings.seoTitle),
          officialSiteUrl: isPreUpgradeSnapshot ? nextSettings.officialSiteUrl : (cloudSettings.officialSiteUrl || nextSettings.officialSiteUrl),
          googleAnalyticsId: cloudSettings.googleAnalyticsId || nextSettings.googleAnalyticsId,
          googleTagManagerId: cloudSettings.googleTagManagerId || nextSettings.googleTagManagerId,
          googleSiteVerification: cloudSettings.googleSiteVerification || nextSettings.googleSiteVerification
        };
      }
    } else if (cfgDoc.id === 'livestream' && cfgDoc.data) {
      const cloudLiveUpdated = String(cfgDoc.data.updatedAt || cfgDoc.updatedAt || '');
      const localLiveUpdated = String(nextLiveStream.updatedAt || '');
      const hasLiveOverride = Boolean(cfgOverrides?.has('livestream'));
      if (hasLiveOverride || !localLiveUpdated || (Boolean(cloudLiveUpdated) && cloudLiveUpdated > localLiveUpdated)) {
        nextLiveStream = { ...nextLiveStream, ...cfgDoc.data };
      }
    }
  }

  return { settings: nextSettings, liveStream: nextLiveStream };
}

export function mergePublicPortalWithLiveCache(baseData: PublicPortalData): PublicPortalData {
  const siteConfigDocs = liveCloudCollections.get('site_config') || [];
  const tombstones = extractTombstoneSet(siteConfigDocs, baseData.deletedTombstones);
  const { settings, liveStream } = mergeSiteConfigIntoBase(baseData.settings, baseData.liveStream, siteConfigDocs);

  const mergedPartyLeaders = mergeCollectionWithTombstones(
    'party_leaders',
    baseData.partyLeaders,
    liveCloudCollections.get('party_leaders') || [],
    tombstones
  )
    .filter(l => l.isVisible !== false)
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

  const mergedSecretariatLeaders = mergeCollectionWithTombstones(
    'secretariat_leaders',
    baseData.secretariatLeaders,
    liveCloudCollections.get('secretariat_leaders') || [],
    tombstones
  )
    .filter(l => l.isVisible !== false)
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

  const mergedSecretariats = mergeCollectionWithTombstones(
    'secretariats',
    baseData.specializedSecretariats,
    liveCloudCollections.get('secretariats') || [],
    tombstones,
    true
  )
    .filter(s => s.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

  const mergedSecretariatMembers = mergeCollectionWithTombstones(
    'secretariat_members',
    baseData.secretariatMembers,
    liveCloudCollections.get('secretariat_members') || [],
    tombstones
  );

  const mergedInitiatives = mergeCollectionWithTombstones(
    'initiatives',
    baseData.initiatives,
    liveCloudCollections.get('initiatives') || [],
    tombstones
  ).filter(i => i.isVisible !== false);

  const mergedNews = mergeCollectionWithTombstones(
    'news',
    baseData.news,
    liveCloudCollections.get('news') || [],
    tombstones
  )
    .filter(n => !n.isDraft)
    .sort(
      (a, b) =>
        new Date(b.publishDate || b.createdAt || 0).getTime() -
        new Date(a.publishDate || a.createdAt || 0).getTime()
    );

  const mergedEvents = mergeCollectionWithTombstones(
    'events',
    baseData.events,
    liveCloudCollections.get('events') || [],
    tombstones
  )
    .filter(e => e.isVisible !== false)
    .sort(
      (a, b) =>
        new Date(b.dateTime || b.createdAt || 0).getTime() -
        new Date(a.dateTime || a.createdAt || 0).getTime()
    );

  const mergedMedia = mergeCollectionWithTombstones(
    'media',
    baseData.media,
    liveCloudCollections.get('media') || [],
    tombstones
  )
    .filter(m => m.isVisible !== false)
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

  const mergedPages = mergeCollectionWithTombstones(
    'pages',
    baseData.pages || [],
    liveCloudCollections.get('pages') || [],
    tombstones
  ).filter(p => p.isPublished !== false);

  return {
    ...baseData,
    settings,
    liveStream,
    partyLeaders: mergedPartyLeaders,
    secretariatLeaders: mergedSecretariatLeaders,
    specializedSecretariats: mergedSecretariats,
    secretariatMembers: mergedSecretariatMembers,
    initiatives: mergedInitiatives,
    news: mergedNews,
    events: mergedEvents,
    media: mergedMedia,
    pages: mergedPages,
    deletedTombstones: Array.from(tombstones)
  };
}

export function mergeAdminDbWithLiveCache(baseAdminDb: any): any {
  if (!baseAdminDb) return baseAdminDb;
  const siteConfigDocs = liveCloudCollections.get('site_config') || [];
  const tombstones = extractTombstoneSet(siteConfigDocs, baseAdminDb.deletedTombstones);
  const { settings, liveStream } = mergeSiteConfigIntoBase(
    baseAdminDb.settings || {},
    baseAdminDb.liveStream,
    siteConfigDocs
  );

  const nextDb: any = {
    ...baseAdminDb,
    settings,
    liveStream,
    partyLeaders: mergeCollectionWithTombstones(
      'party_leaders',
      baseAdminDb.partyLeaders || [],
      liveCloudCollections.get('party_leaders') || [],
      tombstones
    ).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)),
    secretariatLeaders: mergeCollectionWithTombstones(
      'secretariat_leaders',
      baseAdminDb.secretariatLeaders || [],
      liveCloudCollections.get('secretariat_leaders') || [],
      tombstones
    ).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)),
    specializedSecretariats: mergeCollectionWithTombstones(
      'secretariats',
      baseAdminDb.specializedSecretariats || [],
      liveCloudCollections.get('secretariats') || [],
      tombstones,
      true
    ).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)),
    secretariatMembers: mergeCollectionWithTombstones(
      'secretariat_members',
      baseAdminDb.secretariatMembers || [],
      liveCloudCollections.get('secretariat_members') || [],
      tombstones
    ),
    initiatives: mergeCollectionWithTombstones(
      'initiatives',
      baseAdminDb.initiatives || [],
      liveCloudCollections.get('initiatives') || [],
      tombstones
    ),
    news: mergeCollectionWithTombstones(
      'news',
      baseAdminDb.news || [],
      liveCloudCollections.get('news') || [],
      tombstones
    ).sort(
      (a, b) =>
        new Date(b.publishDate || b.createdAt || 0).getTime() -
        new Date(a.publishDate || a.createdAt || 0).getTime()
    ),
    events: mergeCollectionWithTombstones(
      'events',
      baseAdminDb.events || [],
      liveCloudCollections.get('events') || [],
      tombstones
    ).sort(
      (a, b) =>
        new Date(b.dateTime || b.createdAt || 0).getTime() -
        new Date(a.dateTime || a.createdAt || 0).getTime()
    ),
    media: mergeCollectionWithTombstones(
      'media',
      baseAdminDb.media || [],
      liveCloudCollections.get('media') || [],
      tombstones
    ).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)),
    pages: mergeCollectionWithTombstones(
      'pages',
      baseAdminDb.pages || [],
      liveCloudCollections.get('pages') || [],
      tombstones
    )
  };

  if (isFirebaseAdminReady()) {
    for (const privCol of PRIVATE_COLLECTIONS) {
      const cloudPriv = livePrivateCollections.get(privCol);
      if (!cloudPriv) continue;
      const field = getPrivateFieldForCollection(privCol);
      nextDb[field] = mergeCollectionWithTombstones(
        privCol,
        baseAdminDb[field] || [],
        cloudPriv,
        tombstones
      );
    }
  }

  return nextDb;
}

function emitLivePublicPortal() {
  if (!liveBasePublicData || publicLiveListeners.size === 0) return;
  const merged = mergePublicPortalWithLiveCache(liveBasePublicData);
  publicLiveListeners.forEach(listener => {
    try {
      listener(merged);
    } catch (err) {
      console.warn('Public live subscriber callback error:', err);
    }
  });
}

function emitLiveAdminDb(changedCols: string[]) {
  if (!liveBaseAdminDb || adminLiveListeners.size === 0) return;
  const merged = mergeAdminDbWithLiveCache(liveBaseAdminDb);
  adminLiveListeners.forEach(listener => {
    try {
      listener.onMergedDb(merged, changedCols);
    } catch (err) {
      console.warn('Admin live subscriber callback error:', err);
    }
  });
}

function scheduleCoalescedEmit(changedCols: string[], immediate: boolean) {
  if (immediate) {
    if (publicBroadcastTimer) {
      clearTimeout(publicBroadcastTimer);
      publicBroadcastTimer = null;
    }
    emitLivePublicPortal();
    emitLiveAdminDb(changedCols);
    return;
  }

  if (publicBroadcastTimer) clearTimeout(publicBroadcastTimer);
  publicBroadcastTimer = setTimeout(() => {
    publicBroadcastTimer = null;
    emitLivePublicPortal();
    emitLiveAdminDb(changedCols);
  }, 50);
}

function snapshotToRecords(snap: QuerySnapshot): CloudDocRecord[] {
  return snap.docs.map(d => {
    const v: any = d.data();
    return {
      id: String(v.id || d.id),
      data: v.data || {},
      updatedAt: String(v.updatedAt || '')
    };
  });
}

function handleSnapshotUpdate(colName: string, snap: QuerySnapshot, isPrivate = false) {
  const isInitialForCol = !liveLoadedCols.has(colName);
  const records = snapshotToRecords(snap);

  if (isPrivate) {
    livePrivateCollections.set(colName, records);
  } else {
    liveCloudCollections.set(colName, records);
  }

  if (isInitialForCol) {
    liveLoadedCols.add(colName);
    scheduleCoalescedEmit([colName], false);
    return;
  }

  for (const change of snap.docChanges()) {
    const d = change.doc;
    const val: any = d.data();
    const rec: CloudDocRecord = {
      id: String(val?.id || d.id),
      data: val?.data || {},
      updatedAt: String(val?.updatedAt || '')
    };

    if (change.type === 'removed') {
      const rawId = String(rec.data?.id || rec.id || d.id);
      markDocRemovedInSession(colName, rawId);
      if (colName !== 'site_config') {
        if (!isPrivate && liveBasePublicData) {
          const field = getPublicFieldForCollection(colName as PublicCollectionName);
          const curArr = (liveBasePublicData as any)[field];
          if (Array.isArray(curArr)) {
            (liveBasePublicData as any)[field] = curArr.filter(
              (item: any) => item?.id !== rawId && toFirestoreDocId(String(item?.id || '')) !== toFirestoreDocId(rawId)
            );
          }
        }
        if (liveBaseAdminDb) {
          const field = isPrivate
            ? getPrivateFieldForCollection(colName as PrivateCollectionName)
            : getPublicFieldForCollection(colName as PublicCollectionName);
          const curArr = liveBaseAdminDb[field];
          if (Array.isArray(curArr)) {
            liveBaseAdminDb[field] = curArr.filter(
              (item: any) => item?.id !== rawId && toFirestoreDocId(String(item?.id || '')) !== toFirestoreDocId(rawId)
            );
          }
        }
      }
    } else if (change.type === 'added' || change.type === 'modified') {
      markDocUpsertedInSession(colName, rec);
    }
  }

  // Emit immediately so React UI components update with zero reload or delay
  scheduleCoalescedEmit([colName], true);
}

function ensureSharedListenersStarted() {
  if (typeof window !== 'undefined' && !broadcastListenerAttached) {
    broadcastListenerAttached = true;
    const ch = getBroadcastChannel();
    if (ch) {
      ch.onmessage = () => {
        emitLivePublicPortal();
        adminLiveListeners.forEach(l => l.onLocalBroadcast?.());
      };
    }
  }

  if (activePublicUnsubs.length === 0) {
    const watchCols = ['site_config', ...PUBLIC_COLLECTIONS];
    for (const colName of watchCols) {
      try {
        const q = query(collection(db, colName), where('isPublic', '==', true));
        const unsub = onSnapshot(
          q,
          snap => handleSnapshotUpdate(colName, snap, false),
          err => logFirestoreSnapshotError(err, colName)
        );
        activePublicUnsubs.push(unsub);
      } catch {
        // ignore setup failure
      }
    }
  }

  if (adminLiveListeners.size > 0 && isFirebaseAdminReady() && activePrivateUnsubs.length === 0) {
    for (const privCol of PRIVATE_COLLECTIONS) {
      try {
        const unsub = onSnapshot(
          collection(db, privCol),
          snap => handleSnapshotUpdate(privCol, snap, true),
          err => logFirestoreSnapshotError(err, privCol)
        );
        activePrivateUnsubs.push(unsub);
      } catch {
        // ignore setup failure
      }
    }
  }
}

function cleanupUnusedSharedListeners() {
  if (publicLiveListeners.size === 0 && adminLiveListeners.size === 0) {
    activePublicUnsubs.forEach(u => u());
    activePublicUnsubs = [];
  }
  if (adminLiveListeners.size === 0 || !isFirebaseAdminReady()) {
    activePrivateUnsubs.forEach(u => u());
    activePrivateUnsubs = [];
  }
}

export function setLiveBasePublicData(baseData: PublicPortalData): void {
  if (!baseData) return;
  liveBasePublicData = baseData;
}

export function setLiveBaseAdminDb(fullDb: any): void {
  if (!fullDb) return;
  liveBaseAdminDb = fullDb;
}

export function notifyLocalPortalMutation(source?: string): void {
  const ch = getBroadcastChannel();
  if (ch) {
    try {
      ch.postMessage({ type: 'mutation', source: source || 'local', at: Date.now() });
    } catch {
      // ignore
    }
  }
}

export function applyLocalPublicMutation(
  col: PublicCollectionName,
  mode: 'upsert' | 'delete',
  recordOrId: any
): void {
  if (!recordOrId) return;

  if (mode === 'delete') {
    const rawId = String(recordOrId);
    markDocRemovedInSession(col, rawId);
    const existingCloud = liveCloudCollections.get(col);
    if (existingCloud) {
      const safeId = toFirestoreDocId(rawId);
      liveCloudCollections.set(
        col,
        existingCloud.filter(c => c.id !== safeId && c.data?.id !== rawId)
      );
    }
    const field = getPublicFieldForCollection(col);
    if (liveBasePublicData) {
      const cur = (liveBasePublicData as any)[field];
      if (Array.isArray(cur)) {
        (liveBasePublicData as any)[field] = cur.filter(
          (i: any) => i?.id !== rawId && toFirestoreDocId(String(i?.id || '')) !== toFirestoreDocId(rawId)
        );
      }
      const nextTombs = new Set<string>(liveBasePublicData.deletedTombstones || []);
      nextTombs.add(`${col}:${rawId}`);
      nextTombs.add(`${col}:${toFirestoreDocId(rawId)}`);
      liveBasePublicData.deletedTombstones = Array.from(nextTombs);
    }
    if (liveBaseAdminDb) {
      const cur = liveBaseAdminDb[field];
      if (Array.isArray(cur)) {
        liveBaseAdminDb[field] = cur.filter(
          (i: any) => i?.id !== rawId && toFirestoreDocId(String(i?.id || '')) !== toFirestoreDocId(rawId)
        );
      }
    }
  } else if (recordOrId?.id) {
    const safeId = toFirestoreDocId(String(recordOrId.id));
    const rec: CloudDocRecord = {
      id: safeId,
      data: recordOrId,
      updatedAt: String(recordOrId.updatedAt || recordOrId.createdAt || new Date().toISOString())
    };
    markDocUpsertedInSession(col, rec);
    const existingCloud = liveCloudCollections.get(col) || [];
    const idx = existingCloud.findIndex(c => c.id === safeId || c.data?.id === recordOrId.id);
    const nextCloud = [...existingCloud];
    if (idx >= 0) nextCloud[idx] = rec;
    else nextCloud.push(rec);
    liveCloudCollections.set(col, nextCloud);

    const field = getPublicFieldForCollection(col);
    const upsertInArr = (arr: any[]) => {
      const existingIdx = arr.findIndex((i: any) => i?.id === recordOrId.id);
      if (existingIdx >= 0) {
        const copy = [...arr];
        copy[existingIdx] = recordOrId;
        return copy;
      }
      return [recordOrId, ...arr];
    };
    if (liveBasePublicData && Array.isArray((liveBasePublicData as any)[field])) {
      (liveBasePublicData as any)[field] = upsertInArr((liveBasePublicData as any)[field]);
    }
    if (liveBaseAdminDb && Array.isArray(liveBaseAdminDb[field])) {
      liveBaseAdminDb[field] = upsertInArr(liveBaseAdminDb[field]);
    }
  }

  emitLivePublicPortal();
  notifyLocalPortalMutation(col);
}

export function applyLocalSiteConfigMutation(configId: 'public' | 'livestream', payload: any): void {
  if (!payload) return;
  const nowIso = String(payload.updatedAt || new Date().toISOString());
  const rec: CloudDocRecord = { id: configId, data: payload, updatedAt: nowIso };
  markDocUpsertedInSession('site_config', rec);

  const existingSiteCfg = liveCloudCollections.get('site_config') || [];
  const nextSiteCfg = [...existingSiteCfg.filter(d => d.id !== configId), rec];
  liveCloudCollections.set('site_config', nextSiteCfg);

  if (configId === 'public') {
    if (liveBasePublicData) {
      liveBasePublicData = { ...liveBasePublicData, settings: { ...liveBasePublicData.settings, ...payload } };
    }
    if (liveBaseAdminDb) {
      liveBaseAdminDb = { ...liveBaseAdminDb, settings: { ...liveBaseAdminDb.settings, ...payload } };
    }
  } else {
    if (liveBasePublicData) {
      liveBasePublicData = { ...liveBasePublicData, liveStream: { ...liveBasePublicData.liveStream, ...payload } };
    }
    if (liveBaseAdminDb) {
      liveBaseAdminDb = { ...liveBaseAdminDb, liveStream: { ...liveBaseAdminDb.liveStream, ...payload } };
    }
  }

  emitLivePublicPortal();
  notifyLocalPortalMutation(`site_config:${configId}`);
}

export async function hydratePortalDataFromFirestore(baseData: PublicPortalData): Promise<PublicPortalData> {
  setLiveBasePublicData(baseData);
  try {
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

    liveCloudCollections.set('site_config', snapshotToRecords(siteConfigSnap));
    liveCloudCollections.set('party_leaders', snapshotToRecords(partyLeadersSnap));
    liveCloudCollections.set('secretariat_leaders', snapshotToRecords(secretariatLeadersSnap));
    liveCloudCollections.set('secretariats', snapshotToRecords(secretariatsSnap));
    liveCloudCollections.set('secretariat_members', snapshotToRecords(secretariatMembersSnap));
    liveCloudCollections.set('initiatives', snapshotToRecords(initiativesSnap));
    liveCloudCollections.set('news', snapshotToRecords(newsSnap));
    liveCloudCollections.set('events', snapshotToRecords(eventsSnap));
    liveCloudCollections.set('media', snapshotToRecords(mediaSnap));
    liveCloudCollections.set('pages', snapshotToRecords(pagesSnap));

    return mergePublicPortalWithLiveCache(baseData);
  } catch (error) {
    console.warn('Firestore hydration fallback to server data:', error);
    return baseData;
  }
}

export function subscribeLivePublicPortal(onUpdate: PublicLiveListener): Unsubscribe {
  publicLiveListeners.add(onUpdate);
  ensureSharedListenersStarted();

  if (liveBasePublicData && liveLoadedCols.size > 0) {
    try {
      onUpdate(mergePublicPortalWithLiveCache(liveBasePublicData));
    } catch {
      // ignore
    }
  }

  return () => {
    publicLiveListeners.delete(onUpdate);
    cleanupUnusedSharedListeners();
  };
}

export function subscribeLiveAdminDatabase(options: AdminLiveListener): Unsubscribe {
  adminLiveListeners.add(options);
  ensureSharedListenersStarted();

  const handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      options.onLocalBroadcast?.();
    }
  };
  const handleFocus = () => {
    options.onLocalBroadcast?.();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleFocus);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  return () => {
    adminLiveListeners.delete(options);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleFocus);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    cleanupUnusedSharedListeners();
  };
}

export function subscribePublicFirestoreChanges(onChange: () => void): Unsubscribe {
  return subscribeLivePublicPortal(() => onChange());
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
