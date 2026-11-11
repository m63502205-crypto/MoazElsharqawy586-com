import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  X,
  Newspaper,
  Calendar,
  Sparkles,
  Users,
  Building2,
  ChevronLeft,
  FileText,
  HeartHandshake,
  ArrowRight,
  TrendingUp,
  Tag
} from 'lucide-react';
import { PublicPortalData, NewsItem, EventItem, Initiative, SpecializedSecretariat, PartyLeader, SecretariatLeader } from '../types';

export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\w\s\u0600-\u06FF]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type SearchResultType =
  | 'news'
  | 'event'
  | 'initiative'
  | 'secretariat'
  | 'leader'
  | 'page'
  | 'join';

export interface SearchResultItem {
  id: string;
  type: SearchResultType;
  typeLabel: string;
  title: string;
  subtitle?: string;
  snippet: string;
  imageUrl?: string;
  date?: string;
  score: number;
  rawItem: any;
}

interface SiteSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PublicPortalData;
  onSelectResult: (result: SearchResultItem) => void;
}

const QUICK_SUGGESTIONS = [
  'طلب العضوية والانضمام',
  'أمانة قسم ثالث أكتوبر',
  'مبادرات الحزب',
  'أمانة الشباب',
  'المؤتمرات والفعاليات',
  'قيادات الحزب',
  'مصر للجميع'
];

