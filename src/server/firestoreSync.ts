import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import type { AppDatabase } from './db.ts';

const CONFIG_PATH = path.resolve(process.cwd(), 'firebase-applet-config.json');

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket?: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed?.projectId || !parsed?.apiKey || !parsed?.firestoreDatabaseId) return null;
    return parsed as FirebaseAppletConfig;
  } catch {
    return null;
  }
}

const firebaseConfig = loadFirebaseConfig();

const serverApp = firebaseConfig
  ? (getApps().find(a => a.name === 'nfp-server') || initializeApp(firebaseConfig, 'nfp-server'))
  : null;

const serverFirestore =
  serverApp && firebaseConfig
    ? getFirestore(serverApp, firebaseConfig.firestoreDatabaseId)
    : null;

function getRestBase(): string | null {
  if (!firebaseConfig) return null;
  return `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;
}

function getRestCommitUrl(): string | null {
  if (!firebaseConfig) return null;
  return `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents:commit`;
}

function getDocNamePrefix(): string | null {
  if (!firebaseConfig) return null;
  return `projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;
}

export function sanitizeFirestoreId(rawId: string): string {
  const cleaned = String(rawId || 'item')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned || 'item_' + Date.now();
}

export function filenameToAssetId(filename: string): string {
  return sanitizeFirestoreId(path.basename(filename));
}

// Convert JS value to Firestore REST API Value object
function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.filter(v => v !== undefined).map(v => toFirestoreValue(v))
      }
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return String(val.stringValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('arrayValue' in val) {
    const arr = val.arrayValue?.values;
    return Array.isArray(arr) ? arr.map(v => fromFirestoreValue(v)) : [];
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function parseFirestoreDocFields(fields: Record<string, any> | undefined): Record<string, any> {
  if (!fields) return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
}

const verifiedUserCache = new Map<string, { user: VerifiedFirebaseUser; expiresAt: number }>();

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  if (!firebaseConfig || !idToken) return null;
  const cacheKey = crypto.createHash('sha1').update(idToken).digest('hex');
  const cached = verifiedUserCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      }
    );
    if (!resp.ok) return null;
    const json: any = await resp.json();
    const user = json?.users?.[0];
    if (!user?.email) return null;
    const parsed: VerifiedFirebaseUser = {
      uid: String(user.localId),
      email: String(user.email).toLowerCase(),
      emailVerified: Boolean(user.emailVerified),
      displayName: user.displayName ? String(user.displayName) : undefined
    };
    verifiedUserCache.set(cacheKey, { user: parsed, expiresAt: Date.now() + 5 * 60 * 1000 });
    return parsed;
  } catch {
    return null;
  }
}

const BOOTSTRAPPED_ADMIN_EMAIL = 'moazmahmoud586@gmail.com';

function isAuthorizedCloudAdmin(verified: VerifiedFirebaseUser | null): boolean {
  return Boolean(verified && verified.emailVerified && verified.email === BOOTSTRAPPED_ADMIN_EMAIL);
}

// Track hashes of last known cloud documents so we only push real diffs
const cloudHashes = new Map<string, string>();
let cloudInitialized = false;
let lastPublicPullAt = 0;
let pullPromise: Promise<boolean> | null = null;

function hashObj(obj: any): string {
  return crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex');
}

function computeIsPublic(collectionName: string, item: any): boolean {
  switch (collectionName) {
    case 'party_leaders':
    case 'secretariat_leaders':
    case 'initiatives':
    case 'events':
    case 'media':
      return item.isVisible !== false;
    case 'secretariats':
      return item.isActive !== false;
    case 'news':
      return !item.isDraft;
    case 'pages':
      return item.isPublished !== false;
    case 'secretariat_members':
      return true;
    default:
      return true;
  }
}

interface CollectionMapping {
  dbKey: keyof AppDatabase;
  collectionName: string;
  isPublicCollection: boolean;
}

