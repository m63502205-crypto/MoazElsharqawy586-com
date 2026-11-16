import React, { useState } from 'react';
import { Mail, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { SiteSettings } from '../types';
import { api } from '../api';

interface FooterProps {
  settings: SiteSettings;
  setCurrentView: (view: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ settings, setCurrentView }) => {
  const [email, setEmail] = useState('');
  const [topicNews, setTopicNews] = useState(true);
  const [topicEvents, setTopicEvents] = useState(true);
  const [topicInitiatives, setTopicInitiatives] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = email.trim();
    if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned)) {
      setFeedback({ type: 'error', text: 'يرجى إدخال بريد إلكتروني صحيح.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await api.subscribeNewsletter({
        email: cleaned,
        topics: {
          news: topicNews,
          events: topicEvents,
          initiatives: topicInitiatives
        }
      });
      setFeedback({ type: 'success', text: res.message });
      setEmail('');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'تعذر تسجيل البريد الإلكتروني، يرجى المحاولة مجدداً.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <footer className="bg-stone-900 text-stone-300 border-t-4 border-amber-600 no-print">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center flex flex-col items-center">
        {/* Newsletter Email Subscription Box (اشترك لتصلك الأخبار والفعاليات فور النشر) */}
        <div className="w-full max-w-2xl mb-10 bg-stone-950/80 border border-amber-500/30 rounded-3xl p-6 sm:p-8 text-right shadow-xl">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-red-700/90 text-amber-300 flex items-center justify-center shrink-0 shadow-md">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">
                اشترك في نشرة الأخبار والفعاليات الفورية
              </h3>
              <p className="text-xs text-stone-400 mt-0.5 leading-relaxed">
                سجّل بريدك الإلكتروني لتصلك الأخبار والفعاليات والمبادرات فور نشرها مباشرة.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubscribe} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="email"
                dir="ltr"
                required
                placeholder="example@domain.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                aria-label="البريد الإلكتروني للاشتراك في الأخبار والفعاليات"
                className="flex-1 bg-stone-900 border border-stone-700 focus:border-amber-400 rounded-xl px-4 py-3 text-sm text-white placeholder:text-stone-500 focus:outline-hidden text-left"
              />
              <button
                type="submit"
                disabled={submitting}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-60 text-stone-950 font-black text-xs sm:text-sm px-6 py-3 rounded-xl cursor-pointer flex items-center justify-center gap-2 shrink-0 transition-all shadow-md"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? 'جاري التسجيل...' : 'اشتراك فوري'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-stone-300 pt-1">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={topicNews}
                  onChange={e => setTopicNews(e.target.checked)}
                  className="w-3.5 h-3.5 accent-amber-500 rounded"
                />
                <span>الأخبار والبيانات</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={topicEvents}
                  onChange={e => setTopicEvents(e.target.checked)}
                  className="w-3.5 h-3.5 accent-amber-500 rounded"
                />
                <span>الفعاليات والأنشطة</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={topicInitiatives}
                  onChange={e => setTopicInitiatives(e.target.checked)}
                  className="w-3.5 h-3.5 accent-amber-500 rounded"
                />
                <span>المبادرات المجتمعية</span>
              </label>
            </div>

            {feedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-950/70 border border-emerald-600/50 text-emerald-300'
                    : 'bg-red-950/70 border border-red-600/50 text-red-300'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}
          </form>
        </div>

        {/* Centered Golden Emblem */}
        <div className="mb-6 relative group">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white border border-amber-500/40 p-2 shadow-2xl flex items-center justify-center">
            <img
              src={settings.officialLogo || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
              alt="شعار حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر"
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

        {/* Separator */}
        <div className="w-24 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent my-6" />

        {/* Copyright */}
        <div className="flex items-center justify-center w-full text-xs text-stone-500 border-t border-stone-900 pt-6">
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
