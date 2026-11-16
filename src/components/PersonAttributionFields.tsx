import React, { useMemo, useState } from 'react';
import {
  SpecializedSecretariat,
  SecretariatMember,
  SecretariatLeader,
  PartyLeader
} from '../types';
import { UserCheck, Megaphone, Search, X } from 'lucide-react';
import { normalizeArabicPersonName } from '../utils/personSecretariat';

export interface AttributionPatch {
  authorName?: string;
  authorPosition?: string;
  authorSecretariatId?: string;
  publisherName?: string;
  publisherPosition?: string;
  publisherSecretariatId?: string;
}

interface PersonDirectoryOption {
  key: string;
  name: string;
  role: string;
  secretariatId: string;
  secretariatName: string;
  isMediaSecretariat: boolean;
  sortIndex: number;
  searchText: string;
}

interface PersonAttributionFieldsProps {
  authorName?: string;
  authorPosition?: string;
  authorSecretariatId?: string;
  publisherName?: string;
  publisherPosition?: string;
  publisherSecretariatId?: string;
  onChange: (patch: AttributionPatch) => void;
  secretariats: SpecializedSecretariat[];
  secretariatMembers: SecretariatMember[];
  secretariatLeaders: SecretariatLeader[];
  partyLeaders: PartyLeader[];
  authorHeading?: string;
  publisherHeading?: string;
  compact?: boolean;
}

