import React, { useState, useEffect } from 'react';
import {
  PublicPortalData,
  SpecializedSecretariat,
  AssistantSecretaryEntry,
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
  X,
  Radio,
  ShieldCheck,
  Volume2,
  VolumeX,
  PenTool
} from 'lucide-react';
import { api } from '../api';
import { SocialShareButtons } from './SocialShareButtons';
import { trackEvent } from '../utils/analytics';
import { ImageLightboxModal } from './ImageLightboxModal';
import { VideoPlayer } from './VideoPlayer';
import {
  syncHeroAudioState,
  stopHeroAudio,
  clearBrowserMediaSession,
  unlockHeroAudioNow
} from '../utils/heroAudio';
import {
  resolvePersonInSecretariats,
  getAllPeopleInSecretariat,
  normalizeArabicPersonName,
  getPersonContributions
} from '../utils/personSecretariat';

function normalizeArabicDigits(val: string): string {
  return val
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

function normalizeLocationHref(url?: string): string | null {
  const raw = (url || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function extractDobFromNationalId(nid: string): string | null {
  const digits = normalizeArabicDigits(nid).replace(/\D/g, '');
  if (digits.length < 7) return null;

  const centuryCode = digits[0];
  if (centuryCode !== '2' && centuryCode !== '3') return null;

  const centuryBase = centuryCode === '2' ? 1900 : 2000;
  const year = centuryBase + parseInt(digits.slice(1, 3), 10);
  const month = parseInt(digits.slice(3, 5), 10);
  const day = parseInt(digits.slice(5, 7), 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  if (dt.getTime() > Date.now()) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface PublicPagesProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  onNavigate?: (
    view: string,
    options?: { slug?: string; newsId?: string | null; eventId?: string | null; person?: string | null }
  ) => void;
  data: PublicPortalData;
  onRefreshData: () => void;
  selectedSlug?: string;
  setSelectedSlug?: (slug: string) => void;
  selectedNewsId?: string | null;
  selectedEventId?: string | null;
  selectedPerson?: string | null;
  onClearSelectedNewsId?: () => void;
}

export const PublicPages: React.FC<PublicPagesProps> = ({
  currentView,
  setCurrentView,
  onNavigate,
  data,
  onRefreshData,
  selectedSlug,
  setSelectedSlug,
  selectedNewsId,
  selectedEventId,
  selectedPerson,
  onClearSelectedNewsId
}) => {
  const ct = data.settings.customTexts || {};

  // Public visitor view is strictly read-only; admin modifications are exclusively performed via the Admin Panel

  // Modal states for leaders / news
  const [selectedPartyLeader, setSelectedPartyLeader] = useState<PartyLeader | null>(null);
  const [selectedSecLeader, setSelectedSecLeader] = useState<SecretariatLeader | null>(null);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [selectedPersonFallback, setSelectedPersonFallback] = useState<{
    name: string;
    position?: string;
    secretariatId?: string;
  } | null>(null);
  const [focusedPersonKey, setFocusedPersonKey] = useState<string | null>(selectedPerson || null);

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
  const heroVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const adminLockedMute = Boolean(data.settings.heroDefaultMuted);
  const [visitorMuted, setVisitorMuted] = useState<boolean>(adminLockedMute);
  const [useNativeHeroVideoAudio, setUseNativeHeroVideoAudio] = useState(false);
  const effectiveHeroMuted = adminLockedMute || visitorMuted;
  const wantNativeHeroAudio = !effectiveHeroMuted && useNativeHeroVideoAudio;

  useEffect(() => {
    setVisitorMuted(Boolean(data.settings.heroDefaultMuted));
  }, [data.settings.heroDefaultMuted]);

  // Stop hero audio when leaving PublicPages
  useEffect(() => {
    return () => {
      stopHeroAudio();
    };
  }, []);

  // Construct hero slides based on heroMediaType ('video' | 'images' | 'both')
  const heroSlides = React.useMemo(() => {
    const mediaType = data.settings.heroMediaType || 'video';
    const list: Array<{
      id: string;
      type: 'video' | 'image';
      url: string;
      posterUrl?: string;
      title?: string;
      caption?: string;
    }> = [];

    const mainVideoUrl = data.settings.heroVideoUrl || '/assets/aistudio/VID-20261023-WA0156_a7a2c2e2.mp4';
    const mainPosterUrl = data.settings.heroPosterUrl || data.settings.officialLogo || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg';

    // 1. VIDEO MODE or BOTH: Add verified party video
    if (mediaType === 'video' || mediaType === 'both') {
      list.push({
        id: 'hero-main-vid',
        type: 'video',
        url: mainVideoUrl,
        posterUrl: mainPosterUrl,
        title: 'مقر حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر',
        caption: 'أمانة قسم ثالث أكتوبر – محافظة الجيزة'
      });
    }

    // 2. IMAGES MODE or BOTH: Add user-selected/uploaded photos only
    if (mediaType === 'images' || mediaType === 'both') {
      if (data.settings.heroImages && data.settings.heroImages.length > 0) {
        data.settings.heroImages.forEach((imgUrl, idx) => {
          if (imgUrl) {
            list.push({
              id: `hero-img-${idx}`,
              type: 'image',
              url: imgUrl,
              title: `أنشطة ومقر أمانة قسم ثالث أكتوبر (${idx + 1})`,
              caption: 'حزب الجبهة الوطنية – محافظة الجيزة'
            });
          }
        });
      }
    }

    // Fallback if empty
    return list.length > 0 ? list : [
      {
        id: 'hero-default-vid',
        type: 'video',
        url: mainVideoUrl,
        posterUrl: mainPosterUrl,
        title: 'حزب الجبهة الوطنية',
        caption: 'أمانة قسم ثالث أكتوبر'
      }
    ];
  }, [
    data.settings.heroMediaType,
    data.settings.heroVideoUrl,
    data.settings.heroPosterUrl,
    data.settings.heroImages,
    data.settings.officialLogo
  ]);

  // Keep hero <video> always playing and sync Web Audio / native fallback audio respecting heroDefaultMuted
  useEffect(() => {
    clearBrowserMediaSession();

    if (currentView !== 'home') {
      syncHeroAudioState({ enabled: false });
      return;
    }

    const vid = heroVideoRef.current;
    const ensureVideoPlaying = () => {
      if (!vid || document.hidden || currentView !== 'home') return;
      vid.setAttribute('playsinline', '');
      vid.setAttribute('webkit-playsinline', '');
      if (wantNativeHeroAudio) {
        vid.removeAttribute('muted');
        vid.muted = false;
        vid.defaultMuted = false;
        vid.volume = 1;
      } else {
        vid.setAttribute('muted', '');
        vid.muted = true;
        vid.defaultMuted = true;
        vid.volume = 0;
      }
      if (vid.paused) {
        vid.play().catch(() => {});
      }
    };

    if (vid) {
      ensureVideoPlaying();
      vid.addEventListener('loadeddata', ensureVideoPlaying);
      vid.addEventListener('canplay', ensureVideoPlaying);
      vid.addEventListener('pause', ensureVideoPlaying);
    }

    const activeSlide = heroSlides[heroSlideIndex];
    const isVideoSlide = Boolean(activeSlide && activeSlide.type === 'video' && activeSlide.url);

    syncHeroAudioState({
      enabled: isVideoSlide && !effectiveHeroMuted,
      videoUrl: activeSlide?.url || null,
      getCurrentVideoTime: () => heroVideoRef.current?.currentTime || 0,
      onFallbackChange: setUseNativeHeroVideoAudio
    });

    const handleVisibilityOrFocus = () => {
      if (!document.hidden) {
        ensureVideoPlaying();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);

    const playWatchdog = window.setInterval(() => {
      ensureVideoPlaying();
    }, 1500);

    return () => {
      window.clearInterval(playWatchdog);
      if (vid) {
        vid.removeEventListener('loadeddata', ensureVideoPlaying);
        vid.removeEventListener('canplay', ensureVideoPlaying);
        vid.removeEventListener('pause', ensureVideoPlaying);
      }
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
      syncHeroAudioState({ enabled: false });
    };
  }, [currentView, heroSlideIndex, heroSlides, effectiveHeroMuted, wantNativeHeroAudio]);

  // Auto-flip effect every 5 seconds (only when more than 1 slide)
  useEffect(() => {
    if (heroSlides.length <= 1 || isHeroHovered) return;
    const interval = setInterval(() => {
      setHeroSlideIndex(prev => (prev + 1) % heroSlides.length);
    }, 5000);
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

  // Sync focused person from URL query (?person=...) and scroll smoothly to profile card
  useEffect(() => {
    setFocusedPersonKey(selectedPerson || null);
  }, [selectedPerson, selectedSlug]);

  useEffect(() => {
    if (currentView === 'secretariat-detail' && (focusedPersonKey || selectedPerson)) {
      const timer = window.setTimeout(() => {
        const el = document.getElementById('active-person-profile');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 140);
      return () => window.clearTimeout(timer);
    }
  }, [currentView, focusedPersonKey, selectedPerson, selectedSlug]);

  // Filter states
  const [partyLeaderLevelFilter, setPartyLeaderLevelFilter] = useState<string>(
    currentView === 'secretariat-leaders' ? 'قيادات أمانة قسم ثالث أكتوبر' : 'all'
  );
  useEffect(() => {
    if (currentView === 'secretariat-leaders') {
      setPartyLeaderLevelFilter('قيادات أمانة قسم ثالث أكتوبر');
    } else if (currentView === 'party-leaders') {
      setPartyLeaderLevelFilter('all');
    }
  }, [currentView]);
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
  const [selectedPreferredSec, setSelectedPreferredSec] = useState('');
  const [extraInterestsNote, setExtraInterestsNote] = useState('');
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
      setSelectedPreferredSec('');
      setExtraInterestsNote('');
    } catch (err: any) {
      setAppError(err.message || 'حدث خطأ أثناء إرسال الطلب');
    } finally {
      setAppSubmitting(false);
    }
  };

  // Helper to close all open overlay modals before navigating directly to a person or secretariat
  const closeAllOverlayModals = () => {
    setSelectedNews(null);
    setSelectedPartyLeader(null);
    setSelectedSecLeader(null);
    setSelectedPersonFallback(null);
    if (onClearSelectedNewsId) onClearSelectedNewsId();
  };

  // Helper to open secretariat details (optionally focusing a specific person)
  const openSecretariat = (slug: string, personKey?: string | null) => {
    closeAllOverlayModals();
    setFocusedPersonKey(personKey || null);
    if (onNavigate) {
      onNavigate('secretariat-detail', personKey ? { slug, person: personKey } : { slug });
      return;
    }
    if (setSelectedSlug) setSelectedSlug(slug);
    setCurrentView('secretariat-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Resolve clicked person across secretariats; closes any open news/detail modal immediately and jumps directly to the person
  const handlePersonClick = (
    name?: string | null,
    options?: {
      explicitSecretariatId?: string | null;
      personKey?: string | null;
      position?: string | null;
      fallbackPartyLeader?: PartyLeader | null;
      fallbackSecLeader?: SecretariatLeader | null;
    }
  ) => {
    closeAllOverlayModals();

    const matched = resolvePersonInSecretariats({
      name,
      personKey: options?.personKey,
      position: options?.position,
      explicitSecretariatId: options?.explicitSecretariatId,
      specializedSecretariats: data.specializedSecretariats || [],
      secretariatMembers: data.secretariatMembers || [],
      secretariatLeaders: data.secretariatLeaders || [],
      partyLeaders: data.partyLeaders || []
    });

    if (matched) {
      openSecretariat(matched.secretariat.slug, matched.personKey);
      return;
    }

    if (options?.fallbackSecLeader) {
      setSelectedSecLeader(options.fallbackSecLeader);
      return;
    }
    if (options?.fallbackPartyLeader) {
      setSelectedPartyLeader(options.fallbackPartyLeader);
      return;
    }

    const bySecLeader = name
      ? (data.secretariatLeaders || []).find(
          l => normalizeArabicPersonName(l.name) === normalizeArabicPersonName(name)
        )
      : undefined;
    if (bySecLeader) {
      setSelectedSecLeader(bySecLeader);
      return;
    }

    const byPartyLeader = name
      ? (data.partyLeaders || []).find(
          l => normalizeArabicPersonName(l.name) === normalizeArabicPersonName(name)
        )
      : undefined;
    if (byPartyLeader) {
      setSelectedPartyLeader(byPartyLeader);
      return;
    }

    if (name && name.trim()) {
      setSelectedPersonFallback({
        name: name.trim(),
        position: options?.position || undefined,
        secretariatId: options?.explicitSecretariatId || undefined
      });
    }
  };

  const renderPersonBadge = (params: {
    label: string;
    name?: string;
    position?: string;
    secretariatId?: string;
    fallbackSecretariatId?: string;
    dark?: boolean;
    tone?: 'author' | 'publisher';
  }) => {
    const { label, name, position, secretariatId, fallbackSecretariatId, dark, tone = 'author' } = params;
    if (!name && !position) return null;
    const resolvedSec = resolvePersonInSecretariats({
      name,
      position,
      explicitSecretariatId: secretariatId || fallbackSecretariatId,
      specializedSecretariats: data.specializedSecretariats || [],
      secretariatMembers: data.secretariatMembers || [],
      secretariatLeaders: data.secretariatLeaders || [],
      partyLeaders: data.partyLeaders || []
    });
    const wrapperClass = dark
      ? tone === 'publisher'
        ? 'bg-red-500/15 border-red-400/30 text-red-100 hover:bg-red-500/25'
        : 'bg-amber-500/15 border-amber-400/30 text-amber-100 hover:bg-amber-500/25'
      : tone === 'publisher'
      ? 'bg-red-50/70 border-red-200 text-red-950 hover:bg-red-100/70'
      : 'bg-amber-50/80 border-amber-200 text-amber-950 hover:bg-amber-100/70';

    const handleDirectPersonJump = (e: React.MouseEvent) => {
      e.stopPropagation();
      handlePersonClick(name, {
        explicitSecretariatId: secretariatId || fallbackSecretariatId,
        position
      });
    };

    return (
      <div
        onClick={handleDirectPersonJump}
        className={`flex flex-wrap items-center justify-between gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer ${wrapperClass}`}
      >
        <div className="flex flex-wrap items-center gap-1 min-w-0">
          {tone === 'author' && label.includes('بقلم') && (
            <PenTool className={`w-3 h-3 shrink-0 ${dark ? 'text-amber-300' : 'text-amber-700'}`} />
          )}
          <span className="font-bold opacity-80">{label}:</span>
          {name ? (
            <button
              type="button"
              onClick={handleDirectPersonJump}
              className={`font-black hover:underline cursor-pointer text-right inline-flex items-center gap-1 ${
                dark ? 'text-white hover:text-amber-300' : 'text-stone-900 hover:text-red-700'
              }`}
              title={resolvedSec ? `الانتقال المباشر إلى ${resolvedSec.secretariat.name} وعرض بيانات ${name}` : `عرض بيانات ${name}`}
            >
              <span>{name}</span>
              <ChevronLeft className="w-3 h-3 shrink-0 opacity-75" />
            </button>
          ) : (
            <span className="font-bold">{tone === 'publisher' ? 'أمانة الإعلام' : 'أمانة قسم ثالث أكتوبر'}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {position && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${dark ? 'bg-white/10 text-stone-100' : 'bg-white text-stone-700 border border-stone-200/80'}`}>
              {position}
            </span>
          )}
          {resolvedSec && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openSecretariat(resolvedSec.secretariat.slug, resolvedSec.personKey);
              }}
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                dark
                  ? 'bg-amber-400/20 text-amber-300 hover:bg-amber-400/30'
                  : 'bg-red-700/10 text-red-800 hover:bg-red-700 hover:text-white'
              }`}
            >
              {resolvedSec.secretariat.name}
            </button>
          )}
        </div>
      </div>
    );
  };

  // Helper to open initiative details
  const openInitiative = (slug: string) => {
    if (onNavigate) {
      onNavigate('initiative-detail', { slug });
      return;
    }
    if (setSelectedSlug) setSelectedSlug(slug);
    setCurrentView('initiative-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderCurrentView = () => {
  // -------------------------------------------------------------
  // 1. HOME VIEW
  // -------------------------------------------------------------
  if (currentView === 'home') {
    return (
      <div className="flex flex-col">

        {/* Band 1: Automated Hero Media Reel */}
        <section
          className="relative overflow-hidden bg-stone-50 border-b border-stone-200/80 pt-0 sm:pt-5 pb-8 sm:pb-10"
          onMouseEnter={() => setIsHeroHovered(true)}
          onMouseLeave={() => setIsHeroHovered(false)}
        >
          <div className="max-w-6xl mx-auto px-0 sm:px-6 lg:px-8">

            {/* Main Hero Display Container */}
            <div
              className="relative aspect-[4/3] sm:aspect-[16/9] max-h-[640px] w-full overflow-hidden bg-stone-900 sm:rounded-2xl border-y sm:border border-amber-500/35 shadow-xl select-none"
              style={{ touchAction: 'pan-y' }}
            >
              {heroSlides.map((slide, idx) => {
                const isActive = idx === heroSlideIndex;
                return (
                  <div
                    key={slide.id || idx}
                    className={`absolute inset-0 w-full h-full transition-opacity duration-700 ease-in-out ${
                      slide.type === 'video' ? 'pointer-events-none select-none' : ''
                    } ${
                      isActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                    }`}
                  >
                    {slide.type === 'video' ? (
                      <video
                        ref={isActive ? heroVideoRef : undefined}
                        src={slide.url}
                        autoPlay
                        muted={!wantNativeHeroAudio}
                        loop
                        playsInline
                        preload="auto"
                        tabIndex={-1}
                        aria-hidden="true"
                        draggable={false}
                        disablePictureInPicture
                        disableRemotePlayback
                        controlsList="nodownload noplaybackrate noremoteplayback"
                        onContextMenu={(e) => e.preventDefault()}
                        onLoadedData={(e) => {
                          if (!wantNativeHeroAudio) {
                            e.currentTarget.muted = true;
                            e.currentTarget.volume = 0;
                          } else {
                            e.currentTarget.muted = false;
                            e.currentTarget.volume = 1;
                          }
                          if (!document.hidden && e.currentTarget.paused) {
                            e.currentTarget.play().catch(() => {});
                          }
                        }}
                        onCanPlay={(e) => {
                          if (!wantNativeHeroAudio) {
                            e.currentTarget.muted = true;
                            e.currentTarget.volume = 0;
                          } else {
                            e.currentTarget.muted = false;
                            e.currentTarget.volume = 1;
                          }
                          if (!document.hidden && e.currentTarget.paused) {
                            e.currentTarget.play().catch(() => {});
                          }
                        }}
                        onPause={(e) => {
                          if (!document.hidden && currentView === 'home') {
                            e.currentTarget.play().catch(() => {});
                          }
                        }}
                        onVolumeChange={(e) => {
                          if (!wantNativeHeroAudio && (!e.currentTarget.muted || e.currentTarget.volume !== 0)) {
                            e.currentTarget.muted = true;
                            e.currentTarget.volume = 0;
                          }
                        }}
                        poster={data.settings.heroPosterUrl || '/assets/aistudio/hero-poster.jpg'}
                        className="w-full h-full object-cover object-[center_20%] pointer-events-none select-none"
                      />
                    ) : (
                      <img
                        src={slide.url}
                        alt={slide.title || 'حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر'}
                        className="w-full h-full object-cover object-[center_20%]"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          if (!target.src.includes('FB_IMG_1793904484101_850eafaf.jpg')) {
                            target.src = '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg';
                          }
                        }}
                      />
                    )}
                  </div>
                );
              })}

              {/* Prev / Next Controls (only when multiple slides exist) */}
              {heroSlides.length > 1 && (
                <>
                  <button
                    onClick={() => setHeroSlideIndex(prev => (prev - 1 + heroSlides.length) % heroSlides.length)}
                    aria-label="السابق"
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/50 hover:bg-amber-500 hover:text-stone-950 text-white border border-white/20 backdrop-blur-xs flex items-center justify-center transition-all cursor-pointer opacity-75 hover:opacity-100"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setHeroSlideIndex(prev => (prev + 1) % heroSlides.length)}
                    aria-label="التالي"
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/50 hover:bg-amber-500 hover:text-stone-950 text-white border border-white/20 backdrop-blur-xs flex items-center justify-center transition-all cursor-pointer opacity-75 hover:opacity-100"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-black/45 backdrop-blur-xs px-3 py-1 rounded-full border border-white/10">
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

              {/* Global & Visitor Sound Control Overlay on Hero Video */}
              {heroSlides[heroSlideIndex]?.type === 'video' && (
                adminLockedMute ? (
                  <div className="absolute bottom-3 right-3 z-30 bg-black/65 text-stone-200 border border-white/15 backdrop-blur-xs text-[11px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <VolumeX className="w-3.5 h-3.5 text-red-400" />
                    <span>الصوت مقفل من الإدارة</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const nextMuted = !visitorMuted;
                      setVisitorMuted(nextMuted);
                      if (!nextMuted) {
                        unlockHeroAudioNow();
                        const vid = heroVideoRef.current;
                        if (vid && useNativeHeroVideoAudio) {
                          vid.removeAttribute('muted');
                          vid.muted = false;
                          vid.defaultMuted = false;
                          vid.volume = 1;
                          vid.play().catch(() => {});
                        }
                      }
                    }}
                    className={`absolute bottom-3 right-3 z-30 border backdrop-blur-xs text-xs font-black px-3.5 py-2 rounded-full flex items-center gap-1.5 transition-all cursor-pointer shadow-lg ${
                      effectiveHeroMuted
                        ? 'bg-stone-950/80 hover:bg-amber-500 hover:text-stone-950 text-amber-300 border-amber-400/40'
                        : 'bg-emerald-700/90 hover:bg-stone-900 text-white border-emerald-400/50'
                    }`}
                    aria-label={effectiveHeroMuted ? 'تشغيل صوت الفيديو' : 'كتم صوت الفيديو'}
                  >
                    {effectiveHeroMuted ? (
                      <>
                        <VolumeX className="w-4 h-4" />
                        <span>تشغيل الصوت</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-4 h-4" />
                        <span>الصوت مفعّل · كتم</span>
                      </>
                    )}
                  </button>
                )
              )}
            </div>

          </div>
        </section>

        {/* Band 2: Identity, Foundational Manifesto & Headquarters Showcase */}
        <section className="bg-white border-b border-stone-200/80 py-14 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="max-w-4xl mx-auto text-center space-y-4">
              <p className="text-xs font-extrabold text-red-700 tracking-wide">
                الموقع الرسمي لأمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر بمحافظة الجيزة
              </p>
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-stone-950 tracking-tight leading-tight">
                معاً نبني مستقبلاً مشرقاً لمصر
              </h1>
              <p className="text-sm sm:text-base lg:text-lg font-semibold text-stone-700 leading-relaxed max-w-3xl mx-auto">
                حزب الجبهة الوطنية هو حزب سياسي مدني ديمقراطي يحق لأي مصري الانتماء إلى عضويته دون تفرقة أو تمييز، ويهدف إلى إعلاء قيم العدل والمساواة والحرية واحترام حقوق الإنسان.
              </p>
              <div className="w-16 h-1 bg-amber-500 mx-auto rounded-full" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* Foundational Manifesto */}
              <div className="lg:col-span-7 bg-stone-50/90 border border-stone-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-between text-right space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                    <h2 className="text-base sm:text-lg font-black text-stone-900">
                      الرؤية التأسيسية ورسالة الحزب
                    </h2>
                    <span className="text-xs font-bold text-amber-800">
                      {data.settings.slogan || 'مصر للجميع'}
                    </span>
                  </div>
                  <p className="font-semibold text-stone-900 text-sm sm:text-base leading-relaxed">
                    حزب الجبهة الوطنية هو كيان سياسي مصري يهدف إلى إحداث تغيير حقيقي في المشهد السياسي من خلال تعزيز المشاركة الشعبية الفاعلة والصادقة.
                  </p>
                  <p className="text-xs sm:text-sm lg:text-base text-stone-700 leading-relaxed">
                    يعمل الحزب على بناء نموذج ديمقراطي يعزز ثقافة الحوار والتعاون بين جميع أطياف المجتمع، مع التركيز على تحقيق العدالة الاجتماعية والتنمية المستدامة، ويسعى إلى أن يكون بيت خبرة وطني يخدم مصلحة الوطن العليا بعيداً عن أي توجهات ضيقة أو شخصية، مستنداً إلى رؤية شاملة ترتكز على قيم الحرية والعدالة وسيادة القانون.
                  </p>
                  <p className="text-xs sm:text-sm lg:text-base text-stone-700 leading-relaxed">
                    يجمع الحزب بين طاقات الشباب وخبرات الأجيال لإيجاد حلول حقيقية للتحديات التي تواجه الوطن، إيماناً بأن العمل الجماعي هو السبيل لتحقيق تطلعات الشعب المصري نحو مستقبل أفضل.
                  </p>
                </div>

                <div className="pt-4 border-t border-stone-200/80 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigate) onNavigate('about');
                      else {
                        setCurrentView('about');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-black text-red-700 hover:text-red-800 cursor-pointer"
                  >
                    <span>المزيد عن الحزب ورؤيتنا ومبادئنا</span>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <a
                    href="/join"
                    onClick={(e) => {
                      if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                        e.preventDefault();
                        setCurrentView('join');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs px-5 py-2.5 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <HeartHandshake className="w-4 h-4" />
                    <span>تقديم طلب العضوية</span>
                  </a>
                </div>
              </div>

              {/* Headquarters Entrance Photo Card */}
              <div className="lg:col-span-5 overflow-hidden rounded-2xl border border-amber-500/40 shadow-lg bg-stone-950 group flex flex-col justify-between">
                <div className="relative flex-1 min-h-[260px] w-full overflow-hidden bg-stone-900">
                  <img
                    src={data.settings.entranceImageUrl || '/assets/aistudio/______________________________20261114_203911_a06570e5.jpg'}
                    alt="مقر حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر"
                    className="w-full h-full object-cover object-bottom group-hover:scale-[1.02] transition-transform duration-700"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="px-5 py-4 bg-stone-950 border-t border-amber-500/25 flex flex-wrap items-center justify-between gap-2 text-right">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white">
                      مقر حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر
                    </h3>
                    <p className="text-[11px] font-bold text-amber-300/90 mt-0.5">
                      محافظة الجيزة · {data.settings.slogan || 'مصر للجميع'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigate) onNavigate('contact');
                      else {
                        setCurrentView('contact');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 text-[11px] font-black px-3 py-1.5 rounded-lg cursor-pointer shrink-0"
                  >
                    الموقع والخريطة
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Band 3: Unified Leaders Preview (Party Leaders + 3rd October Secretariat Leaders & Bureau) */}
        {(data.partyLeaders.length > 0 || data.secretariatLeaders.length > 0) && (
          <section className="bg-stone-50 border-b border-stone-200/80 py-14 sm:py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-stone-200 pb-5">
                <div>
                  <span className="text-xs font-extrabold text-red-700">
                    الهيكل القيادي والتنظيمي
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight mt-1">
                    {ct.partyLeadersTitle || 'قيادات حزب الجبهة الوطنية وأمانة قسم ثالث أكتوبر'}
                  </h2>
                </div>
                <a
                  href="/party-leaders"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      setCurrentView('party-leaders');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-red-700 hover:text-red-800 transition-colors cursor-pointer"
                >
                  <span>عرض جميع القيادات</span>
                  <ChevronLeft className="w-4 h-4" />
                </a>
              </div>

              {data.partyLeaders.length > 0 && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg sm:text-xl font-black text-stone-900">
                      قيادات الحزب (الهيئة العليا والمحافظات)
                    </h3>
                    <span className="text-xs font-bold text-stone-500">
                      {data.partyLeaders.length} قيادات
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {data.partyLeaders.map(leader => (
                      <div
                        key={leader.id}
                        onClick={() =>
                          handlePersonClick(leader.name, {
                            explicitSecretariatId: leader.specializedSecretariatId,
                            personKey: leader.id || leader.name,
                            fallbackPartyLeader: leader
                          })
                        }
                        className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer group hover:-translate-y-1"
                      >
                        <div className="aspect-square bg-stone-50 overflow-hidden relative">
                          <img
                            src={leader.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                            alt={leader.name}
                            className={`w-full h-full group-hover:scale-105 transition-transform duration-300 ${
                              leader.photoUrl ? 'object-cover object-top' : 'object-contain p-4 bg-white'
                            }`}
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-2 right-2 bg-stone-900/85 backdrop-blur-xs text-amber-300 text-[10px] font-bold px-2.5 py-1 rounded-md">
                            {leader.level || (leader.governorate || 'المستوى القيادي')}
                          </div>
                        </div>
                        <div className="p-4 text-right">
                          <h3 className="font-bold text-stone-900 text-base group-hover:text-red-700 transition-colors">
                            {leader.name}
                          </h3>
                          <p className="text-xs font-semibold text-red-700 mt-0.5 leading-relaxed">
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
                </div>
              )}

              {data.secretariatLeaders.length > 0 && (
                <div className="space-y-5 pt-10 border-t border-stone-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg sm:text-xl font-black text-stone-900">
                      قيادات وهيئة مكتب أمانة قسم ثالث أكتوبر
                    </h3>
                    <span className="text-xs font-bold text-stone-500">
                      {data.secretariatLeaders.length} قيادات
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {data.secretariatLeaders.map(leader => {
                      const linkedSec = resolvePersonInSecretariats({
                        name: leader.name,
                        personKey: leader.id || leader.name,
                        explicitSecretariatId: leader.specializedSecretariatId,
                        specializedSecretariats: data.specializedSecretariats || [],
                        secretariatMembers: data.secretariatMembers || [],
                        secretariatLeaders: data.secretariatLeaders || [],
                        partyLeaders: data.partyLeaders || []
                      });
                      return (
                      <div
                        key={leader.id}
                        onClick={() =>
                          handlePersonClick(leader.name, {
                            explicitSecretariatId: leader.specializedSecretariatId,
                            personKey: leader.id || leader.name,
                            fallbackSecLeader: leader
                          })
                        }
                        className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer group hover:-translate-y-1"
                      >
                        <div className="aspect-square bg-stone-50 overflow-hidden relative">
                          <img
                            src={leader.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                            alt={leader.name}
                            className={`w-full h-full group-hover:scale-105 transition-transform duration-300 ${
                              leader.photoUrl ? 'object-cover object-top' : 'object-contain p-4 bg-white'
                            }`}
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-2 right-2 bg-red-700 text-white text-[10px] font-bold px-2 py-0.5 rounded max-w-[85%] truncate">
                            {linkedSec ? linkedSec.secretariat.name : 'أمانة قسم ثالث أكتوبر'}
                          </div>
                        </div>
                        <div className="p-4 text-right">
                          <h3 className="font-bold text-stone-900 text-base group-hover:text-red-700 transition-colors">
                            {leader.name}
                          </h3>
                          <p className="text-xs font-semibold text-amber-700 mt-0.5 leading-relaxed">
                            {leader.title}
                          </p>
                          {linkedSec && (
                            <p className="text-[11px] font-bold text-red-700 mt-1 flex items-center gap-1">
                              <Building2 className="w-3 h-3 shrink-0" />
                              <span>عرض ملف الأمانة والتفاصيل</span>
                            </p>
                          )}
                          {leader.bio && (
                            <p className="text-[11px] text-stone-500 mt-2 line-clamp-2">
                              {leader.bio}
                            </p>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Band 4: Specialized Secretariats Grid */}
        <section className="bg-white border-b border-stone-200/80 py-14 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 border-b border-stone-200 pb-5">
              <div>
                <span className="text-xs font-extrabold text-red-700">
                  {ct.secretariatsBadge || 'قطاعات العمل الحزبي'}
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-stone-900 mt-1">
                  {ct.secretariatsTitle || 'أمانات حزب الجبهة الوطنية'}
                </h2>
                <p className="text-xs sm:text-sm text-stone-500 mt-1">
                  {ct.secretariatsSubtitle || 'لكل أمانة صفحة مستقلة بكامل مهامها وأعضائها وأنشطتها'}
                </p>
              </div>
              <a
                href="/secretariats"
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    setCurrentView('secretariats');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-red-700 hover:text-red-800 transition-colors cursor-pointer shrink-0"
              >
                <span>استعراض جميع الأمانات ({data.specializedSecretariats.length})</span>
                <ChevronLeft className="w-4 h-4" />
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.specializedSecretariats.map(sec => {
                const baseAsstList: AssistantSecretaryEntry[] =
                  sec.assistantSecretaries && sec.assistantSecretaries.length > 0
                    ? sec.assistantSecretaries.filter(a => a.name?.trim())
                    : sec.assistantSecretaryName
                    ? [{ id: 'asst-1', name: sec.assistantSecretaryName, photoUrl: sec.assistantSecretaryPhotoUrl || '' }]
                    : [];
                const memberAsstList: AssistantSecretaryEntry[] = (data.secretariatMembers || [])
                  .filter(m => m.secretariatId === sec.id && m.tier === 'assistant_secretary' && m.name?.trim())
                  .filter(m => !baseAsstList.some(a => a.name.trim() === m.name.trim()))
                  .map(m => ({ id: m.id, name: m.name, photoUrl: m.photoUrl || '' }));
                const allAssts = [...baseAsstList, ...memberAsstList];
                const featuredPeople = [
                  ...(sec.secretaryPhotoUrl ? [{ name: sec.secretaryName || 'أمين الأمانة', role: 'أمين الأمانة', photoUrl: sec.secretaryPhotoUrl }] : []),
                  ...allAssts.filter(a => a.photoUrl).map(a => ({ name: a.name, role: a.title || 'الأمين المساعد', photoUrl: a.photoUrl! }))
                ].slice(0, 3);

                return (
                <div
                  key={sec.id}
                  onClick={() => openSecretariat(sec.slug)}
                  className="bg-stone-50/50 rounded-2xl border border-stone-200 p-6 shadow-xs hover:bg-white hover:shadow-md transition-all cursor-pointer group hover:border-red-600/40 flex flex-col justify-between"
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

                  {featuredPeople.length > 0 && (
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      {featuredPeople.map((person, pIdx) => (
                        <button
                          type="button"
                          key={pIdx}
                          onClick={(e) => {
                            e.stopPropagation();
                            openSecretariat(sec.slug, person.name);
                          }}
                          title={`عرض بيانات ${person.name} في ${sec.name}`}
                          className="relative shrink-0 cursor-pointer text-right group/person"
                        >
                          <img
                            src={person.photoUrl}
                            alt={person.name}
                            className="w-24 h-28 sm:w-28 sm:h-32 rounded-2xl object-cover object-top border-2 border-amber-500 shadow-md bg-stone-100 group-hover/person:scale-[1.04] group-hover/person:border-red-600 transition-all"
                            referrerPolicy="no-referrer"
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="pt-4 border-t border-stone-200/70 flex items-center justify-between text-xs gap-2">
                    <div className="space-y-0.5 text-stone-500 min-w-0">
                      <div className="truncate">
                        <span className="font-medium">أمين الأمانة: </span>
                        {sec.secretaryName ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openSecretariat(sec.slug, sec.secretaryName);
                            }}
                            className="font-bold text-stone-800 hover:text-red-700 hover:underline cursor-pointer"
                          >
                            {sec.secretaryName}
                          </button>
                        ) : (
                          <span className="font-bold text-stone-800">قيد التعيين</span>
                        )}
                      </div>
                      {allAssts.length > 0 && (
                        <div className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">
                          <span className="font-medium">
                            {allAssts.length > 1 ? `الأمناء المساعدون (${allAssts.length}): ` : 'الأمين المساعد: '}
                          </span>
                          <span className="font-semibold text-stone-700">
                            {allAssts.map((a, aIdx) => (
                              <React.Fragment key={a.id || aIdx}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openSecretariat(sec.slug, a.id || a.name);
                                  }}
                                  className="hover:text-red-700 hover:underline cursor-pointer"
                                >
                                  {a.name}
                                </button>
                                {aIdx < allAssts.length - 1 ? '، ' : ''}
                              </React.Fragment>
                            ))}
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="text-red-700 font-bold group-hover:translate-x-[-4px] transition-transform flex items-center gap-1 shrink-0">
                      <span>التفاصيل</span>
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Band 5: Initiatives Showcase */}
        {data.initiatives.length > 0 && (
          <section className="bg-stone-950 text-white py-14 sm:py-16 border-b border-amber-500/20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 border-b border-white/10 pb-5">
                <div>
                  <span className="text-xs font-extrabold text-amber-400">
                    {ct.initiativesBadge || 'العمل الميداني والمجتمعي'}
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                    {ct.initiativesTitle || 'مبادرات حزب الجبهة الوطنية'}
                  </h2>
                </div>
                <a
                  href="/initiatives"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      setCurrentView('initiatives');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  <span>كافة المبادرات</span>
                  <ChevronLeft className="w-4 h-4" />
                </a>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {data.initiatives.map(init => {
                  const initImgs = Array.from(
                    new Set([
                      ...(init.coverUrl ? [init.coverUrl] : []),
                      ...(init.galleryImages || []),
                      ...(init.activities || []).map(a => a.imageUrl || ''),
                      ...(init.logoUrl ? [init.logoUrl] : [])
                    ])
                  ).filter(Boolean);
                  const initLeadImg = initImgs[0];
                  const initLocationHref = normalizeLocationHref(init.locationUrl);

                  return (
                    <div
                      key={init.id}
                      onClick={() => openInitiative(init.slug)}
                      className="bg-stone-900/90 border border-white/10 rounded-2xl overflow-hidden hover:border-amber-500/40 transition-all cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        <div
                          className="aspect-video bg-stone-950/80 overflow-hidden relative cursor-pointer"
                          onClick={(e) => {
                            if (initImgs.length > 0) {
                              e.stopPropagation();
                              openLightbox(initImgs, 0, init.title);
                            }
                          }}
                        >
                          <img
                            src={initLeadImg || data.settings.officialLogo}
                            alt={init.title}
                            className={`w-full h-full transition-transform duration-300 group-hover:scale-105 ${
                              initLeadImg ? 'object-cover' : 'object-contain p-6 opacity-85'
                            }`}
                            referrerPolicy="no-referrer"
                          />
                          {initImgs.length > 0 && (
                            <span className="absolute bottom-2.5 left-2.5 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                              <Maximize2 className="w-3 h-3 text-amber-400" />
                              <span>{initImgs.length > 1 ? `${initImgs.length} صور` : 'تكبير الصورة'}</span>
                            </span>
                          )}
                        </div>

                        <div className="p-6 pb-4">
                          <div className="flex items-center justify-between text-xs text-stone-400 mb-3">
                            <span className="font-bold text-amber-300">
                              {init.status === 'active' ? 'مبادرة نشطة' : (init.status === 'completed' ? 'مكتملة' : 'متوقفة')}
                            </span>
                            <span>بدأت: {init.startDate}</span>
                          </div>

                          <h3 className="text-xl font-bold text-white group-hover:text-amber-300 transition-colors mb-2">
                            {init.title}
                          </h3>
                          <p className="text-xs sm:text-sm text-stone-300 leading-relaxed line-clamp-3">
                            {init.description}
                          </p>

                          {(init.venue || initLocationHref) && (
                            <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                              {init.venue && (
                                <span className="flex items-center gap-1.5 text-stone-300">
                                  <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span>{init.venue}</span>
                                </span>
                              )}
                              {initLocationHref && (
                                <a
                                  href={initLocationHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 font-bold bg-amber-500/15 border border-amber-400/30 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                  <MapPin className="w-3 h-3" />
                                  <span>اللوكيشن على الخريطة</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="px-6 pb-6 space-y-3">
                        {(init.authorName || init.authorPosition || init.publisherName || init.publisherPosition) && (
                          <div className="pt-2.5 border-t border-white/10 space-y-1.5">
                            {renderPersonBadge({
                              label: 'إعداد وتنفيذ',
                              name: init.authorName,
                              position: init.authorPosition,
                              secretariatId: init.authorSecretariatId,
                              dark: true,
                              tone: 'author'
                            })}
                            {renderPersonBadge({
                              label: 'نشر ورفع (أمانة الإعلام)',
                              name: init.publisherName,
                              position: init.publisherPosition,
                              secretariatId: init.publisherSecretariatId,
                              dark: true,
                              tone: 'publisher'
                            })}
                          </div>
                        )}

                        <SocialShareButtons
                          title={init.title}
                          summary={init.description}
                          itemType="initiative"
                          itemId={init.slug || init.id}
                          imageUrl={initLeadImg}
                          compact
                          dark
                        />

                        <div className="flex items-center justify-between text-xs text-amber-400 font-bold pt-3 border-t border-white/10">
                          <span>استعراض أنشطة وفعاليات المبادرة</span>
                          <ChevronLeft className="w-4 h-4 group-hover:translate-x-[-4px] transition-transform" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Band 6: Media Center — News & Events Split */}
        <section className="bg-stone-50 border-b border-stone-200/80 py-14 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-stone-200 pb-5">
              <div>
                <span className="text-xs font-extrabold text-red-700">
                  التغطية الإعلامية والأنشطة
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-stone-900 mt-1">
                  المركز الإعلامي: الأخبار والفعاليات
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

              {/* News Column */}
              <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 space-y-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3.5">
                  <div className="flex items-center gap-2">
                    <Newspaper className="w-5 h-5 text-red-700" />
                    <h3 className="text-lg sm:text-xl font-black text-stone-900">
                      {ct.newsTitle || 'آخر الأخبار والبيانات'}
                    </h3>
                  </div>
                  <a
                    href="/news"
                    onClick={(e) => {
                      if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                        e.preventDefault();
                        setCurrentView('news');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="text-xs font-bold text-red-700 hover:underline cursor-pointer inline-flex items-center gap-1"
                  >
                    <span>كافة الأخبار</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="space-y-4">
                  {data.news.length === 0 ? (
                    <p className="text-xs text-stone-500 text-center py-8">
                      لا توجد أخبار منشورة حالياً.
                    </p>
                  ) : data.news.slice(0, 3).map(item => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedNews(item);
                        if (onNavigate) {
                          onNavigate('news', { newsId: item.id });
                        } else {
                          setCurrentView('news');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      }}
                      className="bg-stone-50/70 rounded-xl border border-stone-200/90 p-4 hover:bg-white hover:shadow-md transition-all cursor-pointer group flex flex-col sm:flex-row gap-4"
                    >
                      <img
                        src={item.coverImage || data.settings.officialLogo}
                        alt={item.title}
                        className="w-full sm:w-24 h-32 sm:h-24 object-cover rounded-lg shrink-0 bg-stone-100"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <div className="flex items-center gap-2 text-[11px] text-stone-500 mb-1">
                            {item.isUrgent && (
                              <span className="text-red-700 font-black">عاجل ·</span>
                            )}
                            {item.isFeatured && !item.isUrgent && (
                              <span className="text-amber-700 font-bold">مميز ·</span>
                            )}
                            <span className="font-medium">{item.publishDate}</span>
                          </div>
                          <h4 className="font-bold text-stone-900 text-sm group-hover:text-red-700 transition-colors line-clamp-2">
                            {item.title}
                          </h4>
                          <p className="text-xs text-stone-500 line-clamp-2 mt-1">
                            {item.excerpt}
                          </p>
                        </div>

                        <div className="space-y-2 mt-2">
                          {(item.authorName || item.authorPosition || item.publisherName || item.publisherPosition) && (
                            <div className="pt-2 border-t border-stone-200/70 space-y-1.5">
                              {renderPersonBadge({
                                label: 'بقلم',
                                name: item.authorName,
                                position: item.authorPosition,
                                secretariatId: item.authorSecretariatId,
                                fallbackSecretariatId: item.linkedSecretariatId,
                                tone: 'author'
                              })}
                              {renderPersonBadge({
                                label: 'نشر (أمانة الإعلام)',
                                name: item.publisherName,
                                position: item.publisherPosition,
                                secretariatId: item.publisherSecretariatId,
                                tone: 'publisher'
                              })}
                            </div>
                          )}

                          <SocialShareButtons
                            title={item.title}
                            summary={item.excerpt}
                            itemType="news"
                            itemId={item.id}
                            compact
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Events Column */}
              <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 space-y-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3.5">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-amber-600" />
                    <h3 className="text-lg sm:text-xl font-black text-stone-900">
                      {ct.eventsTitle || 'الفعاليات والأنشطة'}
                    </h3>
                  </div>
                  <a
                    href="/events"
                    onClick={(e) => {
                      if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                        e.preventDefault();
                        setCurrentView('events');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="text-xs font-bold text-amber-700 hover:underline cursor-pointer inline-flex items-center gap-1"
                  >
                    <span>كافة الفعاليات</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="space-y-4">
                  {data.events.length === 0 ? (
                    <p className="text-xs text-stone-500 text-center py-8">
                      لا توجد فعاليات مجدولة حالياً.
                    </p>
                  ) : data.events.slice(0, 3).map(event => {
                    const eventImgs = Array.from(
                      new Set([
                        ...(event.coverUrl ? [event.coverUrl] : []),
                        ...(event.coverImage ? [event.coverImage] : []),
                        ...(event.images || []),
                        ...(event.galleryImages || [])
                      ])
                    ).filter(Boolean);
                    const eventLeadImg = eventImgs[0];
                    const eventLocationHref = normalizeLocationHref(event.locationUrl);

                    return (
                      <div
                        key={event.id}
                        onClick={() => {
                          if (onNavigate) {
                            onNavigate('events', { eventId: event.id });
                          } else {
                            setCurrentView('events');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                        className="bg-stone-50/70 rounded-xl border border-stone-200/90 p-4 hover:bg-white hover:shadow-md transition-all flex flex-col justify-between cursor-pointer group"
                      >
                        <div className="flex flex-col sm:flex-row gap-4">
                          <div
                            className="w-full sm:w-28 h-36 sm:h-28 rounded-lg overflow-hidden shrink-0 bg-stone-100 border border-stone-200/70 relative"
                            onClick={(e) => {
                              if (eventImgs.length > 0) {
                                e.stopPropagation();
                                openLightbox(eventImgs, 0, event.title);
                              }
                            }}
                          >
                            <img
                              src={eventLeadImg || data.settings.officialLogo}
                              alt={event.title}
                              className={`w-full h-full transition-transform duration-300 group-hover:scale-105 ${
                                eventLeadImg ? 'object-cover' : 'object-contain p-2 bg-stone-100'
                              }`}
                              referrerPolicy="no-referrer"
                            />
                            {eventImgs.length > 1 && (
                              <span className="absolute bottom-1.5 left-1.5 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                {eventImgs.length} صور
                              </span>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 text-xs text-stone-500 mb-1">
                              <span className="font-bold text-red-700">
                                {new Date(event.dateTime).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                              </span>
                              <span className="font-bold text-amber-800 shrink-0">
                                {event.status === 'upcoming' ? 'قادمة' : (event.status === 'completed' ? 'منتهية' : 'جارية')}
                              </span>
                            </div>
                            <h4 className="font-bold text-stone-900 text-sm mb-1 group-hover:text-red-700 transition-colors">
                              {event.title}
                            </h4>
                            <p className="text-xs text-stone-600 line-clamp-2">
                              {event.description}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-stone-200/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-600">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-red-700 shrink-0" />
                            <span>{event.venue}</span>
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {eventLocationHref && (
                              <a
                                href={eventLocationHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-900 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md transition-colors"
                              >
                                <MapPin className="w-3 h-3" />
                                <span>رابط اللوكيشن</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            <span className="font-medium text-stone-700">{event.organizer}</span>
                          </div>
                        </div>

                        {(event.authorName || event.authorPosition || event.publisherName || event.publisherPosition) && (
                          <div className="mt-2 pt-2 border-t border-stone-200/70 space-y-1.5">
                            {renderPersonBadge({
                              label: 'القائم بالفعالية',
                              name: event.authorName,
                              position: event.authorPosition,
                              secretariatId: event.authorSecretariatId,
                              tone: 'author'
                            })}
                            {renderPersonBadge({
                              label: 'نشر (أمانة الإعلام)',
                              name: event.publisherName,
                              position: event.publisherPosition,
                              secretariatId: event.publisherSecretariatId,
                              tone: 'publisher'
                            })}
                          </div>
                        )}

                        <SocialShareButtons
                          title={event.title}
                          summary={event.description}
                          itemType="event"
                          itemId={event.id}
                          imageUrl={eventLeadImg}
                          compact
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Band 7: Membership CTA & Direct Contact Summary */}
        <section className="bg-white py-14 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            {/* Membership Callout */}
            <div className="relative overflow-hidden bg-gradient-to-r from-red-900 via-red-800 to-stone-950 rounded-3xl p-8 sm:p-12 text-white shadow-xl flex flex-col lg:flex-row items-center justify-between gap-8 border border-amber-500/40">
              <div className="space-y-3 text-right max-w-2xl">
                <p className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                  <HeartHandshake className="w-4 h-4" />
                  <span>{data.settings.membershipTitle || 'كن جزءاً من التغيير!'}</span>
                </p>
                <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                  {data.settings.membershipSubtitle || 'ندعوكم للانضمام إلى مسيرة الحزب والعمل معنا لتحقيق تطلعات الوطن'}
                </h2>
                <p className="text-sm text-stone-200 leading-relaxed">
                  {data.settings.membershipCtaText || 'انضم الآن وساهم في بناء المستقبل'} — نموذج تقديم رقمي معتمد لأبناء قسم ثالث أكتوبر بمحافظة الجيزة.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 w-full lg:w-auto">
                <a
                  href="/join"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      setCurrentView('join');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-7 py-3.5 rounded-xl shadow-lg transition-transform hover:scale-[1.02] cursor-pointer whitespace-nowrap text-sm sm:text-base text-center"
                >
                  استمارة العضوية الإلكترونية
                </a>
                <a
                  href={data.settings.whatsappLink || `https://wa.me/20${(data.settings.membershipWhatsapp || data.settings.whatsapp || '01003070108').replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3.5 rounded-xl shadow-lg transition-colors cursor-pointer whitespace-nowrap text-sm sm:text-base inline-flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>استفسار عبر واتساب</span>
                </a>
              </div>
            </div>

            {/* Direct Contact & Headquarters Summary */}
            <div className="border-t border-stone-200 pt-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <span className="text-xs font-extrabold text-red-700">
                    خدمة المواطنين والتواصل المباشر
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-stone-900 mt-0.5">
                    طرق التواصل ومقر أمانة قسم ثالث أكتوبر بمحافظة الجيزة
                  </h2>
                </div>
                <a
                  href="/contact"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      setCurrentView('contact');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-red-700 hover:text-red-800 transition-colors cursor-pointer shrink-0"
                >
                  <span>صفحة التواصل والخريطة</span>
                  <ChevronLeft className="w-4 h-4" />
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-right">
                <div className="bg-stone-50 rounded-2xl p-5 border border-stone-200 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-stone-900 text-sm">مقر الأمانة</h3>
                    <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                      {data.settings.address || 'طريق الشاذلي، ابني بيتك 7، قسم ثالث 6 أكتوبر، محافظة الجيزة'}
                    </p>
                  </div>
                </div>

                <div className="bg-stone-50 rounded-2xl p-5 border border-stone-200 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-stone-900 text-sm">الهاتف الرسمي</h3>
                    <a
                      href={`tel:${data.settings.phone || '01003070108'}`}
                      className="text-sm font-mono font-bold text-red-700 hover:underline mt-1 inline-block"
                      dir="ltr"
                    >
                      {data.settings.phone || '01003070108'}
                    </a>
                  </div>
                </div>

                <div className="bg-stone-50 rounded-2xl p-5 border border-stone-200 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-stone-900 text-sm">واتساب وتواصل</h3>
                    <a
                      href={data.settings.whatsappLink || `https://wa.me/20${(data.settings.whatsapp || data.settings.phone || '01003070108').replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-emerald-700 hover:underline mt-1 inline-flex items-center gap-1"
                    >
                      <span>مراسلة أمانة قسم ثالث أكتوبر</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
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
  // 3. UNIFIED LEADERS VIEW (Party Leaders + 3rd October Secretariat Leaders)
  // -------------------------------------------------------------
  if (currentView === 'party-leaders' || currentView === 'secretariat-leaders') {
    const isSecFilter = partyLeaderLevelFilter === 'قيادات أمانة قسم ثالث أكتوبر';

    const isLevelMatch = (leaderLevel: string | undefined, filter: string) => {
      if (filter === 'all') return true;
      if (filter === 'قيادات أمانة قسم ثالث أكتوبر') return false;
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
          .filter(
            lvl =>
              lvl &&
              lvl !== 'الهيئة العليا' &&
              lvl !== 'national' &&
              lvl !== 'عليا' &&
              lvl !== 'قيادات المحافظات' &&
              lvl !== 'governorate' &&
              lvl !== 'محافظة' &&
              lvl !== 'قيادات أمانة قسم ثالث أكتوبر'
          )
      )
    );

    const filteredPartyLeaders = isSecFilter
      ? []
      : data.partyLeaders.filter(l => isLevelMatch(l.level, partyLeaderLevelFilter));

    const filteredSecLeaders =
      partyLeaderLevelFilter === 'all' || isSecFilter
        ? data.secretariatLeaders
        : [];

    const totalCombinedCount = data.partyLeaders.length + data.secretariatLeaders.length;
    const hasAnyFiltered = filteredPartyLeaders.length > 0 || filteredSecLeaders.length > 0;

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-black text-stone-900 tracking-tight">
            {ct.partyLeadersTitle || 'قيادات حزب الجبهة الوطنية وأمانة قسم ثالث أكتوبر'}
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
              الكل ({totalCombinedCount})
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
            <button
              onClick={() => setPartyLeaderLevelFilter('قيادات أمانة قسم ثالث أكتوبر')}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                isSecFilter
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              قيادات أمانة قسم ثالث أكتوبر ({data.secretariatLeaders.length})
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

        {!hasAnyFiltered ? (
          <div className="bg-white rounded-3xl border border-stone-200/80 p-12 text-center text-stone-500 max-w-lg mx-auto shadow-xs">
            <Award className="w-14 h-14 text-stone-300 mx-auto mb-4" />
            <h3 className="font-bold text-stone-900 text-lg mb-1.5">
              التشكيل القيادي قيد المراجعة الرسمية
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 leading-relaxed">
              يجري حالياً مراجعة واعتماد التشكيلات القيادية للحزب وأمانة قسم ثالث أكتوبر وفق اللوائح والقرارات التنظيمية.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredPartyLeaders.map(leader => (
              <div
                key={leader.id}
                onClick={() =>
                  handlePersonClick(leader.name, {
                    explicitSecretariatId: leader.specializedSecretariatId,
                    personKey: leader.id || leader.name,
                    fallbackPartyLeader: leader
                  })
                }
                className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-lg transition-all cursor-pointer group hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-[4/5] bg-stone-50 overflow-hidden relative">
                    <img
                      src={leader.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                      alt={leader.name}
                      className={`w-full h-full group-hover:scale-105 transition-transform duration-300 ${
                        leader.photoUrl ? 'object-cover object-top' : 'object-contain p-4 bg-white'
                      }`}
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
                    <span>عرض التفاصيل والأمانة</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}

            {filteredSecLeaders.map(leader => {
              const linkedSec = resolvePersonInSecretariats({
                name: leader.name,
                personKey: leader.id || leader.name,
                explicitSecretariatId: leader.specializedSecretariatId,
                specializedSecretariats: data.specializedSecretariats || [],
                secretariatMembers: data.secretariatMembers || [],
                secretariatLeaders: data.secretariatLeaders || [],
                partyLeaders: data.partyLeaders || []
              });
              return (
              <div
                key={leader.id}
                onClick={() =>
                  handlePersonClick(leader.name, {
                    explicitSecretariatId: leader.specializedSecretariatId,
                    personKey: leader.id || leader.name,
                    fallbackSecLeader: leader
                  })
                }
                className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-lg transition-all cursor-pointer group hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-[4/5] bg-stone-50 overflow-hidden relative">
                    <img
                      src={leader.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                      alt={leader.name}
                      className={`w-full h-full group-hover:scale-105 transition-transform duration-300 ${
                        leader.photoUrl ? 'object-cover object-top' : 'object-contain p-4 bg-white'
                      }`}
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2.5 right-2.5 bg-red-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-md max-w-[85%] truncate">
                      {linkedSec ? linkedSec.secretariat.name : 'أمانة قسم ثالث أكتوبر'}
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
                    <span>{linkedSec ? `الانتقال إلى ${linkedSec.secretariat.name}` : 'عرض التفاصيل'}</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
              );
            })}
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
            {data.specializedSecretariats.map(sec => {
              const baseList: AssistantSecretaryEntry[] =
                sec.assistantSecretaries && sec.assistantSecretaries.length > 0
                  ? sec.assistantSecretaries.filter(a => a.name?.trim())
                  : sec.assistantSecretaryName
                  ? [{ id: 'asst-1', name: sec.assistantSecretaryName, photoUrl: sec.assistantSecretaryPhotoUrl || '' }]
                  : [];
              const fromMembers: AssistantSecretaryEntry[] = (data.secretariatMembers || [])
                .filter(m => m.secretariatId === sec.id && m.tier === 'assistant_secretary' && m.name?.trim())
                .filter(m => !baseList.some(a => a.name.trim() === m.name.trim()))
                .map(m => ({ id: m.id, name: m.name, photoUrl: m.photoUrl || '' }));
              const allAssts = [...baseList, ...fromMembers];
              const featuredPeople = [
                ...(sec.secretaryPhotoUrl ? [{ name: sec.secretaryName || 'أمين الأمانة', photoUrl: sec.secretaryPhotoUrl }] : []),
                ...allAssts.filter(a => a.photoUrl).map(a => ({ name: a.name, photoUrl: a.photoUrl! }))
              ].slice(0, 3);

              return (
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

                  <p className="text-xs text-stone-600 leading-relaxed line-clamp-3 mb-5">
                    {sec.description || 'أمانة تنظيمية متخصصة ضمن الهيكل الإداري والميداني لأمانة قسم ثالث أكتوبر.'}
                  </p>

                  {featuredPeople.length > 0 && (
                    <div className="mb-5 flex flex-wrap items-center gap-3">
                      {featuredPeople.map((person, pIdx) => (
                        <button
                          type="button"
                          key={pIdx}
                          onClick={(e) => {
                            e.stopPropagation();
                            openSecretariat(sec.slug, person.name);
                          }}
                          title={`عرض بيانات ${person.name} في ${sec.name}`}
                          className="relative shrink-0 cursor-pointer text-right group/person"
                        >
                          <img
                            src={person.photoUrl}
                            alt={person.name}
                            className="w-24 h-28 sm:w-28 sm:h-32 rounded-2xl object-cover object-top border-2 border-amber-500 shadow-md bg-stone-100 group-hover/person:scale-[1.04] group-hover/person:border-red-600 transition-all"
                            referrerPolicy="no-referrer"
                          />
                        </button>
                      ))}
                    </div>
                  )}

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

                <div className="pt-4 border-t border-stone-100 flex items-center justify-between text-xs gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-[11px] text-stone-600 truncate">
                      <span className="text-stone-400 font-medium">أمين الأمانة: </span>
                      {sec.secretaryName ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openSecretariat(sec.slug, sec.secretaryName);
                          }}
                          className="font-bold text-stone-900 hover:text-red-700 hover:underline cursor-pointer"
                        >
                          {sec.secretaryName}
                        </button>
                      ) : (
                        <span className="font-bold text-stone-900">قيد التكليف</span>
                      )}
                    </div>
                    {allAssts.length > 0 && (
                      <div className="text-[11px] text-stone-600 line-clamp-2 leading-relaxed">
                        <span className="text-stone-400 font-medium">
                          {allAssts.length > 1 ? `الأمناء المساعدون (${allAssts.length}): ` : 'الأمين المساعد: '}
                        </span>
                        <span className="font-semibold text-stone-800">
                          {allAssts.map((a, aIdx) => (
                            <React.Fragment key={a.id || aIdx}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSecretariat(sec.slug, a.id || a.name);
                                }}
                                className="hover:text-red-700 hover:underline cursor-pointer"
                              >
                                {a.name}
                              </button>
                              {aIdx < allAssts.length - 1 ? '، ' : ''}
                            </React.Fragment>
                          ))}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-red-700 font-bold group-hover:translate-x-[-4px] transition-transform flex items-center gap-1 shrink-0">
                    <span>التفاصيل</span>
                    <ChevronLeft className="w-4 h-4" />
                  </span>
                </div>
              </div>
              );
            })}
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
    const allSecPeople = sec
      ? getAllPeopleInSecretariat(
          sec,
          data.secretariatMembers || [],
          data.secretariatLeaders || [],
          data.partyLeaders || []
        )
      : [];
    const activePersonKey = focusedPersonKey || selectedPerson || null;
    const activePersonProfile = activePersonKey
      ? allSecPeople.find(
          p =>
            p.personKey === activePersonKey ||
            normalizeArabicPersonName(p.name) === normalizeArabicPersonName(activePersonKey)
        ) || null
      : null;

    const isMatchedPerson = (candidateName?: string | null, candidateKey?: string | null) => {
      if (!activePersonProfile) return false;
      if (candidateKey && candidateKey === activePersonProfile.personKey) return true;
      if (candidateName && normalizeArabicPersonName(candidateName) === normalizeArabicPersonName(activePersonProfile.name)) {
        return true;
      }
      return false;
    };

    const linkedOnlyLeaders = (data.secretariatLeaders || []).filter(
      ldr =>
        ldr.specializedSecretariatId === sec?.id &&
        !allSecPeople.some(
          p =>
            p.personKey === ldr.id &&
            p.tierLabel !== 'قيادة مقيدة بالأمانة'
        )
    );

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

        {/* Highlighted Person Profile Card inside their Registered Secretariat */}
        {activePersonProfile && (
          <div id="active-person-profile" className="bg-gradient-to-br from-amber-50 via-white to-stone-50 rounded-3xl border-2 border-amber-500 p-6 sm:p-8 shadow-xl relative text-right">
            <div className="flex items-center justify-between gap-3 border-b border-amber-200/70 pb-3 mb-5">
              <div className="flex items-center gap-2 text-red-700 font-black text-sm">
                <ShieldCheck className="w-5 h-5 text-red-700" />
                <span>بطاقة بيانات العضو / القيادي المقيد في {sec.name}</span>
              </div>
              <button
                type="button"
                onClick={() => openSecretariat(sec.slug, null)}
                className="text-xs font-bold text-stone-500 hover:text-red-700 cursor-pointer flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                <span>إغلاق التحديد</span>
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
              <div
                onClick={() =>
                  activePersonProfile.photoUrl &&
                  openLightbox([activePersonProfile.photoUrl], 0, activePersonProfile.name)
                }
                className={`w-44 h-52 sm:w-48 sm:h-56 rounded-2xl overflow-hidden border-2 border-amber-500 shadow-lg bg-stone-100 shrink-0 ${
                  activePersonProfile.photoUrl ? 'cursor-zoom-in' : ''
                }`}
              >
                {activePersonProfile.photoUrl ? (
                  <img
                    src={activePersonProfile.photoUrl}
                    alt={activePersonProfile.name}
                    className="w-full h-full object-cover object-top"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-stone-800 to-stone-950 flex items-center justify-center text-amber-300 font-black text-5xl">
                    {activePersonProfile.name.charAt(0)}
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3 text-center md:text-right">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                  <span className="bg-red-700 text-white text-xs font-black px-3 py-1 rounded-lg">
                    {activePersonProfile.tierLabel}
                  </span>
                  <span className="bg-amber-100 text-amber-900 text-xs font-bold px-3 py-1 rounded-lg">
                    {sec.name}
                  </span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-black text-stone-950">
                  {activePersonProfile.name}
                </h2>
                <p className="text-sm sm:text-base font-bold text-red-700">
                  {activePersonProfile.role}
                </p>

                {activePersonProfile.bio && (
                  <div className="bg-white/90 border border-stone-200 rounded-2xl p-4 text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line">
                    {activePersonProfile.bio}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-1 text-xs">
                  {activePersonProfile.phone && (
                    <a
                      href={`tel:${activePersonProfile.phone}`}
                      className="inline-flex items-center gap-1.5 bg-white border border-stone-200 hover:border-red-600 px-3.5 py-2 rounded-xl font-mono font-bold text-stone-800 hover:text-red-700 transition-colors"
                      dir="ltr"
                    >
                      <Phone className="w-3.5 h-3.5 text-red-700" />
                      <span>{activePersonProfile.phone}</span>
                    </a>
                  )}
                  {activePersonProfile.email && (
                    <a
                      href={`mailto:${activePersonProfile.email}`}
                      className="inline-flex items-center gap-1.5 bg-white border border-stone-200 hover:border-red-600 px-3.5 py-2 rounded-xl font-mono font-bold text-stone-800 hover:text-red-700 transition-colors"
                      dir="ltr"
                    >
                      <Mail className="w-3.5 h-3.5 text-amber-600" />
                      <span>{activePersonProfile.email}</span>
                    </a>
                  )}
                  {activePersonProfile.assignmentDate && (
                    <span className="inline-flex items-center gap-1.5 bg-stone-100 px-3.5 py-2 rounded-xl text-stone-700 font-semibold">
                      <Calendar className="w-3.5 h-3.5 text-amber-700" />
                      <span>تاريخ التكليف: {activePersonProfile.assignmentDate}</span>
                    </span>
                  )}
                </div>

                {(() => {
                  const contribs = getPersonContributions(activePersonProfile.name, data);
                  if (contribs.length === 0) return null;
                  return (
                    <div className="pt-4 mt-2 border-t border-amber-200/70 space-y-2 text-right">
                      <h4 className="text-xs font-black text-stone-800">
                        المشاركات والأعمال والمنشورات المسجلة ({contribs.length}):
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {contribs.slice(0, 6).map(c => (
                          <button
                            type="button"
                            key={`${c.kind}-${c.id}`}
                            onClick={() => {
                              if (c.rawNews) {
                                setSelectedNews(c.rawNews);
                                if (onNavigate) onNavigate('news', { newsId: c.rawNews.id });
                              } else if (c.rawInitiative) {
                                openInitiative(c.rawInitiative.slug);
                              } else if (c.rawEvent) {
                                if (onNavigate) onNavigate('events');
                                else setCurrentView('events');
                              }
                            }}
                            className="text-right bg-white/90 hover:bg-white border border-stone-200 hover:border-red-500 rounded-xl p-2.5 transition-colors cursor-pointer"
                          >
                            <div className="text-[10px] font-bold text-red-700 flex items-center gap-1">
                              {c.contributionRole.includes('بقلم') && <PenTool className="w-3 h-3 shrink-0 text-amber-700" />}
                              <span>{c.contributionRole}</span>
                            </div>
                            <div className="text-xs font-black text-stone-900 truncate mt-0.5">{c.title}</div>
                            {c.date && <div className="text-[10px] text-stone-400 mt-0.5">{c.date}</div>}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Leadership of the Secretariat */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-stone-900 font-extrabold text-base border-r-4 border-red-700 pr-3">
            <UserCheck className="w-5 h-5 text-red-700" />
            <h2>قيادة الأمانة</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Secretary */}
            <div
              onClick={() => sec.secretaryName && openSecretariat(sec.slug, sec.secretaryName)}
              className={`bg-white rounded-2xl border overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between group ${
                sec.secretaryName ? 'cursor-pointer' : ''
              } ${
                isMatchedPerson(sec.secretaryName, sec.secretaryName)
                  ? 'border-amber-500 ring-2 ring-amber-400/60 shadow-lg'
                  : 'border-stone-200'
              }`}
            >
              <div>
                <div
                  onClick={(e) => {
                    if (sec.secretaryPhotoUrl) {
                      e.stopPropagation();
                      openLightbox([sec.secretaryPhotoUrl], 0, sec.secretaryName || 'أمين الأمانة');
                    }
                  }}
                  className={`aspect-[4/5] bg-stone-50 overflow-hidden relative ${sec.secretaryPhotoUrl ? 'cursor-zoom-in' : ''}`}
                >
                  <img
                    src={sec.secretaryPhotoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                    alt={sec.secretaryName || 'أمين الأمانة'}
                    className={`w-full h-full transition-transform duration-300 group-hover:scale-105 ${
                      sec.secretaryPhotoUrl ? 'object-cover object-top' : 'object-contain p-8 bg-white'
                    }`}
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-3 right-3 bg-red-700 text-white text-[11px] font-black px-3 py-1 rounded-lg shadow-xs">
                    أمين الأمانة (المسؤول الأول)
                  </div>
                </div>

                <div className="p-5 text-right space-y-1.5">
                  <h3 className="font-black text-stone-900 text-lg sm:text-xl leading-snug group-hover:text-red-700 transition-colors">
                    {sec.secretaryName || 'قيد التكليف الرسمي'}
                  </h3>
                  <p className="text-xs text-stone-500">
                    أمانة قسم ثالث أكتوبر – محافظة الجيزة
                  </p>
                </div>
              </div>

              {(sec.secretaryBio || sec.secretaryPhone) && (
                <div className="px-5 pb-5 pt-3 border-t border-stone-100 space-y-2 text-xs text-right">
                  {sec.secretaryBio && (
                    <p className="text-stone-600 leading-relaxed font-normal">{sec.secretaryBio}</p>
                  )}
                  {sec.secretaryPhone && (
                    <div className="flex items-center gap-2 text-stone-700 font-medium pt-1">
                      <Phone className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <a
                        href={`tel:${sec.secretaryPhone}`}
                        onClick={e => e.stopPropagation()}
                        className="hover:text-red-700 font-mono"
                        dir="ltr"
                      >
                        {sec.secretaryPhone}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Assistant Secretaries (Supports Multiple) */}
            {(() => {
              const fromField: AssistantSecretaryEntry[] =
                sec.assistantSecretaries && sec.assistantSecretaries.length > 0
                  ? sec.assistantSecretaries.filter(a => a.name?.trim() || a.photoUrl || a.bio || a.phone)
                  : sec.assistantSecretaryName
                  ? [{
                      id: 'asst-primary',
                      name: sec.assistantSecretaryName,
                      title: 'الأمين المساعد للأمانة',
                      photoUrl: sec.assistantSecretaryPhotoUrl || '',
                      bio: sec.assistantSecretaryBio || '',
                      phone: sec.assistantSecretaryPhone || ''
                    }]
                  : [];

              const fromMembers: AssistantSecretaryEntry[] = (data.secretariatMembers || [])
                .filter(m => m.secretariatId === sec?.id && m.tier === 'assistant_secretary')
                .filter(m => !fromField.some(f => f.name.trim() === m.name.trim()))
                .map(m => ({
                  id: m.id,
                  name: m.name,
                  title: m.bureauTitle || m.role || 'الأمين المساعد للأمانة',
                  photoUrl: m.photoUrl || '',
                  bio: m.notes || '',
                  phone: m.phone || ''
                }));

              const allAssistants = [...fromField, ...fromMembers];

              if (allAssistants.length === 0) {
                return (
                  <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="aspect-[4/5] bg-stone-50 overflow-hidden relative">
                        <img
                          src="/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg"
                          alt="الأمين المساعد"
                          className="w-full h-full object-contain p-8 bg-white"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute top-3 right-3 bg-stone-900/85 text-amber-300 text-[11px] font-black px-3 py-1 rounded-lg">
                          الأمين المساعد للأمانة
                        </div>
                      </div>
                      <div className="p-5 text-right space-y-1.5">
                        <h3 className="font-black text-stone-900 text-lg">
                          قيد التكليف الرسمي
                        </h3>
                        <p className="text-xs text-stone-500">
                          أمانة قسم ثالث أكتوبر – محافظة الجيزة
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              return allAssistants.map((asst, idx) => (
                <div
                  key={asst.id || idx}
                  onClick={() => asst.name && openSecretariat(sec.slug, asst.id || asst.name)}
                  className={`bg-white rounded-2xl border overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer ${
                    isMatchedPerson(asst.name, asst.id)
                      ? 'border-amber-500 ring-2 ring-amber-400/60 shadow-lg'
                      : 'border-stone-200'
                  }`}
                >
                  <div>
                    <div
                      onClick={(e) => {
                        if (asst.photoUrl) {
                          e.stopPropagation();
                          openLightbox([asst.photoUrl], 0, asst.name || 'الأمين المساعد');
                        }
                      }}
                      className={`aspect-[4/5] bg-stone-50 overflow-hidden relative ${asst.photoUrl ? 'cursor-zoom-in' : ''}`}
                    >
                      <img
                        src={asst.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                        alt={asst.name || 'الأمين المساعد'}
                        className={`w-full h-full transition-transform duration-300 group-hover:scale-105 ${
                          asst.photoUrl ? 'object-cover object-top' : 'object-contain p-8 bg-white'
                        }`}
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-3 right-3 bg-stone-900/85 backdrop-blur-xs text-amber-300 text-[11px] font-black px-3 py-1 rounded-lg shadow-xs">
                        {asst.title || 'الأمين المساعد للأمانة'}
                      </div>
                    </div>

                    <div className="p-5 text-right space-y-1.5">
                      <h3 className="font-black text-stone-900 text-lg sm:text-xl leading-snug group-hover:text-red-700 transition-colors">
                        {asst.name || 'قيد التكليف الرسمي'}
                      </h3>
                      <p className="text-xs text-stone-500">
                        أمانة قسم ثالث أكتوبر – محافظة الجيزة
                      </p>
                    </div>
                  </div>

                  {(asst.bio || asst.phone) && (
                    <div className="px-5 pb-5 pt-3 border-t border-stone-100 space-y-2 text-xs text-right">
                      {asst.bio && (
                        <p className="text-stone-600 leading-relaxed font-normal">{asst.bio}</p>
                      )}
                      {asst.phone && (
                        <div className="flex items-center gap-2 text-stone-700 font-medium pt-1">
                          <Phone className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <a
                            href={`tel:${asst.phone}`}
                            onClick={e => e.stopPropagation()}
                            className="hover:text-amber-700 font-mono"
                            dir="ltr"
                          >
                            {asst.phone}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ));
            })()}
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
                  {bureauMembers.length + linkedOnlyLeaders.length} كادر معتمد
                </span>
              </div>

              {bureauMembers.length === 0 && linkedOnlyLeaders.length === 0 ? (
                <div className="bg-stone-50 rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-500 space-y-2">
                  <Users className="w-10 h-10 text-stone-400 mx-auto opacity-70" />
                  <p className="font-bold text-sm text-stone-700">هيئة مكتب الأمانة قيد الاستكمال والاعتماد الرسمي</p>
                  <p className="text-xs text-stone-500 max-w-md mx-auto">
                    يتم تسكين الكوادر وأعضاء هيئة المكتب تدريجياً عبر لجان الفحص والتقييم الحزبية.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {bureauMembers.map(member => (
                    <div
                      key={member.id}
                      onClick={() => openSecretariat(sec.slug, member.id || member.name)}
                      className={`bg-white rounded-2xl border overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer ${
                        isMatchedPerson(member.name, member.id)
                          ? 'border-amber-500 ring-2 ring-amber-400/60 shadow-lg'
                          : 'border-stone-200'
                      }`}
                    >
                      <div>
                        <div
                          onClick={(e) => {
                            if (member.photoUrl) {
                              e.stopPropagation();
                              openLightbox([member.photoUrl], 0, member.name);
                            }
                          }}
                          className={`aspect-[4/5] bg-stone-50 overflow-hidden relative ${member.photoUrl ? 'cursor-zoom-in' : ''}`}
                        >
                          {member.photoUrl ? (
                            <img
                              src={member.photoUrl}
                              alt={member.name}
                              className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-stone-800 to-stone-950 flex flex-col items-center justify-center gap-3 text-amber-300">
                              <div className="w-24 h-24 rounded-full border-2 border-amber-400/60 bg-stone-900/80 flex items-center justify-center font-black text-4xl shadow-md">
                                {member.name.substring(0, 1)}
                              </div>
                            </div>
                          )}
                          <div className="absolute top-3 right-3 bg-stone-900/85 backdrop-blur-xs text-amber-300 text-[11px] font-black px-3 py-1 rounded-lg max-w-[85%] truncate">
                            {member.bureauTitle || member.role || 'عضو هيئة مكتب'}
                          </div>
                        </div>

                        <div className="p-5 text-right space-y-1.5">
                          <h4 className="font-black text-stone-900 text-lg leading-snug group-hover:text-red-700 transition-colors">
                            {member.name}
                          </h4>
                          {member.assignmentDate && (
                            <p className="text-[11px] text-stone-400 font-mono">
                              تاريخ التكليف: {member.assignmentDate}
                            </p>
                          )}
                        </div>
                      </div>

                      {(member.notes || member.phone) && (
                        <div className="px-5 pb-5 space-y-2.5 text-right">
                          {member.notes && (
                            <p className="text-xs text-stone-600 leading-relaxed bg-stone-50 p-3 rounded-xl border border-stone-100">
                              {member.notes}
                            </p>
                          )}

                          {member.phone && (
                            <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                              <span className="text-stone-400 text-[11px]">الاتصال المباشر:</span>
                              <a
                                href={`tel:${member.phone}`}
                                onClick={e => e.stopPropagation()}
                                className="font-mono font-bold text-red-700 hover:underline flex items-center gap-1"
                                dir="ltr"
                              >
                                <Phone className="w-3 h-3 text-red-600" />
                                <span>{member.phone}</span>
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {linkedOnlyLeaders.map(ldr => (
                    <div
                      key={ldr.id}
                      onClick={() => openSecretariat(sec.slug, ldr.id || ldr.name)}
                      className={`bg-white rounded-2xl border overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer ${
                        isMatchedPerson(ldr.name, ldr.id)
                          ? 'border-amber-500 ring-2 ring-amber-400/60 shadow-lg'
                          : 'border-stone-200'
                      }`}
                    >
                      <div>
                        <div
                          onClick={(e) => {
                            if (ldr.photoUrl) {
                              e.stopPropagation();
                              openLightbox([ldr.photoUrl], 0, ldr.name);
                            }
                          }}
                          className={`aspect-[4/5] bg-stone-50 overflow-hidden relative ${ldr.photoUrl ? 'cursor-zoom-in' : ''}`}
                        >
                          <img
                            src={ldr.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'}
                            alt={ldr.name}
                            className={`w-full h-full transition-transform duration-300 group-hover:scale-105 ${
                              ldr.photoUrl ? 'object-cover object-top' : 'object-contain p-8 bg-white'
                            }`}
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-3 right-3 bg-stone-900/85 backdrop-blur-xs text-amber-300 text-[11px] font-black px-3 py-1 rounded-lg max-w-[85%] truncate">
                            {ldr.title}
                          </div>
                        </div>
                        <div className="p-5 text-right space-y-1.5">
                          <h4 className="font-black text-stone-900 text-lg leading-snug group-hover:text-red-700 transition-colors">
                            {ldr.name}
                          </h4>
                          {ldr.appointmentDate && (
                            <p className="text-[11px] text-stone-400 font-mono">
                              تاريخ التكليف: {ldr.appointmentDate}
                            </p>
                          )}
                        </div>
                      </div>
                      {ldr.bio && (
                        <div className="px-5 pb-5 text-right">
                          <p className="text-xs text-stone-600 leading-relaxed bg-stone-50 p-3 rounded-xl border border-stone-100">
                            {ldr.bio}
                          </p>
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
                  <div className="flex-1 space-y-1.5">
                    <span className="text-[10px] text-stone-400">{item.publishDate}</span>
                    <h4 className="font-bold text-sm text-stone-900 line-clamp-2 mt-0.5">{item.title}</h4>
                    {(item.authorName || item.publisherName) && (
                      <div className="space-y-1 pt-1">
                        {renderPersonBadge({
                          label: 'بقلم',
                          name: item.authorName,
                          position: item.authorPosition,
                          secretariatId: item.authorSecretariatId,
                          fallbackSecretariatId: item.linkedSecretariatId,
                          tone: 'author'
                        })}
                        {renderPersonBadge({
                          label: 'نشر (أمانة الإعلام)',
                          name: item.publisherName,
                          position: item.publisherPosition,
                          secretariatId: item.publisherSecretariatId,
                          tone: 'publisher'
                        })}
                      </div>
                    )}
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
          {data.initiatives.map(init => {
            const initImgs = Array.from(
              new Set([
                ...(init.coverUrl ? [init.coverUrl] : []),
                ...(init.galleryImages || []),
                ...(init.activities || []).map(a => a.imageUrl || ''),
                ...(init.logoUrl ? [init.logoUrl] : [])
              ])
            ).filter(Boolean);
            const initLeadImg = initImgs[0];
            const initLocationHref = normalizeLocationHref(init.locationUrl);

            return (
              <div
                key={init.id}
                onClick={() => openInitiative(init.slug)}
                className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div
                    className="aspect-video bg-stone-100 overflow-hidden relative"
                    onClick={(e) => {
                      if (initImgs.length > 0) {
                        e.stopPropagation();
                        openLightbox(initImgs, 0, init.title);
                      }
                    }}
                  >
                    <img
                      src={initLeadImg || data.settings.officialLogo}
                      alt={init.title}
                      className={`w-full h-full transition-transform duration-300 group-hover:scale-105 ${
                        initLeadImg ? 'object-cover' : 'object-contain p-6 bg-stone-50'
                      }`}
                      referrerPolicy="no-referrer"
                    />
                    {initImgs.length > 0 && (
                      <span className="absolute bottom-3 left-3 bg-black/70 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                        <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>{initImgs.length > 1 ? `${initImgs.length} صور` : 'تكبير الصورة'}</span>
                      </span>
                    )}
                  </div>

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

                    {(init.venue || initLocationHref) && (
                      <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-700">
                        {init.venue && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-red-700 shrink-0" />
                            <span><strong>العنوان:</strong> {init.venue}</span>
                          </span>
                        )}
                        {initLocationHref && (
                          <a
                            href={initLocationHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-amber-800 hover:text-amber-900 font-bold bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>فتح اللوكيشن على الخريطة</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}

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
                </div>

                <div className="p-6 pt-0 space-y-3">
                  {(init.authorName || init.authorPosition || init.publisherName || init.publisherPosition) && (
                    <div className="pt-3 border-t border-stone-100 space-y-1.5">
                      {renderPersonBadge({
                        label: 'إعداد وتنفيذ',
                        name: init.authorName,
                        position: init.authorPosition,
                        secretariatId: init.authorSecretariatId,
                        tone: 'author'
                      })}
                      {renderPersonBadge({
                        label: 'نشر (أمانة الإعلام)',
                        name: init.publisherName,
                        position: init.publisherPosition,
                        secretariatId: init.publisherSecretariatId,
                        tone: 'publisher'
                      })}
                    </div>
                  )}

                  <SocialShareButtons
                    title={init.title}
                    summary={init.description}
                    itemType="initiative"
                    itemId={init.slug || init.id}
                    imageUrl={initLeadImg}
                    compact
                  />

                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-red-700 font-bold">
                    <span>استعراض أنشطة وفعاليات المبادرة كاملة</span>
                    <ChevronLeft className="w-4 h-4 group-hover:translate-x-[-4px] transition-transform" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 8. INITIATIVE DETAIL VIEW
  // -------------------------------------------------------------
  if (currentView === 'initiative-detail') {
    const init = data.initiatives.find(i => i.slug === selectedSlug || i.id === selectedSlug) || data.initiatives[0];
    const allInitImgs = Array.from(
      new Set([
        ...(init.coverUrl ? [init.coverUrl] : []),
        ...(init.galleryImages || []),
        ...(init.activities || []).map(a => a.imageUrl || ''),
        ...(init.logoUrl ? [init.logoUrl] : [])
      ])
    ).filter(Boolean);
    const initLeadImg = allInitImgs[0];
    const initLocationHref = normalizeLocationHref(init.locationUrl);

    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        <button
          onClick={() => setCurrentView('initiatives')}
          className="inline-flex items-center gap-2 text-xs font-bold text-red-700 hover:underline cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لكافة المبادرات</span>
        </button>

        <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm text-right">
          {initLeadImg && (
            <div
              className="aspect-video max-h-[420px] w-full bg-stone-100 overflow-hidden relative cursor-pointer group"
              onClick={() => openLightbox(allInitImgs, 0, init.title)}
            >
              <img
                src={initLeadImg}
                alt={init.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="bg-black/75 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-2">
                  <Maximize2 className="w-4 h-4 text-amber-400" />
                  <span>عرض الصور بالحجم الكامل ({allInitImgs.length})</span>
                </span>
              </div>
            </div>
          )}

          <div className="p-8 sm:p-12 space-y-8">
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

            {(init.venue || initLocationHref) && (
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
                {init.venue && (
                  <div className="flex items-center gap-2 text-stone-800">
                    <MapPin className="w-4 h-4 text-red-700 shrink-0" />
                    <span><strong>العنوان / المكان:</strong> {init.venue}</span>
                  </div>
                )}
                {initLocationHref && (
                  <a
                    href={initLocationHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-xs"
                  >
                    <MapPin className="w-4 h-4" />
                    <span>فتح اللوكيشن على خرائط جوجل</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}

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
                  {init.activities.map((act, i) => {
                    const actLocHref = normalizeLocationHref(act.locationUrl);
                    const actLightboxIndex = act.imageUrl ? Math.max(0, allInitImgs.indexOf(act.imageUrl)) : 0;

                    return (
                      <div key={i} className="border-r-4 border-amber-600 bg-stone-50/70 rounded-l-2xl p-4 sm:p-5 space-y-3">
                        <div className="flex flex-col md:flex-row gap-4 items-start">
                          {act.imageUrl && (
                            <div
                              className="w-full md:w-56 aspect-video rounded-xl overflow-hidden border border-stone-200 shrink-0 cursor-pointer relative group bg-stone-100"
                              onClick={() => openLightbox(allInitImgs.length > 0 ? allInitImgs : [act.imageUrl!], actLightboxIndex, `${act.title} - ${init.title}`)}
                            >
                              <img
                                src={act.imageUrl}
                                alt={act.title || `نشاط ${i + 1}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Maximize2 className="w-4 h-4" />
                              </div>
                            </div>
                          )}

                          <div className="flex-1 space-y-2 min-w-0 w-full">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-extrabold text-stone-900">{act.title}</span>
                              <span className="text-[11px] text-amber-800 font-semibold bg-amber-100/80 px-2.5 py-0.5 rounded-md">
                                {act.date}
                              </span>
                            </div>

                            <p className="text-xs sm:text-sm text-stone-700 leading-relaxed">{act.description}</p>

                            {(act.venue || actLocHref) && (
                              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-stone-700">
                                {act.venue && (
                                  <span className="flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-red-700 shrink-0" />
                                    <span><strong>المكان:</strong> {act.venue}</span>
                                  </span>
                                )}
                                {actLocHref && (
                                  <a
                                    href={actLocHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-900 font-bold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg transition-colors"
                                  >
                                    <MapPin className="w-3 h-3" />
                                    <span>فتح اللوكيشن على الخريطة</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            )}

                            {(act.authorName || act.authorPosition || act.publisherName || act.publisherPosition) && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                {renderPersonBadge({
                                  label: 'القائم بالنشاط',
                                  name: act.authorName,
                                  position: act.authorPosition,
                                  secretariatId: act.authorSecretariatId,
                                  tone: 'author'
                                })}
                                {renderPersonBadge({
                                  label: 'نشر (أمانة الإعلام)',
                                  name: act.publisherName,
                                  position: act.publisherPosition,
                                  secretariatId: act.publisherSecretariatId,
                                  tone: 'publisher'
                                })}
                              </div>
                            )}

                            <SocialShareButtons
                              title={`${act.title || 'نشاط ميداني'} – ${init.title}`}
                              summary={act.description}
                              itemType="initiative"
                              itemId={init.slug || init.id}
                              imageUrl={act.imageUrl || initLeadImg}
                              compact
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Multi-image Gallery */}
            {allInitImgs.length > 0 && (
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
            )}

            {(init.authorName || init.authorPosition || init.publisherName || init.publisherPosition) && (
              <div className="pt-4 border-t border-stone-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {renderPersonBadge({
                  label: 'القائم بالمبادرة / مُعدّها',
                  name: init.authorName,
                  position: init.authorPosition,
                  secretariatId: init.authorSecretariatId,
                  tone: 'author'
                })}
                {renderPersonBadge({
                  label: 'مسؤول النشر والرفع (أمانة الإعلام)',
                  name: init.publisherName,
                  position: init.publisherPosition,
                  secretariatId: init.publisherSecretariatId,
                  tone: 'publisher'
                })}
              </div>
            )}

            <SocialShareButtons
              title={init.title}
              summary={init.description}
              itemType="initiative"
              itemId={init.slug || init.id}
              imageUrl={initLeadImg}
            />
          </div>
        </div>
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
                if (onNavigate) {
                  onNavigate('news', { newsId: item.id });
                }
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
                  {(item.authorName || item.authorPosition || item.publisherName || item.publisherPosition) && (
                    <div className="pt-2 border-t border-stone-100 space-y-1.5">
                      {renderPersonBadge({
                        label: 'بقلم',
                        name: item.authorName,
                        position: item.authorPosition,
                        secretariatId: item.authorSecretariatId,
                        fallbackSecretariatId: item.linkedSecretariatId,
                        tone: 'author'
                      })}
                      {renderPersonBadge({
                        label: 'نشر (أمانة الإعلام)',
                        name: item.publisherName,
                        position: item.publisherPosition,
                        secretariatId: item.publisherSecretariatId,
                        tone: 'publisher'
                      })}
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
          {filteredEvents.map(event => {
            const allEventImgs = Array.from(
              new Set([
                ...(event.coverUrl ? [event.coverUrl] : []),
                ...(event.coverImage ? [event.coverImage] : []),
                ...(event.images || []),
                ...(event.galleryImages || [])
              ])
            ).filter(Boolean);
            const leadEventImg = allEventImgs[0];
            const eventLocationHref = normalizeLocationHref(event.locationUrl);

            return (
              <div
                key={event.id}
                className={`bg-white rounded-2xl border overflow-hidden shadow-xs hover:shadow-md transition-all text-right ${
                  selectedEventId === event.id
                    ? 'border-amber-500 ring-2 ring-amber-400/30'
                    : 'border-stone-200'
                }`}
              >
                {leadEventImg && (
                  <div
                    className="aspect-video max-h-[380px] w-full bg-stone-100 overflow-hidden relative cursor-pointer group"
                    onClick={() => openLightbox(allEventImgs, 0, `${event.title} - تغطية مصورة`)}
                  >
                    <img
                      src={leadEventImg}
                      alt={event.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="bg-black/75 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-2">
                        <Maximize2 className="w-4 h-4 text-amber-400" />
                        <span>{allEventImgs.length > 1 ? `عرض التغطية المصورة (${allEventImgs.length} صور)` : 'تكبير الصورة'}</span>
                      </span>
                    </div>
                  </div>
                )}

                <div className="p-6 sm:p-8 space-y-4">
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

                  <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-4 text-xs text-stone-700">
                    <div className="flex flex-wrap items-center gap-5">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-red-700 shrink-0" />
                        <span><strong>المكان / العنوان:</strong> {event.venue}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                        <span><strong>الجهة المنظمة:</strong> {event.organizer}</span>
                      </div>
                    </div>

                    {eventLocationHref && (
                      <a
                        href={eventLocationHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-colors shadow-xs"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>فتح اللوكيشن على الخريطة</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {event.postReport && (
                    <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 text-xs text-stone-700 space-y-1">
                      <span className="font-bold text-stone-900">تقرير ما بعد الفعالية:</span>
                      <p>{event.postReport}</p>
                    </div>
                  )}

                  {/* Event Multi-image Gallery */}
                  {allEventImgs.length > 0 && (
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
                  )}

                  {(event.authorName || event.authorPosition || event.publisherName || event.publisherPosition) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {renderPersonBadge({
                        label: 'القائم بالفعالية',
                        name: event.authorName,
                        position: event.authorPosition,
                        secretariatId: event.authorSecretariatId,
                        tone: 'author'
                      })}
                      {renderPersonBadge({
                        label: 'مسؤول النشر والتغطية (أمانة الإعلام)',
                        name: event.publisherName,
                        position: event.publisherPosition,
                        secretariatId: event.publisherSecretariatId,
                        tone: 'publisher'
                      })}
                    </div>
                  )}

                  {/* Share Buttons for Event */}
                  <SocialShareButtons
                    title={event.title}
                    summary={event.description}
                    itemType="event"
                    itemId={event.id}
                    imageUrl={leadEventImg}
                  />
                </div>
              </div>
            );
          })}
        </div>
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
                      inputMode="numeric"
                      value={appForm.nationalId}
                      onChange={e => {
                        const cleanedNid = normalizeArabicDigits(e.target.value).replace(/\D/g, '').slice(0, 14);
                        const extractedDob = extractDobFromNationalId(cleanedNid);
                        setAppForm(prev => ({
                          ...prev,
                          nationalId: cleanedNid,
                          dateOfBirth: extractedDob ?? prev.dateOfBirth
                        }));
                      }}
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
                    {extractDobFromNationalId(appForm.nationalId) && (
                      <p className="text-[10px] font-semibold text-emerald-700 mt-1">
                        تم تحديد تاريخ الميلاد تلقائياً من الرقم القومي
                      </p>
                    )}
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
                      <span>الأمانة المفضلة والاهتمامات الحزبية</span>
                      {isFieldReq('interests') ? (
                        <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">* إجباري</span>
                      ) : (
                        <span className="text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">اختياري</span>
                      )}
                    </label>
                    <div className="space-y-2">
                      <select
                        required={isFieldReq('interests') && !extraInterestsNote.trim()}
                        value={selectedPreferredSec}
                        onChange={e => {
                          const secVal = e.target.value;
                          setSelectedPreferredSec(secVal);
                          const combined = secVal && extraInterestsNote.trim()
                            ? `${secVal} — ${extraInterestsNote.trim()}`
                            : secVal || extraInterestsNote.trim();
                          setAppForm({ ...appForm, interests: combined });
                        }}
                        className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs text-stone-900 bg-white focus:outline-hidden focus:border-red-700"
                      >
                        <option value="">-- اختر الأمانة التخصصية المفضلة --</option>
                        {data.specializedSecretariats.map(sec => (
                          <option key={sec.id} value={sec.name}>
                            {sec.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="ملاحظات أو اهتمامات إضافية (اختياري)..."
                        value={extraInterestsNote}
                        onChange={e => {
                          const note = e.target.value;
                          setExtraInterestsNote(note);
                          const combined = selectedPreferredSec && note.trim()
                            ? `${selectedPreferredSec} — ${note.trim()}`
                            : selectedPreferredSec || note.trim();
                          setAppForm({ ...appForm, interests: combined });
                        }}
                        className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-hidden focus:border-red-700"
                      />
                    </div>
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
                    alt="شعار حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر"
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
                      'https://maps.app.goo.gl/iw7sGSbbb2K1g6yZ7?g_st=ac'
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
                    'https://maps.google.com/maps?q=%D8%AD%D8%B2%D8%A8+%D8%A7%D9%84%D8%AC%D8%A8%D9%87%D8%A9+%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A%D8%A9+%D8%A3%D9%85%D8%A7%D9%86%D8%A9+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+%D8%A7%D9%83%D8%AA%D9%88%D8%A8%D8%B1%D8%8C+%D8%B7%D8%B1%D9%8A%D9%82+%D8%A7%D9%84%D8%B4%D8%A7%D8%B0%D9%84%D9%89+%D8%A7%D8%A8%D9%86%D9%89+%D8%A8%D9%8A%D8%AA%D9%83+7%D8%8C+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+6+%D8%A3%D9%83%D8%AA%D9%88%D8%A8%D8%B1%D8%8C+%D9%85%D8%AD%D8%A7%D9%81%D8%B8%D8%A9+%D8%A7%D9%84%D8%AC%D9%8A%D8%B2%D8%A9&t=&z=16&ie=UTF8&iwloc=B&output=embed'
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

  // -------------------------------------------------------------
  // 15. LIVE STREAM DEDICATED SECTION (/live)
  // -------------------------------------------------------------
  if (currentView === 'live') {
    const stream = data.liveStream;
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 text-right">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-red-700 uppercase tracking-widest">
            <Radio className="w-4 h-4" />
            <span>قسم البث المباشر</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-stone-900">
            {stream?.title || 'البث المباشر لأمانة قسم ثالث أكتوبر'}
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 max-w-2xl mx-auto">
            {stream?.description || 'تابع الآن النقل الحي والمباشر للمؤتمرات واللقاءات الجماهيرية وفعاليات حزب الجبهة الوطنية بأمانة قسم ثالث أكتوبر.'}
          </p>
        </div>

        {stream?.isActive && stream?.streamUrl ? (
          <div className="bg-stone-950 rounded-3xl border-2 border-red-600/60 p-4 sm:p-6 shadow-2xl space-y-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 bg-red-600 text-white text-xs font-black px-3.5 py-1.5 rounded-xl">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                </span>
                <span>بث مباشر نشط الآن</span>
              </div>

              <a
                href={stream.streamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 text-amber-300 px-4 py-2 rounded-xl transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>فتح البث في نافذة خارجية</span>
              </a>
            </div>

            <VideoPlayer
              url={stream.streamUrl}
              title={stream.title || 'البث المباشر'}
              className="w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-xl"
            />
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-stone-200 p-10 sm:p-14 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mx-auto">
              <Radio className="w-8 h-8" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-stone-900">
              لا يوجد بث مباشر جارٍ في اللحظة الحالية
            </h2>
            <p className="text-xs sm:text-sm text-stone-500 max-w-lg mx-auto leading-relaxed">
              سيتم تفعيل البث المباشر هنا فور انطلاق الندوات أو المؤتمرات والفعاليات الميدانية للأمانة. يمكنك متابعة أحدث الأخبار والفعاليات القادمة في الأقسام.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => (onNavigate ? onNavigate('events') : setCurrentView('events'))}
                className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer"
              >
                استعراض جدول الفعاليات
              </button>
              <button
                type="button"
                onClick={() => (onNavigate ? onNavigate('news') : setCurrentView('news'))}
                className="bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer"
              >
                تصفح أحدث الأخبار
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
  };

  return (
    <>
      {renderCurrentView()}

      {/* Global Fallback Party Leader Modal (when not registered inside a specialized secretariat) */}
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
                className="w-32 h-32 sm:w-40 sm:h-40 object-cover object-top rounded-2xl border-2 border-red-700 shadow-md shrink-0 bg-stone-100"
                referrerPolicy="no-referrer"
              />
              <div className="space-y-1 text-center sm:text-right">
                <span className="bg-red-50 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">
                  {selectedPartyLeader.governorate
                    ? `${selectedPartyLeader.level || 'قيادات المحافظات'} – ${selectedPartyLeader.governorate}`
                    : selectedPartyLeader.level || 'الهيئة العليا'}
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

      {/* Global Fallback Secretariat Leader Modal */}
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
                className="w-32 h-32 sm:w-40 sm:h-40 object-cover object-top rounded-2xl border-2 border-amber-600 shadow-md shrink-0 bg-stone-100"
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

      {/* Global News Details Modal */}
      {selectedNews && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 text-right shadow-2xl relative border border-stone-200 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setSelectedNews(null);
                if (onClearSelectedNewsId) onClearSelectedNewsId();
              }}
              className="absolute top-4 left-4 p-2 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 cursor-pointer"
            >
              ✕
            </button>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {selectedNews.isUrgent && (
                  <span className="bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded-md flex items-center gap-1 shadow-xs">
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

              {(selectedNews.authorName || selectedNews.authorPosition || selectedNews.publisherName || selectedNews.publisherPosition) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {renderPersonBadge({
                    label: 'بقلم',
                    name: selectedNews.authorName,
                    position: selectedNews.authorPosition,
                    secretariatId: selectedNews.authorSecretariatId,
                    fallbackSecretariatId: selectedNews.linkedSecretariatId,
                    tone: 'author'
                  })}
                  {renderPersonBadge({
                    label: 'مسؤول النشر والرفع (أمانة الإعلام)',
                    name: selectedNews.publisherName,
                    position: selectedNews.publisherPosition,
                    secretariatId: selectedNews.publisherSecretariatId,
                    tone: 'publisher'
                  })}
                </div>
              )}

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

      {/* Global Fallback Unlinked Author/Publisher Modal */}
      {selectedPersonFallback && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 text-right shadow-2xl relative border border-stone-200 max-h-[90vh] overflow-y-auto space-y-5">
            <button
              onClick={() => setSelectedPersonFallback(null)}
              className="absolute top-4 left-4 p-2 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 cursor-pointer"
            >
              ✕
            </button>

            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-stone-800 to-stone-950 text-amber-300 font-black text-2xl flex items-center justify-center shrink-0">
                {selectedPersonFallback.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-xl font-black text-stone-900">
                  {selectedPersonFallback.name}
                </h3>
                {selectedPersonFallback.position && (
                  <p className="text-xs sm:text-sm font-bold text-red-700 mt-0.5">
                    {selectedPersonFallback.position}
                  </p>
                )}
              </div>
            </div>

            {(() => {
              const contribs = getPersonContributions(selectedPersonFallback.name, data);
              return (
                <div className="border-t border-stone-100 pt-4 space-y-2.5">
                  <h4 className="font-bold text-stone-800 text-xs sm:text-sm">
                    المشاركات والأعمال المسجلة ({contribs.length}):
                  </h4>
                  {contribs.length === 0 ? (
                    <p className="text-xs text-stone-500">لا توجد منشورات أخرى مسجلة حالياً.</p>
                  ) : (
                    <div className="space-y-2">
                      {contribs.map(c => (
                        <button
                          type="button"
                          key={`${c.kind}-${c.id}`}
                          onClick={() => {
                            setSelectedPersonFallback(null);
                            if (c.rawNews) {
                              setSelectedNews(c.rawNews);
                              if (onNavigate) onNavigate('news', { newsId: c.rawNews.id });
                            } else if (c.rawInitiative) {
                              openInitiative(c.rawInitiative.slug);
                            } else if (c.rawEvent) {
                              if (onNavigate) onNavigate('events');
                              else setCurrentView('events');
                            }
                          }}
                          className="w-full text-right bg-stone-50 hover:bg-amber-50 border border-stone-200 rounded-xl p-3 transition-colors cursor-pointer"
                        >
                          <div className="text-[11px] font-bold text-red-700 flex items-center gap-1">
                            {c.contributionRole.includes('بقلم') && <PenTool className="w-3 h-3 shrink-0 text-amber-700" />}
                            <span>{c.contributionRole}</span>
                          </div>
                          <div className="text-xs sm:text-sm font-black text-stone-900 mt-0.5">{c.title}</div>
                          {c.date && <div className="text-[10px] text-stone-400 mt-0.5">{c.date}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Global Lightbox Modal */}
      <ImageLightboxModal
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        images={lightboxImages}
        initialIndex={lightboxIndex}
        title={lightboxTitle}
      />
    </>
  );
};