const COLLECTION_MAPPINGS: CollectionMapping[] = [
  { dbKey: 'partyLeaders', collectionName: 'party_leaders', isPublicCollection: true },
  { dbKey: 'secretariatLeaders', collectionName: 'secretariat_leaders', isPublicCollection: true },
  { dbKey: 'specializedSecretariats', collectionName: 'secretariats', isPublicCollection: true },
  { dbKey: 'secretariatMembers', collectionName: 'secretariat_members', isPublicCollection: true },
  { dbKey: 'initiatives', collectionName: 'initiatives', isPublicCollection: true },
  { dbKey: 'news', collectionName: 'news', isPublicCollection: true },
  { dbKey: 'events', collectionName: 'events', isPublicCollection: true },
  { dbKey: 'media', collectionName: 'media', isPublicCollection: true },
  { dbKey: 'pages', collectionName: 'pages', isPublicCollection: true },
  { dbKey: 'applications', collectionName: 'applications', isPublicCollection: false },
  { dbKey: 'members', collectionName: 'members', isPublicCollection: false },
  { dbKey: 'roles', collectionName: 'roles', isPublicCollection: false },
  { dbKey: 'admins', collectionName: 'admin_users', isPublicCollection: false },
  { dbKey: 'auditLogs', collectionName: 'audit_logs', isPublicCollection: false }
];

function buildDesiredDocEntries(dbObj: AppDatabase): Array<{ pathKey: string; collectionName: string; docId: string; payload: Record<string, any> }> {
  const now = new Date().toISOString();
  const entries: Array<{ pathKey: string; collectionName: string; docId: string; payload: Record<string, any> }> = [];

  entries.push({
    pathKey: 'site_config/public',
    collectionName: 'site_config',
    docId: 'public',
    payload: {
      id: 'public',
      isPublic: true,
      data: dbObj.settings || {},
      updatedAt: now
    }
  });

  entries.push({
    pathKey: 'site_config/livestream',
    collectionName: 'site_config',
    docId: 'livestream',
    payload: {
      id: 'livestream',
      isPublic: true,
      data: dbObj.liveStream || {},
      updatedAt: now
    }
  });

  for (const mapping of COLLECTION_MAPPINGS) {
    const rawList = (dbObj[mapping.dbKey] as any[]) || [];
    const list = mapping.collectionName === 'audit_logs' ? rawList.slice(0, 120) : rawList;
    for (const item of list) {
      if (!item || !item.id) continue;
      const docId = sanitizeFirestoreId(item.id);
      const pathKey = `${mapping.collectionName}/${docId}`;
      const payload = mapping.isPublicCollection
        ? {
            id: docId,
            isPublic: computeIsPublic(mapping.collectionName, item),
            data: item,
            updatedAt: item.updatedAt || item.createdAt || now
          }
        : {
            id: docId,
            data: item,
            updatedAt: item.updatedAt || item.timestamp || item.createdAt || now
          };
      entries.push({ pathKey, collectionName: mapping.collectionName, docId, payload });
    }
  }

  return entries;
}

async function commitWritesRest(
  writes: any[],
  idToken: string
): Promise<boolean> {
  const commitUrl = getRestCommitUrl();
  if (!commitUrl || !idToken || writes.length === 0) return false;

  const CHUNK_SIZE = 200;
  for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
    const chunk = writes.slice(i, i + CHUNK_SIZE);
    const resp = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({ writes: chunk })
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error(`[FirestoreSync] Commit failed (${resp.status}):`, errText);
      return false;
    }
  }
  return true;
}

export async function pushDatabaseDiffToFirestore(dbObj: AppDatabase, idToken: string, forceAll = false): Promise<boolean> {
  const docNamePrefix = getDocNamePrefix();
  if (!docNamePrefix || !idToken) return false;

  const verified = await verifyFirebaseIdToken(idToken);
  if (!isAuthorizedCloudAdmin(verified)) {
    return false;
  }

  const entries = buildDesiredDocEntries(dbObj);
  const currentKeys = new Set<string>();
  const writes: any[] = [];
  const nextHashes = new Map<string, string>();

  for (const entry of entries) {
    currentKeys.add(entry.pathKey);
    const contentToHash = entry.payload.data ?? entry.payload;
    const sig = hashObj({ isPublic: entry.payload.isPublic, content: contentToHash });
    nextHashes.set(entry.pathKey, sig);

    if (forceAll || cloudHashes.get(entry.pathKey) !== sig) {
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(entry.payload)) {
        fields[k] = toFirestoreValue(v);
      }
      writes.push({
        update: {
          name: `${docNamePrefix}/${entry.pathKey}`,
          fields
        }
      });
    }
  }

  // Delete removed docs that were previously known in Firestore
  for (const existingKey of cloudHashes.keys()) {
    if (!currentKeys.has(existingKey)) {
      if (existingKey.startsWith('uploads_public/')) continue;
      writes.push({
        delete: `${docNamePrefix}/${existingKey}`
      });
    }
  }

  if (writes.length === 0) {
    return true;
  }

  const ok = await commitWritesRest(writes, idToken);
  if (ok) {
    // Replace tracked hashes (preserving uploads_public entries if any)
    for (const k of Array.from(cloudHashes.keys())) {
      if (!k.startsWith('uploads_public/')) {
        cloudHashes.delete(k);
      }
    }
    for (const [k, v] of nextHashes.entries()) {
      cloudHashes.set(k, v);
    }
    cloudInitialized = true;
  }
  return ok;
}

