/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { PublicPages } from './components/PublicPages';
import { AdminPanel } from './components/AdminPanel';
import { api } from './api';
import { PublicPortalData } from './types';
import { Loader2 } from 'lucide-react';
import { initGoogleAnalytics, trackPageView } from './utils/analytics';
import { SiteSearchModal, SearchResultItem } from './components/SiteSearchModal';

import {
  getViewPath,
  parseLocationToRoute,
  getPageSeoMeta
} from './utils/routes';

function MainApp() {
  const initialRoute = typeof window !== 'undefined' ? parseLocationToRoute(window.location) : { view: 'home' };
  const [currentView, setCurrentView] = useState<string>(initialRoute.view || 'home');
  const [selectedSlug, setSelectedSlug] = useState<string>(initialRoute.slug || 'about');
  const [selectedNewsId, setSelectedNewsId] = useState<string | null>(initialRoute.newsId || null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialRoute.eventId || null);
  const [data, setData] = useState<PublicPortalData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);

  const loadData = async () => {
    try {
      const portal = await api.getPublicData();
      setData(portal);
      setLoadError(null);
    } catch (err: any) {
      console.error('Failed to load public portal data:', err);
      setLoadError('تعذر تحميل بيانات المنصة، يرجى المحاولة لاحقاً');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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

  // Initialize or re-configure Google Analytics when site settings are loaded
  useEffect(() => {
    if (data?.settings?.googleAnalyticsId) {
      initGoogleAnalytics(data.settings.googleAnalyticsId);
    }
  }, [data?.settings?.googleAnalyticsId]);

  // Dynamically update Document Title, Meta Description, Canonical, Robots, OpenGraph & GA PageView on route changes
  useEffect(() => {
    const seo = getPageSeoMeta(currentView, data, {
      slug: selectedSlug,
      newsId: selectedNewsId,
      eventId: selectedEventId
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
    setMeta('meta[name="robots"]', 'name', 'robots', seo.robots);
    setMeta('meta[property="og:title"]', 'property', 'og:title', seo.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', seo.description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', seo.canonicalUrl);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', seo.title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', seo.description);

    let canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', seo.canonicalUrl);

    const path = getViewPath(currentView, {
      slug: selectedSlug,
      newsId: selectedNewsId,
      eventId: selectedEventId
    });
    trackPageView(path, seo.title);
  }, [currentView, selectedSlug, selectedNewsId, selectedEventId, data]);

  // Sync view from browser history (popstate) and legacy hash links (hashchange)
  useEffect(() => {
    const syncRoute = () => {
      const parsed = parseLocationToRoute(window.location);
      setCurrentView(parsed.view);
      if (parsed.slug) setSelectedSlug(parsed.slug);
      setSelectedNewsId(parsed.newsId || null);
      setSelectedEventId(parsed.eventId || null);
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
    options?: { slug?: string; newsId?: string | null; eventId?: string | null }
  ) => {
    if (view === 'gallery') view = 'home';

    const nextSlug = options?.slug ?? selectedSlug;
    const nextNewsId = options && 'newsId' in options ? options.newsId : null;
    const nextEventId = options && 'eventId' in options ? options.eventId : null;

    if (options?.slug) setSelectedSlug(options.slug);
    setSelectedNewsId(nextNewsId || null);
    setSelectedEventId(nextEventId || null);
    setCurrentView(view);

    const targetUrl = getViewPath(view, {
      slug: nextSlug,
      newsId: nextNewsId,
      eventId: nextEventId
    });

    if (typeof window !== 'undefined') {
      const currentFull = window.location.pathname + window.location.hash;
      if (currentFull !== targetUrl) {
        window.history.pushState(null, '', targetUrl);
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      if (res.typeLabel.includes('أكتوبر') || res.rawItem.secretariatName) {
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
    <div className="min-h-screen bg-stone-50 flex flex-col selection:bg-red-700 selection:text-white w-full max-w-full overflow-x-hidden" dir="rtl">
      <Navbar
        currentView={currentView}
        setCurrentView={handleSetCurrentView}
        officialLogo={data.settings.officialLogo}
        slogan={data.settings.slogan}
        onOpenSearch={() => setSearchOpen(true)}
      />

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
          onClearSelectedNewsId={() => {
            setSelectedNewsId(null);
            if (typeof window !== 'undefined' && window.location.pathname.startsWith('/news/')) {
              window.history.pushState(null, '', '/news');
            }
          }}
        />
      </main>

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
