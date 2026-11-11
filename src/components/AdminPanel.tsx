import React, { useState, useEffect } from 'react';
import {
  AdminUser,
  PartyLeader,
  SecretariatLeader,
  SpecializedSecretariat,
  SecretariatMember,
  Initiative,
  NewsItem,
  EventItem,
  MediaItem,
  MembershipApplication,
  MemberRecord,
  SiteSettings,
  AuditLog,
  AdminStats,
  AdminRole,
  CMSPage
} from '../types';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { ImageFieldWithPicker } from './ImageFieldWithPicker';
import { MultiImageGalleryField } from './MultiImageGalleryField';
import { MediaPickerModal } from './MediaPickerModal';
import { VideoUploadField } from './VideoUploadField';
import {
  Shield,
  Users,
  Building2,
  Award,
  Layers,
  FileText,
  UserCheck,
  Newspaper,
  Calendar,
  Image as ImageIcon,
  Radio,
  Settings,
  History,
  Lock,
  LogOut,
  Plus,
  Trash2,
  Edit2,
  Save,
  Eye,
  EyeOff,
  Check,
  CheckCircle2,
  X,
  Search,
  Filter,
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Film,
  ArrowLeftRight,
  Printer,
  Key,
  BookOpen,
  Sparkles,
  FileEdit,
  FolderTree,
  CheckSquare,
  Video,
  Upload,
  MapPin,
  BarChart3,
  Activity,
  Copy,
  FileSpreadsheet,
  Type,
  Play,
  HeartHandshake
} from 'lucide-react';
import { initGoogleAnalytics, trackEvent } from '../utils/analytics';

const MEMBERSHIP_FORM_FIELDS = [
  { key: 'fullName', label: 'الاسم الرباعي كاملاً' },
  { key: 'nationalId', label: 'الرقم القومي (14 رقماً)' },
  { key: 'dateOfBirth', label: 'تاريخ الميلاد' },
  { key: 'gender', label: 'النوع (الجنس)' },
  { key: 'maritalStatus', label: 'الحالة الاجتماعية' },
  { key: 'governorate', label: 'المحافظة' },
  { key: 'district', label: 'القسم / المركز / المدينة' },
  { key: 'address', label: 'العنوان بالتفصيل' },
  { key: 'phone', label: 'رقم الهاتف المحمول' },
  { key: 'whatsapp', label: 'رقم الواتساب' },
  { key: 'email', label: 'البريد الإلكتروني' },
  { key: 'qualification', label: 'المؤهل الدراسي' },
  { key: 'job', label: 'المهنة / الوظيفة الحالية' },
  { key: 'workplace', label: 'جهة العمل' },
  { key: 'skills', label: 'المهارات والخبرات العملية' },
  { key: 'interests', label: 'الاهتمامات والمجالات المفضلة' },
  { key: 'volunteerExperience', label: 'الخبرات التطوعية والعمل العام' },
  { key: 'reasonForJoining', label: 'سبب الرغبة في الانضمام' },
  { key: 'personalPhotoUrl', label: 'الصورة الشخصية الحديثة' },
  { key: 'nationalIdFrontUrl', label: 'صورة بطاقة الرقم القومي (الوجه الأمامي)' },
  { key: 'nationalIdBackUrl', label: 'صورة بطاقة الرقم القومي (الوجه الخلفي)' },
];

