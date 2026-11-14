import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { db, hashPassword } from './src/server/db.ts';
import type { AdminUser, MembershipApplication, MemberRecord } from './src/server/db.ts';

const app = express();
app.set('trust proxy', true);
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

// In-memory session token store (token -> AdminUser)
const sessionStore = new Map<string, { admin: AdminUser; expiresAt: number }>();

function generateToken(): string {
  return 'tok_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
}

// Authentication middleware
function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح: يجب تسجيل الدخول أولاً' });
  }
  const token = authHeader.substring(7);
  const session = sessionStore.get(token);
  if (!session || session.expiresAt < Date.now()) {
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

// Google Site Verification File
app.get('/googlef3c013b384f88d85.html', (_req: Request, res: Response) => {
  res.type('text/html').send('google-site-verification: googlef3c013b384f88d85.html');
});

const OFFICIAL_SITE_URL = 'https://nfp-october3.ai.studio';
const HOME_SEO_TITLE = 'حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر';
const HOME_SEO_DESCRIPTION =
  'الموقع الرسمي لحزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة. تابع قيادات الحزب والأمانة والأخبار والمبادرات والفعاليات وطلبات الانضمام.';

// Ensure admin UI and admin APIs are never indexed by search engines
app.use(['/admin', '/api/admin'], (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});

// Robots.txt
app.get('/robots.txt', (_req: Request, res: Response) => {
  const content = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/admin/

Sitemap: ${OFFICIAL_SITE_URL}/sitemap.xml
`;
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('text/plain').send(content);
});

// Dynamic Sitemap.xml (real crawlable URLs for Google Search)
app.get('/sitemap.xml', (_req: Request, res: Response) => {
  const data = db.get();

  interface SitemapEntry {
    path: string;
    changefreq: string;
    priority: string;
    lastmod?: string;
  }

  const staticPages: SitemapEntry[] = [
    { path: '', changefreq: 'daily', priority: '1.0' },
    { path: 'about', changefreq: 'weekly', priority: '0.9' },
    { path: 'party-leaders', changefreq: 'weekly', priority: '0.85' },
    { path: 'secretariat-leaders', changefreq: 'weekly', priority: '0.9' },
    { path: 'secretariats', changefreq: 'weekly', priority: '0.95' },
    { path: 'initiatives', changefreq: 'weekly', priority: '0.9' },
    { path: 'news', changefreq: 'daily', priority: '0.95' },
    { path: 'events', changefreq: 'weekly', priority: '0.9' },
    { path: 'join', changefreq: 'monthly', priority: '0.9' },
    { path: 'contact', changefreq: 'monthly', priority: '0.85' }
  ];

  const secretariatPages: SitemapEntry[] = (data.specializedSecretariats || [])
    .filter(s => s.isActive && s.slug)
    .map(s => ({
      path: `secretariat/${encodeURIComponent(s.slug)}`,
      changefreq: 'weekly',
      priority: '0.85',
      lastmod: s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : undefined
    }));

  const initiativePages: SitemapEntry[] = (data.initiatives || [])
    .filter(i => i.isVisible && i.slug)
    .map(i => ({
      path: `initiative/${encodeURIComponent(i.slug)}`,
      changefreq: 'weekly',
      priority: '0.85',
      lastmod: i.createdAt ? new Date(i.createdAt).toISOString().split('T')[0] : undefined
    }));

  const newsPages: SitemapEntry[] = (data.news || [])
    .filter(n => !n.isDraft)
    .map(n => ({
      path: `news/${encodeURIComponent(n.id)}`,
      changefreq: 'weekly',
      priority: '0.85',
      lastmod: n.publishDate ? new Date(n.publishDate).toISOString().split('T')[0] : undefined
    }));

  const eventPages: SitemapEntry[] = (data.events || [])
    .filter(e => e.isVisible)
    .map(e => ({
      path: `events/${encodeURIComponent(e.id)}`,
      changefreq: 'weekly',
      priority: '0.8',
      lastmod: e.dateTime ? new Date(e.dateTime).toISOString().split('T')[0] : undefined
    }));

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
    .map(item => `  <url>
    <loc>${escapeHtml(`${OFFICIAL_SITE_URL}/${item.path}`)}</loc>${item.lastmod ? `\n    <lastmod>${item.lastmod}</lastmod>` : ''}
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`)
    .join('\n');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlUrls}
</urlset>`;

  res.type('application/xml').send(sitemapXml);
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

function resolvePublicImageUrl(rawImage: string | undefined, assetBaseUrl: string, itemType?: 'news' | 'events', itemId?: string): string {
  if (rawImage && rawImage.startsWith('data:image/') && itemType && itemId) {
    return `${assetBaseUrl}/api/${itemType}/${encodeURIComponent(itemId)}/image`;
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
  return `${assetBaseUrl}/og-logo.jpg`;
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
      <img src="${escapeHtml(logoSrc)}" alt="شعار حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر" width="52" height="52" />
      <span>حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة</span>
    </a>
    <nav aria-label="التنقل الرئيسي">
      <a href="/">الرئيسية</a>
      <a href="/about">عن الحزب</a>
      <a href="/party-leaders">القيادات</a>
      <a href="/secretariats">الأمانات</a>
      <a href="/initiatives">المبادرات</a>
      <a href="/news">الأخبار</a>
      <a href="/events">الفعاليات</a>
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
  </footer>
</div>`;
}

function resolveRouteSeoAndSsr(req: Request, data: ReturnType<typeof db.get>) {
  const settings = data.settings || ({} as any);
  const assetBaseUrl = getPublicBaseUrl(req);
  const rawLogo = settings.officialLogo || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg';
  const defaultOgImage =
    rawLogo.startsWith('http://') || rawLogo.startsWith('https://')
      ? rawLogo
      : `${assetBaseUrl}/og-logo.jpg`;

  const cleanPath = decodeURIComponent(req.path || '/').replace(/\/+$/, '') || '/';
  const visiblePartyLeaders = (data.partyLeaders || []).filter(l => l.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleSecLeaders = (data.secretariatLeaders || []).filter(l => l.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);
  const activeSecretariats = (data.specializedSecretariats || []).filter(s => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleInitiatives = (data.initiatives || []).filter(i => i.isVisible);
  const publishedNews = (data.news || []).filter(n => !n.isDraft).sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime());
  const visibleEvents = (data.events || []).filter(e => e.isVisible).sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
  const publishedPages = (data.pages || []).filter(p => p.isPublished);

  const phone = settings.phone || '01003070108';
  const address = settings.address || 'مقر أمانة قسم ثالث أكتوبر – طريق الشاذلي، ابني بيتك 7، قسم ثالث 6 أكتوبر، محافظة الجيزة 3265020';

  let title = HOME_SEO_TITLE;
  let description = HOME_SEO_DESCRIPTION;
  let canonical = `${OFFICIAL_SITE_URL}/`;
  let ogType = 'website';
  let ogImage = defaultOgImage;
  let robots = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';
  let mainHtml = '';

  if (cleanPath === '/admin') {
    title = 'لوحة التحكم | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر';
    robots = 'noindex, nofollow';
    mainHtml = '<section><h1>لوحة الإدارة – حزب الجبهة الوطنية</h1></section>';
  } else if (cleanPath === '/about') {
    title = 'عن الحزب والأمانة | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر';
    description = 'تعرف على رؤية ورسالة ومبادئ حزب الجبهة الوطنية وأمانة قسم ثالث أكتوبر بمحافظة الجيزة ودورها المجتمعي والتنموي.';
    canonical = `${OFFICIAL_SITE_URL}/about`;
    mainHtml = `
      <section>
        <h1>عن حزب الجبهة الوطنية وأمانة قسم ثالث أكتوبر</h1>
        <p>الموقع الرسمي لحزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة.</p>
        <h2>الرؤية والرسالة</h2>
        <p>حزب الجبهة الوطنية هو حزب سياسي مدني ديمقراطي يعمل على تعزيز المشاركة الشعبية الفاعلة وتحقيق العدالة الاجتماعية والتنمية المستدامة في قسم ثالث أكتوبر ومحافظة الجيزة ومصر.</p>
        <h2>محاور العمل الحزبي في قسم ثالث أكتوبر</h2>
        <p>خدمة المواطنين، دعم الشباب والمرأة، المبادرات التنموية والصحية، والتواصل الميداني المباشر.</p>
      </section>`;
  } else if (cleanPath === '/party-leaders') {
    title = 'القيادات | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر';
    description = 'تعرف على قيادات حزب الجبهة الوطنية وقيادات وهيئة مكتب أمانة قسم ثالث أكتوبر بمحافظة الجيزة ودورهم في العمل الوطني والمجتمعي.';
    canonical = `${OFFICIAL_SITE_URL}/party-leaders`;
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
    title = 'قيادات أمانة قسم ثالث أكتوبر | حزب الجبهة الوطنية';
    description = 'قيادات وهيئة مكتب أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.';
    canonical = `${OFFICIAL_SITE_URL}/secretariat-leaders`;
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
    title = 'الأمانات التخصصية | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر';
    description = 'استعرض الأمانات التخصصية لحزب الجبهة الوطنية بأمانة قسم ثالث أكتوبر بمحافظة الجيزة ومهامها وأمناءها.';
    canonical = `${OFFICIAL_SITE_URL}/secretariats`;
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
      title = `${sec.name} | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر`;
      description = sec.description
        ? `${sec.name} بحزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر: ${sec.description.slice(0, 140)}`
        : HOME_SEO_DESCRIPTION;
      canonical = `${OFFICIAL_SITE_URL}/secretariat/${encodeURIComponent(sec.slug)}`;
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
    title = 'المبادرات المجتمعية والتنموية | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر';
    description = 'تابع المبادرات الميدانية والتنموية لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.';
    canonical = `${OFFICIAL_SITE_URL}/initiatives`;
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
      title = `${init.title} | مبادرات حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر`;
      description = (init.description || HOME_SEO_DESCRIPTION).slice(0, 160);
      canonical = `${OFFICIAL_SITE_URL}/initiative/${encodeURIComponent(init.slug)}`;
      mainHtml = `
        <article>
          <h1>${escapeHtml(init.title)}</h1>
          <p>${escapeHtml(init.description)}</p>
          ${(init.goals || []).length > 0 ? `<h2>أهداف المبادرة</h2><ul>${init.goals.map(g => `<li>${escapeHtml(g)}</li>`).join('')}</ul>` : ''}
          ${(init.activities || []).length > 0 ? `<h2>الأنشطة الميدانية</h2><ul>${init.activities.map(a => `<li>${escapeHtml(a.title)} (${escapeHtml(a.date)}): ${escapeHtml(a.description)}</li>`).join('')}</ul>` : ''}
          <p><a href="/initiatives">العودة إلى كافة المبادرات</a></p>
        </article>`;
    }
  } else if (cleanPath === '/news') {
    title = 'الأخبار والبيانات الرسمية | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر';
    description = 'آخر الأخبار والبيانات الرسمية والتغطيات الميدانية لحزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة.';
    canonical = `${OFFICIAL_SITE_URL}/news`;
    mainHtml = `
      <section>
        <h1>أخبار وبيانات حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر</h1>
        <p>المصدر الرسمي للأخبار والتغطيات الميدانية بمحافظة الجيزة.</p>
        ${publishedNews.map(n => `
          <article>
            <h2><a href="/news/${encodeURIComponent(n.id)}">${escapeHtml(n.title)}</a></h2>
            <p>${escapeHtml(n.publishDate || '')}</p>
            <p>${escapeHtml(n.excerpt || n.content.slice(0, 160))}</p>
          </article>`).join('')}
      </section>`;
  } else if (cleanPath.startsWith('/news/')) {
    const newsId = cleanPath.slice('/news/'.length);
    const item = publishedNews.find(n => n.id === newsId || (n as any).slug === newsId);
    if (item) {
      title = `${item.title} | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر`;
      description = (item.excerpt || item.content || HOME_SEO_DESCRIPTION).slice(0, 160);
      canonical = `${OFFICIAL_SITE_URL}/news/${encodeURIComponent(item.id)}`;
      ogType = 'article';
      ogImage = resolvePublicImageUrl(item.coverImage, assetBaseUrl, 'news', item.id);
      mainHtml = `
        <article>
          <h1>${escapeHtml(item.title)}</h1>
          <p>${escapeHtml(item.publishDate || '')}</p>
          ${item.coverImage ? `<img src="${escapeHtml(ogImage)}" alt="${escapeHtml(item.title)}" />` : ''}
          <div>${escapeHtml(item.content)}</div>
          <p><a href="/news">العودة إلى كافة الأخبار</a></p>
        </article>`;
    }
  } else if (cleanPath === '/events') {
    title = 'الفعاليات والأنشطة | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر';
    description = 'جدول الفعاليات واللقاءات والندوات والقوافل لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.';
    canonical = `${OFFICIAL_SITE_URL}/events`;
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
      title = `${ev.title} | فعاليات حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر`;
      description = (ev.description || HOME_SEO_DESCRIPTION).slice(0, 160);
      canonical = `${OFFICIAL_SITE_URL}/events/${encodeURIComponent(ev.id)}`;
      ogImage = resolvePublicImageUrl(ev.images?.[0] || ev.coverUrl || ev.coverImage, assetBaseUrl, 'events', ev.id);
      mainHtml = `
        <article>
          <h1>${escapeHtml(ev.title)}</h1>
          <p>${escapeHtml(ev.description)}</p>
          <p>المكان: ${escapeHtml(ev.venue)} – الجهة المنظمة: ${escapeHtml(ev.organizer)}</p>
          <p><a href="/events">العودة إلى كافة الفعاليات</a></p>
        </article>`;
    }
  } else if (cleanPath === '/join') {
    title = 'طلب الانضمام والعضوية | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر';
    description = 'التقديم الإلكتروني لعضوية حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة والاستعلام عن حالة الطلب.';
    canonical = `${OFFICIAL_SITE_URL}/join`;
    mainHtml = `
      <section>
        <h1>استمارة طلب الانضمام والعضوية – أمانة قسم ثالث أكتوبر</h1>
        <p>تقديم طلب العضوية الإلكتروني لأبناء قسم ثالث أكتوبر بمحافظة الجيزة، ومتابعة حالة الطلب إلكترونياً.</p>
        <h2>شروط ومستندات الانضمام</h2>
        <p>إدخال البيانات الشخصية والرقم القومي والتواصل عبر استمارة العضوية الإلكترونية المعتمدة.</p>
      </section>`;
  } else if (cleanPath === '/contact') {
    title = 'تواصل معنا ومقر الأمانة | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر';
    description = 'طرق التواصل المباشرة ومقر حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة وأرقام الهاتف والواتساب والخريطة.';
    canonical = `${OFFICIAL_SITE_URL}/contact`;
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
      title = `${page.title} | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر`;
      description = page.metaDescription || page.subtitle || (page.content || HOME_SEO_DESCRIPTION).slice(0, 160);
      canonical = `${OFFICIAL_SITE_URL}/page/${encodeURIComponent(page.slug)}`;
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
    title = HOME_SEO_TITLE;
    description = HOME_SEO_DESCRIPTION;
    canonical = `${OFFICIAL_SITE_URL}/`;
    mainHtml = `
      <section>
        <h1>معاً نبني مستقبلاً مشرقاً لمصر</h1>
        <p>الموقع الرسمي لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة. تابع قيادات الحزب والأمانة والأخبار والمبادرات والفعاليات وطلبات الانضمام.</p>
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
          ${visiblePartyLeaders.slice(0, 8).map(l => `<li>${escapeHtml(l.name)} – ${escapeHtml(l.position)}</li>`).join('')}
          ${visibleSecLeaders.slice(0, 8).map(l => `<li>${escapeHtml(l.name)} – ${escapeHtml(l.title)} (أمانة قسم ثالث أكتوبر)</li>`).join('')}
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
    canonical,
    ogType,
    ogImage,
    robots,
    ssrHtml: renderSsrShell(data, mainHtml)
  };
}

function injectDynamicSiteMeta(html: string, req: Request): string {
  const data = db.get();
  const settings = data.settings;
  const assetBaseUrl = getPublicBaseUrl(req);
  const ogLogoUrl =
    settings?.officialLogo && (settings.officialLogo.startsWith('http://') || settings.officialLogo.startsWith('https://'))
      ? settings.officialLogo
      : `${assetBaseUrl}/og-logo.jpg`;

  const seo = resolveRouteSeoAndSsr(req, data);
  const phoneIntl = settings?.phone
    ? (settings.phone.startsWith('+') ? settings.phone : `+20${settings.phone.replace(/^0/, '')}`)
    : '+201003070108';
  const streetAddress = settings?.address || 'مقر أمانة قسم ثالث أكتوبر – طريق الشاذلي، ابني بيتك 7، قسم ثالث 6 أكتوبر، محافظة الجيزة 3265020';

  const schemaLogoUrl =
    settings?.officialLogo && (settings.officialLogo.startsWith('http://') || settings.officialLogo.startsWith('https://'))
      ? settings.officialLogo
      : `${OFFICIAL_SITE_URL}/og-logo.jpg`;

  const organizationSchema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: HOME_SEO_TITLE,
    url: `${OFFICIAL_SITE_URL}/`,
    description: HOME_SEO_DESCRIPTION,
    logo: schemaLogoUrl,
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

  const jsonLd = JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: HOME_SEO_TITLE,
      url: `${OFFICIAL_SITE_URL}/`,
      description: HOME_SEO_DESCRIPTION,
      inLanguage: 'ar'
    },
    organizationSchema
  ], null, 2);

  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`);
  out = out.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${escapeHtml(seo.description)}" />`);
  out = out.replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i, `<meta name="robots" content="${escapeHtml(seo.robots)}" />`);
  out = out.replace(/<meta\s+name="googlebot"\s+content="[^"]*"\s*\/?>/i, `<meta name="googlebot" content="${escapeHtml(seo.robots)}" />`);
  out = out.replace(/<meta\s+property="og:site_name"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:site_name" content="${escapeHtml(HOME_SEO_TITLE)}" />`);
  out = out.replace(/<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:type" content="${escapeHtml(seo.ogType)}" />`);
  out = out.replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${escapeHtml(seo.canonical)}" />`);
  out = out.replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${escapeHtml(seo.title)}" />`);
  out = out.replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${escapeHtml(seo.description)}" />`);
  out = out.replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${escapeHtml(seo.ogImage)}" />`);
  out = out.replace(/<meta\s+property="og:image:secure_url"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:image:secure_url" content="${escapeHtml(seo.ogImage)}" />`);
  out = out.replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${escapeHtml(seo.title)}" />`);
  out = out.replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${escapeHtml(seo.description)}" />`);
  out = out.replace(/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${escapeHtml(seo.ogImage)}" />`);
  out = out.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${escapeHtml(seo.canonical)}" />`);
  out = out.replace(/<link\s+rel="image_src"\s+href="[^"]*"\s*\/?>/i, `<link rel="image_src" href="${escapeHtml(seo.ogImage)}" />`);

  out = out.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/i,
    `<script type="application/ld+json">\n${jsonLd}\n    </script>`
  );

  // Inject prerendered SSR semantic HTML into #root for JS-disabled crawlers (Googlebot, Bingbot, social bots)
  out = out.replace('<div id="root"></div>', `<div id="root">${seo.ssrHtml}</div>`);

  return out;
}

// Direct official logo endpoint for WhatsApp, Facebook, Telegram, Twitter, and OpenGraph previews
app.get(['/og-logo.jpg', '/api/site-logo'], (_req: Request, res: Response) => {
  const data = db.get();
  const rawLogo = data.settings?.officialLogo || '';

  if (rawLogo.startsWith('data:image/')) {
    const match = rawLogo.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      res.setHeader('Content-Type', match[1]);
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
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      return res.sendFile(resolved);
    }
  }

  const defaultLogo = getDefaultLogoPath();
  if (fs.existsSync(defaultLogo)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return res.sendFile(defaultLogo);
  }

  return res.status(404).send('Logo not found');
});

// 1. Get all public portal data
app.get('/api/public/data', (_req: Request, res: Response) => {
  const data = db.get();
  // Filter only visible leaders, active secretariats, visible initiatives, published news, upcoming/completed events, visible media, published CMS pages
  const publicData = {
    settings: data.settings,
    partyLeaders: data.partyLeaders.filter(l => l.isVisible).sort((a, b) => a.sortOrder - b.sortOrder),
    secretariatLeaders: data.secretariatLeaders.filter(l => l.isVisible).sort((a, b) => a.sortOrder - b.sortOrder),
    specializedSecretariats: data.specializedSecretariats.filter(s => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    secretariatMembers: data.secretariatMembers || [],
    initiatives: data.initiatives.filter(i => i.isVisible),
    news: data.news.filter(n => !n.isDraft).sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()),
    events: data.events.filter(e => e.isVisible).sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()),
    media: data.media.filter(m => m.isVisible).sort((a, b) => a.sortOrder - b.sortOrder),
    liveStream: data.liveStream,
    pages: (data.pages || []).filter(p => p.isPublished)
  };
  res.json(publicData);
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

// 5. Dynamic /sitemap.xml & /robots.txt handled above

// -------------------------------------------------------------
// ADMIN AUTHENTICATION APIS
// -------------------------------------------------------------

app.post('/api/admin/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const data = db.get();
  const admin = data.admins.find(a => a.email.toLowerCase() === cleanEmail && a.isActive);

  if (!admin) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة أو الحساب غير نشط' });
  }

  const hashed = hashPassword(password);
  if (admin.passwordHash !== hashed) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  }

  // Update last login
  admin.lastLogin = new Date().toISOString();
  db.save();

  // Create session
  const token = generateToken();
  // Valid for 7 days
  sessionStore.set(token, {
    admin,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  });

  db.addAuditLog(admin.email, admin.name, 'تسجيل دخول إداري', 'Auth', 'تم تسجيل الدخول بنجاح إلى لوحة التحكم');

  const { passwordHash, ...safeAdmin } = admin;
  res.json({
    success: true,
    token,
    user: safeAdmin
  });
});

