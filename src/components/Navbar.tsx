import React, { useState } from 'react';
import { Menu, X, ShieldAlert, ArrowLeft, HeartHandshake } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  officialLogo: string;
  slogan: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  officialLogo,
  slogan
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
    { id: 'gallery', label: 'المعرض' },
    { id: 'contact', label: 'تواصل معنا' }
  ];

  const handleNav = (view: string) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-amber-500/20 shadow-md">
      {/* Top Banner Ribbon */}
      <div className="bg-gradient-to-r from-stone-950 via-amber-950/40 to-stone-950 py-1.5 px-4 border-b border-amber-500/15 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2 text-stone-300">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-semibold text-amber-300">{slogan ? `«${slogan}»` : '«مصر للجميع»'}</span>
          <span className="hidden sm:inline text-stone-600">|</span>
          <span className="hidden sm:inline text-stone-400">أمانة قسم ثالث أكتوبر – محافظة الجيزة</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          
          {/* Right Zone: Active Main Tab on Mobile / Brand on Desktop */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => handleNav('home')}
              className="flex items-center gap-3 text-right cursor-pointer group shrink-0"
            >
              <img
                src={officialLogo || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                alt="شعار حزب الجبهة الوطنية"
                className="w-12 h-12 sm:w-14 sm:h-14 object-contain rounded-xl border border-amber-500/40 p-0.5 bg-black/40 shadow-sm group-hover:scale-105 transition-transform"
                referrerPolicy="no-referrer"
              />
              <div className="flex flex-col">
                <span className="font-black text-base sm:text-lg text-white tracking-tight leading-tight group-hover:text-amber-400 transition-colors">
                  حزب الجبهة الوطنية
                </span>
                <span className="text-[11px] font-semibold text-amber-400 leading-tight">
                  أمانة قسم ثالث أكتوبر
                </span>
              </div>
            </button>

            {/* Quick Home Tab on mobile */}
            <button
              onClick={() => handleNav('home')}
              className={`xl:hidden px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                currentView === 'home'
                  ? 'bg-amber-500 text-stone-950 shadow-sm'
                  : 'text-stone-300 hover:text-white'
              }`}
            >
              الرئيسية
            </button>
          </div>

          {/* Center Zone: Navigation Links (Desktop) */}
          <nav className="hidden xl:flex items-center gap-5 text-sm font-semibold text-stone-300">
            {navLinks.map(link => {
              const isActive = currentView === link.id;
              return (
                <button
                  key={link.id}
                  onClick={() => handleNav(link.id)}
                  className={`cursor-pointer whitespace-nowrap transition-colors py-1 border-b-2 font-bold ${
                    isActive
                      ? 'border-amber-400 text-amber-300'
                      : 'border-transparent hover:text-amber-300 hover:border-amber-400/40 text-stone-300'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          {/* Left Zone: Action Button & Mobile Drawer Toggle */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Primary Action Button */}
            <button
              onClick={() => handleNav('join')}
              className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black shadow-md transition-all hover:scale-[1.02] cursor-pointer whitespace-nowrap"
            >
              <HeartHandshake className="w-4 h-4 text-stone-950" />
              <span>استمارة العضوية</span>
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden p-2 rounded-xl text-stone-200 hover:bg-stone-800/80 border border-stone-800 focus:outline-hidden"
              aria-label="القائمة الرئيسية"
            >
              {mobileMenuOpen ? <X className="w-6 h-6 text-amber-400" /> : <Menu className="w-6 h-6 text-amber-400" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-amber-500/20 bg-stone-950 px-4 pt-3 pb-6 shadow-2xl animate-in slide-in-from-top duration-150">
          <div className="grid grid-cols-2 gap-2 text-sm font-semibold">
            {navLinks.map(link => {
              const isActive = currentView === link.id;
              return (
                <button
                  key={link.id}
                  onClick={() => handleNav(link.id)}
                  className={`text-right px-3 py-2.5 rounded-xl transition-colors font-bold ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-300 border-r-4 border-amber-400'
                      : 'text-stone-300 hover:bg-stone-900 hover:text-white'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-stone-800 flex flex-col gap-2">
            <button
              onClick={() => handleNav('join')}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 py-3 rounded-xl text-sm font-black shadow-md cursor-pointer"
            >
              <HeartHandshake className="w-4 h-4 text-stone-950" />
              <span>تقديم طلب العضوية والانضمام</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
