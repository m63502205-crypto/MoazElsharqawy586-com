import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { db, hashPassword } from './src/server/db.ts';
import type { AdminUser, MembershipApplication, MemberRecord } from './src/server/db.ts';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

// Robots.txt
app.get('/robots.txt', (req: Request, res: Response) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host') || 'localhost:3000';
  const baseUrl = `${protocol}://${host}`;
  const content = `User-agent: *
Allow: /
Disallow: /api/admin/
Disallow: /#admin

Sitemap: ${baseUrl}/sitemap.xml
`;
  res.type('text/plain').send(content);
});

// Dynamic Sitemap.xml
app.get('/sitemap.xml', (req: Request, res: Response) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host') || 'localhost:3000';
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
  const data = db.get();

  interface SitemapEntry {
    path: string;
    changefreq: string;
    priority: string;
    lastmod?: string;
  }

  const mainPages: SitemapEntry[] = [
    { path: '', changefreq: 'daily', priority: '1.0' },
    { path: '#about', changefreq: 'weekly', priority: '0.9' },
    { path: '#party-leaders', changefreq: 'weekly', priority: '0.9' },
    { path: '#secretariat-leaders', changefreq: 'weekly', priority: '0.9' },
    { path: '#secretariats', changefreq: 'weekly', priority: '0.9' },
    { path: '#initiatives', changefreq: 'weekly', priority: '0.8' },
    { path: '#news', changefreq: 'daily', priority: '0.9' },
    { path: '#events', changefreq: 'weekly', priority: '0.8' },
    { path: '#gallery', changefreq: 'weekly', priority: '0.7' },
    { path: '#join', changefreq: 'monthly', priority: '0.9' },
    { path: '#contact', changefreq: 'monthly', priority: '0.8' }
  ];

  // Dynamic Secretariats
  const secretariatPages: SitemapEntry[] = (data.specializedSecretariats || [])
    .filter(s => s.isActive)
    .map(s => ({
      path: `#secretariat/${s.slug || s.id}`,
      changefreq: 'weekly',
      priority: '0.8'
    }));

  // Dynamic CMS Pages
  const cmsPages: SitemapEntry[] = (data.pages || [])
    .filter(p => p.isPublished)
    .map(p => ({
      path: `#page/${p.slug || p.id}`,
      changefreq: 'weekly',
      priority: '0.7',
      lastmod: p.updatedAt ? new Date(p.updatedAt).toISOString().split('T')[0] : undefined
    }));

  const allItems: SitemapEntry[] = [...mainPages, ...secretariatPages, ...cmsPages];

  const xmlUrls = allItems
    .map(item => `  <url>
    <loc>${baseUrl}/${item.path}</loc>
    ${item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : ''}
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

// Helper to serve preview HTML with custom Open Graph & Twitter Card tags for shared links (WhatsApp, Facebook, Twitter, Telegram)
function renderOgHtml(options: {
  title: string;
  description: string;
  imageUrl?: string;
  url: string;
  redirectTo?: string;
}): string {
  const indexPath = path.resolve(process.cwd(), 'index.html');
  let html = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : '<!doctype html><html><head></head><body></body></html>';

  const cleanTitle = (options.title || '').replace(/"/g, '&quot;');
  const cleanDesc = (options.description || '').replace(/"/g, '&quot;').replace(/\r?\n/g, ' ').slice(0, 200);
  const cleanImage = options.imageUrl || 'https://ais-pre-5o6jzg5bcobr3p6xsmps5j-492594759043.europe-west2.run.app/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg';
  const cleanUrl = options.url;

  // Replace Title
  html = html.replace(/<title>.*?<\/title>/, `<title>${cleanTitle} | حزب الجبهة الوطنية</title>`);
  // Replace Description
  html = html.replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${cleanDesc}" />`);
  // Replace OG tags
  html = html.replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${cleanTitle} | حزب الجبهة الوطنية" />`);
  html = html.replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${cleanDesc}" />`);
  html = html.replace(/<meta property="og:url" content=".*?" \/>/, `<meta property="og:url" content="${cleanUrl}" />`);
  html = html.replace(/<meta property="og:image" content=".*?" \/>/, `<meta property="og:image" content="${cleanImage}" />`);
  html = html.replace(/<meta property="og:image:secure_url" content=".*?" \/>/, `<meta property="og:image:secure_url" content="${cleanImage}" />`);
  // Replace Twitter tags
  html = html.replace(/<meta name="twitter:title" content=".*?" \/>/, `<meta name="twitter:title" content="${cleanTitle}" />`);
  html = html.replace(/<meta name="twitter:description" content=".*?" \/>/, `<meta name="twitter:description" content="${cleanDesc}" />`);
  html = html.replace(/<meta name="twitter:image" content=".*?" \/>/, `<meta name="twitter:image" content="${cleanImage}" />`);

  if (options.redirectTo) {
    const redirectScript = `<script>
      // Immediate redirect for human browsers to the SPA view
      if (!navigator.userAgent.match(/bot|spider|facebookexternalhit|whatsapp|telegram|twitterbot|pinterest|slackbot/i)) {
        window.location.replace('${options.redirectTo}');
      }
    </script>`;
    html = html.replace('</head>', `${redirectScript}</head>`);
  }

  return html;
}

