import React from 'react';
import { Phone, Mail, MapPin, MessageCircle, ExternalLink, ShieldCheck } from 'lucide-react';
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
              alt="شعار حزب الجبهة الوطنية"
              className="w-full h-full object-contain"
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

        {/* Official Facebook Link Only (Per user instruction) */}
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

        {/* Separator */}
        <div className="w-24 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent my-6" />

        {/* Copyright & Secondary Links */}
        <div className="flex flex-col sm:flex-row items-center justify-between w-full text-xs text-stone-500 gap-3 border-t border-stone-900 pt-6">
          <p className="tracking-wide">
            © 2026 All Rights Reserved.
          </p>
          <div className="flex items-center gap-4 text-xs">
            <button
              onClick={() => {
                setCurrentView('contact');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="text-stone-400 hover:text-amber-400 transition-colors cursor-pointer"
            >
              تواصل معنا
            </button>
            <span>•</span>
            <button
              onClick={() => {
                setCurrentView('join');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="text-stone-400 hover:text-amber-400 transition-colors cursor-pointer"
            >
              استمارة العضوية
            </button>
            <span>•</span>
            <button
              onClick={() => {
                setCurrentView('admin');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="text-stone-400 hover:text-amber-400 transition-colors cursor-pointer font-bold"
            >
              لوحة الإدارة
            </button>
          </div>
        </div>

      </div>
    </footer>
  );
};