export async function syncUploadAssetToFirestore(
  filename: string,
  mime: string,
  base64Data: string,
  idToken: string
): Promise<boolean> {
  const docNamePrefix = getDocNamePrefix();
  if (!docNamePrefix || !idToken) return false;
  const verified = await verifyFirebaseIdToken(idToken);
  if (!isAuthorizedCloudAdmin(verified)) return false;
  if (base64Data.length > 880000) {
    return false;
  }
  const assetId = filenameToAssetId(filename);
  const fields = {
    id: toFirestoreValue(assetId),
    mime: toFirestoreValue(mime),
    dataBase64: toFirestoreValue(base64Data),
    isPublic: toFirestoreValue(true),
    createdAt: toFirestoreValue(new Date().toISOString())
  };
  return commitWritesRest(
    [
      {
        update: {
          name: `${docNamePrefix}/uploads_public/${assetId}`,
          fields
        }
      }
    ],
    idToken
  );
}

export async function fetchUploadAssetFromFirestore(
  filename: string
): Promise<{ mime: string; buffer: Buffer } | null> {
  if (!serverFirestore) return null;
  try {
    const assetId = filenameToAssetId(filename);
    const snap = await getDoc(doc(serverFirestore, 'uploads_public', assetId));
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    if (!data?.dataBase64 || !data?.mime) return null;
    return {
      mime: String(data.mime),
      buffer: Buffer.from(String(data.dataBase64), 'base64')
    };
  } catch (err) {
    console.error('[FirestoreSync] Failed fetching upload asset:', err);
    return null;
  }
}

export async function ensureAdminRegistryDoc(user: VerifiedFirebaseUser, idToken: string): Promise<void> {
  const docNamePrefix = getDocNamePrefix();
  if (!docNamePrefix || !idToken || !user.uid) return;
  const uid = sanitizeFirestoreId(user.uid);
  const fields = {
    uid: toFirestoreValue(uid),
    email: toFirestoreValue(user.email),
    role: toFirestoreValue(user.email === 'moazmahmoud586@gmail.com' ? 'super_admin' : 'sub_admin'),
    createdAt: toFirestoreValue(new Date().toISOString())
  };
  await commitWritesRest(
    [
      {
        update: {
          name: `${docNamePrefix}/admins/${uid}`,
          fields
        }
      }
    ],
    idToken
  );
}

// Fetch ALL documents in a collection via REST with Admin idToken (supports pagination cleanly)
async function listCollectionRest(collectionName: string, idToken: string): Promise<Array<{ docId: string; doc: Record<string, any> }>> {
  const base = getRestBase();
  if (!base || !idToken) return [];
  const results: Array<{ docId: string; doc: Record<string, any> }> = [];
  let pageToken = '';

  do {
    const url = `${base}/${collectionName}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` }
    });
    if (!resp.ok) {
      if (resp.status === 404) return [];
      const errText = await resp.text().catch(() => '');
      throw new Error(`Firestore list ${collectionName} failed (${resp.status}): ${errText}`);
    }
    const json: any = await resp.json();
    const docs = Array.isArray(json.documents) ? json.documents : [];
    for (const d of docs) {
      const nameParts = String(d.name || '').split('/');
      const docId = nameParts[nameParts.length - 1] || '';
      const parsed = parseFirestoreDocFields(d.fields);
      results.push({ docId, doc: parsed });
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);

  return results;
}