interface AdminPanelProps {
  onBackToSite: () => void;
  onRefreshPublicData: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBackToSite, onRefreshPublicData }) => {
  const { user, login, logout, hasPermission } = useAuth();

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Active admin tab
  const [activeTab, setActiveTab] = useState<
    | 'stats'
    | 'party-leaders'
    | 'secretariat-leaders'
    | 'secretariats'
    | 'secretariat-members'
    | 'initiatives'
    | 'applications'
    | 'members'
    | 'cms-pages'
    | 'news'
    | 'events'
    | 'media'
    | 'livestream'
    | 'roles'
    | 'users'
    | 'settings'
    | 'audit'
  >('stats');

  // Database caches
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [partyLeaders, setPartyLeaders] = useState<PartyLeader[]>([]);
  const [secretariatLeaders, setSecretariatLeaders] = useState<SecretariatLeader[]>([]);
  const [secretariats, setSecretariats] = useState<SpecializedSecretariat[]>([]);
  const [secretariatMembers, setSecretariatMembers] = useState<SecretariatMember[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [applications, setApplications] = useState<MembershipApplication[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [liveStream, setLiveStream] = useState<any>({});
  const [cmsPages, setCmsPages] = useState<CMSPage[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [gaTestStatus, setGaTestStatus] = useState<string | null>(null);
  const [copiedSiteUrl, setCopiedSiteUrl] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Modals & sub-state
  const [selectedApp, setSelectedApp] = useState<MembershipApplication | null>(null);
  const [appSearch, setAppSearch] = useState('');
  const [appStatusFilter, setAppStatusFilter] = useState('');
  const [convertingAppId, setConvertingAppId] = useState<string | null>(null);
  const [convertForm, setConvertForm] = useState({ secretariatId: '', title: 'عضو أمانة', notes: '' });

  // Member assignment modal
  const [assigningMember, setAssigningMember] = useState<MemberRecord | null>(null);
  const [assignmentForm, setAssignmentForm] = useState({ title: '', secretariatId: '', notes: '' });

  // Transfer member modal
  const [transferringMember, setTransferringMember] = useState<SecretariatMember | null>(null);
  const [transferForm, setTransferForm] = useState({ targetSecretariatId: '', newRole: '', notes: '' });

  // Creation/Edit Dialogs generic state
  const [showPartyLeaderModal, setShowPartyLeaderModal] = useState(false);
  const [editingPartyLeader, setEditingPartyLeader] = useState<Partial<PartyLeader> | null>(null);

  const [showSecLeaderModal, setShowSecLeaderModal] = useState(false);
  const [editingSecLeader, setEditingSecLeader] = useState<Partial<SecretariatLeader> | null>(null);

  const [showSecretariatModal, setShowSecretariatModal] = useState(false);
  const [editingSecretariat, setEditingSecretariat] = useState<Partial<SpecializedSecretariat> | null>(null);

  const [showInitiativeModal, setShowInitiativeModal] = useState(false);
  const [editingInitiative, setEditingInitiative] = useState<Partial<Initiative> | null>(null);

  const [showNewsModal, setShowNewsModal] = useState(false);
  const [editingNews, setEditingNews] = useState<Partial<NewsItem> | null>(null);

  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Partial<EventItem> | null>(null);

  const [showMediaModal, setShowMediaModal] = useState(false);
  const [editingMedia, setEditingMedia] = useState<Partial<MediaItem> | null>(null);

  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  // CMS Pages Modal
  const [showPageModal, setShowPageModal] = useState(false);
  const [editingPage, setEditingPage] = useState<Partial<CMSPage> | null>(null);

  // RBAC Roles Modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Partial<AdminRole> | null>(null);

  // Secretariat Member & Bureau Member Modal
  const [showSecMemberModal, setShowSecMemberModal] = useState(false);
  const [editingSecMember, setEditingSecMember] = useState<Partial<SecretariatMember> | null>(null);

  // Media Picker Dialog for Secretariats
  const [showMediaPickerModal, setShowMediaPickerModal] = useState(false);
  const [newSecVideoTitle, setNewSecVideoTitle] = useState('');
  const [newSecVideoUrl, setNewSecVideoUrl] = useState('');
  const [heroSlidePickerIdx, setHeroSlidePickerIdx] = useState<number | null>(null);
  const [adminMediaFilter, setAdminMediaFilter] = useState<'all' | 'special' | 'photo' | 'video'>('all');

  // Handle new media created via picker or upload
  const handleMediaCreated = (newMedia: MediaItem) => {
    setMedia(prev => [newMedia, ...prev]);
    onRefreshPublicData();
  };

  // Load all DB data on login or refresh
  const loadAdminData = async () => {
    if (!user) return;
    try {
      const full = await api.getFullDatabase();
      setPartyLeaders(full.partyLeaders || []);
      setSecretariatLeaders(full.secretariatLeaders || []);
      setSecretariats(full.specializedSecretariats || []);
      setSecretariatMembers(full.secretariatMembers || []);
      setInitiatives(full.initiatives || []);
      setApplications(full.applications || []);
      setMembers(full.members || []);
      setNews(full.news || []);
      setEvents(full.events || []);
      setMedia(full.media || []);
      setLiveStream(full.liveStream || {});
      setCmsPages(full.pages || []);
      setRoles(full.roles || []);
      setAdminUsers(full.admins || []);
      setAuditLogs(full.auditLogs || []);
      setSettings(full.settings || null);

      const st = await api.getAdminStats();
      setStats(st);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    }
  };

  // Permission helper to determine if current user has access to a given tab
  const isTabPermitted = (tab: typeof activeTab) => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    switch (tab) {
      case 'stats':
        return true;
      case 'party-leaders':
        return hasPermission('leaders_party');
      case 'secretariat-leaders':
        return hasPermission('leaders_secretariat');
      case 'secretariats':
      case 'secretariat-members':
        return hasPermission('secretariats');
      case 'applications':
        return hasPermission('applications');
      case 'members':
        return hasPermission('members');
      case 'cms-pages':
        return hasPermission('pages');
      case 'initiatives':
        return hasPermission('initiatives');
      case 'news':
        return hasPermission('news');
      case 'events':
        return hasPermission('events');
      case 'media':
        return hasPermission('media');
      case 'livestream':
        return hasPermission('livestream');
      case 'roles':
        return hasPermission('roles');
      case 'users':
        return hasPermission('admins');
      case 'settings':
        return hasPermission('settings');
      case 'audit':
        return hasPermission('audit');
      default:
        return false;
    }
  };

  // Auto-switch to 'stats' or first allowed tab if activeTab is not permitted
  useEffect(() => {
    if (user && !isTabPermitted(activeTab)) {
      setActiveTab('stats');
    }
  }, [user, activeTab]);

  useEffect(() => {
    if (user) {
      loadAdminData();
    }
  }, [user]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      await login(loginEmail, loginPass);
    } catch (err: any) {
      setLoginError(err.message || 'فشل تسجيل الدخول، تأكد من صحة البريد وكلمة المرور');
    } finally {
      setLoginLoading(false);
    }
  };

  // If not logged in, show secure login interface
  if (!user) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-8 shadow-xl text-right space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-red-50 text-red-700 rounded-2xl flex items-center justify-center mx-auto border border-red-200">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-black text-stone-900">
              بوابة تسجيل دخول الإدارة
            </h2>
            <p className="text-xs text-stone-500">
              حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة
            </p>
          </div>

          {loginError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl text-right">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                البريد الإلكتروني المعتمد للمدير
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-red-700 font-mono"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                كلمة المرور
              </label>
              <input
                type="password"
                required
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
                className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-red-700 font-mono"
                dir="ltr"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-red-700 hover:bg-red-800 text-white font-extrabold py-3 px-4 rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Key className="w-4 h-4 text-amber-300" />
              <span>{loginLoading ? 'جاري التحقق...' : 'تسجيل الدخول الآمن'}</span>
            </button>
          </form>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={onBackToSite}
              className="text-xs font-bold text-stone-500 hover:text-stone-900 cursor-pointer"
            >
              العودة للموقع العام
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // LOGGED IN DASHBOARD
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-stone-100/70 pb-16">
      
      {/* Top Admin Header */}
      <div className="bg-stone-900 text-white border-b-2 border-amber-600 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-red-700 text-white p-2 rounded-lg font-bold text-xs flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-amber-300" />
              <span>لوحة التحكم الإدارية</span>
            </span>
            <div className="hidden sm:block text-right">
              <span className="text-xs font-bold text-stone-200 block">
                {user.name}
              </span>
              <span className="text-[10px] text-amber-400">
                {user.role === 'super_admin' ? 'المدير الرئيسي (Super Admin)' : 'مشرف فرعي (Sub Admin)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onBackToSite}
              className="bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold px-3 py-1.5 rounded-lg border border-stone-700 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>مشاهدة الموقع العام</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={logout}
              className="bg-red-950/80 hover:bg-red-900 text-red-200 text-xs font-bold px-3 py-1.5 rounded-lg border border-red-800 transition-colors cursor-pointer flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Navigation Sidebar (3 columns) with Strict RBAC Filtering */}
          <aside className="lg:col-span-3 bg-white rounded-2xl border border-stone-200 p-4 shadow-xs space-y-1.5 text-right">
            {isTabPermitted('stats') && (
              <button
                onClick={() => setActiveTab('stats')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  activeTab === 'stats' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  <span>نظرة عامة وإحصائيات</span>
                </span>
              </button>
            )}

            {/* Leadership & Organization Group */}
            {(isTabPermitted('party-leaders') || isTabPermitted('secretariat-leaders') || isTabPermitted('secretariats') || isTabPermitted('secretariat-members')) && (
              <>
                <div className="pt-2 pb-1 text-[11px] font-bold text-stone-400 border-t border-stone-100 pr-2">
                  الهيكل القيادي والتنظيمي
                </div>

                {isTabPermitted('party-leaders') && (
                  <button
                    onClick={() => setActiveTab('party-leaders')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'party-leaders' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Award className="w-4 h-4" />
                      <span>قيادات الحزب (عامة/محافظات)</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full">{partyLeaders.length}</span>
                  </button>
                )}

                {isTabPermitted('secretariat-leaders') && (
                  <button
                    onClick={() => setActiveTab('secretariat-leaders')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'secretariat-leaders' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>قيادات أمانة قسم ثالث أكتوبر</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full">{secretariatLeaders.length}</span>
                  </button>
                )}

                {isTabPermitted('secretariats') && (
                  <button
                    onClick={() => setActiveTab('secretariats')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'secretariats' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      <span>الأمانات</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full">{secretariats.length}</span>
                  </button>
                )}

                {isTabPermitted('secretariat-members') && (
                  <button
                    onClick={() => setActiveTab('secretariat-members')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'secretariat-members' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <ArrowLeftRight className="w-4 h-4" />
                      <span>أعضاء الأمانات ونقل الأعضاء</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full">{secretariatMembers.length}</span>
                  </button>
                )}
              </>
            )}

            {/* Membership Group (Strictly Card-Free) */}
            {(isTabPermitted('applications') || isTabPermitted('members')) && (
              <>
                <div className="pt-2 pb-1 text-[11px] font-bold text-stone-400 border-t border-stone-100 pr-2">
                  العضوية والكوادر (دون كارنيهات)
                </div>

                {isTabPermitted('applications') && (
                  <button
                    onClick={() => setActiveTab('applications')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'applications' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      <span>طلبات الانضمام والمستندات</span>
                    </span>
                    {applications.filter(a => a.status === 'جديد').length > 0 && (
                      <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                        {applications.filter(a => a.status === 'جديد').length} جديد
                      </span>
                    )}
                  </button>
                )}

                {isTabPermitted('members') && (
                  <button
                    onClick={() => setActiveTab('members')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'members' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4" />
                      <span>سجل الأعضاء والتكليفات</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full">{members.length}</span>
                  </button>
                )}
              </>
            )}

            {/* Content, CMS, Media & Activities */}
            {(isTabPermitted('cms-pages') || isTabPermitted('initiatives') || isTabPermitted('news') || isTabPermitted('events') || isTabPermitted('media') || isTabPermitted('livestream')) && (
              <>
                <div className="pt-2 pb-1 text-[11px] font-bold text-stone-400 border-t border-stone-100 pr-2">
                  المحتوى والنشر والإعلام
                </div>

                {isTabPermitted('cms-pages') && (
                  <button
                    onClick={() => setActiveTab('cms-pages')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'cms-pages' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      <span>الصفحات الثابتة (CMS)</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full">{cmsPages.length}</span>
                  </button>
                )}

                {isTabPermitted('initiatives') && (
                  <button
                    onClick={() => setActiveTab('initiatives')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'initiatives' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Award className="w-4 h-4" />
                      <span>المبادرات المجتمعية</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full">{initiatives.length}</span>
                  </button>
                )}

                {isTabPermitted('news') && (
                  <button
                    onClick={() => setActiveTab('news')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'news' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Newspaper className="w-4 h-4" />
                      <span>إدارة الأخبار والبيانات</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full">{news.length}</span>
                  </button>
                )}

                {isTabPermitted('events') && (
                  <button
                    onClick={() => setActiveTab('events')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'events' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>الفعاليات والأنشطة</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full">{events.length}</span>
                  </button>
                )}

                {isTabPermitted('media') && (
                  <button
                    onClick={() => setActiveTab('media')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'media' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      <span>معرض الصور والفيديوهات</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full">{media.length}</span>
                  </button>
                )}

                {isTabPermitted('livestream') && (
                  <button
                    onClick={() => setActiveTab('livestream')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'livestream' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Radio className="w-4 h-4" />
                      <span>البث المباشر</span>
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${liveStream?.isActive ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-600'}`}>
                      {liveStream?.isActive ? 'نشط' : 'متوقف'}
                    </span>
                  </button>
                )}
              </>
            )}

            {/* System, RBAC, Settings & Audit Group */}
            {(isTabPermitted('roles') || isTabPermitted('users') || isTabPermitted('settings') || isTabPermitted('audit')) && (
              <>
                <div className="pt-2 pb-1 text-[11px] font-bold text-stone-400 border-t border-stone-100 pr-2">
                  النظام والإشراف
                </div>

                {isTabPermitted('roles') && (
                  <button
                    onClick={() => setActiveTab('roles')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'roles' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      <span>الأدوار والصلاحيات (RBAC)</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full">{roles.length}</span>
                  </button>
                )}

                {isTabPermitted('users') && (
                  <button
                    onClick={() => setActiveTab('users')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'users' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>المشرفون وحسابات الإدارة</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full">{adminUsers.length}</span>
                  </button>
                )}

                {isTabPermitted('settings') && (
                  <button
                    onClick={() => setActiveTab('settings')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'settings' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      <span>إعدادات وهوية المنصة</span>
                    </span>
                  </button>
                )}

                {isTabPermitted('audit') && (
                  <button
                    onClick={() => setActiveTab('audit')}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === 'audit' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <History className="w-4 h-4" />
                      <span>سجل العمليات (Audit Log)</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full">{auditLogs.length}</span>
                  </button>
                )}
              </>
            )}
          </aside>

          {/* Main Dashboard Canvas (9 columns) */}
          <main className="lg:col-span-9 bg-white rounded-3xl border border-stone-200 p-4 sm:p-8 shadow-xs text-right min-w-0 max-w-full overflow-x-hidden">
            
            {/* TAB: STATS OVERVIEW */}
            {activeTab === 'stats' && (
              <div className="space-y-8">
                <div className="border-b border-stone-100 pb-4">
                  <h2 className="text-2xl font-black text-stone-900">
                    لوحة الإحصائيات المركزية
                  </h2>
                  <p className="text-xs text-stone-500 mt-1">
                    موجز فوري لكافة الهياكل التنظيمية والميدانية والطلبات بأمانة قسم ثالث أكتوبر.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                    <span className="text-[11px] text-stone-500 font-bold block">قيادات الحزب</span>
                    <span className="text-2xl font-black text-red-700 tabular-nums">{stats?.partyLeadersCount || partyLeaders.length}</span>
                  </div>

                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                    <span className="text-[11px] text-stone-500 font-bold block">قيادات أمانة أكتوبر</span>
                    <span className="text-2xl font-black text-amber-700 tabular-nums">{stats?.secretariatLeadersCount || secretariatLeaders.length}</span>
                  </div>

                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                    <span className="text-[11px] text-stone-500 font-bold block">الأمانات</span>
                    <span className="text-2xl font-black text-stone-900 tabular-nums">{stats?.secretariatsCount || secretariats.length}</span>
                  </div>

                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                    <span className="text-[11px] text-stone-500 font-bold block">سجل الأعضاء المعتمدين</span>
                    <span className="text-2xl font-black text-emerald-700 tabular-nums">{stats?.membersCount || members.length}</span>
                  </div>

                  <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200">
                    <span className="text-[11px] text-amber-900 font-bold block">طلبات الانضمام الجديدة</span>
                    <span className="text-2xl font-black text-amber-700 tabular-nums">{stats?.newApplicationsCount || applications.filter(a => a.status === 'جديد').length}</span>
                  </div>

                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                    <span className="text-[11px] text-stone-500 font-bold block">الطلبات قيد المراجعة</span>
                    <span className="text-2xl font-black text-stone-700 tabular-nums">{stats?.reviewingApplicationsCount || applications.filter(a => a.status === 'قيد المراجعة').length}</span>
                  </div>

                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200">
                    <span className="text-[11px] text-emerald-900 font-bold block">الطلبات المقبولة</span>
                    <span className="text-2xl font-black text-emerald-700 tabular-nums">{stats?.acceptedApplicationsCount || applications.filter(a => a.status === 'مقبول').length}</span>
                  </div>

                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                    <span className="text-[11px] text-stone-500 font-bold block">المبادرات المجتمعية</span>
                    <span className="text-2xl font-black text-stone-900 tabular-nums">{stats?.initiativesCount || initiatives.length}</span>
                  </div>
                </div>

                <div className="bg-red-50/60 p-6 rounded-2xl border border-red-200 space-y-2">
                  <h3 className="font-extrabold text-red-950 text-sm">
                    إرشادات تشغيل المنصة واستقلاليتها:
                  </h3>
                  <ul className="text-xs text-red-900 space-y-1 list-disc list-inside">
                    <li>تم إعداد قاعدة البيانات الدائمة على خادم المنصة بدون أي اشتراكات أو تكاليف بنكية خارجية.</li>
                    <li>كافة البيانات المحفوظة والملفات والعمليات تظل دائمة ومحفوظة حتى بعد تسجيل الخروج أو إعادة تشغيل الخادم.</li>
                    <li>تم استبعاد نظام الكارنيهات والبطاقات بالكامل طبقاً لتعليماتكم.</li>
                    <li>يمكنكم إضافة قيادات الحزب وقيادات أمانة أكتوبر والأعضاء والأمانات بحرية تامة من القائمة الجانبية.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB: PARTY LEADERS */}
            {activeTab === 'party-leaders' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-stone-900">
                      إدارة قيادات الحزب (الجمهورية والمحافظات)
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      قسم مستقل لقيادات الحزب العامة وقيادات المحافظات (رئيس الحزب، النواب، الأمين العام، أمين الجيزة...).
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingPartyLeader({ level: 'national', isVisible: true, sortOrder: partyLeaders.length + 1 });
                      setShowPartyLeaderModal(true);
                    }}
                    className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة قيادة حزبية</span>
                  </button>
                </div>

                {partyLeaders.length === 0 ? (
                  <div className="p-8 text-center text-stone-500 border border-dashed border-stone-200 rounded-2xl">
                    لا توجد قيادات مسجلة حالياً. اضغط على «إضافة قيادة حزبية» لإدخال القيادات.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead>
                        <tr className="bg-stone-50 text-stone-700 font-bold border-b border-stone-200">
                          <th className="p-3">الصورة</th>
                          <th className="p-3">الاسم بالكامل</th>
                          <th className="p-3">المنصب القيادي</th>
                          <th className="p-3">المستوى القيادي</th>
                          <th className="p-3">الترتيب</th>
                          <th className="p-3">الحالة</th>
                          <th className="p-3">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {partyLeaders.map(l => (
                          <tr key={l.id} className="hover:bg-stone-50/80">
                            <td className="p-3">
                              <img src={l.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'} alt="" className="w-10 h-10 object-cover rounded-lg bg-stone-100" />
                            </td>
                            <td className="p-3 font-bold text-stone-900">{l.name}</td>
                            <td className="p-3 font-semibold text-red-700">{l.position}</td>
                            <td className="p-3">
                              <span className="font-bold text-stone-900 bg-stone-100 px-2 py-0.5 rounded text-[11px]">
                                {l.level === 'national' ? 'الهيئة العليا' : (l.level || 'غير محدد')}
                              </span>
                              {l.governorate && <span className="text-[10px] text-stone-500 mr-1">({l.governorate})</span>}
                            </td>
                            <td className="p-3 font-mono">{l.sortOrder}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${l.isVisible ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'}`}>
                                {l.isVisible ? 'ظاهر' : 'مخفي'}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setEditingPartyLeader(l);
                                    setShowPartyLeaderModal(true);
                                  }}
                                  className="text-stone-600 hover:text-red-700 p-1 cursor-pointer"
                                  title="تعديل"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={async () => {
                                    if (confirm(`هل أنت متأكد من حذف ${l.name}؟`)) {
                                      await api.deletePartyLeader(l.id);
                                      loadAdminData();
                                      onRefreshPublicData();
                                    }
                                  }}
                                  className="text-stone-400 hover:text-red-600 p-1 cursor-pointer"
                                  title="حذف"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Bottom Save & Actions Bar */}
                <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-right">
                    <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                      <Save className="w-4 h-4" />
                      <span>تأكيد واعتماد قيادات الحزب</span>
                    </h4>
                    <p className="text-[11px] text-stone-300 mt-0.5">
                      اضغط حفظ لتأكيد وتحديث كافة تعديلات قيادات الحزب في الموقع فوراً
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPartyLeader({ level: 'national', isVisible: true, sortOrder: partyLeaders.length + 1 });
                        setShowPartyLeaderModal(true);
                      }}
                      className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs px-4 py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer border border-stone-700 transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>إضافة قيادة</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await loadAdminData();
                          onRefreshPublicData();
                          alert('تم حفظ واعتماد كافة بيانات قيادات الحزب بنجاح!');
                        } catch (err: any) {
                          alert(err.message || 'حدث خطأ أثناء حفظ القيادات');
                        }
                      }}
                      className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                    >
                      <Save className="w-5 h-5 text-amber-300" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SECRETARIAT LEADERS (3rd October Giza) */}
            {activeTab === 'secretariat-leaders' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-stone-900">
                      إدارة قيادات أمانة قسم ثالث أكتوبر
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      خاص بأمانة قسم ثالث أكتوبر بمحافظة الجيزة فقط. مسميات وظيفية فعلية (أمين إعلام، أمين تنظيم، أمين تكنولوجيا...).
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingSecLeader({ isVisible: true, sortOrder: secretariatLeaders.length + 1 });
                      setShowSecLeaderModal(true);
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة قيادة بأمانة أكتوبر</span>
                  </button>
                </div>

                {secretariatLeaders.length === 0 ? (
                  <div className="p-8 text-center text-stone-500 border border-dashed border-stone-200 rounded-2xl">
                    لا توجد قيادات مسجلة حالياً لأمانة أكتوبر. اضغط على «إضافة قيادة بأمانة أكتوبر» لإدخال البيانات.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead>
                        <tr className="bg-stone-50 text-stone-700 font-bold border-b border-stone-200">
                          <th className="p-3">الصورة</th>
                          <th className="p-3">الاسم بالكامل</th>
                          <th className="p-3">المسمى الوظيفي الفعلي</th>
                          <th className="p-3">تاريخ المسؤولية</th>
                          <th className="p-3">الترتيب</th>
                          <th className="p-3">الحالة</th>
                          <th className="p-3">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {secretariatLeaders.map(l => (
                          <tr key={l.id} className="hover:bg-stone-50/80">
                            <td className="p-3">
                              <img src={l.photoUrl || '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'} alt="" className="w-10 h-10 object-cover rounded-lg bg-stone-100" />
                            </td>
                            <td className="p-3 font-bold text-stone-900">{l.name}</td>
                            <td className="p-3 font-bold text-red-700">{l.title}</td>
                            <td className="p-3 font-mono">{l.appointmentDate}</td>
                            <td className="p-3 font-mono">{l.sortOrder}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${l.isVisible ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'}`}>
                                {l.isVisible ? 'ظاهر' : 'مخفي'}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setEditingSecLeader(l);
                                    setShowSecLeaderModal(true);
                                  }}
                                  className="text-stone-600 hover:text-amber-700 p-1 cursor-pointer"
                                  title="تعديل"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={async () => {
                                    if (confirm(`هل أنت متأكد من حذف ${l.name}؟`)) {
                                      await api.deleteSecretariatLeader(l.id);
                                      loadAdminData();
                                      onRefreshPublicData();
                                    }
                                  }}
                                  className="text-stone-400 hover:text-red-600 p-1 cursor-pointer"
                                  title="حذف"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Bottom Save & Actions Bar */}
                <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-right">
                    <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                      <Save className="w-4 h-4" />
                      <span>تأكيد واعتماد قيادات أمانة أكتوبر</span>
                    </h4>
                    <p className="text-[11px] text-stone-300 mt-0.5">
                      اضغط حفظ لتأكيد وتحديث قيادات أمانة قسم ثالث أكتوبر في المنصة فوراً
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSecLeader({ isVisible: true, sortOrder: secretariatLeaders.length + 1 });
                        setShowSecLeaderModal(true);
                      }}
                      className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs px-4 py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer border border-stone-700 transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>إضافة قيادة بالأمانة</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await loadAdminData();
                          onRefreshPublicData();
                          alert('تم حفظ واعتماد قيادات أمانة قسم ثالث أكتوبر بنجاح!');
                        } catch (err: any) {
                          alert(err.message || 'حدث خطأ أثناء حفظ القيادات');
                        }
                      }}
                      className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                    >
                      <Save className="w-5 h-5 text-amber-300" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SPECIALIZED SECRETARIATS */}
            {activeTab === 'secretariats' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black text-stone-900">
                        إدارة الأمانات التخصصية
                      </h2>
                      <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                        <Save className="w-3.5 h-3.5" />
                        <span>حفظ دائم وتلقائي</span>
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">
                      تعديل أسماء الأمانات، تعيين الأمين والأمين المساعد، ضبط المهام والأهداف، حذف أمانة، أو إضافة أمانات جديدة. كافة التعديلات تُحفظ فورياً بقاعدة البيانات.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingSecretariat({ isActive: true, sortOrder: secretariats.length + 1, duties: [], goals: [] });
                      setShowSecretariatModal(true);
                    }}
                    className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة أمانة جديدة</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {secretariats.map(sec => {
                    const secBureauMembers = secretariatMembers.filter(
                      m => m.secretariatId === sec.id && m.tier !== 'secretary' && m.tier !== 'assistant_secretary'
                    );

                    return (
                      <div key={sec.id} className="border border-stone-200 rounded-3xl p-6 bg-stone-50/60 shadow-xs space-y-4 flex flex-col justify-between">
                        <div>
                          {/* Card Header */}
                          <div className="flex items-start justify-between border-b border-stone-200 pb-3">
                            <div>
                              <h3 className="font-black text-stone-900 text-lg">{sec.name}</h3>
                              <span className="text-[11px] text-stone-400 font-mono">الرابط: /secretariats/{sec.slug}</span>
                            </div>
                            <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${sec.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                              {sec.isActive ? 'مفعلة' : 'معطلة'}
                            </span>
                          </div>

                          {/* Leadership: Secretary & Assistant Secretary with Photos */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                            {/* Secretary */}
                            <div className="bg-white p-3.5 rounded-2xl border border-stone-200 flex items-center gap-3">
                              {sec.secretaryPhotoUrl ? (
                                <img
                                  src={sec.secretaryPhotoUrl}
                                  alt={sec.secretaryName || 'أمين الأمانة'}
                                  className="w-12 h-12 rounded-full object-cover border-2 border-red-600 bg-stone-100 shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-red-50 text-red-700 flex items-center justify-center font-bold text-xs border border-red-200 shrink-0">
                                  أمين
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <span className="text-[10px] text-red-700 font-black block">أمين الأمانة:</span>
                                <h4 className="font-bold text-stone-900 text-xs truncate">
                                  {sec.secretaryName || 'غير معين'}
                                </h4>
                                {sec.secretaryPhone && (
                                  <span className="text-[10px] text-stone-500 font-mono block truncate" dir="ltr">
                                    {sec.secretaryPhone}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Assistant Secretary */}
                            <div className="bg-white p-3.5 rounded-2xl border border-stone-200 flex items-center gap-3">
                              {sec.assistantSecretaryPhotoUrl ? (
                                <img
                                  src={sec.assistantSecretaryPhotoUrl}
                                  alt={sec.assistantSecretaryName || 'الأمين المساعد'}
                                  className="w-12 h-12 rounded-full object-cover border-2 border-amber-500 bg-stone-100 shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-xs border border-amber-200 shrink-0">
                                  مساعد
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <span className="text-[10px] text-amber-700 font-black block">الأمين المساعد:</span>
                                <h4 className="font-bold text-stone-900 text-xs truncate">
                                  {sec.assistantSecretaryName || 'غير معين'}
                                </h4>
                                {sec.assistantSecretaryPhone && (
                                  <span className="text-[10px] text-stone-500 font-mono block truncate" dir="ltr">
                                    {sec.assistantSecretaryPhone}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Bureau Members Section for this Secretariat */}
                          <div className="mt-4 bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                              <div className="flex items-center gap-1.5">
                                <Users className="w-4 h-4 text-amber-600" />
                                <span className="text-xs font-black text-stone-900">
                                  هيئة مكتب الأمانة ({secBureauMembers.length} كادر)
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSecMember({
                                    secretariatId: sec.id,
                                    tier: 'bureau',
                                    role: 'عضو هيئة مكتب',
                                    bureauTitle: '',
                                    assignmentDate: new Date().toISOString().substring(0, 10)
                                  });
                                  setShowSecMemberModal(true);
                                }}
                                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer shadow-xs transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>إضافة عضو هيئة مكتب</span>
                              </button>
                            </div>

                            {secBureauMembers.length === 0 ? (
                              <p className="text-[11px] text-stone-400 text-center py-2">
                                لم يتم إضافة أعضاء هيئة مكتب لهذه الأمانة بعد. اضغط على الزر أعلاه لإضافة كادر بالاسم والصورة والبيانات.
                              </p>
                            ) : (
                              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {secBureauMembers.map(member => (
                                  <div
                                    key={member.id}
                                    className="flex items-center justify-between p-2 rounded-xl bg-stone-50 border border-stone-200 hover:border-amber-400 transition-colors text-xs"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      {member.photoUrl ? (
                                        <img
                                          src={member.photoUrl}
                                          alt={member.name}
                                          className="w-8 h-8 rounded-full object-cover border border-amber-400 shrink-0 bg-stone-200"
                                          referrerPolicy="no-referrer"
                                        />
                                      ) : (
                                        <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                                          {member.name.substring(0, 1)}
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <div className="font-bold text-stone-900 truncate">{member.name}</div>
                                        <div className="text-[10px] text-amber-700 font-semibold truncate">
                                          {member.bureauTitle || member.role}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingSecMember({ ...member });
                                          setShowSecMemberModal(true);
                                        }}
                                        className="p-1 text-stone-500 hover:text-stone-900 cursor-pointer"
                                        title="تعديل بيانات العضو"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          if (confirm(`هل أنت متأكد من حذف عضو هيئة المكتب: ${member.name}؟`)) {
                                            await api.deleteSecretariatMember(member.id);
                                            loadAdminData();
                                            onRefreshPublicData();
                                          }
                                        }}
                                        className="p-1 text-stone-400 hover:text-red-600 cursor-pointer"
                                        title="حذف العضو"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Card Footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-stone-200 text-xs mt-3">
                          <span className="text-stone-500">{sec.duties?.length || 0} مهام · {sec.goals?.length || 0} أهداف</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingSecretariat(sec);
                                setShowSecretariatModal(true);
                              }}
                              className="bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer flex items-center gap-1.5 transition-colors shadow-xs"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>تعديل وحفظ الأمانة</span>
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm(`هل أنت متأكد من رغبتك في شيل (حذف) أمانة "${sec.name}" نهائياً من الموقع؟`)) {
                                  try {
                                    await api.deleteSecretariat(sec.id);
                                    await loadAdminData();
                                    onRefreshPublicData();
                                    alert(`تم شيل أمانة "${sec.name}" بنجاح!`);
                                  } catch (err: any) {
                                    alert(err.message || 'تعذر شيل الأمانة');
                                  }
                                }
                              }}
                              className="bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 border border-red-200 px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer flex items-center gap-1 transition-colors"
                              title="شيل الأمانة نهائياً من الموقع"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>شيل الأمانة</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* END OF PAGE SAVE & ACTIONS BAR */}
                <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 text-white p-6 rounded-3xl shadow-xl border-2 border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-5 mt-8">
                  <div className="text-right space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-emerald-500/20 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>جاهز للحفظ</span>
                      </span>
                      <h3 className="text-lg font-black text-white">
                        حفظ حالة الأمانات التخصصية
                      </h3>
                    </div>
                    <p className="text-xs text-stone-300">
                      يمكنك شيل أي أمانة أو إضافة أمانة جديدة بكل سهولة، ومن آخر الصفحة اضغط «حفظ» لتأكيد وحفظ التغييرات بقاعدة البيانات.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSecretariat({ isActive: true, sortOrder: secretariats.length + 1, duties: [], goals: [] });
                        setShowSecretariatModal(true);
                      }}
                      className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs px-4 py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer border border-stone-700 transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>إضافة أمانة</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await api.saveAllSecretariats(secretariats);
                          await loadAdminData();
                          onRefreshPublicData();
                          alert('تم حفظ كافة بيانات وتعديلات الأمانات بنجاح!');
                        } catch (err: any) {
                          alert(err.message || 'حدث خطأ أثناء حفظ الأمانات');
                        }
                      }}
                      className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                    >
                      <Save className="w-5 h-5 text-amber-300" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}


            {/* TAB: SECRETARIAT MEMBERS & TRANSFERS */}
            {activeTab === 'secretariat-members' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
                      <Users className="w-5 h-5 text-red-700" />
                      <span>تشكيلات الأمانات وهيئات المكاتب</span>
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      إدارة وتوثيق أعضاء هيئات المكاتب والأمناء المساعدين وأعضاء اللجان مع الصور الشخصية والمسميات التنظيمية.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setEditingSecMember({
                        secretariatId: secretariats[0]?.id || '',
                        tier: 'bureau',
                        role: 'عضو هيئة مكتب',
                        bureauTitle: 'مقرر هيئة المكتب',
                        assignmentDate: new Date().toISOString().substring(0, 10)
                      });
                      setShowSecMemberModal(true);
                    }}
                    className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة عضو أو مسؤول هيئة مكتب</span>
                  </button>
                </div>

                {secretariatMembers.length === 0 ? (
                  <div className="p-8 text-center text-stone-500 border border-dashed border-stone-200 rounded-2xl space-y-3">
                    <Users className="w-10 h-10 text-stone-300 mx-auto" />
                    <p>لم يُضف أعضاء للأمانات بعد. يمكنك إضافة أعضاء وهيئات مكاتب أو تكليفهم مباشرة من طلبات الانضمام المقبولة.</p>
                    <button
                      onClick={() => {
                        setEditingSecMember({
                          secretariatId: secretariats[0]?.id || '',
                          tier: 'bureau',
                          role: 'عضو هيئة مكتب',
                          bureauTitle: 'مقرر هيئة المكتب',
                          assignmentDate: new Date().toISOString().substring(0, 10)
                        });
                        setShowSecMemberModal(true);
                      }}
                      className="bg-red-700 text-white font-bold text-xs px-4 py-2 rounded-xl cursor-pointer"
                    >
                      إضافة أول كادر الآن
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead>
                        <tr className="bg-stone-50 text-stone-700 font-bold border-b border-stone-200">
                          <th className="p-3">الصورة</th>
                          <th className="p-3">الاسم بالكامل</th>
                          <th className="p-3">الأمانة</th>
                          <th className="p-3">المستوى التنظيمي</th>
                          <th className="p-3">المسمى / المسؤولية</th>
                          <th className="p-3">الهاتف</th>
                          <th className="p-3">تاريخ التكليف</th>
                          <th className="p-3">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {secretariatMembers.map(m => {
                          const sec = secretariats.find(s => s.id === m.secretariatId);
                          const tierLabels: Record<string, { label: string; color: string }> = {
                            secretary: { label: 'أمين الأمانة', color: 'bg-red-100 text-red-900 border border-red-300 font-black' },
                            assistant_secretary: { label: 'أمين مساعد الأمانة', color: 'bg-amber-100 text-amber-900 border border-amber-300 font-bold' },
                            bureau: { label: 'عضو هيئة مكتب', color: 'bg-yellow-50 text-yellow-900 border border-yellow-300 font-bold' },
                            member: { label: 'عضو أمانة', color: 'bg-stone-100 text-stone-800 border border-stone-200' }
                          };
                          const currentTier = tierLabels[m.tier || 'member'] || tierLabels.member;

                          return (
                            <tr key={m.id} className="hover:bg-stone-50 transition-colors">
                              <td className="p-3">
                                {m.photoUrl ? (
                                  <img
                                    src={m.photoUrl}
                                    alt={m.name}
                                    className="w-10 h-10 rounded-full object-cover border border-amber-400 shadow-xs bg-stone-100"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center font-bold text-xs border border-stone-300">
                                    {m.name.substring(0, 1)}
                                  </div>
                                )}
                              </td>
                              <td className="p-3 font-bold text-stone-900">{m.name}</td>
                              <td className="p-3 text-red-700 font-semibold">{sec?.name || 'غير محدد'}</td>
                              <td className="p-3">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full inline-block ${currentTier.color}`}>
                                  {currentTier.label}
                                </span>
                              </td>
                              <td className="p-3 font-medium text-stone-800">
                                {m.bureauTitle || m.role}
                              </td>
                              <td className="p-3 font-mono text-stone-600" dir="ltr">{m.phone || '-'}</td>
                              <td className="p-3 font-mono text-stone-500">{m.assignmentDate}</td>
                              <td className="p-3">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setEditingSecMember({ ...m });
                                      setShowSecMemberModal(true);
                                    }}
                                    className="bg-stone-100 hover:bg-stone-200 text-stone-800 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer flex items-center gap-1"
                                    title="تعديل بيانات العضو والصورة"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    <span>تعديل</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setTransferringMember(m);
                                      setTransferForm({ targetSecretariatId: '', newRole: m.role, notes: '' });
                                    }}
                                    className="bg-amber-100 hover:bg-amber-200 text-amber-900 px-2 py-1 rounded text-[11px] font-bold cursor-pointer flex items-center gap-1"
                                    title="نقل لأمانة أخرى"
                                  >
                                    <ArrowLeftRight className="w-3 h-3" />
                                    <span>نقل</span>
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (confirm(`هل تريد إزالة ${m.name} من تشكيل الأمانة مع الإبقاء على ملفه بالسجل؟`)) {
                                        await api.deleteSecretariatMember(m.id);
                                        loadAdminData();
                                        onRefreshPublicData();
                                      }
                                    }}
                                    className="text-stone-400 hover:text-red-600 p-1 cursor-pointer"
                                    title="إزالة من الأمانة"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Bottom Save & Actions Bar */}
                <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-right">
                    <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                      <Save className="w-4 h-4" />
                      <span>تأكيد واعتماد أعضاء وهيئات المكاتب</span>
                    </h4>
                    <p className="text-[11px] text-stone-300 mt-0.5">
                      اضغط حفظ لتأكيد وتحديث هيئات المكاتب وتكليفات الأعضاء بالأمانات
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSecMember({
                          secretariatId: secretariats[0]?.id || '',
                          role: 'member',
                          assignmentDate: new Date().toISOString().split('T')[0]
                        });
                        setShowSecMemberModal(true);
                      }}
                      className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs px-4 py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer border border-stone-700 transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>تعيين كادر</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await loadAdminData();
                          onRefreshPublicData();
                          alert('تم حفظ واعتماد كافة تكليفات وأعضاء الأمانات بنجاح!');
                        } catch (err: any) {
                          alert(err.message || 'حدث خطأ أثناء حفظ الأعضاء');
                        }
                      }}
                      className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                    >
                      <Save className="w-5 h-5 text-amber-300" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: MEMBERSHIP APPLICATIONS */}
            {activeTab === 'applications' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-stone-900">
                      طلبات الانضمام والعضوية الإلكترونية
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      فحص ومراجعة كافة الطلبات والمستندات، وتصدير شيت إكسل كامل ببيانات المتقدمين وقبول/رفض الطلبات وتعيين الكوادر.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const listToExport = applications.filter(a => {
                          if (appStatusFilter && a.status !== appStatusFilter) return false;
                          if (appSearch) {
                            const q = appSearch.toLowerCase();
                            return (
                              a.fullName.toLowerCase().includes(q) ||
                              a.nationalId.includes(q) ||
                              a.phone.includes(q) ||
                              a.applicationNumber.toLowerCase().includes(q)
                            );
                          }
                          return true;
                        });

                        if (listToExport.length === 0) {
                          alert('لا توجد طلبات لتصديرها وفق خيارات الفلترة المحددة.');
                          return;
                        }

                        const esc = (val: any) => {
                          const s = String(val ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
                          return `"${s}"`;
                        };

                        const headers = [
                          'رقم الطلب',
                          'الاسم بالكامل',
                          'الرقم القومي',
                          'تاريخ الميلاد',
                          'النوع',
                          'الحالة الاجتماعية',
                          'المحافظة',
                          'القسم / المركز',
                          'العنوان التفصيلي',
                          'رقم الهاتف',
                          'رقم الواتساب',
                          'البريد الإلكتروني',
                          'المؤهل الدراسي',
                          'الوظيفة الحالية',
                          'جهة العمل',
                          'المهارات والاهتمامات',
                          'العمل التطوعي والسياسي السابق',
                          'سبب الرغبة في الانضمام',
                          'حالة الطلب',
                          'تاريخ التقديم',
                          'ملاحظات الفحص الداخلي',
                          'المشرف المراجع'
                        ];

                        const rows = listToExport.map(a => [
                          esc(a.applicationNumber),
                          esc(a.fullName),
                          esc(`'${a.nationalId}`),
                          esc(a.dateOfBirth),
                          esc(a.gender),
                          esc(a.maritalStatus),
                          esc(a.governorate),
                          esc(a.district),
                          esc(a.address),
                          esc(`'${a.phone}`),
                          esc(`'${a.whatsapp}`),
                          esc(a.email),
                          esc(a.qualification),
                          esc(a.job),
                          esc(a.workplace),
                          esc(a.skills),
                          esc(a.volunteerExperience),
                          esc(a.reasonForJoining),
                          esc(a.status),
                          esc(a.createdAt ? a.createdAt.replace('T', ' ').substring(0, 19) : ''),
                          esc(a.internalNotes),
                          esc(a.reviewedBy || '')
                        ].join(','));

                        const csvContent = '\uFEFF' + [headers.map(h => `"${h}"`).join(','), ...rows].join('\r\n');
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        const dateStr = new Date().toISOString().slice(0, 10);
                        link.setAttribute('download', `طلبات_عضوية_حزب_الجبهة_الوطنية_قسم_ثالث_أكتوبر_${dateStr}.csv`);
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                      }}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
                      title="تحميل شيت إكسل كامل لكافة بيانات المتقدمين دون الحاجة لطباعة أو أخذ لقطة شاشة"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                      <span>تصدير شيت إكسل Excel</span>
                    </button>
                  </div>
                </div>

                {/* Search & Filter */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 relative">
                    <input
                      type="text"
                      placeholder="البحث بالاسم، الرقم القومي، الهاتف، أو رقم المتابعة..."
                      value={appSearch}
                      onChange={e => setAppSearch(e.target.value)}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs text-stone-900 pr-9 focus:outline-hidden focus:border-red-700"
                    />
                    <Search className="w-4 h-4 text-stone-400 absolute right-3 top-2.5" />
                  </div>

                  <div>
                    <select
                      value={appStatusFilter}
                      onChange={e => setAppStatusFilter(e.target.value)}
                      className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 focus:outline-hidden"
                    >
                      <option value="">كافة الحالات ({applications.length})</option>
                      <option value="جديد">جديد</option>
                      <option value="قيد المراجعة">قيد المراجعة</option>
                      <option value="مطلوب استكمال">مطلوب استكمال</option>
                      <option value="مقبول">مقبول</option>
                      <option value="مرفوض">مرفوض</option>
                    </select>
                  </div>
                </div>

                {/* Applications Table */}
                {applications.length === 0 ? (
                  <div className="p-8 text-center text-stone-500 border border-dashed border-stone-200 rounded-2xl">
                    لا توجد طلبات انضمام مقدمة حتى الآن.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead>
                        <tr className="bg-stone-50 text-stone-700 font-bold border-b border-stone-200">
                          <th className="p-3">رقم الطلب</th>
                          <th className="p-3">الاسم الرباعي</th>
                          <th className="p-3">الرقم القومي</th>
                          <th className="p-3">الهاتف</th>
                          <th className="p-3">الوظيفة</th>
                          <th className="p-3">تاريخ التقديم</th>
                          <th className="p-3">الحالة</th>
                          <th className="p-3">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {applications
                          .filter(a => {
                            if (appStatusFilter && a.status !== appStatusFilter) return false;
                            if (appSearch) {
                              const s = appSearch.toLowerCase();
                              return a.fullName.toLowerCase().includes(s) || a.nationalId.includes(s) || a.phone.includes(s) || a.applicationNumber.toLowerCase().includes(s);
                            }
                            return true;
                          })
                          .map(app => (
                            <tr key={app.id} className="hover:bg-stone-50">
                              <td className="p-3 font-mono font-bold text-red-700">{app.applicationNumber}</td>
                              <td className="p-3 font-bold text-stone-900">{app.fullName}</td>
                              <td className="p-3 font-mono">{app.nationalId}</td>
                              <td className="p-3 font-mono">{app.phone}</td>
                              <td className="p-3">{app.job || '-'}</td>
                              <td className="p-3 font-mono text-[11px] text-stone-500">{app.createdAt.split('T')[0]}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  app.status === 'جديد'
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : (app.status === 'مقبول'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : (app.status === 'مرفوض' ? 'bg-red-100 text-red-800' : 'bg-stone-100 text-stone-700'))
                                }`}>
                                  {app.status}
                                </span>
                              </td>
                              <td className="p-3">
                                <button
                                  onClick={() => setSelectedApp(app)}
                                  className="bg-stone-900 hover:bg-stone-800 text-white px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
                                >
                                  فحص ومراجعة
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Bottom Save & Actions Bar */}
                <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-right">
                    <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                      <Save className="w-4 h-4" />
                      <span>تأكيد واعتماد مراجعة طلبات الانضمام</span>
                    </h4>
                    <p className="text-[11px] text-stone-300 mt-0.5">
                      اضغط حفظ لتأكيد مراجعة الطلبات والقرارات الصادرة وحفظ التغييرات
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await loadAdminData();
                          onRefreshPublicData();
                          alert('تم حفظ واعتماد سجل طلبات الانضمام بنجاح!');
                        } catch (err: any) {
                          alert(err.message || 'حدث خطأ أثناء حفظ الطلبات');
                        }
                      }}
                      className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                    >
                      <Save className="w-5 h-5 text-amber-300" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: CENTRAL MEMBERS REGISTRY */}
            {activeTab === 'members' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-stone-900">
                      سجل أعضاء الحزب والتكليفات التنظيمية
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      سجل مركزي معتمد للكوادر المقبولة مع حفظ السجل التاريخي للتكليفات السابقة. (ملحوظة: لا يوجد أي نظام كارنيهات).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (members.length === 0) {
                        alert('لا يوجد أعضاء في السجل بعد.');
                        return;
                      }

                      const esc = (val: any) => {
                        const s = String(val ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
                        return `"${s}"`;
                      };

                      const headers = [
                        'الاسم الرباعي',
                        'الرقم القومي',
                        'الهاتف',
                        'البريد الإلكتروني',
                        'المحافظة',
                        'القسم',
                        'الأمانة المسكن بها',
                        'المسمى التنظيمي',
                        'حالة التكليف',
                        'تاريخ الانضمام'
                      ];

                      const rows = members.map(m => {
                        const sec = secretariats.find(s => s.id === m.secretariatId);
                        return [
                          esc(m.fullName),
                          esc(`'${m.nationalId}`),
                          esc(`'${m.phone}`),
                          esc(m.email),
                          esc(m.governorate),
                          esc(m.district),
                          esc(sec ? sec.name : 'غير مسكن'),
                          esc(m.title),
                          esc(m.assignmentStatus),
                          esc(m.joinedAt ? m.joinedAt.replace('T', ' ').substring(0, 10) : '')
                        ].join(',');
                      });

                      const csvContent = '\uFEFF' + [headers.map(h => `"${h}"`).join(','), ...rows].join('\r\n');
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      const dateStr = new Date().toISOString().slice(0, 10);
                      link.setAttribute('download', `سجل_أعضاء_حزب_الجبهة_الوطنية_${dateStr}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                    }}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                    <span>تصدير السجل إلى Excel</span>
                  </button>
                </div>

                {members.length === 0 ? (
                  <div className="p-8 text-center text-stone-500 border border-dashed border-stone-200 rounded-2xl">
                    لا يوجد أعضاء في السجل بعد. يمكنك قبول طلبات الانضمام وتحويلها مباشرة إلى السجل المركزي.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead>
                        <tr className="bg-stone-50 text-stone-700 font-bold border-b border-stone-200">
                          <th className="p-3">الاسم</th>
                          <th className="p-3">الرقم القومي</th>
                          <th className="p-3">الهاتف</th>
                          <th className="p-3">الأمانة</th>
                          <th className="p-3">المسمى التنظيمي</th>
                          <th className="p-3">حالة التكليف</th>
                          <th className="p-3">تاريخ الانضمام</th>
                          <th className="p-3">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {members.map(m => {
                          const sec = secretariats.find(s => s.id === m.secretariatId);
                          return (
                            <tr key={m.id} className="hover:bg-stone-50">
                              <td className="p-3 font-bold text-stone-900">{m.fullName}</td>
                              <td className="p-3 font-mono">{m.nationalId}</td>
                              <td className="p-3 font-mono">{m.phone}</td>
                              <td className="p-3 font-semibold text-red-700">{sec?.name || 'أمانة قسم ثالث أكتوبر'}</td>
                              <td className="p-3 font-medium text-stone-800">{m.title}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${m.assignmentStatus === 'نشط' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'}`}>
                                  {m.assignmentStatus}
                                </span>
                              </td>
                              <td className="p-3 font-mono text-stone-500">{m.joinedAt}</td>
                              <td className="p-3">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setAssigningMember(m);
                                      setAssignmentForm({ title: m.title, secretariatId: m.secretariatId || '', notes: '' });
                                    }}
                                    className="bg-amber-100 hover:bg-amber-200 text-amber-900 px-2 py-1 rounded text-[10px] font-bold cursor-pointer"
                                  >
                                    تغيير تكليف
                                  </button>
                                  {m.assignmentStatus === 'نشط' && (
                                    <button
                                      onClick={async () => {
                                        if (confirm(`هل أنت متأكد من إنهاء التكليف الحالي لـ ${m.fullName} مع بقاء بياناته وسجله التاريخي محفوظة؟`)) {
                                          await api.endMemberAssignment(m.id);
                                          loadAdminData();
                                          onRefreshPublicData();
                                        }
                                      }}
                                      className="text-stone-400 hover:text-red-700 text-[10px] p-1 font-bold cursor-pointer"
                                    >
                                      إنهاء
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Bottom Save & Actions Bar */}
                <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-right">
                    <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                      <Save className="w-4 h-4" />
                      <span>تأكيد واعتماد السجل المركزي للأعضاء والتكليفات</span>
                    </h4>
                    <p className="text-[11px] text-stone-300 mt-0.5">
                      اضغط حفظ لتأكيد وتحديث سجل الأعضاء والتكليفات التنظيمية النشطة والمنتهية
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await loadAdminData();
                          onRefreshPublicData();
                          alert('تم حفظ واعتماد السجل المركزي للأعضاء بنجاح!');
                        } catch (err: any) {
                          alert(err.message || 'حدث خطأ أثناء حفظ سجل الأعضاء');
                        }
                      }}
                      className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                    >
                      <Save className="w-5 h-5 text-amber-300" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: INITIATIVES */}
            {activeTab === 'initiatives' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-stone-900">
                      إدارة المبادرات المجتمعية
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      إضافة مبادرات ميدانية، أهدافها، سجل أنشطتها، وحالتها (نشطة/متوقفة/مكتملة).
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingInitiative({ status: 'active', isVisible: true, goals: [], activities: [] });
                      setShowInitiativeModal(true);
                    }}
                    className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة مبادرة جديدة</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {initiatives.map(init => (
                    <div key={init.id} className="border border-stone-200 rounded-2xl p-5 bg-stone-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${init.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'}`}>
                            {init.status === 'active' ? 'نشطة' : 'غير نشطة'}
                          </span>
                          <h3 className="font-extrabold text-stone-900 text-base">{init.title}</h3>
                        </div>
                        <p className="text-xs text-stone-600 line-clamp-2 max-w-xl">{init.description}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setEditingInitiative(init);
                            setShowInitiativeModal(true);
                          }}
                          className="bg-stone-200 hover:bg-stone-300 text-stone-800 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`هل تريد حذف مبادرة: ${init.title}؟`)) {
                              await api.deleteInitiative(init.id);
                              loadAdminData();
                              onRefreshPublicData();
                            }
                          }}
                          className="text-stone-400 hover:text-red-700 p-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Save & Actions Bar */}
                <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-right">
                    <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                      <Save className="w-4 h-4" />
                      <span>تأكيد واعتماد المبادرات الميدانية والمجتمعية</span>
                    </h4>
                    <p className="text-[11px] text-stone-300 mt-0.5">
                      اضغط حفظ لتأكيد وحفظ كافة التعديلات والتحديثات للمبادرات التنموية فوراً
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingInitiative({ status: 'active', isVisible: true, goals: [], activities: [] });
                        setShowInitiativeModal(true);
                      }}
                      className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs px-4 py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer border border-stone-700 transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>إضافة مبادرة جديدة</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await loadAdminData();
                          onRefreshPublicData();
                          alert('تم حفظ واعتماد كافة المبادرات بنجاح!');
                        } catch (err: any) {
                          alert(err.message || 'حدث خطأ أثناء حفظ المبادرات');
                        }
                      }}
                      className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                    >
                      <Save className="w-5 h-5 text-amber-300" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: NEWS */}
            {activeTab === 'news' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-stone-900">
                      إدارة الأخبار والبيانات الصحفية
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      نشر أخبار الأمانة، البيانات الرسمية، وتحديد الأخبار المميزة أو المسودات.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingNews({ publishDate: new Date().toISOString().split('T')[0], isFeatured: false, isDraft: false });
                      setShowNewsModal(true);
                    }}
                    className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة خبر جديد</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {news.map(item => (
                    <div key={item.id} className="border border-stone-200 rounded-2xl p-4 bg-stone-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <img src={item.coverImage || settings?.officialLogo} alt="" className="w-16 h-16 object-cover rounded-xl bg-stone-100 shrink-0" />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {item.isUrgent && (
                              <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 animate-pulse shadow-xs">
                                <span>⚡ عاجل</span>
                              </span>
                            )}
                            {item.isFeatured && <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded">مميز</span>}
                            {item.isDraft && <span className="bg-stone-200 text-stone-700 text-[10px] font-bold px-1.5 py-0.5 rounded">مسودة</span>}
                            <span className="text-[11px] text-stone-400 font-mono">{item.publishDate}</span>
                          </div>
                          <h3 className="font-bold text-stone-900 text-sm mt-0.5 line-clamp-1">{item.title}</h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Quick Toggle Urgent */}
                        <button
                          type="button"
                          onClick={async () => {
                            const newUrgent = !item.isUrgent;
                            await api.updateNews(item.id, { ...item, isUrgent: newUrgent });
                            loadAdminData();
                            onRefreshPublicData();
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors border ${
                            item.isUrgent
                              ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                              : 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200'
                          }`}
                          title={item.isUrgent ? 'إلغاء وسم عاجل' : 'تحديد كخبر عاجل'}
                        >
                          {item.isUrgent ? '⚡ إلغاء العاجل' : '⚡ تعيين كعاجل'}
                        </button>

                        <button
                          onClick={() => {
                            setEditingNews(item);
                            setShowNewsModal(true);
                          }}
                          className="bg-stone-200 hover:bg-stone-300 text-stone-800 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`هل تريد حذف خبر: ${item.title}؟`)) {
                              await api.deleteNews(item.id);
                              loadAdminData();
                              onRefreshPublicData();
                            }
                          }}
                          className="text-stone-400 hover:text-red-700 p-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Save & Actions Bar */}
                <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-right">
                    <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                      <Save className="w-4 h-4" />
                      <span>تأكيد واعتماد نشر الأخبار والبيانات الرسمية</span>
                    </h4>
                    <p className="text-[11px] text-stone-300 mt-0.5">
                      اضغط حفظ لتأكيد ونشر كافة التعديلات والتحديثات الإخبارية على المنصة فوراً
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNews({ publishDate: new Date().toISOString().split('T')[0], isFeatured: false, isDraft: false, isUrgent: false });
                        setShowNewsModal(true);
                      }}
                      className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs px-4 py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer border border-stone-700 transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>إضافة خبر جديد</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await loadAdminData();
                          onRefreshPublicData();
                          alert('تم حفظ واعتماد كافة الأخبار والبيانات بنجاح!');
                        } catch (err: any) {
                          alert(err.message || 'حدث خطأ أثناء حفظ الأخبار');
                        }
                      }}
                      className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                    >
                      <Save className="w-5 h-5 text-amber-300" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: EVENTS */}
            {activeTab === 'events' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-stone-900">
                      إدارة الفعاليات والأنشطة
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      جدولة المؤتمرات، القوافل، ورش العمل وتوثيق تقارير ما بعد الفعالية.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingEvent({ status: 'upcoming', isVisible: true, dateTime: new Date().toISOString().substring(0, 16) });
                      setShowEventModal(true);
                    }}
                    className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة فعالية جديدة</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {events.map(ev => (
                    <div key={ev.id} className="border border-stone-200 rounded-2xl p-4 bg-stone-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900">
                            {ev.status === 'upcoming' ? 'قادمة' : 'منتهية'}
                          </span>
                          <span className="text-xs font-mono text-stone-500">{ev.dateTime.replace('T', ' ')}</span>
                        </div>
                        <h3 className="font-bold text-stone-900 text-sm mt-1">{ev.title}</h3>
                        <p className="text-xs text-stone-500 mt-0.5">المكان: {ev.venue} · المنظم: {ev.organizer}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setEditingEvent(ev);
                            setShowEventModal(true);
                          }}
                          className="bg-stone-200 hover:bg-stone-300 text-stone-800 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`حذف فعالية: ${ev.title}؟`)) {
                              await api.deleteEvent(ev.id);
                              loadAdminData();
                              onRefreshPublicData();
                            }
                          }}
                          className="text-stone-400 hover:text-red-700 p-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Save & Actions Bar */}
                <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-right">
                    <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                      <Save className="w-4 h-4" />
                      <span>تأكيد واعتماد الأجندة والفعاليات الحزبية</span>
                    </h4>
                    <p className="text-[11px] text-stone-300 mt-0.5">
                      اضغط حفظ لتأكيد وحفظ جدول الأنشطة والفعاليات الميدانية على الموقع
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEvent({ status: 'upcoming', isVisible: true, dateTime: new Date().toISOString().substring(0, 16) });
                        setShowEventModal(true);
                      }}
                      className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs px-4 py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer border border-stone-700 transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>إضافة فعالية جديدة</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await loadAdminData();
                          onRefreshPublicData();
                          alert('تم حفظ واعتماد كافة الفعاليات بنجاح!');
                        } catch (err: any) {
                          alert(err.message || 'حدث خطأ أثناء حفظ الفعاليات');
                        }
                      }}
                      className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                    >
                      <Save className="w-5 h-5 text-amber-300" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: MEDIA GALLERY */}
            {activeTab === 'media' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-stone-900">
                      إدارة معرض الصور والفيديوهات
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      إضافة صور وفيديوهات وتصنيفها في ألبومات وربطها بالأمانات والفعاليات.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingMedia({ type: 'photo', isVisible: true, albumName: 'عام' });
                      setShowMediaModal(true);
                    }}
                    className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة وسيط جديد</span>
                  </button>
                </div>

                {/* Filter Tabs */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAdminMediaFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      adminMediaFilter === 'all'
                        ? 'bg-stone-900 text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    كافة الوسائط ({media.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdminMediaFilter('special')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      adminMediaFilter === 'special'
                        ? 'bg-amber-500 text-stone-950 font-black shadow-xs'
                        : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>المعرض الخاص ⭐ ({media.filter(m => m.isSpecial || m.albumName === 'خاص').length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdminMediaFilter('photo')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      adminMediaFilter === 'photo'
                        ? 'bg-red-700 text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    الصور ({media.filter(m => m.type === 'photo').length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdminMediaFilter('video')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      adminMediaFilter === 'video'
                        ? 'bg-red-700 text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    الفيديوهات ({media.filter(m => m.type === 'video').length})
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {media.filter(m => {
                    const isSpec = Boolean(m.isSpecial || m.albumName === 'خاص');
                    if (adminMediaFilter === 'special') return isSpec;
                    if (adminMediaFilter === 'photo') return m.type === 'photo';
                    if (adminMediaFilter === 'video') return m.type === 'video';
                    return true;
                  }).map(m => (
                    <div key={m.id} className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-xs">
                      <div className="aspect-square bg-stone-100 relative">
                        {m.type === 'photo' ? (
                          <img src={m.url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-stone-900 text-red-500">
                            فيديو
                          </div>
                        )}
                        <span className="absolute top-1 right-1 bg-stone-900/80 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                          {m.albumName}
                        </span>
                        {(m.isSpecial || m.albumName === 'خاص') && (
                          <span className="absolute top-1 left-1 bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 font-black text-[9px] px-1.5 py-0.5 rounded shadow-xs flex items-center gap-0.5">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>معرض خاص ⭐</span>
                          </span>
                        )}
                      </div>
                      <div className="p-3 text-right">
                        <h4 className="font-bold text-xs text-stone-900 line-clamp-1">{m.title}</h4>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-stone-100">
                          <button
                            onClick={() => {
                              setEditingMedia(m);
                              setShowMediaModal(true);
                            }}
                            className="text-stone-600 hover:text-red-700 text-[10px] font-bold cursor-pointer"
                          >
                            تعديل
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm('حذف هذا الوسيط؟')) {
                                await api.deleteMedia(m.id);
                                loadAdminData();
                                onRefreshPublicData();
                              }
                            }}
                            className="text-stone-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Save & Actions Bar */}
                <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-right">
                    <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                      <Save className="w-4 h-4" />
                      <span>تأكيد واعتماد وسائط ومعارض الحزب</span>
                    </h4>
                    <p className="text-[11px] text-stone-300 mt-0.5">
                      اضغط حفظ لتأكيد وحفظ كافة الصور والفيديوهات والتصنيفات في المعرض العام
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMedia({ type: 'photo', isVisible: true, albumName: 'عام' });
                        setShowMediaModal(true);
                      }}
                      className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs px-4 py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer border border-stone-700 transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>إضافة وسيط جديد</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await loadAdminData();
                          onRefreshPublicData();
                          alert('تم حفظ واعتماد كافة وسائط المعرض بنجاح!');
                        } catch (err: any) {
                          alert(err.message || 'حدث خطأ أثناء حفظ المعرض');
                        }
                      }}
                      className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                    >
                      <Save className="w-5 h-5 text-amber-300" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: LIVE STREAM */}
            {activeTab === 'livestream' && (
              <div className="space-y-6">
                <div className="border-b border-stone-100 pb-4">
                  <h2 className="text-xl font-black text-stone-900">
                    إدارة البث المباشر
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    تفعيل أو إيقاف مشغل البث المباشر على الموقع العام وتحديث رابط البث.
                  </p>
                </div>

                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    await api.updateLiveStream(liveStream);
                    loadAdminData();
                    onRefreshPublicData();
                    alert('تم حفظ إعدادات البث المباشر بنجاح');
                  }}
                  className="space-y-4 max-w-xl"
                >
                  <div className="flex items-center gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-200">
                    <input
                      type="checkbox"
                      id="live-active"
                      checked={liveStream?.isActive || false}
                      onChange={e => setLiveStream({ ...liveStream, isActive: e.target.checked })}
                      className="w-4 h-4 text-red-700"
                    />
                    <label htmlFor="live-active" className="text-xs font-bold text-stone-900 cursor-pointer">
                      تفعيل البث المباشر الآن على الموقع العام
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      عنوان البث المباشر
                    </label>
                    <input
                      type="text"
                      value={liveStream?.title || ''}
                      onChange={e => setLiveStream({ ...liveStream, title: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      رابط البث المباشر (Facebook Live Embed أو رابط بث مباشر)
                    </label>
                    <input
                      type="url"
                      value={liveStream?.streamUrl || ''}
                      onChange={e => setLiveStream({ ...liveStream, streamUrl: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-mono"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      وصف البث
                    </label>
                    <textarea
                      rows={2}
                      value={liveStream?.description || ''}
                      onChange={e => setLiveStream({ ...liveStream, description: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs text-stone-900"
                    />
                  </div>

                  {/* Bottom Save & Actions Bar */}
                  <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-center sm:text-right">
                      <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                        <Save className="w-4 h-4" />
                        <span>تأكيد واعتماد مشغل البث المباشر</span>
                      </h4>
                      <p className="text-[11px] text-stone-300 mt-0.5">
                        اضغط حفظ لتأكيد تفعيل البث أو إيقافه وتحديث رابط التضمين على الموقع فوراً
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto">
                      <button
                        type="submit"
                        className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                      >
                        <Save className="w-5 h-5 text-amber-300" />
                        <span>حفظ</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* TAB: CMS STATIC PAGES MANAGEMENT */}
            {activeTab === 'cms-pages' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-red-700" />
                      <span>إدارة الصفحات الثابتة (CMS)</span>
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      إدارة محتوى صفحات الموقع المستقلة (عن الحزب والأمانة، قيادات الحزب، الأمانات، وغيرها) وتنسيق النصوص ورفع الصور والنشر الفوري.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingPage({
                        title: '',
                        slug: '',
                        subtitle: '',
                        content: '',
                        coverImage: '',
                        galleryImages: [],
                        metaDescription: '',
                        isPublished: true
                      });
                      setShowPageModal(true);
                    }}
                    className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إنشاء صفحة جديدة</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {cmsPages.length === 0 ? (
                    <div className="p-8 text-center bg-stone-50 rounded-2xl border border-stone-200 text-stone-500 text-xs">
                      لا توجد صفحات مضافة حالياً. يمكنك إنشاء صفحة جديدة الآن.
                    </div>
                  ) : (
                    cmsPages.map(page => (
                      <div key={page.id} className="border border-stone-200 rounded-2xl p-5 bg-white hover:border-red-200 transition-colors shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
                        <div className="flex items-start gap-4">
                          {page.coverImage ? (
                            <img
                              src={page.coverImage}
                              alt={page.title}
                              className="w-16 h-16 rounded-xl object-cover border border-stone-200 shrink-0 shadow-xs"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400 shrink-0">
                              <BookOpen className="w-7 h-7" />
                            </div>
                          )}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${page.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'}`}>
                                {page.isPublished ? 'منشورة للعامة' : 'مسودة غير منشورة'}
                              </span>
                              <span className="text-[11px] font-mono text-stone-500 bg-stone-100 px-2 py-0.5 rounded">
                                #{page.slug}
                              </span>
                            </div>
                            <h3 className="font-extrabold text-stone-900 text-base">{page.title}</h3>
                            {page.subtitle && (
                              <p className="text-xs text-stone-600 line-clamp-1">{page.subtitle}</p>
                            )}
                            <div className="flex items-center gap-3 text-[11px] text-stone-400 font-mono pt-1">
                              <span>آخر تحديث: {new Date(page.updatedAt).toLocaleDateString('ar-EG')}</span>
                              <span>•</span>
                              <span>الصور المرفقة: {page.galleryImages?.length || 0}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                          <button
                            onClick={() => {
                              window.location.hash = `page/${page.slug}`;
                              onBackToSite();
                            }}
                            className="bg-stone-100 hover:bg-stone-200 text-stone-800 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1"
                            title="مشاهدة الصفحة بالموقع"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>معاينة</span>
                          </button>
                          <button
                            onClick={() => {
                              setEditingPage({ ...page });
                              setShowPageModal(true);
                            }}
                            className="bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1 border border-red-200"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>تعديل المحتوى</span>
                          </button>
                          {page.slug !== 'about' && (
                            <button
                              onClick={async () => {
                                if (confirm(`هل أنت متأكد من حذف صفحة "${page.title}"؟`)) {
                                  await api.deleteCMSPage(page.id);
                                  loadAdminData();
                                  onRefreshPublicData();
                                }
                              }}
                              className="text-stone-400 hover:text-red-700 p-2 rounded-lg hover:bg-stone-100 cursor-pointer"
                              title="حذف الصفحة"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Bottom Save & Actions Bar */}
                <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-right">
                    <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                      <Save className="w-4 h-4" />
                      <span>تأكيد واعتماد محتوى الصفحات الثابتة (CMS)</span>
                    </h4>
                    <p className="text-[11px] text-stone-300 mt-0.5">
                      اضغط حفظ لتأكيد وحفظ ونشر كافة تعديلات الصفحات الثابتة فوراً على الموقع
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPage({
                          title: '',
                          slug: '',
                          subtitle: '',
                          content: '',
                          coverImage: '',
                          galleryImages: [],
                          metaDescription: '',
                          isPublished: true
                        });
                        setShowPageModal(true);
                      }}
                      className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs px-4 py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer border border-stone-700 transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>إنشاء صفحة جديدة</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await loadAdminData();
                          onRefreshPublicData();
                          alert('تم حفظ واعتماد كافة الصفحات بنجاح!');
                        } catch (err: any) {
                          alert(err.message || 'حدث خطأ أثناء حفظ الصفحات');
                        }
                      }}
                      className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                    >
                      <Save className="w-5 h-5 text-amber-300" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: GRANULAR ROLES & PERMISSIONS (RBAC) */}
            {activeTab === 'roles' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-red-700" />
                      <span>نظام الأدوار والصلاحيات المتدرج (Granular RBAC)</span>
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      الأدوار القياسية المسبقة للنظام وإمكانية إنشاء أدوار مخصصة وتحديد مصفوفة الصلاحيات لكل دور وإسنادها للمشرفين.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingRole({
                        name: '',
                        description: '',
                        isSystem: false,
                        permissions: ['news', 'events']
                      });
                      setShowRoleModal(true);
                    }}
                    className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إنشاء دور إداري جديد</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {roles.map(r => (
                    <div key={r.id} className="border border-stone-200 rounded-2xl p-5 bg-white hover:border-amber-400/50 transition-colors shadow-xs flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.isSystem ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'}`}>
                            {r.isSystem ? 'دور قياسي مسبق (System)' : 'دور مخصص (Custom)'}
                          </span>
                          <span className="text-[11px] font-mono text-stone-500 font-bold bg-stone-100 px-2 py-0.5 rounded">
                            {r.permissions.length} صلاحيات
                          </span>
                        </div>
                        <h3 className="font-extrabold text-stone-900 text-sm">{r.name}</h3>
                        <p className="text-xs text-stone-600 leading-relaxed min-h-[36px]">{r.description}</p>
                      </div>

                      {/* Permissions badges */}
                      <div className="border-t border-stone-100 pt-3">
                        <span className="text-[10px] font-bold text-stone-400 block mb-1.5">مصفوفة الصلاحيات الممنوحة:</span>
                        <div className="flex flex-wrap gap-1">
                          {r.permissions.map(p => {
                            const labels: Record<string, string> = {
                              leaders_party: 'قيادات الحزب',
                              leaders_secretariat: 'قيادات أكتوبر',
                              secretariats: 'الأمانات',
                              initiatives: 'المبادرات',
                              applications: 'طلبات الانضمام',
                              members: 'سجل الأعضاء',
                              pages: 'الصفحات الثابتة (CMS)',
                              news: 'الأخبار والبيانات',
                              events: 'الفعاليات',
                              media: 'المعرض',
                              livestream: 'البث المباشر',
                              roles: 'الأدوار (RBAC)',
                              admins: 'المشرفون',
                              settings: 'الإعدادات',
                              audit: 'سجل العمليات'
                            };
                            return (
                              <span key={p} className="text-[10px] bg-stone-100 text-stone-800 border border-stone-200 px-2 py-0.5 rounded-md font-medium">
                                {labels[p] || p}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-stone-100 pt-3">
                        <button
                          onClick={() => {
                            setEditingRole({ ...r });
                            setShowRoleModal(true);
                          }}
                          className="bg-stone-100 hover:bg-stone-200 text-stone-800 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-stone-600" />
                          <span>تعديل الصلاحيات</span>
                        </button>

                        {!r.isSystem ? (
                          <button
                            onClick={async () => {
                              if (confirm(`هل أنت متأكد من حذف الدور الإداري "${r.name}"؟`)) {
                                await api.deleteRole(r.id);
                                loadAdminData();
                              }
                            }}
                            className="text-stone-400 hover:text-red-700 text-xs font-bold p-1 cursor-pointer flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف الدور</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-stone-400 font-medium">
                            دور قياسي محمي
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Save & Actions Bar */}
                <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-right">
                    <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                      <Save className="w-4 h-4" />
                      <span>تأكيد واعتماد الأدوار والصلاحيات (RBAC)</span>
                    </h4>
                    <p className="text-[11px] text-stone-300 mt-0.5">
                      اضغط حفظ لتأكيد وحفظ مصفوفة الصلاحيات والأدوار الإدارية المخصصة
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRole({
                          name: '',
                          description: '',
                          isSystem: false,
                          permissions: ['news', 'events']
                        });
                        setShowRoleModal(true);
                      }}
                      className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs px-4 py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer border border-stone-700 transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>إنشاء دور إداري جديد</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await loadAdminData();
                          alert('تم حفظ واعتماد كافة الأدوار والصلاحيات بنجاح!');
                        } catch (err: any) {
                          alert(err.message || 'حدث خطأ أثناء حفظ الأدوار');
                        }
                      }}
                      className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                    >
                      <Save className="w-5 h-5 text-amber-300" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: ADMIN USERS & ACCOUNTS */}
            {activeTab === 'users' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
                      <Users className="w-5 h-5 text-red-700" />
                      <span>المشرفون وحسابات الإدارة</span>
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      إضافة وتعديل حسابات المشرفين، وإسناد الأدوار القياسية أو المخصصة وتحديد الصلاحيات الدقيقة.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingUser({
                        role: 'sub_admin',
                        roleId: 'role-content-manager',
                        adminScope: 'general',
                        permissions: ['news', 'pages'],
                        isActive: true
                      });
                      setShowUserModal(true);
                    }}
                    className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة مشرف جديد</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {adminUsers.map(adm => {
                    const assignedRole = roles.find(r => r.id === adm.roleId);
                    const managedSec = secretariats.find(s => s.id === adm.managedSecretariatId);
                    return (
                      <div key={adm.id} className="border border-stone-200 rounded-2xl p-5 bg-stone-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${adm.role === 'super_admin' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-red-100 text-red-900 border border-red-200'}`}>
                              {adm.role === 'super_admin' ? 'مدير رئيسي (Super Admin)' : (assignedRole ? assignedRole.name : 'مشرف فرعي')}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${adm.adminScope === 'specialized' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-blue-100 text-blue-900 border border-blue-200'}`}>
                              {adm.adminScope === 'specialized' ? `مشرف أمانة: ${managedSec ? managedSec.name : 'أمانة تخصصية'}` : 'إدارة عامة وشاملة'}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded ${adm.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                              {adm.isActive ? 'حساب نشط' : 'معطل'}
                            </span>
                          </div>
                          <h3 className="font-bold text-stone-900 text-sm">{adm.name}</h3>
                          <p className="text-xs text-stone-500 font-mono">{adm.email}</p>
                          <p className="text-[11px] text-stone-600">
                            الصلاحيات الممنوحة: {adm.role === 'super_admin' ? 'كامل الصلاحيات دون قيود (Super Admin)' : (adm.permissions?.join(' · ') || 'لا توجد')}
                          </p>
                        </div>

                        {adm.email !== 'moazmahmoud586@gmail.com' && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => {
                                setEditingUser(adm);
                                setShowUserModal(true);
                              }}
                              className="bg-stone-200 hover:bg-stone-300 text-stone-800 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                            >
                              تعديل الصلاحيات والدور
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm(`حذف حساب المشرف: ${adm.name}؟`)) {
                                  await api.deleteAdminUser(adm.id);
                                  loadAdminData();
                                }
                              }}
                              className="text-stone-400 hover:text-red-700 p-1.5 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Save & Actions Bar */}
                <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-right">
                    <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                      <Save className="w-4 h-4" />
                      <span>تأكيد واعتماد حسابات المشرفين</span>
                    </h4>
                    <p className="text-[11px] text-stone-300 mt-0.5">
                      اضغط حفظ لتأكيد وحفظ بيانات حسابات المشرفين وصلاحياتهم الإدارية
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUser({
                          role: 'sub_admin',
                          roleId: 'role-content-manager',
                          adminScope: 'general',
                          permissions: ['news', 'pages'],
                          isActive: true
                        });
                        setShowUserModal(true);
                      }}
                      className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs px-4 py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer border border-stone-700 transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>إضافة مشرف جديد</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await loadAdminData();
                          alert('تم حفظ واعتماد كافة حسابات المشرفين بنجاح!');
                        } catch (err: any) {
                          alert(err.message || 'حدث خطأ أثناء حفظ المشرفين');
                        }
                      }}
                      className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                    >
                      <Save className="w-5 h-5 text-amber-300" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SITE SETTINGS */}
            {activeTab === 'settings' && settings && (
              <div className="space-y-6">
                <div className="border-b border-stone-100 pb-4">
                  <h2 className="text-xl font-black text-stone-900">
                    إعدادات وهوية المنصة
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    تعديل بيانات التواصل الرسمية، الشعار، النبذة التعريفية، وروابط التواصل.
                  </p>
                </div>

                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    const cleanedLinks = (settings.socialLinks || []).filter(l => l.platform !== 'youtube');
                    const updated = {
                      ...settings,
                      socialLinks: cleanedLinks
                    };
                    await api.updateSettings(updated);
                    loadAdminData();
                    onRefreshPublicData();
                    alert('تم حفظ إعدادات المنصة وصفحة فيسبوك بنجاح');
                  }}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        اسم الحزب
                      </label>
                      <input
                        type="text"
                        value={settings.partyName}
                        onChange={e => setSettings({ ...settings, partyName: e.target.value })}
                        className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        اسم الأمانة
                      </label>
                      <input
                        type="text"
                        value={settings.secretariatName}
                        onChange={e => setSettings({ ...settings, secretariatName: e.target.value })}
                        className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        الشعار الرئيسي المعتمد (لا يُغير)
                      </label>
                      <input
                        type="text"
                        value={settings.slogan}
                        onChange={e => setSettings({ ...settings, slogan: e.target.value })}
                        className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-bold text-red-700"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        هاتف وواتساب الأمانة المعتمد
                      </label>
                      <input
                        type="text"
                        value={settings.phone || ''}
                        onChange={e => {
                          const val = e.target.value;
                          const clean = val.replace(/\D/g, '');
                          const waNumber = clean.startsWith('20') ? clean : (clean.startsWith('0') ? `20${clean.substring(1)}` : `20${clean}`);
                          const newWaLink = clean ? `https://wa.me/${waNumber}` : '';
                          setSettings({
                            ...settings,
                            phone: val,
                            whatsapp: val,
                            membershipWhatsapp: settings.membershipWhatsapp || val,
                            whatsappLink: newWaLink || settings.whatsappLink
                          });
                        }}
                        className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-mono"
                        dir="ltr"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        رابط واتساب المباشر
                      </label>
                      <input
                        type="text"
                        value={settings.whatsappLink}
                        onChange={e => setSettings({ ...settings, whatsappLink: e.target.value })}
                        className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-mono"
                        dir="ltr"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        البريد الإلكتروني (أرشيف داخلي – تم حجبه من صفحة الاتصال)
                      </label>
                      <input
                        type="email"
                        value={settings.email || ''}
                        onChange={e => setSettings({ ...settings, email: e.target.value })}
                        className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-mono"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {/* Video & Media Showcase Section (Matching Video bhaalwataniya.com) */}
                  <div className="p-5 bg-stone-900 text-white border-2 border-amber-500/40 rounded-3xl space-y-4">
                    <div className="flex items-center gap-2.5 border-b border-stone-800 pb-3">
                      <span className="w-8 h-8 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-bold">
                        <Play className="w-4 h-4 fill-stone-950" />
                      </span>
                      <div>
                        <h3 className="text-sm font-black text-white">
                          مقطع الفيديو التعريفي وصورة مدخل المقر (Hero Video & Entrance)
                        </h3>
                        <p className="text-[11px] text-stone-400">
                          التحكم في فيديو البانر المتحرك أعلى الموقع وصورة مدخل المقر بالسجادة الحمراء كما بالفيديو المرجعي.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <VideoUploadField
                          label="فيديو واجهة الموقع التلقائي (Hero Video)"
                          value={settings.heroVideoUrl || ''}
                          onChange={url => setSettings({ ...settings, heroVideoUrl: url })}
                          helpText="يمكنك رفع مقطع فيديو من هاتفك أو جهازك، أو لصق رابط MP4/يوتيوب. يشتغل تلقائياً بانسيابية عالية وبدون أي مساحات سوداء."
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-amber-300 mb-1">
                          صورة غلاف الفيديو (Video Poster)
                        </label>
                        <input
                          type="text"
                          placeholder="/assets/... أو رابط صورة"
                          value={settings.heroPosterUrl || ''}
                          onChange={e => setSettings({ ...settings, heroPosterUrl: e.target.value })}
                          className="w-full border border-stone-700 bg-stone-950 text-white rounded-xl px-3.5 py-2.5 text-xs font-mono"
                          dir="ltr"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <ImageFieldWithPicker
                          label="صورة مدخل المقر والسجادة الحمراء (Party Entrance Banner)"
                          value={settings.entranceImageUrl || ''}
                          onChange={url => setSettings({ ...settings, entranceImageUrl: url })}
                          media={media}
                          onMediaCreated={handleMediaCreated}
                          shape="rounded"
                          helpText="تظهر أسفل النص التعريفي مباشرة وتفصل بين الرؤية وقسم العضوية كما بالفيديو المرجعي"
                          pickerTitle="اختيار صورة المقر من المعرض العام"
                        />
                      </div>

                      {/* Multi-slide automatic flipper manager */}
                      <div className="sm:col-span-2 border-t border-stone-800 pt-5 mt-2 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-900/90 p-4 rounded-2xl border border-stone-800">
                          <div>
                            <h4 className="text-sm font-black text-amber-400 flex items-center gap-2">
                              <Film className="w-4 h-4 text-amber-400" />
                              <span>إدارة شرائح البانر الرئيسي (صور وفيديوهات تقلب تلقائياً)</span>
                            </h4>
                            <p className="text-[11px] text-stone-300 mt-1">
                              يمكنك إضافة عدة صور وفيديوهات لتعرض وراء بعضها بشكل تلقائي وسلس في أعلى الموقع، مع إمكانية ترتيبها وحذفها واختيارها من المعرض أو رفعها مباشرة.
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-2 flex-wrap">
                            <label className="text-xs bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs">
                              <Upload className="w-3.5 h-3.5 text-amber-400" />
                              <span>رفع وسيط من الجهاز</span>
                              <input
                                type="file"
                                accept="image/*,video/*"
                                className="hidden"
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  if (file.size > 25 * 1024 * 1024) {
                                    alert('حجم الملف كبير جداً، يرجى اختيار ملف أقل من 25 ميجابايت');
                                    return;
                                  }
                                  const isVid = file.type.startsWith('video/');
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    const newSlide = {
                                      id: `slide-${Date.now()}`,
                                      type: (isVid ? 'video' : 'image') as 'video' | 'image',
                                      url: reader.result as string,
                                      title: file.name.replace(/\.[^/.]+$/, ''),
                                      caption: 'أمانة قسم ثالث أكتوبر'
                                    };
                                    setSettings({
                                      ...settings,
                                      heroSlides: [...(settings.heroSlides || []), newSlide]
                                    });
                                  };
                                  reader.readAsDataURL(file);
                                }}
                              />
                            </label>

                            <button
                              type="button"
                              onClick={() => {
                                const newSlide = {
                                  id: `slide-${Date.now()}`,
                                  type: 'image' as const,
                                  url: '',
                                  title: '',
                                  caption: ''
                                };
                                const updated = [...(settings.heroSlides || []), newSlide];
                                setSettings({
                                  ...settings,
                                  heroSlides: updated
                                });
                                // Automatically open media picker for newly added slide
                                setHeroSlidePickerIdx(updated.length - 1);
                              }}
                              className="text-xs bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 font-black px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-md active:scale-95"
                            >
                              <Plus className="w-4 h-4 text-stone-950" />
                              <span>إضافة شريحة جديدة</span>
                            </button>
                          </div>
                        </div>

                        {settings.heroSlides && settings.heroSlides.length > 0 ? (
                          <div className="space-y-3">
                            {settings.heroSlides.map((slide, sIdx) => (
                              <div
                                key={slide.id || sIdx}
                                className="p-4 bg-stone-950 border border-stone-800 rounded-2xl space-y-3 text-xs shadow-md hover:border-amber-500/40 transition-colors"
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-800/80 pb-2.5">
                                  <div className="flex items-center gap-2.5">
                                    <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center font-black text-xs border border-amber-500/30">
                                      {sIdx + 1}
                                    </span>
                                    <span className="font-bold text-stone-200">
                                      {slide.title || `شريحة ${sIdx + 1}`}
                                    </span>
                                    <select
                                      value={slide.type}
                                      onChange={e => {
                                        const updated = [...(settings.heroSlides || [])];
                                        updated[sIdx] = { ...slide, type: e.target.value as 'video' | 'image' };
                                        setSettings({ ...settings, heroSlides: updated });
                                      }}
                                      className="bg-stone-900 border border-stone-700 text-amber-300 rounded-lg px-2.5 py-1 text-xs font-bold"
                                    >
                                      <option value="image">صورة (Image)</option>
                                      <option value="video">فيديو (Video MP4)</option>
                                    </select>
                                  </div>

                                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                    {/* Reorder Up */}
                                    <button
                                      type="button"
                                      disabled={sIdx === 0}
                                      onClick={() => {
                                        if (sIdx <= 0 || !settings.heroSlides) return;
                                        const updated = [...settings.heroSlides];
                                        const temp = updated[sIdx];
                                        updated[sIdx] = updated[sIdx - 1];
                                        updated[sIdx - 1] = temp;
                                        setSettings({ ...settings, heroSlides: updated });
                                      }}
                                      className={`p-1.5 rounded-lg border border-stone-700 text-stone-300 hover:text-white hover:bg-stone-800 cursor-pointer ${sIdx === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                      title="تحريك لأعلى"
                                    >
                                      <ChevronUp className="w-4 h-4" />
                                    </button>

                                    {/* Reorder Down */}
                                    <button
                                      type="button"
                                      disabled={sIdx === (settings.heroSlides?.length || 0) - 1}
                                      onClick={() => {
                                        if (!settings.heroSlides || sIdx >= settings.heroSlides.length - 1) return;
                                        const updated = [...settings.heroSlides];
                                        const temp = updated[sIdx];
                                        updated[sIdx] = updated[sIdx + 1];
                                        updated[sIdx + 1] = temp;
                                        setSettings({ ...settings, heroSlides: updated });
                                      }}
                                      className={`p-1.5 rounded-lg border border-stone-700 text-stone-300 hover:text-white hover:bg-stone-800 cursor-pointer ${sIdx === (settings.heroSlides?.length || 0) - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                      title="تحريك لأسفل"
                                    >
                                      <ChevronDown className="w-4 h-4" />
                                    </button>

                                    {/* Delete Slide */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (confirm(`هل أنت متأكد من حذف هذه الشريحة؟`)) {
                                          const updated = (settings.heroSlides || []).filter((_, i) => i !== sIdx);
                                          setSettings({ ...settings, heroSlides: updated });
                                        }
                                      }}
                                      className="text-red-400 hover:text-red-300 hover:bg-red-950/40 p-1.5 rounded-lg border border-red-900/40 cursor-pointer transition-colors"
                                      title="حذف الشريحة"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                {/* Slide Content & Preview */}
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                                  {/* Thumbnail Preview */}
                                  <div className="sm:col-span-3">
                                    <div className="aspect-video w-full rounded-xl bg-stone-900 border border-stone-800 overflow-hidden relative flex items-center justify-center">
                                      {slide.url ? (
                                        slide.type === 'video' ? (
                                          <div className="w-full h-full bg-black flex flex-col items-center justify-center text-amber-400 gap-1 p-2 text-center">
                                            <Video className="w-6 h-6 text-red-500" />
                                            <span className="text-[10px] font-mono text-stone-300 line-clamp-1">مقطع فيديو</span>
                                          </div>
                                        ) : (
                                          <img
                                            src={slide.url}
                                            alt=""
                                            className="w-full h-full object-cover"
                                            onError={e => {
                                              (e.currentTarget as HTMLImageElement).src = '/assets/aistudio/Screenshot_________________Chrome_9f4025ed.jpg';
                                            }}
                                          />
                                        )
                                      ) : (
                                        <div className="text-stone-600 flex flex-col items-center justify-center p-2 text-center">
                                          <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                                          <span className="text-[10px]">لا يوجد وسيط</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Inputs and actions */}
                                  <div className="sm:col-span-9 space-y-2">
                                    <div className="flex flex-col sm:flex-row gap-2">
                                      <input
                                        type="text"
                                        placeholder="رابط الصورة أو مسار الفيديو (URL)"
                                        value={slide.url}
                                        onChange={e => {
                                          const updated = [...(settings.heroSlides || [])];
                                          updated[sIdx] = { ...slide, url: e.target.value };
                                          setSettings({ ...settings, heroSlides: updated });
                                        }}
                                        className="flex-1 border border-stone-800 bg-stone-900 text-white rounded-xl px-3 py-2 font-mono text-xs focus:border-amber-500 focus:outline-none"
                                        dir="ltr"
                                      />

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => setHeroSlidePickerIdx(sIdx)}
                                          className="bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1 cursor-pointer transition-colors"
                                        >
                                          <ImageIcon className="w-3.5 h-3.5" />
                                          <span>من المعرض</span>
                                        </button>

                                        <label className="bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1 cursor-pointer transition-colors">
                                          <Upload className="w-3.5 h-3.5" />
                                          <span>رفع</span>
                                          <input
                                            type="file"
                                            accept="image/*,video/*"
                                            className="hidden"
                                            onChange={e => {
                                              const file = e.target.files?.[0];
                                              if (!file) return;
                                              if (file.size > 25 * 1024 * 1024) {
                                                alert('حجم الملف كبير جداً، يرجى اختيار ملف أقل من 25 ميجابايت');
                                                return;
                                              }
                                              const isVid = file.type.startsWith('video/');
                                              const reader = new FileReader();
                                              reader.onload = () => {
                                                const updated = [...(settings.heroSlides || [])];
                                                updated[sIdx] = {
                                                  ...slide,
                                                  url: reader.result as string,
                                                  type: isVid ? 'video' : 'image',
                                                  title: slide.title || file.name.replace(/\.[^/.]+$/, '')
                                                };
                                                setSettings({ ...settings, heroSlides: updated });
                                              };
                                              reader.readAsDataURL(file);
                                            }}
                                          />
                                        </label>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <input
                                        type="text"
                                        placeholder="عنوان الشريحة الرئيسي (يظهر فوق الوسيط)"
                                        value={slide.title || ''}
                                        onChange={e => {
                                          const updated = [...(settings.heroSlides || [])];
                                          updated[sIdx] = { ...slide, title: e.target.value };
                                          setSettings({ ...settings, heroSlides: updated });
                                        }}
                                        className="border border-stone-800 bg-stone-900 text-white rounded-xl px-3 py-1.5 text-xs focus:border-amber-500 focus:outline-none"
                                      />
                                      <input
                                        type="text"
                                        placeholder="وصف أو شارة الشريحة (اختياري)"
                                        value={slide.caption || ''}
                                        onChange={e => {
                                          const updated = [...(settings.heroSlides || [])];
                                          updated[sIdx] = { ...slide, caption: e.target.value };
                                          setSettings({ ...settings, heroSlides: updated });
                                        }}
                                        className="border border-stone-800 bg-stone-900 text-white rounded-xl px-3 py-1.5 text-xs focus:border-amber-500 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-6 text-center border border-dashed border-stone-800 rounded-2xl bg-stone-950/60 text-stone-400 text-xs">
                            لا توجد شرائح مخصصة حالياً. اضغط على «إضافة شريحة جديدة» أو «رفع وسيط» لإضافة صور وفيديوهات للبانر.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Independent Membership Section & WhatsApp Number */}
                  <div className="p-5 bg-gradient-to-b from-[#fbf8f2] to-[#f4ece0] border-2 border-amber-400/80 rounded-3xl space-y-4">
                    <div className="flex items-center gap-2.5 border-b border-amber-300 pb-3">
                      <span className="w-8 h-8 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-bold">
                        <HeartHandshake className="w-4 h-4 text-stone-950" />
                      </span>
                      <div>
                        <h3 className="text-sm font-black text-stone-950">
                          قسم العضوية المستقل ورقم واتساب المباشر («كن جزءاً من التغيير!»)
                        </h3>
                        <p className="text-[11px] text-stone-600">
                          تعديل نصوص دعوة الانضمام ورقم الواتساب الخاص بالاستفسارات والتواصل المباشر.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-stone-800 mb-1">
                          عنوان قسم العضوية
                        </label>
                        <input
                          type="text"
                          value={settings.membershipTitle || 'كن جزءاً من التغيير!'}
                          onChange={e => setSettings({ ...settings, membershipTitle: e.target.value })}
                          className="w-full border border-stone-300 bg-white rounded-xl px-3.5 py-2.5 text-xs font-bold text-stone-900"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-stone-800 mb-1">
                          رقم واتساب العضوية والاستفسارات (فتح محادثة مباشرة) <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="text"
                          value={settings.membershipWhatsapp ?? ''}
                          placeholder="010XXXXXXXX"
                          onChange={e => {
                            const val = e.target.value;
                            const clean = val.replace(/\D/g, '');
                            const waNumber = clean.startsWith('20') ? clean : (clean.startsWith('0') ? `20${clean.substring(1)}` : `20${clean}`);
                            const newWaLink = clean ? `https://wa.me/${waNumber}` : '';
                            setSettings({
                              ...settings,
                              membershipWhatsapp: val,
                              whatsapp: val || settings.whatsapp,
                              whatsappLink: newWaLink || settings.whatsappLink
                            });
                          }}
                          className="w-full border border-stone-300 bg-white rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-emerald-700"
                          dir="ltr"
                        />
                        <p className="text-[10px] text-stone-500 mt-1">
                          يمكنك كتابة رقم الهاتف مباشرة (مثل: 01012345678)، وسيتم تحديث رابط المحادثة الفوري تلقائياً في صفحة العضوية والتواصل.
                        </p>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-stone-800 mb-1">
                          النص التعريفي لدعوة العضوية
                        </label>
                        <input
                          type="text"
                          value={settings.membershipSubtitle || 'ندعوكم للانضمام إلى مسيرة الحزب والعمل معنا لتحقيق تطلعات الوطن.'}
                          onChange={e => setSettings({ ...settings, membershipSubtitle: e.target.value })}
                          className="w-full border border-stone-300 bg-white rounded-xl px-3.5 py-2.5 text-xs text-stone-900"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-stone-800 mb-1">
                          النص التحفيزي للزر
                        </label>
                        <input
                          type="text"
                          value={settings.membershipCtaText || 'انضم الآن وساهم في بناء المستقبل'}
                          onChange={e => setSettings({ ...settings, membershipCtaText: e.target.value })}
                          className="w-full border border-stone-300 bg-white rounded-xl px-3.5 py-2.5 text-xs text-stone-900"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Comprehensive Website Text & Words Editor */}
                  <div className="p-5 bg-stone-50 border border-stone-200 rounded-3xl space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-red-700 text-white flex items-center justify-center font-bold shadow-xs">
                          <Type className="w-5 h-5 text-amber-300" />
                        </span>
                        <div>
                          <h3 className="text-sm font-black text-stone-900">
                            محرر نصوص وكلمات الموقع بالكامل (التحكم في أي كلمة وشعار ورقم)
                          </h3>
                          <p className="text-[11px] text-stone-500">
                            يمكنك تعديل أي كلمة أو عنوان أو رقم إحصائي أو زر في الصفحة الرئيسية وكافة أقسام الموقع بحرية كاملة.
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold bg-red-100 text-red-900 border border-red-200 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                        تحرير الكلمات والأرقام
                      </span>
                    </div>

                    {/* Section 1: Hero Banner Texts */}
                    <div className="bg-white p-4 rounded-2xl border border-stone-200 space-y-3">
                      <h4 className="text-xs font-black text-red-800 border-r-2 border-red-700 pr-2">
                        1. نصوص البانر والميثاق الوطني (Hero Banner)
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-stone-700 mb-1">وسام الترويسة الصغير</label>
                          <input
                            type="text"
                            value={settings.customTexts?.heroBadge ?? 'الميثاق الوطني للحزب • معاً نبني مستقبلاً مشرقاً لمصر'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), heroBadge: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-stone-700 mb-1">العنوان الرئيسي للبانر</label>
                          <input
                            type="text"
                            value={settings.customTexts?.heroTitle ?? 'حزب الجبهة الوطنية هو حزب سياسى مدنى ديمقراطى يحق لأى مصرى الإنتماء إلى عضويته'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), heroTitle: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-stone-700 mb-1">النص التوضيحي للبانر</label>
                          <textarea
                            rows={2}
                            value={settings.customTexts?.heroSubtitle ?? 'دون تفرقة أو تمييز ويهدف إلى إعلاء قيم العدل والمساواة والحرية وإحترام حقوق الإنسان، وتعزيز المشاركة الشعبية الفاعلة والصادقة لخدمة مصلحة الوطن العليا وتحقيق العدالة الاجتماعية والتنمية المستدامة.'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), heroSubtitle: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-stone-700 mb-1">نص زر المبادئ والرؤية</label>
                            <input
                              type="text"
                              value={settings.customTexts?.heroBtnPrimary ?? 'رؤية الحزب ومبادئه الكاملة'}
                              onChange={e => setSettings({
                                ...settings,
                                customTexts: { ...(settings.customTexts || {}), heroBtnPrimary: e.target.value }
                              })}
                              className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-stone-700 mb-1">نص زر طلب الانضمام</label>
                            <input
                              type="text"
                              value={settings.customTexts?.heroBtnSecondary ?? 'طلب الانضمام للحزب'}
                              onChange={e => setSettings({
                                ...settings,
                                customTexts: { ...(settings.customTexts || {}), heroBtnSecondary: e.target.value }
                              })}
                              className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Statistics & Counters (Archived/Hidden per request) */}
                    <details className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3">
                      <summary className="text-xs font-bold text-stone-600 cursor-pointer select-none">
                        أرقام وعدادات إضافية (مخفية حالياً من الواجهة حسب الطلب)
                      </summary>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Card 1 */}
                        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                          <span className="text-[11px] font-bold text-red-700 block">البطاقة 1 (الأمانات)</span>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] text-stone-500 mb-0.5">الرقم/القيمة</label>
                              <input
                                type="text"
                                value={settings.customTexts?.statsCard1Value ?? String(secretariats.length || '9')}
                                onChange={e => setSettings({
                                  ...settings,
                                  customTexts: { ...(settings.customTexts || {}), statsCard1Value: e.target.value }
                                })}
                                className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-xs font-bold text-center"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-[10px] text-stone-500 mb-0.5">العنوان</label>
                              <input
                                type="text"
                                value={settings.customTexts?.statsCard1Label ?? 'أمانة حزبية معتمدة'}
                                onChange={e => setSettings({
                                  ...settings,
                                  customTexts: { ...(settings.customTexts || {}), statsCard1Label: e.target.value }
                                })}
                                className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-xs font-bold"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] text-stone-500 mb-0.5">الوصف الصغير</label>
                            <input
                              type="text"
                              value={settings.customTexts?.statsCard1Sub ?? 'تغطي كافة الملفات التنموية'}
                              onChange={e => setSettings({
                                ...settings,
                                customTexts: { ...(settings.customTexts || {}), statsCard1Sub: e.target.value }
                              })}
                              className="w-full border border-stone-300 rounded-lg px-2 py-1 text-xs"
                            />
                          </div>
                        </div>

                        {/* Card 2 */}
                        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                          <span className="text-[11px] font-bold text-amber-700 block">البطاقة 2 (المبادرات)</span>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] text-stone-500 mb-0.5">الرقم/القيمة</label>
                              <input
                                type="text"
                                value={settings.customTexts?.statsCard2Value ?? String(initiatives.length || '1')}
                                onChange={e => setSettings({
                                  ...settings,
                                  customTexts: { ...(settings.customTexts || {}), statsCard2Value: e.target.value }
                                })}
                                className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-xs font-bold text-center"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-[10px] text-stone-500 mb-0.5">العنوان</label>
                              <input
                                type="text"
                                value={settings.customTexts?.statsCard2Label ?? 'مبادرات ميدانية ومجتمعية'}
                                onChange={e => setSettings({
                                  ...settings,
                                  customTexts: { ...(settings.customTexts || {}), statsCard2Label: e.target.value }
                                })}
                                className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-xs font-bold"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] text-stone-500 mb-0.5">الوصف الصغير</label>
                            <input
                              type="text"
                              value={settings.customTexts?.statsCard2Sub ?? 'تخدم أهالي قسم ثالث أكتوبر'}
                              onChange={e => setSettings({
                                ...settings,
                                customTexts: { ...(settings.customTexts || {}), statsCard2Sub: e.target.value }
                              })}
                              className="w-full border border-stone-300 rounded-lg px-2 py-1 text-xs"
                            />
                          </div>
                        </div>

                        {/* Card 3 */}
                        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                          <span className="text-[11px] font-bold text-stone-800 block">البطاقة 3 (الأخبار والفعاليات)</span>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] text-stone-500 mb-0.5">الرقم/القيمة</label>
                              <input
                                type="text"
                                value={settings.customTexts?.statsCard3Value ?? String(news.length + events.length || '2')}
                                onChange={e => setSettings({
                                  ...settings,
                                  customTexts: { ...(settings.customTexts || {}), statsCard3Value: e.target.value }
                                })}
                                className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-xs font-bold text-center"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-[10px] text-stone-500 mb-0.5">العنوان</label>
                              <input
                                type="text"
                                value={settings.customTexts?.statsCard3Label ?? 'تغطية إخبارية وفعالية'}
                                onChange={e => setSettings({
                                  ...settings,
                                  customTexts: { ...(settings.customTexts || {}), statsCard3Label: e.target.value }
                                })}
                                className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-xs font-bold"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] text-stone-500 mb-0.5">الوصف الصغير</label>
                            <input
                              type="text"
                              value={settings.customTexts?.statsCard3Sub ?? 'مستمرة على مدار الساعة'}
                              onChange={e => setSettings({
                                ...settings,
                                customTexts: { ...(settings.customTexts || {}), statsCard3Sub: e.target.value }
                              })}
                              className="w-full border border-stone-300 rounded-lg px-2 py-1 text-xs"
                            />
                          </div>
                        </div>

                        {/* Card 4 */}
                        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                          <span className="text-[11px] font-bold text-emerald-800 block">البطاقة 4 (المنصة الرقمية)</span>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] text-stone-500 mb-0.5">الرقم/القيمة</label>
                              <input
                                type="text"
                                value={settings.customTexts?.statsCard4Value ?? '100%'}
                                onChange={e => setSettings({
                                  ...settings,
                                  customTexts: { ...(settings.customTexts || {}), statsCard4Value: e.target.value }
                                })}
                                className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-xs font-bold text-center"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-[10px] text-stone-500 mb-0.5">العنوان</label>
                              <input
                                type="text"
                                value={settings.customTexts?.statsCard4Label ?? 'منصة رقمية حقيقية'}
                                onChange={e => setSettings({
                                  ...settings,
                                  customTexts: { ...(settings.customTexts || {}), statsCard4Label: e.target.value }
                                })}
                                className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-xs font-bold"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] text-stone-500 mb-0.5">الوصف الصغير</label>
                            <input
                              type="text"
                              value={settings.customTexts?.statsCard4Sub ?? 'دون أي كارنيهات أو اشتراكات'}
                              onChange={e => setSettings({
                                ...settings,
                                customTexts: { ...(settings.customTexts || {}), statsCard4Sub: e.target.value }
                              })}
                              className="w-full border border-stone-300 rounded-lg px-2 py-1 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </details>

                    {/* Section 3: Section Titles & Badges */}
                    <div className="bg-white p-4 rounded-2xl border border-stone-200 space-y-3">
                      <h4 className="text-xs font-black text-stone-800 border-r-2 border-stone-600 pr-2">
                        3. عناوين وأوسمة الأقسام الرئيسية بالموقع
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Leaders */}
                        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                          <span className="text-[11px] font-bold text-red-700 block">قسم قيادات الحزب العامة</span>
                          <input
                            type="text"
                            placeholder="الوسام الصغير (مثال: التسلسل القيادي)"
                            value={settings.customTexts?.partyLeadersBadge ?? 'التسلسل القيادي'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), partyLeadersBadge: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                          />
                          <input
                            type="text"
                            placeholder="العنوان (مثال: قيادات حزب الجبهة الوطنية)"
                            value={settings.customTexts?.partyLeadersTitle ?? 'قيادات حزب الجبهة الوطنية'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), partyLeadersTitle: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                          />
                          <input
                            type="text"
                            placeholder="الوصف (مثال: قيادات الحزب على مستوى الجمهورية والمحافظات)"
                            value={settings.customTexts?.partyLeadersSubtitle ?? 'قيادات الحزب على مستوى الجمهورية والمحافظات'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), partyLeadersSubtitle: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-lg px-2 py-1 text-xs"
                          />
                        </div>

                        {/* Secretariat Leaders */}
                        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                          <span className="text-[11px] font-bold text-amber-800 block">قسم قيادات أمانة قسم ثالث أكتوبر</span>
                          <input
                            type="text"
                            placeholder="الوسام الصغير"
                            value={settings.customTexts?.secLeadersBadge ?? 'القيادة التنفيذية'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), secLeadersBadge: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                          />
                          <input
                            type="text"
                            placeholder="العنوان"
                            value={settings.customTexts?.secLeadersTitle ?? 'قيادات أمانة قسم ثالث أكتوبر'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), secLeadersTitle: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                          />
                          <input
                            type="text"
                            placeholder="الوصف"
                            value={settings.customTexts?.secLeadersSubtitle ?? 'هيئة مكتب الأمانة والقيادات المسؤولة عن قيادة العمل الحزبي والميداني'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), secLeadersSubtitle: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-lg px-2 py-1 text-xs"
                          />
                        </div>

                        {/* Secretariats */}
                        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                          <span className="text-[11px] font-bold text-stone-800 block">قسم الأمانات التخصصية والنوعية</span>
                          <input
                            type="text"
                            placeholder="الوسام الصغير"
                            value={settings.customTexts?.secretariatsBadge ?? 'الأمانات النوعية'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), secretariatsBadge: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                          />
                          <input
                            type="text"
                            placeholder="العنوان"
                            value={settings.customTexts?.secretariatsTitle ?? 'الأمانات التخصصية والنوعية'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), secretariatsTitle: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                          />
                          <input
                            type="text"
                            placeholder="الوصف"
                            value={settings.customTexts?.secretariatsSubtitle ?? 'تشكيلات متخصصة تغطي كافة الملفات الخدمية، التنموية، والتنظيمية بأكتوبر'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), secretariatsSubtitle: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-lg px-2 py-1 text-xs"
                          />
                        </div>

                        {/* Initiatives */}
                        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                          <span className="text-[11px] font-bold text-red-700 block">قسم المبادرات التنموية</span>
                          <input
                            type="text"
                            placeholder="الوسام الصغير"
                            value={settings.customTexts?.initiativesBadge ?? 'العمل الميداني'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), initiativesBadge: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                          />
                          <input
                            type="text"
                            placeholder="العنوان"
                            value={settings.customTexts?.initiativesTitle ?? 'المبادرات المجتمعية والتنموية'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), initiativesTitle: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                          />
                          <input
                            type="text"
                            placeholder="الوصف"
                            value={settings.customTexts?.initiativesSubtitle ?? 'مشاريع وأنشطة تهدف لخدمة المواطن وتحقيق التنمية المستدامة بأكتوبر'}
                            onChange={e => setSettings({
                              ...settings,
                              customTexts: { ...(settings.customTexts || {}), initiativesSubtitle: e.target.value }
                            })}
                            className="w-full border border-stone-300 rounded-lg px-2 py-1 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Comprehensive Location & Google Maps Card */}
                  <div className="p-5 bg-stone-50 border border-stone-200 rounded-3xl space-y-4">
                    <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-xl bg-red-700 text-white flex items-center justify-center font-bold shadow-xs">
                          <MapPin className="w-4 h-4 text-amber-300" />
                        </span>
                        <div>
                          <h3 className="text-sm font-black text-stone-900">
                            تعديل المقر واللوكيشن الجغرافي (Google Maps)
                          </h3>
                          <p className="text-[11px] text-stone-500">
                            ضبط وتعديل موقع مقر الأمانة على خرائط جوجل، رابط اللوكيشن المباشر، وتضمين الخريطة لزوار المنصة.
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-lg">
                        اللوكيشن والخريطة
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Address */}
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-stone-700 mb-1">
                          العنوان التفصيلي لمقر الأمانة (النطاق الجغرافي) <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="مثال: قسم ثالث أكتوبر، محافظة الجيزة، جمهورية مصر العربية"
                          value={settings.address || ''}
                          onChange={e => setSettings({ ...settings, address: e.target.value })}
                          className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 bg-white"
                        />
                      </div>

                      {/* Google Maps Location Link - Single Simple Input */}
                      <div className="bg-amber-50/70 border border-amber-300 rounded-2xl p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <label className="block text-xs font-black text-amber-950 flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-red-700" />
                            <span>رابط موقع مقر الحزب على خرائط جوجل (Google Maps Link)</span>
                          </label>
                          {settings.locationUrl && (
                            <a
                              href={settings.locationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-red-700 hover:underline font-bold flex items-center gap-1"
                            >
                              <span>تجربة فتح اللوكيشن</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>

                        <input
                          type="url"
                          placeholder="https://maps.app.goo.gl/... أو https://maps.google.com/?q=..."
                          value={settings.locationUrl || ''}
                          onChange={e => {
                            const newUrl = e.target.value.trim();
                            let generatedEmbed = '';
                            const iframeMatch = newUrl.match(/src=["'](.*?)["']/);
                            if (iframeMatch && iframeMatch[1]) {
                              generatedEmbed = iframeMatch[1];
                            } else if (newUrl.includes('google.com/maps/embed')) {
                              generatedEmbed = newUrl;
                            } else if (newUrl.includes('iw7sGSbbb2K1g6yZ7') || newUrl.includes('maps.app.goo.gl')) {
                              generatedEmbed = 'https://maps.google.com/maps?q=%D8%AD%D8%B2%D8%A8+%D8%A7%D9%84%D8%AC%D8%A8%D9%87%D8%A9+%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A%D8%A9+%D8%A3%D9%85%D8%A7%D9%86%D8%A9+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+%D8%A7%D9%83%D8%AA%D9%88%D8%A8%D8%B1%D8%8C+%D8%B7%D8%B1%D9%8A%D9%82+%D8%A7%D9%84%D8%B4%D8%A7%D8%B0%D9%84%D9%89+%D8%A7%D8%A8%D9%86%D9%89+%D8%A8%D9%8A%D8%AA%D9%83+7%D8%8C+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+6+%D8%A3%D9%83%D8%AA%D9%88%D8%A8%D8%B1%D8%8C+%D9%85%D8%AD%D8%A7%D9%81%D8%B8%D8%A9+%D8%A7%D9%84%D8%AC%D9%8A%D8%B2%D8%A9&t=&z=16&ie=UTF8&iwloc=B&output=embed';
                            } else if (newUrl) {
                              const qMatch = newUrl.match(/[?&]q=([^&]+)/);
                              const query = qMatch ? decodeURIComponent(qMatch[1]) : (settings.address || 'حزب الجبهة الوطنية قسم ثالث أكتوبر');
                              generatedEmbed = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=&z=16&ie=UTF8&iwloc=B&output=embed`;
                            }
                            setSettings({
                              ...settings,
                              locationUrl: newUrl,
                              ...(generatedEmbed ? { mapEmbedUrl: generatedEmbed } : {})
                            });
                          }}
                          className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-mono text-left bg-white focus:border-red-700"
                          dir="ltr"
                        />
                        <p className="text-[11px] text-stone-600">
                          يكفي لصق الرابط فقط هنا؛ ويقوم الموقع تلقائياً بإنشاء الخريطة التفاعلية وزر الانتقال للمقر دون الحاجة لكتابة إحداثيات أو أكواد تضمين.
                        </p>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSettings({
                                ...settings,
                                address: 'مقر أمانة قسم ثالث أكتوبر – طريق الشاذلي، ابني بيتك 7، قسم ثالث 6 أكتوبر، محافظة الجيزة 3265020',
                                locationUrl: 'https://maps.app.goo.gl/iw7sGSbbb2K1g6yZ7?g_st=ac',
                                mapEmbedUrl: 'https://maps.google.com/maps?q=%D8%AD%D8%B2%D8%A8+%D8%A7%D9%84%D8%AC%D8%A8%D9%87%D8%A9+%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A%D8%A9+%D8%A3%D9%85%D8%A7%D9%86%D8%A9+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+%D8%A7%D9%83%D8%AA%D9%88%D8%A8%D8%B1%D8%8C+%D8%B7%D8%B1%D9%8A%D9%82+%D8%A7%D9%84%D8%B4%D8%A7%D8%B0%D9%84%D9%89+%D8%A7%D8%A8%D9%86%D9%89+%D8%A8%D9%8A%D8%AA%D9%83+7%D8%8C+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+6+%D8%A3%D9%83%D8%AA%D9%88%D8%A8%D8%B1%D8%8C+%D9%85%D8%AD%D8%A7%D9%81%D8%B8%D8%A9+%D8%A7%D9%84%D8%AC%D9%8A%D8%B2%D8%A9&t=&z=16&ie=UTF8&iwloc=B&output=embed',
                                coordinates: '29.980836, 30.840788'
                              });
                            }}
                            className="bg-red-700 hover:bg-red-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl cursor-pointer transition-colors inline-flex items-center gap-1.5 shadow-xs"
                          >
                            <MapPin className="w-3.5 h-3.5 text-amber-300" />
                            <span>تثبيت الرابط المعتمد لمقر الحزب (قسم ثالث أكتوبر)</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Live Map Preview inside Admin Panel */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-stone-700 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-red-700" />
                          <span>معاينة خريطة مقر الحزب التفاعلية الحالية:</span>
                        </span>
                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          مقر معتمد ومحدد بدقة
                        </span>
                      </div>
                      <div className="aspect-[21/9] w-full rounded-2xl overflow-hidden border-2 border-amber-500/50 bg-stone-100 relative shadow-sm">
                        <iframe
                          title="معاينة موقع الأمانة"
                          src={
                            settings.mapEmbedUrl ||
                            'https://maps.google.com/maps?q=%D8%AD%D8%B2%D8%A8+%D8%A7%D9%84%D8%AC%D8%A8%D9%87%D8%A9+%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A%D8%A9+%D8%A3%D9%85%D8%A7%D9%86%D8%A9+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+%D8%A7%D9%83%D8%AA%D9%88%D8%A8%D8%B1%D8%8C+%D8%B7%D8%B1%D9%8A%D9%82+%D8%A7%D9%84%D8%B4%D8%A7%D8%B0%D9%84%D9%89+%D8%A7%D8%A8%D9%86%D9%89+%D8%A8%D9%8A%D8%AA%D9%83+7%D8%8C+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+6+%D8%A3%D9%83%D8%AA%D9%88%D8%A8%D8%B1%D8%8C+%D9%85%D8%AD%D8%A7%D9%81%D8%B8%D8%A9+%D8%A7%D9%84%D8%AC%D9%8A%D8%B2%D8%A9&t=&z=16&ie=UTF8&iwloc=B&output=embed'
                          }
                          className="w-full h-full border-0"
                          allowFullScreen
                          loading="lazy"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl">
                    <ImageFieldWithPicker
                      label="الشعار الرسمي المعتمد للحزب والأمانة"
                      value={settings.officialLogo || ''}
                      onChange={url => setSettings({ ...settings, officialLogo: url })}
                      media={media}
                      onMediaCreated={handleMediaCreated}
                      shape="rounded"
                      helpText="يظهر في ترويسة الموقع، الفوتر، وبطاقات المشاركة عبر وسائل التواصل"
                      pickerTitle="اختيار الشعار الرسمي للحزب من المعرض"
                    />
                  </div>

                  {/* Facebook Page & Social Links Card */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
                          f
                        </span>
                        <div>
                          <h3 className="text-xs font-black text-stone-900">
                            صفحة الفيسبوك الرسمية للحزب والأمانة
                          </h3>
                          <p className="text-[10px] text-stone-500">
                            رابط الصفحة الرسمية المعتمد ليظهر لزوار المنصة بالفوتر والروابط المعتمدة
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                        Facebook Official
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        رابط الصفحة على فيسبوك (Facebook URL)
                      </label>
                      <input
                        type="url"
                        placeholder="https://www.facebook.com/fational.front.party"
                        value={
                          settings.facebookUrl ||
                          settings.socialLinks?.find(l => l.platform === 'facebook')?.url ||
                          ''
                        }
                        onChange={e => {
                          const val = e.target.value;
                          const currentLinks = (settings.socialLinks || []).filter(l => l.platform !== 'youtube');
                          const fbIdx = currentLinks.findIndex(l => l.platform === 'facebook');
                          let updatedLinks = [...currentLinks];
                          if (fbIdx >= 0) {
                            updatedLinks[fbIdx] = { ...updatedLinks[fbIdx], url: val };
                          } else {
                            updatedLinks.unshift({
                              id: 'soc-fb',
                              platform: 'facebook',
                              url: val,
                              label: 'صفحة فيسبوك الرسمية'
                            });
                          }
                          setSettings({
                            ...settings,
                            facebookUrl: val,
                            socialLinks: updatedLinks
                          });
                        }}
                        className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-mono text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {/* Google Analytics 4 (GA4) Card */}
                  <div className="p-5 bg-stone-50 border border-stone-200 rounded-3xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
                          <BarChart3 className="w-5 h-5 text-white" />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-stone-900">
                              إحصاءات جوجل الرسمية (Google Analytics 4 - GA4)
                            </h3>
                            {settings.googleAnalyticsId?.trim() ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                                متصل ونشط
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-stone-200 text-stone-700 px-2 py-0.5 rounded-full">
                                بانتظار إدخال معرّف القياس
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-500 mt-0.5">
                            تتبع عدد الزوار، المشاهدات، مصادر حركة المرور (فيسبوك، بحث جوجل، واتساب)، وإحصائيات طلبات العضوية بدقة ولحظياً.
                          </p>
                        </div>
                      </div>
                      <a
                        href="https://analytics.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs self-start sm:self-auto cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-stone-500" />
                        لوحة تحكم إحصاءات جوجل
                      </a>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-stone-800">
                            معرف القياس (Measurement ID)
                          </label>
                          <span className="text-[11px] text-stone-500 font-mono">
                            يبدأ دائماً بـ G- (مثال: G-ABC123XYZ0)
                          </span>
                        </div>
                        <input
                          type="text"
                          placeholder="G-XXXXXXXXXX"
                          value={settings.googleAnalyticsId || ''}
                          onChange={e => setSettings({ ...settings, googleAnalyticsId: e.target.value.trim() })}
                          className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-mono text-left bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 tracking-wider font-bold"
                          dir="ltr"
                        />
                        <p className="text-[11px] text-stone-500 mt-1">
                          بمجرد حفظ هذا المعرّف، ستقوم المنصة تلقائياً بإرسال بيانات كل صفحة يتم تصفحها وزيارات الأمانات والأخبار وطلبات العضوية إلى حسابك في إحصاءات جوجل.
                        </p>
                      </div>

                      {/* Quick helpers & test row */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const origin = window.location.origin;
                            navigator.clipboard.writeText(origin);
                            setCopiedSiteUrl(true);
                            setTimeout(() => setCopiedSiteUrl(false), 2500);
                          }}
                          className="inline-flex items-center gap-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-stone-300 transition cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {copiedSiteUrl ? 'تم نسخ رابط الموقع!' : 'نسخ رابط الموقع لإضافته في جوجل'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!settings.googleAnalyticsId?.trim()) {
                              alert('يرجى أولاً إدخال معرّف القياس (Measurement ID) والضغط على "حفظ كافة الإعدادات".');
                              return;
                            }
                            initGoogleAnalytics(settings.googleAnalyticsId);
                            trackEvent('test_admin_ping', {
                              timestamp: new Date().toISOString(),
                              admin_user: user?.email || 'admin',
                              source: 'admin_panel_settings_test'
                            });
                            setGaTestStatus('تم إرسال حدث تجريبي بنجاح إلى إحصاءات جوجل! تفقد تقرير الوقت الفعلي (Realtime) في Google Analytics للتأكد.');
                            setTimeout(() => setGaTestStatus(null), 6000);
                          }}
                          className="inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold px-3 py-1.5 rounded-xl transition cursor-pointer"
                        >
                          <Activity className="w-3.5 h-3.5 text-amber-700" />
                          إرسال حدث وتجربة الاتصال اللحظي (Test Ping)
                        </button>
                      </div>

                      {gaTestStatus && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
                          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{gaTestStatus}</span>
                        </div>
                      )}

                      {/* Step-by-step guidance card */}
                      <div className="mt-3 p-4 bg-white border border-stone-200 rounded-2xl text-xs space-y-2 text-stone-700">
                        <div className="font-bold text-stone-900 flex items-center gap-2 text-xs">
                          <span className="w-5 h-5 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center text-[11px] font-black">؟</span>
                          كيفية الحصول على معرّف القياس (Measurement ID) مجاناً من جوجل:
                        </div>
                        <ol className="list-decimal list-inside space-y-1.5 text-stone-600 leading-relaxed pr-2">
                          <li>
                            افتح منصة إحصاءات جوجل عبر الرابط: <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline font-mono">analytics.google.com</a> وسجّل الدخول بحساب Google.
                          </li>
                          <li>
                            اضغط على أيقونة الإدارة <strong>(Admin ⚙️)</strong> أسفل القائمة الجانبية، ثم اختر <strong>إنشاء خاصية (Create Property)</strong>.
                          </li>
                          <li>
                            أدخل اسم الموقع (مثلاً: <em>حزب الجبهة الوطنية – قسم ثالث أكتوبر</em>)، ثم اختر <strong>الويب (Web)</strong> كمنصة لجمع البيانات.
                          </li>
                          <li>
                            ألصق رابط الموقع: <code className="bg-stone-100 px-1.5 py-0.5 rounded text-[11px] font-mono text-stone-800" dir="ltr">{window.location.origin}</code> وأعطِ المجرى اسماً مثل (موقع الحزب).
                          </li>
                          <li>
                            انسخ <strong>معرّف القياس (Measurement ID)</strong> الذي يبدأ بحرف <strong className="font-mono text-amber-700">G-</strong>، وألصقه في الحقل أعلاه واضغط على <strong>حفظ كافة الإعدادات</strong>.
                          </li>
                        </ol>
                      </div>
                    </div>
                  </div>

                  {/* DYNAMIC MEMBERSHIP APPLICATION FIELD SETTINGS */}
                  <div className="bg-stone-50 border-2 border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
                      <div>
                        <h3 className="text-base sm:text-lg font-black text-stone-900 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-amber-600" />
                          <span>إعدادات استمارة العضوية (التحكم في الحقول الإجبارية والاختيارية)</span>
                        </h3>
                        <p className="text-xs text-stone-500 mt-0.5">
                          تحديد أي حقول مطلوبة إجبارياً للقبول أو اختيارية، وتطبق فوراً على نموذج انضمام المواطنين بالبوابة
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            const allReq: Record<string, boolean> = {};
                            MEMBERSHIP_FORM_FIELDS.forEach(f => {
                              allReq[f.key] = true;
                            });
                            setSettings({
                              ...settings,
                              membershipFieldRequirements: allReq
                            });
                          }}
                          className="bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold px-3 py-1.5 rounded-xl border border-amber-300 transition-colors cursor-pointer"
                        >
                          تعيين كافة الحقول إجبارية (الافتراضي)
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const allOptional: Record<string, boolean> = {};
                            MEMBERSHIP_FORM_FIELDS.forEach(f => {
                              // keep fullName and nationalId and phone as required, others optional
                              allOptional[f.key] = ['fullName', 'nationalId', 'phone'].includes(f.key);
                            });
                            setSettings({
                              ...settings,
                              membershipFieldRequirements: allOptional
                            });
                          }}
                          className="bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-stone-300 transition-colors cursor-pointer"
                        >
                          جعل الحقول الإضافية اختيارية
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {MEMBERSHIP_FORM_FIELDS.map(field => {
                        const isReq = (settings.membershipFieldRequirements?.[field.key] !== false);
                        return (
                          <div
                            key={field.key}
                            className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                              isReq
                                ? 'bg-white border-red-200 shadow-xs'
                                : 'bg-stone-100/70 border-stone-200 opacity-80'
                            }`}
                          >
                            <div className="text-right">
                              <span className="text-xs font-bold text-stone-900 block">
                                {field.label}
                              </span>
                              <span className={`text-[10px] font-semibold ${isReq ? 'text-red-700 font-bold' : 'text-stone-500'}`}>
                                {isReq ? 'إجباري بالاستمارة (*)' : 'اختياري للمتقدم'}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const currentReqs = { ...(settings.membershipFieldRequirements || {}) };
                                currentReqs[field.key] = !isReq;
                                setSettings({
                                  ...settings,
                                  membershipFieldRequirements: currentReqs
                                });
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                                isReq
                                  ? 'bg-red-700 hover:bg-red-800 text-white'
                                  : 'bg-stone-200 hover:bg-stone-300 text-stone-700'
                              }`}
                            >
                              {isReq ? 'إجباري' : 'اختياري'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bottom Save & Actions Bar */}
                  <div className="mt-8 pt-4 border-t-2 border-stone-200 bg-stone-900 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-center sm:text-right">
                      <h4 className="font-black text-sm text-amber-400 flex items-center justify-center sm:justify-start gap-1.5">
                        <Save className="w-4 h-4" />
                        <span>تأكيد واعتماد هوية وإعدادات المنصة</span>
                      </h4>
                      <p className="text-[11px] text-stone-300 mt-0.5">
                        اضغط حفظ لتأكيد وحفظ كافة بيانات الهوية، البانر، أرقام التواصل، والروابط على الفور
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto">
                      <button
                        type="submit"
                        className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm px-8 py-3 rounded-2xl cursor-pointer flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
                      >
                        <Save className="w-5 h-5 text-amber-300" />
                        <span>حفظ</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* TAB: AUDIT LOG */}
            {activeTab === 'audit' && (
              <div className="space-y-6">
                <div className="border-b border-stone-100 pb-4">
                  <h2 className="text-xl font-black text-stone-900">
                    سجل العمليات الإدارية (Audit Log)
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    توثيق تاريخي آمن لكافة الإجراءات والتعديلات ومراجعات الطلبات مع تاريخ ووقت واسم المشرف المنفذ.
                  </p>
                </div>

                <div className="space-y-3">
                  {auditLogs.map(log => (
                    <div key={log.id} className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-red-700">{log.action}</span>
                          <span className="bg-stone-200 text-stone-700 text-[10px] px-1.5 py-0.5 rounded">{log.entityType}</span>
                          <span className="text-stone-400 font-mono text-[11px]">{log.adminEmail}</span>
                        </div>
                        <p className="text-stone-600 mt-1">{log.details}</p>
                      </div>
                      <span className="text-stone-400 font-mono text-[11px] shrink-0">
                        {log.timestamp.replace('T', ' ').substring(0, 19)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </main>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* APPLICATION REVIEW MODAL */}
      {/* ------------------------------------------------------------- */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 text-right shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setSelectedApp(null)}
              className="absolute top-4 left-4 p-2 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 cursor-pointer"
            >
              ✕
            </button>

            <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-6">
              <div>
                <span className="text-[11px] text-stone-400">مراجعة طلب الانضمام رقم:</span>
                <h3 className="text-xl font-black text-red-700 font-mono">{selectedApp.applicationNumber}</h3>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                selectedApp.status === 'جديد' ? 'bg-amber-100 text-amber-900' : (selectedApp.status === 'مقبول' ? 'bg-emerald-100 text-emerald-900' : 'bg-stone-100 text-stone-700')
              }`}>
                الحالة: {selectedApp.status}
              </span>
            </div>

            <div className="space-y-6">
              
              {/* Applicant Documents Grid */}
              <div>
                <h4 className="text-xs font-bold text-stone-700 mb-3">المستندات الرسمية المرفقة بالطلب:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="border border-stone-200 rounded-xl p-3 text-center bg-stone-50">
                    <span className="text-[11px] text-stone-500 font-bold block mb-2">الصورة الشخصية</span>
                    {selectedApp.personalPhotoUrl ? (
                      <img src={selectedApp.personalPhotoUrl} alt="شخصية" className="w-24 h-24 object-cover rounded-xl mx-auto shadow-xs" />
                    ) : (
                      <span className="text-xs text-stone-400">لم تُرفق</span>
                    )}
                  </div>

                  <div className="border border-stone-200 rounded-xl p-3 text-center bg-stone-50">
                    <span className="text-[11px] text-stone-500 font-bold block mb-2">بطاقة الرقم القومي (الوجه)</span>
                    {selectedApp.nationalIdFrontUrl ? (
                      <img src={selectedApp.nationalIdFrontUrl} alt="وجه البطاقة" className="w-full h-24 object-contain rounded-lg mx-auto shadow-xs bg-white" />
                    ) : (
                      <span className="text-xs text-stone-400">لم تُرفق</span>
                    )}
                  </div>

                  <div className="border border-stone-200 rounded-xl p-3 text-center bg-stone-50">
                    <span className="text-[11px] text-stone-500 font-bold block mb-2">بطاقة الرقم القومي (الظهر)</span>
                    {selectedApp.nationalIdBackUrl ? (
                      <img src={selectedApp.nationalIdBackUrl} alt="ظهر البطاقة" className="w-full h-24 object-contain rounded-lg mx-auto shadow-xs bg-white" />
                    ) : (
                      <span className="text-xs text-stone-400">لم تُرفق</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Applicant Details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-stone-50 p-4 rounded-2xl border border-stone-200">
                <div><span className="text-stone-400 block">الاسم:</span><span className="font-bold text-stone-900">{selectedApp.fullName}</span></div>
                <div><span className="text-stone-400 block">الرقم القومي:</span><span className="font-mono font-bold">{selectedApp.nationalId}</span></div>
                <div><span className="text-stone-400 block">الهاتف:</span><span className="font-mono">{selectedApp.phone}</span></div>
                <div><span className="text-stone-400 block">واتساب:</span><span className="font-mono">{selectedApp.whatsapp || selectedApp.phone}</span></div>
                <div><span className="text-stone-400 block">البريد:</span><span>{selectedApp.email || '-'}</span></div>
                <div><span className="text-stone-400 block">المؤهل:</span><span>{selectedApp.qualification || '-'}</span></div>
                <div><span className="text-stone-400 block">الوظيفة:</span><span>{selectedApp.job || '-'}</span></div>
                <div><span className="text-stone-400 block">جهة العمل:</span><span>{selectedApp.workplace || '-'}</span></div>
                <div><span className="text-stone-400 block">العنوان:</span><span>{selectedApp.address || '-'}</span></div>
              </div>

              {selectedApp.skills && (
                <div className="text-xs"><span className="font-bold text-stone-800">المهارات:</span> {selectedApp.skills}</div>
              )}
              {selectedApp.reasonForJoining && (
                <div className="text-xs"><span className="font-bold text-stone-800">سبب الرغبة في الانضمام:</span> {selectedApp.reasonForJoining}</div>
              )}

              {/* Review Actions */}
              <div className="pt-4 border-t border-stone-200 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">تحديث حالة الطلب</label>
                    <select
                      value={selectedApp.status}
                      onChange={e => setSelectedApp({ ...selectedApp, status: e.target.value as any })}
                      className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs font-bold"
                    >
                      <option value="جديد">جديد</option>
                      <option value="قيد المراجعة">قيد المراجعة</option>
                      <option value="مطلوب استكمال">مطلوب استكمال</option>
                      <option value="مقبول">مقبول</option>
                      <option value="مرفوض">مرفوض</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات إدارية داخلية</label>
                    <input
                      type="text"
                      placeholder="اكتب ملاحظات الفحص أو سبب القبول/الرفض..."
                      value={selectedApp.internalNotes || ''}
                      onChange={e => setSelectedApp({ ...selectedApp, internalNotes: e.target.value })}
                      className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    onClick={async () => {
                      await api.updateApplication(selectedApp.id, {
                        status: selectedApp.status,
                        internalNotes: selectedApp.internalNotes
                      });
                      loadAdminData();
                      alert('تم حفظ قرار المراجعة بنجاح');
                      setSelectedApp(null);
                    }}
                    className="bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs px-6 py-2.5 rounded-xl cursor-pointer"
                  >
                    حفظ حالة الطلب والملاحظات
                  </button>

                  {/* Convert to Member button */}
                  <button
                    onClick={() => {
                      setConvertingAppId(selectedApp.id);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <UserCheck className="w-4 h-4 text-emerald-200" />
                    <span>قبول وإدراج كعضو بالسجل وتعيين التكليف التنظيمي</span>
                  </button>
                </div>

                {selectedApp.reviewedBy && (
                  <p className="text-[11px] text-stone-400">
                    آخر مراجعة بواسطة: {selectedApp.reviewedBy} بتاريخ {selectedApp.reviewedAt?.split('T')[0]}
                  </p>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* CONVERT APPLICATION TO MEMBER DIALOG */}
      {convertingAppId && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-right space-y-4 shadow-2xl">
            <h3 className="text-lg font-black text-stone-900">
              تعيين التكليف التنظيمي بالسجل المركزي
            </h3>
            <p className="text-xs text-stone-500">
              حدد الأمانة والمسمى التنظيمي للشخص المقبول:
            </p>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">الأمانة</label>
              <select
                value={convertForm.secretariatId}
                onChange={e => setConvertForm({ ...convertForm, secretariatId: e.target.value })}
                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs"
              >
                <option value="">أمانة عامة (دون أمانة محددة)</option>
                {secretariats.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">المسمى التنظيمي</label>
              <input
                type="text"
                value={convertForm.title}
                onChange={e => setConvertForm({ ...convertForm, title: e.target.value })}
                placeholder="مثال: عضو أمانة، أمين مساعد، مسؤول ملف..."
                className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات التكليف</label>
              <textarea
                rows={2}
                value={convertForm.notes}
                onChange={e => setConvertForm({ ...convertForm, notes: e.target.value })}
                placeholder="ملاحظات القرار..."
                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={async () => {
                  try {
                    await api.convertToMember(convertingAppId, convertForm);
                    setConvertingAppId(null);
                    setSelectedApp(null);
                    loadAdminData();
                    onRefreshPublicData();
                    alert('تم قبول العضو وإدراجه في السجل المركزي والأمانة بنجاح!');
                  } catch (err: any) {
                    alert(err.message || 'حدث خطأ أثناء الإدراج بالسجل');
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1"
              >
                تأكيد التعيين بالسجل
              </button>
              <button
                onClick={() => setConvertingAppId(null)}
                className="bg-stone-200 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN MEMBER DIALOG */}
      {assigningMember && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-right space-y-4 shadow-2xl">
            <h3 className="text-lg font-black text-stone-900">
              إصدار تكليف جديد لـ: {assigningMember.fullName}
            </h3>
            <p className="text-xs text-stone-500">
              سيتم حفظ التكليف الحالي في السجل التاريخي وإصدار التكليف الجديد.
            </p>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">الأمانة المستهدفة</label>
              <select
                value={assignmentForm.secretariatId}
                onChange={e => setAssignmentForm({ ...assignmentForm, secretariatId: e.target.value })}
                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs"
              >
                <option value="">أمانة عامة بأكتوبر</option>
                {secretariats.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">المسمى التنظيمي الجديد</label>
              <input
                type="text"
                value={assignmentForm.title}
                onChange={e => setAssignmentForm({ ...assignmentForm, title: e.target.value })}
                className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات التكليف</label>
              <input
                type="text"
                value={assignmentForm.notes}
                onChange={e => setAssignmentForm({ ...assignmentForm, notes: e.target.value })}
                className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
              />
            </div>

            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={async () => {
                  await api.assignMember(assigningMember.id, assignmentForm);
                  setAssigningMember(null);
                  loadAdminData();
                  onRefreshPublicData();
                  alert('تم إصدار التكليف الجديد وتوثيقه في السجل التاريخي');
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1"
              >
                حفظ التكليف الجديد
              </button>
              <button
                onClick={() => setAssigningMember(null)}
                className="bg-stone-200 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRANSFER MEMBER BETWEEN SECRETARIATS MODAL */}
      {transferringMember && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-right space-y-4 shadow-2xl">
            <h3 className="text-lg font-black text-stone-900">
              نقل العضو: {transferringMember.name}
            </h3>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">الأمانة المستهدفة للنقل <span className="text-red-600">*</span></label>
              <select
                value={transferForm.targetSecretariatId}
                onChange={e => setTransferForm({ ...transferForm, targetSecretariatId: e.target.value })}
                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs"
              >
                <option value="">اختر الأمانة الجديدة...</option>
                {secretariats.filter(s => s.id !== transferringMember.secretariatId).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">المسمى في الأمانة الجديدة</label>
              <input
                type="text"
                value={transferForm.newRole}
                onChange={e => setTransferForm({ ...transferForm, newRole: e.target.value })}
                className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">سبب وملاحظات النقل</label>
              <input
                type="text"
                value={transferForm.notes}
                onChange={e => setTransferForm({ ...transferForm, notes: e.target.value })}
                className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
              />
            </div>

            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={async () => {
                  if (!transferForm.targetSecretariatId) {
                    alert('يرجى اختيار الأمانة المستهدفة');
                    return;
                  }
                  await api.transferSecretariatMember({
                    memberId: transferringMember.id,
                    targetSecretariatId: transferForm.targetSecretariatId,
                    newRole: transferForm.newRole,
                    notes: transferForm.notes
                  });
                  setTransferringMember(null);
                  loadAdminData();
                  onRefreshPublicData();
                  alert('تم نقل العضو بنجاح');
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1"
              >
                تأكيد النقل التنظيمي
              </button>
              <button
                onClick={() => setTransferringMember(null)}
                className="bg-stone-200 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PARTY LEADER CREATE / EDIT MODAL */}
      {showPartyLeaderModal && editingPartyLeader && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 text-right space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-stone-900">
              {editingPartyLeader.id ? 'تعديل قيادة حزبية' : 'إضافة قيادة حزبية جديدة (عامة/محافظات)'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">الاسم بالكامل <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  required
                  value={editingPartyLeader.name || ''}
                  onChange={e => setEditingPartyLeader({ ...editingPartyLeader, name: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  المنصب القيادي <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  list="leader-positions-list"
                  placeholder="اكتب المنصب القيادي (مثال: رئيس الحزب، نائب رئيس الحزب، الأمين العام، أمين محافظة الجيزة...)"
                  value={editingPartyLeader.position || ''}
                  onChange={e => setEditingPartyLeader({ ...editingPartyLeader, position: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs font-bold text-stone-900 focus:outline-hidden focus:border-red-700"
                />
                <datalist id="leader-positions-list">
                  <option value="رئيس الحزب" />
                  <option value="نائب رئيس الحزب" />
                  <option value="الأمين العام للحزب" />
                  <option value="الأمين العام المساعد" />
                  <option value="أمين تنظيم الجمهورية" />
                  <option value="أمين الحزب بمحافظة الجيزة" />
                  <option value="عضو الهيئة العليا" />
                  <option value="عضو المكتب السياسي" />
                </datalist>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className="text-[10px] text-stone-400 py-0.5">اقتراحات سريعة:</span>
                  {['رئيس الحزب', 'نائب رئيس الحزب', 'الأمين العام', 'أمين الحزب بمحافظة الجيزة'].map(pos => (
                    <button
                      type="button"
                      key={pos}
                      onClick={() => setEditingPartyLeader({ ...editingPartyLeader, position: pos })}
                      className="text-[10px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    تصنيف المستوى القيادي: <span className="text-red-600">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 mb-2">
                    <button
                      type="button"
                      onClick={() => setEditingPartyLeader({ ...editingPartyLeader, level: 'الهيئة العليا' })}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        editingPartyLeader.level === 'الهيئة العليا' || editingPartyLeader.level === 'عليا' || editingPartyLeader.level === 'المستوى العام ورئاسة الحزب'
                          ? 'bg-red-700 text-white border-red-800 shadow-xs'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      🏛️ الهيئة العليا (عام)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPartyLeader({ ...editingPartyLeader, level: 'قيادات المحافظات' })}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        editingPartyLeader.level === 'قيادات المحافظات' || editingPartyLeader.level === 'محافظة'
                          ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      📍 قيادات المحافظات
                    </button>
                  </div>

                  <input
                    type="text"
                    required
                    list="leader-levels-list"
                    placeholder="اكتب أو اختر المستوى القيادي..."
                    value={editingPartyLeader.level || ''}
                    onChange={e => setEditingPartyLeader({ ...editingPartyLeader, level: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs font-bold text-stone-900 focus:outline-hidden focus:border-red-700"
                  />
                  <datalist id="leader-levels-list">
                    <option value="الهيئة العليا" />
                    <option value="المستوى العام ورئاسة الحزب" />
                    <option value="قيادات المحافظات" />
                    <option value="أمانة محافظة الجيزة" />
                    <option value="المكتب السياسي" />
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">المحافظة (عند الحاجة)</label>
                  <input
                    type="text"
                    placeholder="مثال: محافظة الجيزة، القاهرة..."
                    value={editingPartyLeader.governorate || ''}
                    onChange={e => setEditingPartyLeader({ ...editingPartyLeader, governorate: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                  />
                </div>
              </div>

              <ImageFieldWithPicker
                label="الصورة الشخصية للقيادة الحزبية"
                value={editingPartyLeader.photoUrl || ''}
                onChange={url => setEditingPartyLeader({ ...editingPartyLeader, photoUrl: url })}
                media={media}
                onMediaCreated={handleMediaCreated}
                shape="circle"
                helpText="اختر من صور المعرض أو ارفع من جهازك مباشرة"
                pickerTitle="اختيار صورة شخصية لقيادة الحزب من المعرض"
              />

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">النبذة التعريفية</label>
                <textarea
                  rows={3}
                  value={editingPartyLeader.bio || ''}
                  onChange={e => setEditingPartyLeader({ ...editingPartyLeader, bio: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">ترتيب الظهور</label>
                  <input
                    type="number"
                    value={editingPartyLeader.sortOrder || 1}
                    onChange={e => setEditingPartyLeader({ ...editingPartyLeader, sortOrder: Number(e.target.value) })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                  />
                </div>

                <div className="pt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingPartyLeader.isVisible !== false}
                      onChange={e => setEditingPartyLeader({ ...editingPartyLeader, isVisible: e.target.checked })}
                      className="w-4 h-4 text-red-700"
                    />
                    <span className="text-xs font-bold text-stone-800">إظهار على الموقع</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={async () => {
                  if (!editingPartyLeader.name || !editingPartyLeader.position) {
                    alert('يرجى إدخال الاسم والمنصب القيادي');
                    return;
                  }
                  if (editingPartyLeader.id) {
                    await api.updatePartyLeader(editingPartyLeader.id, editingPartyLeader);
                  } else {
                    await api.createPartyLeader(editingPartyLeader);
                  }
                  setShowPartyLeaderModal(false);
                  loadAdminData();
                  onRefreshPublicData();
                }}
                className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1"
              >
                حفظ بيانات القيادة
              </button>
              <button
                onClick={() => setShowPartyLeaderModal(false)}
                className="bg-stone-200 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECRETARIAT LEADER (3rd October) CREATE / EDIT MODAL */}
      {showSecLeaderModal && editingSecLeader && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 text-right space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-stone-900">
              {editingSecLeader.id ? 'تعديل قيادة بأمانة أكتوبر' : 'إضافة قيادة بأمانة قسم ثالث أكتوبر'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">الاسم بالكامل <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  required
                  value={editingSecLeader.name || ''}
                  onChange={e => setEditingSecLeader({ ...editingSecLeader, name: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">المسمى الوظيفي الفعلي <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أمين أمانة قسم ثالث أكتوبر، أمين إعلام، أمين تنظيم، أمين تكنولوجيا..."
                  value={editingSecLeader.title || ''}
                  onChange={e => setEditingSecLeader({ ...editingSecLeader, title: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">تاريخ تولي المسؤولية</label>
                <input
                  type="date"
                  value={editingSecLeader.appointmentDate || ''}
                  onChange={e => setEditingSecLeader({ ...editingSecLeader, appointmentDate: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <ImageFieldWithPicker
                label="الصورة الشخصية لقيادة أمانة قسم ثالث أكتوبر"
                value={editingSecLeader.photoUrl || ''}
                onChange={url => setEditingSecLeader({ ...editingSecLeader, photoUrl: url })}
                media={media}
                onMediaCreated={handleMediaCreated}
                shape="circle"
                helpText="اختر من صور المعرض أو ارفع من جهازك مباشرة"
                pickerTitle="اختيار صورة شخصية لقيادة أمانة قسم ثالث أكتوبر من المعرض"
              />

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">النبذة التعريفية</label>
                <textarea
                  rows={3}
                  value={editingSecLeader.bio || ''}
                  onChange={e => setEditingSecLeader({ ...editingSecLeader, bio: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">ترتيب الظهور</label>
                  <input
                    type="number"
                    value={editingSecLeader.sortOrder || 1}
                    onChange={e => setEditingSecLeader({ ...editingSecLeader, sortOrder: Number(e.target.value) })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                  />
                </div>

                <div className="pt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingSecLeader.isVisible !== false}
                      onChange={e => setEditingSecLeader({ ...editingSecLeader, isVisible: e.target.checked })}
                      className="w-4 h-4 text-red-700"
                    />
                    <span className="text-xs font-bold text-stone-800">إظهار على الموقع</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={async () => {
                  if (!editingSecLeader.name || !editingSecLeader.title) {
                    alert('يرجى إدخال الاسم والمسمى الوظيفي');
                    return;
                  }
                  if (editingSecLeader.id) {
                    await api.updateSecretariatLeader(editingSecLeader.id, editingSecLeader);
                  } else {
                    await api.createSecretariatLeader(editingSecLeader);
                  }
                  setShowSecLeaderModal(false);
                  loadAdminData();
                  onRefreshPublicData();
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1"
              >
                حفظ بيانات القيادة
              </button>
              <button
                onClick={() => setShowSecLeaderModal(false)}
                className="bg-stone-200 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SPECIALIZED SECRETARIAT MODAL */}
      {showSecretariatModal && editingSecretariat && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 text-right space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            <h3 className="text-lg font-black text-stone-900 border-b border-stone-100 pb-3">
              {editingSecretariat.id ? `تعديل: ${editingSecretariat.name}` : 'إضافة أمانة جديدة'}
            </h3>

            <div className="space-y-4">
              {/* Basic Info */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  اسم الأمانة <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أمانة إدارة الموارد البشرية"
                  value={editingSecretariat.name || ''}
                  onChange={e => setEditingSecretariat({ ...editingSecretariat, name: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">الوصف العام للأمانة ورسالتها</label>
                <textarea
                  rows={2}
                  value={editingSecretariat.description || ''}
                  onChange={e => setEditingSecretariat({ ...editingSecretariat, description: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              {/* Secretary Section */}
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
                  <UserCheck className="w-4 h-4 text-red-700" />
                  <span className="text-xs font-black text-stone-900">أمين الأمانة (المسؤول الأول)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">اسم أمين الأمانة</label>
                    <input
                      type="text"
                      placeholder="الاسم الثلاثي أو الرباعي..."
                      value={editingSecretariat.secretaryName || ''}
                      onChange={e => setEditingSecretariat({ ...editingSecretariat, secretaryName: e.target.value })}
                      className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">رقم الهاتف / واتساب</label>
                    <input
                      type="text"
                      placeholder="010XXXXXXXX"
                      dir="ltr"
                      value={editingSecretariat.secretaryPhone || ''}
                      onChange={e => setEditingSecretariat({ ...editingSecretariat, secretaryPhone: e.target.value })}
                      className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-xs bg-white text-right"
                    />
                  </div>
                </div>

                <ImageFieldWithPicker
                  label="الصورة الشخصية لأمين الأمانة"
                  value={editingSecretariat.secretaryPhotoUrl || ''}
                  onChange={url => setEditingSecretariat({ ...editingSecretariat, secretaryPhotoUrl: url })}
                  media={media}
                  onMediaCreated={handleMediaCreated}
                  shape="circle"
                  helpText="اختر من صور المعرض أو ارفع من جهازك مباشرة"
                  pickerTitle={`اختيار صورة أمين أمانة: ${editingSecretariat.name || ''}`}
                />

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">نبذة تعريفية عن أمين الأمانة</label>
                  <input
                    type="text"
                    placeholder="مؤهلات وخبرات أمين الأمانة..."
                    value={editingSecretariat.secretaryBio || ''}
                    onChange={e => setEditingSecretariat({ ...editingSecretariat, secretaryBio: e.target.value })}
                    className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-xs bg-white"
                  />
                </div>
              </div>

              {/* Assistant Secretary Section */}
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
                  <UserCheck className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-black text-stone-900">الأمين المساعد للأمانة</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">اسم الأمين المساعد</label>
                    <input
                      type="text"
                      placeholder="الاسم الثلاثي أو الرباعي..."
                      value={editingSecretariat.assistantSecretaryName || ''}
                      onChange={e => setEditingSecretariat({ ...editingSecretariat, assistantSecretaryName: e.target.value })}
                      className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">رقم الهاتف / واتساب</label>
                    <input
                      type="text"
                      placeholder="010XXXXXXXX"
                      dir="ltr"
                      value={editingSecretariat.assistantSecretaryPhone || ''}
                      onChange={e => setEditingSecretariat({ ...editingSecretariat, assistantSecretaryPhone: e.target.value })}
                      className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-xs bg-white text-right"
                    />
                  </div>
                </div>

                <ImageFieldWithPicker
                  label="الصورة الشخصية للأمين المساعد"
                  value={editingSecretariat.assistantSecretaryPhotoUrl || ''}
                  onChange={url => setEditingSecretariat({ ...editingSecretariat, assistantSecretaryPhotoUrl: url })}
                  media={media}
                  onMediaCreated={handleMediaCreated}
                  shape="circle"
                  helpText="اختر من صور المعرض أو ارفع من جهازك مباشرة"
                  pickerTitle={`اختيار صورة الأمين المساعد: ${editingSecretariat.name || ''}`}
                />

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">نبذة تعريفية عن الأمين المساعد</label>
                  <input
                    type="text"
                    placeholder="مؤهلات وخبرات الأمين المساعد..."
                    value={editingSecretariat.assistantSecretaryBio || ''}
                    onChange={e => setEditingSecretariat({ ...editingSecretariat, assistantSecretaryBio: e.target.value })}
                    className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-xs bg-white"
                  />
                </div>
              </div>

              {/* Bureau Members in Modal */}
              {editingSecretariat.id && (
                <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-black text-stone-900">
                        أعضاء هيئة مكتب هذه الأمانة ({secretariatMembers.filter(m => m.secretariatId === editingSecretariat.id && m.tier !== 'secretary' && m.tier !== 'assistant_secretary').length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSecMember({
                          secretariatId: editingSecretariat.id,
                          tier: 'bureau',
                          role: 'عضو هيئة مكتب',
                          bureauTitle: '',
                          assignmentDate: new Date().toISOString().substring(0, 10)
                        });
                        setShowSecMemberModal(true);
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ إضافة عضو هيئة مكتب</span>
                    </button>
                  </div>
                  {secretariatMembers.filter(m => m.secretariatId === editingSecretariat.id && m.tier !== 'secretary' && m.tier !== 'assistant_secretary').length === 0 ? (
                    <p className="text-[11px] text-stone-400 text-center py-1">لا يوجد أعضاء هيئة مكتب مضافين حتى الآن.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {secretariatMembers.filter(m => m.secretariatId === editingSecretariat.id && m.tier !== 'secretary' && m.tier !== 'assistant_secretary').map(m => (
                        <div key={m.id} className="p-2 bg-white rounded-xl border border-stone-200 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            {m.photoUrl ? (
                              <img src={m.photoUrl} alt={m.name} className="w-7 h-7 rounded-full object-cover border border-amber-400 shrink-0" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-bold text-[10px] shrink-0">{m.name.substring(0, 1)}</div>
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-stone-900 truncate">{m.name}</div>
                              <div className="text-[10px] text-amber-700 font-semibold truncate">{m.bureauTitle || m.role}</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSecMember({ ...m });
                              setShowSecMemberModal(true);
                            }}
                            className="text-stone-400 hover:text-stone-700 p-1 cursor-pointer"
                            title="تعديل"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Secretariat Photo Gallery */}
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl">
                <MultiImageGalleryField
                  label="معرض صور الأمانة"
                  images={editingSecretariat.galleryImages || []}
                  onChange={imgs => setEditingSecretariat({ ...editingSecretariat, galleryImages: imgs })}
                  media={media}
                  onMediaCreated={handleMediaCreated}
                  pickerTitle={`معرض صور أمانة: ${editingSecretariat.name || ''}`}
                />
              </div>

              {/* Secretariat Video Gallery */}
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-red-700" />
                    <span className="text-xs font-black text-stone-900">
                      معرض فيديوهات الأمانة ({editingSecretariat.videos?.length || 0})
                    </span>
                  </div>
                </div>

                {/* Add Video Row */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-white p-2.5 rounded-xl border border-stone-200">
                  <div className="sm:col-span-5">
                    <input
                      type="text"
                      placeholder="عنوان الفيديو..."
                      value={newSecVideoTitle}
                      onChange={e => setNewSecVideoTitle(e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <input
                      type="text"
                      placeholder="رابط يوتيوب أو فيديو MP4..."
                      value={newSecVideoUrl}
                      onChange={e => setNewSecVideoUrl(e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!newSecVideoTitle || !newSecVideoUrl) {
                          alert('يرجى إدخال عنوان ورابط الفيديو');
                          return;
                        }
                        const current = editingSecretariat.videos || [];
                        setEditingSecretariat({
                          ...editingSecretariat,
                          videos: [...current, { title: newSecVideoTitle, url: newSecVideoUrl }]
                        });
                        setNewSecVideoTitle('');
                        setNewSecVideoUrl('');
                      }}
                      className="w-full bg-red-700 hover:bg-red-800 text-white font-bold text-xs py-1.5 rounded-lg cursor-pointer"
                    >
                      + إضافة
                    </button>
                  </div>
                </div>

                {(!editingSecretariat.videos || editingSecretariat.videos.length === 0) ? (
                  <p className="text-[11px] text-stone-400 text-center py-2">لا توجد فيديوهات مضافة للأمانة حالياً.</p>
                ) : (
                  <div className="space-y-1.5">
                    {editingSecretariat.videos.map((vid, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-lg border border-stone-200 text-xs">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <Video className="w-3.5 h-3.5 text-red-700 shrink-0" />
                          <span className="font-bold text-stone-800 truncate">{vid.title}</span>
                          <span className="text-[10px] text-stone-400 font-mono truncate max-w-xs">{vid.url}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const current = editingSecretariat.videos || [];
                            setEditingSecretariat({
                              ...editingSecretariat,
                              videos: current.filter((_, i) => i !== idx)
                            });
                          }}
                          className="text-stone-400 hover:text-red-600 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Duties & Goals */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">مهام واختصاصات الأمانة (كل مهمة في سطر)</label>
                <textarea
                  rows={3}
                  value={Array.isArray(editingSecretariat.duties) ? editingSecretariat.duties.join('\n') : ''}
                  onChange={e => setEditingSecretariat({ ...editingSecretariat, duties: e.target.value.split('\n').filter(Boolean) })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">أهداف الأمانة (كل هدف في سطر)</label>
                <textarea
                  rows={3}
                  value={Array.isArray(editingSecretariat.goals) ? editingSecretariat.goals.join('\n') : ''}
                  onChange={e => setEditingSecretariat({ ...editingSecretariat, goals: e.target.value.split('\n').filter(Boolean) })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="sec-active-chk"
                  checked={editingSecretariat.isActive !== false}
                  onChange={e => setEditingSecretariat({ ...editingSecretariat, isActive: e.target.checked })}
                  className="w-4 h-4 text-red-700"
                />
                <label htmlFor="sec-active-chk" className="text-xs font-bold text-stone-800 cursor-pointer">
                  الأمانة مفعلة ونشطة
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-stone-100">
              <div className="flex items-center gap-2 flex-1">
                <button
                  type="button"
                  onClick={async () => {
                    if (!editingSecretariat.name || !editingSecretariat.name.trim()) {
                      alert('يرجى إدخال اسم الأمانة');
                      return;
                    }
                    try {
                      if (editingSecretariat.id) {
                        await api.updateSecretariat(editingSecretariat.id, editingSecretariat);
                      } else {
                        const autoSlug = editingSecretariat.slug || editingSecretariat.name.toLowerCase().trim().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-') || ('sec-' + Date.now());
                        await api.createSecretariat({ ...editingSecretariat, slug: autoSlug });
                      }
                      setShowSecretariatModal(false);
                      loadAdminData();
                      onRefreshPublicData();
                      alert('تم حفظ الأمانة بنجاح!');
                    } catch (err: any) {
                      alert(err.message || 'حدث خطأ أثناء حفظ الأمانة');
                    }
                  }}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1 transition-colors shadow-xs flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingSecretariat.id ? 'حفظ تعديلات الأمانة' : 'حفظ وإضافة الأمانة الآن'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSecretariatModal(false)}
                  className="bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer transition-colors"
                >
                  إلغاء
                </button>
              </div>

              {editingSecretariat.id && (
                <button
                  type="button"
                  onClick={async () => {
                    const secId = editingSecretariat.id;
                    if (!secId) return;
                    if (confirm(`هل أنت متأكد من حذف أمانة "${editingSecretariat.name}" نهائياً من الموقع؟`)) {
                      try {
                        await api.deleteSecretariat(secId);
                        setShowSecretariatModal(false);
                        loadAdminData();
                        onRefreshPublicData();
                      } catch (err: any) {
                        alert(err.message || 'حدث خطأ أثناء حذف الأمانة');
                      }
                    }
                  }}
                  className="bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 border border-red-200 text-xs font-bold px-3.5 py-2.5 rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                  title="حذف هذه الأمانة نهائياً"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف هذه الأمانة</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECRETARIAT MEMBER & BUREAU MEMBER CREATE / EDIT MODAL */}
      {showSecMemberModal && editingSecMember && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 text-right space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-stone-900 border-b border-stone-100 pb-3">
              {editingSecMember.id ? 'تعديل بيانات كادر / عضو أمانة' : 'إضافة كادر أو عضو بهيئة مكتب الأمانة'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  الأمانة التابع لها <span className="text-red-600">*</span>
                </label>
                <select
                  value={editingSecMember.secretariatId || ''}
                  onChange={e => setEditingSecMember({ ...editingSecMember, secretariatId: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs font-bold text-stone-900"
                >
                  <option value="">اختر الأمانة...</option>
                  {secretariats.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  المستوى التنظيمي داخل الأمانة <span className="text-red-600">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'bureau', label: 'عضو هيئة مكتب الأمانة', desc: 'قيادة تنفيذية بالأمانة' },
                    { id: 'member', label: 'عضو أمانة عام', desc: 'عضوية عامة باللجان' },
                    { id: 'secretary', label: 'أمين الأمانة', desc: 'المسؤول الأول للأمانة' },
                    { id: 'assistant_secretary', label: 'أمين مساعد الأمانة', desc: 'نائب أمين الأمانة' }
                  ].map(t => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setEditingSecMember({
                        ...editingSecMember,
                        tier: t.id as any,
                        role: t.id === 'bureau' ? (editingSecMember.role || 'عضو هيئة مكتب') : t.label
                      })}
                      className={`p-2.5 rounded-xl border text-right cursor-pointer transition-all ${
                        editingSecMember.tier === t.id
                          ? 'border-red-700 bg-red-50 text-red-950 font-black shadow-xs'
                          : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <div className="text-xs">{t.label}</div>
                      <div className="text-[10px] text-stone-400 font-normal">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  الاسم بالكامل <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="الاسم الرباعي أو الثلاثي..."
                  value={editingSecMember.name || ''}
                  onChange={e => setEditingSecMember({ ...editingSecMember, name: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    المسمى / التكليف التنظيمي <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: مقرر هيئة المكتب، مسؤول الفعاليات..."
                    value={editingSecMember.role || ''}
                    onChange={e => setEditingSecMember({ ...editingSecMember, role: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    صفة هيئة المكتب (إن وُجدت)
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: منسق اللجان، أمين سر هيئة المكتب..."
                    value={editingSecMember.bureauTitle || ''}
                    onChange={e => setEditingSecMember({ ...editingSecMember, bureauTitle: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                  />
                </div>
              </div>

              {/* Personal Photo Upload */}
              <ImageFieldWithPicker
                label="الصورة الشخصية للكادر / عضو الأمانة"
                value={editingSecMember.photoUrl || ''}
                onChange={url => setEditingSecMember({ ...editingSecMember, photoUrl: url })}
                media={media}
                onMediaCreated={handleMediaCreated}
                shape="circle"
                helpText="اختر من صور المعرض أو ارفع من جهازك مباشرة"
                pickerTitle="اختيار صورة شخصية للعضو / الكادر الحزبي من المعرض"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">رقم الهاتف / واتساب</label>
                  <input
                    type="text"
                    placeholder="010XXXXXXXX"
                    dir="ltr"
                    value={editingSecMember.phone || ''}
                    onChange={e => setEditingSecMember({ ...editingSecMember, phone: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs text-right"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    placeholder="member@example.com"
                    dir="ltr"
                    value={editingSecMember.email || ''}
                    onChange={e => setEditingSecMember({ ...editingSecMember, email: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">تاريخ التكليف</label>
                  <input
                    type="date"
                    value={editingSecMember.assignmentDate || ''}
                    onChange={e => setEditingSecMember({ ...editingSecMember, assignmentDate: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات وقرار التكليف</label>
                  <input
                    type="text"
                    placeholder="رقم القرار أو ملاحظات..."
                    value={editingSecMember.notes || ''}
                    onChange={e => setEditingSecMember({ ...editingSecMember, notes: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-stone-100">
              <button
                onClick={async () => {
                  if (!editingSecMember.name || !editingSecMember.secretariatId || !editingSecMember.role) {
                    alert('يرجى اختيار الأمانة وكتابة الاسم والمسمى التنظيمي');
                    return;
                  }
                  if (editingSecMember.id) {
                    await api.updateSecretariatMember(editingSecMember.id, editingSecMember);
                  } else {
                    await api.createSecretariatMember(editingSecMember);
                  }
                  setShowSecMemberModal(false);
                  loadAdminData();
                  onRefreshPublicData();
                  alert('تم حفظ بيانات العضو / كادر الأمانة بنجاح');
                }}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1 transition-colors shadow-xs flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>حفظ بيانات كادر الأمانة</span>
              </button>
              <button
                onClick={() => setShowSecMemberModal(false)}
                className="bg-stone-200 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HERO SLIDE MEDIA PICKER MODAL */}
      {heroSlidePickerIdx !== null && settings && (
        <MediaPickerModal
          isOpen={true}
          onClose={() => setHeroSlidePickerIdx(null)}
          onSelect={(selectedUrls) => {
            const url = selectedUrls[0] || '';
            const updated = [...(settings.heroSlides || [])];
            if (updated[heroSlidePickerIdx]) {
              updated[heroSlidePickerIdx] = {
                ...updated[heroSlidePickerIdx],
                url: url,
                type: 'image'
              };
              setSettings({ ...settings, heroSlides: updated });
            }
            setHeroSlidePickerIdx(null);
          }}
          media={media}
          onMediaCreated={handleMediaCreated}
          title="اختيار وسيط لشريحة البانر الرئيسي من المعرض"
        />
      )}

      {/* MEDIA PICKER MODAL (Choose from general album into secretariat) */}
      {showMediaPickerModal && editingSecretariat && (
        <div className="fixed inset-0 z-70 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 text-right space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-base font-black text-stone-900">
                  اختيار وسائط من المعرض العام لأمانة: {editingSecretariat.name}
                </h3>
                <p className="text-xs text-stone-500">
                  انقر على أي صورة أو فيديو لإضافتها فوراً إلى ألبوم هذه الأمانة.
                </p>
              </div>
              <button
                onClick={() => setShowMediaPickerModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {media.length === 0 ? (
              <p className="text-xs text-stone-500 text-center py-8">
                لا توجد وسائط في المعرض العام حالياً. يمكنك رفع وسائط جديدة من تبويب &quot;معرض الصور والفيديوهات&quot;.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-96 overflow-y-auto p-1">
                {media.map(m => {
                  const isImage = m.type === 'photo';
                  const alreadyAdded = isImage
                    ? editingSecretariat.galleryImages?.includes(m.url)
                    : editingSecretariat.videos?.some(v => v.url === m.url);

                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        if (alreadyAdded) return;
                        if (isImage) {
                          const current = editingSecretariat.galleryImages || [];
                          setEditingSecretariat({
                            ...editingSecretariat,
                            galleryImages: [...current, m.url]
                          });
                        } else {
                          const current = editingSecretariat.videos || [];
                          setEditingSecretariat({
                            ...editingSecretariat,
                            videos: [...current, { title: m.title, url: m.url, thumbnail: m.thumbnail }]
                          });
                        }
                      }}
                      className={`relative rounded-xl overflow-hidden border p-2 cursor-pointer transition-all ${
                        alreadyAdded
                          ? 'border-emerald-500 bg-emerald-50 opacity-60 cursor-not-allowed'
                          : 'border-stone-200 bg-stone-50 hover:border-red-600 hover:shadow-md'
                      }`}
                    >
                      <div className="aspect-video rounded-lg overflow-hidden bg-stone-200 mb-2">
                        <img
                          src={m.thumbnail || m.url}
                          alt={m.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="text-[11px] font-bold text-stone-900 truncate">{m.title}</div>
                      <div className="text-[10px] text-stone-500 flex items-center justify-between mt-1">
                        <span>{isImage ? 'صورة' : 'فيديو'}</span>
                        {alreadyAdded && <span className="text-emerald-700 font-bold">✓ مضاف</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowMediaPickerModal(false)}
                className="bg-stone-900 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INITIATIVE MODAL */}
      {showInitiativeModal && editingInitiative && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 text-right space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-stone-900">
              {editingInitiative.id ? 'تعديل المبادرة' : 'إضافة مبادرة جديدة'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">اسم المبادرة <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  required
                  value={editingInitiative.title || ''}
                  onChange={e => setEditingInitiative({ ...editingInitiative, title: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">وصف المبادرة</label>
                <textarea
                  rows={2}
                  value={editingInitiative.description || ''}
                  onChange={e => setEditingInitiative({ ...editingInitiative, description: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">حالة المبادرة</label>
                  <select
                    value={editingInitiative.status || 'active'}
                    onChange={e => setEditingInitiative({ ...editingInitiative, status: e.target.value as any })}
                    className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs"
                  >
                    <option value="active">نشطة</option>
                    <option value="paused">متوقفة مؤقتاً</option>
                    <option value="completed">منتهية</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">تاريخ البداية</label>
                  <input
                    type="date"
                    value={editingInitiative.startDate || ''}
                    onChange={e => setEditingInitiative({ ...editingInitiative, startDate: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">أهداف المبادرة (كل هدف في سطر)</label>
                <textarea
                  rows={2}
                  value={Array.isArray(editingInitiative.goals) ? editingInitiative.goals.join('\n') : ''}
                  onChange={e => setEditingInitiative({ ...editingInitiative, goals: e.target.value.split('\n').filter(Boolean) })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <ImageFieldWithPicker
                label="صورة أو غلاف المبادرة"
                value={editingInitiative.coverUrl || ''}
                onChange={url => setEditingInitiative({ ...editingInitiative, coverUrl: url })}
                media={media}
                onMediaCreated={handleMediaCreated}
                shape="banner"
                helpText="اختر من صور المعرض أو ارفع من جهازك مباشرة"
                pickerTitle={`اختيار صورة لمبادرة: ${editingInitiative.title || ''}`}
              />

              <MultiImageGalleryField
                label="ألبوم ومعرض صور المبادرة (صور متعددة)"
                images={editingInitiative.galleryImages || []}
                onChange={imgs => setEditingInitiative({ ...editingInitiative, galleryImages: imgs })}
                media={media}
                onMediaCreated={handleMediaCreated}
                pickerTitle={`معرض صور مبادرة: ${editingInitiative.title || ''}`}
              />
            </div>

            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={async () => {
                  if (!editingInitiative.title) {
                    alert('يرجى إدخال اسم المبادرة');
                    return;
                  }
                  if (editingInitiative.id) {
                    await api.updateInitiative(editingInitiative.id, editingInitiative);
                  } else {
                    await api.createInitiative(editingInitiative);
                  }
                  setShowInitiativeModal(false);
                  loadAdminData();
                  onRefreshPublicData();
                }}
                className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1"
              >
                حفظ المبادرة
              </button>
              <button
                onClick={() => setShowInitiativeModal(false)}
                className="bg-stone-200 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEWS MODAL */}
      {showNewsModal && editingNews && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 text-right space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-stone-900">
              {editingNews.id ? 'تعديل الخبر' : 'إضافة خبر جديد'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">عنوان الخبر <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  required
                  value={editingNews.title || ''}
                  onChange={e => setEditingNews({ ...editingNews, title: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">نص الخبر كاملاً <span className="text-red-600">*</span></label>
                <textarea
                  rows={4}
                  required
                  value={editingNews.content || ''}
                  onChange={e => setEditingNews({ ...editingNews, content: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <ImageFieldWithPicker
                label="الصورة الرئيسية للخبر (الغلاف)"
                value={editingNews.coverImage || ''}
                onChange={url => setEditingNews({ ...editingNews, coverImage: url })}
                media={media}
                onMediaCreated={handleMediaCreated}
                shape="banner"
                helpText="اختر من صور المعرض أو ارفع من جهازك مباشرة"
                pickerTitle={`اختيار صورة رئيسية للخبر: ${editingNews.title || ''}`}
              />

              <MultiImageGalleryField
                label="ألبوم الصور المرفقة مع الخبر"
                images={editingNews.galleryImages || []}
                onChange={imgs => setEditingNews({ ...editingNews, galleryImages: imgs })}
                media={media}
                onMediaCreated={handleMediaCreated}
                pickerTitle={`ألبوم صور الخبر: ${editingNews.title || ''}`}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">تاريخ النشر</label>
                  <input
                    type="date"
                    value={editingNews.publishDate || ''}
                    onChange={e => setEditingNews({ ...editingNews, publishDate: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">أمانة مرتبطة</label>
                  <select
                    value={editingNews.linkedSecretariatId || ''}
                    onChange={e => setEditingNews({ ...editingNews, linkedSecretariatId: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs"
                  >
                    <option value="">عام (بدون ربط)</option>
                    {secretariats.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Publisher / Author Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-stone-50 border border-stone-200 p-3 rounded-2xl">
                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">
                    اسم ناشر الخبر / المحرر
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: أ. معاذ محمود / الأمانة الإعلامية"
                    value={editingNews.authorName || ''}
                    onChange={e => setEditingNews({ ...editingNews, authorName: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs bg-white text-stone-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">
                    المنصب أو الصفة الحزبية
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: أمين التنظيم / أمين الإعلام / عضو هيئة المكتب"
                    value={editingNews.authorPosition || ''}
                    onChange={e => setEditingNews({ ...editingNews, authorPosition: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs bg-white text-stone-900"
                  />
                </div>
              </div>

              {/* News Attached Video */}
              <VideoUploadField
                label="مقطع فيديو مرافق للخبر (اختياري - رفع ملف أو رابط يوتيوب/فيسبوك/MP4)"
                value={editingNews.videoUrl || ''}
                onChange={url => setEditingNews({ ...editingNews, videoUrl: url })}
                helpText="يظهر مشغل الفيديو الاحترافي مباشرة داخل صفحة تفاصيل الخبر"
              />

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl">
                  <input
                    type="checkbox"
                    checked={editingNews.isUrgent || false}
                    onChange={e => setEditingNews({ ...editingNews, isUrgent: e.target.checked })}
                    className="w-4 h-4 text-red-600 focus:ring-red-500 rounded"
                  />
                  <span className="text-xs font-black text-red-700 flex items-center gap-1">
                    <span>⚡ خبر عاجل (عاجل)</span>
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingNews.isFeatured || false}
                    onChange={e => setEditingNews({ ...editingNews, isFeatured: e.target.checked })}
                    className="w-4 h-4 text-amber-600"
                  />
                  <span className="text-xs font-bold text-stone-800">خبر مميز</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingNews.isDraft || false}
                    onChange={e => setEditingNews({ ...editingNews, isDraft: e.target.checked })}
                    className="w-4 h-4 text-stone-700"
                  />
                  <span className="text-xs font-bold text-stone-800">حفظ كمسودة فقط</span>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={async () => {
                  if (!editingNews.title || !editingNews.content) {
                    alert('يرجى إدخال العنوان والمحتوى');
                    return;
                  }
                  if (editingNews.id) {
                    await api.updateNews(editingNews.id, editingNews);
                  } else {
                    await api.createNews(editingNews);
                  }
                  setShowNewsModal(false);
                  loadAdminData();
                  onRefreshPublicData();
                }}
                className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1"
              >
                نشر وحفظ الخبر
              </button>
              <button
                onClick={() => setShowNewsModal(false)}
                className="bg-stone-200 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EVENT MODAL */}
      {showEventModal && editingEvent && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 text-right space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-stone-900">
              {editingEvent.id ? 'تعديل الفعالية' : 'إضافة فعالية جديدة'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">اسم الفعالية <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  required
                  value={editingEvent.title || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, title: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">التاريخ والوقت <span className="text-red-600">*</span></label>
                <input
                  type="datetime-local"
                  required
                  value={editingEvent.dateTime || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, dateTime: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">المكان</label>
                  <input
                    type="text"
                    placeholder="مقر الحزب أو القاعة..."
                    value={editingEvent.venue || ''}
                    onChange={e => setEditingEvent({ ...editingEvent, venue: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الجهة المنظمة</label>
                  <input
                    type="text"
                    value={editingEvent.organizer || ''}
                    onChange={e => setEditingEvent({ ...editingEvent, organizer: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">وصف الفعالية</label>
                <textarea
                  rows={2}
                  value={editingEvent.description || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, description: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">تقرير بعد انتهاء الفعالية (اختياري)</label>
                <textarea
                  rows={2}
                  value={editingEvent.postReport || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, postReport: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <MultiImageGalleryField
                label="ألبوم صور وتغطية الفعالية (إضافة أكثر من صورة)"
                images={editingEvent.images || editingEvent.galleryImages || []}
                onChange={imgs => setEditingEvent({ ...editingEvent, images: imgs, galleryImages: imgs })}
                media={media}
                onMediaCreated={handleMediaCreated}
                pickerTitle={`ألبوم صور وتغطية فعالية: ${editingEvent.title || ''}`}
              />

              <VideoUploadField
                label="مقطع فيديو لتغطية الفعالية (اختياري - رفع ملف أو رابط يوتيوب/فيسبوك/MP4)"
                value={editingEvent.videoUrl || ''}
                onChange={url => setEditingEvent({ ...editingEvent, videoUrl: url })}
                helpText="يظهر مشغل الفيديو الاحترافي مباشرة داخل بطاقة الفعالية"
              />
            </div>

            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={async () => {
                  if (!editingEvent.title || !editingEvent.dateTime) {
                    alert('يرجى إدخال اسم الفعالية وموعدها');
                    return;
                  }
                  if (editingEvent.id) {
                    await api.updateEvent(editingEvent.id, editingEvent);
                  } else {
                    await api.createEvent(editingEvent);
                  }
                  setShowEventModal(false);
                  loadAdminData();
                  onRefreshPublicData();
                }}
                className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1"
              >
                حفظ الفعالية
              </button>
              <button
                onClick={() => setShowEventModal(false)}
                className="bg-stone-200 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MEDIA MODAL */}
      {showMediaModal && editingMedia && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 text-right space-y-4 shadow-2xl">
            <h3 className="text-lg font-black text-stone-900">
              {editingMedia.id ? 'تعديل الوسيط' : 'إضافة صورة أو فيديو للمعرض'}
            </h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">نوع الوسيط</label>
                  <select
                    value={editingMedia.type || 'photo'}
                    onChange={e => setEditingMedia({ ...editingMedia, type: e.target.value as any })}
                    className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    <option value="photo">صورة فوتوغرافية</option>
                    <option value="video">مقطع فيديو</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">اسم الألبوم</label>
                  <input
                    type="text"
                    list="media-albums-list"
                    value={editingMedia.albumName || 'فعاليات ومؤتمرات'}
                    onChange={e => setEditingMedia({ ...editingMedia, albumName: e.target.value })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                    placeholder="مثال: مؤتمرات، ندوات، فعاليات..."
                  />
                  <datalist id="media-albums-list">
                    <option value="فعاليات ومؤتمرات" />
                    <option value="الهوية الرسمية" />
                    <option value="أنشطة الأمانات" />
                    <option value="مبادرات ميدانية" />
                    <option value="اجتماعات هيئة المكتب" />
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  ربط بأمانة تخصصية (اختياري)
                </label>
                <select
                  value={editingMedia.linkedSecretariatId || ''}
                  onChange={e => setEditingMedia({ ...editingMedia, linkedSecretariatId: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs"
                >
                  <option value="">عام لكافة أمانات الحزب</option>
                  {secretariats.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  عنوان الصورة أو الفيديو <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="اكتب عنواناً معبراً..."
                  value={editingMedia.title || ''}
                  onChange={e => setEditingMedia({ ...editingMedia, title: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs font-bold"
                />
              </div>

              {/* Upload or Link */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  {editingMedia.type === 'photo' ? 'الصورة المرفوعة أو الرابط' : 'رابط الفيديو (يوتيوب أو رابط مباشر)'} <span className="text-red-600">*</span>
                </label>

                {editingMedia.type === 'photo' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      {editingMedia.url ? (
                        <img
                          src={editingMedia.url}
                          alt="معاينة"
                          className="w-16 h-16 rounded-xl object-cover border border-amber-500 shadow-xs shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-stone-100 border-2 border-dashed border-stone-300 flex items-center justify-center text-stone-400 text-xs shrink-0">
                          صورة
                        </div>
                      )}

                      <div className="flex-1 space-y-1.5">
                        <label className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-800 text-xs font-bold px-3 py-2 rounded-xl border border-red-200 cursor-pointer transition-colors shadow-xs">
                          <Upload className="w-3.5 h-3.5 text-red-700" />
                          <span>رفع صورة من جهازك الآن</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = ev => {
                                  setEditingMedia({
                                    ...editingMedia,
                                    url: ev.target?.result as string,
                                    title: editingMedia.title || file.name.replace(/\.[^/.]+$/, "")
                                  });
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                        <input
                          type="text"
                          placeholder="أو ضع رابط صورة مباشر..."
                          value={editingMedia.url || ''}
                          onChange={e => setEditingMedia({ ...editingMedia, url: e.target.value })}
                          className="w-full border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <VideoUploadField
                      label="مقطع الفيديو (رفع ملف من الجهاز أو لصق رابط يوتيوب/فيسبوك/MP4)"
                      value={editingMedia.url || ''}
                      onChange={url => setEditingMedia({ ...editingMedia, url })}
                      required
                    />
                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">
                        رابط صورة الغلاف / المعاينة للفيديو (اختياري)
                      </label>
                      <input
                        type="text"
                        placeholder="رابط صورة الغلاف أو مسار الصورة..."
                        value={editingMedia.thumbnail || ''}
                        onChange={e => setEditingMedia({ ...editingMedia, thumbnail: e.target.value })}
                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-xs font-mono"
                        dir="ltr"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SPECIAL GALLERY TOGGLE */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <div>
                      <span className="text-xs font-black text-amber-950 block">إدراج في "المعرض الخاص" (VIP / أرشيف حصري)</span>
                      <span className="text-[11px] text-amber-700 block">عرض الوسيط بشكل مميز داخل قسم "معرض خاص" بالبوابة</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={editingMedia.isSpecial || false}
                    onChange={e => setEditingMedia({ ...editingMedia, isSpecial: e.target.checked })}
                    className="w-4 h-4 text-amber-600 rounded cursor-pointer accent-amber-600"
                  />
                </label>

                {editingMedia.isSpecial && (
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">تصنيف المعرض الخاص</label>
                    <input
                      type="text"
                      list="special-gallery-categories"
                      value={editingMedia.specialCategory || 'مؤتمرات ولقاءات كبرى'}
                      onChange={e => setEditingMedia({ ...editingMedia, specialCategory: e.target.value })}
                      placeholder="مثال: مؤتمرات كبرى، زيارات رسمية، لقاءات حصرية..."
                      className="w-full border border-amber-300 rounded-xl px-3 py-1.5 text-xs bg-white text-stone-900"
                    />
                    <datalist id="special-gallery-categories">
                      <option value="مؤتمرات ولقاءات كبرى" />
                      <option value="زيارات رسمية وتفقدية" />
                      <option value="لقاءات حصرية وخاصة" />
                      <option value="بروتوكولات واتفاقيات" />
                      <option value="تغطيات خاصة للأمانة العامة" />
                    </datalist>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">وصف أو تفاصيل الوسيط (اختياري)</label>
                <input
                  type="text"
                  placeholder="نبذة عن الفعالية أو الصورة..."
                  value={editingMedia.description || ''}
                  onChange={e => setEditingMedia({ ...editingMedia, description: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-stone-100">
              <button
                onClick={async () => {
                  if (!editingMedia.title || !editingMedia.url) {
                    alert('يرجى إدخال العنوان ورفع الصورة أو إدخال الرابط');
                    return;
                  }
                  if (editingMedia.id) {
                    await api.updateMedia(editingMedia.id, editingMedia);
                  } else {
                    await api.createMedia(editingMedia);
                  }
                  setShowMediaModal(false);
                  loadAdminData();
                  onRefreshPublicData();
                  alert('تم حفظ الوسيط في المعرض بنجاح');
                }}
                className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1 shadow-xs"
              >
                حفظ الوسيط بالمعرض
              </button>
              <button
                onClick={() => setShowMediaModal(false)}
                className="bg-stone-200 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN USER MODAL */}
      {showUserModal && editingUser && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 text-right space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-red-700" />
                <span>{editingUser.id ? 'تعديل بيانات المشرف والدور' : 'إضافة مشرف جديد للمنصة'}</span>
              </h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">اسم المشرف بالكامل <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أحمد عبد الله (مسؤول المحتوى)"
                  value={editingUser.name || ''}
                  onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">البريد الإلكتروني المعتمد <span className="text-red-600">*</span></label>
                <input
                  type="email"
                  required
                  disabled={!!editingUser.id}
                  placeholder="user@example.com"
                  value={editingUser.email || ''}
                  onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs font-mono disabled:bg-stone-100"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  كلمة المرور {editingUser.id ? '(اتركها فارغة إذا كنت لا ترغب في تغييرها)' : '<span className="text-red-600">*</span>'}
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={editingUser.password || ''}
                  onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2 text-xs font-mono"
                  dir="ltr"
                />
              </div>

              {/* Role Preset Selector */}
              <div className="bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200 space-y-2">
                <label className="block text-xs font-bold text-amber-950">
                  اختيار دور إداري مسبق (Role Preset):
                </label>
                <select
                  value={editingUser.roleId || ''}
                  onChange={e => {
                    const selId = e.target.value;
                    const r = roles.find(item => item.id === selId);
                    if (r) {
                      setEditingUser({
                        ...editingUser,
                        roleId: r.id,
                        permissions: [...r.permissions]
                      });
                    } else {
                      setEditingUser({
                        ...editingUser,
                        roleId: undefined
                      });
                    }
                  }}
                  className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-bold text-stone-800"
                >
                  <option value="">-- تخصيص يدوي حر للصلاحيات --</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.isSystem ? '(دور قياسي)' : '(دور مخصص)'} ({r.permissions.length} صلاحيات)
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-amber-800">
                  اختيار الدور يحدد الصلاحيات تلقائياً، مع إمكانية تعديل وتخصيص أي صلاحية أدناه.
                </p>
              </div>

              {/* Administration Scope: General vs Specialized Secretariat */}
              <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 space-y-2.5">
                <label className="block text-xs font-bold text-stone-900">
                  نوع ونطاق الإدارة: <span className="text-red-600">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser({ ...editingUser, adminScope: 'general', managedSecretariatId: undefined })}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      editingUser.adminScope !== 'specialized'
                        ? 'bg-red-700 text-white border-red-800 shadow-xs'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <span>إدارة عامة وشاملة</span>
                    <span className="text-[10px] font-normal opacity-90">لكافة الأمانات والمنصة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingUser({ ...editingUser, adminScope: 'specialized', managedSecretariatId: editingUser.managedSecretariatId || secretariats[0]?.id })}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      editingUser.adminScope === 'specialized'
                        ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <span>إدارة أمانة تخصصية</span>
                    <span className="text-[10px] font-normal opacity-90">مشرف أمانة محددة</span>
                  </button>
                </div>

                {editingUser.adminScope === 'specialized' && (
                  <div className="mt-2 pt-2 border-t border-stone-200">
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">
                      الأمانة التخصصية المسندة للمشرف:
                    </label>
                    <select
                      value={editingUser.managedSecretariatId || ''}
                      onChange={e => setEditingUser({ ...editingUser, managedSecretariatId: e.target.value })}
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-bold text-stone-800"
                    >
                      {secretariats.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-2">مصفوفة الصلاحيات الممنوحة:</label>
                <div className="space-y-1.5 text-xs text-stone-700 max-h-48 overflow-y-auto border border-stone-200 p-3 rounded-xl bg-stone-50">
                  {[
                    { id: 'leaders_party', label: 'قيادات الحزب العامة (رئيس الحزب، النواب، المحافظات)' },
                    { id: 'leaders_secretariat', label: 'قيادات أمانة قسم ثالث أكتوبر بمحافظة الجيزة' },
                    { id: 'secretariats', label: 'الأمانات وتكليف ونقل الأعضاء' },
                    { id: 'applications', label: 'فحص ومراجعة طلبات الانضمام الرقمية والمستندات' },
                    { id: 'members', label: 'السجل المركزي للأعضاء والتكليفات (دون كارنيهات)' },
                    { id: 'pages', label: 'إدارة الصفحات الثابتة (CMS) وتحرير النصوص' },
                    { id: 'news', label: 'إدارة ونشر الأخبار والبيانات الصحفية' },
                    { id: 'events', label: 'إدارة وجدولة الفعاليات والأنشطة' },
                    { id: 'initiatives', label: 'إدارة المبادرات المجتمعية والتنموية' },
                    { id: 'media', label: 'إدارة معرض الصور والفيديوهات والألبومات' },
                    { id: 'livestream', label: 'إدارة منصة البث المباشر' },
                    { id: 'roles', label: 'إدارة الأدوار والصلاحيات (Granular RBAC)' },
                    { id: 'admins', label: 'إدارة حسابات المشرفين' },
                    { id: 'settings', label: 'إعدادات المنصة وهوية الحزب' },
                    { id: 'audit', label: 'الاطلاع على سجل العمليات (Audit Log)' }
                  ].map(p => {
                    const checked = (editingUser.permissions || []).includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-stone-100 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            const cur = editingUser.permissions || [];
                            const updated = e.target.checked ? [...cur, p.id] : cur.filter((x: string) => x !== p.id);
                            setEditingUser({ ...editingUser, permissions: updated });
                          }}
                          className="w-4 h-4 text-red-700 rounded"
                        />
                        <span>{p.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="user-act-chk"
                  checked={editingUser.isActive !== false}
                  onChange={e => setEditingUser({ ...editingUser, isActive: e.target.checked })}
                  className="w-4 h-4 text-red-700 rounded"
                />
                <label htmlFor="user-act-chk" className="text-xs font-bold text-stone-800 cursor-pointer">
                  حساب المشرف نشط ومفعل
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-stone-100">
              <button
                onClick={async () => {
                  try {
                    if (editingUser.id) {
                      await api.updateAdminUser(editingUser.id, editingUser);
                    } else {
                      await api.createAdminUser(editingUser);
                    }
                    setShowUserModal(false);
                    loadAdminData();
                  } catch (err: any) {
                    alert(err.message || 'حدث خطأ أثناء حفظ المشرف');
                  }
                }}
                className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1"
              >
                حفظ بيانات المشرف
              </button>
              <button
                onClick={() => setShowUserModal(false)}
                className="bg-stone-200 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CMS STATIC PAGE MODAL */}
      {showPageModal && editingPage && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 text-right space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-red-700" />
                <span>{editingPage.id ? `تعديل صفحة: ${editingPage.title}` : 'إنشاء صفحة ثابتة جديدة (CMS)'}</span>
              </h3>
              <button
                onClick={() => setShowPageModal(false)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    عنوان الصفحة <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: عن الحزب والأمانة"
                    value={editingPage.title || ''}
                    onChange={e => {
                      const val = e.target.value;
                      const update: any = { title: val };
                      if (!editingPage.id && !editingPage.slug) {
                        update.slug = val.toLowerCase().trim().replace(/[\s\W-]+/g, '-');
                      }
                      setEditingPage({ ...editingPage, ...update });
                    }}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    الرابط الدائم (Slug) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="about-us"
                    value={editingPage.slug || ''}
                    onChange={e => setEditingPage({ ...editingPage, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    className="w-full border border-stone-300 rounded-xl px-3.5 py-2 font-mono text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  العنوان الفرعي أو التمهيدي
                </label>
                <input
                  type="text"
                  placeholder="موجز أو عبارة تمهيدية للصفحة..."
                  value={editingPage.subtitle || ''}
                  onChange={e => setEditingPage({ ...editingPage, subtitle: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2"
                />
              </div>

              {/* Cover Image Upload & Input */}
              <div className="border border-stone-200 rounded-2xl p-4 bg-stone-50 space-y-4">
                <ImageFieldWithPicker
                  label="صورة الغلاف الرئيسية للصفحة"
                  value={editingPage.coverImage || ''}
                  onChange={url => setEditingPage({ ...editingPage, coverImage: url })}
                  media={media}
                  onMediaCreated={handleMediaCreated}
                  shape="banner"
                  helpText="اختر من صور المعرض أو ارفع من جهازك مباشرة"
                  pickerTitle={`اختيار صورة غلاف لصفحة: ${editingPage.title || ''}`}
                />

                <MultiImageGalleryField
                  label="معرض الصور التوضيحية داخل الصفحة"
                  images={editingPage.galleryImages || []}
                  onChange={imgs => setEditingPage({ ...editingPage, galleryImages: imgs })}
                  media={media}
                  onMediaCreated={handleMediaCreated}
                  pickerTitle={`معرض صور صفحة: ${editingPage.title || ''}`}
                />
              </div>

              {/* Content Formatting Toolbar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-stone-700">
                    محتوى الصفحة <span className="text-red-600">*</span>
                  </label>
                  <span className="text-[11px] text-stone-400">يدعم العناوين والقوائم والاقتباسات</span>
                </div>

                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-1.5 p-2 bg-stone-100 rounded-t-xl border border-b-0 border-stone-300 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = editingPage.content || '';
                      setEditingPage({ ...editingPage, content: cur + '\n\n## عنوان رئيسي\n' });
                    }}
                    className="bg-white hover:bg-stone-200 px-2.5 py-1 rounded border border-stone-200 cursor-pointer"
                  >
                    H2 عنوان كبير
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = editingPage.content || '';
                      setEditingPage({ ...editingPage, content: cur + '\n\n### عنوان فرعي\n' });
                    }}
                    className="bg-white hover:bg-stone-200 px-2.5 py-1 rounded border border-stone-200 cursor-pointer"
                  >
                    H3 عنوان متوسط
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = editingPage.content || '';
                      setEditingPage({ ...editingPage, content: cur + '\n- عنصر نقطي أول\n- عنصر نقطي ثان\n' });
                    }}
                    className="bg-white hover:bg-stone-200 px-2.5 py-1 rounded border border-stone-200 cursor-pointer"
                  >
                    • قائمة نقطية
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = editingPage.content || '';
                      setEditingPage({ ...editingPage, content: cur + '\n> نص اقتباس مميز أو بارز من قيادة الحزب\n' });
                    }}
                    className="bg-white hover:bg-stone-200 px-2.5 py-1 rounded border border-stone-200 cursor-pointer"
                  >
                    " اقتباس
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = editingPage.content || '';
                      setEditingPage({ ...editingPage, content: cur + '\n\n---\n\n' });
                    }}
                    className="bg-white hover:bg-stone-200 px-2.5 py-1 rounded border border-stone-200 cursor-pointer"
                  >
                    — خط فاصل
                  </button>
                </div>

                <textarea
                  rows={9}
                  required
                  placeholder="اكتب محتوى الصفحة هنا باللغة العربية..."
                  value={editingPage.content || ''}
                  onChange={e => setEditingPage({ ...editingPage, content: e.target.value })}
                  className="w-full border border-stone-300 rounded-b-xl px-3.5 py-3 text-xs leading-relaxed focus:outline-hidden"
                />
              </div>

              {/* Meta Description */}
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  وصف محركات البحث (Meta Description)
                </label>
                <input
                  type="text"
                  placeholder="موجز قصير يظهر في نتائج البحث ومشاركات وسائل التواصل..."
                  value={editingPage.metaDescription || ''}
                  onChange={e => setEditingPage({ ...editingPage, metaDescription: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2"
                />
              </div>

              {/* Publish Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="page-publish-chk"
                  checked={editingPage.isPublished !== false}
                  onChange={e => setEditingPage({ ...editingPage, isPublished: e.target.checked })}
                  className="w-4 h-4 text-red-700 rounded"
                />
                <label htmlFor="page-publish-chk" className="font-bold text-stone-800 cursor-pointer">
                  نشر الصفحة وإتاحتها للزوار بالموقع
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-stone-100">
              <button
                onClick={async () => {
                  if (!editingPage.title || !editingPage.slug || !editingPage.content) {
                    alert('يرجى ملء عنوان الصفحة ورابطها ومحتواها');
                    return;
                  }
                  try {
                    if (editingPage.id) {
                      await api.updateCMSPage(editingPage.id, editingPage);
                    } else {
                      await api.createCMSPage(editingPage);
                    }
                    setShowPageModal(false);
                    loadAdminData();
                    onRefreshPublicData();
                  } catch (err: any) {
                    alert(err.message || 'حدث خطأ أثناء حفظ الصفحة');
                  }
                }}
                className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1"
              >
                حفظ ونشر الصفحة
              </button>
              <button
                onClick={() => setShowPageModal(false)}
                className="bg-stone-200 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RBAC ROLE MODAL */}
      {showRoleModal && editingRole && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 text-right space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-700" />
                <span>{editingRole.id ? `تعديل الدور: ${editingRole.name}` : 'إنشاء دور إداري مخصص (RBAC)'}</span>
              </h3>
              <button
                onClick={() => setShowRoleModal(false)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  اسم الدور الإداري <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: منسق شؤون الشباب والمرأة"
                  value={editingRole.name || ''}
                  onChange={e => setEditingRole({ ...editingRole, name: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  الوصف الوظيفي والمسؤوليات
                </label>
                <textarea
                  rows={2}
                  placeholder="بيان المهام والصلاحيات المسندة لهذا الدور..."
                  value={editingRole.description || ''}
                  onChange={e => setEditingRole({ ...editingRole, description: e.target.value })}
                  className="w-full border border-stone-300 rounded-xl px-3.5 py-2"
                />
              </div>

              {/* Granular Permission Matrix Grouped by Domain */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-stone-900">
                    مصفوفة الصلاحيات التفصيلية للدور:
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const allPerms = [
                          'leaders_party',
                          'leaders_secretariat',
                          'secretariats',
                          'applications',
                          'members',
                          'pages',
                          'news',
                          'events',
                          'initiatives',
                          'media',
                          'livestream',
                          'roles',
                          'admins',
                          'settings',
                          'audit'
                        ];
                        setEditingRole({ ...editingRole, permissions: allPerms });
                      }}
                      className="text-[11px] text-red-700 font-bold hover:underline cursor-pointer"
                    >
                      تحديد الكل
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => setEditingRole({ ...editingRole, permissions: [] })}
                      className="text-[11px] text-stone-500 hover:underline cursor-pointer"
                    >
                      إلغاء التحديد
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  
                  {/* Category 1: Leadership & Secretariats */}
                  <div className="border border-stone-200 rounded-xl p-3 bg-stone-50/70 space-y-2">
                    <span className="font-black text-stone-900 block border-b border-stone-200 pb-1">
                      1. الهيكل التنظيمي والقيادات
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { id: 'leaders_party', label: 'قيادات الحزب العامة (الرئيس، النواب، المحافظات)' },
                        { id: 'leaders_secretariat', label: 'قيادات أمانة قسم ثالث أكتوبر' },
                        { id: 'secretariats', label: 'الأمانات وتكليف الأعضاء' }
                      ].map(p => {
                        const checked = (editingRole.permissions || []).includes(p.id);
                        return (
                          <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                const cur = editingRole.permissions || [];
                                const updated = e.target.checked ? [...cur, p.id] : cur.filter((x: string) => x !== p.id);
                                setEditingRole({ ...editingRole, permissions: updated });
                              }}
                              className="w-4 h-4 text-red-700 rounded"
                            />
                            <span>{p.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category 2: Membership (Card-Free) */}
                  <div className="border border-stone-200 rounded-xl p-3 bg-stone-50/70 space-y-2">
                    <span className="font-black text-stone-900 block border-b border-stone-200 pb-1">
                      2. العضوية وشؤون المواطنين (دون كارنيهات)
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { id: 'applications', label: 'فحص ومراجعة طلبات الانضمام الرقمية والمستندات' },
                        { id: 'members', label: 'السجل المركزي للأعضاء والتكليفات الرسمية' }
                      ].map(p => {
                        const checked = (editingRole.permissions || []).includes(p.id);
                        return (
                          <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                const cur = editingRole.permissions || [];
                                const updated = e.target.checked ? [...cur, p.id] : cur.filter((x: string) => x !== p.id);
                                setEditingRole({ ...editingRole, permissions: updated });
                              }}
                              className="w-4 h-4 text-red-700 rounded"
                            />
                            <span>{p.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category 3: CMS & Content */}
                  <div className="border border-stone-200 rounded-xl p-3 bg-stone-50/70 space-y-2">
                    <span className="font-black text-stone-900 block border-b border-stone-200 pb-1">
                      3. المحتوى والنشر والإعلام
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { id: 'pages', label: 'إدارة الصفحات الثابتة (CMS) وتحرير النصوص' },
                        { id: 'news', label: 'نشر وتعديل الأخبار والبيانات الصحفية' },
                        { id: 'events', label: 'جدولة وإدارة الفعاليات والأنشطة' },
                        { id: 'initiatives', label: 'إدارة المبادرات المجتمعية والتنموية' },
                        { id: 'media', label: 'إدارة معرض الصور والفيديوهات والألبومات' },
                        { id: 'livestream', label: 'إدارة منصة البث المباشر' }
                      ].map(p => {
                        const checked = (editingRole.permissions || []).includes(p.id);
                        return (
                          <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                const cur = editingRole.permissions || [];
                                const updated = e.target.checked ? [...cur, p.id] : cur.filter((x: string) => x !== p.id);
                                setEditingRole({ ...editingRole, permissions: updated });
                              }}
                              className="w-4 h-4 text-red-700 rounded"
                            />
                            <span>{p.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category 4: System Administration */}
                  <div className="border border-stone-200 rounded-xl p-3 bg-stone-50/70 space-y-2">
                    <span className="font-black text-stone-900 block border-b border-stone-200 pb-1">
                      4. النظام والإشراف والأمان
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { id: 'roles', label: 'إنشاء وتعديل أدوار المشرفين (RBAC)' },
                        { id: 'admins', label: 'إضافة وتعديل حسابات المشرفين' },
                        { id: 'settings', label: 'إعدادات المنصة وهوية الحزب' },
                        { id: 'audit', label: 'الاطلاع على سجل العمليات (Audit Log)' }
                      ].map(p => {
                        const checked = (editingRole.permissions || []).includes(p.id);
                        return (
                          <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                const cur = editingRole.permissions || [];
                                const updated = e.target.checked ? [...cur, p.id] : cur.filter((x: string) => x !== p.id);
                                setEditingRole({ ...editingRole, permissions: updated });
                              }}
                              className="w-4 h-4 text-red-700 rounded"
                            />
                            <span>{p.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-stone-100">
              <button
                onClick={async () => {
                  if (!editingRole.name) {
                    alert('يرجى كتابة اسم الدور الإداري');
                    return;
                  }
                  try {
                    if (editingRole.id) {
                      await api.updateRole(editingRole.id, editingRole);
                    } else {
                      await api.createRole(editingRole);
                    }
                    setShowRoleModal(false);
                    loadAdminData();
                  } catch (err: any) {
                    alert(err.message || 'حدث خطأ أثناء حفظ الدور الإداري');
                  }
                }}
                className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer flex-1"
              >
                حفظ الدور والصلاحيات
              </button>
              <button
                onClick={() => setShowRoleModal(false)}
                className="bg-stone-200 text-stone-700 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
