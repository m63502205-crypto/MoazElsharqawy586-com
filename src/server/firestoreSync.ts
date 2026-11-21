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

const BOOTSTRAPPED_ADMIN_EMAILS = new Set([
  'moazmahmoud586@gmail.com',
  'm63502205@gmail.com'
]);

const SYNC_STATE_PATH = path.resolve(process.cwd(), 'data', '.sync-state.json');

interface PersistedSyncState {
  hasUnpushedCloudChanges: boolean;
  lastLocalMutationAt: number;
  lastCloudSyncAt: number;
  deletedDocKeys: string[];
}

function loadPersistedSyncState(): PersistedSyncState {
  try {
    if (fs.existsSync(SYNC_STATE_PATH)) {
      const raw = fs.readFileSync(SYNC_STATE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        hasUnpushedCloudChanges: Boolean(parsed?.hasUnpushedCloudChanges),
        lastLocalMutationAt: Number(parsed?.lastLocalMutationAt || 0),
        lastCloudSyncAt: Number(parsed?.lastCloudSyncAt || 0),
        deletedDocKeys: Array.isArray(parsed?.deletedDocKeys)
          ? parsed.deletedDocKeys.filter((k: any) => typeof k === 'string')
          : []
      };
    }
  } catch {
    // ignore corrupt sync state
  }
  return {
    hasUnpushedCloudChanges: false,
    lastLocalMutationAt: 0,
    lastCloudSyncAt: 0,
    deletedDocKeys: []
  };
}

function writePersistedSyncState(state: PersistedSyncState): void {
  try {
    const dir = path.dirname(SYNC_STATE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${SYNC_STATE_PATH}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmp, SYNC_STATE_PATH);
  } catch {
    // ignore fs write failures
  }
}

const initialSyncState = loadPersistedSyncState();

// Track hashes of last known cloud documents so we only push real diffs
const cloudHashes = new Map<string, string>();
let cloudInitialized = false;
let lastPublicPullAt = 0;
let lastLocalMutationAt = initialSyncState.lastLocalMutationAt;
let lastCloudSyncAt = initialSyncState.lastCloudSyncAt;
let hasUnpushedCloudChanges = initialSyncState.hasUnpushedCloudChanges;
const deletedDocKeys = new Set<string>(initialSyncState.deletedDocKeys);
let pullPromise: Promise<boolean> | null = null;

const authorizedAdminDocCache = new Map<string, { allowed: boolean; expiresAt: number }>();

async function isAuthorizedCloudAdmin(verified: VerifiedFirebaseUser | null, idToken?: string): Promise<boolean> {
  if (!verified || !verified.emailVerified) return false;
  if (BOOTSTRAPPED_ADMIN_EMAILS.has(verified.email)) return true;
  if (!idToken) return false;

  const cached = authorizedAdminDocCache.get(verified.uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.allowed;
  }

  const base = getRestBase();
  if (!base) return false;
  try {
    const uid = sanitizeFirestoreId(verified.uid);
    const resp = await fetch(`${base}/admins/${uid}`, {
      headers: { Authorization: `Bearer ${idToken}` }
    });
    const allowed = resp.ok;
    authorizedAdminDocCache.set(verified.uid, { allowed, expiresAt: Date.now() + 5 * 60 * 1000 });
    return allowed;
  } catch {
    return false;
  }
}

export function markLocalMutation(): void {
  lastLocalMutationAt = Date.now();
  lastPublicPullAt = Date.now();
  hasUnpushedCloudChanges = true;
  writePersistedSyncState({
    hasUnpushedCloudChanges,
    lastLocalMutationAt,
    lastCloudSyncAt,
    deletedDocKeys: Array.from(deletedDocKeys).slice(-500)
  });
}

export function markLocalDeletion(collectionName: string, rawId: string): void {
  if (!rawId) return;
  const key = `${collectionName}/${sanitizeFirestoreId(rawId)}`;
  deletedDocKeys.add(key);
  markLocalMutation();
}