function sortCollectionItems(collectionName: string, items: any[]): any[] {
  const copy = [...items];
  switch (collectionName) {
    case 'party_leaders':
    case 'secretariat_leaders':
    case 'secretariats':
    case 'media':
      return copy.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    case 'news':
      return copy.sort((a, b) => new Date(b.publishDate || b.createdAt || 0).getTime() - new Date(a.publishDate || a.createdAt || 0).getTime());
    case 'events':
      return copy.sort((a, b) => new Date(b.dateTime || b.createdAt || 0).getTime() - new Date(a.dateTime || a.createdAt || 0).getTime());
    case 'applications':
      return copy.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    case 'audit_logs':
      return copy.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    default:
      return copy;
  }
}

// Merge public Firestore data into current DB (non-destructive for private/local drafts)
export async function pullPublicFromFirestore(currentDb: AppDatabase): Promise<AppDatabase | null> {
  if (!serverFirestore) return null;

  try {
    const configSnap = await getDoc(doc(serverFirestore, 'site_config', 'public'));
    if (!configSnap.exists()) {
      cloudInitialized = false;
      return null;
    }

    cloudInitialized = true;
    const updated: AppDatabase = { ...currentDb };
    const configData = configSnap.data() as any;
    if (configData?.data) {
      updated.settings = {
        ...updated.settings,
        ...configData.data,
        rosterVersion: Number(configData.data.rosterVersion || 0)
      };
      cloudHashes.set('site_config/public', hashObj({ isPublic: true, content: configData.data }));
    }

    const liveSnap = await getDoc(doc(serverFirestore, 'site_config', 'livestream'));
    if (liveSnap.exists()) {
      const liveData = liveSnap.data() as any;
      if (liveData?.data) {
        updated.liveStream = { ...updated.liveStream, ...liveData.data };
        cloudHashes.set('site_config/livestream', hashObj({ isPublic: true, content: liveData.data }));
      }
    }

    const publicMappings = COLLECTION_MAPPINGS.filter(m => m.isPublicCollection);
    await Promise.all(
      publicMappings.map(async m => {
        const q = query(collection(serverFirestore, m.collectionName), where('isPublic', '==', true));
        const snap = await getDocs(q);
        const cloudItems: any[] = [];
        const cloudPublicIds = new Set<string>();

        snap.forEach(docSnap => {
          const d = docSnap.data() as any;
          if (d?.data) {
            cloudItems.push(d.data);
            cloudPublicIds.add(docSnap.id);
            cloudHashes.set(`${m.collectionName}/${docSnap.id}`, hashObj({ isPublic: true, content: d.data }));
          }
        });

        // Keep any hidden/draft local items while replacing public items with authoritative cloud public items
        const existingPrivateOrDrafts = ((currentDb[m.dbKey] as any[]) || []).filter(item => {
          if (!item?.id) return false;
          const sid = sanitizeFirestoreId(item.id);
          return !cloudPublicIds.has(sid) && !computeIsPublic(m.collectionName, item);
        });

        (updated[m.dbKey] as any) = sortCollectionItems(m.collectionName, [...cloudItems, ...existingPrivateOrDrafts]);
      })
    );

    lastPublicPullAt = Date.now();
    return updated;
  } catch (err) {
    console.error('[FirestoreSync] Public pull error:', err);
    return null;
  }
}

export async function refreshPublicIfStale(currentDb: AppDatabase, applyUpdate: (next: AppDatabase) => void): Promise<void> {
  if (!serverFirestore) return;
  if (Date.now() - lastPublicPullAt < 5000) return;
  if (pullPromise) {
    await pullPromise;
    return;
  }
  pullPromise = (async () => {
    const next = await pullPublicFromFirestore(currentDb);
    if (next) {
      applyUpdate(next);
      return true;
    }
    return false;
  })().finally(() => {
    pullPromise = null;
  });
  await pullPromise;
}

