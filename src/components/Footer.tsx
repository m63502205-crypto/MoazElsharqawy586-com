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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          
          {/* Column 1: Party Identity */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img
                src={settings.officialLogo || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                alt="شعار حزب الجبهة الوطنية"
                className="w-14 h-14 object-contain rounded-lg bg-white p-1 shadow-sm"
                referrerPolicy="no-referrer"
              />
              <div>
                <h3 className="text-white font-extrabold text-lg leading-tight">
                  حزب الجبهة الوطنية
                </h3>
                <p className="text-xs text-amber-400 font-semibold mt-0.5">
                  أمانة قسم ثالث أكتوبر – محافظة الجيزة
                </p>
                <p className="text-xs text-stone-400 font-medium mt-1">
                  شعارنا: «{settings.slogan || 'مصر للجميع'}»
                </p>
              </div>
            </div>
            <p className="text-xs text-stone-400 leading-relaxed">
              منصة حزبية وطنية متكاملة تهدف لترسيخ الوعي المجتمعي وخدمة المواطنين وتمكين الكوادر والشباب في كافة المجالات الحزبية والتنموية.
            </p>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h4 className="text-white font-bold text-sm mb-4 border-r-2 border-red-600 pr-2">
              أقسام المنصة
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => setCurrentView('about')}
                  className="hover:text-amber-400 transition-colors text-right cursor-pointer"
                >
                  عن الحزب والأمانة
                </button>
              </li>
              <li>
                <button
                  onClick={() => setCurrentView('party-leaders')}
                  className="hover:text-amber-400 transition-colors text-right cursor-pointer"
                >
                  قيادات الحزب على مستوى الجمهورية
                </button>
              </li>
              <li>
                <button
                  onClick={() => setCurrentView('secretariat-leaders')}
                  className="hover:text-amber-400 transition-colors text-right cursor-pointer"
                >
                  قيادات أمانة قسم ثالث أكتوبر
                </button>
              </li>
              <li>
                <button
                  onClick={() => setCurrentView('secretariats')}
                  className="hover:text-amber-400 transition-colors text-right cursor-pointer"
                >
                  الأمانات
                </button>
              </li>
              <li>
                <button
                  onClick={() => setCurrentView('initiatives')}
                  className="hover:text-amber-400 transition-colors text-right cursor-pointer"
                >
                  المبادرات المجتمعية
                </button>
              </li>
              <li>
                <button
                  onClick={() => setCurrentView('join')}
                  className="text-amber-400 font-bold hover:underline transition-colors text-right cursor-pointer flex items-center gap-1"
                >
                  <span>تقديم طلب الانضمام للحزب</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Contact Details (Official per brief) */}
          <div>
            <h4 className="text-white font-bold text-sm mb-4 border-r-2 border-red-600 pr-2">
              بيانات التواصل الرسمية
            </h4>
            <ul className="space-y-3 text-xs text-stone-300">
              <li className="flex items-start gap-2.5">
                <Phone className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-[11px] text-stone-400">الهاتف وخدمة المواطنين:</span>
                  <a
                    href="tel:01003070108"
                    className="font-mono text-sm font-semibold text-white hover:text-amber-400 transition-colors"
                    dir="ltr"
                  >
                    01003070108
                  </a>
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-[11px] text-stone-400">واتساب الأمانة المباشر:</span>
                  <a
                    href="https://wa.me/201003070108"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-emerald-400 transition-colors flex items-center gap-1 font-semibold"
                  >
                    <span>مراسلة عبر واتساب</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </li>

              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-[11px] text-stone-400">المقر واللوكيشن (الموقع الجغرافي):</span>
                  <span className="text-stone-200 text-xs">{settings.address || 'أمانة قسم ثالث أكتوبر، محافظة الجيزة'}</span>
                  {settings.locationUrl && (
                    <a
                      href={settings.locationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:text-amber-300 transition-colors text-[11px] font-semibold flex items-center gap-1 mt-1"
                    >
                      <span>عرض الموقع على خرائط جوجل (Google Maps)</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </li>
            </ul>
          </div>

          {/* Column 4: Social Links & Security Assurance */}
          <div>
            <h4 className="text-white font-bold text-sm mb-4 border-r-2 border-red-600 pr-2">
              متابعة أنشطة الحزب
            </h4>
            <div className="flex flex-col gap-2 mb-4">
              {/* Official Facebook Page Button */}
              <a
                href={settings.facebookUrl || settings.socialLinks?.find(l => l.platform === 'facebook')?.url || 'https://www.facebook.com/fational.front.party'}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-700 hover:bg-blue-600 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-between border border-blue-500/50 shadow-xs transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-white text-blue-700 flex items-center justify-center font-black text-xs">f</span>
                  <span>صفحة الحزب الرسمية على فيسبوك</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>

              {/* Other Social Links (excluding youtube) */}
              <div className="flex flex-wrap gap-2">
                {settings.socialLinks && settings.socialLinks
                  .filter(link => link.platform !== 'youtube' && link.platform !== 'facebook')
                  .map(link => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-stone-800 hover:bg-stone-700 text-stone-200 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border border-stone-700 hover:border-amber-500 transition-colors"
                    >
                      <span>{link.label}</span>
                      <ExternalLink className="w-3 h-3 text-stone-400" />
                    </a>
                  ))}
              </div>
            </div>

            <div className="bg-stone-800/80 p-3 rounded-lg border border-stone-700/60 mt-3">
              <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold mb-1">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span>حماية البيانات والخصوصية</span>
              </div>
              <p className="text-[11px] text-stone-400 leading-normal">
                كافة البيانات الشخصية والمستندات المرفوعة مشفرة ومحمية وفق أعلى معايير أمان قواعد البيانات، ولا يتم مشاركتها إلا للجان الفحص المعتمدة.
              </p>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <p>
            جميع الحقوق محفوظة © {new Date().getFullYear()} حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة.
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCurrentView('contact')}
              className="hover:text-stone-300 transition-colors cursor-pointer"
            >
              صفحة التواصل
            </button>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => setCurrentView('admin')}
              className="text-stone-400 hover:text-amber-400 transition-colors cursor-pointer font-semibold"
            >
              بوابة الإدارة
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
