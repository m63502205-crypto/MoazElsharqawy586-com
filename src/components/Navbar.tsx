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
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          
          {/* Zone 1: Brand & Official Emblem */}
          <button
            onClick={() => handleNav('home')}
            className="flex items-center gap-3.5 text-right cursor-pointer group shrink-0"
          >
            <img
              src={officialLogo || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
              alt="شعار حزب الجبهة الوطنية"
              className="w-13 h-13 object-contain rounded-lg border border-amber-500/30 shadow-xs group-hover:scale-105 transition-transform"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col">
              <span className="font-extrabold text-lg sm:text-xl text-stone-950 tracking-tight leading-tight group-hover:text-red-700 transition-colors">
                حزب الجبهة الوطنية
              </span>
              <span className="text-xs font-semibold text-red-700 leading-tight">
                أمانة قسم ثالث أكتوبر – محافظة الجيزة
              </span>
              <span className="text-[11px] font-medium text-amber-700 tracking-wide mt-0.5">
                «{slogan || 'مصر للجميع'}»
              </span>
            </div>
          </button>

          {/* Zone 2: Navigation Links (Desktop) */}
          <nav className="hidden xl:flex items-center gap-6 text-sm font-medium text-stone-700">
            {navLinks.map(link => {
              const isActive = currentView === link.id;
              return (
                <button
                  key={link.id}
                  onClick={() => handleNav(link.id)}
                  className={`cursor-pointer whitespace-nowrap transition-colors py-1 border-b-2 font-semibold ${
                    isActive
                      ? 'border-red-700 text-red-700'
                      : 'border-transparent hover:text-red-700 hover:border-red-700/40 text-stone-700'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action & Admin Portal Access */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Primary Action Button */}
            <button
              onClick={() => handleNav('join')}
              className="flex items-center gap-2 bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-all hover:shadow cursor-pointer whitespace-nowrap"
            >
              <HeartHandshake className="w-4 h-4 text-amber-300" />
              <span>طلب الانضمام</span>
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden p-2 rounded-lg text-stone-700 hover:bg-stone-100 focus:outline-hidden"
              aria-label="القائمة الرئيسية"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-stone-200 bg-white px-4 pt-3 pb-6 shadow-xl animate-in slide-in-from-top duration-150">
          <div className="grid grid-cols-2 gap-2 text-sm font-medium">
            {navLinks.map(link => {
              const isActive = currentView === link.id;
              return (
                <button
                  key={link.id}
                  onClick={() => handleNav(link.id)}
                  className={`text-right px-3 py-2.5 rounded-md transition-colors font-semibold ${
                    isActive
                      ? 'bg-red-50 text-red-700 border-r-4 border-red-700 font-bold'
                      : 'text-stone-800 hover:bg-stone-50'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 flex flex-col gap-2">
            <button
              onClick={() => handleNav('join')}
              className="w-full flex items-center justify-center gap-2 bg-red-700 text-white py-3 rounded-lg text-sm font-bold shadow-xs cursor-pointer"
            >
              <HeartHandshake className="w-4 h-4 text-amber-300" />
              <span>تقديم طلب انضمام للحزب</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
