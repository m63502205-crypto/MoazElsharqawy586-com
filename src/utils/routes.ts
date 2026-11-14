import { PublicPortalData } from '../types';

export const OFFICIAL_SITE_URL = 'https://nfp-october3.ai.studio';
export const HOME_TITLE = 'حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر';
export const HOME_DESCRIPTION =
  'الموقع الرسمي لحزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة. تابع قيادات الحزب والأمانة والأخبار والمبادرات والفعاليات وطلبات الانضمام.';

export interface ParsedRoute {
  view: string;
  slug?: string;
  newsId?: string | null;
  eventId?: string | null;
}

export function getViewPath(
  view: string,
  options?: { slug?: string; newsId?: string | null; eventId?: string | null }
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
    case 'secretariat-detail':
      return options?.slug ? `/secretariat/${encodeURIComponent(options.slug)}` : '/secretariats';
    case 'initiatives':
      return '/initiatives';
    case 'initiative-detail':
      return options?.slug ? `/initiative/${encodeURIComponent(options.slug)}` : '/initiatives';
    case 'news':
      return options?.newsId ? `/news/${encodeURIComponent(options.newsId)}` : '/news';
    case 'events':
      return options?.eventId ? `/events/${encodeURIComponent(options.eventId)}` : '/events';
    case 'join':
      return '/join';
    case 'contact':
      return '/contact';
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
      return {
        view: 'secretariat-detail',
        slug: decodeURIComponent(fullHash.replace('secretariat/', ''))
      };
    }
    if (fullHash.startsWith('initiative/')) {
      return {
        view: 'initiative-detail',
        slug: decodeURIComponent(fullHash.replace('initiative/', ''))
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
        'join',
        'contact'
      ].includes(cleanView)
    ) {
      return { view: cleanView };
    }
  }

  const pathname = decodeURIComponent(loc.pathname || '/').replace(/\/+$/, '') || '/';
  if (pathname === '/' || pathname === '/index.html' || pathname === '/home' || pathname === '/gallery') {
    return { view: 'home' };
  }
  if (pathname === '/admin') {
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
      '/join',
      '/contact'
    ].includes(pathname)
  ) {
    return { view: pathname.slice(1) };
  }
  if (pathname.startsWith('/secretariat/')) {
    return { view: 'secretariat-detail', slug: pathname.slice('/secretariat/'.length) };
  }
  if (pathname.startsWith('/initiative/')) {
    return { view: 'initiative-detail', slug: pathname.slice('/initiative/'.length) };
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

export function getPageSeoMeta(
  view: string,
  data: PublicPortalData | null,
  options?: { slug?: string; newsId?: string | null; eventId?: string | null }
): { title: string; description: string; canonicalUrl: string; robots: string } {
  const path = getViewPath(view, options);
  const canonicalUrl = `${OFFICIAL_SITE_URL}${path === '/#admin' ? '/' : path}`;
  const robots =
    view === 'admin'
      ? 'noindex, nofollow'
      : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

  if (view === 'home') {
    return { title: HOME_TITLE, description: HOME_DESCRIPTION, canonicalUrl: `${OFFICIAL_SITE_URL}/`, robots };
  }
  if (view === 'about') {
    return {
      title: 'عن الحزب والأمانة | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
      description: 'تعرف على رؤية ورسالة ومبادئ حزب الجبهة الوطنية وأمانة قسم ثالث أكتوبر بمحافظة الجيزة ودورها المجتمعي والتنموي.',
      canonicalUrl,
      robots
    };
  }
  if (view === 'party-leaders') {
    return {
      title: 'القيادات | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
      description: 'تعرف على قيادات حزب الجبهة الوطنية وقيادات وهيئة مكتب أمانة قسم ثالث أكتوبر بمحافظة الجيزة ودورهم في العمل الوطني والمجتمعي.',
      canonicalUrl,
      robots
    };
  }
  if (view === 'secretariat-leaders') {
    return {
      title: 'قيادات أمانة قسم ثالث أكتوبر | حزب الجبهة الوطنية',
      description: 'قيادات وهيئة مكتب أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.',
      canonicalUrl,
      robots
    };
  }
  if (view === 'secretariats') {
    return {
      title: 'الأمانات التخصصية | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
      description: 'استعرض الأمانات التخصصية لحزب الجبهة الوطنية بأمانة قسم ثالث أكتوبر بمحافظة الجيزة ومهامها وأمناءها.',
      canonicalUrl,
      robots
    };
  }
  if (view === 'secretariat-detail') {
    const sec = data?.specializedSecretariats?.find(
      s => s.slug === options?.slug || s.id === options?.slug
    );
    return {
      title: sec
        ? `${sec.name} | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر`
        : 'الأمانات التخصصية | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
      description: sec?.description
        ? `${sec.name} بحزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر: ${sec.description.slice(0, 140)}`
        : 'تفاصيل ومهام الأمانة التخصصية بحزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة.',
      canonicalUrl,
      robots
    };
  }
  if (view === 'initiatives') {
    return {
      title: 'المبادرات المجتمعية والتنموية | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
      description: 'تابع المبادرات الميدانية والتنموية لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.',
      canonicalUrl,
      robots
    };
  }
  if (view === 'initiative-detail') {
    const init = data?.initiatives?.find(
      i => i.slug === options?.slug || i.id === options?.slug
    );
    return {
      title: init
        ? `${init.title} | مبادرات حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر`
        : 'المبادرات | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
      description: init?.description
        ? init.description.slice(0, 160)
        : 'تفاصيل وأنشطة المبادرة الميدانية لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.',
      canonicalUrl,
      robots
    };
  }
  if (view === 'news') {
    const item = options?.newsId
      ? data?.news?.find(n => n.id === options.newsId || (n as any).slug === options.newsId)
      : null;
    if (item) {
      return {
        title: `${item.title} | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر`,
        description: (item.excerpt || item.content || HOME_DESCRIPTION).slice(0, 160),
        canonicalUrl,
        robots
      };
    }
    return {
      title: 'الأخبار والبيانات الرسمية | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
      description: 'آخر الأخبار والبيانات الرسمية والتغطيات الميدانية لحزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة.',
      canonicalUrl,
      robots
    };
  }
  if (view === 'events') {
    const ev = options?.eventId
      ? data?.events?.find(e => e.id === options.eventId || (e as any).slug === options.eventId)
      : null;
    if (ev) {
      return {
        title: `${ev.title} | فعاليات حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر`,
        description: (ev.description || HOME_DESCRIPTION).slice(0, 160),
        canonicalUrl,
        robots
      };
    }
    return {
      title: 'الفعاليات والأنشطة | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
      description: 'جدول الفعاليات واللقاءات والندوات والقوافل لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة.',
      canonicalUrl,
      robots
    };
  }
  if (view === 'join') {
    return {
      title: 'طلب الانضمام والعضوية | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
      description: 'التقديم الإلكتروني لعضوية حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة والاستعلام عن حالة الطلب.',
      canonicalUrl,
      robots
    };
  }
  if (view === 'contact') {
    return {
      title: 'تواصل معنا ومقر الأمانة | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
      description: 'طرق التواصل المباشرة ومقر حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة وأرقام الهاتف والواتساب والخريطة.',
      canonicalUrl,
      robots
    };
  }
  if (view === 'cms-page') {
    const page = data?.pages?.find(p => p.slug === options?.slug);
    return {
      title: page?.title
        ? `${page.title} | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر`
        : HOME_TITLE,
      description: page?.metaDescription || page?.subtitle || (page?.content || HOME_DESCRIPTION).slice(0, 160),
      canonicalUrl,
      robots
    };
  }
  if (view === 'admin') {
    return {
      title: 'لوحة التحكم | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
      description: HOME_DESCRIPTION,
      canonicalUrl: `${OFFICIAL_SITE_URL}/`,
      robots: 'noindex, nofollow'
    };
  }

  return { title: HOME_TITLE, description: HOME_DESCRIPTION, canonicalUrl: `${OFFICIAL_SITE_URL}/`, robots };
}
