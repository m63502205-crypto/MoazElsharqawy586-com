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
    { id: 'join', label: 'طلب العضوية' },
    { id: 'contact', label: 'تواصل معنا' }
  ];

  const handleNav = (view: string) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-[#4c0519] via-[#881337] to-[#4c0519] border-b-2 border-amber-500/40 shadow-xl text-white">
      {/* Top Banner Ribbon */}
      <div className="bg-gradient-to-r from-[#2a0410] via-[#47061d] to-[#2a0410] py-1.5 px-4 border-b border-amber-500/25 flex items-center justify-between text-[11px] text-amber-200">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-semibold text-amber-300">{slogan ? `«${slogan}»` : '«مصر للجميع»'}</span>
          <span className="hidden sm:inline text-amber-400/40">|</span>
          <span className="hidden sm:inline text-amber-100 font-medium">أمانة قسم ثالث أكتوبر – محافظة الجيزة</span>
        </div>
        <div className="text-[10px] text-amber-300/80 font-bold hidden md:block">
          بوابة الحزب الرسمية المعتمدة
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
                className="w-12 h-12 sm:w-14 sm:h-14 object-contain rounded-xl border border-amber-400/50 p-1 bg-black/40 shadow-md group-hover:scale-105 transition-transform"
                referrerPolicy="no-referrer"
              />
              <div className="flex flex-col">
                <span className="font-black text-base sm:text-lg text-white tracking-tight leading-tight group-hover:text-amber-300 transition-colors">
                  حزب الجبهة الوطنية
                </span>
                <span className="text-[11px] font-bold text-amber-300 leading-tight">
                  أمانة قسم ثالث أكتوبر
                </span>
              </div>
            </button>

            {/* Quick Home Tab on mobile */}
            <button
              onClick={() => handleNav('home')}
              className={`xl:hidden px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                currentView === 'home'
                  ? 'bg-amber-400 text-stone-950 shadow-sm'
                  : 'text-stone-200 hover:text-white'
              }`}
            >
              الرئيسية
            </button>
          </div>

          {/* Center Zone: Navigation Links (Desktop) */}
          <nav className="hidden xl:flex items-center gap-4 text-xs lg:text-sm font-bold text-stone-100">
            {navLinks.map(link => {
              const isActive = currentView === link.id;
              return (
                <button
                  key={link.id}
                  onClick={() => handleNav(link.id)}
                  className={`cursor-pointer whitespace-nowrap transition-colors py-1 border-b-2 font-bold ${
                    isActive
                      ? 'border-amber-400 text-amber-300'
                      : 'border-transparent hover:text-amber-300 hover:border-amber-400/40 text-stone-100'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          {/* Left Zone: Portal Actions & Mobile Drawer Toggle */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => handleNav('contact')}
              className="hidden sm:flex items-center gap-1.5 bg-black/30 hover:bg-black/50 text-amber-200 border border-amber-400/30 px-3.5 py-2 rounded-xl text-xs font-bold transition-all hover:scale-102 cursor-pointer"
            >
              <span>تواصل معنا</span>
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden p-2 rounded-xl text-stone-100 hover:bg-black/30 border border-amber-400/30 focus:outline-hidden cursor-pointer"
              aria-label="القائمة الرئيسية"
            >
              {mobileMenuOpen ? <X className="w-6 h-6 text-amber-300" /> : <Menu className="w-6 h-6 text-amber-300" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-amber-500/30 bg-[#2a0410] px-4 pt-3 pb-6 shadow-2xl animate-in slide-in-from-top duration-150">
          <div className="grid grid-cols-2 gap-2 text-sm font-semibold">
            {navLinks.map(link => {
              const isActive = currentView === link.id;
              return (
                <button
                  key={link.id}
                  onClick={() => handleNav(link.id)}
                  className={`text-right px-3 py-2.5 rounded-xl transition-colors font-bold ${
                    isActive
                      ? 'bg-amber-400/20 text-amber-300 border-r-4 border-amber-400'
                      : 'text-stone-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
