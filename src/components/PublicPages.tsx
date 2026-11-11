import React, { useState, useEffect } from 'react';
import {
  PublicPortalData,
  SpecializedSecretariat,
  PartyLeader,
  SecretariatLeader,
  Initiative,
  NewsItem,
  EventItem,
  MediaItem,
  ApplicationInquiryResult
} from '../types';
import {
  Users,
  Building2,
  Calendar,
  Newspaper,
  ChevronLeft,
  ChevronRight,
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Play,
  Image as ImageIcon,
  HeartHandshake,
  Award,
  BookOpen,
  ArrowRight,
  Upload,
  UserCheck,
  Search,
  Filter,
  FileSearch,
  Clock,
  CheckCircle,
  XCircle,
  HelpCircle,
  Plus,
  Trash2,
  Save,
  Edit2,
  Sparkles,
  Maximize2,
  X
} from 'lucide-react';
import { api } from '../api';
import { SocialShareButtons } from './SocialShareButtons';
import { trackEvent } from '../utils/analytics';
import { ImageLightboxModal } from './ImageLightboxModal';

interface PublicPagesProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  data: PublicPortalData;
  onRefreshData: () => void;
  selectedSlug?: string;
  setSelectedSlug?: (slug: string) => void;
  selectedNewsId?: string | null;
  onClearSelectedNewsId?: () => void;
}

