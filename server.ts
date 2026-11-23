import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createServer as createViteServer } from 'vite';
import { db, hashPassword } from './src/server/db.ts';
import type { AdminUser, MembershipApplication, MemberRecord, EmailSubscriber } from './src/server/db.ts';
import { dispatchSubscriberNotifications, getSmtpStatus } from './src/server/mailer.ts';
import { initializeApp as initFirebaseAdminApp, getApps as getFirebaseAdminApps, getApp as getFirebaseAdminApp } from 'firebase-admin/app';
import { getAuth as getFirebaseAdminAuth } from 'firebase-admin/auth';

const execFileAsync = promisify(execFile);

const app = express();
app.set('trust proxy', true);

// Permanent 301 HTTPS redirect from legacy nfp-october3.cloud.run to nfp-october3.ai.studio
// Keep sitemap, robots, verification files, and favicons returning 200 OK directly on nfp-october3.cloud.run so Google Search Console can fetch them without cross-domain redirect failure
app.use((req: Request, res: Response, next: NextFunction) => {
  const forwardedHost = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim();
  const rawHost = (forwardedHost || req.get('host') || req.hostname || '').toLowerCase();
  const normalizedHost = rawHost.replace(/:\d+$/, '');
  if (normalizedHost === 'nfp-october3.cloud.run') {
    const cleanReqPath = (req.path || '/').replace(/\/+$/, '') || '/';
    const isCrawlerDirectAsset =
      cleanReqPath === '/sitemap.xml' ||
      cleanReqPath === '/site-sitemap.xml' ||
      cleanReqPath === '/robots.txt' ||
      cleanReqPath === '/favicon.ico' ||
      cleanReqPath === '/favicon-48x48.png' ||
      cleanReqPath === '/favicon-96x96.png' ||
      cleanReqPath === '/favicon-192x192.png' ||
      cleanReqPath === '/site-icon.png' ||
      cleanReqPath === '/site-icon.jpg' ||
      cleanReqPath === '/apple-touch-icon.png' ||
      cleanReqPath === '/apple-touch-icon.jpg' ||
      cleanReqPath === '/og-logo.jpg' ||
      cleanReqPath === '/api/site-logo' ||
      /^\/google[a-zA-Z0-9_-]+\.html$/.test(cleanReqPath);
    if (!isCrawlerDirectAsset) {
      const targetPath = req.originalUrl && req.originalUrl.startsWith('/') ? req.originalUrl : '/';
      return res.redirect(301, `https://nfp-october3.ai.studio${targetPath}`);
    }
  }
  return next();
});

const PORT =
  process.env.NODE_ENV === 'production' && process.env.PORT && process.env.PORT !== process.env.NGINX_PORT
    ? parseInt(process.env.PORT, 10)
    : 3000;

// Enable large JSON payloads for documents/images
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Static uploads directory
const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const publicAssetsDir = path.resolve(process.cwd(), 'public', 'assets');
const heroAudioExtractionInFlight = new Map<string, Promise<string | null>>();

function resolveSafeLocalMediaFile(rawUrl?: string | null): string | null {
  const clean = String(rawUrl || '').split('?')[0].trim();
  if (!clean) return null;
  if (clean.startsWith('/uploads/')) {
    const rel = clean.slice('/uploads/'.length);
    if (!rel || rel.includes('..')) return null;
    const target = path.resolve(uploadsDir, rel);
    if (!target.startsWith(uploadsDir + path.sep)) return null;
    return fs.existsSync(target) && fs.statSync(target).isFile() ? target : null;
  }
  if (clean.startsWith('/assets/')) {
    const rel = clean.slice('/assets/'.length);
    if (!rel || rel.includes('..')) return null;
    const target = path.resolve(publicAssetsDir, rel);
    if (!target.startsWith(publicAssetsDir + path.sep)) return null;
    return fs.existsSync(target) && fs.statSync(target).isFile() ? target : null;
  }
  return null;
}

async function ensureHeroAudioMp3(rawVideoUrl?: string | null): Promise<string | null> {
  const clean = String(rawVideoUrl || '').split('?')[0].trim();
  if (!clean) return null;
  if (clean === '/assets/aistudio/VID-20261023-WA0156_a7a2c2e2.mp4') {
    const bundled = path.resolve(publicAssetsDir, 'aistudio', 'hero-audio.mp3');
    if (fs.existsSync(bundled)) return bundled;
  }

  const videoPath = resolveSafeLocalMediaFile(clean);
  if (!videoPath) return null;

  const stat = fs.statSync(videoPath);
  const hash = crypto
    .createHash('sha1')
    .update(`${videoPath}:${stat.size}:${stat.mtimeMs}`)
    .digest('hex')
    .slice(0, 16);
  const outMp3 = path.join(uploadsDir, `hero_audio_${hash}.mp3`);
  if (fs.existsSync(outMp3) && fs.statSync(outMp3).size > 256) {
    return outMp3;
  }

  const existingTask = heroAudioExtractionInFlight.get(outMp3);
  if (existingTask) return existingTask;

  const task = (async () => {
    const tmpMp3 = `${outMp3}.tmp.${Date.now()}.mp3`;
    try {
      await execFileAsync(
        'ffmpeg',
        ['-y', '-i', videoPath, '-vn', '-acodec', 'libmp3lame', '-ar', '44100', '-ac', '2', '-b:a', '96k', tmpMp3],
        { timeout: 60000 }
      );
      if (fs.existsSync(tmpMp3) && fs.statSync(tmpMp3).size > 256) {
        fs.renameSync(tmpMp3, outMp3);
        return outMp3;
      }
      return null;
    } catch {
      return null;
    } finally {
      try {
        if (fs.existsSync(tmpMp3)) fs.unlinkSync(tmpMp3);
      } catch {
        // ignore temp cleanup failure
      }
      heroAudioExtractionInFlight.delete(outMp3);
    }
  })();

  heroAudioExtractionInFlight.set(outMp3, task);
  return task;
}

// Firebase project config (loaded from firebase-applet-config.json)
let firebaseRuntimeConfig: {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
} | null = null;

try {
  const fbCfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(fbCfgPath)) {
    const parsed = JSON.parse(fs.readFileSync(fbCfgPath, 'utf-8'));
    if (parsed?.projectId && parsed.projectId !== 'remixed-project-id' && parsed?.apiKey && parsed?.firestoreDatabaseId) {
      firebaseRuntimeConfig = {
        projectId: String(parsed.projectId),
        apiKey: String(parsed.apiKey),
        firestoreDatabaseId: String(parsed.firestoreDatabaseId)
      };
    }
  }
} catch {
  firebaseRuntimeConfig = null;
}

function getFirebaseTokenVerifier() {
  if (!firebaseRuntimeConfig) return null;
  const fbApp = getFirebaseAdminApps().length
    ? getFirebaseAdminApp()
    : initFirebaseAdminApp({ projectId: firebaseRuntimeConfig.projectId });
  return getFirebaseAdminAuth(fbApp);
}

let lastLocalAdminMutationAt = 0;
let lastFirestoreHydrateAt = 0;
let firestoreHydrateInFlight: Promise<boolean> | null = null;

function decodeFirestoreRestValue(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('stringValue' in val) return String(val.stringValue);
  if ('arrayValue' in val) {
    const vals = Array.isArray(val.arrayValue?.values) ? val.arrayValue.values : [];
    return vals.map(decodeFirestoreRestValue);
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      const decoded = decodeFirestoreRestValue(v);
      if (decoded !== undefined) out[k] = decoded;
    }
    return out;
  }
  return undefined;
}