app.get('/api/admin/me', authenticateAdmin, (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const { passwordHash, ...safeAdmin } = admin;
  res.json({ user: safeAdmin });
});

app.post('/api/admin/logout', authenticateAdmin, (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    sessionStore.delete(authHeader.substring(7));
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
    rolesCount: (data.roles || []).length
  };
  res.json(stats);
});

// Full DB for admin
app.get('/api/admin/full-db', authenticateAdmin, (_req: Request, res: Response) => {
  const data = db.get();
  const safeAdmins = data.admins.map(({ passwordHash, ...rest }) => rest);
  const sortedSecretariats = [...(data.specializedSecretariats || [])].sort((a, b) => a.sortOrder - b.sortOrder);
  res.json({
    ...data,
    specializedSecretariats: sortedSecretariats,
    admins: safeAdmins
  });
});

// --- PARTY LEADERS MANAGEMENT ---
app.post('/api/admin/party-leaders', authenticateAdmin, requirePermission('leaders_party'), (req: Request, res: Response) => {
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
    bio: body.bio || '',
    photoUrl: body.photoUrl || '',
    sortOrder: Number(body.sortOrder) || (data.partyLeaders.length + 1),
    isVisible: body.isVisible !== false,
    createdAt: new Date().toISOString()
  };

  data.partyLeaders.push(newLeader);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة قيادة حزبية', 'PartyLeader', `تمت إضافة القيادة: ${newLeader.name} بمنصب: ${newLeader.position}`, newLeader.id);
  res.json({ success: true, leader: newLeader });
});