export const PublicPages: React.FC<PublicPagesProps> = ({
  currentView,
  setCurrentView,
  data,
  onRefreshData,
  selectedSlug,
  setSelectedSlug,
  selectedNewsId,
  onClearSelectedNewsId
}) => {
  const ct = data.settings.customTexts || {};

  // Public visitor view is strictly read-only; admin modifications are exclusively performed via the Admin Panel

  // Modal states for leaders / news
  const [selectedPartyLeader, setSelectedPartyLeader] = useState<PartyLeader | null>(null);
  const [selectedSecLeader, setSelectedSecLeader] = useState<SecretariatLeader | null>(null);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  // Lightbox Modal for high-resolution interactive viewing of images
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxTitle, setLightboxTitle] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const openLightbox = (images: string[], index = 0, title = '') => {
    const valid = images.filter(Boolean);
    if (valid.length === 0) return;
    setLightboxImages(valid);
    setLightboxIndex(index >= 0 && index < valid.length ? index : 0);
    setLightboxTitle(title);
    setLightboxOpen(true);
  };

  // Automated Hero Reel / Slider state ("يقعد يقلب تلقائي")
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const [isHeroHovered, setIsHeroHovered] = useState(false);

  // Construct hero slides
  const heroSlides = React.useMemo(() => {
    const validCustom = (data.settings.heroSlides || []).filter(
      s => s && typeof s.url === 'string' && s.url.trim().length > 0
    );
    if (validCustom.length > 0) {
      return validCustom;
    }
    const list: Array<{
      id: string;
      type: 'video' | 'image';
      url: string;
      posterUrl?: string;
      title?: string;
      caption?: string;
    }> = [];

    if (data.settings.heroVideoUrl) {
      list.push({
        id: 'hero-main-vid',
        type: 'video',
        url: data.settings.heroVideoUrl,
        posterUrl: data.settings.heroPosterUrl || data.settings.entranceImageUrl || '/assets/aistudio/Screenshot_________________Chrome_9f4025ed.jpg',
        title: 'فعاليات حزب الجبهة الوطنية الميدانية',
        caption: 'أمانة قسم ثالث أكتوبر – محافظة الجيزة'
      });
    }

    list.push({
      id: 'hero-entrance',
      type: 'image',
      url: data.settings.entranceImageUrl || '/assets/aistudio/Screenshot_________________Chrome_9f4025ed.jpg',
      title: 'مقر حزب الجبهة الوطنية – قسم ثالث أكتوبر',
      caption: 'المقر الرئيسي للعمل الحزبي وخدمة أهالي أكتوبر'
    });

    if (data.media && data.media.length > 0) {
      data.media.slice(0, 5).forEach((m, idx) => {
        if (m.url && !list.some(s => s.url === m.url)) {
          list.push({
            id: `hero-med-${idx}`,
            type: m.type === 'video' ? 'video' : 'image',
            url: m.url,
            title: m.title || 'أنشطة وفعاليات الحزب',
            caption: m.albumName || 'أمانة قسم ثالث أكتوبر'
          });
        }
      });
    }

    list.push({
      id: 'hero-emblem',
      type: 'image',
      url: data.settings.officialLogo || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg',
      title: 'معاً نبني مستقبلاً مشرقاً لمصر',
      caption: 'حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر'
    });

    return list;
  }, [
    data.settings.heroSlides,
    data.settings.heroVideoUrl,
    data.settings.heroPosterUrl,
    data.settings.entranceImageUrl,
    data.settings.officialLogo,
    data.media
  ]);

  // Auto-flip effect every 4.5 seconds
  useEffect(() => {
    if (heroSlides.length <= 1 || isHeroHovered) return;
    const interval = setInterval(() => {
      setHeroSlideIndex(prev => (prev + 1) % heroSlides.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [heroSlides.length, isHeroHovered]);

  // Sync news selection from URL deep links (#news?id=xxx)
  useEffect(() => {
    if (selectedNewsId && data?.news?.length) {
      const match = data.news.find(n => n.id === selectedNewsId || (n as any).slug === selectedNewsId);
      if (match) {
        setSelectedNews(match);
      }
    }
  }, [selectedNewsId, data?.news]);

  // Filter states
  const [partyLeaderLevelFilter, setPartyLeaderLevelFilter] = useState<string>('all');
  const [newsSearch, setNewsSearch] = useState<string>('');
  const [eventsFilter, setEventsFilter] = useState<'all' | 'upcoming' | 'completed'>('all');

  // Application form states
  const [joinTab, setJoinTab] = useState<'submit' | 'inquire'>('submit');
  const [inquiryQuery, setInquiryQuery] = useState('');
  const [inquiryLoading, setInquiryLoading] = useState(false);
  const [inquiryResult, setInquiryResult] = useState<ApplicationInquiryResult | null>(null);
  const [inquiryError, setInquiryError] = useState<string | null>(null);
  const [hasInquired, setHasInquired] = useState(false);

  const [appForm, setAppForm] = useState({
    fullName: '',
    nationalId: '',
    dateOfBirth: '',
    gender: 'ذكر' as 'ذكر' | 'أنثى',
    maritalStatus: 'أعزب' as 'أعزب' | 'متزوج' | 'أخرى',
    governorate: 'محافظة الجيزة',
    district: 'قسم ثالث أكتوبر',
    address: '',
    phone: '',
    whatsapp: '',
    email: '',
    qualification: '',
    job: '',
    workplace: '',
    skills: '',
    interests: '',
    volunteerExperience: '',
    reasonForJoining: '',
    personalPhotoUrl: '',
    nationalIdFrontUrl: '',
    nationalIdBackUrl: '',
    consentAgreed: false
  });
  const [appSubmitting, setAppSubmitting] = useState(false);
  const [appSuccessResult, setAppSuccessResult] = useState<{ message: string; appNumber: string } | null>(null);
  const [appError, setAppError] = useState<string | null>(null);

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = inquiryQuery.trim();
    if (!q) {
      setInquiryError('يرجى إدخال رقم الطلب أو الرقم القومي للاستعلام');
      return;
    }
    setInquiryLoading(true);
    setInquiryError(null);
    setInquiryResult(null);
    setHasInquired(true);
    try {
      const res = await api.inquireApplication(q);
      setInquiryResult(res);
      trackEvent('inquiry_application', { query_length: q.length, found: res.found });
    } catch (err: any) {
      setInquiryError(err.message || 'حدث خطأ أثناء الاستعلام عن الطلب');
    } finally {
      setInquiryLoading(false);
    }
  };

  // File upload helpers (converting to base64 data URLs)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'personalPhotoUrl' | 'nationalIdFrontUrl' | 'nationalIdBackUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      alert('حجم الملف كبير جداً، يرجى اختيار ملف أقل من 15 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAppForm(prev => ({ ...prev, [field]: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const isFieldReq = (k: string) => {
    return data.settings.membershipFieldRequirements?.[k] !== false; // Default true (mandatory) unless explicitly disabled
  };

  const handleApplicationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppError(null);

    // Validation based on admin requirements (all mandatory by default)
    if (isFieldReq('fullName') && !appForm.fullName.trim()) {
      setAppError('يرجى إدخال الاسم الرباعي كاملاً كما ببطاقة الرقم القومي');
      return;
    }

    if (isFieldReq('nationalId') || appForm.nationalId.trim()) {
      if (!/^\d{14}$/.test(appForm.nationalId.trim())) {
        setAppError('الرقم القومي غير صحيح، يجب أن يتكون من 14 رقماً بالضبط');
        return;
      }
    }

    if (isFieldReq('dateOfBirth') && !appForm.dateOfBirth) {
      setAppError('يرجى تحديد تاريخ الميلاد');
      return;
    }

    if (isFieldReq('gender') && !appForm.gender) {
      setAppError('يرجى تحديد النوع');
      return;
    }

    if (isFieldReq('maritalStatus') && !appForm.maritalStatus) {
      setAppError('يرجى تحديد الحالة الاجتماعية');
      return;
    }

    if (isFieldReq('address') && !appForm.address.trim()) {
      setAppError('يرجى إدخال العنوان التفصيلي');
      return;
    }

    if (isFieldReq('phone') && !appForm.phone.trim()) {
      setAppError('يرجى إدخال رقم الهاتف للتواصل');
      return;
    }

    if (isFieldReq('whatsapp') && !appForm.whatsapp.trim()) {
      setAppError('يرجى إدخال رقم الواتساب للتواصل');
      return;
    }

    if (isFieldReq('email') && !appForm.email.trim()) {
      setAppError('يرجى إدخال البريد الإلكتروني');
      return;
    }

    if (isFieldReq('qualification') && !appForm.qualification.trim()) {
      setAppError('يرجى إدخال المؤهل الدراسي');
      return;
    }

    if (isFieldReq('job') && !appForm.job.trim()) {
      setAppError('يرجى إدخال المهنة / الوظيفة الحالية');
      return;
    }

    if (isFieldReq('workplace') && !appForm.workplace.trim()) {
      setAppError('يرجى إدخال جهة العمل');
      return;
    }

    if (isFieldReq('skills') && !appForm.skills.trim()) {
      setAppError('يرجى ذكر المهارات والخبرات العملية');
      return;
    }

    if (isFieldReq('interests') && !appForm.interests.trim()) {
      setAppError('يرجى تحديد الاهتمامات الحزبية أو الأمانات المفضلة');
      return;
    }

    if (isFieldReq('volunteerExperience') && !appForm.volunteerExperience.trim()) {
      setAppError('يرجى كتابة الخبرات التطوعية السابقة');
      return;
    }

    if (isFieldReq('reasonForJoining') && !appForm.reasonForJoining.trim()) {
      setAppError('يرجى كتابة سبب الرغبة في الانضمام');
      return;
    }

    if (isFieldReq('personalPhotoUrl') && !appForm.personalPhotoUrl) {
      setAppError('يرجى رفع الصورة الشخصية الحديثة (إجباري)');
      return;
    }

    if (isFieldReq('nationalIdFrontUrl') && !appForm.nationalIdFrontUrl) {
      setAppError('يرجى رفع صورة بطاقة الرقم القومي - الوجه الأمامي (إجباري)');
      return;
    }

    if (isFieldReq('nationalIdBackUrl') && !appForm.nationalIdBackUrl) {
      setAppError('يرجى رفع صورة بطاقة الرقم القومي - الوجه الخلفي (إجباري)');
      return;
    }

    if (!appForm.consentAgreed) {
      setAppError('يرجى الموافقة على صحة البيانات وسياسة الخصوصية للمتابعة');
      return;
    }

    setAppSubmitting(true);
    try {
      const res = await api.submitApplication(appForm);
      setAppSuccessResult({ message: res.message, appNumber: res.applicationNumber });
      trackEvent('generate_lead', {
        category: 'membership',
        action: 'submit_application',
        label: res.applicationNumber
      });
      setAppForm({
        fullName: '',
        nationalId: '',
        dateOfBirth: '',
        gender: 'ذكر',
        maritalStatus: 'أعزب',
        governorate: 'محافظة الجيزة',
        district: 'قسم ثالث أكتوبر',
        address: '',
        phone: '',
        whatsapp: '',
        email: '',
        qualification: '',
        job: '',
        workplace: '',
        skills: '',
        interests: '',
        volunteerExperience: '',
        reasonForJoining: '',
        personalPhotoUrl: '',
        nationalIdFrontUrl: '',
        nationalIdBackUrl: '',
        consentAgreed: false
      });
    } catch (err: any) {
      setAppError(err.message || 'حدث خطأ أثناء إرسال الطلب');
    } finally {
      setAppSubmitting(false);
    }
  };

  // Helper to open secretariat details
  const openSecretariat = (slug: string) => {
    if (setSelectedSlug) setSelectedSlug(slug);
    setCurrentView('secretariat-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Helper to open initiative details
  const openInitiative = (slug: string) => {
    if (setSelectedSlug) setSelectedSlug(slug);
    setCurrentView('initiative-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // -------------------------------------------------------------
  // 1. HOME VIEW
  // -------------------------------------------------------------
  if (currentView === 'home') {
    return (
      <div className="space-y-16 lg:space-y-24 pb-16">
        
        {/* Automated Hero Video & Media Reel ("يقعد يقلب تلقائي") */}
        <section
          className="relative overflow-hidden bg-black text-white border-b-2 border-amber-500/30"
          onMouseEnter={() => setIsHeroHovered(true)}
          onMouseLeave={() => setIsHeroHovered(false)}
        >
          <div className="max-w-6xl mx-auto px-0 sm:px-4 lg:px-6">
            
            {/* Main Video / Slide Carousel Container */}
            <div className="relative aspect-[16/9] sm:aspect-[21/9] max-h-[560px] w-full overflow-hidden bg-black sm:rounded-2xl border-y sm:border border-amber-500/30 shadow-2xl">
              {heroSlides.map((slide, idx) => {
                const isActive = idx === heroSlideIndex;
                return (
                  <div
                    key={slide.id || idx}
                    className={`absolute inset-0 w-full h-full transition-opacity duration-700 ease-in-out ${
                      isActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                    }`}
                  >
                    {slide.type === 'video' ? (
                      <video
                        src={slide.url}
                        autoPlay
                        loop
                        muted
                        playsInline
                        poster={slide.posterUrl || data.settings.heroPosterUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={slide.url}
                        alt={slide.title || 'فعاليات حزب الجبهة الوطنية'}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          if (!target.src.includes('Screenshot_________________Chrome_9f4025ed.jpg')) {
                            target.src = '/assets/aistudio/Screenshot_________________Chrome_9f4025ed.jpg';
                          }
                        }}
                      />
                    )}
                    
                    {/* Subtle bottom gradient & unobtrusive caption strip */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />
                    
                    {slide.title && (
                      <div className="absolute bottom-5 right-5 sm:bottom-6 sm:right-8 z-20 text-right max-w-lg pointer-events-none">
                        <span className="inline-block bg-amber-500/90 text-stone-950 text-[10px] sm:text-xs font-black px-2.5 py-0.5 rounded-md mb-1 shadow-xs">
                          {slide.type === 'video' ? 'مقطع مرئي' : 'تغطية مصورة'}
                        </span>
                        <h2 className="text-sm sm:text-lg font-black text-white drop-shadow-md">
                          {slide.title}
                        </h2>
                        {slide.caption && (
                          <p className="text-[11px] sm:text-xs text-amber-200/90 font-medium line-clamp-1 drop-shadow-xs">
                            {slide.caption}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Prev / Next Controls (Subtle, sleek) */}
              {heroSlides.length > 1 && (
                <>
                  <button
                    onClick={() => setHeroSlideIndex(prev => (prev - 1 + heroSlides.length) % heroSlides.length)}
                    aria-label="السابق"
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/50 hover:bg-amber-500 hover:text-stone-950 text-white border border-white/20 backdrop-blur-xs flex items-center justify-center transition-all cursor-pointer opacity-70 hover:opacity-100"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setHeroSlideIndex(prev => (prev + 1) % heroSlides.length)}
                    aria-label="التالي"
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/50 hover:bg-amber-500 hover:text-stone-950 text-white border border-white/20 backdrop-blur-xs flex items-center justify-center transition-all cursor-pointer opacity-70 hover:opacity-100"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  {/* Slide Indicators / Navigation Dots */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-black/40 backdrop-blur-xs px-3 py-1 rounded-full border border-white/10">
                    {heroSlides.map((_, dotIdx) => (
                      <button
                        key={dotIdx}
                        onClick={() => setHeroSlideIndex(dotIdx)}
                        aria-label={`شريحة ${dotIdx + 1}`}
                        className={`h-2 rounded-full transition-all cursor-pointer ${
                          dotIdx === heroSlideIndex
                            ? 'w-6 bg-amber-400'
                            : 'w-2 bg-white/40 hover:bg-white/80'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}

            </div>

          </div>
        </section>

        {/* Breaking News Ticker / Bar (شريط الأخبار العاجلة) */}
        {data.news && data.news.some(n => n.isUrgent) && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 sm:-mt-8 relative z-20">
            <div className="bg-gradient-to-r from-red-800 via-red-700 to-red-800 text-white rounded-2xl p-3 sm:p-4 shadow-xl border-2 border-red-500/80 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <span className="bg-white text-red-700 text-xs font-black px-3 py-1 rounded-lg uppercase tracking-wider flex items-center gap-1.5 shrink-0 shadow-xs animate-pulse">
                  <span>⚡ عاجل</span>
                </span>
                <p className="text-xs sm:text-sm font-black text-white line-clamp-1">
                  {data.news.find(n => n.isUrgent)?.title}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const urgentItem = data.news.find(n => n.isUrgent);
                  if (urgentItem) {
                    setSelectedNews(urgentItem);
                    setCurrentView('news');
                    window.location.hash = `news?id=${urgentItem.id}`;
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="w-full sm:w-auto bg-black/40 hover:bg-black/60 text-white text-xs font-bold px-4 py-2 rounded-xl border border-white/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
              >
                <span>تفاصيل الخبر الكاملة</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Live Stream alert if active */}
        {data.liveStream && data.liveStream.isActive && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 relative z-20">
            <div className="bg-red-700 text-white rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 border-2 border-red-500">
              <div className="flex items-center gap-4">
                <span className="relative flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-white" />
                </span>
                <div>
                  <h3 className="font-extrabold text-lg text-white">
                    {data.liveStream.title || 'بث مباشر لفعاليات الحزب'}
                  </h3>
                  <p className="text-xs text-red-100">
                    {data.liveStream.description || 'تابع الآن البث المباشر لأمانة قسم ثالث أكتوبر'}
                  </p>
                </div>
              </div>

              <a
                href={data.liveStream.streamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-red-700 hover:bg-stone-100 font-bold px-6 py-2.5 rounded-lg text-sm flex items-center gap-2 shadow-xs transition-colors shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>مشاهدة البث الآن</span>
              </a>
            </div>
          </div>
        )}

        {/* Official Typography Section Directly Below Video (Exactly matching reference video) */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 pt-4">
          {/* Main Headline */}
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-stone-950 tracking-tight leading-tight">
            معاً نبني مستقبلاً مشرقاً لمصر
          </h1>

          {/* Subtitle Paragraph */}
          <div className="text-sm sm:text-base lg:text-lg font-bold text-stone-800 leading-relaxed max-w-3xl mx-auto space-y-1">
            <p>
              حزب الجبهة الوطنية هو حزب سياسي مدني ديمقراطي يحق لأي مصري الانتماء إلى عضويته
            </p>
            <p className="text-stone-600 font-semibold text-xs sm:text-sm">
              دون تفرقة أو تمييز، ويهدف إلى إعلاء قيم العدل والمساواة والحرية وإحترام حقوق الإنسان
            </p>
          </div>

          <div className="w-16 h-1 bg-amber-500 mx-auto rounded-full my-4" />

          {/* Three Foundational Manifesto Paragraphs (Matching video frame 00:01) */}
          <div className="text-right space-y-4 text-xs sm:text-sm lg:text-base text-stone-700 leading-relaxed font-normal bg-stone-50/80 p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-xs">
            <p className="font-semibold text-stone-900 leading-relaxed">
              حزب الجبهة الوطنية هو كيان سياسي مصري يهدف إلى إحداث تغيير حقيقي في المشهد السياسي من خلال تعزيز المشاركة الشعبية الفاعلة والصادقة.
            </p>
            <p className="leading-relaxed">
              يعمل الحزب على بناء نموذج ديمقراطي يعزز ثقافة الحوار والتعاون بين جميع أطياف المجتمع، مع التركيز على تحقيق العدالة الاجتماعية والتنمية المستدامة، يسعى الحزب إلى أن يكون بيت خبرة وطني يخدم مصلحة الوطن العليا بعيداً عن أي توجهات ضيقة أو شخصية، مستنداً إلى رؤية شاملة تستند إلى قيم الحرية، العدالة، وسيادة القانون.
            </p>
            <p className="leading-relaxed">
              يجمع الحزب بين طاقات الشباب وخبرات الأجيال لإيجاد حلول حقيقية للتحديات التي تواجه الوطن، إيماناً بأن العمل الجماعي هو السبيل لتحقيق تطلعات الشعب المصري نحو مستقبل أفضل.
            </p>
          </div>
        </section>

        {/* Party Headquarters / Red Carpet Entrance Photo Card (Matching video frame 00:01 - 00:02) */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-3xl border-2 border-amber-500/30 shadow-xl bg-stone-950 group">
            <div className="relative aspect-[16/9] sm:aspect-[21/9] w-full overflow-hidden">
              <img
                src={data.settings.entranceImageUrl || '/assets/aistudio/Screenshot_________________Chrome_9f4025ed.jpg'}
                alt="مدخل مقر حزب الجبهة الوطنية"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 text-right text-white">
                <span className="bg-amber-500 text-stone-950 text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-md uppercase tracking-wider">
                  مقر الحزب
                </span>
                <h3 className="text-base sm:text-xl font-black mt-1 text-white">
                  مقر حزب الجبهة الوطنية – قسم ثالث أكتوبر
                </h3>
              </div>
            </div>
          </div>
        </section>

        {/* Independent Membership Call-To-Action Section (Matching video frame 00:02) */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-b from-[#fbf8f2] via-[#f7f1e4] to-[#f2e8d5] border-2 border-amber-400/60 rounded-3xl p-8 sm:p-12 text-center shadow-lg space-y-5">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-stone-950">
              {data.settings.membershipTitle || 'كن جزءاً من التغيير!'}
            </h2>
            <p className="text-sm sm:text-base text-stone-700 max-w-xl mx-auto leading-relaxed">
              {data.settings.membershipSubtitle || 'ندعوكم للانضمام إلى مسيرة الحزب والعمل معنا لتحقيق تطلعات الوطن.'}
            </p>
            <p className="text-xs sm:text-sm font-bold text-amber-800">
              {data.settings.membershipCtaText || 'انضم الآن وساهم في بناء المستقبل'}
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              {/* Membership Application Button */}
              <button
                onClick={() => {
                  setCurrentView('join');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full sm:w-auto bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-600 hover:to-amber-500 text-stone-950 font-black px-8 py-3.5 rounded-xl shadow-md transition-all hover:scale-105 cursor-pointer text-sm sm:text-base flex items-center justify-center gap-2"
              >
                <HeartHandshake className="w-5 h-5 text-stone-950" />
                <span>استمارة العضوية</span>
              </button>

              {/* Direct WhatsApp Contact Button (Editable from Admin Panel) */}
              <a
                href={data.settings.whatsappLink || `https://wa.me/20${(data.settings.membershipWhatsapp || data.settings.whatsapp || '01003070108').replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3.5 rounded-xl shadow-md transition-all hover:scale-105 cursor-pointer text-sm sm:text-base flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                <span>تواصل واستفسار عبر واتساب</span>
              </a>
            </div>
          </div>
        </section>

        {/* Section 1: Party Leaders Preview */}
        {data.partyLeaders.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                  {ct.partyLeadersTitle || 'قيادات حزب الجبهة الوطنية'}
                </h2>
              </div>
              <button
                onClick={() => {
                  setCurrentView('party-leaders');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-red-700 hover:text-red-800 transition-colors cursor-pointer"
              >
                <span>عرض جميع قيادات الحزب</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {data.partyLeaders.slice(0, 4).map(leader => (
                <div
                  key={leader.id}
                  onClick={() => setSelectedPartyLeader(leader)}
                  className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer group hover:-translate-y-1"
                >
                  <div className="aspect-square bg-stone-100 overflow-hidden relative">
                    <img
                      src={leader.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                      alt={leader.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2 right-2 bg-stone-900/80 backdrop-blur-xs text-amber-300 text-[10px] font-bold px-2.5 py-1 rounded-md">
                      {leader.level || (leader.governorate || 'المستوى القيادي')}
                    </div>
                  </div>
                  <div className="p-4 text-right">
                    <h3 className="font-bold text-stone-900 text-base group-hover:text-red-700 transition-colors">
                      {leader.name}
                    </h3>
                    <p className="text-xs font-semibold text-red-700 mt-0.5">
                      {leader.position}
                    </p>
                    {leader.bio && (
                      <p className="text-[11px] text-stone-500 mt-2 line-clamp-2">
                        {leader.bio}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 2: Secretariat Leaders Preview (3rd October Giza) */}
        {data.secretariatLeaders.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                  {ct.secLeadersTitle || 'قيادات أمانة قسم ثالث أكتوبر'}
                </h2>
              </div>
              <button
                onClick={() => {
                  setCurrentView('secretariat-leaders');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-700 hover:text-amber-800 transition-colors cursor-pointer"
              >
                <span>عرض جميع قيادات الأمانة</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {data.secretariatLeaders.slice(0, 4).map(leader => (
                <div
                  key={leader.id}
                  onClick={() => setSelectedSecLeader(leader)}
                  className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer group hover:-translate-y-1"
                >
                  <div className="aspect-square bg-stone-100 overflow-hidden relative">
                    <img
                      src={leader.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                      alt={leader.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2 right-2 bg-red-700 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                      أمانة قسم ثالث أكتوبر
                    </div>
                  </div>
                  <div className="p-4 text-right">
                    <h3 className="font-bold text-stone-900 text-base group-hover:text-red-700 transition-colors">
                      {leader.name}
                    </h3>
                    <p className="text-xs font-semibold text-amber-700 mt-0.5">
                      {leader.title}
                    </p>
                    {leader.bio && (
                      <p className="text-[11px] text-stone-500 mt-2 line-clamp-2">
                        {leader.bio}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 3: Specialized Secretariats Grid */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <span className="text-xs font-bold text-red-700 uppercase tracking-widest">
                {ct.secretariatsBadge || 'قطاعات العمل الحزبي'}
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-stone-900 mt-1">
                {ct.secretariatsTitle || 'أمانات حزب الجبهة الوطنية'}
              </h2>
              <p className="text-xs sm:text-sm text-stone-500 mt-1">
                {ct.secretariatsSubtitle || 'لكل أمانة صفحة مستقلة بكامل مهامها وأعضائها وأنشطتها'}
              </p>
            </div>
            <button
              onClick={() => {
                setCurrentView('secretariats');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-red-700 hover:text-red-800 transition-colors cursor-pointer"
            >
              <span>استعراض جميع الأمانات</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.specializedSecretariats.map(sec => (
              <div
                key={sec.id}
                onClick={() => openSecretariat(sec.slug)}
                className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs hover:shadow-md transition-all cursor-pointer group hover:border-red-600/40 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center font-bold text-sm group-hover:bg-red-700 group-hover:text-white transition-colors">
                      <Building2 className="w-5 h-5" />
                    </span>
                    <span className="text-xs text-stone-400 font-medium">
                      أمانة قسم ثالث أكتوبر
                    </span>
                  </div>

                  <h3 className="font-extrabold text-stone-900 text-lg group-hover:text-red-700 transition-colors mb-2">
                    {sec.name}
                  </h3>

                  <p className="text-xs text-stone-600 leading-relaxed line-clamp-3 mb-4">
                    {sec.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-stone-100 flex items-center justify-between text-xs">
                  <div className="text-stone-500">
                    <span className="font-medium">أمين الأمانة: </span>
                    <span className="font-bold text-stone-800">
                      {sec.secretaryName || 'قيد التعيين'}
                    </span>
                  </div>
                  <span className="text-red-700 font-bold group-hover:translate-x-[-4px] transition-transform flex items-center gap-1">
                    <span>التفاصيل</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4: Initiatives Showcase */}
        {data.initiatives.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-gradient-to-br from-stone-900 to-stone-950 rounded-3xl p-8 sm:p-12 text-white border-2 border-amber-500/30">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                <div>
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                    {ct.initiativesBadge || 'العمل الميداني والمجتمعي'}
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                    {ct.initiativesTitle || 'مبادرات حزب الجبهة الوطنية'}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setCurrentView('initiatives');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  <span>كافة المبادرات</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {data.initiatives.map(init => (
                  <div
                    key={init.id}
                    onClick={() => openInitiative(init.slug)}
                    className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-amber-500/20 text-amber-300">
                        {init.status === 'active' ? 'مبادرة نشطة' : (init.status === 'completed' ? 'مكتملة' : 'متوقفة')}
                      </span>
                      <span className="text-xs text-stone-400">
                        بدأت: {init.startDate}
                      </span>
                    </div>

                    <h3 className="text-xl font-bold text-white group-hover:text-amber-300 transition-colors mb-2">
                      {init.title}
                    </h3>
                    <p className="text-xs text-stone-300 leading-relaxed line-clamp-3 mb-4">
                      {init.description}
                    </p>

                    <div className="flex items-center justify-between text-xs text-amber-400 font-bold pt-3 border-t border-white/10">
                      <span>استعراض أنشطة وفعاليات المبادرة</span>
                      <ChevronLeft className="w-4 h-4 group-hover:translate-x-[-4px] transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Section 5: News & Events split */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            
            {/* News Column */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-5 h-5 text-red-700" />
                  <h2 className="text-xl sm:text-2xl font-black text-stone-900">
                    {ct.newsTitle || 'آخر الأخبار والبيانات'}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setCurrentView('news');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs font-bold text-red-700 hover:underline cursor-pointer"
                >
                  المزيد
                </button>
              </div>

              <div className="space-y-4">
                {data.news.slice(0, 3).map(item => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedNews(item);
                      setCurrentView('news');
                      window.location.hash = `news?id=${item.id}`;
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="bg-white rounded-xl border border-stone-200 p-4 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col sm:flex-row gap-4"
                  >
                    <img
                      src={item.coverImage || data.settings.officialLogo}
                      alt={item.title}
                      className="w-full sm:w-24 h-32 sm:h-24 object-cover rounded-lg shrink-0 bg-stone-100"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {item.isUrgent && (
                            <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-xs animate-pulse">
                              ⚡ عاجل
                            </span>
                          )}
                          {item.isFeatured && !item.isUrgent && (
                            <span className="bg-amber-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                              مميز
                            </span>
                          )}
                          <span className="text-[11px] text-stone-400 font-medium">
                            {item.publishDate}
                          </span>
                        </div>
                        <h3 className="font-bold text-stone-900 text-sm group-hover:text-red-700 transition-colors line-clamp-2 mt-0.5">
                          {item.title}
                        </h3>
                        <p className="text-xs text-stone-500 line-clamp-2 mt-1">
                          {item.excerpt}
                        </p>
                        {(item.authorName || item.authorPosition) && (
                          <div className="text-[10px] text-amber-900 font-bold mt-1.5 flex items-center gap-1.5">
                            <span>{item.authorName ? `بقلم: ${item.authorName}` : 'المكتب الإعلامي'}</span>
                            {item.authorPosition && (
                              <span className="text-stone-500 font-normal text-[9px]">({item.authorPosition})</span>
                            )}
                          </div>
                        )}
                      </div>

                      <SocialShareButtons
                        title={item.title}
                        summary={item.excerpt}
                        itemType="news"
                        itemId={item.id}
                        compact
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Events Column */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-600" />
                  <h2 className="text-xl sm:text-2xl font-black text-stone-900">
                    {ct.eventsTitle || 'الفعاليات والأنشطة'}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setCurrentView('events');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs font-bold text-amber-700 hover:underline cursor-pointer"
                >
                  المزيد
                </button>
              </div>

              <div className="space-y-4">
                {data.events.slice(0, 3).map(event => (
                  <div
                    key={event.id}
                    className="bg-white rounded-xl border border-stone-200 p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-stone-500 mb-1.5">
                        <span className="font-bold text-red-700">
                          {new Date(event.dateTime).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                        <span className="bg-amber-50 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                          {event.status === 'upcoming' ? 'قادمة' : (event.status === 'completed' ? 'منتهية' : 'جارية')}
                        </span>
                      </div>
                      <h3 className="font-bold text-stone-900 text-sm mb-1">
                        {event.title}
                      </h3>
                      <p className="text-xs text-stone-600 line-clamp-2">
                        {event.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-stone-400" />
                        <span>{event.venue}</span>
                      </span>
                      <span className="font-medium text-stone-700">{event.organizer}</span>
                    </div>

                    <SocialShareButtons
                      title={event.title}
                      summary={event.description}
                      itemType="event"
                      itemId={event.id}
                      imageUrl={event.coverUrl}
                      compact
                    />
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* Section 6: Join Callout */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden bg-gradient-to-r from-red-900 via-red-800 to-amber-950 rounded-3xl p-8 sm:p-12 text-white shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8 border-2 border-amber-500/40">
            <div className="space-y-3 text-right">
              <div className="inline-flex items-center gap-2 bg-amber-400/20 text-amber-300 px-3.5 py-1.5 rounded-full text-xs font-bold border border-amber-400/30">
                <HeartHandshake className="w-4 h-4 text-amber-300" />
                <span>كن جزءًا من التغيير!</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                ندعوكم للانضمام إلى مسيرة الحزب والعمل معنا لتحقيق تطلعات الوطن
              </h2>
              <p className="text-sm sm:text-base text-stone-200 max-w-2xl leading-relaxed">
                انضم الآن وساهم في بناء المستقبل، وكن شريكاً فاعلاً في خدمة أهالي وشباب قسم ثالث أكتوبر بمحافظة الجيزة. نموذج تقديم رقمي معتمد ومحمي بالكامل.
              </p>
            </div>
            <button
              onClick={() => {
                setCurrentView('join');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black px-8 py-4 rounded-xl shadow-xl transition-transform hover:scale-105 cursor-pointer whitespace-nowrap text-base shrink-0"
            >
              انضم الآن وساهم في بناء المستقبل
            </button>
          </div>
        </section>

      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. ABOUT VIEW
  // -------------------------------------------------------------
  if (currentView === 'about') {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold text-red-700 uppercase tracking-widest">
            الرؤية والرسالة والوطن
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-stone-900">
            عن حزب الجبهة الوطنية وأمانة قسم ثالث أكتوبر
          </h1>
          <p className="text-sm font-semibold text-amber-700">
            شعارنا الراسخ: «{data.settings.slogan || 'مصر للجميع'}»
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-8 sm:p-10 shadow-xs space-y-8 text-right">
          <div>
            <h2 className="text-xl font-bold text-red-700 border-r-4 border-red-700 pr-3 mb-3">
              حزب الجبهة الوطنية
            </h2>
            <p className="text-sm sm:text-base text-stone-700 leading-relaxed">
              {data.settings.aboutParty}
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-amber-700 border-r-4 border-amber-600 pr-3 mb-3">
              أمانة قسم ثالث أكتوبر – محافظة الجيزة
            </h2>
            <p className="text-sm sm:text-base text-stone-700 leading-relaxed">
              {data.settings.aboutSecretariat}
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-stone-900 border-r-4 border-stone-900 pr-3 mb-3">
              رؤيتنا
            </h2>
            <p className="text-sm sm:text-base text-stone-700 leading-relaxed">
              {data.settings.vision}
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-red-700 border-r-4 border-red-700 pr-3 mb-4">
              المبادئ الحزبية والوطنية
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.settings.principles && data.settings.principles.map((pr, i) => (
                <div key={i} className="flex items-start gap-3 bg-stone-50 p-4 rounded-xl border border-stone-200">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="text-xs sm:text-sm font-medium text-stone-800">{pr}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Geographic Scope Assurance */}
          <div className="bg-amber-50 p-6 rounded-xl border border-amber-200">
            <h3 className="font-bold text-amber-900 text-sm mb-1">
              النطاق الجغرافي للاختصاص:
            </h3>
            <p className="text-xs text-amber-800 leading-relaxed">
              تختص أمانة قسم ثالث أكتوبر بنطاق مدينة السادس من أكتوبر (قسم ثالث) التابع لمحافظة الجيزة. بينما يمثل قسم «قيادات الحزب» الهيكل المركزي الشامل على مستوى الجمهورية والمحافظات.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 3. PARTY LEADERS VIEW (National & Governorates & Custom Levels)
  // -------------------------------------------------------------
  if (currentView === 'party-leaders') {
    const isLevelMatch = (leaderLevel: string | undefined, filter: string) => {
      if (filter === 'all') return true;
      const lvl = (leaderLevel || '').trim();
      if (filter === 'الهيئة العليا' || filter === 'national') {
        return lvl === 'الهيئة العليا' || lvl === 'national' || lvl === 'عليا' || lvl === 'مركزية';
      }
      if (filter === 'قيادات المحافظات' || filter === 'governorate') {
        return lvl === 'قيادات المحافظات' || lvl === 'governorate' || lvl === 'محافظة';
      }
      return lvl === filter;
    };

    const customLevels = Array.from(
      new Set(
        data.partyLeaders
          .map(l => (l.level || '').trim())
          .filter(lvl => lvl && lvl !== 'الهيئة العليا' && lvl !== 'national' && lvl !== 'عليا' && lvl !== 'قيادات المحافظات' && lvl !== 'governorate' && lvl !== 'محافظة')
      )
    );

    const filteredLeaders = data.partyLeaders.filter(l => isLevelMatch(l.level, partyLeaderLevelFilter));

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-black text-stone-900 tracking-tight">
            {ct.partyLeadersTitle || 'قيادات حزب الجبهة الوطنية'}
          </h1>
        </div>

        {/* Filter bar */}
        <div className="flex justify-center flex-wrap gap-2">
          <div className="inline-flex flex-wrap justify-center bg-stone-100 p-1.5 rounded-xl border border-stone-200 gap-1 text-xs font-bold">
            <button
              onClick={() => setPartyLeaderLevelFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                partyLeaderLevelFilter === 'all'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              كافة المستويات ({data.partyLeaders.length})
            </button>
            <button
              onClick={() => setPartyLeaderLevelFilter('الهيئة العليا')}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                partyLeaderLevelFilter === 'الهيئة العليا' || partyLeaderLevelFilter === 'national'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              الهيئة العليا ({data.partyLeaders.filter(l => isLevelMatch(l.level, 'الهيئة العليا')).length})
            </button>
            <button
              onClick={() => setPartyLeaderLevelFilter('قيادات المحافظات')}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                partyLeaderLevelFilter === 'قيادات المحافظات' || partyLeaderLevelFilter === 'governorate'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              قيادات المحافظات ({data.partyLeaders.filter(l => isLevelMatch(l.level, 'قيادات المحافظات')).length})
            </button>
            {customLevels.map(lvl => (
              <button
                key={lvl}
                onClick={() => setPartyLeaderLevelFilter(lvl)}
                className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                  partyLeaderLevelFilter === lvl
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {lvl} ({data.partyLeaders.filter(l => l.level === lvl).length})
              </button>
            ))}
          </div>
        </div>

        {filteredLeaders.length === 0 ? (
          <div className="bg-white rounded-3xl border border-stone-200/80 p-12 text-center text-stone-500 max-w-lg mx-auto shadow-xs">
            <Award className="w-14 h-14 text-stone-300 mx-auto mb-4" />
            <h3 className="font-bold text-stone-900 text-lg mb-1.5">
              التشكيل القيادي قيد المراجعة الرسمية
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 leading-relaxed">
              يجري حالياً مراجعة واعتماد التشكيلات القيادية للحزب وفق اللوائح والقرارات التنظيمية.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredLeaders.map(leader => (
              <div
                key={leader.id}
                onClick={() => setSelectedPartyLeader(leader)}
                className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-lg transition-all cursor-pointer group hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-[4/5] bg-stone-100 overflow-hidden relative">
                    <img
                      src={leader.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                      alt={leader.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2.5 right-2.5 bg-stone-900/85 backdrop-blur-xs text-amber-300 text-[11px] font-bold px-2.5 py-1 rounded-md">
                      {leader.governorate ? `${leader.level || 'المحافظات'} – ${leader.governorate}` : (leader.level || 'الهيئة العليا')}
                    </div>
                  </div>
                  <div className="p-4 text-right">
                    <h3 className="font-extrabold text-stone-900 text-lg group-hover:text-red-700 transition-colors">
                      {leader.name}
                    </h3>
                    <p className="text-xs font-bold text-red-700 mt-1">
                      {leader.position}
                    </p>
                    {leader.bio && (
                      <p className="text-xs text-stone-500 mt-2 line-clamp-3 leading-relaxed">
                        {leader.bio}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-4 pt-0 text-left">
                  <span className="text-xs text-amber-700 font-bold flex items-center gap-1 hover:underline">
                    <span>عرض السيرة الذاتية</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Leader Details Modal */}
        {selectedPartyLeader && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 text-right shadow-2xl relative border border-stone-200 max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setSelectedPartyLeader(null)}
                className="absolute top-4 left-4 p-2 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 cursor-pointer"
              >
                ✕
              </button>

              <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start mb-6">
                <img
                  src={selectedPartyLeader.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                  alt={selectedPartyLeader.name}
                  className="w-32 h-32 sm:w-40 sm:h-40 object-cover rounded-2xl border-2 border-red-700 shadow-md shrink-0 bg-stone-100"
                  referrerPolicy="no-referrer"
                />
                <div className="space-y-1 text-center sm:text-right">
                  <span className="bg-red-50 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">
                    {selectedPartyLeader.governorate ? `${selectedPartyLeader.level || 'قيادات المحافظات'} – ${selectedPartyLeader.governorate}` : (selectedPartyLeader.level || 'الهيئة العليا')}
                  </span>
                  <h3 className="text-2xl font-black text-stone-900 mt-2">
                    {selectedPartyLeader.name}
                  </h3>
                  <p className="text-sm font-bold text-amber-700">
                    {selectedPartyLeader.position}
                  </p>
                </div>
              </div>

              <div className="border-t border-stone-100 pt-4 space-y-3">
                <h4 className="font-bold text-stone-800 text-sm">
                  نبذة تعريفية:
                </h4>
                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed whitespace-pre-line">
                  {selectedPartyLeader.bio || 'لا توجد نبذة مسجلة لهذه القيادة.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // 4. SECRETARIAT LEADERS VIEW (3rd October Giza only)
  // -------------------------------------------------------------
  if (currentView === 'secretariat-leaders') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-black text-stone-900 tracking-tight">
            قيادات أمانة قسم ثالث أكتوبر
          </h1>
        </div>

        {data.secretariatLeaders.length === 0 ? (
          <div className="bg-white rounded-3xl border border-stone-200/80 p-12 text-center text-stone-500 max-w-lg mx-auto shadow-xs">
            <Users className="w-14 h-14 text-stone-300 mx-auto mb-4" />
            <h3 className="font-bold text-stone-900 text-lg mb-1.5">
              التشكيل القيادي قيد الاعتماد الرسمي
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 leading-relaxed">
              يجري حالياً مراجعة واعتماد تشكيل قيادات أمانة قسم ثالث أكتوبر بمحافظة الجيزة وفق اللوائح والقرارات التنظيمية للحزب.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {data.secretariatLeaders.map(leader => (
              <div
                key={leader.id}
                onClick={() => setSelectedSecLeader(leader)}
                className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-lg transition-all cursor-pointer group hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-[4/5] bg-stone-100 overflow-hidden relative">
                    <img
                      src={leader.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                      alt={leader.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2.5 right-2.5 bg-red-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-md">
                      أمانة قسم ثالث أكتوبر
                    </div>
                  </div>
                  <div className="p-4 text-right">
                    <h3 className="font-extrabold text-stone-900 text-lg group-hover:text-red-700 transition-colors">
                      {leader.name}
                    </h3>
                    <p className="text-xs font-bold text-red-700 mt-1">
                      {leader.title}
                    </p>
                    {leader.bio && (
                      <p className="text-xs text-stone-500 mt-2 line-clamp-3 leading-relaxed">
                        {leader.bio}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-4 pt-0 text-left">
                  <span className="text-xs text-amber-700 font-bold flex items-center gap-1 hover:underline">
                    <span>عرض التفاصيل</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Secretariat Leader Modal */}
        {selectedSecLeader && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 text-right shadow-2xl relative border border-stone-200 max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setSelectedSecLeader(null)}
                className="absolute top-4 left-4 p-2 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 cursor-pointer"
              >
                ✕
              </button>

              <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start mb-6">
                <img
                  src={selectedSecLeader.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                  alt={selectedSecLeader.name}
                  className="w-32 h-32 sm:w-40 sm:h-40 object-cover rounded-2xl border-2 border-amber-600 shadow-md shrink-0 bg-stone-100"
                  referrerPolicy="no-referrer"
                />
                <div className="space-y-1 text-center sm:text-right">
                  <span className="bg-amber-100 text-amber-900 text-xs font-bold px-2.5 py-1 rounded-full">
                    أمانة قسم ثالث أكتوبر – محافظة الجيزة
                  </span>
                  <h3 className="text-2xl font-black text-stone-900 mt-2">
                    {selectedSecLeader.name}
                  </h3>
                  <p className="text-sm font-bold text-red-700">
                    {selectedSecLeader.title}
                  </p>
                  {selectedSecLeader.appointmentDate && (
                    <p className="text-xs text-stone-400">
                      تاريخ تولي المسؤولية: {selectedSecLeader.appointmentDate}
                    </p>
                  )}
                </div>
              </div>

              <div className="border-t border-stone-100 pt-4 space-y-3">
                <h4 className="font-bold text-stone-800 text-sm">
                  النبذة التعريفية والتكليف:
                </h4>
                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed whitespace-pre-line">
                  {selectedSecLeader.bio || 'لا توجد نبذة مسجلة.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // 5. SPECIALIZED SECRETARIATS LIST VIEW
  // -------------------------------------------------------------
  if (currentView === 'secretariats') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold text-red-700 uppercase tracking-widest">
            الهيكل التنظيمي
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-stone-900">
            الأمانات التخصصية والنوعية
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 max-w-2xl mx-auto">
            تضم أمانة قسم ثالث أكتوبر تشكيلات متخصصة تغطي كافة الأبعاد الميدانية والتنموية والإعلامية والتنظيمية، ولكل أمانة صفحة مستقلة تعرض مهامها وأهدافها وأنشطتها.
          </p>

          <div className="pt-2 flex items-center justify-center">
            <span className="bg-stone-100 text-stone-800 text-xs font-bold px-3.5 py-1.5 rounded-full border border-stone-200">
              إجمالي الأمانات: {data.specializedSecretariats.length} أمانة معتمدة
            </span>
          </div>
        </div>

        {data.specializedSecretariats.length === 0 ? (
          <div className="bg-white rounded-3xl border border-dashed border-stone-300 p-12 text-center space-y-3">
            <Building2 className="w-16 h-16 text-stone-300 mx-auto" />
            <h3 className="text-lg font-black text-stone-800">الأمانات قيد المراجعة التنظيمية</h3>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              يجري حالياً تحديث واعتماد تشكيلات الأمانات التخصصية من قبل الأمانة العامة.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.specializedSecretariats.map(sec => (
              <div
                key={sec.id}
                onClick={() => openSecretariat(sec.slug)}
                className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs hover:shadow-lg transition-all cursor-pointer group hover:border-amber-500 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold group-hover:bg-amber-500 group-hover:text-stone-950 transition-colors">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <span className="text-xs text-amber-800 font-bold bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                      قسم ثالث أكتوبر
                    </span>
                  </div>

                  <h2 className="font-extrabold text-stone-900 text-xl group-hover:text-red-700 transition-colors mb-2">
                    {sec.name}
                  </h2>

                  <p className="text-xs text-stone-600 leading-relaxed line-clamp-3 mb-6">
                    {sec.description || 'أمانة تنظيمية متخصصة ضمن الهيكل الإداري والميداني لأمانة قسم ثالث أكتوبر.'}
                  </p>

                  <div className="space-y-1.5 mb-6 text-xs text-stone-500">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{sec.duties?.length || 0} مهام واختصاصات رئيسية</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>{sec.goals?.length || 0} أهداف استراتيجية محددة</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-stone-100 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-stone-600">
                      <span className="text-stone-400 font-medium">أمين الأمانة: </span>
                      <span className="font-bold text-stone-900">{sec.secretaryName || 'قيد التكليف'}</span>
                    </div>
                    {sec.assistantSecretaryName && (
                      <div className="text-[11px] text-stone-600">
                        <span className="text-stone-400 font-medium">الأمين المساعد: </span>
                        <span className="font-semibold text-stone-800">{sec.assistantSecretaryName}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-red-700 font-bold group-hover:translate-x-[-4px] transition-transform flex items-center gap-1 shrink-0">
                    <span>التفاصيل</span>
                    <ChevronLeft className="w-4 h-4" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }


  // -------------------------------------------------------------
  // 6. INDIVIDUAL SECRETARIAT DEDICATED PAGE
  // -------------------------------------------------------------
  if (currentView === 'secretariat-detail') {
    const sec = data.specializedSecretariats.find(s => s.slug === selectedSlug || s.id === selectedSlug) || data.specializedSecretariats[0];
    const relatedNews = data.news.filter(n => n.linkedSecretariatId === sec?.id);
    const relatedEvents = data.events.filter(e => e.organizer.includes(sec?.name || ''));
    const relatedMedia = data.media.filter(m => m.linkedSecretariatId === sec?.id);

    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        <button
          onClick={() => setCurrentView('secretariats')}
          className="inline-flex items-center gap-2 text-xs font-bold text-red-700 hover:underline cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لكافة الأمانات</span>
        </button>

        {/* Secretariat Header Card */}
        <div className="bg-gradient-to-br from-stone-900 to-stone-950 text-white rounded-3xl p-8 sm:p-12 border-2 border-amber-500/40 shadow-xl relative overflow-hidden">
          <div className="relative z-10 space-y-4 text-right">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="bg-amber-500/20 text-amber-300 text-xs font-bold px-3 py-1 rounded-full border border-amber-500/30">
                أمانة معتمدة – أمانة قسم ثالث أكتوبر
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-white">
              {sec.name}
            </h1>
            <p className="text-stone-300 text-sm sm:text-base leading-relaxed max-w-3xl">
              {sec.description}
            </p>
          </div>
        </div>


        {/* Leadership of the Secretariat */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-stone-900 font-extrabold text-base border-r-4 border-red-700 pr-3">
            <UserCheck className="w-5 h-5 text-red-700" />
            <h2>قيادة الأمانة</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Secretary */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs flex flex-col justify-between">
              <div className="flex items-center gap-4">
                <img
                  src={sec.secretaryPhotoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                  alt={sec.secretaryName || 'أمين الأمانة'}
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-amber-500 shadow-xs bg-stone-100 shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="space-y-1 text-right">
                  <span className="text-[11px] font-black text-red-700 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full inline-block">
                    أمين الأمانة (المسؤول الأول)
                  </span>
                  <h3 className="font-black text-stone-900 text-lg">
                    {sec.secretaryName || 'قيد التكليف الرسمي'}
                  </h3>
                  <p className="text-xs text-stone-500">
                    أمانة قسم ثالث أكتوبر – محافظة الجيزة
                  </p>
                </div>
              </div>

              {(sec.secretaryBio || sec.secretaryPhone) && (
                <div className="mt-4 pt-3 border-t border-stone-100 space-y-1.5 text-xs">
                  {sec.secretaryBio && (
                    <p className="text-stone-600 leading-relaxed font-normal">{sec.secretaryBio}</p>
                  )}
                  {sec.secretaryPhone && (
                    <div className="flex items-center gap-2 text-stone-700 font-medium pt-1">
                      <Phone className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <a href={`tel:${sec.secretaryPhone}`} className="hover:text-red-700 font-mono" dir="ltr">
                        {sec.secretaryPhone}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Assistant Secretary */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs flex flex-col justify-between">
              <div className="flex items-center gap-4">
                <img
                  src={sec.assistantSecretaryPhotoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                  alt={sec.assistantSecretaryName || 'الأمين المساعد'}
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-amber-500 shadow-xs bg-stone-100 shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="space-y-1 text-right">
                  <span className="text-[11px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full inline-block">
                    الأمين المساعد للأمانة
                  </span>
                  <h3 className="font-black text-stone-900 text-lg">
                    {sec.assistantSecretaryName || 'قيد التكليف الرسمي'}
                  </h3>
                  <p className="text-xs text-stone-500">
                    أمانة قسم ثالث أكتوبر – محافظة الجيزة
                  </p>
                </div>
              </div>

              {(sec.assistantSecretaryBio || sec.assistantSecretaryPhone) && (
                <div className="mt-4 pt-3 border-t border-stone-100 space-y-1.5 text-xs">
                  {sec.assistantSecretaryBio && (
                    <p className="text-stone-600 leading-relaxed font-normal">{sec.assistantSecretaryBio}</p>
                  )}
                  {sec.assistantSecretaryPhone && (
                    <div className="flex items-center gap-2 text-stone-700 font-medium pt-1">
                      <Phone className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <a href={`tel:${sec.assistantSecretaryPhone}`} className="hover:text-amber-700 font-mono" dir="ltr">
                        {sec.assistantSecretaryPhone}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bureau Members Section (هيئة مكتب الأمانة) */}
        {(() => {
          const bureauMembers = (data.secretariatMembers || []).filter(
            m => m.secretariatId === sec?.id && m.tier !== 'secretary' && m.tier !== 'assistant_secretary'
          );

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-r-4 border-amber-600 pr-3">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-600" />
                  <h2 className="text-lg font-black text-stone-900">
                    تشكيل هيئة مكتب الأمانة والكوادر التنظيمية
                  </h2>
                </div>
                <span className="text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full">
                  {bureauMembers.length} كادر معتمد
                </span>
              </div>

              {bureauMembers.length === 0 ? (
                <div className="bg-stone-50 rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-500 space-y-2">
                  <Users className="w-10 h-10 text-stone-400 mx-auto opacity-70" />
                  <p className="font-bold text-sm text-stone-700">هيئة مكتب الأمانة قيد الاستكمال والاعتماد الرسمي</p>
                  <p className="text-xs text-stone-500 max-w-md mx-auto">
                    يتم تسكين الكوادر وأعضاء هيئة المكتب تدريجياً عبر لجان الفحص والتقييم الحزبية.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bureauMembers.map(member => (
                    <div
                      key={member.id}
                      className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3"
                    >
                      <div className="flex items-start gap-3.5">
                        {member.photoUrl ? (
                          <img
                            src={member.photoUrl}
                            alt={member.name}
                            className="w-14 h-14 rounded-full object-cover border-2 border-amber-400 bg-stone-100 shadow-xs shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-stone-800 to-stone-900 text-amber-300 flex items-center justify-center font-black text-base border-2 border-amber-400 shadow-xs shrink-0">
                            {member.name.substring(0, 1)}
                          </div>
                        )}
                        <div className="space-y-1 text-right flex-1 min-w-0">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md inline-block bg-amber-50 text-amber-900 border border-amber-200 truncate max-w-full">
                            {member.bureauTitle || member.role || 'عضو هيئة مكتب'}
                          </span>
                          <h4 className="font-black text-stone-900 text-sm truncate">
                            {member.name}
                          </h4>
                          {member.assignmentDate && (
                            <p className="text-[10px] text-stone-400 font-mono">
                              تاريخ التكليف: {member.assignmentDate}
                            </p>
                          )}
                        </div>
                      </div>

                      {member.notes && (
                        <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                          {member.notes}
                        </p>
                      )}

                      {member.phone && (
                        <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                          <span className="text-stone-400 text-[11px]">الاتصال المباشر:</span>
                          <a
                            href={`tel:${member.phone}`}
                            className="font-mono font-bold text-red-700 hover:underline flex items-center gap-1"
                            dir="ltr"
                          >
                            <Phone className="w-3 h-3 text-red-600" />
                            <span>{member.phone}</span>
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Duties and Goals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-right">
          {/* Duties */}
          <div className="bg-white rounded-2xl border border-stone-200 p-8 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-red-700 font-extrabold text-lg border-b border-stone-100 pb-3">
              <BookOpen className="w-5 h-5" />
              <h2>المهام والاختصاصات</h2>
            </div>
            <ul className="space-y-3">
              {sec.duties && sec.duties.length > 0 ? (
                sec.duties.map((duty, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-stone-700 leading-relaxed">
                    <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span>{duty}</span>
                  </li>
                ))
              ) : (
                <li className="text-xs text-stone-400">لا توجد مهام مدخلة حالياً.</li>
              )}
            </ul>
          </div>

          {/* Goals */}
          <div className="bg-white rounded-2xl border border-stone-200 p-8 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-amber-700 font-extrabold text-lg border-b border-stone-100 pb-3">
              <Award className="w-5 h-5" />
              <h2>الأهداف الاستراتيجية</h2>
            </div>
            <ul className="space-y-3">
              {sec.goals && sec.goals.length > 0 ? (
                sec.goals.map((goal, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-stone-700 leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{goal}</span>
                  </li>
                ))
              ) : (
                <li className="text-xs text-stone-400">لا توجد أهداف مدخلة حالياً.</li>
              )}
            </ul>
          </div>
        </div>

        {/* Related News & Activities if any */}
        {relatedNews.length > 0 && (
          <div className="space-y-4 text-right">
            <h3 className="text-xl font-bold text-stone-900 border-r-4 border-red-700 pr-3">
              أخبار وبيانات الأمانة
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {relatedNews.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelectedNews(item)}
                  className="bg-white p-4 rounded-xl border border-stone-200 flex gap-4 cursor-pointer hover:border-red-600 transition-colors"
                >
                  <img
                    src={item.coverImage || data.settings.officialLogo}
                    alt={item.title}
                    className="w-20 h-20 object-cover rounded-lg bg-stone-100 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <span className="text-[10px] text-stone-400">{item.publishDate}</span>
                    <h4 className="font-bold text-sm text-stone-900 line-clamp-2 mt-0.5">{item.title}</h4>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation back to all secretariats and join CTA */}
        <div className="bg-stone-900 text-white p-6 rounded-3xl border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 mt-8">
          <div className="text-right">
            <h4 className="font-bold text-white text-base">هل ترغب بالانضمام إلى فريق {sec.name}؟</h4>
            <p className="text-xs text-stone-400 mt-0.5">يمكنك تقديم طلب العضوية والانضمام إلى لجان وهيئة مكتب الأمانة.</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setCurrentView('secretariats');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-colors"
            >
              العودة لكافة الأمانات
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentView('join');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex-1 sm:flex-none bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 font-black text-xs px-6 py-2.5 rounded-xl cursor-pointer flex items-center justify-center gap-2 shadow-md transition-transform hover:scale-105"
            >
              <HeartHandshake className="w-4 h-4 text-stone-950" />
              <span>تقديم طلب انضمام</span>
            </button>
          </div>
        </div>
      </div>
    );
  }


  // -------------------------------------------------------------
  // 7. INITIATIVES LIST & DETAIL VIEW
  // -------------------------------------------------------------
  if (currentView === 'initiatives') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">
            المسؤولية المجتمعية والميدانية
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-stone-900">
            مبادرات حزب الجبهة الوطنية
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 max-w-xl mx-auto">
            مبادرات نوعية تنفذها أمانة قسم ثالث أكتوبر لخدمة المواطنين والنهوض بالمجتمع المحلي بمحافظة الجيزة.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {data.initiatives.map(init => (
            <div
              key={init.id}
              onClick={() => openInitiative(init.slug)}
              className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="p-6 sm:p-8 space-y-4 text-right">
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-3 py-1 rounded-full font-bold ${
                    init.status === 'active'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-stone-100 text-stone-600'
                  }`}>
                    {init.status === 'active' ? 'مبادرة نشطة' : (init.status === 'completed' ? 'مكتملة' : 'متوقفة مؤقتاً')}
                  </span>
                  <span className="text-xs text-stone-400">
                    انطلقت: {init.startDate}
                  </span>
                </div>

                <h2 className="text-2xl font-black text-stone-900 group-hover:text-red-700 transition-colors">
                  {init.title}
                </h2>

                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed line-clamp-3">
                  {init.description}
                </p>

                {init.goals && init.goals.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <span className="text-xs font-bold text-stone-800">أبرز الأهداف:</span>
                    <ul className="text-xs text-stone-600 space-y-1">
                      {init.goals.slice(0, 2).map((g, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="p-6 pt-0 border-t border-stone-100 flex items-center justify-between text-xs text-red-700 font-bold">
                <span>استعراض أنشطة وفعاليات المبادرة كاملة</span>
                <ChevronLeft className="w-4 h-4 group-hover:translate-x-[-4px] transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 8. INITIATIVE DETAIL VIEW
  // -------------------------------------------------------------
  if (currentView === 'initiative-detail') {
    const init = data.initiatives.find(i => i.slug === selectedSlug || i.id === selectedSlug) || data.initiatives[0];

    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        <button
          onClick={() => setCurrentView('initiatives')}
          className="inline-flex items-center gap-2 text-xs font-bold text-red-700 hover:underline cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لكافة المبادرات</span>
        </button>

        <div className="bg-white rounded-3xl border border-stone-200 p-8 sm:p-12 shadow-sm space-y-8 text-right">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
              {init.status === 'active' ? 'مبادرة نشطة ومستمرة' : 'مبادرة'}
            </span>
            <span className="text-xs text-stone-400">
              تاريخ البداية: {init.startDate}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-stone-900">
            {init.title}
          </h1>

          <p className="text-sm sm:text-base text-stone-700 leading-relaxed">
            {init.description}
          </p>

          {/* Goals */}
          {init.goals && init.goals.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-stone-100">
              <h3 className="font-extrabold text-stone-900 text-lg">
                أهداف المبادرة:
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {init.goals.map((goal, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="text-xs sm:text-sm font-medium text-stone-800">{goal}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activities Timeline */}
          {init.activities && init.activities.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-stone-100">
              <h3 className="font-extrabold text-stone-900 text-lg">
                سجل الأنشطة والمراحل الميدانية:
              </h3>
              <div className="space-y-4">
                {init.activities.map((act, i) => (
                  <div key={i} className="border-r-4 border-amber-600 pr-4 py-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-stone-900">{act.title}</span>
                      <span className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded">
                        {act.date}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600">{act.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multi-image Gallery */}
          {((init.galleryImages && init.galleryImages.length > 0) || init.coverUrl) && (() => {
            const allInitImgs = Array.from(new Set([...(init.coverUrl ? [init.coverUrl] : []), ...(init.galleryImages || [])])).filter(Boolean);
            return (
              <div className="space-y-4 pt-4 border-t border-stone-100">
                <h3 className="font-extrabold text-stone-900 text-lg flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-amber-600" />
                  <span>معرض صور وتوثيق المبادرة ({allInitImgs.length} صورة)</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {allInitImgs.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative group cursor-pointer overflow-hidden rounded-2xl border border-stone-200 aspect-video shadow-xs"
                      onClick={() => openLightbox(allInitImgs, idx, `${init.title} - توثيق المبادرة`)}
                    >
                      <img
                        src={img}
                        alt={`${init.title} - صورة ${idx + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <Maximize2 className="w-5 h-5" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Interactive Lightbox Modal */}
        <ImageLightboxModal
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          images={lightboxImages}
          initialIndex={lightboxIndex}
          title={lightboxTitle}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // 9. NEWS VIEW
  // -------------------------------------------------------------
  if (currentView === 'news') {
    const filteredNews = data.news.filter(n => {
      if (!newsSearch) return true;
      return n.title.includes(newsSearch) || n.content.includes(newsSearch);
    });

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold text-red-700 uppercase tracking-widest">
            المركز الإعلامي
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-stone-900">
            أخبار وبيانات حزب الجبهة الوطنية
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 max-w-xl mx-auto">
            المصدر الرسمي لكافة البيانات الإخبارية والتغطيات الميدانية لأمانة قسم ثالث أكتوبر.
          </p>
        </div>

        {/* Search Input */}
        <div className="max-w-md mx-auto">
          <div className="relative">
            <input
              type="text"
              placeholder="ابحث في الأخبار والبيانات..."
              value={newsSearch}
              onChange={e => setNewsSearch(e.target.value)}
              className="w-full bg-white border border-stone-300 rounded-xl px-4 py-2.5 text-xs text-stone-900 pr-10 focus:outline-hidden focus:border-red-700"
            />
            <Search className="w-4 h-4 text-stone-400 absolute right-3.5 top-3" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredNews.map(item => (
            <div
              key={item.id}
              onClick={() => {
                setSelectedNews(item);
                window.location.hash = `news?id=${item.id}`;
              }}
              className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="aspect-video bg-stone-100 overflow-hidden relative">
                  <img
                    src={item.coverImage || data.settings.officialLogo}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                  {item.isUrgent && (
                    <span className="absolute top-2.5 right-2.5 bg-red-600 text-white text-[10px] font-black px-2.5 py-1 rounded-md shadow-md animate-pulse flex items-center gap-1">
                      <span>⚡ عاجل</span>
                    </span>
                  )}
                  {item.isFeatured && !item.isUrgent && (
                    <span className="absolute top-2.5 right-2.5 bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                      خبر مميز
                    </span>
                  )}
                </div>

                <div className="p-6 text-right space-y-2">
                  <div className="flex items-center gap-2">
                    {item.isUrgent && (
                      <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded">
                        عاجل
                      </span>
                    )}
                    <span className="text-[11px] text-stone-400 font-mono">
                      {item.publishDate}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-stone-900 text-lg group-hover:text-red-700 transition-colors line-clamp-2">
                    {item.title}
                  </h3>
                  <p className="text-xs text-stone-600 line-clamp-3 leading-relaxed">
                    {item.excerpt}
                  </p>
                  {(item.authorName || item.authorPosition) && (
                    <div className="pt-2 border-t border-stone-100 flex items-center gap-1.5 text-[11px] text-amber-900 font-bold">
                      <span>{item.authorName ? `بقلم: ${item.authorName}` : 'المكتب الإعلامي'}</span>
                      {item.authorPosition && (
                        <span className="text-stone-500 font-normal text-[10px]">({item.authorPosition})</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 pt-0 space-y-3">
                <div className="text-left">
                  <span className="text-xs font-bold text-red-700 flex items-center gap-1 group-hover:underline">
                    <span>قراءة الخبر كاملاً</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </span>
                </div>
                <SocialShareButtons
                  title={item.title}
                  summary={item.excerpt}
                  itemType="news"
                  itemId={item.id}
                  compact
                />
              </div>
            </div>
          ))}
        </div>

        {/* News Modal */}
        {selectedNews && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 text-right shadow-2xl relative border border-stone-200 max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => {
                  setSelectedNews(null);
                  if (onClearSelectedNewsId) onClearSelectedNewsId();
                  if (window.location.hash.startsWith('#news')) {
                    window.location.hash = 'news';
                  }
                }}
                className="absolute top-4 left-4 p-2 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 cursor-pointer"
              >
                ✕
              </button>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {selectedNews.isUrgent && (
                    <span className="bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded-md animate-pulse flex items-center gap-1 shadow-xs">
                      <span>⚡ خبر عاجل</span>
                    </span>
                  )}
                  {selectedNews.isFeatured && !selectedNews.isUrgent && (
                    <span className="bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                      خبر مميز
                    </span>
                  )}
                  <span className="text-xs text-stone-400 font-mono">{selectedNews.publishDate}</span>
                </div>
                <h2 className="text-2xl font-black text-stone-900">
                  {selectedNews.title}
                </h2>

                {/* Author / Publisher Information */}
                {(selectedNews.authorName || selectedNews.authorPosition) && (
                  <div className="flex items-center gap-3 bg-stone-50 border border-stone-200 p-3 rounded-2xl">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-900 font-black flex items-center justify-center text-sm shrink-0">
                      {(selectedNews.authorName || 'ح').charAt(0)}
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-stone-900">
                        {selectedNews.authorName ? `بقلم: ${selectedNews.authorName}` : 'المكتب الإعلامي للأمانة'}
                      </div>
                      {selectedNews.authorPosition && (
                        <div className="text-[11px] font-semibold text-amber-800">
                          {selectedNews.authorPosition}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedNews.coverImage && (
                  <div
                    className="relative group cursor-pointer overflow-hidden rounded-xl bg-stone-100"
                    onClick={() => {
                      const allImgs = [selectedNews.coverImage, ...(selectedNews.galleryImages || [])].filter(Boolean) as string[];
                      openLightbox(allImgs, 0, selectedNews.title);
                    }}
                  >
                    <img
                      src={selectedNews.coverImage}
                      alt={selectedNews.title}
                      className="w-full aspect-video object-cover rounded-xl group-hover:scale-102 transition-transform duration-200"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                      <Maximize2 className="w-5 h-5" />
                      <span>عرض الصورة بحجم كامل</span>
                    </div>
                  </div>
                )}

                <div className="prose prose-sm text-stone-700 leading-relaxed whitespace-pre-line text-xs sm:text-sm">
                  {selectedNews.content}
                </div>

                {/* Multiple Images Gallery */}
                {selectedNews.galleryImages && selectedNews.galleryImages.length > 0 && (
                  <div className="pt-3 border-t border-stone-100 space-y-2">
                    <h4 className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-amber-600" />
                      <span>معرض صور الخبر ({selectedNews.galleryImages.length} صورة)</span>
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {selectedNews.galleryImages.map((img, idx) => {
                        const allImgs = [selectedNews.coverImage, ...(selectedNews.galleryImages || [])].filter(Boolean) as string[];
                        const targetIdx = selectedNews.coverImage ? idx + 1 : idx;
                        return (
                          <div
                            key={idx}
                            className="relative group cursor-pointer overflow-hidden rounded-xl border border-stone-200 aspect-video shadow-xs"
                            onClick={() => openLightbox(allImgs, targetIdx, `${selectedNews.title} - صورة ${idx + 1}`)}
                          >
                            <img
                              src={img}
                              alt={`${selectedNews.title} - صورة ${idx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <Maximize2 className="w-4 h-4" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedNews.videoUrl && (
                  <div className="pt-4 border-t border-stone-100">
                    <a
                      href={selectedNews.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>مشاهدة الفيديو المرفق</span>
                    </a>
                  </div>
                )}

                {/* Social Share Buttons inside Modal */}
                <SocialShareButtons
                  title={selectedNews.title}
                  summary={selectedNews.excerpt}
                  itemType="news"
                  itemId={selectedNews.id}
                />
              </div>
            </div>
          </div>
        )}

        {/* Interactive Lightbox Modal */}
        <ImageLightboxModal
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          images={lightboxImages}
          initialIndex={lightboxIndex}
          title={lightboxTitle}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // 10. EVENTS VIEW
  // -------------------------------------------------------------
  if (currentView === 'events') {
    const filteredEvents = data.events.filter(e => {
      if (eventsFilter === 'all') return true;
      return e.status === eventsFilter;
    });

    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">
            الأجندة واللقاءات
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-stone-900">
            الفعاليات والأنشطة الميدانية
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 max-w-xl mx-auto">
            متابعة حية لمؤتمرات، ندوات، وقوافل أمانة قسم ثالث أكتوبر بمحافظة الجيزة.
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex justify-center">
          <div className="inline-flex bg-stone-100 p-1.5 rounded-xl border border-stone-200 gap-1 text-xs font-bold">
            <button
              onClick={() => setEventsFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                eventsFilter === 'all' ? 'bg-amber-600 text-white shadow-xs' : 'text-stone-600'
              }`}
            >
              كافة الفعاليات ({data.events.length})
            </button>
            <button
              onClick={() => setEventsFilter('upcoming')}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                eventsFilter === 'upcoming' ? 'bg-amber-600 text-white shadow-xs' : 'text-stone-600'
              }`}
            >
              الفعاليات القادمة
            </button>
            <button
              onClick={() => setEventsFilter('completed')}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                eventsFilter === 'completed' ? 'bg-amber-600 text-white shadow-xs' : 'text-stone-600'
              }`}
            >
              الفعاليات المنتهية والتقارير
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {filteredEvents.map(event => (
            <div
              key={event.id}
              className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-xs hover:shadow-md transition-all text-right space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-4">
                <div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${
                    event.status === 'upcoming'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-stone-100 text-stone-700'
                  }`}>
                    {event.status === 'upcoming' ? 'فعالية قادمة' : (event.status === 'completed' ? 'فعالية منتهية' : 'جارية')}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-stone-900 mt-2">
                    {event.title}
                  </h3>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-xs font-bold text-red-700">
                    {new Date(event.dateTime).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                  <div className="text-xs text-stone-500 font-medium">
                    الساعة: {new Date(event.dateTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-stone-700 leading-relaxed">
                {event.description}
              </p>

              <div className="flex flex-wrap items-center gap-6 pt-2 text-xs text-stone-600">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-red-700" />
                  <span><strong>المكان:</strong> {event.venue}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-amber-600" />
                  <span><strong>الجهة المنظمة:</strong> {event.organizer}</span>
                </div>
              </div>

              {event.postReport && (
                <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 text-xs text-stone-700 space-y-1">
                  <span className="font-bold text-stone-900">تقرير ما بعد الفعالية:</span>
                  <p>{event.postReport}</p>
                </div>
              )}

              {/* Event Multi-image Gallery */}
              {((event.images && event.images.length > 0) || (event.galleryImages && event.galleryImages.length > 0) || event.coverUrl || event.coverImage) && (() => {
                const allEventImgs = Array.from(new Set([...(event.images || []), ...(event.galleryImages || []), ...(event.coverUrl ? [event.coverUrl] : []), ...(event.coverImage ? [event.coverImage] : [])])).filter(Boolean);
                return (
                  <div className="pt-3 border-t border-stone-100 space-y-2">
                    <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-amber-600" />
                      <span>تغطية وصور الفعالية ({allEventImgs.length} صورة)</span>
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {allEventImgs.map((img, i) => (
                        <div
                          key={i}
                          className="relative group cursor-pointer overflow-hidden rounded-xl border border-stone-200 aspect-video shadow-xs"
                          onClick={() => openLightbox(allEventImgs, i, `${event.title} - تغطية مصورة`)}
                        >
                          <img
                            src={img}
                            alt={`${event.title} - صورة ${i + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Maximize2 className="w-4 h-4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Share Buttons for Event */}
              <SocialShareButtons
                title={event.title}
                summary={event.description}
                itemType="event"
                itemId={event.id}
              />
            </div>
          ))}
        </div>

        {/* Interactive Lightbox Modal */}
        <ImageLightboxModal
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          images={lightboxImages}
          initialIndex={lightboxIndex}
          title={lightboxTitle}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // 11. MEDIA GALLERY VIEW (Removed per user instruction)
  // -------------------------------------------------------------
  if (currentView === 'gallery') {
    setCurrentView('home');
    return null;
  }

  // -------------------------------------------------------------
  // 12. JOIN US VIEW (Membership Application with 18 fields)
  // -------------------------------------------------------------
  if (currentView === 'join') {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold text-red-700 uppercase tracking-widest">
            البوابة الرقمية للعضوية
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-stone-900">
            {ct.joinTitle || 'طلب الانضمام إلى حزب الجبهة الوطنية'}
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 max-w-xl mx-auto">
            {ct.joinSubtitle || 'أمانة قسم ثالث أكتوبر – محافظة الجيزة. شعارنا: «مصر للجميع».'}
          </p>
        </div>

        {/* Top Mode Selector Tabs */}
        <div className="flex justify-center">
          <div className="inline-flex bg-stone-100 p-1.5 rounded-2xl border border-stone-200 gap-1.5 shadow-inner">
            <button
              onClick={() => {
                setJoinTab('submit');
                setInquiryError(null);
              }}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                joinTab === 'submit'
                  ? 'bg-red-700 text-white shadow-md'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
              }`}
            >
              <HeartHandshake className="w-4 h-4 text-amber-300" />
              <span>تقديم طلب عضوية جديد</span>
            </button>

            <button
              onClick={() => {
                setJoinTab('inquire');
                setAppError(null);
              }}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                joinTab === 'inquire'
                  ? 'bg-red-700 text-white shadow-md'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
              }`}
            >
              <FileSearch className="w-4 h-4 text-amber-300" />
              <span>الاستعلام ومتابعة طلب سابق برقم الطلب</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Inquire by Application Number / National ID */}
        {joinTab === 'inquire' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-10 shadow-sm text-right space-y-6">
              <div className="border-b border-stone-100 pb-4">
                <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
                  <Search className="w-5 h-5 text-red-700" />
                  <span>الاستعلام الفوري عن حالة طلب العضوية</span>
                </h2>
                <p className="text-xs text-stone-500 mt-1">
                  أدخل رقم متابعة الطلب (مثل <span className="font-mono text-red-700 font-bold" dir="ltr">NFP-2026-XXXX</span>) أو الرقم القومي المكون من 14 رقماً لمعرفة موقف طلبك وملاحظات لجنة العضوية.
                </p>
              </div>

              <form onSubmit={handleInquirySubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-2">
                    رقم الطلب أو الرقم القومي <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={inquiryQuery}
                      onChange={e => {
                        setInquiryQuery(e.target.value);
                        setInquiryError(null);
                      }}
                      placeholder="أدخل رقم المتابعة أو الـ 14 رقماً للبطاقة القومية"
                      className="w-full border-2 border-stone-300 focus:border-red-700 rounded-xl px-4 py-3.5 text-sm font-medium text-stone-900 focus:outline-hidden transition-colors"
                      dir="ltr"
                    />
                    <FileSearch className="w-5 h-5 text-stone-400 absolute left-4 top-3.5 pointer-events-none" />
                  </div>
                </div>

                {inquiryError && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{inquiryError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={inquiryLoading || !inquiryQuery.trim()}
                  className="w-full bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 text-white font-extrabold py-3.5 px-6 rounded-xl text-sm shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {inquiryLoading ? (
                    <span>جاري البحث والاستعلام...</span>
                  ) : (
                    <>
                      <Search className="w-4 h-4 text-amber-300" />
                      <span>استعلام عن حالة الطلب الآن</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Inquiry Result Card */}
            {hasInquired && inquiryResult && (
              <div className="animate-in zoom-in-95 duration-200">
                {inquiryResult.found ? (
                  <div className="bg-white rounded-3xl border-2 border-amber-500/40 p-6 sm:p-10 shadow-lg text-right space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
                      <div>
                        <span className="text-xs text-stone-500 font-semibold block">رقم الطلب الرسمي:</span>
                        <span className="font-mono text-2xl font-black text-red-700 tracking-wider">
                          {inquiryResult.applicationNumber}
                        </span>
                      </div>

                      <div>
                        {inquiryResult.status === 'مقبول' && (
                          <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-4 py-2 rounded-xl text-xs font-black border border-emerald-300 shadow-xs">
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                            <span>مقبول – تم قبول طلب العضوية بنجاح</span>
                          </span>
                        )}
                        {inquiryResult.status === 'قيد المراجعة' && (
                          <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-900 px-4 py-2 rounded-xl text-xs font-black border border-amber-300 shadow-xs">
                            <Clock className="w-4 h-4 text-amber-600" />
                            <span>قيد المراجعة والتدقيق</span>
                          </span>
                        )}
                        {inquiryResult.status === 'جديد' && (
                          <span className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-900 px-4 py-2 rounded-xl text-xs font-black border border-blue-300 shadow-xs">
                            <Clock className="w-4 h-4 text-blue-600" />
                            <span>جديد – بانتظار بدء المراجعة</span>
                          </span>
                        )}
                        {inquiryResult.status === 'مطلوب استكمال' && (
                          <span className="inline-flex items-center gap-1.5 bg-purple-100 text-purple-900 px-4 py-2 rounded-xl text-xs font-black border border-purple-300 shadow-xs">
                            <HelpCircle className="w-4 h-4 text-purple-600" />
                            <span>مطلوب استكمال بيانات أو مستندات</span>
                          </span>
                        )}
                        {inquiryResult.status === 'مرفوض' && (
                          <span className="inline-flex items-center gap-1.5 bg-red-100 text-red-900 px-4 py-2 rounded-xl text-xs font-black border border-red-300 shadow-xs">
                            <XCircle className="w-4 h-4 text-red-600" />
                            <span>نعتذر، لم يتم قبول الطلب</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                        <span className="text-stone-500 block mb-1">اسم مقدم الطلب:</span>
                        <span className="font-bold text-stone-900 text-sm">{inquiryResult.fullName}</span>
                      </div>
                      <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                        <span className="text-stone-500 block mb-1">النطاق الجغرافي:</span>
                        <span className="font-bold text-stone-900 text-sm">
                          {inquiryResult.governorate} – {inquiryResult.district}
                        </span>
                      </div>
                      <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                        <span className="text-stone-500 block mb-1">تاريخ تقديم الطلب:</span>
                        <span className="font-bold text-stone-900 text-sm">
                          {inquiryResult.createdAt ? new Date(inquiryResult.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                        </span>
                      </div>
                    </div>

                    {inquiryResult.officialMessage && (
                      <div className="bg-amber-50/80 border border-amber-200 p-5 rounded-2xl">
                        <h4 className="text-xs font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                          <Award className="w-4 h-4 text-amber-600" />
                          <span>بيان وإفادة لجنة العضوية بأمانة قسم ثالث أكتوبر:</span>
                        </h4>
                        <p className="text-xs sm:text-sm text-stone-800 leading-relaxed font-medium">
                          {inquiryResult.officialMessage}
                        </p>
                      </div>
                    )}

                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-stone-100 text-xs text-stone-500">
                      <span>لأي استفسار إضافي، يمكنكم التواصل مع أمانة قسم ثالث أكتوبر:</span>
                      {data.settings.whatsapp && (
                        <a
                          href={`https://wa.me/20${data.settings.whatsapp.replace(/\D/g, '').replace(/^20/, '')}?text=${encodeURIComponent(`السلام عليكم، أود الاستفسار عن طلب العضوية رقم ${inquiryResult.applicationNumber}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-colors cursor-pointer shrink-0"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>محادثة واتساب مباشرة</span>
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 border-2 border-dashed border-amber-300 rounded-3xl p-8 text-center space-y-4">
                    <HelpCircle className="w-12 h-12 text-amber-600 mx-auto" />
                    <h3 className="font-black text-amber-950 text-base">
                      لم يتم العثور على طلب مسجل بهذا الرقم
                    </h3>
                    <p className="text-xs text-amber-900 max-w-md mx-auto leading-relaxed">
                      تأكد من كتابة رقم المتابعة بدقة كما ظهر لك فور التقديم (أو إدخال الـ 14 رقماً لبطاقة الرقم القومي بدون فواصل أو مسافات).
                    </p>
                    <button
                      type="button"
                      onClick={() => setJoinTab('submit')}
                      className="bg-red-700 hover:bg-red-800 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      تقديم طلب انضمام جديد الآن
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Membership Application Form */}
        {joinTab === 'submit' && (
          <>
            {appSuccessResult ? (
              <div className="bg-emerald-50 border-2 border-emerald-500 rounded-3xl p-8 sm:p-12 text-center space-y-6 animate-in zoom-in-95">
                <div className="w-16 h-16 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-lg">
                  <CheckCircle2 className="w-10 h-10" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-black text-emerald-900">
                    تم تسجيل طلب انضمامكم بنجاح!
                  </h2>
                  <p className="text-sm text-emerald-800 max-w-lg mx-auto">
                    {appSuccessResult.message}
                  </p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-emerald-200 inline-block shadow-sm">
                  <span className="text-xs text-stone-500 block mb-1">رقم متابعة الطلب الخاص بكم:</span>
                  <span className="font-mono text-2xl font-black text-red-700 tracking-wider">
                    {appSuccessResult.appNumber}
                  </span>
                </div>

                <p className="text-xs text-stone-500">
                  يرجى الاحتفاظ برقم المتابعة للمراجعة والاستعلام الفوري عن حالة الطلب من الموقع.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      setInquiryQuery(appSuccessResult.appNumber);
                      setJoinTab('inquire');
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <Search className="w-4 h-4" />
                    <span>متابعة حالة الطلب فوراً</span>
                  </button>

                  <button
                    onClick={() => {
                      setAppSuccessResult(null);
                      setCurrentView('home');
                    }}
                    className="bg-stone-900 hover:bg-stone-800 text-white font-bold px-8 py-3 rounded-xl text-sm transition-colors cursor-pointer"
                  >
                    العودة للصفحة الرئيسية
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-10 shadow-sm text-right animate-in fade-in duration-200">
                {appError && (
                  <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{appError}</span>
                  </div>
                )}

                <form onSubmit={handleApplicationSubmit} className="space-y-8">
              
              {/* Section A: Personal Information */}
              <div className="space-y-4">
                <h3 className="text-base font-extrabold text-stone-900 border-r-4 border-red-700 pr-3">
                  1. البيانات الشخصية الأساسية
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>الاسم الرباعي كما في بطاقة الرقم القومي</span>
                      {isFieldReq('fullName') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <input
                      type="text"
                      required={isFieldReq('fullName')}
                      value={appForm.fullName}
                      onChange={e => setAppForm({ ...appForm, fullName: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>الرقم القومي (14 رقماً)</span>
                      {isFieldReq('nationalId') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <input
                      type="text"
                      required={isFieldReq('nationalId')}
                      maxLength={14}
                      value={appForm.nationalId}
                      onChange={e => setAppForm({ ...appForm, nationalId: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs font-mono text-stone-900 focus:outline-hidden focus:border-red-700"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>تاريخ الميلاد</span>
                      {isFieldReq('dateOfBirth') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <input
                      type="date"
                      required={isFieldReq('dateOfBirth')}
                      value={appForm.dateOfBirth}
                      onChange={e => setAppForm({ ...appForm, dateOfBirth: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                        <span>النوع</span>
                        {isFieldReq('gender') ? (
                          <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1 py-0.5 rounded-md">*</span>
                        ) : (
                          <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1 py-0.5 rounded-md">اختياري</span>
                        )}
                      </label>
                      <select
                        required={isFieldReq('gender')}
                        value={appForm.gender}
                        onChange={e => setAppForm({ ...appForm, gender: e.target.value as any })}
                        className="w-full border border-stone-300 rounded-xl px-3 py-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                      >
                        <option value="ذكر">ذكر</option>
                        <option value="أنثى">أنثى</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                        <span>الحالة الاجتماعية</span>
                        {isFieldReq('maritalStatus') ? (
                          <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1 py-0.5 rounded-md">*</span>
                        ) : (
                          <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1 py-0.5 rounded-md">اختياري</span>
                        )}
                      </label>
                      <select
                        required={isFieldReq('maritalStatus')}
                        value={appForm.maritalStatus}
                        onChange={e => setAppForm({ ...appForm, maritalStatus: e.target.value as any })}
                        className="w-full border border-stone-300 rounded-xl px-3 py-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                      >
                        <option value="أعزب">أعزب</option>
                        <option value="متزوج">متزوج</option>
                        <option value="أخرى">أخرى</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section B: Geographic Address */}
              <div className="space-y-4 pt-4 border-t border-stone-100">
                <h3 className="text-base font-extrabold text-stone-900 border-r-4 border-amber-600 pr-3">
                  2. النطاق الجغرافي والعنوان
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">المحافظة</label>
                    <input
                      type="text"
                      disabled
                      value={appForm.governorate}
                      className="w-full bg-stone-100 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-600 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">القسم / المركز</label>
                    <input
                      type="text"
                      disabled
                      value={appForm.district}
                      className="w-full bg-stone-100 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-600 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>العنوان التفصيلي</span>
                      {isFieldReq('address') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <input
                      type="text"
                      required={isFieldReq('address')}
                      value={appForm.address}
                      onChange={e => setAppForm({ ...appForm, address: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                    />
                  </div>
                </div>
              </div>

              {/* Section C: Contact Information */}
              <div className="space-y-4 pt-4 border-t border-stone-100">
                <h3 className="text-base font-extrabold text-stone-900 border-r-4 border-red-700 pr-3">
                  3. بيانات التواصل
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>رقم الهاتف المحمول</span>
                      {isFieldReq('phone') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <input
                      type="tel"
                      required={isFieldReq('phone')}
                      value={appForm.phone}
                      onChange={e => setAppForm({ ...appForm, phone: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs font-mono text-stone-900 focus:outline-hidden focus:border-red-700"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>رقم واتساب</span>
                      {isFieldReq('whatsapp') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <input
                      type="tel"
                      required={isFieldReq('whatsapp')}
                      value={appForm.whatsapp}
                      onChange={e => setAppForm({ ...appForm, whatsapp: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs font-mono text-stone-900 focus:outline-hidden focus:border-red-700"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>البريد الإلكتروني</span>
                      {isFieldReq('email') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <input
                      type="email"
                      required={isFieldReq('email')}
                      value={appForm.email}
                      onChange={e => setAppForm({ ...appForm, email: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              {/* Section D: Qualification & Profession */}
              <div className="space-y-4 pt-4 border-t border-stone-100">
                <h3 className="text-base font-extrabold text-stone-900 border-r-4 border-amber-600 pr-3">
                  4. المؤهل العلمي والمسار المهني
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>المؤهل الدراسي</span>
                      {isFieldReq('qualification') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <input
                      type="text"
                      required={isFieldReq('qualification')}
                      value={appForm.qualification}
                      onChange={e => setAppForm({ ...appForm, qualification: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>الوظيفة الحالية</span>
                      {isFieldReq('job') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <input
                      type="text"
                      required={isFieldReq('job')}
                      value={appForm.job}
                      onChange={e => setAppForm({ ...appForm, job: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>جهة العمل</span>
                      {isFieldReq('workplace') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <input
                      type="text"
                      required={isFieldReq('workplace')}
                      value={appForm.workplace}
                      onChange={e => setAppForm({ ...appForm, workplace: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                    />
                  </div>
                </div>
              </div>

              {/* Section E: Skills & Motivations */}
              <div className="space-y-4 pt-4 border-t border-stone-100">
                <h3 className="text-base font-extrabold text-stone-900 border-r-4 border-red-700 pr-3">
                  5. المهارات والاهتمامات الحزبية
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>المهارات والخبرات العملية</span>
                      {isFieldReq('skills') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <textarea
                      rows={2}
                      required={isFieldReq('skills')}
                      value={appForm.skills}
                      onChange={e => setAppForm({ ...appForm, skills: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>الاهتمامات الحزبية والأمانات المفضلة</span>
                      {isFieldReq('interests') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <textarea
                      rows={2}
                      required={isFieldReq('interests')}
                      value={appForm.interests}
                      onChange={e => setAppForm({ ...appForm, interests: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>الخبرات التطوعية السابقة</span>
                      {isFieldReq('volunteerExperience') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <input
                      type="text"
                      required={isFieldReq('volunteerExperience')}
                      value={appForm.volunteerExperience}
                      onChange={e => setAppForm({ ...appForm, volunteerExperience: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center justify-between">
                      <span>سبب الرغبة في الانضمام لحزب الجبهة الوطنية</span>
                      {isFieldReq('reasonForJoining') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <input
                      type="text"
                      required={isFieldReq('reasonForJoining')}
                      value={appForm.reasonForJoining}
                      onChange={e => setAppForm({ ...appForm, reasonForJoining: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                    />
                  </div>
                </div>
              </div>

              {/* Section F: Official Documents Upload */}
              <div className="space-y-4 pt-4 border-t border-stone-100">
                <h3 className="text-base font-extrabold text-stone-900 border-r-4 border-amber-600 pr-3">
                  6. إرفاق المستندات الرسمية
                </h3>
                <p className="text-xs text-stone-500">
                  المستندات تُحفظ في بيئة مشفرة ومؤمنة وتُستخدم فقط للتحقق الإداري من هوية مقدم الطلب.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Personal Photo */}
                  <div className={`border rounded-2xl p-4 text-center transition-colors ${isFieldReq('personalPhotoUrl') && !appForm.personalPhotoUrl ? 'border-amber-300 bg-amber-50/20' : 'border-stone-300 hover:border-red-700'}`}>
                    <span className="text-xs font-bold text-stone-800 flex items-center justify-between mb-2">
                      <span>الصورة الشخصية</span>
                      {isFieldReq('personalPhotoUrl') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </span>
                    {appForm.personalPhotoUrl ? (
                      <div className="space-y-2">
                        <img src={appForm.personalPhotoUrl} alt="شخصية" className="w-20 h-20 object-cover rounded-xl mx-auto shadow-xs" />
                        <button
                          type="button"
                          onClick={() => setAppForm({ ...appForm, personalPhotoUrl: '' })}
                          className="text-[10px] text-red-600 hover:underline"
                        >
                          تغيير الصورة
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block p-4 border border-dashed border-stone-300 rounded-xl hover:bg-stone-50">
                        <Upload className="w-6 h-6 text-stone-400 mx-auto mb-1" />
                        <span className="text-[11px] text-stone-600 font-medium">رفع صورة شخصية</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => handleFileUpload(e, 'personalPhotoUrl')}
                        />
                      </label>
                    )}
                  </div>

                  {/* ID Front */}
                  <div className={`border rounded-2xl p-4 text-center transition-colors ${isFieldReq('nationalIdFrontUrl') && !appForm.nationalIdFrontUrl ? 'border-amber-300 bg-amber-50/20' : 'border-stone-300 hover:border-red-700'}`}>
                    <span className="text-xs font-bold text-stone-800 flex items-center justify-between mb-2">
                      <span>بطاقة الرقم القومي (الوجه)</span>
                      {isFieldReq('nationalIdFrontUrl') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </span>
                    {appForm.nationalIdFrontUrl ? (
                      <div className="space-y-2">
                        <img src={appForm.nationalIdFrontUrl} alt="وجه البطاقة" className="w-28 h-16 object-cover rounded-lg mx-auto shadow-xs" />
                        <button
                          type="button"
                          onClick={() => setAppForm({ ...appForm, nationalIdFrontUrl: '' })}
                          className="text-[10px] text-red-600 hover:underline"
                        >
                          تغيير الوجه
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block p-4 border border-dashed border-stone-300 rounded-xl hover:bg-stone-50">
                        <Upload className="w-6 h-6 text-stone-400 mx-auto mb-1" />
                        <span className="text-[11px] text-stone-600 font-medium">رفع وجه البطاقة</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => handleFileUpload(e, 'nationalIdFrontUrl')}
                        />
                      </label>
                    )}
                  </div>

                  {/* ID Back */}
                  <div className={`border rounded-2xl p-4 text-center transition-colors ${isFieldReq('nationalIdBackUrl') && !appForm.nationalIdBackUrl ? 'border-amber-300 bg-amber-50/20' : 'border-stone-300 hover:border-red-700'}`}>
                    <span className="text-xs font-bold text-stone-800 flex items-center justify-between mb-2">
                      <span>بطاقة الرقم القومي (الظهر)</span>
                      {isFieldReq('nationalIdBackUrl') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </span>
                    {appForm.nationalIdBackUrl ? (
                      <div className="space-y-2">
                        <img src={appForm.nationalIdBackUrl} alt="ظهر البطاقة" className="w-28 h-16 object-cover rounded-lg mx-auto shadow-xs" />
                        <button
                          type="button"
                          onClick={() => setAppForm({ ...appForm, nationalIdBackUrl: '' })}
                          className="text-[10px] text-red-600 hover:underline"
                        >
                          تغيير الظهر
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block p-4 border border-dashed border-stone-300 rounded-xl hover:bg-stone-50">
                        <Upload className="w-6 h-6 text-stone-400 mx-auto mb-1" />
                        <span className="text-[11px] text-stone-600 font-medium">رفع ظهر البطاقة</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => handleFileUpload(e, 'nationalIdBackUrl')}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* Declarations & Consent */}
              <div className="pt-4 border-t border-stone-100 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={appForm.consentAgreed}
                    onChange={e => setAppForm({ ...appForm, consentAgreed: e.target.checked })}
                    className="w-4 h-4 text-red-700 rounded mt-0.5"
                  />
                  <span className="text-xs text-stone-700 leading-relaxed font-medium">
                    أقر أنا مقدم الطلب بصحة كافة البيانات والمستندات المسجلة أعلاه، وأوافق على سياسة الخصوصية واستخدام البيانات لمراجعة طلب الانضمام والتواصل من قِبل أمانة قسم ثالث أكتوبر بحزب الجبهة الوطنية.
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={appSubmitting}
                  className="w-full bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 text-white font-extrabold py-3.5 px-6 rounded-xl text-base shadow-lg transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {appSubmitting ? (
                    <span>جاري معالجة وإرسال الطلب...</span>
                  ) : (
                    <>
                      <UserCheck className="w-5 h-5 text-amber-300" />
                      <span>إرسال طلب الانضمام رسمياً</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        )}
          </>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // 13. CONTACT US VIEW
  // -------------------------------------------------------------
  if (currentView === 'contact') {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold text-red-700 uppercase tracking-widest">
            قنوات الاتصال المباشرة
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-stone-900">
            تواصل مع أمانة قسم ثالث أكتوبر
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 max-w-xl mx-auto">
            يسعدنا استقبال مقترحاتكم واستفساراتكم على مدار الساعة عبر القنوات الرسمية المعتمدة.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Official Contact Cards (Left/Center) */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* Phone & Citizen Services */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs text-right space-y-2">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Phone className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-stone-900 text-base">
                الهاتف وخدمة المواطنين
              </h3>
              <p className="text-xs text-stone-500">
                للتواصل المباشر مع أمانة قسم ثالث أكتوبر بمحافظة الجيزة
              </p>
              <a
                href="tel:01003070108"
                className="inline-block text-lg font-mono font-bold text-red-700 hover:underline pt-1"
                dir="ltr"
              >
                01003070108
              </a>
            </div>

            {/* WhatsApp */}
            <div className="bg-emerald-50/70 rounded-2xl border border-emerald-200 p-6 shadow-xs text-right space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                <MessageCircle className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-emerald-950 text-base">
                محادثة واتساب الرسمية
              </h3>
              <p className="text-xs text-emerald-800">
                إرسال استفسارات ومقترحات المواطنين مباشرة
              </p>
              <a
                href="https://wa.me/201003070108"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-xs mt-1"
              >
                <span>بدء محادثة واتساب الآن</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Location (المقر واللوكيشن) */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs text-right space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-stone-900 text-base">
                  المقر واللوكيشن الجغرافي
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  أمانة قسم ثالث أكتوبر – محافظة الجيزة
                </p>
              </div>
              <p className="text-xs text-stone-700 font-medium leading-relaxed bg-stone-50 p-3 rounded-xl border border-stone-200">
                {data.settings.address || 'قسم ثالث أكتوبر، محافظة الجيزة، جمهورية مصر العربية'}
              </p>
              {data.settings.locationUrl && (
                <a
                  href={data.settings.locationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-colors shadow-xs"
                >
                  <MapPin className="w-4 h-4 text-amber-300" />
                  <span>فتح اللوكيشن على خرائط جوجل (Google Maps)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

          </div>

          {/* Interactive Google Map embed & Quick Message (Right) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Official Party-Branded Map Frame */}
            <div className="bg-white rounded-3xl border-2 border-stone-200 overflow-hidden shadow-md">
              {/* Party Header for Map */}
              <div className="bg-gradient-to-r from-stone-900 via-stone-950 to-stone-900 p-4 sm:p-5 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b-2 border-amber-500">
                <div className="flex items-center gap-3">
                  <img
                    src={data.settings.officialLogo || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                    alt="شعار الحزب"
                    className="w-11 h-11 object-contain rounded-xl bg-white p-1 shadow-sm shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <h4 className="font-black text-white text-sm sm:text-base">
                        مقر أمانة قسم ثالث أكتوبر – حزب الجبهة الوطنية
                      </h4>
                    </div>
                    <p className="text-[11px] text-amber-300 font-semibold mt-0.5">
                      محافظة الجيزة · شعارنا: «{data.settings.slogan || 'مصر للجميع'}»
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={
                      data.settings.locationUrl ||
                      'https://maps.google.com/?q=29.980836,30.840788+(%D8%AD%D8%B2%D8%A8+%D8%A7%D9%84%D8%AC%D8%A8%D9%87%D8%A9+%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A%D8%A9+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+%D8%A3%D9%83%D8%AA%D9%88%D8%A8%D8%B1)'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition-colors shadow-xs"
                  >
                    <MapPin className="w-3.5 h-3.5 text-amber-300" />
                    <span>فتح في Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Map Canvas */}
              <div className="aspect-[16/10] sm:aspect-[16/9] w-full bg-stone-100 relative">
                <iframe
                  title="موقع أمانة حزب الجبهة الوطنية قسم ثالث أكتوبر"
                  src={
                    data.settings.mapEmbedUrl ||
                    'https://maps.google.com/maps?q=29.980836,30.840788+(%D9%85%D9%82%D8%B1+%D8%AD%D8%B2%D8%A8+%D8%A7%D9%84%D8%AC%D8%A8%D9%87%D8%A9+%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A%D8%A9+-+%D8%A3%D9%85%D8%A7%D9%86%D8%A9+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+%D8%A3%D9%83%D8%AA%D9%88%D8%A8%D8%B1)&t=&z=17&ie=UTF8&iwloc=B&output=embed'
                  }
                  className="w-full h-full border-0"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />

                {/* Party Location Badge Overlay */}
                <div className="absolute bottom-3 right-3 left-3 sm:left-auto bg-stone-900/90 backdrop-blur-md text-white p-3 rounded-2xl border border-amber-500/40 shadow-xl max-w-sm pointer-events-auto">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 border border-amber-300" />
                    <span className="text-xs font-black text-amber-300">
                      مقر أمانة قسم ثالث أكتوبر الرسمي
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-200 line-clamp-2">
                    {data.settings.address || 'قسم ثالث أكتوبر، محافظة الجيزة، جمهورية مصر العربية'}
                  </p>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-stone-800 text-[10px]">
                    <a
                      href="https://www.google.com/maps/dir/?api=1&destination=29.980836,30.840788"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:underline font-bold flex items-center gap-1"
                    >
                      <span>الاتجاهات والمسار</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    <span className="text-stone-600">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(data.settings.address || 'قسم ثالث أكتوبر، محافظة الجيزة');
                        alert('تم نسخ عنوان المقر بنجاح!');
                      }}
                      className="text-stone-300 hover:text-white cursor-pointer font-medium"
                    >
                      نسخ العنوان
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick WhatsApp message launcher form */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-xs text-right space-y-4">
              <h3 className="text-base font-extrabold text-stone-900 border-r-4 border-emerald-600 pr-3">
                إرسال رسالة سريعة إلى الأمانة
              </h3>
              <p className="text-xs text-stone-500">
                يمكنكم كتابة رسالتكم أدناه وسيتم تحويلكم مباشرة للتواصل الفوري مع مسؤولي أمانة قسم ثالث أكتوبر عبر واتساب.
              </p>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  نص الرسالة أو الاستفسار
                </label>
                <textarea
                  id="quick-msg-input"
                  rows={3}
                  placeholder="اكتب استفسارك أو مقترحك هنا..."
                  className="w-full border border-stone-300 rounded-xl p-3 text-xs text-stone-900 focus:outline-hidden focus:border-emerald-600"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  const val = (document.getElementById('quick-msg-input') as HTMLTextAreaElement)?.value || 'مرحباً، أود التواصل مع أمانة قسم ثالث أكتوبر لحزب الجبهة الوطنية.';
                  const encoded = encodeURIComponent(val);
                  window.open(`https://wa.me/201003070108?text=${encoded}`, '_blank');
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                <MessageCircle className="w-4 h-4" />
                <span>إرسال عبر واتساب إلى (01003070108)</span>
              </button>
            </div>

          </div>

        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 14. DYNAMIC CMS PAGE VIEW
  // -------------------------------------------------------------
  if (currentView === 'cms-page') {
    const activePage = (data.pages || []).find(p => p.slug === selectedSlug) || (data.pages || [])[0];

    if (!activePage) {
      return (
        <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
          <div className="w-16 h-16 bg-stone-100 text-stone-500 rounded-full flex items-center justify-center mx-auto">
            <BookOpen className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-stone-900">الصفحة المطلوبة غير موجودة أو لم تُنشر بعد</h2>
          <p className="text-xs text-stone-500">يمكنكم العودة للصفحة الرئيسية واستعراض باقي أقسام المنصة الرسمية.</p>
          <button
            onClick={() => setCurrentView('home')}
            className="bg-red-700 hover:bg-red-800 text-white font-bold px-6 py-2.5 rounded-xl text-xs cursor-pointer inline-flex items-center gap-2"
          >
            <span>العودة للرئيسية</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      );
    }

    return (
      <article className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 text-right animate-in fade-in">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between border-b border-stone-200 pb-4">
          <button
            onClick={() => setCurrentView('home')}
            className="inline-flex items-center gap-2 text-xs font-bold text-stone-500 hover:text-red-700 transition-colors cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة للرئيسية</span>
          </button>
          <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
            صفحة رسمية معتمدة
          </span>
        </div>

        {/* Cover Image */}
        {activePage.coverImage && (
          <div className="rounded-3xl overflow-hidden border border-stone-200 shadow-md aspect-[21/9] w-full bg-stone-100 relative">
            <img
              src={activePage.coverImage}
              alt={activePage.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </div>
        )}

        {/* Header Title & Subtitle */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-stone-950 leading-tight">
            {activePage.title}
          </h1>
          {activePage.subtitle && (
            <p className="text-base sm:text-lg font-medium text-stone-600 leading-relaxed border-r-4 border-red-700 pr-3">
              {activePage.subtitle}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs text-stone-400 font-mono pt-1">
            <span>آخر تحديث: {new Date(activePage.updatedAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span>•</span>
            <span className="text-stone-600 font-bold">حزب الجبهة الوطنية – قسم ثالث أكتوبر</span>
          </div>
        </div>

        {/* Main Content Body (Formatted) */}
        <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-10 shadow-xs space-y-6 text-stone-800 leading-relaxed text-sm sm:text-base">
          {activePage.content.split('\n\n').map((paragraph, idx) => {
            const trimmed = paragraph.trim();
            if (!trimmed) return null;

            // Heading 2
            if (trimmed.startsWith('## ')) {
              return (
                <h2 key={idx} className="text-xl sm:text-2xl font-black text-stone-900 border-r-4 border-red-700 pr-3 mt-8 mb-4">
                  {trimmed.replace('## ', '')}
                </h2>
              );
            }

            // Heading 3
            if (trimmed.startsWith('### ')) {
              return (
                <h3 key={idx} className="text-lg sm:text-xl font-bold text-amber-800 border-r-3 border-amber-600 pr-2 mt-6 mb-3">
                  {trimmed.replace('### ', '')}
                </h3>
              );
            }

            // Blockquote
            if (trimmed.startsWith('> ')) {
              return (
                <blockquote key={idx} className="bg-amber-50/60 border-r-4 border-amber-600 p-4 rounded-xl text-stone-800 font-semibold my-4 italic">
                  {trimmed.replace('> ', '')}
                </blockquote>
              );
            }

            // Bullet List
            if (trimmed.includes('\n- ') || trimmed.startsWith('- ')) {
              const items = trimmed.split('\n').filter(line => line.startsWith('- '));
              return (
                <ul key={idx} className="space-y-2.5 my-4">
                  {items.map((item, iIdx) => (
                    <li key={iIdx} className="flex items-start gap-2.5 bg-stone-50 p-3 rounded-xl border border-stone-200 text-xs sm:text-sm">
                      <CheckCircle2 className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                      <span>{item.replace('- ', '')}</span>
                    </li>
                  ))}
                </ul>
              );
            }

            // Divider
            if (trimmed === '---') {
              return <hr key={idx} className="border-t border-stone-200 my-6" />;
            }

            // Standard Paragraph
            return (
              <p key={idx} className="text-stone-700 leading-loose text-justify">
                {trimmed}
              </p>
            );
          })}
        </div>

        {/* Page Gallery if present */}
        {activePage.galleryImages && activePage.galleryImages.length > 0 && (
          <div className="space-y-4 pt-4">
            <h3 className="text-lg font-black text-stone-900 border-r-4 border-amber-600 pr-3">
              معرض صور الصفحة
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {activePage.galleryImages.map((imgUrl, i) => (
                <div key={i} className="rounded-2xl overflow-hidden border border-stone-200 aspect-[4/3] bg-stone-100 shadow-xs">
                  <img src={imgUrl} alt={`صورة ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer CTAs */}
        <div className="bg-gradient-to-r from-red-700 to-stone-900 rounded-3xl p-8 text-white flex flex-col sm:flex-row items-center justify-between gap-6 text-right">
          <div>
            <h3 className="text-xl font-black">انضم إلى مسيرة البناء والعمل الوطني</h3>
            <p className="text-xs text-stone-200 mt-1">«مصر للجميع» – معاً من أجل نهضة وتنمية الوطن وخدمة أهالي قسم ثالث أكتوبر.</p>
          </div>
          <button
            onClick={() => setCurrentView('join')}
            className="bg-amber-400 hover:bg-amber-300 text-stone-950 font-black px-6 py-3 rounded-xl text-xs shrink-0 cursor-pointer shadow-md transition-colors"
          >
            تقديم طلب انضمام للحزب
          </button>
        </div>
      </article>
    );
  }

  return null;
};