export function unmarkLocalDeletion(collectionName: string, rawId: string): void {
  if (!rawId) return;
  const key = `${collectionName}/${sanitizeFirestoreId(rawId)}`;
  if (deletedDocKeys.delete(key)) {
    writePersistedSyncState({
      hasUnpushedCloudChanges,
      lastLocalMutationAt,
      lastCloudSyncAt,
      deletedDocKeys: Array.from(deletedDocKeys).slice(-500)
    });
  }
}

export function recordDatabaseChanges(prevDb: AppDatabase | null, nextDb: AppDatabase): void {
  if (!prevDb) {
    markLocalMutation();
    return;
  }

  for (const mapping of COLLECTION_MAPPINGS) {
    const prevList = ((prevDb[mapping.dbKey] as any[]) || []).filter(i => i?.id);
    const nextList = ((nextDb[mapping.dbKey] as any[]) || []).filter(i => i?.id);
    const prevIds = new Set<string>(prevList.map(i => sanitizeFirestoreId(i.id)));
    const nextIds = new Set<string>(nextList.map(i => sanitizeFirestoreId(i.id)));

    for (const sid of nextIds) {
      if (!prevIds.has(sid)) {
        deletedDocKeys.delete(`${mapping.collectionName}/${sid}`);
      }
    }

    if (mapping.collectionName !== 'audit_logs') {
      for (const sid of prevIds) {
        if (!nextIds.has(sid)) {
          deletedDocKeys.add(`${mapping.collectionName}/${sid}`);
        }
      }
    }
  }

  markLocalMutation();
}