// Full authoritative cloud sync for authenticated Admin (pulls both public & private + seeds if Firestore empty)
export async function syncAdminFullWithFirestore(
  currentDb: AppDatabase,
  idToken: string
): Promise<{ db: AppDatabase; seeded: boolean; pulled: boolean }> {
  const base = getRestBase();
  if (!base || !idToken) {
    return { db: currentDb, seeded: false, pulled: false };
  }

  const verified = await verifyFirebaseIdToken(idToken);
  if (!isAuthorizedCloudAdmin(verified)) {
    // Cached Firebase session does not hold cloud admin privileges — sync public collections silently without 403s
    const publicDb = await pullPublicFromFirestore(currentDb);
    return { db: publicDb || currentDb, seeded: false, pulled: Boolean(publicDb) };
  }

  // Check if site_config/public already exists in Firestore
  const checkResp = await fetch(`${base}/site_config/public`, {
    headers: { Authorization: `Bearer ${idToken}` }
  });

  if (checkResp.status === 404) {
    // Firestore is empty -> Seed ALL current data once!
    const ok = await pushDatabaseDiffToFirestore(currentDb, idToken, true);
    return { db: currentDb, seeded: ok, pulled: false };
  }

  if (!checkResp.ok) {
    const publicDb = await pullPublicFromFirestore(currentDb);
    return { db: publicDb || currentDb, seeded: false, pulled: Boolean(publicDb) };
  }

  const nextDb: AppDatabase = { ...currentDb };
  const publicJson: any = await checkResp.json();
  const parsedPublic = parseFirestoreDocFields(publicJson.fields);
  if (parsedPublic?.data) {
    nextDb.settings = { ...nextDb.settings, ...parsedPublic.data };
    cloudHashes.set('site_config/public', hashObj({ isPublic: true, content: parsedPublic.data }));
  }

  const liveResp = await fetch(`${base}/site_config/livestream`, {
    headers: { Authorization: `Bearer ${idToken}` }
  });
  if (liveResp.ok) {
    const liveJson: any = await liveResp.json();
    const parsedLive = parseFirestoreDocFields(liveJson.fields);
    if (parsedLive?.data) {
      nextDb.liveStream = { ...nextDb.liveStream, ...parsedLive.data };
      cloudHashes.set('site_config/livestream', hashObj({ isPublic: true, content: parsedLive.data }));
    }
  }

  let hasPendingLocalApps = false;

  await Promise.all(
    COLLECTION_MAPPINGS.map(async m => {
      try {
        const docs = await listCollectionRest(m.collectionName, idToken);
        const items: any[] = [];
        const cloudIds = new Set<string>();

        for (const { docId, doc: docObj } of docs) {
          if (docObj?.data) {
            items.push(docObj.data);
            cloudIds.add(docId);
            cloudHashes.set(
              `${m.collectionName}/${docId}`,
              hashObj({ isPublic: m.isPublicCollection ? docObj.isPublic : undefined, content: docObj.data })
            );
          }
        }

        // Preserve any newly submitted local public applications that haven't been synced to Firestore yet
        if (m.collectionName === 'applications') {
          const localApps = currentDb.applications || [];
          for (const appItem of localApps) {
            if (appItem?.id && !cloudIds.has(sanitizeFirestoreId(appItem.id))) {
              items.unshift(appItem);
              hasPendingLocalApps = true;
            }
          }
        }

        // For admins: if cloud admin_users is empty, keep currentDb.admins so login doesn't break
        if (m.collectionName === 'admin_users' && items.length === 0) {
          return;
        }

        (nextDb[m.dbKey] as any) = sortCollectionItems(m.collectionName, items);
      } catch {
        if (m.isPublicCollection && serverFirestore) {
          try {
            const q = query(collection(serverFirestore, m.collectionName), where('isPublic', '==', true));
            const snap = await getDocs(q);
            const publicItems: any[] = [];
            snap.forEach(docSnap => {
              const d = docSnap.data() as any;
              if (d?.data) publicItems.push(d.data);
            });
            if (publicItems.length > 0) {
              (nextDb[m.dbKey] as any) = sortCollectionItems(m.collectionName, publicItems);
            }
          } catch {
            // keep local snapshot
          }
        }
      }
    })
  );

  cloudInitialized = true;
  lastPublicPullAt = Date.now();

  if (hasPendingLocalApps) {
    await pushDatabaseDiffToFirestore(nextDb, idToken, false);
  }

  return { db: nextDb, seeded: false, pulled: true };
}

export function isCloudConfigured(): boolean {
  return Boolean(firebaseConfig);
}

export function isCloudInitialized(): boolean {
  return cloudInitialized;
}
