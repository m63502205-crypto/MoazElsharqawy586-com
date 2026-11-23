/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { PublicPages } from './components/PublicPages';
import { AdminPanel } from './components/AdminPanel';
import { api } from './api';
import { PublicPortalData } from './types';
import { Loader2 } from 'lucide-react';
import { initGoogleAnalytics, trackPageView, DEFAULT_GA4_MEASUREMENT_ID } from './utils/analytics';
import { SiteSearchModal, SearchResultItem } from './components/SiteSearchModal';
import { resolvePersonInSecretariats } from './utils/personSecretariat';
import { PullToRefresh } from './components/PullToRefresh';

import {
  getViewPath,
  parseLocationToRoute,
  getPageSeoMeta
} from './utils/routes';
import { subscribePublicFirestoreChanges } from './utils/firestoreSync';

let cachedBootstrappedData: PublicPortalData | null | undefined = undefined;

function readBootstrappedPublicData(): PublicPortalData | null {
  if (cachedBootstrappedData !== undefined) {
    return cachedBootstrappedData;
  }
  if (typeof document === 'undefined') {
    cachedBootstrappedData = null;
    return null;
  }
  try {
    const el = document.getElementById('__NFP_INITIAL_DATA__');
    if (!el || !el.textContent) {
      cachedBootstrappedData = null;
      return null;
    }
    const parsed = JSON.parse(el.textContent);
    if (parsed && typeof parsed === 'object' && parsed.settings) {
      cachedBootstrappedData = parsed as PublicPortalData;
      return cachedBootstrappedData;
    }
  } catch {
    // Ignore malformed bootstrap payload and fall back to /api/public/data
  }
  cachedBootstrappedData = null;
  return null;
}

