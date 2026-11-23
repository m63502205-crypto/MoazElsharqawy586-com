import { PublicPortalData } from '../types';

export const OFFICIAL_SITE_URL = 'https://nfp-october3.ai.studio';
export const SITE_BRAND_NAME = 'حزب الجبهة الوطنية أمانة قسم ثالث أكتوبر';
export const HOME_TITLE = 'حزب الجبهة الوطنية أمانة قسم ثالث أكتوبر | الموقع الرسمي';
export const HOME_DESCRIPTION =
  'الموقع الرسمي لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة. تابع أخبار الأمانة وقيادات الحزب والأمانات والمبادرات المجتمعية والفعاليات وطلبات الانضمام.';
export const HOME_KEYWORDS =
  'حزب الجبهة الوطنية، أمانة حزب الجبهة الوطنية، قسم ثالث أكتوبر، حزب الجبهة الوطنية قسم ثالث أكتوبر، أمانة ثالث أكتوبر، محافظة الجيزة، مبادرات مجتمعية، طلب عضوية حزب الجبهة الوطنية';

export interface ParsedRoute {
  view: string;
  slug?: string;
  newsId?: string | null;
  eventId?: string | null;
  person?: string | null;
  activity?: number | null;
}

export function getViewPath(
  view: string,
  options?: { slug?: string; newsId?: string | null; eventId?: string | null; person?: string | null; activity?: number | null }
): string {
  switch (view) {
    case 'home':
    case 'gallery':
      return '/';
    case 'about':
      return '/about';
    case 'party-leaders':
      return '/party-leaders';
    case 'secretariat-leaders':
      return '/secretariat-leaders';
    case 'secretariats':
      return '/secretariats';
    case 'secretariat-detail': {
      if (!options?.slug) return '/secretariats';
      const base = `/secretariat/${encodeURIComponent(options.slug)}`;
      return options?.person ? `${base}?person=${encodeURIComponent(options.person)}` : base;
    }
    case 'initiatives':
      return '/initiatives';
    case 'initiative-detail': {
      if (!options?.slug) return '/initiatives';
      const base = `/initiative/${encodeURIComponent(options.slug)}`;
      return typeof options?.activity === 'number' && options.activity >= 0
        ? `${base}?activity=${options.activity}`
        : base;
    }
    case 'news':
      return options?.newsId ? `/news/${encodeURIComponent(options.newsId)}` : '/news';
    case 'events':
      return options?.eventId ? `/events/${encodeURIComponent(options.eventId)}` : '/events';
    case 'live':
      return '/live';
    case 'join':
      return '/join';
    case 'contact':
      return '/contact';
    case 'sitemap':
      return '/sitemap';
    case 'cms-page':
      return options?.slug ? `/page/${encodeURIComponent(options.slug)}` : '/';
    case 'admin':
      return '/#admin';
    default:
      return '/';
  }
}

