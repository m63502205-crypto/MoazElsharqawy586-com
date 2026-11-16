import React, { useMemo } from 'react';
import {
  SpecializedSecretariat,
  SecretariatMember,
  SecretariatLeader,
  PartyLeader
} from '../types';
import { UserCheck, Megaphone } from 'lucide-react';

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
  const defaultMediaSecretariatId = useMemo(() => {
    const mediaSec = (secretariats || []).find(
      s =>
        s.name?.includes('إعلام') ||
        s.name?.includes('اعلام') ||
        s.slug?.toLowerCase().includes('media')
    );
    return mediaSec?.id || '';
  }, [secretariats]);

  const directoryOptions = useMemo(() => {
    const map = new Map<string, PersonDirectoryOption>();
    const secNameById = new Map<string, string>();
    (secretariats || []).forEach(s => {
      secNameById.set(s.id, s.name);
    });

    const addOption = (
      name?: string,
      role?: string,
      secretariatId?: string
    ) => {
      const cleanName = (name || '').trim();
      if (!cleanName) return;
      const cleanSecId = (secretariatId || '').trim();
      const dedupeKey = `${cleanName.toLowerCase()}__${cleanSecId}`;
      if (map.has(dedupeKey)) return;
      const secName = cleanSecId ? secNameById.get(cleanSecId) || 'أمانة قسم ثالث أكتوبر' : 'غير مقيد بأمانة محددة';
      const isMediaSecretariat =
        secName.includes('إعلام') ||
        secName.includes('اعلام') ||
        (role || '').includes('إعلام') ||
        (role || '').includes('اعلام');

      map.set(dedupeKey, {
        key: dedupeKey,
        name: cleanName,
        role: (role || '').trim(),
        secretariatId: cleanSecId,
        secretariatName: secName,
        isMediaSecretariat
      });
    };

    // 1. Secretariats -> Secretary & Assistant Secretaries
    (secretariats || []).forEach(sec => {
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
    });

    // 2. Secretariat Members
    (secretariatMembers || []).forEach(m => {
      addOption(m.name, m.bureauTitle || m.role || 'عضو هيئة مكتب', m.secretariatId);
    });

    // 3. Secretariat Leaders
    (secretariatLeaders || []).forEach(l => {
      addOption(l.name, l.title, l.specializedSecretariatId);
    });

    // 4. Party Leaders
    (partyLeaders || []).forEach(p => {
      addOption(p.name, p.position, p.specializedSecretariatId);
    });

    return Array.from(map.values());
  }, [secretariats, secretariatMembers, secretariatLeaders, partyLeaders]);

  const sortedPublisherOptions = useMemo(() => {
    return [...directoryOptions].sort((a, b) => {
      if (a.isMediaSecretariat && !b.isMediaSecretariat) return -1;
      if (!a.isMediaSecretariat && b.isMediaSecretariat) return 1;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [directoryOptions]);

  const sortedAuthorOptions = useMemo(() => {
    return [...directoryOptions].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [directoryOptions]);

  return (
    <div className={`grid grid-cols-1 ${compact ? 'gap-2.5' : 'md:grid-cols-2 gap-3'}`}>
      {/* 1. Author / Executor */}
      <div className={`bg-stone-50 border border-stone-200 rounded-2xl space-y-2 ${compact ? 'p-2.5' : 'p-3.5'}`}>
        <div className="flex items-center gap-1.5 text-stone-900 font-black text-xs border-b border-stone-200/80 pb-1.5">
          <UserCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>{authorHeading}</span>
        </div>

        {sortedAuthorOptions.length > 0 && (
          <div>
            <select
              value=""
              onChange={e => {
                const chosen = sortedAuthorOptions.find(o => o.key === e.target.value);
                if (!chosen) return;
                onChange({
                  authorName: chosen.name,
                  authorPosition: chosen.role,
                  authorSecretariatId: chosen.secretariatId
                });
              }}
              className="w-full border border-stone-300 rounded-xl px-2.5 py-1.5 text-[11px] bg-white text-stone-700 font-bold"
            >
              <option value="">-- اختيار سريع من سجل الأعضاء والقيادات --</option>
              {sortedAuthorOptions.map(opt => (
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
            {(secretariats || []).map(sec => (
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

        {sortedPublisherOptions.length > 0 && (
          <div>
            <select
              value=""
              onChange={e => {
                const chosen = sortedPublisherOptions.find(o => o.key === e.target.value);
                if (!chosen) return;
                onChange({
                  publisherName: chosen.name,
                  publisherPosition: chosen.role || 'مسؤول النشر — أمانة الإعلام',
                  publisherSecretariatId: chosen.secretariatId || defaultMediaSecretariatId
                });
              }}
              className="w-full border border-red-200 rounded-xl px-2.5 py-1.5 text-[11px] bg-white text-stone-700 font-bold"
            >
              <option value="">-- اختيار مسؤول النشر (أمانة الإعلام أو الأعضاء) --</option>
              {sortedPublisherOptions.map(opt => (
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
            {(secretariats || []).map(sec => (
              <option key={sec.id} value={sec.id}>{sec.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