app.put('/api/admin/party-leaders/:id', authenticateAdmin, requirePermission('leaders_party'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.partyLeaders.findIndex(l => l.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'القيادة غير موجودة' });
  }

  data.partyLeaders[idx] = {
    ...data.partyLeaders[idx],
    ...req.body,
    id: req.params.id
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل قيادة حزبية', 'PartyLeader', `تم تحديث بيانات القيادة: ${data.partyLeaders[idx].name}`, req.params.id);
  res.json({ success: true, leader: data.partyLeaders[idx] });
});

app.delete('/api/admin/party-leaders/:id', authenticateAdmin, requirePermission('leaders_party'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const leader = data.partyLeaders.find(l => l.id === req.params.id);
  data.partyLeaders = data.partyLeaders.filter(l => l.id !== req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف قيادة حزبية', 'PartyLeader', `تم حذف القيادة: ${leader?.name || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// --- SECRETARIAT LEADERS MANAGEMENT (3rd October Giza only) ---
app.post('/api/admin/secretariat-leaders', authenticateAdmin, requirePermission('leaders_secretariat'), (req: Request, res: Response) => {
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
    photoUrl: body.photoUrl || '',
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

app.put('/api/admin/secretariat-leaders/:id', authenticateAdmin, requirePermission('leaders_secretariat'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.secretariatLeaders.findIndex(l => l.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'القيادة غير موجودة' });
  }

  data.secretariatLeaders[idx] = {
    ...data.secretariatLeaders[idx],
    ...req.body,
    id: req.params.id
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل قيادة بأمانة قسم ثالث أكتوبر', 'SecretariatLeader', `تم تحديث بيانات: ${data.secretariatLeaders[idx].name}`, req.params.id);
  res.json({ success: true, leader: data.secretariatLeaders[idx] });
});

app.delete('/api/admin/secretariat-leaders/:id', authenticateAdmin, requirePermission('leaders_secretariat'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const leader = data.secretariatLeaders.find(l => l.id === req.params.id);
  data.secretariatLeaders = data.secretariatLeaders.filter(l => l.id !== req.params.id);
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
app.post('/api/admin/secretariats', authenticateAdmin, requirePermission('secretariats'), (req: Request, res: Response) => {
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

app.put('/api/admin/secretariats/:id', authenticateAdmin, requirePermission('secretariats'), (req: Request, res: Response) => {
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
    id: req.params.id
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل أمانة تخصصية', 'SpecializedSecretariat', `تم تعديل بيانات أمانة: ${data.specializedSecretariats[idx].name}`, req.params.id);
  res.json({ success: true, secretariat: data.specializedSecretariats[idx] });
});

app.delete('/api/admin/secretariats/:id', authenticateAdmin, requirePermission('secretariats'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const sec = data.specializedSecretariats.find(s => s.id === req.params.id);
  if (!sec) {
    return res.status(404).json({ error: 'الأمانة غير موجودة' });
  }

  // Preserve members: keep secretariatMembers intact or set their secretariatId to unassigned, without deleting person records
  data.specializedSecretariats = data.specializedSecretariats.filter(s => s.id !== req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف أمانة تخصصية', 'SpecializedSecretariat', `تم حذف أمانة: ${sec.name} مع الحفاظ على سجلات الأعضاء`, req.params.id);
  res.json({ success: true });
});

// Save all secretariats (ordering, bulk changes, confirm)
app.post('/api/admin/secretariats/save-all', authenticateAdmin, requirePermission('secretariats'), (req: Request, res: Response) => {
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
      filtered.push(normalizeSecretariatPayload(item));
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
app.post('/api/admin/secretariat-members', authenticateAdmin, requirePermission('secretariats'), (req: Request, res: Response) => {
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
    photoUrl: body.photoUrl || '',
    phone: body.phone || '',
    email: body.email || '',
    assignmentDate: body.assignmentDate || '',
    notes: body.notes || ''
  };

  data.secretariatMembers.push(newMember);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة عضو لأمانة تخصصية', 'SecretariatMember', `تمت إضافة ${newMember.name} بمسمى ${newMember.role}`, newMember.id);
  res.json({ success: true, member: newMember });
});

app.put('/api/admin/secretariat-members/:id', authenticateAdmin, requirePermission('secretariats'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.secretariatMembers.findIndex(m => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'العضو غير موجود' });
  }

  data.secretariatMembers[idx] = {
    ...data.secretariatMembers[idx],
    ...req.body,
    id: req.params.id
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل تكليف عضو بأمانة', 'SecretariatMember', `تم تحديث تكليف: ${data.secretariatMembers[idx].name}`, req.params.id);
  res.json({ success: true, member: data.secretariatMembers[idx] });
});

app.post('/api/admin/secretariat-members/transfer', authenticateAdmin, requirePermission('secretariats'), (req: Request, res: Response) => {
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

app.delete('/api/admin/secretariat-members/:id', authenticateAdmin, requirePermission('secretariats'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const member = data.secretariatMembers.find(m => m.id === req.params.id);
  data.secretariatMembers = data.secretariatMembers.filter(m => m.id !== req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إزالة عضو من أمانة', 'SecretariatMember', `تم إخراج ${member?.name} من تشكيل الأمانة مع بقاء ملفه الشخصي`, req.params.id);
  res.json({ success: true });
});

// --- INITIATIVES MANAGEMENT ---
app.post('/api/admin/initiatives', authenticateAdmin, requirePermission('initiatives'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body;

  if (!body.title) {
    return res.status(400).json({ error: 'اسم المبادرة إلزامي' });
  }

  const slug = body.slug || body.title.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-');
  const newInit = {
    id: 'init-' + Date.now(),
    slug,
    title: body.title.trim(),
    logoUrl: body.logoUrl || '',
    coverUrl: body.coverUrl || '',
    description: body.description || '',
    goals: Array.isArray(body.goals) ? body.goals : (body.goals ? String(body.goals).split('\n').filter(Boolean) : []),
    startDate: body.startDate || new Date().toISOString().split('T')[0],
    endDate: body.endDate || '',
    status: body.status || 'active',
    activities: Array.isArray(body.activities) ? body.activities : [],
    isVisible: body.isVisible !== false,
    createdAt: new Date().toISOString()
  };

  data.initiatives.push(newInit);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة مبادرة جديدة', 'Initiative', `تم إنشاء مبادرة: ${newInit.title}`, newInit.id);
  res.json({ success: true, initiative: newInit });
});

app.put('/api/admin/initiatives/:id', authenticateAdmin, requirePermission('initiatives'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.initiatives.findIndex(i => i.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'المبادرة غير موجودة' });
  }

  data.initiatives[idx] = {
    ...data.initiatives[idx],
    ...req.body,
    id: req.params.id
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل مبادرة', 'Initiative', `تم تعديل مبادرة: ${data.initiatives[idx].title}`, req.params.id);
  res.json({ success: true, initiative: data.initiatives[idx] });
});

app.delete('/api/admin/initiatives/:id', authenticateAdmin, requirePermission('initiatives'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const init = data.initiatives.find(i => i.id === req.params.id);
  data.initiatives = data.initiatives.filter(i => i.id !== req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف مبادرة', 'Initiative', `تم حذف مبادرة: ${init?.title || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// --- NEWS MANAGEMENT ---
app.post('/api/admin/news', authenticateAdmin, requirePermission('news'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body;

  if (!body.title || !body.content) {
    return res.status(400).json({ error: 'عنوان الخبر ومحتواه حقول إلزامية' });
  }

  const newNews = {
    id: 'news-' + Date.now(),
    title: body.title.trim(),
    content: body.content.trim(),
    excerpt: body.excerpt || body.content.substring(0, 180) + '...',
    coverImage: body.coverImage || '',
    galleryImages: Array.isArray(body.galleryImages) ? body.galleryImages : [],
    videoUrl: body.videoUrl || '',
    publishDate: body.publishDate || new Date().toISOString().split('T')[0],
    linkedSecretariatId: body.linkedSecretariatId || '',
    linkedInitiativeId: body.linkedInitiativeId || '',
    isFeatured: !!body.isFeatured,
    isUrgent: !!body.isUrgent,
    isDraft: !!body.isDraft,
    createdAt: new Date().toISOString()
  };

  data.news.unshift(newNews);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة خبر جديد', 'News', `تم نشر خبر: ${newNews.title}`, newNews.id);
  res.json({ success: true, news: newNews });
});

app.put('/api/admin/news/:id', authenticateAdmin, requirePermission('news'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.news.findIndex(n => n.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'الخبر غير موجود' });
  }

  data.news[idx] = {
    ...data.news[idx],
    ...req.body,
    id: req.params.id
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل خبر', 'News', `تم تعديل خبر: ${data.news[idx].title}`, req.params.id);
  res.json({ success: true, news: data.news[idx] });
});

app.delete('/api/admin/news/:id', authenticateAdmin, requirePermission('news'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const news = data.news.find(n => n.id === req.params.id);
  data.news = data.news.filter(n => n.id !== req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف خبر', 'News', `تم حذف خبر: ${news?.title || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// --- EVENTS MANAGEMENT ---
app.post('/api/admin/events', authenticateAdmin, requirePermission('events'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body;

  if (!body.title || !body.dateTime) {
    return res.status(400).json({ error: 'اسم الفعالية وموعدها حقول إلزامية' });
  }

  const newEvent = {
    id: 'event-' + Date.now(),
    title: body.title.trim(),
    description: body.description || '',
    dateTime: body.dateTime,
    venue: body.venue || 'مقر الحزب بقسم ثالث أكتوبر',
    organizer: body.organizer || 'أمانة قسم ثالث أكتوبر',
    images: Array.isArray(body.images) ? body.images : [],
    videoUrl: body.videoUrl || '',
    status: body.status || 'upcoming',
    postReport: body.postReport || '',
    isVisible: body.isVisible !== false,
    createdAt: new Date().toISOString()
  };

  data.events.unshift(newEvent);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة فعالية', 'Event', `تمت جدولة فعالية: ${newEvent.title}`, newEvent.id);
  res.json({ success: true, event: newEvent });
});

app.put('/api/admin/events/:id', authenticateAdmin, requirePermission('events'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.events.findIndex(e => e.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'الفعالية غير موجودة' });
  }

  data.events[idx] = {
    ...data.events[idx],
    ...req.body,
    id: req.params.id
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل فعالية', 'Event', `تم تعديل فعالية: ${data.events[idx].title}`, req.params.id);
  res.json({ success: true, event: data.events[idx] });
});

app.delete('/api/admin/events/:id', authenticateAdmin, requirePermission('events'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const event = data.events.find(e => e.id === req.params.id);
  data.events = data.events.filter(e => e.id !== req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف فعالية', 'Event', `تم حذف فعالية: ${event?.title || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// --- MEDIA GALLERY MANAGEMENT ---
app.post('/api/admin/media', authenticateAdmin, requirePermission('media'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body;

  if (!body.title || !body.url) {
    return res.status(400).json({ error: 'العنوان ورابط الوسيط حقول إلزامية' });
  }

  const newMedia = {
    id: 'med-' + Date.now(),
    type: body.type || 'photo',
    title: body.title.trim(),
    description: body.description || '',
    url: body.url.trim(),
    thumbnail: body.thumbnail || '',
    albumName: body.albumName || 'عام',
    linkedSecretariatId: body.linkedSecretariatId || '',
    linkedInitiativeId: body.linkedInitiativeId || '',
    linkedEventId: body.linkedEventId || '',
    isVisible: body.isVisible !== false,
    sortOrder: Number(body.sortOrder) || (data.media.length + 1),
    createdAt: new Date().toISOString()
  };

  data.media.unshift(newMedia);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة وسيط للمعرض', 'Media', `تمت إضافة: ${newMedia.title} (${newMedia.type})`, newMedia.id);
  res.json({ success: true, media: newMedia });
});

app.put('/api/admin/media/:id', authenticateAdmin, requirePermission('media'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.media.findIndex(m => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'عنصر المعرض غير موجود' });
  }

  data.media[idx] = {
    ...data.media[idx],
    ...req.body,
    id: req.params.id
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل وسيط بالمعرض', 'Media', `تم تحديث: ${data.media[idx].title}`, req.params.id);
  res.json({ success: true, media: data.media[idx] });
});

app.delete('/api/admin/media/:id', authenticateAdmin, requirePermission('media'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const media = data.media.find(m => m.id === req.params.id);
  data.media = data.media.filter(m => m.id !== req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف وسيط من المعرض', 'Media', `تم حذف: ${media?.title || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// --- LIVE STREAM MANAGEMENT ---
app.put('/api/admin/livestream', authenticateAdmin, requirePermission('livestream'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  data.liveStream = {
    ...data.liveStream,
    ...req.body
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

app.put('/api/admin/applications/:id', authenticateAdmin, requirePermission('applications'), (req: Request, res: Response) => {
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
app.post('/api/admin/applications/:id/convert-to-member', authenticateAdmin, requirePermission('members'), (req: Request, res: Response) => {
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

app.put('/api/admin/members/:id', authenticateAdmin, requirePermission('members'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.members.findIndex(m => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'العضو غير موجود' });
  }

  data.members[idx] = {
    ...data.members[idx],
    ...req.body,
    id: req.params.id
  };

  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل بيانات عضو بالسجل', 'Member', `تحديث ملف العضو: ${data.members[idx].fullName}`, req.params.id);
  res.json({ success: true, member: data.members[idx] });
});

// Add new assignment or transfer member
app.post('/api/admin/members/:id/assignment', authenticateAdmin, requirePermission('members'), (req: Request, res: Response) => {
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
app.put('/api/admin/members/:id/end-assignment', authenticateAdmin, requirePermission('members'), (req: Request, res: Response) => {
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

app.post('/api/admin/users', authenticateAdmin, requirePermission('admins'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const { email, name, password, role, roleId, permissions, adminScope, managedSecretariatId } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور حقول إلزامية' });
  }

  const data = db.get();
  const cleanEmail = String(email).trim().toLowerCase();
  if (data.admins.some(a => a.email.toLowerCase() === cleanEmail)) {
    return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً لمشرف آخر' });
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

  const newAdmin: AdminUser = {
    id: 'admin-' + Date.now(),
    email: cleanEmail,
    name: name.trim(),
    passwordHash: hashPassword(password),
    role: requestedRole,
    roleId: roleId || undefined,
    adminScope: adminScope === 'specialized' ? 'specialized' : 'general',
    managedSecretariatId: adminScope === 'specialized' ? managedSecretariatId : undefined,
    permissions: requestedRole === 'super_admin' ? ['leaders_party', 'leaders_secretariat', 'secretariats', 'initiatives', 'applications', 'members', 'news', 'events', 'media', 'livestream', 'social', 'admins', 'settings', 'audit'] : (userPerms.length > 0 ? userPerms : ['news', 'events']),
    isActive: true,
    createdAt: new Date().toISOString()
  };

  data.admins.push(newAdmin);
  db.save();
  const scopeDesc = newAdmin.adminScope === 'specialized' ? `أمانة تخصصية (${newAdmin.managedSecretariatId || 'محددة'})` : 'إدارة عامة';
  db.addAuditLog(admin.email, admin.name, 'إضافة مشرف جديد', 'AdminUser', `تم إنشاء حساب للمشرف: ${newAdmin.name} (${newAdmin.email}) بنطاق [${scopeDesc}]`, newAdmin.id);

  const { passwordHash, ...safe } = newAdmin;
  res.json({ success: true, user: safe });
});

app.put('/api/admin/users/:id', authenticateAdmin, requirePermission('admins'), (req: Request, res: Response) => {
  const currentAdmin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.admins.findIndex(a => a.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'المشرف غير موجود' });
  }

  const target = data.admins[idx];
  const { name, password, role, roleId, permissions, isActive, adminScope, managedSecretariatId } = req.body;

  // Protect main super admin account
  if (target.email === 'moazmahmoud586@gmail.com') {
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

  if (name) target.name = name.trim();
  if (password && String(password).trim().length >= 6) {
    target.passwordHash = hashPassword(password);
  }
  if (role) {
    target.role = (role === 'super_admin' && currentAdmin.role === 'super_admin') ? 'super_admin' : 'sub_admin';
  }
  if (roleId !== undefined) target.roleId = roleId;
  if (adminScope) target.adminScope = adminScope;
  if ('managedSecretariatId' in req.body) target.managedSecretariatId = managedSecretariatId;
  if (Array.isArray(permissions)) target.permissions = permissions;
  if (typeof isActive === 'boolean') target.isActive = isActive;

  db.save();
  db.addAuditLog(currentAdmin.email, currentAdmin.name, 'تعديل بيانات مشرف', 'AdminUser', `تم تعديل بيانات وصلاحيات ونطاق المشرف: ${target.name}`, target.id);

  const { passwordHash, ...safe } = target;
  res.json({ success: true, user: safe });
});

app.delete('/api/admin/users/:id', authenticateAdmin, requirePermission('admins'), (req: Request, res: Response) => {
  const currentAdmin = (req as any).admin as AdminUser;
  const data = db.get();
  const target = data.admins.find(a => a.id === req.params.id);
  if (!target) {
    return res.status(404).json({ error: 'المشرف غير موجود' });
  }
  if (target.email === 'moazmahmoud586@gmail.com') {
    return res.status(400).json({ error: 'لا يمكن حذف حساب المدير الرئيسي للمنصة' });
  }

  data.admins = data.admins.filter(a => a.id !== req.params.id);
  db.save();
  db.addAuditLog(currentAdmin.email, currentAdmin.name, 'حذف مشرف', 'AdminUser', `تم حذف حساب المشرف: ${target.name} (${target.email})`, req.params.id);
  res.json({ success: true });
});

// --- CMS STATIC PAGES MANAGEMENT ---
app.get('/api/admin/pages', authenticateAdmin, requirePermission('pages'), (_req: Request, res: Response) => {
  const data = db.get();
  res.json(data.pages || []);
});

app.post('/api/admin/pages', authenticateAdmin, requirePermission('pages'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body;

  if (!body.title) {
    return res.status(400).json({ error: 'عنوان الصفحة إلزامي' });
  }

  const slug = (body.slug || body.title).toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-');
  if (!data.pages) data.pages = [];
  const existing = data.pages.find(p => p.slug === slug);
  if (existing) {
    return res.status(400).json({ error: 'يوجد صفحة أخرى بنفس المعرّف (slug)' });
  }

  const newPage = {
    id: 'page-' + Date.now(),
    slug,
    title: body.title.trim(),
    subtitle: body.subtitle || '',
    content: body.content || '',
    coverImage: body.coverImage || '',
    galleryImages: Array.isArray(body.galleryImages) ? body.galleryImages : [],
    metaDescription: body.metaDescription || '',
    isPublished: body.isPublished !== false,
    updatedAt: new Date().toISOString()
  };

  data.pages.push(newPage);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إنشاء صفحة CMS جديدة', 'CMSPage', `تم إنشاء صفحة: ${newPage.title} (${newPage.slug})`, newPage.id);
  res.json({ success: true, page: newPage });
});

app.put('/api/admin/pages/:id', authenticateAdmin, requirePermission('pages'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  if (!data.pages) data.pages = [];
  const idx = data.pages.findIndex(p => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'الصفحة غير موجودة' });
  }

  data.pages[idx] = {
    ...data.pages[idx],
    ...req.body,
    id: req.params.id,
    updatedAt: new Date().toISOString()
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل صفحة CMS', 'CMSPage', `تم تحديث محتوى صفحة: ${data.pages[idx].title}`, req.params.id);
  res.json({ success: true, page: data.pages[idx] });
});

app.delete('/api/admin/pages/:id', authenticateAdmin, requirePermission('pages'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  if (!data.pages) data.pages = [];
  const page = data.pages.find(p => p.id === req.params.id);
  data.pages = data.pages.filter(p => p.id !== req.params.id);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'حذف صفحة CMS', 'CMSPage', `تم حذف صفحة: ${page?.title || req.params.id}`, req.params.id);
  res.json({ success: true });
});

// --- GRANULAR ROLES & RBAC MANAGEMENT ---
app.get('/api/admin/roles', authenticateAdmin, (_req: Request, res: Response) => {
  const data = db.get();
  res.json(data.roles || []);
});

app.post('/api/admin/roles', authenticateAdmin, requirePermission('roles'), (req: Request, res: Response) => {
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

app.put('/api/admin/roles/:id', authenticateAdmin, requirePermission('roles'), (req: Request, res: Response) => {
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
    isSystem: data.roles[idx].isSystem // protect system flag
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تعديل دور إداري (RBAC)', 'AdminRole', `تم تعديل دور: ${data.roles[idx].name}`, req.params.id);
  res.json({ success: true, role: data.roles[idx] });
});

app.delete('/api/admin/roles/:id', authenticateAdmin, requirePermission('roles'), (req: Request, res: Response) => {
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
  res.json({ success: true, url });
});

// --- SETTINGS MANAGEMENT ---
app.put('/api/admin/settings', authenticateAdmin, requirePermission('settings'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  
  const body = { ...req.body };
  // Sanitize any large base64 media payloads to disk files
  if (body.officialLogo) body.officialLogo = persistDataUrlIfAny(body.officialLogo, 'logo');
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
    ...body
  };
  db.save();
  db.addAuditLog(admin.email, admin.name, 'تحديث إعدادات المنصة', 'Settings', 'تم تعديل إعدادات وهوية وبيانات التواصل للمنصة');
  res.json({ success: true, settings: data.settings });
});

// --- AUDIT LOGS ---
app.get('/api/admin/audit-logs', authenticateAdmin, requirePermission('audit'), (_req: Request, res: Response) => {
  const data = db.get();
  res.json(data.auditLogs);
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
app.get(['/api/news/:id/image', '/api/events/:id/image'], (req: Request, res: Response) => {
  const isNews = req.path.startsWith('/api/news');
  const id = req.params.id;
  const data = db.get();
  const item: any = isNews
    ? (data.news || []).find((n: any) => n.id === id || n.slug === id)
    : (data.events || []).find((e: any) => e.id === id || e.slug === id);

  const rawImage = item ? (isNews ? (item.coverImage || item.imageUrl) : (item.images?.[0] || item.coverUrl || item.imageUrl)) : null;

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
      '/join',
      '/contact',
      '/page/:slug',
      '/admin'
    ];

    // Serve Vite SPA with route-specific SEO tags & semantic SSR HTML inside #root
    app.get(spaPublicRoutes, async (req: Request, res: Response, next: NextFunction) => {
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        const rawHtml = fs.readFileSync(indexPath, 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(injectDynamicSiteMeta(transformed, req));
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
      res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(injectDynamicSiteMeta(rawHtml, req));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NFP Platform] Server successfully running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[NFP Platform] Failed to start server:', err);
});
