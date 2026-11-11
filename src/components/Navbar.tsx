import React, { useState } from 'react';
import { Menu, X, ShieldAlert, ArrowLeft, HeartHandshake, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  officialLogo: string;
  slogan: string;
  onOpenSearch?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  officialLogo,
  slogan,
  onOpenSearch
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();

  const navLinks = [
    { id: 'home', label: 'الرئيسية' },
    { id: 'about', label: 'عن الحزب' },
    { id: 'party-leaders', label: 'قيادات الحزب' },
    { id: 'secretariat-leaders', label: 'قيادات أمانة أكتوبر' },
    { id: 'secretariats', label: 'الأمانات' },
    { id: 'initiatives', label: 'المبادرات' },
    { id: 'news', label: 'الأخبار' },
    { id: 'events', label: 'الفعاليات' },
    { id: 'join', label: 'استمارة التقديم' },
    { id: 'contact', label: 'تواصل معنا' }
  ];

  const handleNav = (view: string) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-xs">
      {/* Top Banner Ribbon */}
      <div className="bg-stone-900 py-1.5 px-4 border-b border-amber-600/30 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2 text-stone-300">
          <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
          <span className="font-bold text-amber-400">{slogan ? `«${slogan}»` : '«مصر للجميع»'}</span>
          <span className="hidden sm:inline text-stone-600">|</span>
          <span className="hidden sm:inline text-stone-300 font-medium">أمانة قسم ثالث أكتوبر – محافظة الجيزة</span>
        </div>
        <div className="text-[11px] text-stone-400 hidden md:block">
          الموقع الرسمي لحزب الجبهة الوطنية
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-3">
          
          {/* Zone 1: Brand & Official Emblem */}
          <button
            onClick={() => handleNav('home')}
            className="flex items-center gap-3 text-right cursor-pointer group shrink-0"
          >
            <img
              src={officialLogo || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
              alt="شعار حزب الجبهة الوطنية"
              className="w-12 h-12 sm:w-13 sm:h-13 object-contain rounded-xl border border-amber-500/30 shadow-xs group-hover:scale-105 transition-transform bg-white p-0.5"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col">
              <span className="font-extrabold text-base sm:text-xl text-stone-950 tracking-tight leading-tight group-hover:text-red-700 transition-colors">
                حزب الجبهة الوطنية
              </span>
              <span className="text-[11px] sm:text-xs font-semibold text-red-700 leading-tight">
                أمانة قسم ثالث أكتوبر – محافظة الجيزة
              </span>
              <span className="text-[10px] sm:text-[11px] font-medium text-amber-700 tracking-wide mt-0.5">
                «{slogan || 'مصر للجميع'}»
              </span>
            </div>
          </button>

          {/* Zone 2: Navigation Links (Desktop) */}
          <nav className="hidden xl:flex items-center gap-4 2xl:gap-5 text-sm font-semibold text-stone-700">
            {navLinks.map(link => {
              const isActive = currentView === link.id;
              const isJoin = link.id === 'join';
              return (
                <button
                  key={link.id}
                  onClick={() => handleNav(link.id)}
                  className={`cursor-pointer whitespace-nowrap transition-colors py-1 border-b-2 font-bold flex items-center gap-1.5 ${
                    isJoin
                      ? isActive
                        ? 'border-red-700 text-red-700 bg-red-50/70 px-3 rounded-lg'
                        : 'border-transparent text-red-700 bg-red-50 hover:bg-red-100 px-3 rounded-lg shadow-2xs'
                      : isActive
                      ? 'border-red-700 text-red-700'
                      : 'border-transparent hover:text-red-700 hover:border-red-700/40 text-stone-700'
                  }`}
                >
                  {isJoin && <HeartHandshake className="w-3.5 h-3.5 text-red-600" />}
                  <span>{link.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Search & Mobile Drawer Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Search Trigger Button */}
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-xl text-stone-700 hover:text-red-700 bg-stone-100/80 hover:bg-red-50 border border-stone-200 hover:border-red-200 transition-all cursor-pointer shadow-2xs"
                title="البحث في الموقع (Ctrl+K)"
                aria-label="البحث في الموقع"
              >
                <Search className="w-4 h-4 text-red-700" />
                <span className="hidden md:inline text-xs font-bold text-stone-600">بحث...</span>
              </button>
            )}

            {/* Mobile Menu Toggle Button */}
            <div className="xl:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-xl text-stone-700 hover:bg-stone-100 border border-stone-200 focus:outline-hidden cursor-pointer"
                aria-label="القائمة الرئيسية"
              >
                {mobileMenuOpen ? <X className="w-6 h-6 text-red-700" /> : <Menu className="w-6 h-6 text-stone-800" />}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-stone-200 bg-white px-4 pt-3 pb-6 shadow-xl animate-in slide-in-from-top duration-150">
          {/* Mobile Search Button */}
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

          <div className="grid grid-cols-2 gap-2 text-sm font-semibold">
            {navLinks.map(link => {
              const isActive = currentView === link.id;
              const isJoin = link.id === 'join';
              return (
                <button
                  key={link.id}
                  onClick={() => handleNav(link.id)}
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
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
