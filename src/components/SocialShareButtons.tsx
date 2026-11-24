import React, { useState } from 'react';
import { Share2, Check, Copy, MessageCircle, Twitter, Send } from 'lucide-react';

interface SocialShareButtonsProps {
  title: string;
  summary?: string;
  itemType: 'news' | 'event' | 'initiative';
  itemId?: string;
  imageUrl?: string;
  url?: string;
  compact?: boolean;
  dark?: boolean;
}

export const SocialShareButtons: React.FC<SocialShareButtonsProps> = ({
  title,
  summary,
  itemType,
  itemId,
  imageUrl,
  url,
  compact = false,
  dark = false
}) => {
  const [copied, setCopied] = useState(false);

  // Compute shareable URL: use direct server preview URL so social bots (WhatsApp, Facebook) unfurl the exact item image
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const routePath = itemType === 'news' ? 'news' : itemType === 'initiative' ? 'initiative' : 'events';
  const shareUrl = url || (itemId ? `${baseUrl}/${routePath}/${encodeURIComponent(itemId)}` : `${baseUrl}/${routePath}`);

  const cleanTitle = title.trim();
  const cleanSummary = summary ? summary.replace(/\r?\n/g, ' ').slice(0, 140).trim() + '...' : '';
  const typeIcon = itemType === 'news' ? '📰' : itemType === 'event' ? '📅' : '🤝';

  const waText = `${typeIcon} *${cleanTitle}*\n\n${cleanSummary ? cleanSummary + '\n\n' : ''}🏛️ حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر\n${shareUrl}`;
  const waHref = `https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`;
  const fbHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const twHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(cleanTitle)}&url=${encodeURIComponent(shareUrl)}`;
  const tgHref = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(cleanTitle)}`;

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy share link:', err);
    }
  };

  if (compact) {
    return (
      <div
        className={`flex flex-wrap items-center gap-1.5 pt-2.5 border-t text-xs ${
          dark ? 'border-white/10' : 'border-stone-100'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <span className={`text-[11px] font-bold flex items-center gap-1 ${dark ? 'text-stone-300' : 'text-stone-500'}`}>
          <Share2 className={`w-3.5 h-3.5 ${dark ? 'text-amber-400' : 'text-amber-600'}`} />
          <span>مشاركة:</span>
        </span>

        {/* WhatsApp */}
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title="مشاركة عبر واتساب"
          aria-label="مشاركة عبر واتساب"
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
            dark
              ? 'bg-emerald-500/15 hover:bg-emerald-600 text-emerald-300 hover:text-white border-emerald-500/30'
              : 'bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 border-emerald-200'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
        </a>

        {/* Facebook */}
        <a
          href={fbHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title="مشاركة عبر فيسبوك"
          aria-label="مشاركة عبر فيسبوك"
          className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs transition-colors cursor-pointer border ${
            dark
              ? 'bg-blue-500/15 hover:bg-blue-600 text-blue-300 hover:text-white border-blue-500/30'
              : 'bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 border-blue-200'
          }`}
        >
          f
        </a>

        {/* X / Twitter */}
        <a
          href={twHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title="مشاركة عبر إكس (تويتر)"
          aria-label="مشاركة عبر إكس (تويتر)"
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
            dark
              ? 'bg-white/10 hover:bg-black text-stone-200 hover:text-white border-white/15'
              : 'bg-stone-100 hover:bg-black hover:text-white text-stone-800 border-stone-200'
          }`}
        >
          <Twitter className="w-3.5 h-3.5" />
        </a>

        {/* Telegram */}
        <a
          href={tgHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title="مشاركة عبر تيليجرام"
          aria-label="مشاركة عبر تيليجرام"
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
            dark
              ? 'bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-white border-sky-500/30'
              : 'bg-sky-50 hover:bg-sky-500 hover:text-white text-sky-600 border-sky-200'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
        </a>

        {/* Copy Link */}
        <button
          type="button"
          onClick={handleCopyLink}
          title="نسخ رابط المشاركة"
          className={`h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold transition-all cursor-pointer border ${
            copied
              ? 'bg-emerald-600 text-white border-emerald-600'
              : dark
                ? 'bg-white/10 hover:bg-white/20 text-stone-200 border-white/15'
                : 'bg-stone-50 hover:bg-stone-200 text-stone-700 border-stone-200'
          }`}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              <span>تم النسخ!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>نسخ الرابط</span>
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl p-3 border space-y-2 mt-4 ${
        dark ? 'bg-stone-900 border-white/10' : 'bg-stone-50 border-stone-200/80'
      }`}
      onClick={e => e.stopPropagation()}
    >
      <div className={`flex items-center justify-between text-xs font-bold ${dark ? 'text-stone-200' : 'text-stone-700'}`}>
        <span className="flex items-center gap-1.5">
          <Share2 className={`w-4 h-4 ${dark ? 'text-amber-400' : 'text-amber-600'}`} />
          <span>مشاركة هذا المحتوى عبر وسائل التواصل:</span>
        </span>
        {copied && (
          <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1 bg-emerald-100 px-2 py-0.5 rounded-md">
            <Check className="w-3 h-3" />
            <span>تم نسخ الرابط بنجاح!</span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* WhatsApp */}
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>واتساب</span>
        </a>

        {/* Facebook */}
        <a
          href={fbHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
        >
          <span className="font-black text-xs">f</span>
          <span>فيسبوك</span>
        </a>

        {/* X / Twitter */}
        <a
          href={twHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 bg-stone-900 hover:bg-black text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
        >
          <Twitter className="w-3.5 h-3.5" />
          <span>إكس (تويتر)</span>
        </a>

        {/* Telegram */}
        <a
          href={tgHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
        >
          <Send className="w-3.5 h-3.5" />
          <span>تيليجرام</span>
        </a>

        {/* Copy Link */}
        <button
          type="button"
          onClick={handleCopyLink}
          className={`inline-flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer border shadow-xs ${
            copied
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-300'
          }`}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'تم النسخ!' : 'نسخ الرابط'}</span>
        </button>
      </div>
    </div>
  );
};
