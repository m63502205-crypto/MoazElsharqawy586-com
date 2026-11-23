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
      if (!existingTs || (Boolean(cloudTs) && cloudTs > existingTs)) {
        map.set(key, raw);
      }
    }
  }

  return Array.from(map.values());
}

export async function hydratePortalDataFromFirestore(baseData: PublicPortalData): Promise<PublicPortalData> {
  try {
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
        return { id: v.id || d.id, data: v.data || {}, updatedAt: String(v.updatedAt || '') };
      });

    let nextSettings: SiteSettings = { ...baseData.settings };
    let nextLiveStream: LiveStream = baseData.liveStream
      ? { ...baseData.liveStream }
      : { id: 'live-1', title: '', description: '', streamUrl: '', isActive: false, platform: 'youtube' };

    for (const cfgDoc of siteConfigSnap.docs) {
      const cfg: any = cfgDoc.data();
      if (cfgDoc.id === 'public' && cfg.data) {
        const cloudSettings = cfg.data as Partial<SiteSettings>;
        const cloudUpdated = String(cloudSettings.updatedAt || cfg.updatedAt || '');
        const localUpdated = String(nextSettings.updatedAt || '');
        const isPreUpgradeSnapshot =
          (cloudSettings.rosterVersion || 0) < 9 && (!cloudUpdated || cloudUpdated < SEO_UPGRADE_CUTOFF_ISO);
        const isNewerThanLocal = !localUpdated || (Boolean(cloudUpdated) && cloudUpdated > localUpdated);
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
      } else if (cfgDoc.id === 'livestream' && cfg.data) {
        const cloudLiveUpdated = String(cfg.data.updatedAt || cfg.updatedAt || '');
        const localLiveUpdated = String(nextLiveStream.updatedAt || '');
        if (!localLiveUpdated || (Boolean(cloudLiveUpdated) && cloudLiveUpdated > localLiveUpdated)) {
          nextLiveStream = { ...nextLiveStream, ...cfg.data };
        }
      }
    }

    return {
      ...baseData,
      settings: nextSettings,
      liveStream: nextLiveStream,
      partyLeaders: mergeCollectionWithTombstones('party_leaders', baseData.partyLeaders, toRecords(partyLeadersSnap), tombstones)
        .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)),
      secretariatLeaders: mergeCollectionWithTombstones('secretariat_leaders', baseData.secretariatLeaders, toRecords(secretariatLeadersSnap), tombstones)
        .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)),
      specializedSecretariats: mergeCollectionWithTombstones('secretariats', baseData.specializedSecretariats, toRecords(secretariatsSnap), tombstones, true)
        .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)),
      secretariatMembers: mergeCollectionWithTombstones('secretariat_members', baseData.secretariatMembers, toRecords(secretariatMembersSnap), tombstones),
      initiatives: mergeCollectionWithTombstones('initiatives', baseData.initiatives, toRecords(initiativesSnap), tombstones),
      news: mergeCollectionWithTombstones('news', baseData.news, toRecords(newsSnap), tombstones),
      events: mergeCollectionWithTombstones('events', baseData.events, toRecords(eventsSnap), tombstones),
      media: mergeCollectionWithTombstones('media', baseData.media, toRecords(mediaSnap), tombstones),
      pages: mergeCollectionWithTombstones('pages', baseData.pages || [], toRecords(pagesSnap), tombstones)
    };
  } catch (error) {
    console.warn('Firestore hydration fallback to server data:', error);
    return baseData;
  }
}

export function subscribePublicFirestoreChanges(onChange: () => void): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let initialBurst = new Set<string>();

  const scheduleRefresh = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      onChange();
    }, 350);
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
          console.warn(`Firestore listener notice (${colName}):`, err?.message || err);
        }
      );
      unsubs.push(u);
    } catch {
      // ignore
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
