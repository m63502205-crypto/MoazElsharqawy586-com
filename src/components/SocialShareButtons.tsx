import React, { useState } from 'react';
import { Share2, Check, Copy, MessageCircle, Twitter, Send } from 'lucide-react';

interface SocialShareButtonsProps {
  title: string;
  summary?: string;
  itemType: 'news' | 'event';
  itemId?: string;
  imageUrl?: string;
  url?: string;
  compact?: boolean;
}

export const SocialShareButtons: React.FC<SocialShareButtonsProps> = ({
  title,
  summary,
  itemType,
  itemId,
  imageUrl,
  url,
  compact = false
}) => {
  const [copied, setCopied] = useState(false);

  // Compute shareable URL: use direct server preview URL so social bots (WhatsApp, Facebook) unfurl the exact news/event image
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const hash = itemType === 'news' ? 'news' : 'events';
  const shareUrl = url || (itemId ? `${baseUrl}/${itemType === 'news' ? 'news' : 'events'}/${itemId}` : `${baseUrl}/#${hash}`);

  const shareText = `${title}\n${summary ? summary.slice(0, 120) + '...\n' : ''}حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر | مصر للجميع`;

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleFacebook = (e: React.MouseEvent) => {
    e.stopPropagation();
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
    window.open(fbUrl, '_blank', 'noopener,noreferrer,width=600,height=500');
  };

  const handleTwitter = (e: React.MouseEvent) => {
    e.stopPropagation();
    const twUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
  };

  const handleTelegram = (e: React.MouseEvent) => {
    e.stopPropagation();
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title)}`;
    window.open(tgUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${title} - ${shareUrl}`);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = `${title} - ${shareUrl}`;
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
        className="flex items-center gap-1.5 pt-2 border-t border-stone-100 text-xs"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-[11px] font-bold text-stone-500 flex items-center gap-1">
          <Share2 className="w-3.5 h-3.5 text-amber-600" />
          <span>مشاركة:</span>
        </span>

        {/* WhatsApp */}
        <button
          type="button"
          onClick={handleWhatsApp}
          title="مشاركة عبر واتساب"
          className="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 flex items-center justify-center transition-colors cursor-pointer border border-emerald-200"
        >
          <MessageCircle className="w-3.5 h-3.5" />
        </button>

        {/* Facebook */}
        <button
          type="button"
          onClick={handleFacebook}
          title="مشاركة عبر فيسبوك"
          className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 flex items-center justify-center font-black text-xs transition-colors cursor-pointer border border-blue-200"
        >
          f
        </button>

        {/* X / Twitter */}
        <button
          type="button"
          onClick={handleTwitter}
          title="مشاركة عبر إكس (تويتر)"
          className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-black hover:text-white text-stone-800 flex items-center justify-center transition-colors cursor-pointer border border-stone-200"
        >
          <Twitter className="w-3.5 h-3.5" />
        </button>

        {/* Telegram */}
        <button
          type="button"
          onClick={handleTelegram}
          title="مشاركة عبر تيليجرام"
          className="w-7 h-7 rounded-lg bg-sky-50 hover:bg-sky-500 hover:text-white text-sky-600 flex items-center justify-center transition-colors cursor-pointer border border-sky-200"
        >
          <Send className="w-3.5 h-3.5" />
        </button>

        {/* Copy Link */}
        <button
          type="button"
          onClick={handleCopyLink}
          title="نسخ رابط المشاركة"
          className={`h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold transition-all cursor-pointer border ${
            copied
              ? 'bg-emerald-600 text-white border-emerald-600'
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
      className="bg-stone-50 rounded-xl p-3 border border-stone-200/80 space-y-2 mt-4"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between text-xs font-bold text-stone-700">
        <span className="flex items-center gap-1.5">
          <Share2 className="w-4 h-4 text-amber-600" />
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
        <button
          type="button"
          onClick={handleWhatsApp}
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>واتساب</span>
        </button>

        {/* Facebook */}
        <button
          type="button"
          onClick={handleFacebook}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
        >
          <span className="font-black text-xs">f</span>
          <span>فيسبوك</span>
        </button>

        {/* X / Twitter */}
        <button
          type="button"
          onClick={handleTwitter}
          className="inline-flex items-center gap-1.5 bg-stone-900 hover:bg-black text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
        >
          <Twitter className="w-3.5 h-3.5" />
          <span>إكس (تويتر)</span>
        </button>

        {/* Telegram */}
        <button
          type="button"
          onClick={handleTelegram}
          className="inline-flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
        >
          <Send className="w-3.5 h-3.5" />
          <span>تيليجرام</span>
        </button>

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