export const SiteSearchModal: React.FC<SiteSearchModalProps> = ({
  isOpen,
  onClose,
  data,
  onSelectResult
}) => {
  const [query, setQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | SearchResultType>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus input on modal open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setSelectedFilter('all');
    }
  }, [isOpen]);

  // Keyboard navigation & close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Search indexing and score calculation
  const searchResults = useMemo(() => {
    const rawQuery = query.trim();
    if (!rawQuery) return [];

    const normQuery = normalizeArabic(rawQuery);
    const queryWords = normQuery.split(' ').filter(w => w.length > 0);

    const results: SearchResultItem[] = [];

    // Helper to score fields
    const scoreItem = (
      title: string,
      subtitle: string = '',
      content: string = ''
    ): number => {
      const normTitle = normalizeArabic(title);
      const normSubtitle = normalizeArabic(subtitle);
      const normContent = normalizeArabic(content);

      let score = 0;

      // Exact title match gets massive weight
      if (normTitle === normQuery) score += 200;
      else if (normTitle.startsWith(normQuery)) score += 120;
      else if (normTitle.includes(normQuery)) score += 80;

      // Word matches in title
      for (const w of queryWords) {
        if (normTitle.includes(w)) score += 30;
      }

      // Subtitle / excerpt match
      if (normSubtitle.includes(normQuery)) score += 40;
      for (const w of queryWords) {
        if (normSubtitle.includes(w)) score += 15;
      }

      // Full content match
      if (normContent.includes(normQuery)) score += 25;
      for (const w of queryWords) {
        if (normContent.includes(w)) score += 5;
      }

      return score;
    };

    // 1. Search in News
    (data.news || []).forEach(n => {
      const score = scoreItem(n.title, n.excerpt || '', n.content || '');
      if (score > 0) {
        results.push({
          id: `news-${n.id}`,
          type: 'news',
          typeLabel: 'خبر رسمي',
          title: n.title,
          subtitle: n.authorName ? `بقلم: ${n.authorName} ${n.authorPosition ? `(${n.authorPosition})` : ''}` : undefined,
          snippet: n.excerpt || n.content?.slice(0, 140) || '',
          imageUrl: n.coverImage || data.settings?.officialLogo,
          date: n.publishDate,
          score,
          rawItem: n
        });
      }
    });

    // 2. Search in Events
    (data.events || []).forEach(ev => {
      const score = scoreItem(ev.title, ev.venue || '', ev.description || '');
      if (score > 0) {
        results.push({
          id: `event-${ev.id}`,
          type: 'event',
          typeLabel: 'فعالية حزبية',
          title: ev.title,
          subtitle: ev.venue ? `المكان: ${ev.venue}` : undefined,
          snippet: ev.description?.slice(0, 140) || '',
          imageUrl: ev.coverUrl || ev.coverImage || data.settings?.officialLogo,
          date: ev.dateTime ? new Date(ev.dateTime).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : undefined,
          score,
          rawItem: ev
        });
      }
    });

    // 3. Search in Initiatives
    (data.initiatives || []).forEach(init => {
      const goalsText = (init.goals || []).join(' ');
      const activitiesText = (init.activities || []).map(a => `${a.title} ${a.description}`).join(' ');
      const score = scoreItem(init.title, init.description || '', `${goalsText} ${activitiesText}`);
      if (score > 0) {
        results.push({
          id: `init-${init.id}`,
          type: 'initiative',
          typeLabel: 'مبادرة مجتمعية',
          title: init.title,
          subtitle: init.status === 'active' ? 'مبادرة نشطة ومستمرة' : 'مبادرة تنموية',
          snippet: init.description?.slice(0, 140) || '',
          imageUrl: init.coverUrl || data.settings?.officialLogo,
          date: init.startDate,
          score,
          rawItem: init
        });
      }
    });

    // 4. Search in Specialized Secretariats
    (data.specializedSecretariats || []).forEach(sec => {
      const dutiesText = (sec.duties || []).join(' ');
      const goalsText = (sec.goals || []).join(' ');
      const secretaryText = sec.secretaryName ? `أمين الأمانة: ${sec.secretaryName}` : '';
      const score = scoreItem(sec.name, sec.description || '', `${dutiesText} ${goalsText} ${secretaryText}`);
      if (score > 0) {
        results.push({
          id: `sec-${sec.id}`,
          type: 'secretariat',
          typeLabel: 'أمانة نوعية تخصصية',
          title: sec.name,
          subtitle: sec.secretaryName ? `مسؤول الأمانة: ${sec.secretaryName}` : 'أمانة قسم ثالث أكتوبر – محافظة الجيزة',
          snippet: sec.description || 'هيكل وأعضاء ومهام الأمانة التخصصية بحزب الجبهة الوطنية',
          imageUrl: sec.coverUrl || sec.logoUrl || data.settings?.officialLogo,
          score,
          rawItem: sec
        });
      }
    });

    // 5. Search in Party Leaders & Secretariat Leaders
    (data.partyLeaders || []).forEach(ldr => {
      const score = scoreItem(ldr.name, ldr.position || '', ldr.bio || '');
      if (score > 0) {
        results.push({
          id: `pleader-${ldr.id}`,
          type: 'leader',
          typeLabel: 'قيادات الحزب المركزية',
          title: ldr.name,
          subtitle: ldr.position,
          snippet: ldr.bio?.slice(0, 140) || 'من قيادات الهيئة العليا لحزب الجبهة الوطنية',
          imageUrl: ldr.photoUrl || data.settings?.officialLogo,
          score,
          rawItem: ldr
        });
      }
    });

    (data.secretariatLeaders || []).forEach(ldr => {
      const score = scoreItem(ldr.name, ldr.title || '', ldr.bio || '');
      if (score > 0) {
        results.push({
          id: `secleader-${ldr.id}`,
          type: 'leader',
          typeLabel: 'قيادات أمانة قسم ثالث أكتوبر',
          title: ldr.name,
          subtitle: ldr.title,
          snippet: ldr.bio?.slice(0, 140) || 'تشكيل قيادات أمانة قسم ثالث أكتوبر بمحافظة الجيزة',
          imageUrl: ldr.photoUrl || data.settings?.officialLogo,
          score,
          rawItem: ldr
        });
      }
    });

    // 6. Search in Custom Pages
    (data.pages || []).forEach(cp => {
      const score = scoreItem(cp.title, '', cp.content || '');
      if (score > 0) {
        results.push({
          id: `page-${cp.id}`,
          type: 'page',
          typeLabel: 'صفحة رسمية',
          title: cp.title,
          subtitle: 'صفحة إعلامية موثقة',
          snippet: cp.content?.slice(0, 140) || '',
          imageUrl: cp.coverImage || data.settings?.officialLogo,
          score,
          rawItem: cp
        });
      }
    });

    // 7. Keyword match for Membership Application
    const joinTerms = ['عضويه', 'انضمام', 'استماره', 'طلب', 'عضو', 'اشتراك', 'كارنيه', 'تقديم'];
    const matchesJoin = queryWords.some(w => joinTerms.some(t => w.includes(t) || t.includes(w)));
    if (matchesJoin) {
      results.push({
        id: 'system-join',
        type: 'join',
        typeLabel: 'خدمة رقمية',
        title: 'استمارة التقديم والعضوية الرقمية',
        subtitle: 'أمانة قسم ثالث أكتوبر – محافظة الجيزة',
        snippet: 'تقديم طلب انضمام جديد لحزب الجبهة الوطنية والاستعلام الفوري عن حالة الطلب برقم المتابعة.',
        imageUrl: data.settings?.officialLogo,
        score: 150,
        rawItem: { id: 'join' }
      });
    }

    // Sort by relevance score descending
    return results.sort((a, b) => b.score - a.score);
  }, [query, data]);

  // Filtered by selected category tab
  const filteredResults = useMemo(() => {
    if (selectedFilter === 'all') return searchResults;
    return searchResults.filter(r => r.type === selectedFilter);
  }, [searchResults, selectedFilter]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden my-6 sm:my-10 text-right animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Header Bar */}
        <div className="p-4 sm:p-6 border-b border-stone-200 bg-stone-50/70">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 text-red-700 absolute right-4 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ابحث في الأخبار، الفعاليات، المبادرات، الأمانات، القيادات، استمارة العضوية..."
              className="w-full bg-white border-2 border-stone-300 focus:border-red-700 rounded-2xl pr-12 pl-12 py-3.5 text-sm sm:text-base font-bold text-stone-900 placeholder:text-stone-400 focus:outline-hidden transition-all shadow-inner"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute left-4 p-1 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-200 transition-colors cursor-pointer"
                title="مسح نص البحث"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="absolute left-4 text-xs font-bold text-stone-400 hover:text-stone-700 bg-stone-200/60 px-2 py-1 rounded-md cursor-pointer"
              >
                ESC
              </button>
            )}
          </div>

          {/* Quick Suggestions Tags */}
          {!query && (
            <div className="mt-4 space-y-2">
              <span className="text-[11px] font-bold text-stone-500 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                <span>اقتراحات شائعة للبحث السريع:</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SUGGESTIONS.map((tag, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setQuery(tag)}
                    className="text-xs bg-white hover:bg-red-50 text-stone-700 hover:text-red-700 border border-stone-300 hover:border-red-300 font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-2xs"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category Filter Tabs (when query exists) */}
          {query.trim() && searchResults.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto mt-4 pt-3 border-t border-stone-200 text-xs font-bold scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedFilter('all')}
                className={`px-3 py-1.5 rounded-xl transition-colors shrink-0 cursor-pointer ${
                  selectedFilter === 'all'
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                الكل ({searchResults.length})
              </button>

              {searchResults.some(r => r.type === 'news') && (
                <button
                  type="button"
                  onClick={() => setSelectedFilter('news')}
                  className={`px-3 py-1.5 rounded-xl transition-colors shrink-0 cursor-pointer ${
                    selectedFilter === 'news'
                      ? 'bg-red-700 text-white shadow-xs'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  الأخبار ({searchResults.filter(r => r.type === 'news').length})
                </button>
              )}

              {searchResults.some(r => r.type === 'event') && (
                <button
                  type="button"
                  onClick={() => setSelectedFilter('event')}
                  className={`px-3 py-1.5 rounded-xl transition-colors shrink-0 cursor-pointer ${
                    selectedFilter === 'event'
                      ? 'bg-red-700 text-white shadow-xs'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  الفعاليات ({searchResults.filter(r => r.type === 'event').length})
                </button>
              )}

              {searchResults.some(r => r.type === 'initiative') && (
                <button
                  type="button"
                  onClick={() => setSelectedFilter('initiative')}
                  className={`px-3 py-1.5 rounded-xl transition-colors shrink-0 cursor-pointer ${
                    selectedFilter === 'initiative'
                      ? 'bg-red-700 text-white shadow-xs'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  المبادرات ({searchResults.filter(r => r.type === 'initiative').length})
                </button>
              )}

              {searchResults.some(r => r.type === 'secretariat') && (
                <button
                  type="button"
                  onClick={() => setSelectedFilter('secretariat')}
                  className={`px-3 py-1.5 rounded-xl transition-colors shrink-0 cursor-pointer ${
                    selectedFilter === 'secretariat'
                      ? 'bg-red-700 text-white shadow-xs'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  الأمانات ({searchResults.filter(r => r.type === 'secretariat').length})
                </button>
              )}

              {searchResults.some(r => r.type === 'leader') && (
                <button
                  type="button"
                  onClick={() => setSelectedFilter('leader')}
                  className={`px-3 py-1.5 rounded-xl transition-colors shrink-0 cursor-pointer ${
                    selectedFilter === 'leader'
                      ? 'bg-red-700 text-white shadow-xs'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  القيادات ({searchResults.filter(r => r.type === 'leader').length})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Results Container */}
        <div className="max-h-[60vh] overflow-y-auto p-4 sm:p-6 divide-y divide-stone-100">
          {!query.trim() ? (
            <div className="py-12 text-center text-stone-400 space-y-3">
              <Search className="w-12 h-12 text-stone-300 mx-auto" />
              <h4 className="font-extrabold text-stone-700 text-base">محرك البحث الموحد للموقع الرسمي</h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
                اكتب أي كلمة، عبارة، أو اسم قيادة، للوصول الفوري للمحتوى المنشور في أمانة قسم ثالث أكتوبر.
              </p>
            </div>
          ) : filteredResults.length > 0 ? (
            <div className="space-y-3">
              <div className="text-xs font-bold text-stone-500 px-1">
                تم العثور على {filteredResults.length} نتيجة مطابقة:
              </div>

              {filteredResults.map(item => (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectResult(item);
                    onClose();
                  }}
                  className="bg-white hover:bg-stone-50 border border-stone-200 hover:border-red-400 rounded-2xl p-3.5 sm:p-4 transition-all cursor-pointer group shadow-2xs hover:shadow-md flex items-start gap-3.5 sm:gap-4"
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-stone-100 shrink-0 border border-stone-200 relative">
                    <img
                      src={item.imageUrl || data.settings?.officialLogo}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Text details */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                          item.type === 'news'
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : item.type === 'event'
                            ? 'bg-amber-50 text-amber-900 border border-amber-200'
                            : item.type === 'initiative'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : item.type === 'secretariat'
                            ? 'bg-blue-50 text-blue-900 border border-blue-200'
                            : item.type === 'leader'
                            ? 'bg-purple-50 text-purple-900 border border-purple-200'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        {item.typeLabel}
                      </span>

                      {item.date && (
                        <span className="text-[11px] text-stone-400 font-mono">
                          {item.date}
                        </span>
                      )}
                    </div>

                    <h4 className="font-extrabold text-stone-900 text-sm sm:text-base group-hover:text-red-700 transition-colors line-clamp-1">
                      {item.title}
                    </h4>

                    {item.subtitle && (
                      <p className="text-[11px] font-semibold text-amber-800 line-clamp-1">
                        {item.subtitle}
                      </p>
                    )}

                    <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">
                      {item.snippet}
                    </p>
                  </div>

                  {/* Navigation Icon */}
                  <div className="self-center pl-1 text-stone-300 group-hover:text-red-700 transition-colors shrink-0">
                    <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-stone-500 space-y-3">
              <Search className="w-12 h-12 text-stone-300 mx-auto" />
              <h4 className="font-extrabold text-stone-900 text-base">
                لم نجد أي نتائج تطابق «{query}»
              </h4>
              <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
                تأكد من كتابة الكلمات بشكل صحيح، أو جرّب استخدام كلمات عامة ومختصرة (مثل: «مبادرة»، «أمانة»، «تنظيم»، «أكتوبر»).
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer"
                >
                  إعادة ضبط البحث
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs text-stone-400 px-6">
          <span>حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر</span>
          <button
            onClick={onClose}
            className="text-stone-600 hover:text-stone-900 font-bold cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