// Public Open Graph & Direct Landing Route for News Articles (WhatsApp & Facebook rich previews)
app.get('/news/:id', (req: Request, res: Response) => {
  const data = db.get();
  const id = req.params.id;
  const item = (data.news || []).find(n => n.id === id || (n as any).slug === id);
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host') || 'localhost:3000';
  const baseUrl = `${protocol}://${host}`;

  if (!item) {
    return res.redirect('/#news');
  }

  const imageUrl = item.coverImage?.startsWith('http')
    ? item.coverImage
    : (item.coverImage ? `${baseUrl}${item.coverImage.startsWith('/') ? '' : '/'}${item.coverImage}` : undefined);

  const html = renderOgHtml({
    title: item.title,
    description: item.content || item.summary || 'خبر رسمي صادر عن حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
    imageUrl: imageUrl,
    url: `${baseUrl}/news/${id}`,
    redirectTo: `/#news?id=${encodeURIComponent(item.id)}`
  });

  res.type('text/html').send(html);
});

// Public Open Graph & Direct Landing Route for Events
app.get('/events/:id', (req: Request, res: Response) => {
  const data = db.get();
  const id = req.params.id;
  const item = (data.events || []).find(e => e.id === id || (e as any).slug === id);
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host') || 'localhost:3000';
  const baseUrl = `${protocol}://${host}`;

  if (!item) {
    return res.redirect('/#events');
  }

  const imageUrl = item.coverImage?.startsWith('http')
    ? item.coverImage
    : (item.coverImage ? `${baseUrl}${item.coverImage.startsWith('/') ? '' : '/'}${item.coverImage}` : undefined);

  const html = renderOgHtml({
    title: item.title,
    description: item.description || 'فعالية حزبية رسمية – حزب الجبهة الوطنية',
    imageUrl: imageUrl,
    url: `${baseUrl}/events/${id}`,
    redirectTo: `/#events?id=${encodeURIComponent(item.id)}`
  });

  res.type('text/html').send(html);
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

// 5. Sitemap XML generator handled dynamically at /sitemap.xml

// 6. Robots.txt
app.get('/robots.txt', (_req: Request, res: Response) => {
  const host = process.env.APP_URL || 'https://october3rd.nfp.eg';
  res.header('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\nSitemap: ${host}/sitemap.xml\n`);
});

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
  res.json({
    ...data,
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
    appointmentDate: body.appointmentDate || new Date().toISOString().split('T')[0],
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

// --- SPECIALIZED SECRETARIATS MANAGEMENT ---
app.post('/api/admin/secretariats', authenticateAdmin, requirePermission('secretariats'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const body = req.body;

  if (!body.name) {
    return res.status(400).json({ error: 'اسم الأمانة التخصصية إلزامي' });
  }

  const slug = body.slug || body.name.toLowerCase().trim().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-') || ('sec-' + Date.now());
  const newSec = {
    id: 'sec-' + Date.now(),
    name: body.name.trim(),
    slug,
    logoUrl: body.logoUrl || '',
    coverUrl: body.coverUrl || '',
    description: body.description || '',
    duties: Array.isArray(body.duties) ? body.duties : (body.duties ? String(body.duties).split('\n').filter(Boolean) : []),
    goals: Array.isArray(body.goals) ? body.goals : (body.goals ? String(body.goals).split('\n').filter(Boolean) : []),
    secretaryName: body.secretaryName || '',
    secretaryPhotoUrl: body.secretaryPhotoUrl || '',
    assistantSecretaryName: body.assistantSecretaryName || '',
    assistantSecretaryPhotoUrl: body.assistantSecretaryPhotoUrl || '',
    isActive: body.isActive !== false,
    sortOrder: Number(body.sortOrder) || (data.specializedSecretariats.length + 1),
    createdAt: new Date().toISOString()
  };

  data.specializedSecretariats.push(newSec);
  db.save();
  db.addAuditLog(admin.email, admin.name, 'إضافة أمانة تخصصية جديدة', 'SpecializedSecretariat', `تم إنشاء: ${newSec.name}`, newSec.id);
  res.json({ success: true, secretariat: newSec });
});

app.put('/api/admin/secretariats/:id', authenticateAdmin, requirePermission('secretariats'), (req: Request, res: Response) => {
  const admin = (req as any).admin as AdminUser;
  const data = db.get();
  const idx = data.specializedSecretariats.findIndex(s => s.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'الأمانة التخصصية غير موجودة' });
  }

  data.specializedSecretariats[idx] = {
    ...data.specializedSecretariats[idx],
    ...req.body,
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
    data.specializedSecretariats = list;
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
    assignmentDate: body.assignmentDate || new Date().toISOString().split('T')[0],
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
      assignmentDate: new Date().toISOString().split('T')[0],
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
      assignmentDate: new Date().toISOString().split('T')[0]
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
    return res.redirect('/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg');
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
// DYNAMIC SOCIAL SHARE PREVIEW ROUTES (WhatsApp, Facebook, Twitter, Telegram)
// -------------------------------------------------------------
app.get(['/news/:id', '/events/:id'], (req: Request, res: Response, next: NextFunction) => {
  const isNews = req.path.startsWith('/news');
  const id = req.params.id;
  const data = db.get();
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host') || 'localhost:3000';
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;

  let item: any = null;
  if (isNews) {
    item = (data.news || []).find((n: any) => n.id === id || n.slug === id);
  } else {
    item = (data.events || []).find((e: any) => e.id === id || e.slug === id);
  }

  if (!item) {
    return next();
  }

  const title = `${item.title} | حزب الجبهة الوطنية`;
  const description = item.excerpt || item.description || (item.content ? item.content.substring(0, 160) : '') || 'المنصة الرسمية لحزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة';

  // Extract real cover image: check coverImage, imageUrl, or first event image
  const rawImage = isNews ? (item.coverImage || item.imageUrl) : (item.images?.[0] || item.coverUrl || item.imageUrl);
  let imageUrl = '';
  if (rawImage && rawImage.startsWith('data:image/')) {
    imageUrl = `${baseUrl}/api/${isNews ? 'news' : 'events'}/${item.id}/image`;
  } else if (rawImage && (rawImage.startsWith('http://') || rawImage.startsWith('https://'))) {
    imageUrl = rawImage;
  } else if (rawImage && rawImage.startsWith('/')) {
    imageUrl = `${baseUrl}${rawImage}`;
  } else if (rawImage) {
    imageUrl = `${baseUrl}/${rawImage}`;
  } else {
    imageUrl = `${baseUrl}/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg`;
  }

  const pageUrl = `${baseUrl}/${isNews ? 'news' : 'events'}/${item.id}`;
  const redirectTarget = `/#${isNews ? 'news' : 'events'}?id=${item.id}`;

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${pageUrl}" />

    <!-- Open Graph for WhatsApp, Facebook, LinkedIn -->
    <meta property="og:site_name" content="حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:title" content="${escapeHtml(item.title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:secure_url" content="${imageUrl}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(item.title)}" />
    <meta property="og:locale" content="ar_EG" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(item.title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <link rel="image_src" href="${imageUrl}" />

    <!-- Client-side Redirect to interactive SPA for real users -->
    <script>
      window.location.replace("${redirectTarget}");
    </script>
  </head>
  <body style="font-family: Cairo, system-ui, -apple-system, sans-serif; background: #fafaf9; color: #1c1917; text-align: right; padding: 2rem; direction: rtl;">
    <div style="max-width: 680px; margin: 2rem auto; background: white; padding: 2rem; border-radius: 1.5rem; border: 1px solid #e7e5e4; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
      <div style="display: inline-block; background: #fee2e2; color: #b91c1c; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: bold; margin-bottom: 0.75rem;">
        حزب الجبهة الوطنية – ${isNews ? 'الأخبار والبيانات' : 'الفعاليات'}
      </div>
      <h1 style="color: #1c1917; font-size: 1.5rem; font-weight: 800; line-height: 1.4; margin-bottom: 1rem;">
        ${escapeHtml(item.title)}
      </h1>
      ${imageUrl ? `<img src="${imageUrl}" alt="${escapeHtml(item.title)}" style="width: 100%; max-height: 400px; object-fit: cover; border-radius: 1rem; margin-bottom: 1rem;" />` : ''}
      <p style="color: #57534e; font-size: 0.95rem; line-height: 1.7; margin-bottom: 1.5rem;">
        ${escapeHtml(description)}
      </p>
      <a href="${redirectTarget}" style="display: inline-flex; align-items: center; justify-content: center; background: #b91c1c; color: white; padding: 0.75rem 1.5rem; border-radius: 0.75rem; text-decoration: none; font-weight: bold; font-size: 0.9rem;">
        الانتقال إلى قراءة الخبر كاملاً بالمنصة
      </a>
    </div>
  </body>
</html>`;

  res.send(html);
});

// -------------------------------------------------------------
// VITE INTEGRATION & SERVER STARTUP
// -------------------------------------------------------------

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NFP Platform] Server successfully running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[NFP Platform] Failed to start server:', err);
});
