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

function MainApp() {
  const [currentView, setCurrentView] = useState<string>('home');
  const [selectedSlug, setSelectedSlug] = useState<string>('about');
  const [selectedNewsId, setSelectedNewsId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [data, setData] = useState<PublicPortalData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  // Initialize or re-configure Google Analytics when site settings are loaded
  useEffect(() => {
    if (data?.settings?.googleAnalyticsId) {
      initGoogleAnalytics(data.settings.googleAnalyticsId);
    }
  }, [data?.settings?.googleAnalyticsId]);

  // Track page views in Google Analytics on route/view changes
  useEffect(() => {
    const titles: Record<string, string> = {
      home: 'الرئيسية | حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
      about: 'عن الحزب والأمانة | حزب الجبهة الوطنية',
      'party-leaders': 'قيادات الحزب المركزية | حزب الجبهة الوطنية',
      'secretariat-leaders': 'قيادات الأمانة | حزب الجبهة الوطنية – قسم ثالث أكتوبر',
      secretariats: 'الأمانات التخصصية | حزب الجبهة الوطنية – قسم ثالث أكتوبر',
      initiatives: 'المبادرات التنموية والمجتمعية | حزب الجبهة الوطنية',
      news: 'الأخبار والبيانات الصحفية | حزب الجبهة الوطنية',
      events: 'الفعاليات والمؤتمرات | حزب الجبهة الوطنية',
      gallery: 'معرض الصور والوسائط | حزب الجبهة الوطنية',
      join: 'طلب الانضمام والعضوية | حزب الجبهة الوطنية',
      contact: 'اتصل بنا ومقر الأمانة | حزب الجبهة الوطنية',
      admin: 'لوحة التحكم المركزية | حزب الجبهة الوطنية'
    };

    const path = currentView === 'cms-page' && selectedSlug ? `#page/${selectedSlug}` : `#${currentView}`;
    const pageTitle = currentView === 'cms-page' && selectedSlug
      ? `${data?.pages?.find(p => p.slug === selectedSlug)?.title || 'صفحة'} | حزب الجبهة الوطنية`
      : (titles[currentView] || 'حزب الجبهة الوطنية');

    trackPageView(path, pageTitle);
  }, [currentView, selectedSlug, data]);

  // Sync view from hash on mount or when hash changes
  useEffect(() => {
    const handleHash = () => {
      // Check query parameters for direct links
      if (typeof window !== 'undefined' && window.location.search) {
        const searchParams = new URLSearchParams(window.location.search);
        const searchNewsId = searchParams.get('news') || searchParams.get('id');
        if (searchNewsId) {
          setSelectedNewsId(searchNewsId);
          setCurrentView('news');
        }
      }

      const fullHash = window.location.hash.replace(/^#\/?/, '');
      if (!fullHash) return;

      if (fullHash.startsWith('page/')) {
        const slug = fullHash.replace('page/', '');
        setSelectedSlug(slug);
        setCurrentView('cms-page');
        return;
      }

      if (fullHash === 'admin') {
        setCurrentView('admin');
        return;
      }

      // News route with ID: #news?id=xxx or #news/xxx or #news
      if (fullHash.startsWith('news')) {
        let nId: string | null = null;
        if (fullHash.includes('?id=')) {
          nId = fullHash.split('?id=')[1]?.split('&')[0] || null;
        } else if (fullHash.includes('/') && fullHash.split('/')[1]) {
          nId = fullHash.split('/')[1] || null;
        }
        setCurrentView('news');
        if (nId) {
          setSelectedNewsId(nId);
        }
        return;
      }

      // Events route with ID: #events?id=xxx or #events/xxx or #events
      if (fullHash.startsWith('events')) {
        let eId: string | null = null;
        if (fullHash.includes('?id=')) {
          eId = fullHash.split('?id=')[1]?.split('&')[0] || null;
        } else if (fullHash.includes('/') && fullHash.split('/')[1]) {
          eId = fullHash.split('/')[1] || null;
        }
        setCurrentView('events');
        if (eId) {
          setSelectedEventId(eId);
        }
        return;
      }

      // Single secretariat route: #secretariat/slug
      if (fullHash.startsWith('secretariat/')) {
        const secSlug = fullHash.replace('secretariat/', '');
        setSelectedSlug(secSlug);
        setCurrentView('secretariat-detail');
        return;
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
          'gallery',
          'join',
          'contact'
        ].includes(cleanView)
      ) {
        setCurrentView(cleanView);
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Update hash when currentView changes
  const handleSetCurrentView = (view: string) => {
    setCurrentView(view);
    if (view === 'admin') {
      window.location.hash = 'admin';
    } else if (view === 'cms-page' && selectedSlug) {
      window.location.hash = `page/${selectedSlug}`;
    } else {
      window.location.hash = view;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        onBackToSite={() => handleSetCurrentView('home')}
        onRefreshPublicData={loadData}
      />
    );
  }

  // Public View
  return (
    <div className="min-h-screen bg-stone-50 flex flex-col selection:bg-red-700 selection:text-white" dir="rtl">
      <Navbar
        currentView={currentView}
        setCurrentView={handleSetCurrentView}
        officialLogo={data.settings.officialLogo}
        slogan={data.settings.slogan}
      />

      <main className="flex-1">
        <PublicPages
          currentView={currentView}
          setCurrentView={handleSetCurrentView}
          data={data}
          onRefreshData={loadData}
          selectedSlug={selectedSlug}
          setSelectedSlug={setSelectedSlug}
          selectedNewsId={selectedNewsId}
          onClearSelectedNewsId={() => setSelectedNewsId(null)}
        />
      </main>

      <Footer
        settings={data.settings}
        setCurrentView={handleSetCurrentView}
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