async function fetchPublicFirestoreCollectionRest(colName: string): Promise<Array<{ id: string; data: any; updatedAt: string }>> {
  if (!firebaseRuntimeConfig) return [];
  const { projectId, firestoreDatabaseId, apiKey } = firebaseRuntimeConfig;
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(firestoreDatabaseId)}/documents:runQuery?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: colName }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'isPublic' },
              op: 'EQUAL',
              value: { booleanValue: true }
            }
          }
        }
      })
    });
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    const docs: Array<{ id: string; data: any; updatedAt: string }> = [];
    for (const row of rows) {
      const docObj = row?.document;
      if (!docObj?.fields) continue;
      const decoded = decodeFirestoreRestValue({ mapValue: { fields: docObj.fields } }) || {};
      const docNameId = String(docObj.name || '').split('/').pop() || '';
      docs.push({
        id: String(decoded.id || docNameId),
        data: decoded.data || {},
        updatedAt: String(decoded.updatedAt || '')
      });
    }
    return docs;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function hydrateDbFromPublicFirestoreRest(force = false): Promise<boolean> {
  if (!firebaseRuntimeConfig) return false;
  const now = Date.now();
  if (now - lastLocalAdminMutationAt < 5000) return false;
  if (!force && now - lastFirestoreHydrateAt < 20000) return false;
  if (firestoreHydrateInFlight) return firestoreHydrateInFlight;

  firestoreHydrateInFlight = (async () => {
    try {
      const [
        siteConfigs,
        partyLeadersDocs,
        secLeadersDocs,
        secretariatsDocs,
        secMembersDocs,
        initiativesDocs,
        newsDocs,
        eventsDocs,
        mediaDocs,
        pagesDocs
      ] = await Promise.all([
        fetchPublicFirestoreCollectionRest('site_config'),
        fetchPublicFirestoreCollectionRest('party_leaders'),
        fetchPublicFirestoreCollectionRest('secretariat_leaders'),
        fetchPublicFirestoreCollectionRest('secretariats'),
        fetchPublicFirestoreCollectionRest('secretariat_members'),
        fetchPublicFirestoreCollectionRest('initiatives'),
        fetchPublicFirestoreCollectionRest('news'),
        fetchPublicFirestoreCollectionRest('events'),
        fetchPublicFirestoreCollectionRest('media'),
        fetchPublicFirestoreCollectionRest('pages')
      ]);

      lastFirestoreHydrateAt = Date.now();
      const totalFetched =
        siteConfigs.length +
        partyLeadersDocs.length +
        secLeadersDocs.length +
        secretariatsDocs.length +
        secMembersDocs.length +
        initiativesDocs.length +
        newsDocs.length +
        eventsDocs.length +
        mediaDocs.length +
        pagesDocs.length;
      if (totalFetched === 0) return false;

      const data = db.get();
      let changed = false;

      const tombDoc = siteConfigs.find(d => d.id === 'portal_tombstones');
      const tombSet = new Set<string>(
        Array.isArray(tombDoc?.data?.deletedKeys)
          ? tombDoc!.data.deletedKeys.filter((x: unknown): x is string => typeof x === 'string')
          : []
      );
      if (Array.isArray(data.deletedTombstones)) {
        for (const k of data.deletedTombstones) {
          if (typeof k === 'string' && k) tombSet.add(k);
        }
      }
      const toSafeId = (id: string) => String(id || '').trim().replace(/[^a-zA-Z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 128);
      const isTombstoned = (col: string, id: string) =>
        tombSet.has(`${col}:${id}`) || tombSet.has(`${col}:${toSafeId(id)}`);

      const mergeArr = (col: string, currentArr: any[], cloudDocs: Array<{ id: string; data: any; updatedAt: string }>, bySlug = false) => {
        const beforeStr = JSON.stringify(currentArr);
        const map = new Map<string, any>();
        for (const item of currentArr || []) {
          if (!item || !item.id || isTombstoned(col, item.id)) continue;
          const k = bySlug && item.slug ? `slug:${item.slug}` : `id:${item.id}`;
          map.set(k, item);
        }
        for (const c of cloudDocs) {
          const item = c.data;
          if (!item || !item.id || isTombstoned(col, item.id)) continue;
          const k = bySlug && item.slug ? `slug:${item.slug}` : `id:${item.id}`;
          const existing = map.get(k);
          if (!existing) {
            map.set(k, item);
          } else {
            const existingTs = String(existing.updatedAt || existing.createdAt || '');
            const cloudTs = String(item.updatedAt || c.updatedAt || '');
            if (!existingTs || (Boolean(cloudTs) && cloudTs > existingTs)) {
              map.set(k, item);
            }
          }
        }
        const merged = Array.from(map.values());
        if (JSON.stringify(merged) !== beforeStr) {
          changed = true;
        }
        return merged;
      };

      data.partyLeaders = mergeArr('party_leaders', data.partyLeaders, partyLeadersDocs);
      data.secretariatLeaders = mergeArr('secretariat_leaders', data.secretariatLeaders, secLeadersDocs);
      data.specializedSecretariats = mergeArr('secretariats', data.specializedSecretariats, secretariatsDocs, true);
      data.secretariatMembers = mergeArr('secretariat_members', data.secretariatMembers, secMembersDocs);
      data.initiatives = mergeArr('initiatives', data.initiatives, initiativesDocs);
      data.news = mergeArr('news', data.news, newsDocs);
      data.events = mergeArr('events', data.events, eventsDocs);
      data.media = mergeArr('media', data.media, mediaDocs);
      data.pages = mergeArr('pages', data.pages || [], pagesDocs);

      const publicCfg = siteConfigs.find(d => d.id === 'public');
      if (publicCfg?.data) {
        const cloudSettings = publicCfg.data;
        const cutoffIso = '2026-11-23T15:00:00.000Z';
        const cloudUpdated = String(cloudSettings.updatedAt || publicCfg.updatedAt || '');
        const localUpdated = String(data.settings?.updatedAt || '');
        const isPreUpgrade = (cloudSettings.rosterVersion || 0) < 9 && (!cloudUpdated || cloudUpdated < cutoffIso);
        const isCloudNewer = !localUpdated || (Boolean(cloudUpdated) && cloudUpdated > localUpdated);
        if (isCloudNewer) {
          const cloudHeroVideo = String(cloudSettings.heroVideoUrl || '');
          const localHeroVideo = String(data.settings?.heroVideoUrl || '');
          const safeHeroVideoUrl =
            cloudHeroVideo.startsWith('/uploads/') && !resolveSafeLocalMediaFile(cloudHeroVideo)
              ? (resolveSafeLocalMediaFile(localHeroVideo) ? localHeroVideo : '/assets/aistudio/VID-20261023-WA0156_a7a2c2e2.mp4')
              : (cloudHeroVideo || localHeroVideo);
          const nextSettings = {
            ...data.settings,
            ...cloudSettings,
            heroVideoUrl: safeHeroVideoUrl,
            seoTitle: isPreUpgrade ? data.settings.seoTitle : (cloudSettings.seoTitle || data.settings.seoTitle),
            officialSiteUrl: isPreUpgrade ? data.settings.officialSiteUrl : (cloudSettings.officialSiteUrl || data.settings.officialSiteUrl),
            rosterVersion: Math.max(Number(data.settings?.rosterVersion || 0), Number(cloudSettings.rosterVersion || 0))
          };
          if (JSON.stringify(nextSettings) !== JSON.stringify(data.settings)) {
            data.settings = nextSettings;
            changed = true;
          }
        }
      }

      const liveCfg = siteConfigs.find(d => d.id === 'livestream');
      if (liveCfg?.data) {
        const cloudLiveUpdated = String(liveCfg.data.updatedAt || liveCfg.updatedAt || '');
        const localLiveUpdated = String(data.liveStream?.updatedAt || '');
        if (!localLiveUpdated || (Boolean(cloudLiveUpdated) && cloudLiveUpdated > localLiveUpdated)) {
          const nextLive = { ...data.liveStream, ...liveCfg.data };
          if (JSON.stringify(nextLive) !== JSON.stringify(data.liveStream)) {
            data.liveStream = nextLive;
            changed = true;
          }
        }
      }

      if (changed) {
        db.save();
      }
      return changed;
    } catch {
      return false;
    } finally {
      firestoreHydrateInFlight = null;
    }
  })();

  return firestoreHydrateInFlight;
}

function recordLocalTombstone(data: ReturnType<typeof db.get>, col: string, rawId: string) {
  if (!rawId) return;
  const safeId = String(rawId || '').trim().replace(/[^a-zA-Z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 128);
  const current = new Set<string>(Array.isArray(data.deletedTombstones) ? data.deletedTombstones : []);
  current.add(`${col}:${rawId}`);
  if (safeId) current.add(`${col}:${safeId}`);
  data.deletedTombstones = Array.from(current);
}

app.use('/api/admin', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (req.method !== 'GET' && req.path !== '/login' && req.path !== '/google-login' && req.path !== '/logout') {
    lastLocalAdminMutationAt = Date.now();
  }
  next();
});

// Helper to persist base64 data URLs to disk in data/uploads
export function persistDataUrlIfAny(dataUrlOrUrl: string, prefix = 'media'): string {
  if (!dataUrlOrUrl || typeof dataUrlOrUrl !== 'string') return dataUrlOrUrl;
  if (!dataUrlOrUrl.startsWith('data:')) return dataUrlOrUrl;

  try {
    const match = dataUrlOrUrl.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
    if (!match) return dataUrlOrUrl;

    const mime = match[1];
    const base64Data = match[2];
    let ext = 'bin';
    if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
    else if (mime.includes('png')) ext = 'png';
    else if (mime.includes('webp')) ext = 'webp';
    else if (mime.includes('gif')) ext = 'gif';
    else if (mime.includes('mp4')) ext = 'mp4';
    else if (mime.includes('webm')) ext = 'webm';
    else if (mime.includes('ogg')) ext = 'ogg';
    else if (mime.includes('quicktime')) ext = 'mov';

    const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Error persisting data URL to disk:', err);
    return dataUrlOrUrl;
  }
}

// Persistent session signing secret + in-memory cache (survives server restarts & Cloud Run recycles)
const sessionSecretPath = path.resolve(process.cwd(), 'data', '.session-secret');
function getSessionSecret(): string {
  try {
    const dir = path.dirname(sessionSecretPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(sessionSecretPath)) {
      const existing = fs.readFileSync(sessionSecretPath, 'utf-8').trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(sessionSecretPath, generated, 'utf-8');
    return generated;
  } catch {
    return crypto.createHash('sha256').update(process.cwd() + '_nfp_oct3_session_key').digest('hex');
  }
}
const SESSION_SECRET = getSessionSecret();
const sessionStore = new Map<string, { admin: AdminUser; expiresAt: number }>();
const revokedTokens = new Set<string>();

function normalizeArabicDigitsServer(raw: string): string {
  return String(raw || '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

function normalizeAdminPhone(raw?: string | null): string {
  if (!raw) return '';
  let digits = normalizeArabicDigitsServer(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0020') && digits.length >= 13) {
    digits = '0' + digits.slice(4);
  } else if (digits.startsWith('20') && digits.length === 12 && digits[2] === '1') {
    digits = '0' + digits.slice(2);
  }
  return digits;
}

function generateToken(admin?: AdminUser): string {
  if (!admin) {
    return 'tok_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  }
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(
    JSON.stringify({ id: admin.id, email: (admin.email || '').toLowerCase(), phone: admin.phone || '', exp })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `v1.${payload}.${sig}`;
}

function resolveSessionAdmin(token: string): { admin: AdminUser; expiresAt: number } | null {
  if (!token || revokedTokens.has(token)) return null;
  const cached = sessionStore.get(token);
  if (cached) {
    if (cached.expiresAt < Date.now()) {
      sessionStore.delete(token);
      return null;
    }
    // Always resolve latest active record from DB if present
    const cachedEmail = (cached.admin.email || '').toLowerCase();
    const latest = db.get().admins.find(
      a => a.isActive && (a.id === cached.admin.id || (cachedEmail !== '' && (a.email || '').toLowerCase() === cachedEmail))
    );
    if (!latest) return null;
    return { admin: latest, expiresAt: cached.expiresAt };
  }

  if (token.startsWith('v1.')) {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [, payload, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
      if (!parsed?.exp || parsed.exp < Date.now()) return null;
      const parsedEmail = String(parsed.email || '').toLowerCase();
      const matched = db.get().admins.find(
        a => a.isActive && (a.id === parsed.id || (parsedEmail !== '' && (a.email || '').toLowerCase() === parsedEmail))
      );
      if (!matched) return null;
      const entry = { admin: matched, expiresAt: Number(parsed.exp) };
      sessionStore.set(token, entry);
      return entry;
    } catch {
      return null;
    }
  }
  return null;
}

// Authentication middleware
function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح: يجب تسجيل الدخول أولاً' });
  }
  const token = authHeader.substring(7);
  const session = resolveSessionAdmin(token);
  if (!session) {
    sessionStore.delete(token);
    return res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً' });
  }
  (req as any).admin = session.admin;
  next();
}

// Permission check helper (resolves both explicit user permissions and roleId permissions)
function requirePermission(perm: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const admin = (req as any).admin as AdminUser;
    if (!admin) {
      return res.status(401).json({ error: 'غير مصرح' });
    }
    if (admin.role === 'super_admin') {
      return next();
    }
    const userPerms = new Set(admin.permissions || []);
    if (admin.roleId) {
      const data = db.get();
      const roleObj = (data.roles || []).find(r => r.id === admin.roleId);
      if (roleObj && roleObj.permissions) {
        roleObj.permissions.forEach(p => userPerms.add(p));
      }
    }
    if (userPerms.has(perm)) {
      return next();
    }
    return res.status(403).json({ error: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' });
  };
}

// -------------------------------------------------------------
// PUBLIC APIS & SEARCH ENGINE VERIFICATION
// -------------------------------------------------------------

// Google Site Verification File (supports built-in + custom admin verification filename)
const DEFAULT_GOOGLE_VERIFICATION_TOKENS = [
  '1cduZPpTsH3JKgUxMdqnqFSWnhq88dU2o79mrvg63Mo',
  'HXP-EDvILB2MqyR6q9kA9RFDZpFEiVuOrcTjTomsPsg',
  'Bod0xJP22hOaKj14Rq6e1ElD0LGxPQ2MuLNEiaa_bOQ'
];

app.get('/googlef3c013b384f88d85.html', (_req: Request, res: Response) => {
  res.type('text/html').send('google-site-verification: googlef3c013b384f88d85.html');
});

app.get(/^\/(google[a-zA-Z0-9_-]+\.html)$/, (req: Request, res: Response, next: NextFunction) => {
  const data = db.get();
  const configuredFile = (data.settings?.googleVerificationFile || '').trim().replace(/^\/+/, '');
  const requestedFile = req.path.replace(/^\/+/, '');
  if (configuredFile && configuredFile === requestedFile) {
    return res.type('text/html').send(`google-site-verification: ${configuredFile}`);
  }
  return next();
});

const OFFICIAL_SITE_URL = 'https://nfp-october3.ai.studio';
const SITE_BRAND_NAME = 'حزب الجبهة الوطنية أمانة قسم ثالث أكتوبر';
const HOME_SEO_TITLE = 'حزب الجبهة الوطنية أمانة قسم ثالث أكتوبر | الموقع الرسمي';
const HOME_SEO_DESCRIPTION =
  'الموقع الرسمي لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة. تابع أخبار الأمانة وقيادات الحزب والأمانات والمبادرات المجتمعية والفعاليات وطلبات الانضمام.';
const HOME_SEO_KEYWORDS =
  'حزب الجبهة الوطنية، أمانة حزب الجبهة الوطنية، قسم ثالث أكتوبر، حزب الجبهة الوطنية قسم ثالث أكتوبر، أمانة ثالث أكتوبر، محافظة الجيزة، مبادرات مجتمعية، طلب عضوية حزب الجبهة الوطنية';
const DEFAULT_GA4_ID = 'G-NX1MQ9NHXW';
const DEFAULT_GTM_ID = 'GTM-TRZ4SG95';

function getOfficialSiteUrl(data: ReturnType<typeof db.get>): string {
  const configured = (data.settings?.officialSiteUrl || '').trim().replace(/\/+$/, '');
  if (configured && (configured.startsWith('https://') || configured.startsWith('http://'))) {
    return configured;
  }
  return OFFICIAL_SITE_URL;
}

// Ensure admin UI, login, and admin APIs are never indexed by search engines
app.use(['/admin', '/admin/', '/login', '/api/admin', '/api/admin/'], (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});

function getSitemapBaseUrl(req: Request, data: ReturnType<typeof db.get>): string {
  const forwardedHost = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim();
  const reqHost = (forwardedHost || req.get('host') || '').toLowerCase().replace(/:\d+$/, '');
  if (
    reqHost &&
    (reqHost === 'nfp-october3.ai.studio' ||
      reqHost === 'nfp-october3.cloud.run' ||
      reqHost === 'www.algabhaalwataniya-oct3.org' ||
      reqHost === 'algabhaalwataniya-oct3.org')
  ) {
    return `https://${reqHost === 'algabhaalwataniya-oct3.org' ? 'www.algabhaalwataniya-oct3.org' : reqHost}`;
  }
  return getOfficialSiteUrl(data);
}

// Robots.txt (explicitly welcomes Googlebot & crawlers for public pages; blocks admin/login/private APIs)
app.get('/robots.txt', (req: Request, res: Response) => {
  const data = db.get();
  const siteUrl = getSitemapBaseUrl(req, data);
  const content = `User-agent: Googlebot
Allow: /
Disallow: /admin
Disallow: /admin/
Disallow: /login
Disallow: /api/admin
Disallow: /api/admin/

User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/
Disallow: /login
Disallow: /api/admin
Disallow: /api/admin/

Sitemap: ${siteUrl}/sitemap.xml
`;
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('text/plain').send(content);
});

// Dynamic Sitemap.xml (real crawlable URLs + images for Google Search)
app.get(['/sitemap.xml', '/site-sitemap.xml'], (req: Request, res: Response) => {
  const data = db.get();
  const siteUrl = getSitemapBaseUrl(req, data);

  interface SitemapImage {
    loc: string;
    title?: string;
  }

  interface SitemapEntry {
    path: string;
    changefreq: string;
    priority: string;
    lastmod?: string;
    images?: SitemapImage[];
  }

  const toAbsoluteAssetUrl = (raw?: string): string | null => {
    const val = (raw || '').trim();
    if (!val || val.startsWith('data:')) return null;
    if (val.startsWith('http://') || val.startsWith('https://')) return val;
    if (val.startsWith('/')) return `${siteUrl}${val}`;
    return `${siteUrl}/${val}`;
  };

  const mediaImages: SitemapImage[] = (data.media || [])
    .filter(m => m.isVisible && m.type === 'photo')
    .reduce<SitemapImage[]>((acc, m) => {
      const loc = toAbsoluteAssetUrl(m.url);
      if (loc) {
        acc.push({ loc, title: m.title });
      }
      return acc;
    }, [])
    .slice(0, 30);

  const staticPages: SitemapEntry[] = [
    { path: '', changefreq: 'daily', priority: '1.0', images: mediaImages },
    { path: 'about', changefreq: 'weekly', priority: '0.9' },
    { path: 'party-leaders', changefreq: 'weekly', priority: '0.85' },
    { path: 'secretariat-leaders', changefreq: 'weekly', priority: '0.9' },
    { path: 'secretariats', changefreq: 'weekly', priority: '0.95' },
    { path: 'initiatives', changefreq: 'weekly', priority: '0.9' },
    { path: 'news', changefreq: 'daily', priority: '0.95' },
    { path: 'events', changefreq: 'weekly', priority: '0.9' },
    { path: 'live', changefreq: 'daily', priority: '0.85' },
    { path: 'join', changefreq: 'monthly', priority: '0.9' },
    { path: 'contact', changefreq: 'monthly', priority: '0.85' }
  ];

  const secretariatPages: SitemapEntry[] = (data.specializedSecretariats || [])
    .filter(s => s.isActive && s.slug)
    .map(s => {
      const imgs = [s.coverUrl, s.logoUrl, ...(s.galleryImages || [])]
        .map(u => toAbsoluteAssetUrl(u))
        .filter((u): u is string => Boolean(u))
        .slice(0, 10)
        .map(loc => ({ loc, title: s.name }));
      return {
        path: `secretariat/${encodeURIComponent(s.slug)}`,
        changefreq: 'weekly',
        priority: '0.85',
        lastmod: s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : undefined,
        images: imgs
      };
    });

  const initiativePages: SitemapEntry[] = (data.initiatives || [])
    .filter(i => i.isVisible && i.slug)
    .map(i => {
      const imgs = [i.coverUrl, i.logoUrl, ...(i.galleryImages || [])]
        .map(u => toAbsoluteAssetUrl(u))
        .filter((u): u is string => Boolean(u))
        .slice(0, 10)
        .map(loc => ({ loc, title: i.title }));
      return {
        path: `initiative/${encodeURIComponent(i.slug)}`,
        changefreq: 'weekly',
        priority: '0.85',
        lastmod: i.createdAt ? new Date(i.createdAt).toISOString().split('T')[0] : undefined,
        images: imgs
      };
    });

  const newsPages: SitemapEntry[] = (data.news || [])
    .filter(n => !n.isDraft)
    .map(n => {
      const cover = toAbsoluteAssetUrl(n.coverImage) || (n.coverImage?.startsWith('data:') ? `${siteUrl}/api/news/${encodeURIComponent(n.id)}/image` : null);
      const extraImgs = (n.galleryImages || [])
        .map(u => toAbsoluteAssetUrl(u))
        .filter((u): u is string => Boolean(u));
      const allImgs = Array.from(new Set([...(cover ? [cover] : []), ...extraImgs]))
        .slice(0, 10)
        .map(loc => ({ loc, title: n.title }));
      return {
        path: `news/${encodeURIComponent(n.id)}`,
        changefreq: 'weekly',
        priority: '0.85',
        lastmod: n.publishDate ? new Date(n.publishDate).toISOString().split('T')[0] : undefined,
        images: allImgs
      };
    });

  const eventPages: SitemapEntry[] = (data.events || [])
    .filter(e => e.isVisible)
    .map(e => {
      const imgs = [e.coverUrl, e.coverImage, ...(e.images || []), ...(e.galleryImages || [])]
        .map(u => toAbsoluteAssetUrl(u))
        .filter((u): u is string => Boolean(u))
        .slice(0, 10)
        .map(loc => ({ loc, title: e.title }));
      return {
        path: `events/${encodeURIComponent(e.id)}`,
        changefreq: 'weekly',
        priority: '0.8',
        lastmod: e.dateTime ? new Date(e.dateTime).toISOString().split('T')[0] : undefined,
        images: imgs
      };
    });

  const cmsPages: SitemapEntry[] = (data.pages || [])
    .filter(p => p.isPublished && p.slug)
    .map(p => ({
      path: `page/${encodeURIComponent(p.slug)}`,
      changefreq: 'monthly',
      priority: '0.75',
      lastmod: p.updatedAt ? new Date(p.updatedAt).toISOString().split('T')[0] : undefined
    }));

  const allItems: SitemapEntry[] = [
    ...staticPages,
    ...secretariatPages,
    ...initiativePages,
    ...newsPages,
    ...eventPages,
    ...cmsPages
  ];

  const xmlUrls = allItems
    .map(item => {
      const imageTags = (item.images || [])
        .map(
          img => `\n    <image:image>
      <image:loc>${escapeHtml(img.loc)}</image:loc>${img.title ? `\n      <image:title>${escapeHtml(img.title)}</image:title>` : ''}
    </image:image>`
        )
        .join('');
      return `  <url>
    <loc>${escapeHtml(`${siteUrl}/${item.path}`)}</loc>${item.lastmod ? `\n    <lastmod>${item.lastmod}</lastmod>` : ''}
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>${imageTags}
  </url>`;
    })
    .join('\n');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${xmlUrls}
</urlset>`;

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(sitemapXml);
});

// Resolve current reachable asset origin (used for social image unfurling when previewing on staging or production)
function getPublicBaseUrl(req: Request): string {
  const forwardedHost = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim();
  const reqHost = forwardedHost || req.get('host') || '';
  const forwardedProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim();
  const isLocal = !reqHost || reqHost.startsWith('localhost') || reqHost.startsWith('127.0.0.1');

  if (!isLocal) {
    const proto = forwardedProto || 'https';
    return `${proto}://${reqHost}`.replace(/\/$/, '');
  }
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  return OFFICIAL_SITE_URL;
}

function getDefaultLogoPath(): string {
  const publicLogo = path.resolve(process.cwd(), 'public', 'assets', 'aistudio', 'FB_IMG_1793904484101_850eafaf.jpg');
  if (fs.existsSync(publicLogo)) return publicLogo;
  return path.resolve(process.cwd(), 'dist', 'assets', 'aistudio', 'FB_IMG_1793904484101_850eafaf.jpg');
}

function getLogoMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function resolveSiteShareImageUrl(settings: any, assetBaseUrl: string): string {
  const raw = (settings?.seoShareImage || settings?.officialLogo || '').trim();
  if (raw.startsWith('data:image/')) {
    return `${assetBaseUrl}/api/seo/share-image`;
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  if (raw.startsWith('/')) {
    return `${assetBaseUrl}${raw}`;
  }
  if (raw) {
    return `${assetBaseUrl}/${raw}`;
  }
  return `${assetBaseUrl}/og-logo.jpg`;
}

function resolvePublicImageUrl(
  rawImage: string | undefined,
  assetBaseUrl: string,
  itemType?: 'news' | 'events' | 'initiatives',
  itemId?: string,
  querySuffix = '',
  fallbackUrl?: string
): string {
  if (rawImage && rawImage.startsWith('data:image/') && itemType && itemId) {
    return `${assetBaseUrl}/api/${itemType}/${encodeURIComponent(itemId)}/image${querySuffix}`;
  }
  if (rawImage && (rawImage.startsWith('http://') || rawImage.startsWith('https://'))) {
    return rawImage;
  }
  if (rawImage && rawImage.startsWith('/')) {
    return `${assetBaseUrl}${rawImage}`;
  }
  if (rawImage) {
    return `${assetBaseUrl}/${rawImage}`;
  }
  return fallbackUrl || `${assetBaseUrl}/og-logo.jpg`;
}

function renderSsrShell(data: ReturnType<typeof db.get>, mainHtml: string): string {
  const settings = data.settings || ({} as any);
  const phone = settings.phone || '01003070108';
  const address = settings.address || 'مقر أمانة قسم ثالث أكتوبر – طريق الشاذلي، ابني بيتك 7، قسم ثالث 6 أكتوبر، محافظة الجيزة 3265020';
  const facebookUrl = settings.facebookUrl || 'https://www.facebook.com/fational.front.party';
  const logoSrc = settings.officialLogo && !settings.officialLogo.startsWith('data:')
    ? settings.officialLogo
    : '/og-logo.jpg';

  return `<div dir="rtl" lang="ar" style="font-family:Cairo,Tajawal,sans-serif;background:#fafaf9;color:#1c1917;">
  <header>
    <a href="/">
      <img src="${escapeHtml(logoSrc)}" alt="شعار حزب الجبهة الوطنية أمانة قسم ثالث أكتوبر" width="52" height="52" />
      <span>حزب الجبهة الوطنية أمانة قسم ثالث أكتوبر</span>
    </a>
    <nav aria-label="التنقل الرئيسي">
      <a href="/">الرئيسية</a>
      <a href="/about">عن الحزب</a>
      <a href="/party-leaders">القيادات</a>
      <a href="/secretariats">الأمانات</a>
      <a href="/initiatives">المبادرات</a>
      <a href="/news">الأخبار</a>
      <a href="/events">الفعاليات</a>
      <a href="/live">البث المباشر</a>
      <a href="/join">استمارة التقديم</a>
      <a href="/contact">تواصل معنا</a>
    </nav>
  </header>
  <main>
    ${mainHtml}
  </main>
  <footer>
    <p>حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر – محافظة الجيزة</p>
    <p>العنوان: ${escapeHtml(address)}</p>
    <p>الهاتف: <a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></p>
    <p><a href="${escapeHtml(facebookUrl)}" rel="noopener noreferrer">الصفحة الرسمية على فيسبوك</a></p>
    <nav aria-label="روابط سريعة">
      <a href="/secretariats">الأمانات التخصصية</a>
      <a href="/initiatives">المبادرات</a>
      <a href="/news">الأخبار</a>
      <a href="/events">الفعاليات</a>
      <a href="/join">طلب الانضمام</a>
      <a href="/contact">تواصل معنا</a>
    </nav>
    <p dir="ltr">Development Eng.Moaz Elsharqawy</p>
  </footer>
</div>`;
}

function resolveRouteSeoAndSsr(req: Request, data: ReturnType<typeof db.get>) {
  const settings = data.settings || ({} as any);
  const assetBaseUrl = getPublicBaseUrl(req);
  const defaultOgImage = resolveSiteShareImageUrl(settings, assetBaseUrl);

  const cleanPath = decodeURIComponent(req.path || '/').replace(/\/+$/, '') || '/';
  const queryNewsId =
    typeof req.query?.news === 'string'
      ? req.query.news
      : typeof req.query?.id === 'string'
      ? req.query.id
      : '';
  const visiblePartyLeaders = (data.partyLeaders || []).filter(l => l.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleSecLeaders = (data.secretariatLeaders || []).filter(l => l.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);
  const activeSecretariats = (data.specializedSecretariats || []).filter(s => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleInitiatives = (data.initiatives || []).filter(i => i.isVisible);
  const publishedNews = (data.news || []).filter(n => !n.isDraft).sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime());
  const visibleEvents = (data.events || []).filter(e => e.isVisible).sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
  const publishedPages = (data.pages || []).filter(p => p.isPublished);

  const phone = settings.phone || '01003070108';
  const address = settings.address || 'مقر أمانة قسم ثالث أكتوبر – طريق الشاذلي، ابني بيتك 7، قسم ثالث 6 أكتوبر، محافظة الجيزة 3265020';
  const siteUrl = getOfficialSiteUrl(data);
  const siteTitle = (settings.seoTitle || '').trim() || HOME_SEO_TITLE;
  const siteBrand = siteTitle.replace(/\s*\|\s*الموقع الرسمي\s*$/, '').trim() || SITE_BRAND_NAME;
  const siteName = SITE_BRAND_NAME;
  const siteDescription = (settings.seoDescription || '').trim() || HOME_SEO_DESCRIPTION;
  const keywords = (settings.seoKeywords || '').trim() || HOME_SEO_KEYWORDS;

  let title = siteTitle;
  let description = siteDescription;
  let canonical = `${siteUrl}/`;
  let ogType = 'website';
  let ogImage = defaultOgImage;
  let ogImageAlt = `شعار ${siteName}`;
  let robots = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';
  let mainHtml = '';
  let articleSchema: Record<string, any> | null = null;
  let eventSchema: Record<string, any> | null = null;

  if (cleanPath === '/admin' || cleanPath.startsWith('/admin/') || cleanPath === '/login') {
    title = `لوحة التحكم | ${siteBrand}`;
    robots = 'noindex, nofollow';
    mainHtml = '<section><h1>لوحة الإدارة – أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر</h1></section>';
  } else if (cleanPath === '/about') {
    title = `عن الحزب والأمانة | ${siteBrand}`;
    description = 'تعرف على رؤية ورسالة ومبادئ حزب الجبهة الوطنية وأمانة قسم ثالث أكتوبر بمحافظة الجيزة ودورها المجتمعي والتنموي.';
    canonical = `${siteUrl}/about`;
    mainHtml = `
      <section>
        <h1>عن حزب الجبهة الوطنية وأمانة قسم ثالث أكتوبر</h1>
        <p>الموقع الرسمي لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.</p>
        <h2>الرؤية والرسالة</h2>
        <p>حزب الجبهة الوطنية هو حزب سياسي مدني ديمقراطي يعمل على تعزيز المشاركة الشعبية الفاعلة وتحقيق العدالة الاجتماعية والتنمية المستدامة في قسم ثالث أكتوبر ومحافظة الجيزة ومصر.</p>
        <h2>محاور العمل الحزبي في قسم ثالث أكتوبر</h2>
        <p>خدمة المواطنين، دعم الشباب والمرأة، المبادرات التنموية والصحية، والتواصل الميداني المباشر.</p>
      </section>`;
  } else if (cleanPath === '/party-leaders') {
    title = `قيادات حزب الجبهة الوطنية وأمانة قسم ثالث أكتوبر | ${siteBrand}`;
    description = 'تعرف على قيادات حزب الجبهة الوطنية وقيادات وهيئة مكتب أمانة قسم ثالث أكتوبر بمحافظة الجيزة ودورهم في العمل الوطني والمجتمعي.';
    canonical = `${siteUrl}/party-leaders`;
    const combinedLeadersCount = visiblePartyLeaders.length + visibleSecLeaders.length;
    mainHtml = `
      <section>
        <h1>قيادات حزب الجبهة الوطنية وأمانة قسم ثالث أكتوبر</h1>
        <p>القيادات المركزية وقيادات وهيئة مكتب أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.</p>
        ${combinedLeadersCount > 0
          ? [
              ...visiblePartyLeaders.map(l => `<article><h2>${escapeHtml(l.name)}</h2><p>${escapeHtml(l.position)}</p><p>${escapeHtml(l.bio || '')}</p></article>`),
              ...visibleSecLeaders.map(l => `<article><h2>${escapeHtml(l.name)}</h2><p>${escapeHtml(l.title)} – أمانة قسم ثالث أكتوبر</p><p>${escapeHtml(l.bio || '')}</p></article>`)
            ].join('')
          : '<p>يتم تحديث قائمة القيادات عبر الأمانة العامة، ويمكنكم تصفح <a href="/secretariats">الأمانات التخصصية</a>.</p>'
        }
      </section>`;
  } else if (cleanPath === '/secretariat-leaders') {
    title = `قيادات أمانة قسم ثالث أكتوبر – هيئة المكتب | ${siteBrand}`;
    description = 'قيادات وهيئة مكتب أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.';
    canonical = `${siteUrl}/secretariat-leaders`;
    mainHtml = `
      <section>
        <h1>قيادات أمانة قسم ثالث أكتوبر – محافظة الجيزة</h1>
        <p>هيئة مكتب وأمناء حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة.</p>
        ${visibleSecLeaders.length > 0
          ? visibleSecLeaders.map(l => `<article><h2>${escapeHtml(l.name)}</h2><p>${escapeHtml(l.title)}</p><p>${escapeHtml(l.bio || '')}</p></article>`).join('')
          : '<p>تصفح <a href="/secretariats">الأمانات التخصصية</a> للاطلاع على أمناء والأمناء المساعدين لكل أمانة.</p>'
        }
      </section>`;
  } else if (cleanPath === '/secretariats') {
    title = `الأمانات التخصصية والنوعية – قسم ثالث أكتوبر | ${siteBrand}`;
    description = 'استعرض الأمانات التخصصية لحزب الجبهة الوطنية بأمانة قسم ثالث أكتوبر بمحافظة الجيزة ومهامها وأمناءها.';
    canonical = `${siteUrl}/secretariats`;
    mainHtml = `
      <section>
        <h1>الأمانات التخصصية والنوعية – أمانة قسم ثالث أكتوبر</h1>
        <p>تضم أمانة قسم ثالث أكتوبر بمحافظة الجيزة ${activeSecretariats.length} أمانة متخصصة تغطي كافة قطاعات العمل الحزبي والخدمي.</p>
        ${activeSecretariats.map(s => `
          <article>
            <h2><a href="/secretariat/${encodeURIComponent(s.slug)}">${escapeHtml(s.name)}</a></h2>
            <p>${escapeHtml(s.description || '')}</p>
            ${s.secretaryName ? `<p>أمين الأمانة: ${escapeHtml(s.secretaryName)}</p>` : ''}
          </article>`).join('')}
      </section>`;
  } else if (cleanPath.startsWith('/secretariat/')) {
    const slug = cleanPath.slice('/secretariat/'.length);
    const sec = activeSecretariats.find(s => s.slug === slug || s.id === slug) || activeSecretariats[0];
    if (sec) {
      title = `${sec.name} – أمانة قسم ثالث أكتوبر | ${siteBrand}`;
      description = sec.description
        ? `${sec.name} – ${sec.description.slice(0, 140)}`
        : siteDescription;
      canonical = `${siteUrl}/secretariat/${encodeURIComponent(sec.slug)}`;
      ogImage = resolvePublicImageUrl(sec.coverUrl || sec.logoUrl, assetBaseUrl, undefined, undefined, '', defaultOgImage);
      ogImageAlt = sec.name;
      const secMembers = (data.secretariatMembers || []).filter(m => m.secretariatId === sec.id);
      mainHtml = `
        <article>
          <h1>${escapeHtml(sec.name)} – أمانة قسم ثالث أكتوبر</h1>
          <p>${escapeHtml(sec.description || '')}</p>
          <h2>قيادة الأمانة</h2>
          ${sec.secretaryName ? `<p>أمين الأمانة: ${escapeHtml(sec.secretaryName)}</p>` : ''}
          ${(sec.duties || []).length > 0 ? `<h2>المهام والاختصاصات</h2><ul>${sec.duties.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}
          ${(sec.goals || []).length > 0 ? `<h2>الأهداف الاستراتيجية</h2><ul>${sec.goals.map(g => `<li>${escapeHtml(g)}</li>`).join('')}</ul>` : ''}
          ${secMembers.length > 0 ? `<h2>أعضاء الأمانة</h2><ul>${secMembers.map(m => `<li>${escapeHtml(m.name)} – ${escapeHtml(m.role)}</li>`).join('')}</ul>` : ''}
          <p><a href="/secretariats">العودة إلى جميع الأمانات التخصصية</a></p>
        </article>`;
    }
  } else if (cleanPath === '/initiatives') {
    title = `المبادرات المجتمعية والتنموية | ${siteBrand}`;
    description = 'تابع المبادرات الميدانية والتنموية لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.';
    canonical = `${siteUrl}/initiatives`;
    mainHtml = `
      <section>
        <h1>المبادرات التنموية والمجتمعية – أمانة قسم ثالث أكتوبر</h1>
        <p>العمل الميداني وخدمة أهالي قسم ثالث أكتوبر بمحافظة الجيزة.</p>
        ${visibleInitiatives.map(i => `
          <article>
            <h2><a href="/initiative/${encodeURIComponent(i.slug)}">${escapeHtml(i.title)}</a></h2>
            <p>${escapeHtml(i.description)}</p>
          </article>`).join('')}
      </section>`;
  } else if (cleanPath.startsWith('/initiative/')) {
    const slug = cleanPath.slice('/initiative/'.length);
    const init = visibleInitiatives.find(i => i.slug === slug || i.id === slug) || visibleInitiatives[0];
    if (init) {
      const rawAct = typeof req.query?.activity === 'string' ? req.query.activity : '';
      const actIdx = rawAct !== '' && /^\d+$/.test(rawAct) ? Number(rawAct) : -1;
      const act = actIdx >= 0 && init.activities?.[actIdx] ? init.activities[actIdx] : null;
      const firstActImg = (init.activities || []).find((a: any) => a?.imageUrl)?.imageUrl;

      ogType = 'article';
      if (act) {
        title = `${act.title || 'نشاط ميداني'} – ${init.title} | ${siteBrand}`;
        description = (act.description || init.description || siteDescription).slice(0, 160);
        canonical = `${siteUrl}/initiative/${encodeURIComponent(init.slug)}?activity=${actIdx}`;
        ogImage = resolvePublicImageUrl(
          act.imageUrl || init.coverUrl || init.galleryImages?.[0] || firstActImg || init.logoUrl,
          assetBaseUrl,
          'initiatives',
          init.id,
          act.imageUrl ? `?activity=${actIdx}` : '',
          defaultOgImage
        );
        ogImageAlt = act.title || init.title;
      } else {
        title = `${init.title} | ${siteBrand}`;
        description = (init.description || siteDescription).slice(0, 160);
        canonical = `${siteUrl}/initiative/${encodeURIComponent(init.slug)}`;
        ogImage = resolvePublicImageUrl(
          init.coverUrl || init.galleryImages?.[0] || firstActImg || init.logoUrl,
          assetBaseUrl,
          'initiatives',
          init.id,
          '',
          defaultOgImage
        );
        ogImageAlt = init.title;
      }
      mainHtml = `
        <article>
          <h1>${escapeHtml(act ? `${act.title} – ${init.title}` : init.title)}</h1>
          <p>${escapeHtml(act?.description || init.description)}</p>
          ${(act?.venue || init.venue) ? `<p>المكان: ${escapeHtml(act?.venue || init.venue || '')}</p>` : ''}
          ${(init.goals || []).length > 0 ? `<h2>أهداف المبادرة</h2><ul>${init.goals.map(g => `<li>${escapeHtml(g)}</li>`).join('')}</ul>` : ''}
          ${(init.activities || []).length > 0 ? `<h2>الأنشطة الميدانية</h2><ul>${init.activities.map(a => `<li>${escapeHtml(a.title)} (${escapeHtml(a.date)}): ${escapeHtml(a.description)}</li>`).join('')}</ul>` : ''}
          <p><a href="/initiatives">العودة إلى كافة المبادرات</a></p>
        </article>`;
    }
  } else if (cleanPath === '/news') {
    title = `أخبار وبيانات أمانة قسم ثالث أكتوبر | ${siteBrand}`;
    description = 'آخر الأخبار والبيانات الرسمية والتغطيات الميدانية لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.';
    canonical = `${siteUrl}/news`;
    mainHtml = `
      <section>
        <h1>أخبار وبيانات أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر</h1>
        <p>المصدر الرسمي للأخبار والتغطيات الميدانية بمحافظة الجيزة.</p>
        ${publishedNews.map(n => `
          <article>
            <h2><a href="/news/${encodeURIComponent(n.id)}">${escapeHtml(n.title)}</a></h2>
            <p>${escapeHtml(n.publishDate || '')}</p>
            <p>${escapeHtml(n.excerpt || n.content.slice(0, 160))}</p>
          </article>`).join('')}
      </section>`;
  } else if (cleanPath.startsWith('/news/') || (cleanPath === '/' && queryNewsId)) {
    const newsId = cleanPath.startsWith('/news/') ? cleanPath.slice('/news/'.length) : queryNewsId;
    const item = publishedNews.find(n => n.id === newsId || (n as any).slug === newsId);
    if (item) {
      title = `${item.title} | ${siteBrand}`;
      description = (item.excerpt || item.content || siteDescription).slice(0, 160);
      canonical = `${siteUrl}/news/${encodeURIComponent(item.id)}`;
      ogType = 'article';
      const itemImgRaw = item.coverImage || item.galleryImages?.[0];
      ogImage = resolvePublicImageUrl(itemImgRaw, assetBaseUrl, 'news', item.id, '', defaultOgImage);
      ogImageAlt = item.title;
      articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: item.title,
        description,
        image: [ogImage],
        datePublished: item.publishDate || item.createdAt,
        dateModified: item.createdAt || item.publishDate,
        author: {
          '@type': item.authorName ? 'Person' : 'Organization',
          name: item.authorName || siteName
        },
        publisher: {
          '@type': 'Organization',
          name: siteName,
          logo: {
            '@type': 'ImageObject',
            url: defaultOgImage
          }
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': canonical
        }
      };
      mainHtml = `
        <article>
          <h1>${escapeHtml(item.title)}</h1>
          <p>${escapeHtml(item.publishDate || '')}</p>
          ${itemImgRaw ? `<img src="${escapeHtml(ogImage)}" alt="${escapeHtml(item.title)}" />` : ''}
          <div>${escapeHtml(item.content)}</div>
          <p><a href="/news">العودة إلى كافة الأخبار</a></p>
        </article>`;
    }
  } else if (cleanPath === '/events') {
    title = `الفعاليات والأنشطة – أمانة قسم ثالث أكتوبر | ${siteBrand}`;
    description = 'جدول الفعاليات واللقاءات والندوات والقوافل لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.';
    canonical = `${siteUrl}/events`;
    mainHtml = `
      <section>
        <h1>الفعاليات والأنشطة الميدانية – أمانة قسم ثالث أكتوبر</h1>
        <p>مؤتمرات وندوات وقوافل أمانة قسم ثالث أكتوبر بمحافظة الجيزة.</p>
        ${visibleEvents.map(e => `
          <article>
            <h2><a href="/events/${encodeURIComponent(e.id)}">${escapeHtml(e.title)}</a></h2>
            <p>${escapeHtml(e.description)}</p>
            <p>المكان: ${escapeHtml(e.venue)} – المنظم: ${escapeHtml(e.organizer)}</p>
          </article>`).join('')}
      </section>`;
  } else if (cleanPath.startsWith('/events/')) {
    const evId = cleanPath.slice('/events/'.length);
    const ev = visibleEvents.find(e => e.id === evId || (e as any).slug === evId);
    if (ev) {
      title = `${ev.title} | ${siteBrand}`;
      description = (ev.description || siteDescription).slice(0, 160);
      canonical = `${siteUrl}/events/${encodeURIComponent(ev.id)}`;
      ogType = 'article';
      ogImage = resolvePublicImageUrl(
        ev.coverUrl || ev.coverImage || ev.images?.[0] || ev.galleryImages?.[0],
        assetBaseUrl,
        'events',
        ev.id,
        '',
        defaultOgImage
      );
      ogImageAlt = ev.title;
      eventSchema = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: ev.title,
        description,
        startDate: ev.dateTime,
        location: {
          '@type': 'Place',
          name: ev.venue || address,
          address
        },
        image: [ogImage],
        organizer: {
          '@type': 'Organization',
          name: ev.organizer || siteName,
          url: `${siteUrl}/`
        }
      };
      mainHtml = `
        <article>
          <h1>${escapeHtml(ev.title)}</h1>
          <p>${escapeHtml(ev.description)}</p>
          <p>المكان: ${escapeHtml(ev.venue)} – الجهة المنظمة: ${escapeHtml(ev.organizer)}</p>
          <p><a href="/events">العودة إلى كافة الفعاليات</a></p>
        </article>`;
    }
  } else if (cleanPath === '/live') {
    const ls = data.liveStream;
    title = `البث المباشر | ${siteBrand}`;
    description = ls?.description || 'البث المباشر لفعاليات ومؤتمرات أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.';
    canonical = `${siteUrl}/live`;
    mainHtml = `
      <section>
        <h1>البث المباشر – أمانة قسم ثالث أكتوبر</h1>
        <h2>${escapeHtml(ls?.title || 'البث المباشر لفعاليات الحزب')}</h2>
        <p>${escapeHtml(ls?.description || 'تابع البث المباشر للمؤتمرات واللقاءات الجماهيرية.')}</p>
        ${ls?.streamUrl ? `<p><a href="${escapeHtml(ls.streamUrl)}">رابط البث المباشر</a></p>` : ''}
      </section>`;
  } else if (cleanPath === '/join') {
    title = `طلب العضوية والانضمام | ${siteBrand}`;
    description = 'التقديم الإلكتروني لعضوية حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة والاستعلام عن حالة الطلب.';
    canonical = `${siteUrl}/join`;
    mainHtml = `
      <section>
        <h1>استمارة طلب الانضمام والعضوية – أمانة قسم ثالث أكتوبر</h1>
        <p>تقديم طلب العضوية الإلكتروني لأبناء قسم ثالث أكتوبر بمحافظة الجيزة، ومتابعة حالة الطلب إلكترونياً.</p>
        <h2>شروط ومستندات الانضمام</h2>
        <p>إدخال البيانات الشخصية والرقم القومي والتواصل عبر استمارة العضوية الإلكترونية المعتمدة.</p>
      </section>`;
  } else if (cleanPath === '/contact') {
    title = `تواصل معنا ومقر الأمانة | ${siteBrand}`;
    description = 'طرق التواصل المباشرة ومقر أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة وأرقام الهاتف والواتساب والخريطة.';
    canonical = `${siteUrl}/contact`;
    mainHtml = `
      <section>
        <h1>تواصل مع أمانة قسم ثالث أكتوبر – حزب الجبهة الوطنية</h1>
        <p>قنوات الاتصال المباشرة مع أمانة قسم ثالث أكتوبر بمحافظة الجيزة.</p>
        <h2>بيانات الاتصال ومقر الأمانة</h2>
        <p>العنوان: ${escapeHtml(address)}</p>
        <p>الهاتف وخدمة المواطنين: <a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></p>
      </section>`;
  } else if (cleanPath.startsWith('/page/')) {
    const slug = cleanPath.slice('/page/'.length);
    const page = publishedPages.find(p => p.slug === slug);
    if (page) {
      title = `${page.title} | ${siteBrand}`;
      description = page.metaDescription || page.subtitle || (page.content || siteDescription).slice(0, 160);
      canonical = `${siteUrl}/page/${encodeURIComponent(page.slug)}`;
      ogImage = resolvePublicImageUrl(page.coverImage, assetBaseUrl, undefined, undefined, '', defaultOgImage);
      ogImageAlt = page.title;
      mainHtml = `
        <article>
          <h1>${escapeHtml(page.title)}</h1>
          ${page.subtitle ? `<p>${escapeHtml(page.subtitle)}</p>` : ''}
          <div>${escapeHtml(page.content)}</div>
        </article>`;
    }
  }

  // Default Home SSR markup (for '/' or unmatched SPA paths falling back to Home)
  if (!mainHtml) {
    title = siteTitle;
    description = siteDescription;
    canonical = `${siteUrl}/`;
    mainHtml = `
      <section>
        <h1>حزب الجبهة الوطنية أمانة قسم ثالث أكتوبر</h1>
        <p>${escapeHtml(siteDescription)}</p>
        <p>حزب الجبهة الوطنية هو حزب سياسي مدني ديمقراطي يهدف إلى تعزيز المشاركة الشعبية الفاعلة وتحقيق العدالة الاجتماعية والتنمية المستدامة لخدمة أهالي قسم ثالث أكتوبر ومحافظة الجيزة.</p>
      </section>
      <section>
        <h2>مقر حزب الجبهة الوطنية – قسم ثالث أكتوبر</h2>
        <p>${escapeHtml(address)}</p>
      </section>
      <section>
        <h2>الأمانات التخصصية لأمانة قسم ثالث أكتوبر</h2>
        <ul>
          ${activeSecretariats.map(s => `<li><a href="/secretariat/${encodeURIComponent(s.slug)}">${escapeHtml(s.name)}</a> – ${escapeHtml(s.description || '')}</li>`).join('')}
        </ul>
        <p><a href="/secretariats">استعراض جميع الأمانات</a></p>
      </section>
      ${(visiblePartyLeaders.length > 0 || visibleSecLeaders.length > 0) ? `
      <section>
        <h2>قيادات حزب الجبهة الوطنية وأمانة قسم ثالث أكتوبر</h2>
        <ul>
          ${visiblePartyLeaders.map(l => `<li>${escapeHtml(l.name)} – ${escapeHtml(l.position)}</li>`).join('')}
          ${visibleSecLeaders.map(l => `<li>${escapeHtml(l.name)} – ${escapeHtml(l.title)} (أمانة قسم ثالث أكتوبر)</li>`).join('')}
        </ul>
        <p><a href="/party-leaders">عرض جميع القيادات</a></p>
      </section>` : ''}
      ${visibleInitiatives.length > 0 ? `
      <section>
        <h2>مبادرات حزب الجبهة الوطنية – قسم ثالث أكتوبر</h2>
        <ul>
          ${visibleInitiatives.map(i => `<li><a href="/initiative/${encodeURIComponent(i.slug)}">${escapeHtml(i.title)}</a> – ${escapeHtml(i.description)}</li>`).join('')}
        </ul>
        <p><a href="/initiatives">كافة المبادرات</a></p>
      </section>` : ''}
      ${publishedNews.length > 0 ? `
      <section>
        <h2>آخر الأخبار والبيانات</h2>
        <ul>
          ${publishedNews.slice(0, 5).map(n => `<li><a href="/news/${encodeURIComponent(n.id)}">${escapeHtml(n.title)}</a></li>`).join('')}
        </ul>
        <p><a href="/news">المزيد من الأخبار</a></p>
      </section>` : ''}
      ${visibleEvents.length > 0 ? `
      <section>
        <h2>الفعاليات والأنشطة</h2>
        <ul>
          ${visibleEvents.slice(0, 5).map(e => `<li><a href="/events/${encodeURIComponent(e.id)}">${escapeHtml(e.title)}</a></li>`).join('')}
        </ul>
        <p><a href="/events">المزيد من الفعاليات</a></p>
      </section>` : ''}
      <section>
        <h2>طرق التواصل والانضمام لأمانة قسم ثالث أكتوبر بمحافظة الجيزة</h2>
        <p>الهاتف: <a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a> | العنوان: ${escapeHtml(address)}</p>
        <p><a href="/join">استمارة طلب الانضمام</a> | <a href="/contact">صفحة التواصل والخريطة</a></p>
      </section>`;
  }

  return {
    title,
    description,
    keywords,
    siteName,
    siteDescription,
    canonical,
    ogUrl: canonical,
    ogType,
    ogImage,
    ogImageAlt,
    robots,
    articleSchema,
    eventSchema,
    ssrHtml: renderSsrShell(data, mainHtml)
  };
}

function injectDynamicSiteMeta(html: string, req: Request): string {
  const data = db.get();
  const settings = data.settings;
  const seo = resolveRouteSeoAndSsr(req, data);
  const phoneIntl = settings?.phone
    ? (settings.phone.startsWith('+') ? settings.phone : `+20${settings.phone.replace(/^0/, '')}`)
    : '+201003070108';
  const streetAddress = settings?.address || 'مقر أمانة قسم ثالث أكتوبر – طريق الشاذلي، ابني بيتك 7، قسم ثالث 6 أكتوبر، محافظة الجيزة 3265020';

  const siteUrl = getOfficialSiteUrl(data);

  const organizationSchema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'PoliticalParty',
    name: seo.siteName,
    url: `${siteUrl}/`,
    description: seo.siteDescription,
    logo: `${siteUrl}/site-icon.png`,
    telephone: phoneIntl,
    address: {
      '@type': 'PostalAddress',
      streetAddress,
      addressLocality: 'قسم ثالث 6 أكتوبر',
      addressRegion: 'محافظة الجيزة',
      addressCountry: 'EG'
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: phoneIntl,
      contactType: 'customer service',
      availableLanguage: ['ar']
    }
  };
  if (settings?.email) {
    organizationSchema.email = settings.email;
  }
  if (settings?.facebookUrl) {
    organizationSchema.sameAs = [settings.facebookUrl];
  }

  const schemas: Record<string, any>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: seo.siteName,
      alternateName: ['أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر', 'حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر', 'أمانة قسم ثالث أكتوبر'],
      url: `${siteUrl}/`,
      description: seo.siteDescription,
      inLanguage: 'ar'
    },
    organizationSchema
  ];
  if (seo.articleSchema) schemas.push(seo.articleSchema);
  if (seo.eventSchema) schemas.push(seo.eventSchema);

  const jsonLd = JSON.stringify(schemas, null, 2);

  let out = html;
  const gtmId = (settings?.googleTagManagerId || '').trim() || DEFAULT_GTM_ID;
  const ga4Id = (settings?.googleAnalyticsId || '').trim() || DEFAULT_GA4_ID;

  // Replace GTM / GA4 IDs cleanly without ever duplicating script tags
  if (gtmId && gtmId !== DEFAULT_GTM_ID) {
    out = out.split(DEFAULT_GTM_ID).join(escapeHtml(gtmId));
  }
  if (ga4Id && ga4Id !== DEFAULT_GA4_ID) {
    out = out.split(DEFAULT_GA4_ID).join(escapeHtml(ga4Id));
  }

  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`);
  out = out.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${escapeHtml(seo.description)}" />`);
  out = out.replace(/<meta\s+name="keywords"\s+content="[^"]*"\s*\/?>/i, `<meta name="keywords" content="${escapeHtml(seo.keywords)}" />`);
  out = out.replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i, `<meta name="robots" content="${escapeHtml(seo.robots)}" />`);
  out = out.replace(/<meta\s+name="googlebot"\s+content="[^"]*"\s*\/?>/i, `<meta name="googlebot" content="${escapeHtml(seo.robots)}" />`);

  const customVerification = (settings?.googleSiteVerification || '')
    .trim()
    .replace(/^google-site-verification=/i, '');
  const verificationTokens = Array.from(
    new Set([
      ...DEFAULT_GOOGLE_VERIFICATION_TOKENS,
      ...(customVerification ? [customVerification] : [])
    ])
  );
  const verificationMetaTags = verificationTokens
    .map(token => `<meta name="google-site-verification" content="${escapeHtml(token)}" />`)
    .join('\n    ');
  out = out.replace(
    /(?:\s*<meta\s+name="google-site-verification"\s+content="[^"]*"\s*\/?>)+/i,
    `\n    ${verificationMetaTags}`
  );

  out = out.replace(/<meta\s+name="application-name"\s+content="[^"]*"\s*\/?>/i, `<meta name="application-name" content="${escapeHtml(seo.siteName)}" />`);
  out = out.replace(/<meta\s+name="apple-mobile-web-app-title"\s+content="[^"]*"\s*\/?>/i, `<meta name="apple-mobile-web-app-title" content="${escapeHtml(seo.siteName)}" />`);
  out = out.replace(/<meta\s+property="og:site_name"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:site_name" content="${escapeHtml(seo.siteName)}" />`);
  out = out.replace(/<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:type" content="${escapeHtml(seo.ogType)}" />`);
  out = out.replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${escapeHtml(seo.ogUrl)}" />`);
  out = out.replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${escapeHtml(seo.title)}" />`);
  out = out.replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${escapeHtml(seo.description)}" />`);
  out = out.replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${escapeHtml(seo.ogImage)}" />`);
  out = out.replace(/<meta\s+property="og:image:secure_url"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:image:secure_url" content="${escapeHtml(seo.ogImage)}" />`);
  out = out.replace(/<meta\s+property="og:image:alt"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:image:alt" content="${escapeHtml(seo.ogImageAlt)}" />`);
  out = out.replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${escapeHtml(seo.title)}" />`);
  out = out.replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${escapeHtml(seo.description)}" />`);
  out = out.replace(/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${escapeHtml(seo.ogImage)}" />`);
  out = out.replace(/<meta\s+name="twitter:image:alt"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:image:alt" content="${escapeHtml(seo.ogImageAlt)}" />`);
  out = out.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${escapeHtml(seo.canonical)}" />`);
  out = out.replace(/<link\s+rel="image_src"\s+href="[^"]*"\s*\/?>/i, `<link rel="image_src" href="${escapeHtml(seo.ogImage)}" />`);

  out = out.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/i,
    `<script type="application/ld+json">\n${jsonLd}\n    </script>`
  );

  // Always embed lean initial public data synchronously so browsers & Googlebot WRS never wait on an async spinner
  const bootstrapPayload = buildPublicPortalPayload(data, { externalizeInlineImages: true });
  const serializedBootstrap = serializeJsonForHtmlScript(bootstrapPayload);
  const bootstrapScript = `<script id="__NFP_INITIAL_DATA__" type="application/json">${serializedBootstrap}</script>`;
  if (out.includes('<script type="module"')) {
    out = out.replace('<script type="module"', `${bootstrapScript}\n    <script type="module"`);
  } else if (out.includes('</body>')) {
    out = out.replace('</body>', `  ${bootstrapScript}\n  </body>`);
  }

  // Inject semantic SSR HTML into #root ONLY for search/social crawlers (keeps human mobile browsers 100% free of unstyled text flash)
  const cleanReqPath = decodeURIComponent(req.path || '/').replace(/\/+$/, '') || '/';
  const isPrivateAdminPath =
    cleanReqPath === '/admin' || cleanReqPath.startsWith('/admin/') || cleanReqPath === '/login';
  if (!isPrivateAdminPath && isCrawlerUserAgent(req.headers['user-agent'] as string | undefined)) {
    out = out.replace(/<div id="root"><\/div>/i, `<div id="root">${seo.ssrHtml}</div>`);
  }

  return out;
}

function isCrawlerUserAgent(userAgent?: string): boolean {
  const ua = String(userAgent || '');
  if (!ua) return false;
  return /googlebot|google-inspectiontool|adsbot-google|mediapartners-google|apis-google|storebot-google|googleother|bingbot|yandexbot|duckduckbot|baiduspider|slurp|applebot|facebookexternalhit|facebot|whatsapp|telegrambot|twitterbot|linkedinbot|slackbot|discordbot|pinterest|ahrefsbot|semrushbot/i.test(
    ua
  );
}

function serializeJsonForHtmlScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function toInlineAssetUrl(
  raw: string | undefined,
  collection: string,
  id: string,
  field: string
): string | undefined {
  if (!raw || typeof raw !== 'string') return raw;
  if (!raw.startsWith('data:image/')) return raw;
  return `/api/public/inline-asset/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/${encodeURIComponent(field)}`;
}

function buildPublicPortalPayload(
  data: ReturnType<typeof db.get>,
  options?: { externalizeInlineImages?: boolean }
) {
  const ext = Boolean(options?.externalizeInlineImages);
  const rawSettingsInput = data.settings || ({} as any);
  const rawHeroVideoUrl = String(rawSettingsInput.heroVideoUrl || '').trim();
  const resolvedHeroVideoUrl =
    rawHeroVideoUrl.startsWith('/uploads/') && !resolveSafeLocalMediaFile(rawHeroVideoUrl)
      ? '/assets/aistudio/VID-20261023-WA0156_a7a2c2e2.mp4'
      : rawSettingsInput.heroVideoUrl;
  const rawSettings = {
    ...rawSettingsInput,
    heroVideoUrl: resolvedHeroVideoUrl
  };
  const settings = ext
    ? {
        ...rawSettings,
        officialLogo: toInlineAssetUrl(rawSettings.officialLogo, 'settings', 'main', 'officialLogo'),
        seoShareImage: toInlineAssetUrl(rawSettings.seoShareImage, 'settings', 'main', 'seoShareImage'),
        heroPosterUrl: toInlineAssetUrl(rawSettings.heroPosterUrl, 'settings', 'main', 'heroPosterUrl'),
        entranceImageUrl: toInlineAssetUrl(rawSettings.entranceImageUrl, 'settings', 'main', 'entranceImageUrl'),
        heroImages: Array.isArray(rawSettings.heroImages)
          ? rawSettings.heroImages.map((img: string, idx: number) =>
              toInlineAssetUrl(img, 'settings', 'main', `heroImages_${idx}`)
            )
          : rawSettings.heroImages,
        heroSlides: Array.isArray(rawSettings.heroSlides)
          ? rawSettings.heroSlides.map((slide: any, idx: number) => ({
              ...slide,
              url: toInlineAssetUrl(slide?.url, 'settings', 'main', `heroSlides_${idx}_url`),
              posterUrl: toInlineAssetUrl(slide?.posterUrl, 'settings', 'main', `heroSlides_${idx}_posterUrl`)
            }))
          : rawSettings.heroSlides
      }
    : rawSettings;

  const partyLeaders = (data.partyLeaders || [])
    .filter(l => l.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(l =>
      ext ? { ...l, photoUrl: toInlineAssetUrl(l.photoUrl, 'partyLeaders', l.id, 'photoUrl') || '' } : l
    );

  const secretariatLeaders = (data.secretariatLeaders || [])
    .filter(l => l.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(l =>
      ext ? { ...l, photoUrl: toInlineAssetUrl(l.photoUrl, 'secretariatLeaders', l.id, 'photoUrl') || '' } : l
    );

  const specializedSecretariats = (data.specializedSecretariats || [])
    .filter(s => s.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(s =>
      ext
        ? {
            ...s,
            logoUrl: toInlineAssetUrl(s.logoUrl, 'specializedSecretariats', s.id, 'logoUrl'),
            coverUrl: toInlineAssetUrl(s.coverUrl, 'specializedSecretariats', s.id, 'coverUrl'),
            secretaryPhotoUrl: toInlineAssetUrl(s.secretaryPhotoUrl, 'specializedSecretariats', s.id, 'secretaryPhotoUrl'),
            assistantSecretaryPhotoUrl: toInlineAssetUrl(
              s.assistantSecretaryPhotoUrl,
              'specializedSecretariats',
              s.id,
              'assistantSecretaryPhotoUrl'
            ),
            assistantSecretaries: Array.isArray(s.assistantSecretaries)
              ? s.assistantSecretaries.map((asst, idx) => ({
                  ...asst,
                  photoUrl: toInlineAssetUrl(
                    asst.photoUrl,
                    'specializedSecretariats',
                    s.id,
                    `assistantSecretaries_${idx}_photoUrl`
                  )
                }))
              : s.assistantSecretaries,
            galleryImages: Array.isArray(s.galleryImages)
              ? s.galleryImages.map((img, idx) =>
                  toInlineAssetUrl(img, 'specializedSecretariats', s.id, `galleryImages_${idx}`) || ''
                )
              : s.galleryImages
          }
        : s
    );

  const secretariatMembers = (data.secretariatMembers || []).map(m =>
    ext ? { ...m, photoUrl: toInlineAssetUrl(m.photoUrl, 'secretariatMembers', m.id, 'photoUrl') } : m
  );

  const initiatives = (data.initiatives || [])
    .filter(i => i.isVisible)
    .map(i =>
      ext
        ? {
            ...i,
            logoUrl: toInlineAssetUrl(i.logoUrl, 'initiatives', i.id, 'logoUrl'),
            coverUrl: toInlineAssetUrl(i.coverUrl, 'initiatives', i.id, 'coverUrl'),
            galleryImages: Array.isArray(i.galleryImages)
              ? i.galleryImages.map((img, idx) =>
                  toInlineAssetUrl(img, 'initiatives', i.id, `galleryImages_${idx}`) || ''
                )
              : i.galleryImages,
            activities: Array.isArray(i.activities)
              ? i.activities.map((act, idx) => ({
                  ...act,
                  imageUrl: toInlineAssetUrl(act.imageUrl, 'initiatives', i.id, `activities_${idx}_imageUrl`)
                }))
              : i.activities
          }
        : i
    );

  const news = (data.news || [])
    .filter(n => !n.isDraft)
    .sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime())
    .map(n =>
      ext
        ? {
            ...n,
            coverImage: toInlineAssetUrl(n.coverImage, 'news', n.id, 'coverImage'),
            galleryImages: Array.isArray(n.galleryImages)
              ? n.galleryImages.map((img, idx) =>
                  toInlineAssetUrl(img, 'news', n.id, `galleryImages_${idx}`) || ''
                )
              : n.galleryImages
          }
        : n
    );

  const events = (data.events || [])
    .filter(e => e.isVisible)
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
    .map(e =>
      ext
        ? {
            ...e,
            coverUrl: toInlineAssetUrl(e.coverUrl, 'events', e.id, 'coverUrl'),
            coverImage: toInlineAssetUrl(e.coverImage, 'events', e.id, 'coverImage'),
            images: Array.isArray(e.images)
              ? e.images.map((img, idx) => toInlineAssetUrl(img, 'events', e.id, `images_${idx}`) || '')
              : e.images,
            galleryImages: Array.isArray(e.galleryImages)
              ? e.galleryImages.map((img, idx) =>
                  toInlineAssetUrl(img, 'events', e.id, `galleryImages_${idx}`) || ''
                )
              : e.galleryImages
          }
        : e
    );

  const media = (data.media || [])
    .filter(m => m.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(m =>
      ext
        ? {
            ...m,
            url: toInlineAssetUrl(m.url, 'media', m.id, 'url') || m.url,
            thumbnail: toInlineAssetUrl(m.thumbnail, 'media', m.id, 'thumbnail')
          }
        : m
    );

  const pages = (data.pages || [])
    .filter(p => p.isPublished)
    .map(p =>
      ext
        ? {
            ...p,
            coverImage: toInlineAssetUrl(p.coverImage, 'pages', p.id, 'coverImage'),
            galleryImages: Array.isArray(p.galleryImages)
              ? p.galleryImages.map((img, idx) =>
                  toInlineAssetUrl(img, 'pages', p.id, `galleryImages_${idx}`) || ''
                )
              : p.galleryImages
          }
        : p
    );

  return {
    settings,
    partyLeaders,
    secretariatLeaders,
    specializedSecretariats,
    secretariatMembers,
    initiatives,
    news,
    events,
    media,
    liveStream: data.liveStream,
    pages,
    deletedTombstones: data.deletedTombstones || []
  };
}

// Same-origin crawlable favicon & Apple touch icon endpoints (required by Google Search Favicon bot; avoids external noimageindex headers)
app.get([
  '/favicon.ico',
  '/favicon-48x48.png',
  '/favicon-96x96.png',
  '/favicon-192x192.png',
  '/site-icon.png',
  '/site-icon.jpg',
  '/apple-touch-icon.png',
  '/apple-touch-icon.jpg'
], (req: Request, res: Response) => {
  const iconMap: Record<string, { file: string; mime: string }> = {
    '/favicon.ico': { file: 'favicon.ico', mime: 'image/x-icon' },
    '/favicon-48x48.png': { file: 'favicon-48x48.png', mime: 'image/png' },
    '/favicon-96x96.png': { file: 'favicon-96x96.png', mime: 'image/png' },
    '/favicon-192x192.png': { file: 'favicon-192x192.png', mime: 'image/png' },
    '/site-icon.png': { file: 'site-icon.png', mime: 'image/png' },
    '/site-icon.jpg': { file: 'site-icon.jpg', mime: 'image/jpeg' },
    '/apple-touch-icon.png': { file: 'apple-touch-icon.png', mime: 'image/png' },
    '/apple-touch-icon.jpg': { file: 'site-icon.jpg', mime: 'image/jpeg' }
  };

  const entry = iconMap[req.path] || { file: 'site-icon.png', mime: 'image/png' };
  const publicFile = path.resolve(process.cwd(), 'public', entry.file);
  const distFile = path.resolve(process.cwd(), 'dist', entry.file);
  const fallbackPublic = path.resolve(process.cwd(), 'public', 'site-icon.jpg');
  const resolved = fs.existsSync(publicFile)
    ? publicFile
    : (fs.existsSync(distFile) ? distFile : (fs.existsSync(fallbackPublic) ? fallbackPublic : getDefaultLogoPath()));

  if (fs.existsSync(resolved)) {
    const ext = path.extname(resolved).toLowerCase();
    const mime = ext === '.ico' ? 'image/x-icon' : (ext === '.png' ? 'image/png' : entry.mime || getLogoMimeType(resolved));
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Robots-Tag', 'all');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    return res.sendFile(resolved);
  }
  return res.status(404).end();
});

// Direct official logo & SEO social-share image endpoints for WhatsApp, Facebook, Telegram, Twitter, and OpenGraph previews
app.get(['/og-logo.jpg', '/api/site-logo', '/api/seo/share-image'], (req: Request, res: Response) => {
  const data = db.get();
  const preferShare = req.path === '/api/seo/share-image' || req.query?.kind === 'share';
  const rawLogo = (preferShare ? (data.settings?.seoShareImage || data.settings?.officialLogo) : data.settings?.officialLogo) || '';

  if (rawLogo.startsWith('data:image/')) {
    const match = rawLogo.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      res.setHeader('Content-Type', match[1]);
      res.setHeader('X-Robots-Tag', 'all');
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      return res.send(Buffer.from(match[2], 'base64'));
    }
  }

  if (rawLogo.startsWith('http://') || rawLogo.startsWith('https://')) {
    return res.redirect(rawLogo);
  }

  if (rawLogo.startsWith('/uploads/')) {
    const filename = path.basename(rawLogo);
    const uploadFilePath = path.join(uploadsDir, filename);
    if (fs.existsSync(uploadFilePath)) {
      res.setHeader('Content-Type', getLogoMimeType(uploadFilePath));
      res.setHeader('X-Robots-Tag', 'all');
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      return res.sendFile(uploadFilePath);
    }
  }

  if (rawLogo.startsWith('/assets/')) {
    const rel = rawLogo.replace(/^\/+/, '');
    const publicAsset = path.resolve(process.cwd(), 'public', rel);
    const distAsset = path.resolve(process.cwd(), 'dist', rel);
    const resolved = fs.existsSync(publicAsset) ? publicAsset : (fs.existsSync(distAsset) ? distAsset : null);
    if (resolved) {
      res.setHeader('Content-Type', getLogoMimeType(resolved));
      res.setHeader('X-Robots-Tag', 'all');
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      return res.sendFile(resolved);
    }
  }

  const defaultLogo = getDefaultLogoPath();
  if (fs.existsSync(defaultLogo)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('X-Robots-Tag', 'all');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return res.sendFile(defaultLogo);
  }

  return res.status(404).send('Logo not found');
});

// Serve decoded inline data:image assets cleanly as cacheable HTTP images for ultra-fast SSR & public bootstrap
app.get('/api/public/inline-asset/:collection/:id/:field', (req: Request, res: Response) => {
  const { collection: col, id, field } = req.params;
  const data = db.get();
  let rawVal: unknown;

  if (col === 'settings') {
    const s: any = data.settings || {};
    if (field.startsWith('heroImages_')) {
      const idx = Number(field.slice('heroImages_'.length));
      rawVal = Number.isInteger(idx) ? s.heroImages?.[idx] : undefined;
    } else if (field.startsWith('heroSlides_')) {
      const m = field.match(/^heroSlides_(\d+)_(url|posterUrl)$/);
      rawVal = m ? s.heroSlides?.[Number(m[1])]?.[m[2]] : undefined;
    } else {
      rawVal = s[field];
    }
  } else {
    const list: any[] = Array.isArray((data as any)[col]) ? (data as any)[col] : [];
    const item = list.find(x => x && x.id === id);
    if (item) {
      if (field.startsWith('galleryImages_')) {
        const idx = Number(field.slice('galleryImages_'.length));
        rawVal = Number.isInteger(idx) ? item.galleryImages?.[idx] : undefined;
      } else if (field.startsWith('images_')) {
        const idx = Number(field.slice('images_'.length));
        rawVal = Number.isInteger(idx) ? item.images?.[idx] : undefined;
      } else if (field.startsWith('activities_')) {
        const m = field.match(/^activities_(\d+)_imageUrl$/);
        rawVal = m ? item.activities?.[Number(m[1])]?.imageUrl : undefined;
      } else if (field.startsWith('assistantSecretaries_')) {
        const m = field.match(/^assistantSecretaries_(\d+)_photoUrl$/);
        rawVal = m ? item.assistantSecretaries?.[Number(m[1])]?.photoUrl : undefined;
      } else {
        rawVal = item[field];
      }
    }
  }

  if (typeof rawVal === 'string' && rawVal.startsWith('data:image/')) {
    const match = rawVal.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      res.setHeader('Content-Type', match[1]);
      res.setHeader('X-Robots-Tag', 'all');
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.send(Buffer.from(match[2], 'base64'));
    }
  }
  if (typeof rawVal === 'string' && (rawVal.startsWith('http://') || rawVal.startsWith('https://') || rawVal.startsWith('/'))) {
    return res.redirect(rawVal);
  }
  return res.redirect('/og-logo.jpg');
});

// Serve persistent uploaded images stored in Firestore uploads_public (survives container restarts & syncs across Preview/Live)
const firestoreAssetMemoryCache = new Map<string, { mime: string; buffer: Buffer }>();
app.get('/api/public/firestore-asset/:assetId', async (req: Request, res: Response) => {
  const assetId = String(req.params.assetId || '').trim();
  if (!/^[a-zA-Z0-9_\-]{1,128}$/.test(assetId)) {
    return res.status(400).send('Invalid asset ID');
  }

  const cachedMem = firestoreAssetMemoryCache.get(assetId);
  if (cachedMem) {
    res.setHeader('Content-Type', cachedMem.mime);
    res.setHeader('X-Robots-Tag', 'all');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(cachedMem.buffer);
  }

  const diskBin = path.join(uploadsDir, `${assetId}.bin`);
  const diskMeta = path.join(uploadsDir, `${assetId}.mime`);
  if (fs.existsSync(diskBin) && fs.existsSync(diskMeta)) {
    try {
      const mime = fs.readFileSync(diskMeta, 'utf-8').trim() || 'image/jpeg';
      const buffer = fs.readFileSync(diskBin);
      firestoreAssetMemoryCache.set(assetId, { mime, buffer });
      res.setHeader('Content-Type', mime);
      res.setHeader('X-Robots-Tag', 'all');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(buffer);
    } catch {
      // fall through to Firestore fetch
    }
  }

  if (firebaseRuntimeConfig) {
    try {
      const { projectId, firestoreDatabaseId, apiKey } = firebaseRuntimeConfig;
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(firestoreDatabaseId)}/documents/uploads_public/${encodeURIComponent(assetId)}?key=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const docJson: any = await resp.json();
        const decoded = decodeFirestoreRestValue({ mapValue: { fields: docJson?.fields || {} } });
        if (decoded && decoded.isPublic === true && typeof decoded.dataBase64 === 'string') {
          const mime = String(decoded.mime || 'image/jpeg');
          const buffer = Buffer.from(decoded.dataBase64, 'base64');
          firestoreAssetMemoryCache.set(assetId, { mime, buffer });
          try {
            fs.writeFileSync(diskBin, buffer);
            fs.writeFileSync(diskMeta, mime, 'utf-8');
          } catch {
            // ignore disk cache error
          }
          res.setHeader('Content-Type', mime);
          res.setHeader('X-Robots-Tag', 'all');
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return res.send(buffer);
        }
      }
    } catch {
      // fall through
    }
  }

  return res.redirect('/og-logo.jpg');
});

// Extracted lightweight MP3 track for custom hero videos (prevents mobile OS lockscreen media bars)
app.get('/api/public/hero-audio', async (req: Request, res: Response) => {
  const src = typeof req.query?.src === 'string' ? req.query.src : '';
  const mp3Path = await ensureHeroAudioMp3(src);
  if (!mp3Path || !fs.existsSync(mp3Path)) {
    return res.status(404).json({ error: 'Audio track not available' });
  }
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.sendFile(mp3Path);
});

// 1. Get all public portal data
app.get('/api/public/data', async (_req: Request, res: Response) => {
  await hydrateDbFromPublicFirestoreRest(false).catch(() => undefined);
  const data = db.get();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json(buildPublicPortalPayload(data, { externalizeInlineImages: true }));
});

// Track real public page visits for Admin Google Analytics dashboard
app.post('/api/public/analytics/track', (req: Request, res: Response) => {
  try {
    const rawPath = String(req.body?.path || '/').split('?')[0].slice(0, 200) || '/';
    if (rawPath.startsWith('/admin') || rawPath.startsWith('/login') || rawPath.startsWith('/#admin')) {
      return res.json({ success: true, ignored: true });
    }
    const rawTitle = String(req.body?.title || '').trim().slice(0, 180) || rawPath;
    const rawReferrer = String(req.body?.referrer || '').trim();
    const rawVisitorId = String(req.body?.visitorId || '').trim();
    const ua = String(req.headers['user-agent'] || '');
    const device =
      req.body?.device === 'mobile' || /Mobi|Android|iPhone|iPad|iPod/i.test(ua)
        ? 'mobile'
        : 'desktop';

    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    const visitorSeed = rawVisitorId || `${req.ip || 'anon'}:${ua.slice(0, 60)}`;
    const visitorHash = crypto
      .createHash('sha1')
      .update(`${dateKey}:${visitorSeed}`)
      .digest('hex')
      .slice(0, 14);

    const data = db.get();
    if (!data.analytics) {
      data.analytics = { daily: {}, pages: {}, sources: {}, updatedAt: '' };
    }

    if (!data.analytics.daily[dateKey]) {
      data.analytics.daily[dateKey] = { visitors: [], pageViews: 0, mobile: 0, desktop: 0 };
    }
    const dayBucket = data.analytics.daily[dateKey];
    dayBucket.pageViews = (dayBucket.pageViews || 0) + 1;
    if (device === 'mobile') dayBucket.mobile = (dayBucket.mobile || 0) + 1;
    else dayBucket.desktop = (dayBucket.desktop || 0) + 1;
    if (!Array.isArray(dayBucket.visitors)) dayBucket.visitors = [];
    if (!dayBucket.visitors.includes(visitorHash) && dayBucket.visitors.length < 5000) {
      dayBucket.visitors.push(visitorHash);
    }

    // Prune daily buckets older than 90 days
    const dailyKeys = Object.keys(data.analytics.daily).sort();
    if (dailyKeys.length > 90) {
      for (const oldKey of dailyKeys.slice(0, dailyKeys.length - 90)) {
        delete data.analytics.daily[oldKey];
      }
    }

    if (!data.analytics.pages[rawPath]) {
      data.analytics.pages[rawPath] = {
        path: rawPath,
        title: rawTitle,
        views: 0,
        visitors: [],
        lastVisitedAt: now.toISOString()
      };
    }
    const pageBucket = data.analytics.pages[rawPath];
    pageBucket.views = (pageBucket.views || 0) + 1;
    if (rawTitle) pageBucket.title = rawTitle;
    pageBucket.lastVisitedAt = now.toISOString();
    if (!Array.isArray(pageBucket.visitors)) pageBucket.visitors = [];
    if (!pageBucket.visitors.includes(visitorHash) && pageBucket.visitors.length < 5000) {
      pageBucket.visitors.push(visitorHash);
    }

    let sourceLabel = 'زيارة مباشرة (Direct)';
    if (rawReferrer) {
      try {
        const refHost = new URL(rawReferrer).hostname.replace(/^www\./, '').toLowerCase();
        const ownHost = (req.get('host') || '').split(':')[0].replace(/^www\./, '').toLowerCase();
        if (refHost && refHost !== ownHost) {
          if (refHost.includes('google.')) sourceLabel = 'بحث Google';
          else if (refHost.includes('facebook.') || refHost.includes('fb.com') || refHost.includes('l.instagram.'))
            sourceLabel = 'Facebook / Meta';
          else if (refHost.includes('whatsapp.') || refHost.includes('wa.me')) sourceLabel = 'WhatsApp';
          else if (refHost.includes('t.me') || refHost.includes('telegram.')) sourceLabel = 'Telegram';
          else if (refHost.includes('bing.')) sourceLabel = 'Bing';
          else sourceLabel = refHost;
        }
      } catch {
        // invalid referrer url -> keep Direct
      }
    }
    data.analytics.sources[sourceLabel] = (data.analytics.sources[sourceLabel] || 0) + 1;
    data.analytics.updatedAt = now.toISOString();

    db.save();
    return res.json({ success: true });
  } catch {
    return res.json({ success: false });
  }
});

// Single CMS Page public route
app.get('/api/public/pages/:slug', (req: Request, res: Response) => {
  const data = db.get();
  const page = (data.pages || []).find(p => (p.slug === req.params.slug || p.id === req.params.slug) && p.isPublished);
  if (!page) {
    return res.status(404).json({ error: 'الصفحة غير موجودة' });
  }
  res.json(page);
});

// 2. Get single secretariat details + members + related news/events/media
app.get('/api/public/secretariat/:slug', (req: Request, res: Response) => {
  const data = db.get();
  const sec = data.specializedSecretariats.find(s => s.slug === req.params.slug || s.id === req.params.slug);
  if (!sec) {
    return res.status(404).json({ error: 'الأمانة غير موجودة' });
  }
  const members = data.secretariatMembers.filter(m => m.secretariatId === sec.id);
  const relatedNews = data.news.filter(n => !n.isDraft && n.linkedSecretariatId === sec.id);
  const relatedEvents = data.events.filter(e => e.isVisible && e.organizer.includes(sec.name));
  const relatedMedia = data.media.filter(m => m.isVisible && m.linkedSecretariatId === sec.id);

  res.json({
    secretariat: sec,
    members,
    relatedNews,
    relatedEvents,
    relatedMedia
  });
});

// 3. Get single initiative details
app.get('/api/public/initiative/:slug', (req: Request, res: Response) => {
  const data = db.get();
  const init = data.initiatives.find(i => i.slug === req.params.slug || i.id === req.params.slug);
  if (!init) {
    return res.status(404).json({ error: 'المبادرة غير موجودة' });
  }
  const relatedNews = data.news.filter(n => !n.isDraft && n.linkedInitiativeId === init.id);
  const relatedMedia = data.media.filter(m => m.isVisible && m.linkedInitiativeId === init.id);

  res.json({
    initiative: init,
    relatedNews,
    relatedMedia
  });
});

// 4. Submit Membership Application
app.post('/api/public/apply', (req: Request, res: Response) => {
  const body = req.body || {};
  const data = db.get();
  const reqs = data.settings.membershipFieldRequirements || {};
  const isReq = (k: string) => reqs[k] !== false; // Default to true (mandatory) unless explicitly disabled

  const fieldLabels: Record<string, string> = {
    fullName: 'الاسم الرباعي كاملاً',
    nationalId: 'الرقم القومي',
    dateOfBirth: 'تاريخ الميلاد',
    gender: 'النوع',
    maritalStatus: 'الحالة الاجتماعية',
    address: 'العنوان التفصيلي',
    phone: 'رقم الهاتف المحمول',
    whatsapp: 'رقم الواتساب',
    email: 'البريد الإلكتروني',
    qualification: 'المؤهل الدراسي',
    job: 'الوظيفة الحالية',
    workplace: 'جهة العمل',
    skills: 'المهارات والخبرات العملية',
    interests: 'الاهتمامات الحزبية',
    volunteerExperience: 'الخبرات التطوعية السابقة',
    reasonForJoining: 'سبب الرغبة في الانضمام',
    personalPhotoUrl: 'الصورة الشخصية',
    nationalIdFrontUrl: 'صورة وجه بطاقة الرقم القومي',
    nationalIdBackUrl: 'صورة ظهر بطاقة الرقم القومي'
  };

  for (const [key, label] of Object.entries(fieldLabels)) {
    if (isReq(key)) {
      const val = body[key];
      if (!val || (typeof val === 'string' && !val.trim())) {
        return res.status(400).json({ error: `يرجى استيفاء الحقل الإجباري: ${label}` });
      }
    }
  }

  // Validate National ID
  const cleanNID = String(body.nationalId || '').trim();
  if (cleanNID || isReq('nationalId')) {
    if (!/^\d{14}$/.test(cleanNID)) {
      return res.status(400).json({ error: 'الرقم القومي غير صالح، يجب أن يتكون من 14 رقماً بالضبط' });
    }
  }

  if (!body.phone || !String(body.phone).trim()) {
    if (isReq('phone')) {
      return res.status(400).json({ error: 'يرجى إدخال رقم الهاتف للتواصل' });
    }
  }

  // Check duplicate national ID in existing applications or members
  if (cleanNID) {
    const existingApp = data.applications.find(a => a.nationalId === cleanNID && a.status !== 'مرفوض');
    if (existingApp) {
      return res.status(409).json({
        error: `يوجد طلب انضمام مسجل مسبقاً لهذا الرقم القومي برقم متابعة (${existingApp.applicationNumber}) وحالته الحالية: ${existingApp.status}`
      });
    }

    const existingMember = data.members.find(m => m.nationalId === cleanNID);
    if (existingMember) {
      return res.status(409).json({
        error: 'هذا الرقم القومي مسجل بالفعل في سجل أعضاء الحزب'
      });
    }
  }

  const year = new Date().getFullYear();
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const applicationNumber = `NFP-${year}-${randNum}`;

  const newApp: MembershipApplication = {
    id: 'app-' + Date.now(),
    applicationNumber,
    fullName: body.fullName.trim(),
    nationalId: cleanNID,
    dateOfBirth: body.dateOfBirth || '',
    gender: body.gender || 'ذكر',
    maritalStatus: body.maritalStatus || 'أعزب',
    governorate: body.governorate || 'محافظة الجيزة',
    district: body.district || 'قسم ثالث أكتوبر',
    address: body.address || '',
    phone: body.phone.trim(),
    whatsapp: body.whatsapp || body.phone.trim(),
    email: body.email || '',
    qualification: body.qualification || '',
    job: body.job || '',
    workplace: body.workplace || '',
    skills: body.skills || '',
    interests: body.interests || '',
    volunteerExperience: body.volunteerExperience || '',
    reasonForJoining: body.reasonForJoining || '',
    personalPhotoUrl: body.personalPhotoUrl || '',
    nationalIdFrontUrl: body.nationalIdFrontUrl || '',
    nationalIdBackUrl: body.nationalIdBackUrl || '',
    consentAgreed: !!body.consentAgreed,
    status: 'جديد',
    internalNotes: '',
    createdAt: new Date().toISOString()
  };

  data.applications.unshift(newApp);
  db.save();

  db.addAuditLog(
    'system',
    'طلب انضمام إلكتروني',
    'استقبال طلب انضمام جديد',
    'Application',
    `تم تقديم طلب انضمام جديد برقم متابعة ${applicationNumber} للمواطن: ${newApp.fullName}`,
    newApp.id
  );

  res.json({
    success: true,
    message: 'تم استلام طلب انضمامكم بنجاح وسيقوم فريق أمانة قسم ثالث أكتوبر بمراجعته والتواصل معكم قريباً.',
    applicationNumber
  });
});

// 4.5. Public Application Inquiry by Number or National ID
app.post(['/api/public/inquire', '/api/applications/inquire'], (req: Request, res: Response) => {
  const query = String(req.body.query || req.body.applicationNumber || '').trim();
  if (!query) {
    return res.status(400).json({ found: false, error: 'يرجى إدخال رقم الطلب أو الرقم القومي للاستعلام' });
  }

  const data = db.get();
  const cleanQ = query.toUpperCase();
  const app = data.applications.find(a =>
    a.applicationNumber.toUpperCase() === cleanQ ||
    a.nationalId === query ||
    (a.phone && a.phone === query)
  );

  if (!app) {
    return res.status(404).json({
      found: false,
      message: 'لم يتم العثور على أي طلب مسجل برقم المتابعة أو الرقم القومي المدخل. يرجى التأكد من كتابة الرقم بدقة.'
    });
  }

  let officialMessage = '';
  switch (app.status) {
    case 'جديد':
      officialMessage = 'تم استلام طلبكم بنجاح ومسجل بقاعدة بيانات أمانة قسم ثالث أكتوبر. الطلب قيد الفحص الإداري الأولي وسيتم التواصل معكم عبر الهاتف أو واتساب.';
      break;
    case 'قيد المراجعة':
      officialMessage = 'طلبكم قيد المراجعة والتدقيق التنظيمي لدى هيئة مكتب الأمانة لتسكينكم في الأمانة التخصصية الأنسب لمهاراتكم.';
      break;
    case 'مقبول':
      officialMessage = 'تهانينا! تم قبول طلب انضمامكم واعتماد عضويتكم بحزب الجبهة الوطنية. يرجى مراجعة مقر الأمانة أو التواصل معنا لاستلام بطاقة العضوية والبدء بالعمل الحزبي.';
      break;
    case 'مطلوب استكمال':
      officialMessage = 'يرجى مراجعة مقر الأمانة أو التواصل معنا هاتفياً أو عبر واتساب لاستكمال بعض البيانات أو المرفقات المطلوبة لطلبكم.';
      break;
    case 'مرفوض':
      officialMessage = 'نعتذر عن عدم قبول الطلب في الوقت الحالي مع خالص التقدير والشكر لرغبتكم بالانضمام لحزب الجبهة الوطنية.';
      break;
  }

  // Mask name for privacy (show first two words only)
  const nameParts = app.fullName.split(' ');
  const maskedName = nameParts.slice(0, 2).join(' ') + (nameParts.length > 2 ? ' ...' : '');

  res.json({
    found: true,
    applicationNumber: app.applicationNumber,
    fullName: maskedName,
    governorate: app.governorate,
    district: app.district,
    status: app.status,
    createdAt: app.createdAt,
    reviewedAt: app.reviewedAt,
    officialMessage
  });
});

// 4.6. Public Newsletter Email Subscription & One-Click Unsubscribe
app.post('/api/public/subscribe', (req: Request, res: Response) => {
  const rawEmail = String(req.body?.email || '').trim().toLowerCase();
  const rawName = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  const topicsInput = req.body?.topics || {};

  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawEmail)) {
    return res.status(400).json({ error: 'يرجى إدخال عنوان بريد إلكتروني صحيح' });
  }

  const data = db.get();
  if (!data.subscribers) data.subscribers = [];

  const topics = {
    news: topicsInput.news !== false,
    events: topicsInput.events !== false,
    initiatives: topicsInput.initiatives !== false
  };

  if (!topics.news && !topics.events && !topics.initiatives) {
    topics.news = true;
    topics.events = true;
    topics.initiatives = true;
  }

  const existingIdx = data.subscribers.findIndex(s => s.email.toLowerCase() === rawEmail);
  const now = new Date().toISOString();

  if (existingIdx !== -1) {
    const existing = data.subscribers[existingIdx];
    const wasActive = existing.status === 'active';
    data.subscribers[existingIdx] = {
      ...existing,
      name: rawName || existing.name || '',
      status: 'active',
      topics,
      unsubscribeToken: existing.unsubscribeToken || crypto.randomBytes(18).toString('hex'),
      updatedAt: now
    };
    db.save();
    return res.json({
      success: true,
      alreadySubscribed: wasActive,
      message: wasActive
        ? 'بريدك الإلكتروني مشترك بالفعل، وتم تحديث تفضيلات التنبيهات بنجاح.'
        : 'تم إعادة تفعيل اشتراكك بالبريد الإلكتروني بنجاح لتصلك الأخبار والفعاليات فور نشرها.'
    });
  }

  const newSub: EmailSubscriber = {
    id: 'sub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    email: rawEmail,
    name: rawName || '',
    status: 'active',
    topics,
    unsubscribeToken: crypto.randomBytes(18).toString('hex'),
    subscribedAt: now,
    updatedAt: now
  };

  data.subscribers.unshift(newSub);
  db.save();
  db.addAuditLog('public', rawName || rawEmail, 'اشتراك في التنبيهات البريدية', 'Subscriber', `اشتراك جديد بالبريد: ${rawEmail}`, newSub.id);

  return res.json({
    success: true,
    alreadySubscribed: false,
    message: 'تم تسجيل بريدك الإلكتروني بنجاح! ستصلك رسائل فورية عند نشر أي خبر أو فعالية أو مبادرة جديدة.'
  });
});

app.get('/api/public/unsubscribe', (req: Request, res: Response) => {
  const token = String(req.query.token || '').trim();
  const data = db.get();
  if (!data.subscribers) data.subscribers = [];
  const sub = token ? data.subscribers.find(s => s.unsubscribeToken === token) : undefined;

  if (sub) {
    sub.status = 'unsubscribed';
    sub.updatedAt = new Date().toISOString();
    db.save();
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>إلغاء الاشتراك البريدي | حزب الجبهة الوطنية</title>
</head>
<body style="font-family:Cairo,Arial,sans-serif;background:#fafaf9;color:#1c1917;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px;">
  <div style="max-width:460px;background:#ffffff;border:1px solid #e7e5e4;border-radius:20px;padding:32px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.06);">
    <h1 style="font-size:20px;margin:0 0 12px 0;color:#b91c1c;">${sub ? 'تم إلغاء الاشتراك بنجاح' : 'رابط إلغاء الاشتراك'}</h1>
    <p style="font-size:14px;color:#57534e;line-height:1.8;margin:0 0 20px 0;">
      ${sub ? `تم إيقاف إرسال التنبيهات البريدية إلى (${escapeHtml(sub.email)}). يمكنك إعادة الاشتراك في أي وقت من أسفل الموقع.` : 'لم يتم العثور على اشتراك نشط مطابق لهذا الرابط أو تم إلغاؤه مسبقاً.'}
    </p>
    <a href="/" style="display:inline-block;background:#1c1917;color:#fbbf24;text-decoration:none;font-weight:700;font-size:13px;padding:10px 22px;border-radius:10px;">
      العودة للموقع الرسمي
    </a>
  </div>
</body>
</html>`);
});

// 5. Dynamic /sitemap.xml & /robots.txt handled above

// -------------------------------------------------------------
// ADMIN AUTHENTICATION APIS
// -------------------------------------------------------------

app.post('/api/admin/login', (req: Request, res: Response) => {
  const { identifier, email, phone, password } = req.body || {};
  const stripInvisible = (v: string) => v.replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00A0]/g, '');
  const rawLogin = stripInvisible(String(identifier ?? email ?? phone ?? '')).trim();
  const rawPassword = stripInvisible(password !== undefined && password !== null ? String(password) : '');

  if (!rawLogin || !rawPassword) {
    return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني أو رقم الهاتف وكلمة المرور' });
  }

  const cleanEmail = rawLogin.replace(/\s+/g, '').toLowerCase();
  const normalizedPhone = normalizeAdminPhone(rawLogin);
  const data = db.get();

  const admin = data.admins.find(a => {
    if (!a.isActive) return false;
    if (a.email && a.email.trim().toLowerCase() === cleanEmail) return true;
    if (a.phone && normalizedPhone && normalizeAdminPhone(a.phone) === normalizedPhone) return true;
    return false;
  });

  if (!admin) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة أو الحساب غير نشط' });
  }

  const passCandidates = Array.from(
    new Set([
      rawPassword,
      rawPassword.trim(),
      normalizeArabicDigitsServer(rawPassword),
      normalizeArabicDigitsServer(rawPassword).trim()
    ].filter(Boolean))
  );
  const passwordOk = passCandidates.some(candidate => hashPassword(candidate) === admin.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  }

  // Update last login
  admin.lastLogin = new Date().toISOString();
  db.save();
  db.addAuditLog(admin.email || admin.phone || admin.id, admin.name, 'تسجيل دخول إداري', 'Auth', 'تم تسجيل الدخول بنجاح إلى لوحة التحكم');

  // Create persistent signed session
  const token = generateToken(admin);
  sessionStore.set(token, {
    admin,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  });

  const { passwordHash, ...safeAdmin } = admin;
  res.json({
    success: true,
    token,
    user: safeAdmin
  });
});

// Google Sign-In Admin login (verifies Firebase ID token using projectId only — no IAM required)
app.post('/api/admin/google-login', async (req: Request, res: Response) => {
  const idToken = String(req.body?.idToken || '').trim();
  if (!idToken) {
    return res.status(400).json({ error: 'رمز التحقق من Google غير موجود' });
  }
  const tokenVerifier = getFirebaseTokenVerifier();
  if (!tokenVerifier) {
    return res.status(503).json({ error: 'إعدادات المصادقة غير متوفرة' });
  }
  try {
    const decoded = await tokenVerifier.verifyIdToken(idToken);
    const verifiedEmail = String(decoded.email || '').trim().toLowerCase();
    if (!verifiedEmail || decoded.email_verified !== true) {
      return res.status(401).json({ error: 'يجب أن يكون البريد الإلكتروني في حساب Google موثقاً ومفعلاً' });
    }

    const data = db.get();
    const admin = data.admins.find(a => a.isActive && a.email && a.email.trim().toLowerCase() === verifiedEmail);
    if (!admin) {
      return res.status(403).json({ error: `الحساب (${verifiedEmail}) غير مسجل ضمن المشرفين المعتمدين في المنصة` });
    }

    admin.lastLogin = new Date().toISOString();
    db.save();
    db.addAuditLog(admin.email, admin.name, 'تسجيل دخول إداري عبر Google', 'Auth', 'تم تسجيل الدخول والتحقق من الهوية عبر Google');

    const token = generateToken(admin);
    sessionStore.set(token, {
      admin,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
    });

    const { passwordHash, ...safeAdmin } = admin;
    return res.json({
      success: true,
      token,
      user: safeAdmin
    });
  } catch {
    return res.status(401).json({ error: 'تعذر التحقق من جلسة Google، يرجى إعادة المحاولة' });
  }
});

app.get('/api/admin/me', authenticateAdmin, (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const { passwordHash, ...safeAdmin } = admin;
  res.json({ user: safeAdmin });
});

app.post('/api/admin/logout', authenticateAdmin, (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const tok = authHeader.substring(7);
    sessionStore.delete(tok);
    revokedTokens.add(tok);
  }
  res.json({ success: true });
});

// -------------------------------------------------------------
// ADMIN PROTECTED DASHBOARD APIS
// -------------------------------------------------------------

// Dashboard summary stats
app.get('/api/admin/stats', authenticateAdmin, (_req: Request, res: Response) => {
  const data = db.get();
  const stats = {
    partyLeadersCount: data.partyLeaders.length,
    secretariatLeadersCount: data.secretariatLeaders.length,
    secretariatsCount: data.specializedSecretariats.length,
    membersCount: data.members.length,
    initiativesCount: data.initiatives.length,
    activeInitiativesCount: data.initiatives.filter(i => i.status === 'active').length,
    applicationsCount: data.applications.length,
    newApplicationsCount: data.applications.filter(a => a.status === 'جديد').length,
    reviewingApplicationsCount: data.applications.filter(a => a.status === 'قيد المراجعة').length,
    acceptedApplicationsCount: data.applications.filter(a => a.status === 'مقبول').length,
    rejectedApplicationsCount: data.applications.filter(a => a.status === 'مرفوض').length,
    newsCount: data.news.length,
    eventsCount: data.events.length,
    mediaCount: data.media.length,
    pagesCount: (data.pages || []).length,
    rolesCount: (data.roles || []).length,
    subscribersCount: (data.subscribers || []).filter(s => s.status === 'active').length
  };
  res.json(stats);
});

// Admin Google Analytics & Traffic Insights endpoint (returns authentic recorded traffic)
app.get('/api/admin/analytics', authenticateAdmin, (req: Request, res: Response) => {
  const data = db.get();
  const rangeParam = String(req.query.range || '14d').toLowerCase();
  const rangeDays = rangeParam === '7d' ? 7 : rangeParam === '30d' ? 30 : 14;
  const analytics = data.analytics || { daily: {}, pages: {}, sources: {}, updatedAt: '' };

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const daily: Array<{
    date: string;
    label: string;
    visitors: number;
    pageViews: number;
    mobile: number;
    desktop: number;
  }> = [];

  let totalVisits = 0;
  let mobileVisits = 0;
  const uniqueRangeSet = new Set<string>();

  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const bucket = analytics.daily[key];
    const visitorsArr = Array.isArray(bucket?.visitors) ? bucket.visitors : [];
    for (const v of visitorsArr) uniqueRangeSet.add(v);
    const pageViews = Number(bucket?.pageViews || 0);
    const mobile = Number(bucket?.mobile || 0);
    const desktop = Number(bucket?.desktop || 0);
    totalVisits += pageViews;
    mobileVisits += mobile;

    daily.push({
      date: key,
      label: d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
      visitors: visitorsArr.length,
      pageViews,
      mobile,
      desktop
    });
  }

  const todayBucket = analytics.daily[todayKey];
  const todayVisits = Number(todayBucket?.pageViews || 0);
  const todayUniqueVisitors = Array.isArray(todayBucket?.visitors) ? todayBucket.visitors.length : 0;

  const pageEntries = Object.values(analytics.pages || {});
  const totalPageViewsAllTime = pageEntries.reduce((sum, p) => sum + Number(p.views || 0), 0);
  const pages = pageEntries
    .map(p => ({
      path: p.path,
      title: p.title || p.path,
      views: Number(p.views || 0),
      uniqueVisitors: Array.isArray(p.visitors) ? p.visitors.length : 0,
      sharePct: totalPageViewsAllTime > 0 ? Math.round((Number(p.views || 0) / totalPageViewsAllTime) * 100) : 0,
      lastVisitedAt: p.lastVisitedAt || ''
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 15);

  const sourceEntries = Object.entries(analytics.sources || {});
  const totalSourceVisits = sourceEntries.reduce((sum, [, cnt]) => sum + Number(cnt || 0), 0);
  const sources = sourceEntries
    .map(([source, visits]) => ({
      source,
      visits: Number(visits || 0),
      sharePct: totalSourceVisits > 0 ? Math.round((Number(visits || 0) / totalSourceVisits) * 100) : 0
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10);

  const topPage = pages[0];
  res.json({
    measurementId: (data.settings?.googleAnalyticsId || '').trim() || DEFAULT_GA4_ID,
    gtmId: (data.settings?.googleTagManagerId || '').trim() || DEFAULT_GTM_ID,
    rangeDays,
    summary: {
      totalVisits,
      uniqueVisitors: uniqueRangeSet.size,
      todayVisits,
      todayUniqueVisitors,
      mobileSharePct: totalVisits > 0 ? Math.round((mobileVisits / totalVisits) * 100) : 0,
      topPageTitle: topPage?.title || '—',
      topPagePath: topPage?.path || '/'
    },
    daily,
    pages,
    sources,
    updatedAt: analytics.updatedAt || new Date().toISOString()
  });
});

// Full DB for admin
app.get('/api/admin/full-db', authenticateAdmin, async (_req: Request, res: Response) => {
  await hydrateDbFromPublicFirestoreRest(false).catch(() => undefined);
  const data = db.get();
  const safeAdmins = data.admins.map(({ passwordHash, ...rest }) => rest);
  const sortedSecretariats = [...(data.specializedSecretariats || [])].sort((a, b) => a.sortOrder - b.sortOrder);
  res.json({
    ...data,
    specializedSecretariats: sortedSecretariats,
    admins: safeAdmins,
    subscribers: data.subscribers || [],
    emailDispatchLogs: data.emailDispatchLogs || [],
    smtpStatus: getSmtpStatus()
  });
});

// --- PARTY LEADERS MANAGEMENT ---
app.post('/api/admin/party-leaders', authenticateAdmin, requirePermission('leaders_party'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body;

  if (!body.name || !body.position) {
    return res.status(400).json({ error: 'الاسم والمنصب القيادي حقول إلزامية' });
  }

  const newLeader = {
    id: 'lead-' + Date.now(),
    name: body.name.trim(),
    position: body.position.trim(),
    level: body.level || 'national',
    governorate: body.governorate || '',
    specializedSecretariatId: typeof body.specializedSecretariatId === 'string' ? body.specializedSecretariatId.trim() : '',
    bio: body.bio || '',
    photoUrl: body.photoUrl ? persistDataUrlIfAny(body.photoUrl, 'party_leader') : '',
    sortOrder: Number(body.sortOrder) || (data.partyLeaders.length + 1),
    isVisible: body.isVisible !== false,
    createdAt: new Date().toISOString()
  };

  data.partyLeaders.push(newLeader);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة قيادة حزبية', 'PartyLeader', `تمت إضافة القيادة: ${newLeader.name} بمنصب: ${newLeader.position}`, newLeader.id);
  res.json({ success: true, leader: newLeader });
});

app.put('/api/admin/party-leaders/:id', authenticateAdmin, requirePermission('leaders_party'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.partyLeaders.findIndex(l => l.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'القيادة غير موجودة' });
  }

  const nextBody = { ...req.body };
  if (typeof nextBody.name === 'string') nextBody.name = nextBody.name.trim();
  if (typeof nextBody.position === 'string') nextBody.position = nextBody.position.trim();
  if (nextBody.photoUrl) nextBody.photoUrl = persistDataUrlIfAny(nextBody.photoUrl, 'party_leader');

  data.partyLeaders[idx] = {
    ...data.partyLeaders[idx],
    ...nextBody,
    id: req.params.id,
    updatedAt: new Date().toISOString()
  } as any;
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل قيادة حزبية', 'PartyLeader', `تم تحديث بيانات القيادة: ${data.partyLeaders[idx].name}`, req.params.id);
  res.json({ success: true, leader: data.partyLeaders[idx] });
});

app.delete('/api/admin/party-leaders/:id', authenticateAdmin, requirePermission('leaders_party'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const leader = data.partyLeaders.find(l => l.id === req.params.id);
  data.partyLeaders = data.partyLeaders.filter(l => l.id !== req.params.id);
  recordLocalTombstone(data, 'party_leaders', req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف قيادة حزبية', 'PartyLeader', `تم حذف القيادة: ${leader?.name || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// --- SECRETARIAT LEADERS MANAGEMENT (3rd October Giza only) ---
app.post('/api/admin/secretariat-leaders', authenticateAdmin, requirePermission('leaders_secretariat'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body;

  if (!body.name || !body.title) {
    return res.status(400).json({ error: 'الاسم والمسمى الوظيفي حقول إلزامية' });
  }

  const newLeader = {
    id: 'sec-lead-' + Date.now(),
    name: body.name.trim(),
    title: body.title.trim(),
    specializedSecretariatId: body.specializedSecretariatId || '',
    bio: body.bio || '',
    photoUrl: body.photoUrl ? persistDataUrlIfAny(body.photoUrl, 'sec_leader') : '',
    appointmentDate: body.appointmentDate || '',
    sortOrder: Number(body.sortOrder) || (data.secretariatLeaders.length + 1),
    isVisible: body.isVisible !== false,
    createdAt: new Date().toISOString()
  };

  data.secretariatLeaders.push(newLeader);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة قيادة بأمانة قسم ثالث أكتوبر', 'SecretariatLeader', `تمت إضافة القيادة: ${newLeader.name} بمسمى: ${newLeader.title}`, newLeader.id);
  res.json({ success: true, leader: newLeader });
});

app.put('/api/admin/secretariat-leaders/:id', authenticateAdmin, requirePermission('leaders_secretariat'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.secretariatLeaders.findIndex(l => l.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'القيادة غير موجودة' });
  }

  const nextBody = { ...req.body };
  if (typeof nextBody.name === 'string') nextBody.name = nextBody.name.trim();
  if (typeof nextBody.title === 'string') nextBody.title = nextBody.title.trim();
  if (nextBody.photoUrl) nextBody.photoUrl = persistDataUrlIfAny(nextBody.photoUrl, 'sec_leader');

  data.secretariatLeaders[idx] = {
    ...data.secretariatLeaders[idx],
    ...nextBody,
    id: req.params.id,
    updatedAt: new Date().toISOString()
  } as any;
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل قيادة بأمانة قسم ثالث أكتوبر', 'SecretariatLeader', `تم تحديث بيانات: ${data.secretariatLeaders[idx].name}`, req.params.id);
  res.json({ success: true, leader: data.secretariatLeaders[idx] });
});

app.delete('/api/admin/secretariat-leaders/:id', authenticateAdmin, requirePermission('leaders_secretariat'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const leader = data.secretariatLeaders.find(l => l.id === req.params.id);
  data.secretariatLeaders = data.secretariatLeaders.filter(l => l.id !== req.params.id);
  recordLocalTombstone(data, 'secretariat_leaders', req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف قيادة بأمانة قسم ثالث أكتوبر', 'SecretariatLeader', `تم حذف: ${leader?.name || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// Helper to normalize secretariat media & assistantSecretaries array
function normalizeSecretariatPayload(body: any, existing?: any) {
  const merged = existing ? { ...existing, ...body } : { ...body };

  if (merged.secretaryPhotoUrl) {
    merged.secretaryPhotoUrl = persistDataUrlIfAny(merged.secretaryPhotoUrl, 'sec_leader');
  }
  if (merged.logoUrl) {
    merged.logoUrl = persistDataUrlIfAny(merged.logoUrl, 'sec_logo');
  }
  if (merged.coverUrl) {
    merged.coverUrl = persistDataUrlIfAny(merged.coverUrl, 'sec_cover');
  }
  if (Array.isArray(merged.galleryImages)) {
    merged.galleryImages = merged.galleryImages.map((img: string) => persistDataUrlIfAny(img, 'sec_gallery'));
  }

  let assistantList: Array<{
    id: string;
    name: string;
    title?: string;
    photoUrl?: string;
    bio?: string;
    phone?: string;
  }> = [];

  if (Array.isArray(body.assistantSecretaries)) {
    assistantList = body.assistantSecretaries
      .filter((a: any) => a && (a.name || a.phone || a.photoUrl || a.bio || a.title))
      .map((a: any, idx: number) => ({
        id: a.id || `asst-${Date.now()}-${idx}`,
        name: String(a.name || '').trim(),
        title: String(a.title || '').trim() || 'الأمين المساعد للأمانة',
        photoUrl: a.photoUrl ? persistDataUrlIfAny(a.photoUrl, 'asst_sec') : '',
        bio: String(a.bio || '').trim(),
        phone: String(a.phone || '').trim()
      }));

    merged.assistantSecretaries = assistantList;
    const primary = assistantList[0];
    merged.assistantSecretaryName = primary?.name || '';
    merged.assistantSecretaryPhotoUrl = primary?.photoUrl || '';
    merged.assistantSecretaryBio = primary?.bio || '';
    merged.assistantSecretaryPhone = primary?.phone || '';
  } else {
    if (merged.assistantSecretaryPhotoUrl) {
      merged.assistantSecretaryPhotoUrl = persistDataUrlIfAny(merged.assistantSecretaryPhotoUrl, 'asst_sec');
    }
    if (Array.isArray(merged.assistantSecretaries) && merged.assistantSecretaries.length > 0) {
      merged.assistantSecretaries = merged.assistantSecretaries.map((a: any, idx: number) => ({
        id: a.id || `asst-${Date.now()}-${idx}`,
        name: String(a.name || '').trim(),
        title: String(a.title || '').trim() || 'الأمين المساعد للأمانة',
        photoUrl: a.photoUrl ? persistDataUrlIfAny(a.photoUrl, 'asst_sec') : '',
        bio: String(a.bio || '').trim(),
        phone: String(a.phone || '').trim()
      }));
    } else if (merged.assistantSecretaryName) {
      merged.assistantSecretaries = [{
        id: 'asst-1',
        name: String(merged.assistantSecretaryName || '').trim(),
        title: 'الأمين المساعد للأمانة',
        photoUrl: merged.assistantSecretaryPhotoUrl || '',
        bio: String(merged.assistantSecretaryBio || '').trim(),
        phone: String(merged.assistantSecretaryPhone || '').trim()
      }];
    }
  }

  merged.updatedAt = new Date().toISOString();
  return merged;
}

function normalizeSecName(name: string): string {
  return String(name || '')
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

function isBannedSecName(name: string): boolean {
  const n = normalizeSecName(name);
  return n === 'امانه القسم' || n === 'قسم ثالث اكتوبر';
}

// --- SPECIALIZED SECRETARIATS MANAGEMENT ---
app.post('/api/admin/secretariats', authenticateAdmin, requirePermission('secretariats'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body;

  if (!body.name || !String(body.name).trim()) {
    return res.status(400).json({ error: 'اسم الأمانة التخصصية إلزامي' });
  }

  const trimmedName = String(body.name).trim();
  if (isBannedSecName(trimmedName)) {
    return res.status(400).json({ error: 'لا يمكن إضافة «أمانة القسم» إلى قائمة الأمانات التخصصية' });
  }
  if (data.specializedSecretariats.some(s => normalizeSecName(s.name) === normalizeSecName(trimmedName))) {
    return res.status(400).json({ error: `الأمانة «${trimmedName}» موجودة بالفعل ولا يمكن تكرارها` });
  }

  const slug = body.slug || trimmedName.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-') || ('sec-' + Date.now());
  const normalized = normalizeSecretariatPayload({
    ...body,
    id: 'sec-' + Date.now(),
    name: trimmedName,
    slug,
    logoUrl: body.logoUrl || '',
    coverUrl: body.coverUrl || '',
    description: body.description || '',
    duties: Array.isArray(body.duties) ? body.duties : (body.duties ? String(body.duties).split('\n').filter(Boolean) : []),
    goals: Array.isArray(body.goals) ? body.goals : (body.goals ? String(body.goals).split('\n').filter(Boolean) : []),
    secretaryName: body.secretaryName || '',
    secretaryPhotoUrl: body.secretaryPhotoUrl || '',
    secretaryBio: body.secretaryBio || '',
    secretaryPhone: body.secretaryPhone || '',
    assistantSecretaryName: body.assistantSecretaryName || '',
    assistantSecretaryPhotoUrl: body.assistantSecretaryPhotoUrl || '',
    assistantSecretaryBio: body.assistantSecretaryBio || '',
    assistantSecretaryPhone: body.assistantSecretaryPhone || '',
    isActive: body.isActive !== false,
    sortOrder: Number(body.sortOrder) || (data.specializedSecretariats.length + 1),
    createdAt: new Date().toISOString()
  });

  data.specializedSecretariats.push(normalized);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة أمانة تخصصية جديدة', 'SpecializedSecretariat', `تم إنشاء: ${normalized.name}`, normalized.id);
  res.json({ success: true, secretariat: normalized });
});

app.put('/api/admin/secretariats/:id', authenticateAdmin, requirePermission('secretariats'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.specializedSecretariats.findIndex(s => s.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'الأمانة التخصصية غير موجودة' });
  }

  if (req.body.name) {
    const trimmedName = String(req.body.name).trim();
    if (isBannedSecName(trimmedName)) {
      return res.status(400).json({ error: 'لا يمكن تسمية الأمانة بـ «أمانة القسم»' });
    }
    if (data.specializedSecretariats.some(s => s.id !== req.params.id && normalizeSecName(s.name) === normalizeSecName(trimmedName))) {
      return res.status(400).json({ error: `الأمانة «${trimmedName}» موجودة بالفعل ولا يمكن تكرارها` });
    }
  }

  data.specializedSecretariats[idx] = {
    ...normalizeSecretariatPayload(req.body, data.specializedSecretariats[idx]),
    id: req.params.id,
    updatedAt: new Date().toISOString()
  } as any;
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل أمانة تخصصية', 'SpecializedSecretariat', `تم تعديل بيانات أمانة: ${data.specializedSecretariats[idx].name}`, req.params.id);
  res.json({ success: true, secretariat: data.specializedSecretariats[idx] });
});

app.delete('/api/admin/secretariats/:id', authenticateAdmin, requirePermission('secretariats'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const sec = data.specializedSecretariats.find(s => s.id === req.params.id);
  if (!sec) {
    return res.status(404).json({ error: 'الأمانة غير موجودة' });
  }

  // Preserve members: keep secretariatMembers intact or set their secretariatId to unassigned, without deleting person records
  data.specializedSecretariats = data.specializedSecretariats.filter(s => s.id !== req.params.id);
  recordLocalTombstone(data, 'secretariats', req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف أمانة تخصصية', 'SpecializedSecretariat', `تم حذف أمانة: ${sec.name} مع الحفاظ على سجلات الأعضاء`, req.params.id);
  res.json({ success: true });
});

// Save all secretariats (ordering, bulk changes, confirm)
app.post('/api/admin/secretariats/save-all', authenticateAdmin, requirePermission('secretariats'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const list = req.body.secretariats;

  if (Array.isArray(list) && list.length > 0) {
    const seen = new Set<string>();
    const filtered: any[] = [];
    for (const item of list) {
      if (!item?.name || isBannedSecName(item.name)) continue;
      const key = normalizeSecName(item.name);
      if (seen.has(key)) continue;
      seen.add(key);
      const existingSec = data.specializedSecretariats.find(
        s => (item.id && s.id === item.id) || normalizeSecName(s.name) === key
      );
      filtered.push(normalizeSecretariatPayload(item, existingSec));
    }
    data.specializedSecretariats = filtered;
  }
  db.save();
  db.addAuditLog(
    admin.email,
    admin.name,
    'حفظ الأمانات بالكامل',
    'SpecializedSecretariat',
    `تم حفظ وتأكيد بيانات الأمانات التخصصية بنجاح (${data.specializedSecretariats.length} أمانة)`
  );
  res.json({
    success: true,
    count: data.specializedSecretariats.length,
    message: 'تم حفظ كافة بيانات الأمانات التخصصية وتأكيدها بنجاح'
  });
});


// --- SECRETARIAT MEMBERS MANAGEMENT & TRANSFER ---
app.post('/api/admin/secretariat-members', authenticateAdmin, requirePermission('secretariats'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body;

  if (!body.name || !body.secretariatId || !body.role) {
    return res.status(400).json({ error: 'الاسم والأمانة والمسمى حقول إلزامية' });
  }

  const newMember = {
    id: 'sm-' + Date.now(),
    memberId: body.memberId || '',
    secretariatId: body.secretariatId,
    tier: body.tier || 'member',
    bureauTitle: body.bureauTitle || '',
    name: body.name.trim(),
    role: body.role.trim(),
    photoUrl: body.photoUrl ? persistDataUrlIfAny(body.photoUrl, 'sec_member') : '',
    phone: body.phone || '',
    email: body.email || '',
    assignmentDate: body.assignmentDate || '',
    notes: body.notes || '',
    updatedAt: new Date().toISOString()
  };

  data.secretariatMembers.push(newMember);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة عضو لأمانة تخصصية', 'SecretariatMember', `تمت إضافة ${newMember.name} بمسمى ${newMember.role}`, newMember.id);
  res.json({ success: true, member: newMember });
});

app.put('/api/admin/secretariat-members/:id', authenticateAdmin, requirePermission('secretariats'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.secretariatMembers.findIndex(m => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'العضو غير موجود' });
  }

  const nextBody = { ...req.body };
  if (typeof nextBody.name === 'string') nextBody.name = nextBody.name.trim();
  if (typeof nextBody.role === 'string') nextBody.role = nextBody.role.trim();
  if (nextBody.photoUrl) nextBody.photoUrl = persistDataUrlIfAny(nextBody.photoUrl, 'sec_member');

  data.secretariatMembers[idx] = {
    ...data.secretariatMembers[idx],
    ...nextBody,
    id: req.params.id,
    updatedAt: new Date().toISOString()
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل تكليف عضو بأمانة', 'SecretariatMember', `تم تحديث تكليف: ${data.secretariatMembers[idx].name}`, req.params.id);
  res.json({ success: true, member: data.secretariatMembers[idx] });
});

app.post('/api/admin/secretariat-members/transfer', authenticateAdmin, requirePermission('secretariats'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const { memberId, targetSecretariatId, newRole, notes } = req.body;
  const data = db.get();
  const member = data.secretariatMembers.find(m => m.id === memberId);
  if (!member) {
    return res.status(404).json({ error: 'عضو الأمانة غير موجود' });
  }

  const oldSec = data.specializedSecretariats.find(s => s.id === member.secretariatId);
  const targetSec = data.specializedSecretariats.find(s => s.id === targetSecretariatId);
  if (!targetSec) {
    return res.status(400).json({ error: 'الأمانة المستهدفة غير موجودة' });
  }

  const oldSecName = oldSec?.name || 'غير محدد';
  member.secretariatId = targetSecretariatId;
  if (newRole) member.role = newRole;
  if (notes) member.notes = (member.notes ? member.notes + '\n' : '') + `نقل من ${oldSecName}: ${notes}`;
  (member as any).updatedAt = new Date().toISOString();

  // If connected to central member record, record in assignmentHistory
  if (member.memberId) {
    const centralMember = data.members.find(m => m.id === member.memberId);
    if (centralMember) {
      centralMember.secretariatId = targetSecretariatId;
      if (newRole) centralMember.title = newRole;
      centralMember.assignmentHistory.unshift({
        id: 'hist-' + Date.now(),
        title: newRole || centralMember.title,
        secretariatId: targetSecretariatId,
        secretariatName: targetSec.name,
        startDate: new Date().toISOString().split('T')[0],
        assignedBy: admin.name,
        notes: `نقل تنظيمي من ${oldSecName}`
      });
    }
  }

  db.save();
  db.addAuditLog(admin.email, admin.name, 'نقل عضو بين الأمانات', 'SecretariatMember', `تم نقل ${member.name} من ${oldSecName} إلى ${targetSec.name}`, member.id);
  res.json({ success: true, member });
});

app.delete('/api/admin/secretariat-members/:id', authenticateAdmin, requirePermission('secretariats'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const member = data.secretariatMembers.find(m => m.id === req.params.id);
  data.secretariatMembers = data.secretariatMembers.filter(m => m.id !== req.params.id);
  recordLocalTombstone(data, 'secretariat_members', req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إزالة عضو من أمانة', 'SecretariatMember', `تم إخراج ${member?.name} من تشكيل الأمانة مع بقاء ملفه الشخصي`, req.params.id);
  res.json({ success: true });
});

// --- INITIATIVES MANAGEMENT ---
app.post('/api/admin/initiatives', authenticateAdmin, requirePermission('initiatives'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body || {};

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return res.status(400).json({ error: 'اسم المبادرة إلزامي' });
  }

  const slug = body.slug || title.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-') || ('init-' + Date.now());
  const rawGallery = Array.isArray(body.galleryImages) ? body.galleryImages : [];
  const rawActivities = Array.isArray(body.activities)
    ? body.activities
        .filter((a: any) => a && (a.title || a.description))
        .map((a: any) => ({
          title: String(a.title || '').trim(),
          date: String(a.date || '').trim(),
          description: String(a.description || '').trim(),
          venue: typeof a.venue === 'string' ? a.venue.trim() : '',
          locationUrl: typeof a.locationUrl === 'string' ? a.locationUrl.trim() : '',
          imageUrl: a.imageUrl ? persistDataUrlIfAny(String(a.imageUrl), 'init_act') : '',
          authorName: typeof a.authorName === 'string' ? a.authorName.trim() : '',
          authorPosition: typeof a.authorPosition === 'string' ? a.authorPosition.trim() : '',
          authorSecretariatId: typeof a.authorSecretariatId === 'string' ? a.authorSecretariatId.trim() : '',
          publisherName: typeof a.publisherName === 'string' ? a.publisherName.trim() : '',
          publisherPosition: typeof a.publisherPosition === 'string' ? a.publisherPosition.trim() : '',
          publisherSecretariatId: typeof a.publisherSecretariatId === 'string' ? a.publisherSecretariatId.trim() : ''
        }))
    : [];

  const newInit = {
    id: 'init-' + Date.now(),
    slug,
    title,
    logoUrl: body.logoUrl ? persistDataUrlIfAny(body.logoUrl, 'init_logo') : '',
    coverUrl: body.coverUrl ? persistDataUrlIfAny(body.coverUrl, 'init_cover') : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    venue: typeof body.venue === 'string' ? body.venue.trim() : '',
    locationUrl: typeof body.locationUrl === 'string' ? body.locationUrl.trim() : '',
    goals: Array.isArray(body.goals)
      ? body.goals.map((g: any) => String(g).trim()).filter(Boolean)
      : (body.goals ? String(body.goals).split('\n').map(s => s.trim()).filter(Boolean) : []),
    startDate: body.startDate || new Date().toISOString().split('T')[0],
    endDate: body.endDate || '',
    status: body.status || 'active',
    activities: rawActivities,
    galleryImages: rawGallery.map((img: string) => persistDataUrlIfAny(img, 'init_gallery')).filter(Boolean),
    authorName: typeof body.authorName === 'string' ? body.authorName.trim() : '',
    authorPosition: typeof body.authorPosition === 'string' ? body.authorPosition.trim() : '',
    authorSecretariatId: typeof body.authorSecretariatId === 'string' ? body.authorSecretariatId.trim() : '',
    publisherName: typeof body.publisherName === 'string' ? body.publisherName.trim() : '',
    publisherPosition: typeof body.publisherPosition === 'string' ? body.publisherPosition.trim() : '',
    publisherSecretariatId: typeof body.publisherSecretariatId === 'string' ? body.publisherSecretariatId.trim() : '',
    isVisible: body.isVisible !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  data.initiatives.push(newInit);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة مبادرة جديدة', 'Initiative', `تم إنشاء مبادرة: ${newInit.title}`, newInit.id);
  let notificationResult: any = null;
  if (newInit.isVisible) {
    notificationResult = await dispatchSubscriberNotifications(
      data,
      {
        itemType: 'initiative',
        itemId: newInit.id,
        title: newInit.title,
        summary: newInit.description || newInit.title,
        imageUrl: newInit.coverUrl,
        linkPath: `/initiative/${encodeURIComponent(newInit.slug)}`,
        publishDate: newInit.startDate,
        authorName: newInit.authorName,
        authorPosition: newInit.authorPosition
      },
      () => db.save()
    );
  }
  res.json({ success: true, initiative: newInit, notificationResult });
});

app.put('/api/admin/initiatives/:id', authenticateAdmin, requirePermission('initiatives'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.initiatives.findIndex(i => i.id === req.params.id || i.slug === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'المبادرة غير موجودة' });
  }

  const existing = data.initiatives[idx];
  const body = req.body || {};
  const nextTitle = body.title !== undefined ? String(body.title).trim() : String(existing.title || '').trim();
  if (!nextTitle) {
    return res.status(400).json({ error: 'اسم المبادرة إلزامي' });
  }

  const nextGoals = body.goals !== undefined
    ? (Array.isArray(body.goals)
        ? body.goals.map((g: any) => String(g).trim()).filter(Boolean)
        : String(body.goals || '').split('\n').map(s => s.trim()).filter(Boolean))
    : existing.goals || [];

  const nextActivities = body.activities !== undefined
    ? (Array.isArray(body.activities)
        ? body.activities
            .filter((a: any) => a && (a.title || a.description))
            .map((a: any) => ({
              title: String(a.title || '').trim(),
              date: String(a.date || '').trim(),
              description: String(a.description || '').trim(),
              venue: typeof a.venue === 'string' ? a.venue.trim() : '',
              locationUrl: typeof a.locationUrl === 'string' ? a.locationUrl.trim() : '',
              imageUrl: a.imageUrl ? persistDataUrlIfAny(String(a.imageUrl), 'init_act') : '',
              authorName: typeof a.authorName === 'string' ? a.authorName.trim() : '',
              authorPosition: typeof a.authorPosition === 'string' ? a.authorPosition.trim() : '',
              authorSecretariatId: typeof a.authorSecretariatId === 'string' ? a.authorSecretariatId.trim() : '',
              publisherName: typeof a.publisherName === 'string' ? a.publisherName.trim() : '',
              publisherPosition: typeof a.publisherPosition === 'string' ? a.publisherPosition.trim() : '',
              publisherSecretariatId: typeof a.publisherSecretariatId === 'string' ? a.publisherSecretariatId.trim() : ''
            }))
        : [])
    : existing.activities || [];

  const nextCoverUrl = body.coverUrl !== undefined
    ? (body.coverUrl ? persistDataUrlIfAny(String(body.coverUrl), 'init_cover') : '')
    : (existing.coverUrl ? persistDataUrlIfAny(existing.coverUrl, 'init_cover') : '');

  const nextLogoUrl = body.logoUrl !== undefined
    ? (body.logoUrl ? persistDataUrlIfAny(String(body.logoUrl), 'init_logo') : '')
    : (existing.logoUrl ? persistDataUrlIfAny(existing.logoUrl, 'init_logo') : '');

  const rawGallery = body.galleryImages !== undefined
    ? (Array.isArray(body.galleryImages) ? body.galleryImages : [])
    : (existing.galleryImages || []);
  const nextGalleryImages = rawGallery.map((img: string) => persistDataUrlIfAny(img, 'init_gallery')).filter(Boolean);

  data.initiatives[idx] = {
    ...existing,
    ...body,
    id: existing.id,
    slug: body.slug !== undefined && String(body.slug).trim() ? String(body.slug).trim() : (existing.slug || nextTitle.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')),
    title: nextTitle,
    description: body.description !== undefined ? String(body.description).trim() : (existing.description || ''),
    venue: body.venue !== undefined ? String(body.venue || '').trim() : ((existing as any).venue || ''),
    locationUrl: body.locationUrl !== undefined ? String(body.locationUrl || '').trim() : ((existing as any).locationUrl || ''),
    goals: nextGoals,
    activities: nextActivities,
    coverUrl: nextCoverUrl,
    logoUrl: nextLogoUrl,
    galleryImages: nextGalleryImages,
    authorName: body.authorName !== undefined ? String(body.authorName || '').trim() : (existing.authorName || ''),
    authorPosition: body.authorPosition !== undefined ? String(body.authorPosition || '').trim() : (existing.authorPosition || ''),
    authorSecretariatId: body.authorSecretariatId !== undefined ? String(body.authorSecretariatId || '').trim() : ((existing as any).authorSecretariatId || ''),
    publisherName: body.publisherName !== undefined ? String(body.publisherName || '').trim() : ((existing as any).publisherName || ''),
    publisherPosition: body.publisherPosition !== undefined ? String(body.publisherPosition || '').trim() : ((existing as any).publisherPosition || ''),
    publisherSecretariatId: body.publisherSecretariatId !== undefined ? String(body.publisherSecretariatId || '').trim() : ((existing as any).publisherSecretariatId || ''),
    isVisible: body.isVisible !== undefined ? Boolean(body.isVisible) : (existing.isVisible !== false),
    updatedAt: new Date().toISOString()
  } as any;

  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل مبادرة', 'Initiative', `تم تعديل مبادرة: ${data.initiatives[idx].title}`, existing.id);
  res.json({ success: true, initiative: data.initiatives[idx] });
});

app.delete('/api/admin/initiatives/:id', authenticateAdmin, requirePermission('initiatives'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const init = data.initiatives.find(i => i.id === req.params.id);
  data.initiatives = data.initiatives.filter(i => i.id !== req.params.id);
  recordLocalTombstone(data, 'initiatives', req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف مبادرة', 'Initiative', `تم حذف مبادرة: ${init?.title || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// --- NEWS MANAGEMENT ---
app.post('/api/admin/news', authenticateAdmin, requirePermission('news'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body || {};

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!title || !content) {
    return res.status(400).json({ error: 'عنوان الخبر ومحتواه حقول إلزامية' });
  }

  const rawGallery = Array.isArray(body.galleryImages) ? body.galleryImages : [];
  const newNews = {
    id: 'news-' + Date.now(),
    title,
    content,
    excerpt: body.excerpt || (content.substring(0, 180) + (content.length > 180 ? '...' : '')),
    coverImage: body.coverImage ? persistDataUrlIfAny(body.coverImage, 'news_cover') : '',
    galleryImages: rawGallery.map((img: string) => persistDataUrlIfAny(img, 'news_gallery')).filter(Boolean),
    videoUrl: body.videoUrl ? persistDataUrlIfAny(body.videoUrl, 'news_video') : '',
    publishDate: body.publishDate || new Date().toISOString().split('T')[0],
    linkedSecretariatId: body.linkedSecretariatId || '',
    linkedInitiativeId: body.linkedInitiativeId || '',
    isFeatured: !!body.isFeatured,
    isUrgent: !!body.isUrgent,
    isDraft: !!body.isDraft,
    authorName: typeof body.authorName === 'string' ? body.authorName.trim() : '',
    authorPosition: typeof body.authorPosition === 'string' ? body.authorPosition.trim() : '',
    authorSecretariatId: typeof body.authorSecretariatId === 'string' ? body.authorSecretariatId.trim() : '',
    publisherName: typeof body.publisherName === 'string' ? body.publisherName.trim() : '',
    publisherPosition: typeof body.publisherPosition === 'string' ? body.publisherPosition.trim() : '',
    publisherSecretariatId: typeof body.publisherSecretariatId === 'string' ? body.publisherSecretariatId.trim() : '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  data.news.unshift(newNews);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة خبر جديد', 'News', `تم نشر خبر: ${newNews.title}`, newNews.id);
  let notificationResult: any = null;
  if (!newNews.isDraft) {
    notificationResult = await dispatchSubscriberNotifications(
      data,
      {
        itemType: 'news',
        itemId: newNews.id,
        title: newNews.title,
        summary: newNews.excerpt || newNews.content,
        imageUrl: newNews.coverImage,
        linkPath: `/news/${encodeURIComponent(newNews.id)}`,
        publishDate: newNews.publishDate,
        authorName: newNews.authorName,
        authorPosition: newNews.authorPosition,
        isUrgent: newNews.isUrgent
      },
      () => db.save()
    );
  }
  res.json({ success: true, news: newNews, notificationResult });
});

app.put('/api/admin/news/:id', authenticateAdmin, requirePermission('news'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.news.findIndex(n => n.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'الخبر غير موجود' });
  }

  const existing = data.news[idx];
  const body = req.body || {};
  const nextTitle = body.title !== undefined ? String(body.title).trim() : String(existing.title || '').trim();
  const nextContent = body.content !== undefined ? String(body.content).trim() : String(existing.content || '').trim();
  if (!nextTitle || !nextContent) {
    return res.status(400).json({ error: 'عنوان الخبر ومحتواه حقول إلزامية' });
  }

  const contentChanged = body.content !== undefined && nextContent !== existing.content;
  const nextExcerpt =
    body.excerpt !== undefined && body.excerpt !== existing.excerpt
      ? String(body.excerpt).trim()
      : (contentChanged || !existing.excerpt
          ? nextContent.substring(0, 180) + (nextContent.length > 180 ? '...' : '')
          : existing.excerpt);

  const nextCoverImage = body.coverImage !== undefined
    ? (body.coverImage ? persistDataUrlIfAny(String(body.coverImage), 'news_cover') : '')
    : (existing.coverImage ? persistDataUrlIfAny(existing.coverImage, 'news_cover') : '');

  const rawGallery = body.galleryImages !== undefined
    ? (Array.isArray(body.galleryImages) ? body.galleryImages : [])
    : (existing.galleryImages || []);
  const nextGalleryImages = rawGallery.map((img: string) => persistDataUrlIfAny(img, 'news_gallery')).filter(Boolean);

  const nextVideoUrl = body.videoUrl !== undefined
    ? (body.videoUrl ? persistDataUrlIfAny(String(body.videoUrl), 'news_video') : '')
    : (existing.videoUrl ? persistDataUrlIfAny(existing.videoUrl, 'news_video') : '');

  data.news[idx] = {
    ...existing,
    ...body,
    id: existing.id,
    title: nextTitle,
    content: nextContent,
    excerpt: nextExcerpt,
    coverImage: nextCoverImage,
    galleryImages: nextGalleryImages,
    videoUrl: nextVideoUrl,
    publishDate: body.publishDate !== undefined ? (String(body.publishDate || '').trim() || existing.publishDate || new Date().toISOString().split('T')[0]) : existing.publishDate,
    authorName: body.authorName !== undefined ? String(body.authorName || '').trim() : (existing.authorName || ''),
    authorPosition: body.authorPosition !== undefined ? String(body.authorPosition || '').trim() : (existing.authorPosition || ''),
    authorSecretariatId: body.authorSecretariatId !== undefined ? String(body.authorSecretariatId || '').trim() : ((existing as any).authorSecretariatId || ''),
    publisherName: body.publisherName !== undefined ? String(body.publisherName || '').trim() : ((existing as any).publisherName || ''),
    publisherPosition: body.publisherPosition !== undefined ? String(body.publisherPosition || '').trim() : ((existing as any).publisherPosition || ''),
    publisherSecretariatId: body.publisherSecretariatId !== undefined ? String(body.publisherSecretariatId || '').trim() : ((existing as any).publisherSecretariatId || ''),
    updatedAt: new Date().toISOString()
  } as any;
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل خبر', 'News', `تم تعديل خبر: ${data.news[idx].title}`, existing.id);
  let notificationResult: any = null;
  const publishedNow = Boolean(existing.isDraft) && !data.news[idx].isDraft;
  if ((publishedNow || body.notifySubscribers === true) && !data.news[idx].isDraft) {
    notificationResult = await dispatchSubscriberNotifications(
      data,
      {
        itemType: 'news',
        itemId: data.news[idx].id,
        title: data.news[idx].title,
        summary: data.news[idx].excerpt || data.news[idx].content,
        imageUrl: data.news[idx].coverImage,
        linkPath: `/news/${encodeURIComponent(data.news[idx].id)}`,
        publishDate: data.news[idx].publishDate,
        authorName: data.news[idx].authorName,
        authorPosition: data.news[idx].authorPosition,
        isUrgent: data.news[idx].isUrgent
      },
      () => db.save()
    );
  }
  res.json({ success: true, news: data.news[idx], notificationResult });
});

app.delete('/api/admin/news/:id', authenticateAdmin, requirePermission('news'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const news = data.news.find(n => n.id === req.params.id);
  data.news = data.news.filter(n => n.id !== req.params.id);
  recordLocalTombstone(data, 'news', req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف خبر', 'News', `تم حذف خبر: ${news?.title || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// --- EVENTS MANAGEMENT ---
app.post('/api/admin/events', authenticateAdmin, requirePermission('events'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body || {};

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const dateTime = typeof body.dateTime === 'string' ? body.dateTime.trim() : '';
  if (!title || !dateTime) {
    return res.status(400).json({ error: 'اسم الفعالية وموعدها حقول إلزامية' });
  }

  const rawImages = Array.isArray(body.images)
    ? body.images
    : (Array.isArray(body.galleryImages) ? body.galleryImages : []);
  const persistedImages = rawImages.map((img: string) => persistDataUrlIfAny(img, 'event_img')).filter(Boolean);

  const newEvent = {
    id: 'event-' + Date.now(),
    title,
    description: typeof body.description === 'string' ? body.description.trim() : '',
    dateTime,
    venue: (typeof body.venue === 'string' && body.venue.trim()) || 'مقر الحزب بقسم ثالث أكتوبر',
    locationUrl: typeof body.locationUrl === 'string' ? body.locationUrl.trim() : '',
    organizer: (typeof body.organizer === 'string' && body.organizer.trim()) || 'أمانة قسم ثالث أكتوبر',
    authorName: typeof body.authorName === 'string' ? body.authorName.trim() : '',
    authorPosition: typeof body.authorPosition === 'string' ? body.authorPosition.trim() : '',
    authorSecretariatId: typeof body.authorSecretariatId === 'string' ? body.authorSecretariatId.trim() : '',
    publisherName: typeof body.publisherName === 'string' ? body.publisherName.trim() : '',
    publisherPosition: typeof body.publisherPosition === 'string' ? body.publisherPosition.trim() : '',
    publisherSecretariatId: typeof body.publisherSecretariatId === 'string' ? body.publisherSecretariatId.trim() : '',
    images: persistedImages,
    galleryImages: persistedImages,
    coverUrl: body.coverUrl ? persistDataUrlIfAny(body.coverUrl, 'event_cover') : (persistedImages[0] || ''),
    coverImage: body.coverImage ? persistDataUrlIfAny(body.coverImage, 'event_cover') : (persistedImages[0] || ''),
    videoUrl: body.videoUrl ? persistDataUrlIfAny(body.videoUrl, 'event_video') : '',
    status: body.status || 'upcoming',
    postReport: typeof body.postReport === 'string' ? body.postReport.trim() : '',
    isVisible: body.isVisible !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  data.events.unshift(newEvent);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة فعالية', 'Event', `تمت جدولة فعالية: ${newEvent.title}`, newEvent.id);
  let notificationResult: any = null;
  if (newEvent.isVisible) {
    notificationResult = await dispatchSubscriberNotifications(
      data,
      {
        itemType: 'event',
        itemId: newEvent.id,
        title: newEvent.title,
        summary: `${newEvent.description || newEvent.title} — المكان: ${newEvent.venue}`,
        imageUrl: newEvent.coverUrl || newEvent.coverImage || newEvent.images?.[0],
        linkPath: `/events/${encodeURIComponent(newEvent.id)}`,
        publishDate: newEvent.dateTime,
        authorName: newEvent.authorName,
        authorPosition: newEvent.authorPosition
      },
      () => db.save()
    );
  }
  res.json({ success: true, event: newEvent, notificationResult });
});

app.put('/api/admin/events/:id', authenticateAdmin, requirePermission('events'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.events.findIndex(e => e.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'الفعالية غير موجودة' });
  }

  const existing = data.events[idx];
  const body = req.body || {};
  const nextTitle = body.title !== undefined ? String(body.title).trim() : String(existing.title || '').trim();
  const nextDateTime = body.dateTime !== undefined ? String(body.dateTime).trim() : String(existing.dateTime || '').trim();
  if (!nextTitle || !nextDateTime) {
    return res.status(400).json({ error: 'اسم الفعالية وموعدها حقول إلزامية' });
  }

  const rawImages = body.images !== undefined
    ? (Array.isArray(body.images) ? body.images : [])
    : (body.galleryImages !== undefined
        ? (Array.isArray(body.galleryImages) ? body.galleryImages : [])
        : (existing.images || existing.galleryImages || []));
  const persistedImages = rawImages.map((img: string) => persistDataUrlIfAny(img, 'event_img')).filter(Boolean);

  data.events[idx] = {
    ...existing,
    ...body,
    id: existing.id,
    title: nextTitle,
    dateTime: nextDateTime,
    description: body.description !== undefined ? String(body.description || '').trim() : (existing.description || ''),
    venue: body.venue !== undefined ? (String(body.venue || '').trim() || 'مقر الحزب بقسم ثالث أكتوبر') : existing.venue,
    locationUrl: body.locationUrl !== undefined ? String(body.locationUrl || '').trim() : ((existing as any).locationUrl || ''),
    organizer: body.organizer !== undefined ? (String(body.organizer || '').trim() || 'أمانة قسم ثالث أكتوبر') : existing.organizer,
    postReport: body.postReport !== undefined ? String(body.postReport || '').trim() : (existing.postReport || ''),
    authorName: body.authorName !== undefined ? String(body.authorName || '').trim() : (existing.authorName || ''),
    authorPosition: body.authorPosition !== undefined ? String(body.authorPosition || '').trim() : (existing.authorPosition || ''),
    authorSecretariatId: body.authorSecretariatId !== undefined ? String(body.authorSecretariatId || '').trim() : ((existing as any).authorSecretariatId || ''),
    publisherName: body.publisherName !== undefined ? String(body.publisherName || '').trim() : ((existing as any).publisherName || ''),
    publisherPosition: body.publisherPosition !== undefined ? String(body.publisherPosition || '').trim() : ((existing as any).publisherPosition || ''),
    publisherSecretariatId: body.publisherSecretariatId !== undefined ? String(body.publisherSecretariatId || '').trim() : ((existing as any).publisherSecretariatId || ''),
    images: persistedImages,
    galleryImages: persistedImages,
    coverUrl: body.coverUrl !== undefined ? (body.coverUrl ? persistDataUrlIfAny(String(body.coverUrl), 'event_cover') : (persistedImages[0] || '')) : (existing.coverUrl ? persistDataUrlIfAny(existing.coverUrl, 'event_cover') : (persistedImages[0] || '')),
    coverImage: body.coverImage !== undefined ? (body.coverImage ? persistDataUrlIfAny(String(body.coverImage), 'event_cover') : (persistedImages[0] || '')) : (existing.coverImage ? persistDataUrlIfAny(existing.coverImage, 'event_cover') : (persistedImages[0] || '')),
    videoUrl: body.videoUrl !== undefined ? (body.videoUrl ? persistDataUrlIfAny(String(body.videoUrl), 'event_video') : '') : (existing.videoUrl ? persistDataUrlIfAny(existing.videoUrl, 'event_video') : ''),
    isVisible: body.isVisible !== undefined ? Boolean(body.isVisible) : (existing.isVisible !== false),
    updatedAt: new Date().toISOString()
  } as any;
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل فعالية', 'Event', `تم تعديل فعالية: ${data.events[idx].title}`, existing.id);
  res.json({ success: true, event: data.events[idx] });
});

app.delete('/api/admin/events/:id', authenticateAdmin, requirePermission('events'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const event = data.events.find(e => e.id === req.params.id);
  data.events = data.events.filter(e => e.id !== req.params.id);
  recordLocalTombstone(data, 'events', req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف فعالية', 'Event', `تم حذف فعالية: ${event?.title || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// --- MEDIA GALLERY MANAGEMENT ---
app.post('/api/admin/media', authenticateAdmin, requirePermission('media'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body || {};

  if (!body.title || !body.url) {
    return res.status(400).json({ error: 'العنوان ورابط الوسيط حقول إلزامية' });
  }

  const newMedia = {
    id: 'med-' + Date.now(),
    type: body.type || 'photo',
    title: String(body.title).trim(),
    description: body.description || '',
    url: persistDataUrlIfAny(String(body.url).trim(), 'media_item'),
    thumbnail: body.thumbnail ? persistDataUrlIfAny(String(body.thumbnail).trim(), 'media_thumb') : '',
    albumName: body.albumName || 'عام',
    isSpecial: Boolean(body.isSpecial),
    specialCategory: body.specialCategory || '',
    linkedSecretariatId: body.linkedSecretariatId || '',
    linkedInitiativeId: body.linkedInitiativeId || '',
    linkedEventId: body.linkedEventId || '',
    authorName: typeof body.authorName === 'string' ? body.authorName.trim() : '',
    authorPosition: typeof body.authorPosition === 'string' ? body.authorPosition.trim() : '',
    authorSecretariatId: typeof body.authorSecretariatId === 'string' ? body.authorSecretariatId.trim() : '',
    publisherName: typeof body.publisherName === 'string' ? body.publisherName.trim() : '',
    publisherPosition: typeof body.publisherPosition === 'string' ? body.publisherPosition.trim() : '',
    publisherSecretariatId: typeof body.publisherSecretariatId === 'string' ? body.publisherSecretariatId.trim() : '',
    isVisible: body.isVisible !== false,
    sortOrder: Number(body.sortOrder) || (data.media.length + 1),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  data.media.unshift(newMedia);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة وسيط للمعرض', 'Media', `تمت إضافة: ${newMedia.title} (${newMedia.type})`, newMedia.id);
  res.json({ success: true, media: newMedia });
});

app.put('/api/admin/media/:id', authenticateAdmin, requirePermission('media'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.media.findIndex(m => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'عنصر المعرض غير موجود' });
  }

  const nextBody = { ...req.body };
  if (typeof nextBody.title === 'string') nextBody.title = nextBody.title.trim();
  if (typeof nextBody.authorName === 'string') nextBody.authorName = nextBody.authorName.trim();
  if (typeof nextBody.authorPosition === 'string') nextBody.authorPosition = nextBody.authorPosition.trim();
  if (typeof nextBody.authorSecretariatId === 'string') nextBody.authorSecretariatId = nextBody.authorSecretariatId.trim();
  if (typeof nextBody.publisherName === 'string') nextBody.publisherName = nextBody.publisherName.trim();
  if (typeof nextBody.publisherPosition === 'string') nextBody.publisherPosition = nextBody.publisherPosition.trim();
  if (typeof nextBody.publisherSecretariatId === 'string') nextBody.publisherSecretariatId = nextBody.publisherSecretariatId.trim();
  if (nextBody.url) nextBody.url = persistDataUrlIfAny(String(nextBody.url).trim(), 'media_item');
  if (nextBody.thumbnail) nextBody.thumbnail = persistDataUrlIfAny(String(nextBody.thumbnail).trim(), 'media_thumb');

  data.media[idx] = {
    ...data.media[idx],
    ...nextBody,
    id: req.params.id,
    updatedAt: new Date().toISOString()
  } as any;
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل وسيط بالمعرض', 'Media', `تم تحديث: ${data.media[idx].title}`, req.params.id);
  res.json({ success: true, media: data.media[idx] });
});

app.delete('/api/admin/media/:id', authenticateAdmin, requirePermission('media'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const media = data.media.find(m => m.id === req.params.id);
  data.media = data.media.filter(m => m.id !== req.params.id);
  recordLocalTombstone(data, 'media', req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف وسيط من المعرض', 'Media', `تم حذف: ${media?.title || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// --- LIVE STREAM MANAGEMENT ---
app.put('/api/admin/livestream', authenticateAdmin, requirePermission('livestream'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  data.liveStream = {
    ...data.liveStream,
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تحديث إعدادات البث المباشر', 'LiveStream', `حالة البث: ${data.liveStream.isActive ? 'مفعل' : 'متوقف'}`);
  res.json({ success: true, liveStream: data.liveStream });
});

// --- MEMBERSHIP APPLICATIONS MANAGEMENT ---
app.get('/api/admin/applications', authenticateAdmin, requirePermission('applications'), (req: Request, res: Response) => {
  const data = db.get();
  const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
  const status = req.query.status ? String(req.query.status).trim() : '';

  let list = data.applications;
  if (status) {
    list = list.filter(a => a.status === status);
  }
  if (search) {
    list = list.filter(a =>
      a.fullName.toLowerCase().includes(search) ||
      a.nationalId.includes(search) ||
      a.phone.includes(search) ||
      a.applicationNumber.toLowerCase().includes(search)
    );
  }
  res.json(list);
});

// Export Applications to Excel CSV with UTF-8 BOM
app.get('/api/admin/applications/export-excel', authenticateAdmin, requirePermission('applications'), (req: Request, res: Response) => {
  const data = db.get();
  const status = req.query.status ? String(req.query.status).trim() : '';
  let list = data.applications;
  if (status) {
    list = list.filter(a => a.status === status);
  }

  // Helper to escape CSV cell content
  const esc = (val: any) => {
    const s = String(val ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
    return `"${s}"`;
  };

  const headers = [
    'رقم الطلب',
    'الاسم بالكامل',
    'الرقم القومي',
    'تاريخ الميلاد',
    'النوع',
    'الحالة الاجتماعية',
    'المحافظة',
    'القسم / المركز',
    'العنوان التفصيلي',
    'رقم الهاتف',
    'رقم الواتساب',
    'البريد الإلكتروني',
    'المؤهل الدراسي',
    'الوظيفة الحالية',
    'جهة العمل',
    'المهارات والاهتمامات',
    'العمل التطوعي والسياسي السابق',
    'سبب الرغبة في الانضمام',
    'حالة الطلب',
    'تاريخ التقديم',
    'ملاحظات الفحص الداخلي',
    'المشرف المراجع'
  ];

  const rows = list.map(a => [
    esc(a.applicationNumber),
    esc(a.fullName),
    esc(`'${a.nationalId}`), // Prepend apostrophe so Excel preserves full 14 digits as string
    esc(a.dateOfBirth),
    esc(a.gender),
    esc(a.maritalStatus),
    esc(a.governorate),
    esc(a.district),
    esc(a.address),
    esc(`'${a.phone}`),
    esc(`'${a.whatsapp}`),
    esc(a.email),
    esc(a.qualification),
    esc(a.job),
    esc(a.workplace),
    esc(a.skills),
    esc(a.volunteerExperience),
    esc(a.reasonForJoining),
    esc(a.status),
    esc(a.createdAt ? a.createdAt.replace('T', ' ').substring(0, 19) : ''),
    esc(a.internalNotes),
    esc(a.reviewedBy || '')
  ].join(','));

  // UTF-8 BOM (\uFEFF) ensures Excel opens Arabic characters natively
  const csvContent = '\uFEFF' + [headers.map(h => `"${h}"`).join(','), ...rows].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="nfp_applications_${Date.now()}.csv"`);
  res.send(csvContent);
});

app.put('/api/admin/applications/:id', authenticateAdmin, requirePermission('applications'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.applications.findIndex(a => a.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'الطلب غير موجود' });
  }

  const prevStatus = data.applications[idx].status;
  const updatedStatus = req.body.status || prevStatus;

  data.applications[idx] = {
    ...data.applications[idx],
    ...req.body,
    reviewedBy: admin.name + ` (${admin.email})`,
    reviewedAt: new Date().toISOString()
  };

  db.save();
  db.addAuditLog(
    admin.email,
    admin.name,
    'مراجعة طلب انضمام',
    'Application',
    `تغيير حالة طلب ${data.applications[idx].applicationNumber} للمواطن ${data.applications[idx].fullName} من [${prevStatus}] إلى [${updatedStatus}]. ملاحظات: ${req.body.internalNotes || 'لا يوجد'}`,
    req.params.id
  );
  res.json({ success: true, application: data.applications[idx] });
});

// Convert Accepted Application into Official Member in Registry
app.post('/api/admin/applications/:id/convert-to-member', authenticateAdmin, requirePermission('members'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const appItem = data.applications.find(a => a.id === req.params.id);
  if (!appItem) {
    return res.status(404).json({ error: 'الطلب غير موجود' });
  }

  // Verify not already member
  const existing = data.members.find(m => m.nationalId === appItem.nationalId);
  if (existing) {
    return res.status(400).json({ error: 'هذا الشخص مسجل بالفعل في سجل الأعضاء' });
  }

  const { secretariatId, title, notes } = req.body;
  const sec = data.specializedSecretariats.find(s => s.id === secretariatId);

  const memberId = 'mem-' + Date.now();
  const initialAssignment = {
    id: 'asg-' + Date.now(),
    title: title || 'عضو أمانة',
    secretariatId: secretariatId || undefined,
    secretariatName: sec?.name || 'غير محدد',
    startDate: new Date().toISOString().split('T')[0],
    assignedBy: admin.name,
    notes: notes || 'تعيين تنظيمي بموجب قبول طلب الانضمام'
  };

  const newMember: MemberRecord = {
    id: memberId,
    fullName: appItem.fullName,
    nationalId: appItem.nationalId,
    phone: appItem.phone,
    email: appItem.email,
    governorate: 'محافظة الجيزة',
    district: 'قسم ثالث أكتوبر',
    address: appItem.address,
    photoUrl: appItem.personalPhotoUrl,
    secretariatId: secretariatId || undefined,
    title: title || 'عضو أمانة',
    assignmentStatus: 'نشط',
    assignmentHistory: [initialAssignment],
    joinedAt: new Date().toISOString().split('T')[0],
    applicationId: appItem.id
  };

  data.members.unshift(newMember);

  // If secretariat selected, also add to secretariat members list for public showcase
  if (secretariatId) {
    data.secretariatMembers.push({
      id: 'sm-' + Date.now(),
      memberId: newMember.id,
      secretariatId,
      name: newMember.fullName,
      role: newMember.title,
      photoUrl: newMember.photoUrl,
      phone: newMember.phone,
      email: newMember.email,
      assignmentDate: req.body.assignmentDate || '',
      notes: notes || 'مضاف من سجل الأعضاء'
    });
  }

  // Update application status to مقبول
  appItem.status = 'مقبول';
  appItem.reviewedBy = admin.name;
  appItem.reviewedAt = new Date().toISOString();

  db.save();
  db.addAuditLog(
    admin.email,
    admin.name,
    'إدراج عضو بالسجل المركزي',
    'Member',
    `تم قبول طلب ${appItem.applicationNumber} وتعيين ${newMember.fullName} بمسمى [${newMember.title}] بأمانة [${sec?.name || 'غير محدد'}]`,
    newMember.id
  );

  res.json({ success: true, member: newMember });
});

// --- CENTRAL MEMBERS REGISTRY & ASSIGNMENTS ---
app.get('/api/admin/members', authenticateAdmin, requirePermission('members'), (_req: Request, res: Response) => {
  const data = db.get();
  res.json(data.members);
});

app.put('/api/admin/members/:id', authenticateAdmin, requirePermission('members'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.members.findIndex(m => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'العضو غير موجود' });
  }

  data.members[idx] = {
    ...data.members[idx],
    ...req.body,
    id: req.params.id,
    updatedAt: new Date().toISOString()
  };

  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل بيانات عضو بالسجل', 'Member', `تحديث ملف العضو: ${data.members[idx].fullName}`, req.params.id);
  res.json({ success: true, member: data.members[idx] });
});

// Add new assignment or transfer member
app.post('/api/admin/members/:id/assignment', authenticateAdmin, requirePermission('members'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const member = data.members.find(m => m.id === req.params.id);
  if (!member) {
    return res.status(404).json({ error: 'العضو غير موجود' });
  }

  const { title, secretariatId, notes } = req.body;
  const sec = data.specializedSecretariats.find(s => s.id === secretariatId);

  // Close previous assignment if active
  if (member.assignmentHistory.length > 0 && !member.assignmentHistory[0].endDate) {
    member.assignmentHistory[0].endDate = new Date().toISOString().split('T')[0];
  }

  const newAssignment = {
    id: 'asg-' + Date.now(),
    title: title || member.title,
    secretariatId: secretariatId || member.secretariatId,
    secretariatName: sec?.name || 'أمانة قسم ثالث أكتوبر',
    startDate: new Date().toISOString().split('T')[0],
    assignedBy: admin.name,
    notes: notes || ''
  };

  member.title = newAssignment.title;
  member.secretariatId = newAssignment.secretariatId;
  member.assignmentStatus = 'نشط';
  member.assignmentHistory.unshift(newAssignment);

  // Sync with secretariatMembers
  const secMember = data.secretariatMembers.find(sm => sm.memberId === member.id);
  if (secMember) {
    if (secretariatId) secMember.secretariatId = secretariatId;
    secMember.role = member.title;
  } else if (secretariatId) {
    data.secretariatMembers.push({
      id: 'sm-' + Date.now(),
      memberId: member.id,
      secretariatId,
      name: member.fullName,
      role: member.title,
      photoUrl: member.photoUrl,
      phone: member.phone,
      email: member.email,
      assignmentDate: req.body.assignmentDate || ''
    });
  }

  db.save();
  db.addAuditLog(admin.email, admin.name, 'تكليف تنظيمي جديد', 'Member', `إصدار تكليف لـ ${member.fullName} بمسمى [${newAssignment.title}] بأمانة [${newAssignment.secretariatName}]`, member.id);
  res.json({ success: true, member });
});

// End assignment (without deleting person record)
app.put('/api/admin/members/:id/end-assignment', authenticateAdmin, requirePermission('members'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const member = data.members.find(m => m.id === req.params.id);
  if (!member) {
    return res.status(404).json({ error: 'العضو غير موجود' });
  }

  member.assignmentStatus = 'منتهي';
  if (member.assignmentHistory.length > 0 && !member.assignmentHistory[0].endDate) {
    member.assignmentHistory[0].endDate = new Date().toISOString().split('T')[0];
    if (req.body.notes) {
      member.assignmentHistory[0].notes = (member.assignmentHistory[0].notes ? member.assignmentHistory[0].notes + ' - ' : '') + req.body.notes;
    }
  }

  // Remove from active public secretariat members list
  data.secretariatMembers = data.secretariatMembers.filter(sm => sm.memberId !== member.id);

  db.save();
  db.addAuditLog(admin.email, admin.name, 'إنهاء تكليف تنظيمي', 'Member', `إنهاء تكليف ${member.fullName} مع بقاء بياناته وسجله التاريخي محفوظة`, member.id);
  res.json({ success: true, member });
});

// --- ADMIN USERS & PERMISSIONS MANAGEMENT ---
app.get('/api/admin/users', authenticateAdmin, requirePermission('admins'), (_req: Request, res: Response) => {
  const data = db.get();
  const safe = data.admins.map(({ passwordHash, ...rest }) => rest);
  res.json(safe);
});

app.post('/api/admin/users', authenticateAdmin, requirePermission('admins'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const { email, phone, name, password, role, roleId, permissions, adminScope, managedSecretariatId } = req.body;

  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPhone = normalizeAdminPhone(phone);
  const rawPass = normalizeArabicDigitsServer(String(password ?? '')).trim();

  if (!cleanName || !rawPass || (!cleanEmail && !cleanPhone)) {
    return res.status(400).json({ error: 'الاسم وكلمة المرور وأحد وسائل الدخول (البريد الإلكتروني أو رقم الهاتف) حقول إلزامية' });
  }
  if (cleanEmail && !cleanEmail.includes('@')) {
    return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح' });
  }
  if (cleanPhone && cleanPhone.length < 8) {
    return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح (8 أرقام على الأقل)' });
  }
  if (rawPass.length < 4) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن لا تقل عن 4 أرقام أو أحرف' });
  }

  const data = db.get();
  if (cleanEmail && data.admins.some(a => (a.email || '').toLowerCase() === cleanEmail)) {
    return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً لمشرف آخر' });
  }
  if (cleanPhone && data.admins.some(a => a.phone && normalizeAdminPhone(a.phone) === cleanPhone)) {
    return res.status(400).json({ error: 'رقم الهاتف مسجل مسبقاً لمشرف آخر' });
  }

  let userPerms = Array.isArray(permissions) ? permissions : [];
  if (roleId && userPerms.length === 0) {
    const matchedRole = (data.roles || []).find(r => r.id === roleId);
    if (matchedRole) {
      userPerms = [...matchedRole.permissions];
    }
  }

  // Only super_admin can create another super_admin
  const requestedRole = (role === 'super_admin' && admin.role === 'super_admin') ? 'super_admin' : 'sub_admin';

  const nowIso = new Date().toISOString();
  const newAdmin: AdminUser = {
    id: 'admin-' + Date.now(),
    email: cleanEmail,
    ...(cleanPhone ? { phone: cleanPhone } : {}),
    name: cleanName,
    passwordHash: hashPassword(rawPass),
    role: requestedRole,
    roleId: roleId || undefined,
    adminScope: adminScope === 'specialized' ? 'specialized' : 'general',
    managedSecretariatId: adminScope === 'specialized' ? managedSecretariatId : undefined,
    permissions: requestedRole === 'super_admin' ? ['leaders_party', 'leaders_secretariat', 'secretariats', 'initiatives', 'applications', 'members', 'pages', 'news', 'events', 'media', 'livestream', 'roles', 'admins', 'settings', 'audit'] : (userPerms.length > 0 ? userPerms : ['news', 'events']),
    isActive: true,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  data.admins.push(newAdmin);
  db.save();
  const scopeDesc = newAdmin.adminScope === 'specialized' ? `أمانة تخصصية (${newAdmin.managedSecretariatId || 'محددة'})` : 'إدارة عامة';
  const contactDesc = [newAdmin.email, newAdmin.phone].filter(Boolean).join(' / ');
  db.addAuditLog(admin.email || admin.phone || admin.id, admin.name, 'إضافة مشرف جديد', 'AdminUser', `تم إنشاء حساب للمشرف: ${newAdmin.name} (${contactDesc}) بنطاق [${scopeDesc}]`, newAdmin.id);

  const { passwordHash, ...safe } = newAdmin;
  res.json({ success: true, user: safe });
});

app.put('/api/admin/users/:id', authenticateAdmin, requirePermission('admins'), async (req: Request, res: Response) => {
  const currentAdmin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.admins.findIndex(a => a.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'المشرف غير موجود' });
  }

  const target = data.admins[idx];
  const { email, phone, name, password, role, roleId, permissions, isActive, adminScope, managedSecretariatId } = req.body;
  const isProtectedOwner = ['moazmahmoud586@gmail.com', 'm63502205@gmail.com'].includes((target.email || '').toLowerCase());

  // Protect main super admin accounts
  if (isProtectedOwner) {
    if (isActive === false) {
      return res.status(400).json({ error: 'لا يمكن تعطيل حساب المدير الرئيسي للمنصة' });
    }
    if (role && role !== 'super_admin') {
      return res.status(400).json({ error: 'لا يمكن تغيير رتبة المدير الرئيسي للمنصة' });
    }
  }

  // Only super_admin can edit a super_admin or promote someone to super_admin
  if ((target.role === 'super_admin' || role === 'super_admin') && currentAdmin.role !== 'super_admin') {
    return res.status(403).json({ error: 'صلاحية المدير العام الرئيسي (Super Admin) محصورة لمدير المنصة فقط' });
  }

  const nextEmail = email !== undefined && !isProtectedOwner ? String(email || '').trim().toLowerCase() : (target.email || '');
  const nextPhone = phone !== undefined ? normalizeAdminPhone(phone) : (target.phone || '');

  if (nextEmail && !nextEmail.includes('@')) {
    return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح' });
  }
  if (nextPhone && nextPhone.length < 8) {
    return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح (8 أرقام على الأقل)' });
  }
  if (!nextEmail && !nextPhone) {
    return res.status(400).json({ error: 'يجب الإبقاء على البريد الإلكتروني أو رقم الهاتف لحساب المشرف' });
  }
  if (nextEmail && data.admins.some(a => a.id !== target.id && (a.email || '').toLowerCase() === nextEmail)) {
    return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً لمشرف آخر' });
  }
  if (nextPhone && data.admins.some(a => a.id !== target.id && a.phone && normalizeAdminPhone(a.phone) === nextPhone)) {
    return res.status(400).json({ error: 'رقم الهاتف مسجل مسبقاً لمشرف آخر' });
  }

  if (typeof name === 'string' && name.trim()) target.name = name.trim();
  if (email !== undefined && !isProtectedOwner) target.email = nextEmail;
  if (phone !== undefined) target.phone = nextPhone || undefined;

  if (password !== undefined && String(password).trim() !== '') {
    const rawPass = normalizeArabicDigitsServer(String(password)).trim();
    if (rawPass.length < 4) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن لا تقل عن 4 أرقام أو أحرف' });
    }
    target.passwordHash = hashPassword(rawPass);
  }
  if (role) {
    target.role = (role === 'super_admin' && currentAdmin.role === 'super_admin') ? 'super_admin' : 'sub_admin';
  }
  if (roleId !== undefined) target.roleId = roleId;
  if (adminScope) target.adminScope = adminScope;
  if ('managedSecretariatId' in req.body) target.managedSecretariatId = managedSecretariatId;
  if (Array.isArray(permissions)) target.permissions = permissions;
  if (typeof isActive === 'boolean') target.isActive = isActive;
  target.updatedAt = new Date().toISOString();

  db.save();
  db.addAuditLog(currentAdmin.email || currentAdmin.phone || currentAdmin.id, currentAdmin.name, 'تعديل بيانات مشرف', 'AdminUser', `تم تعديل بيانات وصلاحيات ونطاق المشرف: ${target.name}`, target.id);

  const { passwordHash, ...safe } = target;
  res.json({ success: true, user: safe });
});

app.delete('/api/admin/users/:id', authenticateAdmin, requirePermission('admins'), async (req: Request, res: Response) => {
  const currentAdmin = (req as any).admin as AdminUser;
  const data = db.get();
  const target = data.admins.find(a => a.id === req.params.id);
  if (!target) {
    return res.status(404).json({ error: 'المشرف غير موجود' });
  }
  if (['moazmahmoud586@gmail.com', 'm63502205@gmail.com'].includes((target.email || '').toLowerCase())) {
    return res.status(400).json({ error: 'لا يمكن حذف حساب المدير الرئيسي للمنصة' });
  }

  data.admins = data.admins.filter(a => a.id !== req.params.id);
  db.save();
  db.addAuditLog(currentAdmin.email || currentAdmin.phone || currentAdmin.id, currentAdmin.name, 'حذف مشرف', 'AdminUser', `تم حذف حساب المشرف: ${target.name} (${target.email || target.phone || target.id})`, req.params.id);
  res.json({ success: true });
});

// --- CMS STATIC PAGES MANAGEMENT ---
app.get('/api/admin/pages', authenticateAdmin, requirePermission('pages'), (_req: Request, res: Response) => {
  const data = db.get();
  res.json(data.pages || []);
});

app.post('/api/admin/pages', authenticateAdmin, requirePermission('pages'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body || {};

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return res.status(400).json({ error: 'عنوان الصفحة إلزامي' });
  }

  const slug = String(body.slug || title).trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-');
  if (!data.pages) data.pages = [];
  const existing = data.pages.find(p => p.slug === slug);
  if (existing) {
    return res.status(400).json({ error: 'يوجد صفحة أخرى بنفس المعرّف (slug)' });
  }

  const rawGallery = Array.isArray(body.galleryImages) ? body.galleryImages : [];
  const newPage = {
    id: 'page-' + Date.now(),
    slug,
    title,
    subtitle: typeof body.subtitle === 'string' ? body.subtitle.trim() : '',
    content: typeof body.content === 'string' ? body.content : '',
    coverImage: body.coverImage ? persistDataUrlIfAny(String(body.coverImage), 'cms_cover') : '',
    galleryImages: rawGallery.map((img: string) => persistDataUrlIfAny(img, 'cms_gallery')).filter(Boolean),
    metaDescription: typeof body.metaDescription === 'string' ? body.metaDescription.trim() : '',
    isPublished: body.isPublished !== false,
    updatedAt: new Date().toISOString()
  };

  data.pages.push(newPage);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إنشاء صفحة CMS جديدة', 'CMSPage', `تم إنشاء صفحة: ${newPage.title} (${newPage.slug})`, newPage.id);
  res.json({ success: true, page: newPage });
});

app.put('/api/admin/pages/:id', authenticateAdmin, requirePermission('pages'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  if (!data.pages) data.pages = [];
  const idx = data.pages.findIndex(p => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'الصفحة غير موجودة' });
  }

  const existing = data.pages[idx];
  const body = req.body || {};
  const nextTitle = body.title !== undefined ? String(body.title).trim() : String(existing.title || '').trim();
  if (!nextTitle) {
    return res.status(400).json({ error: 'عنوان الصفحة إلزامي' });
  }

  const nextSlug = body.slug !== undefined && String(body.slug).trim()
    ? String(body.slug).trim().toLowerCase().replace(/\s+/g, '-')
    : existing.slug;
  if (data.pages.some(p => p.id !== req.params.id && p.slug === nextSlug)) {
    return res.status(400).json({ error: 'يوجد صفحة أخرى بنفس المعرّف (slug)' });
  }

  const nextCoverImage = body.coverImage !== undefined
    ? (body.coverImage ? persistDataUrlIfAny(String(body.coverImage), 'cms_cover') : '')
    : (existing.coverImage ? persistDataUrlIfAny(existing.coverImage, 'cms_cover') : '');
  const rawGallery = body.galleryImages !== undefined
    ? (Array.isArray(body.galleryImages) ? body.galleryImages : [])
    : (existing.galleryImages || []);
  const nextGalleryImages = rawGallery.map((img: string) => persistDataUrlIfAny(img, 'cms_gallery')).filter(Boolean);

  data.pages[idx] = {
    ...existing,
    ...body,
    id: req.params.id,
    title: nextTitle,
    slug: nextSlug,
    coverImage: nextCoverImage,
    galleryImages: nextGalleryImages,
    updatedAt: new Date().toISOString()
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل صفحة CMS', 'CMSPage', `تم تحديث محتوى صفحة: ${data.pages[idx].title}`, req.params.id);
  res.json({ success: true, page: data.pages[idx] });
});

app.delete('/api/admin/pages/:id', authenticateAdmin, requirePermission('pages'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  if (!data.pages) data.pages = [];
  const page = data.pages.find(p => p.id === req.params.id);
  data.pages = data.pages.filter(p => p.id !== req.params.id);
  recordLocalTombstone(data, 'pages', req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف صفحة CMS', 'CMSPage', `تم حذف صفحة: ${page?.title || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// --- GRANULAR ROLES & RBAC MANAGEMENT ---
app.get('/api/admin/roles', authenticateAdmin, (_req: Request, res: Response) => {
  const data = db.get();
  res.json(data.roles || []);
});

app.post('/api/admin/roles', authenticateAdmin, requirePermission('roles'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body;

  if (!body.name) {
    return res.status(400).json({ error: 'اسم الدور الإداري إلزامي' });
  }

  const newRole = {
    id: 'role-' + Date.now(),
    name: body.name.trim(),
    description: body.description || '',
    isSystem: false,
    permissions: Array.isArray(body.permissions) ? body.permissions : [],
    createdAt: new Date().toISOString()
  };

  if (!data.roles) data.roles = [];
  data.roles.push(newRole);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إنشاء دور إداري جديد (RBAC)', 'AdminRole', `تم إنشاء دور: ${newRole.name}`, newRole.id);
  res.json({ success: true, role: newRole });
});

app.put('/api/admin/roles/:id', authenticateAdmin, requirePermission('roles'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  if (!data.roles) data.roles = [];
  const idx = data.roles.findIndex(r => r.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'الدور غير موجود' });
  }

  data.roles[idx] = {
    ...data.roles[idx],
    ...req.body,
    id: req.params.id,
    isSystem: data.roles[idx].isSystem, // protect system flag
    updatedAt: new Date().toISOString()
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل دور إداري (RBAC)', 'AdminRole', `تم تعديل دور: ${data.roles[idx].name}`, req.params.id);
  res.json({ success: true, role: data.roles[idx] });
});

app.delete('/api/admin/roles/:id', authenticateAdmin, requirePermission('roles'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  if (!data.roles) data.roles = [];
  const role = data.roles.find(r => r.id === req.params.id);
  if (role?.isSystem) {
    return res.status(400).json({ error: 'لا يمكن حذف الأدوار القياسية المدمجة بالنظام' });
  }

  data.roles = data.roles.filter(r => r.id !== req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف دور إداري (RBAC)', 'AdminRole', `تم حذف دور: ${role?.name || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// Upload API
app.post('/api/admin/upload', authenticateAdmin, (req: Request, res: Response) => {
  const { data: fileData } = req.body;
  if (!fileData) {
    return res.status(400).json({ error: 'لم يتم إرسال أي ملف' });
  }
  const url = persistDataUrlIfAny(fileData, 'upload');
  if (typeof url === 'string' && /\.(mp4|webm|mov|ogg)$/i.test(url)) {
    void ensureHeroAudioMp3(url);
  }
  res.json({ success: true, url });
});

// --- SETTINGS MANAGEMENT ---
app.put('/api/admin/settings', authenticateAdmin, requirePermission('settings'), async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  
  const body = { ...req.body };
  // Sanitize any large base64 media payloads to disk files
  if (body.officialLogo) body.officialLogo = persistDataUrlIfAny(body.officialLogo, 'logo');
  if (body.seoShareImage) body.seoShareImage = persistDataUrlIfAny(body.seoShareImage, 'seo_share');
  if (body.heroVideoUrl) body.heroVideoUrl = persistDataUrlIfAny(body.heroVideoUrl, 'hero_vid');
  if (body.heroPosterUrl) body.heroPosterUrl = persistDataUrlIfAny(body.heroPosterUrl, 'hero_poster');
  if (body.entranceImageUrl) body.entranceImageUrl = persistDataUrlIfAny(body.entranceImageUrl, 'entrance');
  if (Array.isArray(body.heroImages)) {
    body.heroImages = body.heroImages.map((img: string) => persistDataUrlIfAny(img, 'hero_img'));
  }
  if (Array.isArray(body.heroSlides)) {
    body.heroSlides = body.heroSlides.map((slide: any) => ({
      ...slide,
      url: persistDataUrlIfAny(slide.url, 'slide'),
      posterUrl: slide.posterUrl ? persistDataUrlIfAny(slide.posterUrl, 'slide_poster') : undefined
    }));
  }

  data.settings = {
    ...data.settings,
    ...body,
    updatedAt: new Date().toISOString()
  };
  db.save();
  if (data.settings.heroVideoUrl) {
    void ensureHeroAudioMp3(data.settings.heroVideoUrl);
  }
  db.addAuditLog(admin.email || admin.phone || admin.id, admin.name, 'تحديث إعدادات المنصة', 'Settings', 'تم تعديل إعدادات وهوية وبيانات التواصل وSEO للمنصة');
  res.json({ success: true, settings: data.settings });
});

// --- AUDIT LOGS ---
app.get('/api/admin/audit-logs', authenticateAdmin, requirePermission('audit'), (_req: Request, res: Response) => {
  const data = db.get();
  res.json(data.auditLogs);
});

// --- EMAIL SUBSCRIBERS & INSTANT ALERTS MANAGEMENT ---
app.get('/api/admin/subscribers', authenticateAdmin, (_req: Request, res: Response) => {
  const data = db.get();
  res.json({
    subscribers: data.subscribers || [],
    dispatchLogs: data.emailDispatchLogs || [],
    smtpStatus: getSmtpStatus()
  });
});

app.post('/api/admin/subscribers/:id/toggle', authenticateAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  if (!data.subscribers) data.subscribers = [];
  const sub = data.subscribers.find(s => s.id === req.params.id);
  if (!sub) {
    return res.status(404).json({ error: 'المشترك غير موجود' });
  }
  sub.status = sub.status === 'active' ? 'unsubscribed' : 'active';
  sub.updatedAt = new Date().toISOString();
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تغيير حالة مشترك بريدي', 'Subscriber', `${sub.email}: ${sub.status}`, sub.id);
  res.json({ success: true, subscriber: sub });
});

app.delete('/api/admin/subscribers/:id', authenticateAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  if (!data.subscribers) data.subscribers = [];
  const sub = data.subscribers.find(s => s.id === req.params.id);
  data.subscribers = data.subscribers.filter(s => s.id !== req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف مشترك من القائمة البريدية', 'Subscriber', `تم حذف البريد: ${sub?.email || req.params.id}`, req.params.id);
  res.json({ success: true });
});

app.post('/api/admin/subscribers/dispatch-item', authenticateAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const { itemType, itemId } = req.body || {};
  const data = db.get();

  let payload: any = null;
  if (itemType === 'news') {
    const n = data.news.find(x => x.id === itemId);
    if (!n) return res.status(404).json({ error: 'الخبر غير موجود' });
    payload = {
      itemType: 'news',
      itemId: n.id,
      title: n.title,
      summary: n.excerpt || n.content,
      imageUrl: n.coverImage,
      linkPath: `/news/${encodeURIComponent(n.id)}`,
      publishDate: n.publishDate,
      authorName: n.authorName,
      authorPosition: n.authorPosition,
      isUrgent: n.isUrgent
    };
  } else if (itemType === 'event') {
    const ev = data.events.find(x => x.id === itemId);
    if (!ev) return res.status(404).json({ error: 'الفعالية غير موجودة' });
    payload = {
      itemType: 'event',
      itemId: ev.id,
      title: ev.title,
      summary: `${ev.description || ev.title} — المكان: ${ev.venue}`,
      imageUrl: ev.coverUrl || ev.coverImage || ev.images?.[0],
      linkPath: `/events/${encodeURIComponent(ev.id)}`,
      publishDate: ev.dateTime,
      authorName: ev.authorName,
      authorPosition: ev.authorPosition
    };
  } else if (itemType === 'initiative') {
    const init = data.initiatives.find(x => x.id === itemId);
    if (!init) return res.status(404).json({ error: 'المبادرة غير موجودة' });
    payload = {
      itemType: 'initiative',
      itemId: init.id,
      title: init.title,
      summary: init.description || init.title,
      imageUrl: init.coverUrl,
      linkPath: `/initiative/${encodeURIComponent(init.slug)}`,
      publishDate: init.startDate,
      authorName: init.authorName,
      authorPosition: init.authorPosition
    };
  } else {
    return res.status(400).json({ error: 'نوع المحتوى غير مدعوم' });
  }

  const notificationResult = await dispatchSubscriberNotifications(data, payload, () => db.save());
  db.addAuditLog(admin.email, admin.name, 'إرسال تنبيه بريدي للمشتركين', 'EmailDispatch', `إرسال (${payload.title}) - أُرسل إلى ${notificationResult.sentCount}`, itemId);
  res.json({ success: true, notificationResult });
});

// Helper to escape HTML characters
function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// -------------------------------------------------------------
// DYNAMIC SOCIAL SHARE PREVIEW ROUTES (WhatsApp, Facebook, Twitter, Telegram)
// -------------------------------------------------------------
// Direct image endpoint for WhatsApp and Open Graph previews
app.get(['/api/news/:id/image', '/api/events/:id/image', '/api/initiatives/:id/image'], (req: Request, res: Response) => {
  const isNews = req.path.startsWith('/api/news');
  const isInitiative = req.path.startsWith('/api/initiatives');
  const id = req.params.id;
  const data = db.get();
  let rawImage: string | null = null;

  if (isNews) {
    const item: any = (data.news || []).find((n: any) => n.id === id || n.slug === id);
    rawImage = item ? (item.coverImage || item.galleryImages?.[0] || item.imageUrl || null) : null;
  } else if (isInitiative) {
    const item: any = (data.initiatives || []).find((i: any) => i.id === id || i.slug === id);
    if (item) {
      const rawAct = typeof req.query?.activity === 'string' ? req.query.activity : '';
      const actIdx = rawAct !== '' && /^\d+$/.test(rawAct) ? Number(rawAct) : -1;
      const actImg = actIdx >= 0 ? item.activities?.[actIdx]?.imageUrl : null;
      const firstActImg = (item.activities || []).find((a: any) => a?.imageUrl)?.imageUrl;
      rawImage = actImg || item.coverUrl || item.galleryImages?.[0] || firstActImg || item.logoUrl || item.imageUrl || null;
    }
  } else {
    const item: any = (data.events || []).find((e: any) => e.id === id || e.slug === id);
    rawImage = item
      ? (item.coverUrl || item.coverImage || item.images?.[0] || item.galleryImages?.[0] || item.imageUrl || null)
      : null;
  }

  if (!rawImage) {
    return res.redirect('/og-logo.jpg');
  }

  // Handle base64 encoded images
  if (rawImage.startsWith('data:image/')) {
    const match = rawImage.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mime = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.send(buffer);
    }
  }

  // Handle absolute or relative URLs
  if (rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
    return res.redirect(rawImage);
  }
  if (rawImage.startsWith('/')) {
    return res.redirect(rawImage);
  }
  return res.redirect('/' + rawImage);
});

// -------------------------------------------------------------
// VITE INTEGRATION & SSR PRERENDERING STARTUP
// -------------------------------------------------------------

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  await hydrateDbFromPublicFirestoreRest(true).catch(() => undefined);
  void ensureHeroAudioMp3(db.get().settings?.heroVideoUrl);

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    const spaPublicRoutes = [
      '/',
      '/index.html',
      '/about',
      '/party-leaders',
      '/secretariat-leaders',
      '/secretariats',
      '/secretariat/:slug',
      '/initiatives',
      '/initiative/:slug',
      '/news',
      '/news/:id',
      '/events',
      '/events/:id',
      '/live',
      '/join',
      '/contact',
      '/page/:slug',
      '/admin',
      '/login'
    ];

    // Serve Vite SPA with route-specific SEO tags & crawler-only semantic SSR HTML inside #root
    app.get(spaPublicRoutes, async (req: Request, res: Response, next: NextFunction) => {
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        const rawHtml = fs.readFileSync(indexPath, 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        res
          .status(200)
          .set({
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
            Vary: 'User-Agent'
          })
          .end(injectDynamicSiteMeta(transformed, req));
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (req: Request, res: Response) => {
      if (req.path === '/admin' || req.path.startsWith('/admin/')) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      }
      const distIndex = path.join(distPath, 'index.html');
      const rawHtml = fs.existsSync(distIndex)
        ? fs.readFileSync(distIndex, 'utf-8')
        : '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
      res
        .status(200)
        .set({
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
          Vary: 'User-Agent'
        })
        .end(injectDynamicSiteMeta(rawHtml, req));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NFP Platform] Server successfully running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[NFP Platform] Failed to start server:', err);
});
