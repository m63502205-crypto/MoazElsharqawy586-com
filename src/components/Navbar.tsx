import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  X,
  HeartHandshake,
  Search,
  ChevronDown,
  ChevronLeft,
  Radio,
  Zap,
  LayoutGrid,
  Building2,
  Award,
  Newspaper,
  Calendar,
  Sparkles
} from 'lucide-react';
import { NewsItem, LiveStream } from '../types';
import { getViewPath } from '../utils/routes';

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  officialLogo: string;
  slogan: string;
  onOpenSearch?: () => void;
  urgentNews?: NewsItem[];
  liveStream?: LiveStream;
  onSelectNews?: (item: NewsItem) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  officialLogo,
  slogan,
  onOpenSearch,
  urgentNews = [],
  liveStream,
  onSelectNews
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const sectionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (sectionsRef.current && !sectionsRef.current.contains(e.target as Node)) {
        setSectionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const primaryLinks = [
    { id: 'home', label: 'الرئيسية' },
    { id: 'about', label: 'عن الحزب' },
    { id: 'party-leaders', label: 'القيادات' },
    { id: 'secretariats', label: 'الأمانات' },
    { id: 'initiatives', label: 'المبادرات' },
    { id: 'news', label: 'الأخبار' },
    { id: 'events', label: 'الفعاليات' },
    { id: 'join', label: 'استمارة التقديم' },
    { id: 'contact', label: 'تواصل معنا' }
  ];

  const sectionItems = [
    {
      id: 'live',
      label: 'البث المباشر',
      sublabel: liveStream?.isActive ? 'بث حي نشط الآن' : 'بث وفعاليات الأمانة',
      icon: Radio,
      isLive: Boolean(liveStream?.isActive)
    },
    { id: 'secretariats', label: 'الأمانات التخصصية', sublabel: 'الهيكل والأعضاء والتشكيلات', icon: Building2, isLive: false },
    { id: 'party-leaders', label: 'قيادات الحزب والأمانة', sublabel: 'الهيئة العليا وقيادات أكتوبر', icon: Award, isLive: false },
    { id: 'initiatives', label: 'المبادرات المجتمعية', sublabel: 'العمل الميداني والتنموي', icon: Sparkles, isLive: false },
    { id: 'news', label: 'الأخبار والبيانات', sublabel: 'المركز الإعلامي والتصريحات', icon: Newspaper, isLive: false },
    { id: 'events', label: 'الفعاليات والأنشطة', sublabel: 'اللقاءات والندوات والقوافل', icon: Calendar, isLive: false }
  ];

  const handleNav = (view: string) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
    setSectionsOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeUrgent = urgentNews[0] || null;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-xs">
      {/* Topmost Urgent News Banner Emblem (فوق خالص على شكل شعار/شريط للخبر العاجل) */}
      {activeUrgent && (
        <a
          href={`/news/${encodeURIComponent(activeUrgent.id)}`}
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              setMobileMenuOpen(false);
              setSectionsOpen(false);
              if (onSelectNews) {
                onSelectNews(activeUrgent);
              } else {
                handleNav('news');
              }
            }
          }}
          className="block bg-gradient-to-l from-red-900 via-red-700 to-red-800 text-white border-b border-amber-400/50 hover:from-red-950 hover:to-red-800 transition-colors"
        >
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-1.5 flex items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1 bg-amber-400 text-stone-950 font-black px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] shrink-0 shadow-xs">
                <Zap className="w-3 h-3 fill-current" />
                <span>خبر عاجل</span>
              </span>
              <span className="font-extrabold text-[11px] sm:text-xs text-white truncate">
                {activeUrgent.title}
              </span>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-amber-200 shrink-0">
              <span className="hidden sm:inline">التفاصيل</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </span>
          </div>
        </a>
      )}

      {/* Official Brand Tagline Bar */}
      <div className="bg-stone-900 py-1 px-4 border-b border-amber-600/30 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2 text-stone-300">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          <span className="font-bold text-amber-400">{slogan ? `«${slogan}»` : '«مصر للجميع»'}</span>
          <span className="hidden sm:inline text-stone-600">|</span>
          <span className="hidden sm:inline text-stone-300 font-medium">أمانة قسم ثالث أكتوبر – محافظة الجيزة</span>
        </div>
        <div className="text-[11px] text-stone-400 hidden md:block">
          الموقع الرسمي لحزب الجبهة الوطنية
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18 gap-3">
          {/* Zone 1: Brand & Official Emblem */}
          <a
            href="/"
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                handleNav('home');
              }
            }}
            className="flex items-center gap-2.5 sm:gap-3 text-right cursor-pointer group shrink-0"
          >
            <img
              src={officialLogo || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
              alt="شعار حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر"
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain rounded-xl border border-amber-500/30 shadow-xs group-hover:scale-105 transition-transform bg-white p-0.5"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col">
              <span className="font-extrabold text-sm sm:text-lg text-stone-950 tracking-tight leading-tight group-hover:text-red-700 transition-colors">
                حزب الجبهة الوطنية
              </span>
              <span className="text-[10px] sm:text-xs font-semibold text-red-700 leading-tight">
                أمانة قسم ثالث أكتوبر – محافظة الجيزة
              </span>
            </div>
          </a>

          {/* Zone 2: Navigation Links (Desktop) */}
          <nav aria-label="التنقل الرئيسي" className="hidden xl:flex items-center gap-3.5 2xl:gap-4 text-[13px] font-semibold text-stone-700">
            {primaryLinks.map(link => {
              const isActive =
                currentView === link.id ||
                (link.id === 'party-leaders' && currentView === 'secretariat-leaders');
              const isJoin = link.id === 'join';
              const href = getViewPath(link.id);
              return (
                <a
                  key={link.id}
                  href={href}
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      handleNav(link.id);
                    }
                  }}
                  className={`cursor-pointer whitespace-nowrap transition-colors py-1 border-b-2 font-bold flex items-center gap-1 ${
                    isJoin
                      ? isActive
                        ? 'border-red-700 text-red-700 bg-red-50/70 px-2.5 rounded-lg'
                        : 'border-transparent text-red-700 bg-red-50 hover:bg-red-100 px-2.5 rounded-lg shadow-2xs'
                      : isActive
                      ? 'border-red-700 text-red-700'
                      : 'border-transparent hover:text-red-700 hover:border-red-700/40 text-stone-700'
                  }`}
                >
                  {isJoin && <HeartHandshake className="w-3.5 h-3.5 text-red-600" />}
                  <span>{link.label}</span>
                </a>
              );
            })}

            {/* Sections Dropdown (الأقسام - يشمل البث المباشر) */}
            <div className="relative" ref={sectionsRef}>
              <button
                type="button"
                onClick={() => setSectionsOpen(prev => !prev)}
                className={`cursor-pointer whitespace-nowrap transition-colors py-1.5 px-2.5 rounded-lg font-bold flex items-center gap-1.5 border ${
                  currentView === 'live' || sectionsOpen
                    ? 'bg-red-700 text-white border-red-700 shadow-xs'
                    : 'bg-stone-100 hover:bg-stone-200/80 text-stone-800 border-stone-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>الأقسام</span>
                {liveStream?.isActive && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sectionsOpen ? 'rotate-180' : ''}`} />
              </button>

              {sectionsOpen && (
                <div className="absolute left-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-stone-200 p-2 z-50 text-right">
                  <div className="px-3 py-1.5 text-[11px] font-bold text-stone-400 border-b border-stone-100 mb-1">
                    أقسام ومنصات البوابة الرسمية
                  </div>
                  <div className="space-y-1">
                    {sectionItems.map(sec => {
                      const IconComp = sec.icon;
                      const isCur = currentView === sec.id;
                      return (
                        <a
                          key={sec.id}
                          href={getViewPath(sec.id)}
                          onClick={(e) => {
                            if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                              e.preventDefault();
                              handleNav(sec.id);
                            }
                          }}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                            isCur ? 'bg-red-50 text-red-700' : 'hover:bg-stone-50 text-stone-800'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            sec.isLive
                              ? 'bg-red-700 text-white'
                              : isCur
                              ? 'bg-red-100 text-red-700'
                              : 'bg-stone-100 text-stone-600'
                          }`}>
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-black flex items-center gap-1.5">
                              <span>{sec.label}</span>
                              {sec.isLive && (
                                <span className="text-[10px] font-black text-red-600">• مباشر</span>
                              )}
                            </div>
                            <div className="text-[10px] text-stone-500 truncate">{sec.sublabel}</div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </nav>

          {/* Zone 3: Search & Mobile Drawer Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="flex items-center gap-2 p-2 sm:px-3 sm:py-1.5 rounded-xl text-stone-700 hover:text-red-700 bg-stone-100/80 hover:bg-red-50 border border-stone-200 hover:border-red-200 transition-all cursor-pointer shadow-2xs"
                title="البحث في الموقع (Ctrl+K)"
                aria-label="البحث في الموقع"
              >
                <Search className="w-4 h-4 text-red-700" />
                <span className="hidden md:inline text-xs font-bold text-stone-600">بحث...</span>
              </button>
            )}

            <div className="xl:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-xl text-stone-700 hover:bg-stone-100 border border-stone-200 focus:outline-hidden cursor-pointer relative"
                aria-label="القائمة الرئيسية"
              >
                {mobileMenuOpen ? <X className="w-5 h-5 text-red-700" /> : <Menu className="w-5 h-5 text-stone-800" />}
                {liveStream?.isActive && !mobileMenuOpen && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-600 border-2 border-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-stone-200 bg-white px-4 pt-3 pb-6 shadow-xl">
          {onOpenSearch && (
            <div className="mb-3">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenSearch();
                }}
                className="w-full bg-stone-50 hover:bg-red-50 border border-stone-200 hover:border-red-300 text-stone-700 hover:text-red-700 font-bold p-3 rounded-2xl flex items-center justify-between text-xs transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-red-700" />
                  <span>البحث في الأخبار والفعاليات والأمانات...</span>
                </span>
                <span className="text-[10px] bg-white border border-stone-200 px-2 py-0.5 rounded-md font-mono text-stone-500">بحث</span>
              </button>
            </div>
          )}

          {/* Sections quick strip in Mobile Drawer (الأقسام - يشمل البث المباشر) */}
          <div className="mb-3">
            <div className="text-[11px] font-bold text-stone-400 mb-1.5 px-1 flex items-center gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5 text-red-700" />
              <span>الأقسام</span>
            </div>
            <a
              href={getViewPath('live')}
              onClick={(e) => {
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                  e.preventDefault();
                  handleNav('live');
                }
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-between mb-2 transition-colors ${
                currentView === 'live'
                  ? 'bg-red-700 text-white'
                  : liveStream?.isActive
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-stone-100 text-stone-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <Radio className={`w-4 h-4 ${liveStream?.isActive && currentView !== 'live' ? 'text-red-600' : ''}`} />
                <span>قسم البث المباشر</span>
              </span>
              {liveStream?.isActive && (
                <span className="inline-flex items-center gap-1 text-[10px] font-black">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  <span>بث حي الآن</span>
                </span>
              )}
            </a>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm font-semibold">
            {primaryLinks.map(link => {
              const isActive =
                currentView === link.id ||
                (link.id === 'party-leaders' && currentView === 'secretariat-leaders');
              const isJoin = link.id === 'join';
              const href = getViewPath(link.id);
              return (
                <a
                  key={link.id}
                  href={href}
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      handleNav(link.id);
                    }
                  }}
                  className={`text-right px-3 py-2.5 rounded-xl transition-colors font-bold flex items-center justify-between ${
                    isJoin
                      ? isActive
                        ? 'bg-red-700 text-white'
                        : 'bg-red-50 text-red-700 border border-red-200'
                      : isActive
                      ? 'bg-red-50 text-red-700 border-r-4 border-red-700'
                      : 'text-stone-800 hover:bg-stone-50 hover:text-red-700'
                  }`}
                >
                  <span>{link.label}</span>
                  {isJoin && <HeartHandshake className="w-3.5 h-3.5" />}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