export function parseLocationToRoute(loc: Location = window.location): ParsedRoute {
  const searchParams = new URLSearchParams(loc.search || '');
  const queryNewsId = searchParams.get('news') || searchParams.get('id');
  if (queryNewsId) {
    return { view: 'news', newsId: queryNewsId };
  }

  const fullHash = (loc.hash || '').replace(/^#\/?/, '').trim();
  if (fullHash) {
    if (fullHash === 'gallery' || fullHash.startsWith('gallery/')) {
      return { view: 'home' };
    }
    if (fullHash === 'admin') {
      return { view: 'admin' };
    }
    if (fullHash.startsWith('page/')) {
      return { view: 'cms-page', slug: decodeURIComponent(fullHash.replace('page/', '')) };
    }
    if (fullHash.startsWith('news')) {
      let nId: string | null = null;
      if (fullHash.includes('?id=')) {
        nId = fullHash.split('?id=')[1]?.split('&')[0] || null;
      } else if (fullHash.includes('/') && fullHash.split('/')[1]) {
        nId = fullHash.split('/')[1] || null;
      }
      return { view: 'news', newsId: nId ? decodeURIComponent(nId) : null };
    }
    if (fullHash.startsWith('events')) {
      let eId: string | null = null;
      if (fullHash.includes('?id=')) {
        eId = fullHash.split('?id=')[1]?.split('&')[0] || null;
      } else if (fullHash.includes('/') && fullHash.split('/')[1]) {
        eId = fullHash.split('/')[1] || null;
      }
      return { view: 'events', eventId: eId ? decodeURIComponent(eId) : null };
    }
    if (fullHash.startsWith('secretariat/')) {
      const rest = fullHash.replace('secretariat/', '');
      const [rawSlug, rawQuery] = rest.split('?');
      const hashPerson = rawQuery ? new URLSearchParams(rawQuery).get('person') : null;
      return {
        view: 'secretariat-detail',
        slug: decodeURIComponent(rawSlug),
        person: hashPerson || searchParams.get('person') || null
      };
    }
    if (fullHash.startsWith('initiative/')) {
      const rest = fullHash.replace('initiative/', '');
      const [rawSlug, rawQuery] = rest.split('?');
      const hashActivity = rawQuery ? new URLSearchParams(rawQuery).get('activity') : searchParams.get('activity');
      const actNum = hashActivity !== null && /^\d+$/.test(hashActivity) ? Number(hashActivity) : null;
      return {
        view: 'initiative-detail',
        slug: decodeURIComponent(rawSlug),
        activity: actNum
      };
    }
    const cleanView = fullHash.split('?')[0].split('/')[0];
    if (
      [
        'home',
        'about',
        'party-leaders',
        'secretariat-leaders',
        'secretariats',
        'initiatives',
        'news',
        'events',
        'live',
        'join',
        'contact',
        'sitemap'
      ].includes(cleanView)
    ) {
      return { view: cleanView };
    }
  }

  const pathname = decodeURIComponent(loc.pathname || '/').replace(/\/+$/, '') || '/';
  if (pathname === '/' || pathname === '/index.html' || pathname === '/home' || pathname === '/gallery') {
    return { view: 'home' };
  }
  if (pathname === '/admin' || pathname === '/login') {
    return { view: 'admin' };
  }
  if (
    [
      '/about',
      '/party-leaders',
      '/secretariat-leaders',
      '/secretariats',
      '/initiatives',
      '/news',
      '/events',
      '/live',
      '/join',
      '/contact',
      '/sitemap'
    ].includes(pathname)
  ) {
    return { view: pathname.slice(1) };
  }
  if (pathname.startsWith('/secretariat/')) {
    return {
      view: 'secretariat-detail',
      slug: pathname.slice('/secretariat/'.length),
      person: searchParams.get('person') || null
    };
  }
  if (pathname.startsWith('/initiative/')) {
    const rawActivity = searchParams.get('activity');
    const actNum = rawActivity !== null && /^\d+$/.test(rawActivity) ? Number(rawActivity) : null;
    return {
      view: 'initiative-detail',
      slug: pathname.slice('/initiative/'.length),
      activity: actNum
    };
  }
  if (pathname.startsWith('/news/')) {
    return { view: 'news', newsId: pathname.slice('/news/'.length) };
  }
  if (pathname.startsWith('/events/')) {
    return { view: 'events', eventId: pathname.slice('/events/'.length) };
  }
  if (pathname.startsWith('/page/')) {
    return { view: 'cms-page', slug: pathname.slice('/page/'.length) };
  }

  return { view: 'home' };
}

function resolveClientShareImage(rawImg: string | undefined, baseSiteUrl: string, fallback: string): string {
  const candidate = (rawImg || '').trim();
  if (!candidate) return fallback;
  if (candidate.startsWith('http://') || candidate.startsWith('https://')) return candidate;
  if (candidate.startsWith('/')) return `${baseSiteUrl}${candidate}`;
  if (candidate.startsWith('data:')) return fallback;
  return `${baseSiteUrl}/${candidate}`;
}

export function getPageSeoMeta(
  view: string,
  data: PublicPortalData | null,
  options?: { slug?: string; newsId?: string | null; eventId?: string | null; person?: string | null; activity?: number | null }
): {
  title: string;
  description: string;
  keywords: string;
  siteName: string;
  canonicalUrl: string;
  ogImage: string;
  ogType: string;
  robots: string;
} {
  const configuredUrl = (data?.settings?.officialSiteUrl || '').trim().replace(/\/+$/, '');
  const baseSiteUrl =
    configuredUrl && (configuredUrl.startsWith('https://') || configuredUrl.startsWith('http://'))
      ? configuredUrl
      : OFFICIAL_SITE_URL;
  const siteTitle = data?.settings?.seoTitle?.trim() || HOME_TITLE;
  const siteBrand = siteTitle.replace(/\s*\|\s*الموقع الرسمي\s*$/, '').trim() || SITE_BRAND_NAME;
  const siteDesc = data?.settings?.seoDescription?.trim() || HOME_DESCRIPTION;
  const siteKeywords = data?.settings?.seoKeywords?.trim() || HOME_KEYWORDS;
  const defaultShareImg = resolveClientShareImage(
    data?.settings?.seoShareImage || data?.settings?.officialLogo,
    baseSiteUrl,
    `${baseSiteUrl}/og-logo.jpg`
  );

  const path = getViewPath(view, options).split('?')[0];
  const canonicalUrl = `${baseSiteUrl}${path === '/#admin' ? '/' : path}`;
  const robots =
    view === 'admin'
      ? 'noindex, nofollow'
      : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

  if (view === 'home') {
    return {
      title: siteTitle,
      description: siteDesc,
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl: `${baseSiteUrl}/`,
      ogImage: defaultShareImg,
      ogType: 'website',
      robots
    };
  }
  if (view === 'about') {
    return {
      title: `عن الحزب والأمانة | ${siteBrand}`,
      description: 'تعرف على رؤية ورسالة ومبادئ حزب الجبهة الوطنية وأمانة قسم ثالث أكتوبر بمحافظة الجيزة ودورها المجتمعي والتنموي.',
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: defaultShareImg,
      ogType: 'website',
      robots
    };
  }
  if (view === 'party-leaders') {
    return {
      title: `قيادات حزب الجبهة الوطنية وأمانة قسم ثالث أكتوبر | ${siteBrand}`,
      description: 'تعرف على قيادات حزب الجبهة الوطنية وقيادات وهيئة مكتب أمانة قسم ثالث أكتوبر بمحافظة الجيزة ودورهم في العمل الوطني والمجتمعي.',
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: defaultShareImg,
      ogType: 'website',
      robots
    };
  }
  if (view === 'secretariat-leaders') {
    return {
      title: `قيادات أمانة قسم ثالث أكتوبر – هيئة المكتب | ${siteBrand}`,
      description: 'قيادات وهيئة مكتب أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.',
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: defaultShareImg,
      ogType: 'website',
      robots
    };
  }
  if (view === 'secretariats') {
    return {
      title: `الأمانات التخصصية والنوعية – قسم ثالث أكتوبر | ${siteBrand}`,
      description: 'استعرض الأمانات التخصصية لحزب الجبهة الوطنية بأمانة قسم ثالث أكتوبر بمحافظة الجيزة ومهامها وأمناءها.',
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: defaultShareImg,
      ogType: 'website',
      robots
    };
  }
  if (view === 'secretariat-detail') {
    const sec = data?.specializedSecretariats?.find(
      s => s.slug === options?.slug || s.id === options?.slug
    );
    const secImg = sec
      ? resolveClientShareImage(sec.coverUrl || sec.logoUrl, baseSiteUrl, defaultShareImg)
      : defaultShareImg;
    return {
      title: sec ? `${sec.name} – أمانة قسم ثالث أكتوبر | ${siteBrand}` : `الأمانات التخصصية | ${siteBrand}`,
      description: sec?.description
        ? `${sec.name} – ${sec.description.slice(0, 140)}`
        : 'تفاصيل ومهام الأمانة التخصصية بأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.',
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: secImg,
      ogType: 'website',
      robots
    };
  }
  if (view === 'initiatives') {
    return {
      title: `المبادرات المجتمعية والتنموية | ${siteBrand}`,
      description: 'تابع المبادرات الميدانية والتنموية لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.',
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: defaultShareImg,
      ogType: 'website',
      robots
    };
  }
  if (view === 'initiative-detail') {
    const init = data?.initiatives?.find(
      i => i.slug === options?.slug || i.id === options?.slug
    );
    const act =
      init && typeof options?.activity === 'number' && options.activity >= 0
        ? init.activities?.[options.activity]
        : null;
    if (act && init) {
      const actImg = resolveClientShareImage(
        act.imageUrl || init.coverUrl || init.galleryImages?.[0] || init.logoUrl,
        baseSiteUrl,
        defaultShareImg
      );
      return {
        title: `${act.title || 'نشاط ميداني'} – ${init.title} | ${siteBrand}`,
        description: (act.description || init.description || siteDesc).slice(0, 160),
        keywords: siteKeywords,
        siteName: SITE_BRAND_NAME,
        canonicalUrl: `${canonicalUrl}?activity=${options?.activity}`,
        ogImage: actImg,
        ogType: 'article',
        robots
      };
    }
    const initImg = init
      ? resolveClientShareImage(init.coverUrl || init.galleryImages?.[0] || init.logoUrl, baseSiteUrl, defaultShareImg)
      : defaultShareImg;
    return {
      title: init ? `${init.title} | ${siteBrand}` : `المبادرات المجتمعية | ${siteBrand}`,
      description: init?.description
        ? init.description.slice(0, 160)
        : 'تفاصيل وأنشطة المبادرة الميدانية لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.',
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: initImg,
      ogType: init ? 'article' : 'website',
      robots
    };
  }
  if (view === 'news') {
    const item = options?.newsId
      ? data?.news?.find(n => n.id === options.newsId || (n as any).slug === options.newsId)
      : null;
    if (item) {
      const newsRawImg = item.coverImage || item.galleryImages?.[0];
      const newsImg = newsRawImg?.startsWith('data:')
        ? `${baseSiteUrl}/api/news/${encodeURIComponent(item.id)}/image`
        : resolveClientShareImage(newsRawImg, baseSiteUrl, defaultShareImg);
      return {
        title: `${item.title} | ${siteBrand}`,
        description: (item.excerpt || item.content || siteDesc).slice(0, 160),
        keywords: siteKeywords,
        siteName: SITE_BRAND_NAME,
        canonicalUrl,
        ogImage: newsImg,
        ogType: 'article',
        robots
      };
    }
    return {
      title: `أخبار وبيانات أمانة قسم ثالث أكتوبر | ${siteBrand}`,
      description: 'آخر الأخبار والبيانات الرسمية والتغطيات الميدانية لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.',
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: defaultShareImg,
      ogType: 'website',
      robots
    };
  }
  if (view === 'events') {
    const ev = options?.eventId
      ? data?.events?.find(e => e.id === options.eventId || (e as any).slug === options.eventId)
      : null;
    if (ev) {
      const evRawImg = ev.coverUrl || ev.coverImage || ev.images?.[0] || ev.galleryImages?.[0];
      const evImg = evRawImg?.startsWith('data:')
        ? `${baseSiteUrl}/api/events/${encodeURIComponent(ev.id)}/image`
        : resolveClientShareImage(evRawImg, baseSiteUrl, defaultShareImg);
      return {
        title: `${ev.title} | ${siteBrand}`,
        description: (ev.description || siteDesc).slice(0, 160),
        keywords: siteKeywords,
        siteName: SITE_BRAND_NAME,
        canonicalUrl,
        ogImage: evImg,
        ogType: 'article',
        robots
      };
    }
    return {
      title: `الفعاليات والأنشطة – أمانة قسم ثالث أكتوبر | ${siteBrand}`,
      description: 'جدول الفعاليات واللقاءات والندوات والقوافل لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.',
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: defaultShareImg,
      ogType: 'website',
      robots
    };
  }
  if (view === 'live') {
    return {
      title: `البث المباشر | ${siteBrand}`,
      description: 'تابع البث المباشر لفعاليات ومؤتمرات أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.',
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: defaultShareImg,
      ogType: 'website',
      robots
    };
  }
  if (view === 'join') {
    return {
      title: `طلب العضوية والانضمام | ${siteBrand}`,
      description: 'التقديم الإلكتروني لعضوية حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة والاستعلام عن حالة الطلب.',
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: defaultShareImg,
      ogType: 'website',
      robots
    };
  }
  if (view === 'contact') {
    return {
      title: `تواصل معنا ومقر الأمانة | ${siteBrand}`,
      description: 'طرق التواصل المباشرة ومقر أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة وأرقام الهاتف والواتساب والخريطة.',
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: defaultShareImg,
      ogType: 'website',
      robots
    };
  }
  if (view === 'sitemap') {
    return {
      title: `خريطة الموقع الكاملة | ${siteBrand}`,
      description: 'دليل وخريطة جميع صفحات الموقع الرسمي لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر من أمانات تخصصية ومبادرات وأخبار وفعاليات.',
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: defaultShareImg,
      ogType: 'website',
      robots
    };
  }
  if (view === 'cms-page') {
    const page = data?.pages?.find(p => p.slug === options?.slug);
    const pageImg = page?.coverImage
      ? resolveClientShareImage(page.coverImage, baseSiteUrl, defaultShareImg)
      : defaultShareImg;
    return {
      title: page?.title ? `${page.title} | ${siteBrand}` : siteTitle,
      description: page?.metaDescription || page?.subtitle || (page?.content || siteDesc).slice(0, 160),
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl,
      ogImage: pageImg,
      ogType: 'article',
      robots
    };
  }
  if (view === 'admin') {
    return {
      title: `لوحة التحكم | ${siteBrand}`,
      description: siteDesc,
      keywords: siteKeywords,
      siteName: SITE_BRAND_NAME,
      canonicalUrl: `${baseSiteUrl}/`,
      ogImage: defaultShareImg,
      ogType: 'website',
      robots: 'noindex, nofollow'
    };
  }

  return {
    title: siteTitle,
    description: siteDesc,
    keywords: siteKeywords,
    siteName: SITE_BRAND_NAME,
    canonicalUrl: `${baseSiteUrl}/`,
    ogImage: defaultShareImg,
    ogType: 'website',
    robots
  };
}