function normalizeSearchToken(input?: string | null): string {
  if (!input) return '';
  return String(input)
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export const PersonAttributionFields: React.FC<PersonAttributionFieldsProps> = ({
  authorName,
  authorPosition,
  authorSecretariatId,
  publisherName,
  publisherPosition,
  publisherSecretariatId,
  onChange,
  secretariats,
  secretariatMembers,
  secretariatLeaders,
  partyLeaders,
  authorHeading = 'مُعد / كاتب المحتوى (أو القائم بالعمل)',
  publisherHeading = 'مسؤول النشر والرفع على المنصة (أمانة الإعلام)',
  compact = false
}) => {
  const [authorQuery, setAuthorQuery] = useState('');
  const [authorSearchFocused, setAuthorSearchFocused] = useState(false);
  const [publisherQuery, setPublisherQuery] = useState('');
  const [publisherSearchFocused, setPublisherSearchFocused] = useState(false);

  const orderedSecretariats = useMemo(() => {
    return [...(secretariats || [])].sort(
      (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)
    );
  }, [secretariats]);

  const defaultMediaSecretariatId = useMemo(() => {
    const mediaSec = orderedSecretariats.find(
      s =>
        s.name?.includes('إعلام') ||
        s.name?.includes('اعلام') ||
        s.slug?.toLowerCase().includes('media')
    );
    return mediaSec?.id || '';
  }, [orderedSecretariats]);

  // Preserve exact configured hierarchical & admin-sorted order:
  // 1. Party Leaders (in admin `order`)
  // 2. Secretariat Leaders (in admin `order`)
  // 3. Each Secretariat (in admin `order`): Secretary -> Assistant Secretaries -> Bureau / Members (by tier & order)
  const directoryOptions = useMemo(() => {
    const map = new Map<string, PersonDirectoryOption>();
    const secNameById = new Map<string, string>();
    orderedSecretariats.forEach(s => {
      secNameById.set(s.id, s.name);
    });

    let seq = 0;
    const addOption = (
      name?: string,
      role?: string,
      secretariatId?: string
    ) => {
      const cleanName = (name || '').trim();
      if (!cleanName) return;
      const cleanSecId = (secretariatId || '').trim();
      const dedupeKey = `${normalizeArabicPersonName(cleanName) || cleanName.toLowerCase()}__${cleanSecId}`;
      if (map.has(dedupeKey)) return;

      const secName = cleanSecId
        ? secNameById.get(cleanSecId) || 'أمانة قسم ثالث أكتوبر'
        : 'القيادة العامة / غير مقيد بأمانة تخصصية';

      const cleanRole = (role || '').trim();
      const isMediaSecretariat =
        secName.includes('إعلام') ||
        secName.includes('اعلام') ||
        cleanRole.includes('إعلام') ||
        cleanRole.includes('اعلام');

      const searchText = [
        normalizeSearchToken(cleanName),
        normalizeArabicPersonName(cleanName),
        normalizeSearchToken(cleanRole),
        normalizeSearchToken(secName)
      ]
        .filter(Boolean)
        .join(' | ');

      map.set(dedupeKey, {
        key: dedupeKey,
        name: cleanName,
        role: cleanRole,
        secretariatId: cleanSecId,
        secretariatName: secName,
        isMediaSecretariat,
        sortIndex: seq++,
        searchText
      });
    };

    // 1. Party Leaders in configured sortOrder
    const orderedPartyLeaders = [...(partyLeaders || [])].sort(
      (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)
    );
    orderedPartyLeaders.forEach(p => {
      addOption(p.name, p.position, p.specializedSecretariatId);
    });

    // 2. Secretariat Leaders in configured sortOrder
    const orderedSecLeaders = [...(secretariatLeaders || [])].sort(
      (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)
    );
    orderedSecLeaders.forEach(l => {
      addOption(l.name, l.title, l.specializedSecretariatId);
    });

    // 3. Each Specialized Secretariat in configured order: Secretary -> Assistants -> Members
    const tierRank = (tier?: string) => {
      switch (tier) {
        case 'secretary':
          return 0;
        case 'assistant_secretary':
          return 1;
        case 'bureau':
          return 2;
        default:
          return 3;
      }
    };

    orderedSecretariats.forEach(sec => {
      if (sec.secretaryName?.trim()) {
        addOption(sec.secretaryName, `أمين ${sec.name}`, sec.id);
      }

      if (sec.assistantSecretaries && sec.assistantSecretaries.length > 0) {
        sec.assistantSecretaries.forEach(a => {
          if (a.name?.trim()) {
            addOption(a.name, a.title || `الأمين المساعد ل${sec.name}`, sec.id);
          }
        });
      } else if (sec.assistantSecretaryName?.trim()) {
        addOption(sec.assistantSecretaryName, `الأمين المساعد ل${sec.name}`, sec.id);
      }

      const membersForSec = (secretariatMembers || [])
        .filter(m => m.secretariatId === sec.id)
        .sort((a, b) => tierRank(a.tier) - tierRank(b.tier));

      membersForSec.forEach(m => {
        addOption(m.name, m.bureauTitle || m.role || 'عضو هيئة مكتب', m.secretariatId);
      });
    });

    // 4. Any remaining members without matched secretariat
    (secretariatMembers || []).forEach(m => {
      addOption(m.name, m.bureauTitle || m.role || 'عضو هيئة مكتب', m.secretariatId);
    });

    return Array.from(map.values()).sort((a, b) => a.sortIndex - b.sortIndex);
  }, [orderedSecretariats, secretariatMembers, secretariatLeaders, partyLeaders]);

  // Preserve admin order for Author too (NO alphabetical scrambling!)
  const orderedAuthorOptions = directoryOptions;

  // Preserve admin order for Publisher, keeping Media Secretariat personnel pinned first in their exact order
  const orderedPublisherOptions = useMemo(() => {
    const mediaOnly = directoryOptions.filter(o => o.isMediaSecretariat);
    const others = directoryOptions.filter(o => !o.isMediaSecretariat);
    return [...mediaOnly, ...others];
  }, [directoryOptions]);

  const filterOptions = (options: PersonDirectoryOption[], query: string) => {
    const q = normalizeSearchToken(query);
    const qNorm = normalizeArabicPersonName(query);
    if (!q && !qNorm) return options;
    return options.filter(opt => {
      if (q && opt.searchText.includes(q)) return true;
      if (qNorm && opt.searchText.includes(qNorm)) return true;
      return false;
    });
  };

  const filteredAuthorOptions = useMemo(
    () => filterOptions(orderedAuthorOptions, authorQuery),
    [orderedAuthorOptions, authorQuery]
  );

  const filteredPublisherOptions = useMemo(
    () => filterOptions(orderedPublisherOptions, publisherQuery),
    [orderedPublisherOptions, publisherQuery]
  );

  const selectAuthor = (chosen: PersonDirectoryOption) => {
    onChange({
      authorName: chosen.name,
      authorPosition: chosen.role,
      authorSecretariatId: chosen.secretariatId
    });
    setAuthorQuery('');
    setAuthorSearchFocused(false);
  };

  const selectPublisher = (chosen: PersonDirectoryOption) => {
    onChange({
      publisherName: chosen.name,
      publisherPosition: chosen.role || 'مسؤول النشر — أمانة الإعلام',
      publisherSecretariatId: chosen.secretariatId || defaultMediaSecretariatId
    });
    setPublisherQuery('');
    setPublisherSearchFocused(false);
  };

  return (
    <div className={`grid grid-cols-1 ${compact ? 'gap-2.5' : 'md:grid-cols-2 gap-3'}`}>
      {/* 1. Author / Executor */}
      <div className={`bg-stone-50 border border-stone-200 rounded-2xl space-y-2 ${compact ? 'p-2.5' : 'p-3.5'}`}>
        <div className="flex items-center gap-1.5 text-stone-900 font-black text-xs border-b border-stone-200/80 pb-1.5">
          <UserCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>{authorHeading}</span>
        </div>

        {orderedAuthorOptions.length > 0 && (
          <div className="space-y-1.5 relative">
            {/* Live Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="ابحث بالاسم أو المنصب أو الأمانة..."
                value={authorQuery}
                onFocus={() => setAuthorSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setAuthorSearchFocused(false), 180)}
                onChange={e => {
                  setAuthorQuery(e.target.value);
                  setAuthorSearchFocused(true);
                }}
                className="w-full border border-amber-300 focus:border-amber-500 rounded-xl pr-8 pl-7 py-1.5 text-xs bg-white text-stone-900 placeholder:text-stone-400 font-semibold focus:outline-hidden"
              />
              {authorQuery && (
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setAuthorQuery('')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                  aria-label="مسح البحث"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Instant Search Results Dropdown */}
            {(authorSearchFocused || authorQuery.trim().length > 0) && (
              <div className="border border-amber-300 bg-white rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-stone-100 z-20 relative">
                {filteredAuthorOptions.length === 0 ? (
                  <div className="p-2.5 text-[11px] text-stone-500 text-center">
                    لا توجد نتائج مطابقة في السجل، يمكنك كتابة الاسم يدوياً بالأسفل.
                  </div>
                ) : (
                  filteredAuthorOptions.slice(0, 30).map(opt => (
                    <button
                      type="button"
                      key={opt.key}
                      onMouseDown={e => {
                        e.preventDefault();
                        selectAuthor(opt);
                      }}
                      className="w-full text-right px-3 py-2 hover:bg-amber-50 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-black text-stone-900 block truncate">
                          {opt.name}
                        </span>
                        {opt.role && (
                          <span className="text-[10px] font-semibold text-amber-800 block truncate">
                            {opt.role}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-stone-500 shrink-0 max-w-[45%] truncate">
                        {opt.secretariatName}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Ordered Quick Select */}
            <select
              value=""
              onChange={e => {
                const chosen = orderedAuthorOptions.find(o => o.key === e.target.value);
                if (chosen) selectAuthor(chosen);
              }}
              className="w-full border border-stone-300 rounded-xl px-2.5 py-1.5 text-[11px] bg-white text-stone-700 font-bold"
            >
              <option value="">-- أو اختر مباشرة حسب الترتيب ({orderedAuthorOptions.length}) --</option>
              {orderedAuthorOptions.map(opt => (
                <option key={opt.key} value={opt.key}>
                  {opt.name} {opt.role ? `(${opt.role})` : ''} — {opt.secretariatName}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-bold text-stone-700 mb-0.5">
              الاسم
            </label>
            <input
              type="text"
              placeholder="مثال: أ. فلان الفلاني"
              value={authorName || ''}
              onChange={e => onChange({ authorName: e.target.value })}
              className="w-full border border-stone-300 rounded-xl px-2.5 py-1.5 text-xs bg-white text-stone-900"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-700 mb-0.5">
              المنصب / الصفة
            </label>
            <input
              type="text"
              placeholder="مثال: أمين الأمانة / أمين مساعد"
              value={authorPosition || ''}
              onChange={e => onChange({ authorPosition: e.target.value })}
              className="w-full border border-stone-300 rounded-xl px-2.5 py-1.5 text-xs bg-white text-stone-900"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-stone-700 mb-0.5">
            الأمانة المقيد بها (للانتقال المباشر عند الضغط على الاسم)
          </label>
          <select
            value={authorSecretariatId || ''}
            onChange={e => onChange({ authorSecretariatId: e.target.value })}
            className="w-full border border-stone-300 rounded-xl px-2.5 py-1.5 text-xs bg-white text-stone-900"
          >
            <option value="">تحديد تلقائي حسب الاسم / غير محدد</option>
            {orderedSecretariats.map(sec => (
              <option key={sec.id} value={sec.id}>{sec.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. Publisher (Media Secretariat / Uploader) */}
      <div className={`bg-red-50/40 border border-red-200/80 rounded-2xl space-y-2 ${compact ? 'p-2.5' : 'p-3.5'}`}>
        <div className="flex items-center gap-1.5 text-red-900 font-black text-xs border-b border-red-200/70 pb-1.5">
          <Megaphone className="w-3.5 h-3.5 text-red-700 shrink-0" />
          <span>{publisherHeading}</span>
        </div>

        {orderedPublisherOptions.length > 0 && (
          <div className="space-y-1.5 relative">
            {/* Live Search Box for Publisher */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-red-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="ابحث عن مسؤول النشر بالاسم أو المنصب أو الأمانة..."
                value={publisherQuery}
                onFocus={() => setPublisherSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setPublisherSearchFocused(false), 180)}
                onChange={e => {
                  setPublisherQuery(e.target.value);
                  setPublisherSearchFocused(true);
                }}
                className="w-full border border-red-300 focus:border-red-600 rounded-xl pr-8 pl-7 py-1.5 text-xs bg-white text-stone-900 placeholder:text-stone-400 font-semibold focus:outline-hidden"
              />
              {publisherQuery && (
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setPublisherQuery('')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                  aria-label="مسح البحث"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Instant Search Results Dropdown */}
            {(publisherSearchFocused || publisherQuery.trim().length > 0) && (
              <div className="border border-red-300 bg-white rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-stone-100 z-20 relative">
                {filteredPublisherOptions.length === 0 ? (
                  <div className="p-2.5 text-[11px] text-stone-500 text-center">
                    لا توجد نتائج مطابقة في السجل، يمكنك كتابة اسم مسؤول النشر يدوياً بالأسفل.
                  </div>
                ) : (
                  filteredPublisherOptions.slice(0, 30).map(opt => (
                    <button
                      type="button"
                      key={opt.key}
                      onMouseDown={e => {
                        e.preventDefault();
                        selectPublisher(opt);
                      }}
                      className="w-full text-right px-3 py-2 hover:bg-red-50 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-black text-stone-900 block truncate">
                          {opt.isMediaSecretariat ? '📢 ' : ''}{opt.name}
                        </span>
                        {opt.role && (
                          <span className="text-[10px] font-semibold text-red-700 block truncate">
                            {opt.role}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-stone-500 shrink-0 max-w-[45%] truncate">
                        {opt.secretariatName}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Ordered Quick Select */}
            <select
              value=""
              onChange={e => {
                const chosen = orderedPublisherOptions.find(o => o.key === e.target.value);
                if (chosen) selectPublisher(chosen);
              }}
              className="w-full border border-red-200 rounded-xl px-2.5 py-1.5 text-[11px] bg-white text-stone-700 font-bold"
            >
              <option value="">-- أو اختر مسؤول النشر حسب الترتيب ({orderedPublisherOptions.length}) --</option>
              {orderedPublisherOptions.map(opt => (
                <option key={opt.key} value={opt.key}>
                  {opt.isMediaSecretariat ? '📢 ' : ''}{opt.name} {opt.role ? `(${opt.role})` : ''} — {opt.secretariatName}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-bold text-stone-700 mb-0.5">
              اسم مسؤول النشر
            </label>
            <input
              type="text"
              placeholder="مثال: أمين مساعد الإعلام"
              value={publisherName || ''}
              onChange={e =>
                onChange({
                  publisherName: e.target.value,
                  ...(publisherSecretariatId === undefined && defaultMediaSecretariatId
                    ? { publisherSecretariatId: defaultMediaSecretariatId }
                    : {})
                })
              }
              className="w-full border border-red-200 rounded-xl px-2.5 py-1.5 text-xs bg-white text-stone-900"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-700 mb-0.5">
              المنصب بأمانة الإعلام
            </label>
            <input
              type="text"
              placeholder="أمين مساعد الإعلام / مسؤول النشر"
              value={publisherPosition || ''}
              onChange={e => onChange({ publisherPosition: e.target.value })}
              className="w-full border border-red-200 rounded-xl px-2.5 py-1.5 text-xs bg-white text-stone-900"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-stone-700 mb-0.5">
            أمانة مسؤول النشر
          </label>
          <select
            value={publisherSecretariatId || defaultMediaSecretariatId || ''}
            onChange={e => onChange({ publisherSecretariatId: e.target.value })}
            className="w-full border border-red-200 rounded-xl px-2.5 py-1.5 text-xs bg-white text-stone-900"
          >
            <option value="">تحديد تلقائي حسب الاسم / أمانة الإعلام</option>
            {orderedSecretariats.map(sec => (
              <option key={sec.id} value={sec.id}>{sec.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