function MainApp() {
  const bootstrappedData = readBootstrappedPublicData();
  const initialRoute = typeof window !== 'undefined' ? parseLocationToRoute(window.location) : { view: 'home' };
  const [currentView, setCurrentView] = useState<string>(initialRoute.view || 'home');
  const [selectedSlug, setSelectedSlug] = useState<string>(initialRoute.slug || 'about');
  const [selectedNewsId, setSelectedNewsId] = useState<string | null>(initialRoute.newsId || null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialRoute.eventId || null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(initialRoute.person || null);
  const [selectedActivityIndex, setSelectedActivityIndex] = useState<number | null>(
    typeof initialRoute.activity === 'number' ? initialRoute.activity : null
  );
  const [data, setData] = useState<PublicPortalData | null>(bootstrappedData);
  const [loading, setLoading] = useState<boolean>(!bootstrappedData);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);

  const dataSnapshotRef = useRef<string>('');
  useEffect(() => {
    dataSnapshotRef.current = data ? JSON.stringify(data) : '';
  }, [data]);

  const loadData = async (silent = false) => {
    try {
      const portal = await api.getPublicData();
      const nextSerialized = JSON.stringify(portal);
      if (nextSerialized !== dataSnapshotRef.current) {
        dataSnapshotRef.current = nextSerialized;
        setData(portal);
      }
      setLoadError(null);
    } catch (err: any) {
      if (!silent) {
        console.error('Failed to load public portal data:', err);
        setData(prev => {
          if (!prev) {
            setLoadError('تعذر تحميل بيانات المنصة، يرجى المحاولة لاحقاً');
          }
          return prev;
        });
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData(false);
    const unsub = subscribePublicFirestoreChanges(() => {
      loadData(true);
    });
    return () => unsub();
  }, []);

  // Global search shortcut (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const lastTrackedRouteRef = useRef<string | null>(null);

  // Initialize Google Analytics 4 immediately with default or configured Measurement ID
  useEffect(() => {
    const measurementId = data?.settings?.googleAnalyticsId?.trim() || DEFAULT_GA4_MEASUREMENT_ID;
    initGoogleAnalytics(measurementId);
  }, [data?.settings?.googleAnalyticsId]);

  // Dynamically update Document Title, Meta Description, Keywords, Canonical, Robots, OpenGraph, Twitter & GA PageView
  useEffect(() => {
    const seo = getPageSeoMeta(currentView, data, {
      slug: selectedSlug,
      newsId: selectedNewsId,
      eventId: selectedEventId,
      person: selectedPerson,
      activity: selectedActivityIndex
    });

    document.title = seo.title;

    const setMeta = (selector: string, attr: string, attrVal: string, content: string) => {
      let el = document.querySelector(selector) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, attrVal);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('meta[name="description"]', 'name', 'description', seo.description);
    setMeta('meta[name="keywords"]', 'name', 'keywords', seo.keywords);
    setMeta('meta[name="robots"]', 'name', 'robots', seo.robots);
    setMeta('meta[name="googlebot"]', 'name', 'googlebot', seo.robots);
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', seo.siteName);
    setMeta('meta[property="og:type"]', 'property', 'og:type', seo.ogType);
    setMeta('meta[property="og:title"]', 'property', 'og:title', seo.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', seo.description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', seo.canonicalUrl);
    setMeta('meta[property="og:image"]', 'property', 'og:image', seo.ogImage);
    setMeta('meta[property="og:image:secure_url"]', 'property', 'og:image:secure_url', seo.ogImage);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', seo.title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', seo.description);
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', seo.ogImage);

    let canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', seo.canonicalUrl);

    if (!loading) {
      const path = getViewPath(currentView, {
        slug: selectedSlug,
        newsId: selectedNewsId,
        eventId: selectedEventId,
        person: selectedPerson,
        activity: selectedActivityIndex
      });
      const trackingKey = `${path}::${seo.title}`;
      if (lastTrackedRouteRef.current !== trackingKey) {
        lastTrackedRouteRef.current = trackingKey;
        trackPageView(path, seo.title);
      }
    }
  }, [currentView, selectedSlug, selectedNewsId, selectedEventId, selectedPerson, selectedActivityIndex, data, loading]);

  // Sync view from browser history (popstate) and legacy hash links (hashchange)
  useEffect(() => {
    const syncRoute = () => {
      const parsed = parseLocationToRoute(window.location);
      setCurrentView(parsed.view);
      if (parsed.slug) setSelectedSlug(parsed.slug);
      setSelectedNewsId(parsed.newsId || null);
      setSelectedEventId(parsed.eventId || null);
      setSelectedPerson(parsed.person || null);
      setSelectedActivityIndex(typeof parsed.activity === 'number' ? parsed.activity : null);
    };

    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  // Unified SPA navigation updating clean crawlable URL via pushState
  const navigateTo = (
    view: string,
    options?: { slug?: string; newsId?: string | null; eventId?: string | null; person?: string | null; activity?: number | null }
  ) => {
    if (view === 'gallery') view = 'home';

    const prevView = currentView;
    const nextSlug = options?.slug ?? selectedSlug;
    const nextNewsId = options && 'newsId' in options ? options.newsId : null;
    const nextEventId = options && 'eventId' in options ? options.eventId : null;
    const nextPerson = options && 'person' in options ? options.person : null;
    const nextActivity = options && 'activity' in options && typeof options.activity === 'number' ? options.activity : null;

    if (options?.slug) setSelectedSlug(options.slug);
    setSelectedNewsId(nextNewsId || null);
    setSelectedEventId(nextEventId || null);
    setSelectedPerson(nextPerson || null);
    setSelectedActivityIndex(nextActivity);
    setCurrentView(view);

    const targetUrl = getViewPath(view, {
      slug: nextSlug,
      newsId: nextNewsId,
      eventId: nextEventId,
      person: nextPerson,
      activity: nextActivity
    });

    if (typeof window !== 'undefined') {
      const currentFull = window.location.pathname + window.location.search + window.location.hash;
      if (currentFull !== targetUrl) {
        window.history.pushState(null, '', targetUrl);
      }
    }
    if (prevView !== view) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSetCurrentView = (view: string) => {
    navigateTo(view);
  };

  const handleSelectSearchResult = (res: SearchResultItem) => {
    setSearchOpen(false);
    if (res.type === 'news') {
      navigateTo('news', { newsId: res.rawItem.id });
    } else if (res.type === 'event') {
      navigateTo('events', { eventId: res.rawItem.id });
    } else if (res.type === 'initiative') {
      navigateTo('initiative-detail', { slug: res.rawItem.slug || res.rawItem.id });
    } else if (res.type === 'secretariat') {
      navigateTo('secretariat-detail', { slug: res.rawItem.slug || res.rawItem.id });
    } else if (res.type === 'leader') {
      const matched = data
        ? resolvePersonInSecretariats({
            name: res.rawItem?.name,
            personKey: res.rawItem?.id || res.rawItem?.name,
            explicitSecretariatId: res.rawItem?.specializedSecretariatId,
            requireExplicitSecretariat: true,
            specializedSecretariats: data.specializedSecretariats,
            secretariatMembers: data.secretariatMembers,
            secretariatLeaders: data.secretariatLeaders,
            partyLeaders: data.partyLeaders
          })
        : null;
      if (matched) {
        navigateTo('secretariat-detail', {
          slug: matched.secretariat.slug,
          person: matched.personKey
        });
      } else if (res.typeLabel.includes('أكتوبر') || res.rawItem.secretariatName) {
        navigateTo('secretariat-leaders');
      } else {
        navigateTo('party-leaders');
      }
    } else if (res.type === 'page') {
      navigateTo('cms-page', { slug: res.rawItem.slug });
    } else if (res.type === 'join') {
      navigateTo('join');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4 text-center space-y-4">
        <div className="w-16 h-16 bg-red-700 text-amber-300 rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
        <div>
          <h2 className="text-xl font-black text-stone-900">حزب الجبهة الوطنية</h2>
          <p className="text-xs text-stone-500 mt-1">أمانة قسم ثالث أكتوبر – محافظة الجيزة</p>
        </div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4 text-center space-y-4">
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl max-w-md">
          <p className="text-sm font-bold">{loadError || 'خطأ في الاتصال بالخادم'}</p>
          <button
            onClick={() => {
              setLoading(true);
              loadData();
            }}
            className="mt-4 bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer hover:bg-red-800"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  // Admin View
  if (currentView === 'admin') {
    return (
      <AdminPanel
        onBackToSite={() => navigateTo('home')}
        onRefreshPublicData={loadData}
      />
    );
  }

  // Public View
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col selection:bg-red-700 selection:text-white w-full max-w-full overflow-x-hidden" dir="rtl">
      <Navbar
        currentView={currentView}
        setCurrentView={handleSetCurrentView}
        officialLogo={data.settings.officialLogo}
        slogan={data.settings.slogan}
        onOpenSearch={() => setSearchOpen(true)}
        urgentNews={data.news.filter(n => n.isUrgent)}
        liveStream={data.liveStream}
        onSelectNews={(item) => navigateTo('news', { newsId: item.id })}
      />

      <PullToRefresh onRefresh={loadData}>
        <main className="flex-1 w-full max-w-full overflow-x-hidden">
        <PublicPages
          currentView={currentView}
          setCurrentView={handleSetCurrentView}
          onNavigate={navigateTo}
          data={data}
          onRefreshData={loadData}
          selectedSlug={selectedSlug}
          setSelectedSlug={setSelectedSlug}
          selectedNewsId={selectedNewsId}
          selectedEventId={selectedEventId}
          selectedPerson={selectedPerson}
          selectedActivityIndex={selectedActivityIndex}
          onClearSelectedNewsId={() => {
            setSelectedNewsId(null);
            if (typeof window !== 'undefined' && window.location.pathname.startsWith('/news/')) {
              window.history.pushState(null, '', '/news');
            }
          }}
          onClearSelectedEventId={() => {
            setSelectedEventId(null);
            if (typeof window !== 'undefined' && window.location.pathname.startsWith('/events/')) {
              window.history.pushState(null, '', '/events');
            }
          }}
          onClearSelectedActivityIndex={() => {
            setSelectedActivityIndex(null);
            if (typeof window !== 'undefined' && window.location.pathname.startsWith('/initiative/') && window.location.search.includes('activity=')) {
              window.history.pushState(null, '', window.location.pathname);
            }
          }}
        />
        </main>
      </PullToRefresh>

      <Footer
        settings={data.settings}
        setCurrentView={handleSetCurrentView}
      />

      {/* Site-wide Search Modal */}
      <SiteSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        data={data}
        onSelectResult={handleSelectSearchResult}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
