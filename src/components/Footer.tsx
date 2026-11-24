import React from 'react';
import { SiteSettings } from '../types';

interface FooterProps {
  settings: SiteSettings;
  setCurrentView: (view: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ settings, setCurrentView }) => {
  return (
    <footer className="bg-stone-900 text-stone-300 border-t-4 border-amber-600 no-print">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center flex flex-col items-center">

        {/* Centered Golden Emblem */}
        <div className="mb-6 relative group">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white border border-amber-500/40 p-2 shadow-2xl flex items-center justify-center">
            <img
              src={settings.officialLogo || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
              alt="شعار حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر"
              className="w-full h-full object-contain"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        {/* Party Title */}
        <h3 className="text-xl sm:text-2xl font-black text-white tracking-wide">
          حزب الجبهة الوطنية
        </h3>
        <p className="text-xs sm:text-sm font-semibold text-amber-400 mt-1">
          أمانة قسم ثالث أكتوبر – محافظة الجيزة
        </p>

        {/* Official Facebook Link Only */}
        <div className="flex items-center justify-center my-6">
          <a
            href={settings.facebookUrl || 'https://www.facebook.com/fational.front.party'}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="الصفحة الرسمية لحزب الجبهة الوطنية على فيسبوك"
            className="inline-flex items-center gap-3 px-6 py-2.5 rounded-full border border-blue-500/40 bg-stone-900/90 hover:bg-blue-600 hover:border-blue-400 text-stone-200 hover:text-white transition-all hover:scale-105 shadow-md group"
          >
            <span className="w-8 h-8 rounded-full bg-blue-600 text-white font-black text-base flex items-center justify-center shadow-xs group-hover:bg-white group-hover:text-blue-600 transition-colors">
              f
            </span>
            <span className="text-xs sm:text-sm font-bold">الصفحة الرسمية للحزب على فيسبوك</span>
          </a>
        </div>

        {/* Mission Statement */}
        <p className="text-xs sm:text-sm text-stone-400 max-w-xl mx-auto leading-relaxed font-normal">
          كيان سياسي مصري يسعى لتعزيز قيم العدالة الاجتماعية والحرية وسيادة القانون، مع التركيز على تمكين المشاركة الشعبية وبناء مستقبل مشرق لكل أبناء الوطن.
        </p>

        {/* Internal Navigation & Sitemap Links (Crawlable for Search Engines & Users) */}
        <nav aria-label="أقسام الموقع وخريطة الصفحات" className="w-full max-w-3xl mt-6 pt-5 border-t border-stone-800/80">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-bold text-stone-400">
            {[
              { id: 'home', href: '/', label: 'الرئيسية' },
              { id: 'about', href: '/about', label: 'عن الحزب' },
              { id: 'party-leaders', href: '/party-leaders', label: 'قيادات الحزب' },
              { id: 'secretariat-leaders', href: '/secretariat-leaders', label: 'قيادات الأمانة' },
              { id: 'secretariats', href: '/secretariats', label: 'الأمانات التخصصية' },
              { id: 'initiatives', href: '/initiatives', label: 'المبادرات' },
              { id: 'news', href: '/news', label: 'الأخبار' },
              { id: 'events', href: '/events', label: 'الفعاليات' },
              { id: 'live', href: '/live', label: 'البث المباشر' },
              { id: 'join', href: '/join', label: 'طلب العضوية' },
              { id: 'contact', href: '/contact', label: 'تواصل معنا' },
              { id: 'sitemap', href: '/sitemap', label: 'خريطة الموقع' }
            ].map(item => (
              <a
                key={item.id}
                href={item.href}
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    setCurrentView(item.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="hover:text-amber-400 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        {/* Separator */}
        <div className="w-24 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent my-6" />

        {/* Copyright */}
        <div className="flex flex-wrap items-center justify-center gap-4 w-full text-xs text-stone-500 border-t border-stone-900 pt-6">
          <p className="tracking-wide">
            © 2026{' '}
            <button
              type="button"
              onClick={() => {
                setCurrentView('admin');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline p-0 m-0 bg-transparent border-0 text-inherit hover:text-stone-300 transition-colors cursor-pointer"
              aria-label="All Rights Reserved"
            >
              All Rights Reserved.
            </button>
          </p>
        </div>

        {/* Developer Credit */}
        <div className="w-full pt-4 mt-4 border-t border-stone-800/70 text-center">
          <p className="text-xs font-semibold text-stone-400 tracking-wide" dir="ltr">
            Development <span className="text-amber-400">Eng.Moaz Elsharqawy</span>
          </p>
        </div>
      </div>
    </footer>
  );
};