function getItemTimestampMs(item: any): number {
  if (!item || typeof item !== 'object') return 0;
  const raw = item.updatedAt || item.createdAt || item.timestamp || item.dispatchedAt || item.subscribedAt || item.reviewedAt || '';
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function markCloudSyncCompleted(): void {
  hasUnpushedCloudChanges = false;
  deletedDocKeys.clear();
  lastCloudSyncAt = Date.now();
  writePersistedSyncState({
    hasUnpushedCloudChanges,
    lastLocalMutationAt,
    lastCloudSyncAt,
    deletedDocKeys: []
  });
}

export function hasPendingLocalChanges(): boolean {
  return hasUnpushedCloudChanges;
}

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
  { dbKey: 'auditLogs', collectionName: 'audit_logs', isPublicCollection: false },
  { dbKey: 'subscribers', collectionName: 'subscribers', isPublicCollection: false },
  { dbKey: 'emailDispatchLogs', collectionName: 'email_dispatch_logs', isPublicCollection: false }
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
      const rawUpdatedAt = String(item.updatedAt || item.timestamp || item.createdAt || now).trim();
      const safeUpdatedAt = rawUpdatedAt.length >= 4 && rawUpdatedAt.length <= 64 ? rawUpdatedAt : now;
      const payload = mapping.isPublicCollection
        ? {
            id: docId,
            isPublic: computeIsPublic(mapping.collectionName, item),
            data: item,
            updatedAt: safeUpdatedAt
          }
        : {
            id: docId,
            data: item,
            updatedAt: safeUpdatedAt
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
  if (!(await isAuthorizedCloudAdmin(verified, idToken))) {
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

  // Delete removed docs that were previously known in Firestore or explicitly deleted locally
  const keysToDelete = new Set<string>();
  for (const existingKey of cloudHashes.keys()) {
    if (!currentKeys.has(existingKey) && !existingKey.startsWith('uploads_public/')) {
      keysToDelete.add(existingKey);
    }
  }
  for (const delKey of deletedDocKeys) {
    if (!currentKeys.has(delKey) && !delKey.startsWith('uploads_public/')) {
      keysToDelete.add(delKey);
    }
  }
  for (const delKey of keysToDelete) {
    writes.push({
      delete: `${docNamePrefix}/${delKey}`
    });
  }

  if (writes.length === 0) {
    markCloudSyncCompleted();
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
    markCloudSyncCompleted();
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
  if (!(await isAuthorizedCloudAdmin(verified, idToken))) return false;
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
  const roleVal = BOOTSTRAPPED_ADMIN_EMAILS.has(user.email) ? 'super_admin' : 'sub_admin';
  const fields = {
    uid: toFirestoreValue(uid),
    email: toFirestoreValue(user.email),
    role: toFirestoreValue(roleVal),
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
    case 'subscribers':
      return copy.sort((a, b) => new Date(b.subscribedAt || 0).getTime() - new Date(a.subscribedAt || 0).getTime());
    case 'email_dispatch_logs':
      return copy.sort((a, b) => new Date(b.dispatchedAt || 0).getTime() - new Date(a.dispatchedAt || 0).getTime());
    default:
      return copy;
  }
}

// Merge public Firestore data into current DB (strictly non-destructive: never discard local additions or newer local edits)
export async function pullPublicFromFirestore(
  currentDb: AppDatabase,
  localDbMtimeMs = 0
): Promise<AppDatabase | null> {
  if (!serverFirestore) return null;
  if (hasUnpushedCloudChanges || Date.now() - lastLocalMutationAt < 30000) {
    return null;
  }

  try {
    const configSnap = await getDoc(doc(serverFirestore, 'site_config', 'public'));
    if (!configSnap.exists()) {
      cloudInitialized = false;
      return null;
    }

    const configData = configSnap.data() as any;
    const cloudConfigUpdatedMs = configData?.updatedAt ? new Date(configData.updatedAt).getTime() : 0;
    // If local database.json was modified more recently than the cloud config doc, treat local DB as fresher
    if (localDbMtimeMs > 0 && cloudConfigUpdatedMs > 0 && localDbMtimeMs > cloudConfigUpdatedMs + 2000) {
      return null;
    }

    cloudInitialized = true;
    const updated: AppDatabase = { ...currentDb };
    if (configData?.data) {
      updated.settings = {
        ...updated.settings,
        ...configData.data,
        rosterVersion: Math.max(
          Number(updated.settings?.rosterVersion || 0),
          Number(configData.data.rosterVersion || 0)
        )
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

        const mergedBySid = new Map<string, any>();
        for (const localItem of ((currentDb[m.dbKey] as any[]) || [])) {
          if (!localItem?.id) continue;
          const sid = sanitizeFirestoreId(localItem.id);
          mergedBySid.set(sid, localItem);
        }

        snap.forEach(docSnap => {
          const d = docSnap.data() as any;
          if (!d?.data) return;
          const sid = docSnap.id;
          const delKey = `${m.collectionName}/${sid}`;
          if (deletedDocKeys.has(delKey)) return;

          cloudHashes.set(delKey, hashObj({ isPublic: true, content: d.data }));
          const existingLocal = mergedBySid.get(sid);
          if (!existingLocal) {
            mergedBySid.set(sid, d.data);
          } else {
            const localTs = getItemTimestampMs(existingLocal);
            const cloudTs = Math.max(
              getItemTimestampMs(d.data),
              d.updatedAt ? new Date(d.updatedAt).getTime() || 0 : 0
            );
            if (cloudTs > localTs && cloudTs > lastLocalMutationAt && cloudTs > localDbMtimeMs) {
              mergedBySid.set(sid, d.data);
            }
          }
        });

        (updated[m.dbKey] as any) = sortCollectionItems(m.collectionName, Array.from(mergedBySid.values()));
      })
    );

    lastPublicPullAt = Date.now();
    return updated;
  } catch (err) {
    console.error('[FirestoreSync] Public pull error:', err);
    return null;
  }
}

export async function refreshPublicIfStale(
  currentDb: AppDatabase,
  applyUpdate: (next: AppDatabase) => void,
  localDbMtimeMs = 0
): Promise<void> {
  if (!serverFirestore) return;
  // Never overwrite local DB while there are unpushed admin/public edits waiting to sync
  if (hasUnpushedCloudChanges || Date.now() - lastLocalMutationAt < 30000) return;
  if (Date.now() - lastPublicPullAt < 5000) return;
  if (pullPromise) {
    await pullPromise;
    return;
  }
  pullPromise = (async () => {
    const next = await pullPublicFromFirestore(currentDb, localDbMtimeMs);
    if (next && !hasUnpushedCloudChanges && Date.now() - lastLocalMutationAt >= 30000) {
      applyUpdate(next);
      return true;
    }
    return false;
  })().finally(() => {
    pullPromise = null;
  });
  await pullPromise;
}

// Full authoritative cloud sync for authenticated Admin (non-destructive merge + seeds if Firestore empty)
export async function syncAdminFullWithFirestore(
  currentDb: AppDatabase,
  idToken: string
): Promise<{ db: AppDatabase; seeded: boolean; pulled: boolean }> {
  const base = getRestBase();
  if (!base || !idToken) {
    return { db: currentDb, seeded: false, pulled: false };
  }

  const verified = await verifyFirebaseIdToken(idToken);
  if (!(await isAuthorizedCloudAdmin(verified, idToken))) {
    // Protect unpushed local edits unconditionally — never revert them!
    if (hasUnpushedCloudChanges || Date.now() - lastLocalMutationAt < 30000) {
      return { db: currentDb, seeded: false, pulled: false };
    }
    const publicDb = await pullPublicFromFirestore(currentDb);
    return { db: publicDb || currentDb, seeded: false, pulled: Boolean(publicDb) };
  }

  // If there are pending local writes made before this request, flush them to Firestore BEFORE pulling
  if (hasUnpushedCloudChanges || Date.now() - lastLocalMutationAt < 15000) {
    await pushDatabaseDiffToFirestore(currentDb, idToken, false);
    // Whether push succeeded or not, do NOT pull stale cloud data over just-written local edits
    return { db: currentDb, seeded: false, pulled: false };
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
    nextDb.settings = {
      ...nextDb.settings,
      ...parsedPublic.data,
      rosterVersion: Math.max(
        Number(nextDb.settings?.rosterVersion || 0),
        Number(parsedPublic.data.rosterVersion || 0)
      )
    };
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

  let hasPendingLocalAdditions = false;

  await Promise.all(
    COLLECTION_MAPPINGS.map(async m => {
      try {
        const docs = await listCollectionRest(m.collectionName, idToken);
        const mergedBySid = new Map<string, any>();
        const cloudIds = new Set<string>();

        for (const { docId, doc: docObj } of docs) {
          if (docObj?.data) {
            if (deletedDocKeys.has(`${m.collectionName}/${docId}`)) continue;
            mergedBySid.set(docId, docObj.data);
            cloudIds.add(docId);
            cloudHashes.set(
              `${m.collectionName}/${docId}`,
              hashObj({ isPublic: m.isPublicCollection ? docObj.isPublic : undefined, content: docObj.data })
            );
          }
        }

        // Preserve any local records that aren't in Firestore yet or are newer than cloud
        const localItems = (currentDb[m.dbKey] as any[]) || [];
        for (const localItem of localItems) {
          if (!localItem?.id) continue;
          const sid = sanitizeFirestoreId(localItem.id);
          if (!cloudIds.has(sid)) {
            mergedBySid.set(sid, localItem);
            hasPendingLocalAdditions = true;
          } else {
            const cloudItem = mergedBySid.get(sid);
            if (getItemTimestampMs(localItem) > getItemTimestampMs(cloudItem)) {
              mergedBySid.set(sid, localItem);
              hasPendingLocalAdditions = true;
            }
          }
        }

        const mergedList = Array.from(mergedBySid.values());
        if (m.collectionName === 'admin_users' && mergedList.length === 0) {
          return;
        }

        (nextDb[m.dbKey] as any) = sortCollectionItems(m.collectionName, mergedList);
      } catch {
        // keep local snapshot if cloud listing fails
      }
    })
  );

  cloudInitialized = true;
  lastPublicPullAt = Date.now();

  if (hasPendingLocalAdditions) {
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
