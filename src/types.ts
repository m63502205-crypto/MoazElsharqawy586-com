export interface PartyLeader {
  id: string;
  name: string;
  position: string;
  level: string; // flexible custom level (e.g. 'قيادة مركزية', 'قيادات المحافظات', 'الهيئة العليا', or any custom text)
  governorate?: string;
  bio: string;
  photoUrl: string;
  sortOrder: number;
  isVisible: boolean;
  createdAt: string;
}

export interface SecretariatLeader {
  id: string;
  name: string;
  title: string;
  specializedSecretariatId?: string;
  bio: string;
  photoUrl: string;
  appointmentDate: string;
  sortOrder: number;
  isVisible: boolean;
  createdAt: string;
}

export interface SpecializedSecretariat {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  coverUrl?: string;
  description: string;
  duties: string[];
  goals: string[];
  secretaryName?: string;
  secretaryPhotoUrl?: string;
  secretaryBio?: string;
  secretaryPhone?: string;
  assistantSecretaryName?: string;
  assistantSecretaryPhotoUrl?: string;
  assistantSecretaryBio?: string;
  assistantSecretaryPhone?: string;
  galleryImages?: string[];
  videos?: Array<{ title: string; url: string; thumbnail?: string }>;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface SecretariatMember {
  id: string;
  memberId?: string;
  secretariatId: string;
  name: string;
  role: string;
  tier?: 'secretary' | 'assistant_secretary' | 'bureau' | 'member';
  bureauTitle?: string; // e.g. 'مقرر هيئة المكتب', 'مسؤول التثقيف والتخطيط'
  photoUrl?: string;
  phone?: string;
  email?: string;
  assignmentDate: string;
  notes?: string;
}

export interface Initiative {
  id: string;
  slug: string;
  title: string;
  logoUrl?: string;
  coverUrl?: string;
  description: string;
  goals: string[];
  startDate: string;
  endDate?: string;
  status: 'active' | 'paused' | 'completed';
  activities: Array<{ title: string; date: string; description: string }>;
  isVisible: boolean;
  createdAt: string;
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  coverImage?: string;
  galleryImages: string[];
  videoUrl?: string;
  publishDate: string;
  linkedSecretariatId?: string;
  linkedInitiativeId?: string;
  isFeatured: boolean;
  isDraft: boolean;
  createdAt: string;
}

export interface EventItem {
  id: string;
  title: string;
  description: string;
  dateTime: string;
  venue: string;
  organizer: string;
  images: string[];
  coverUrl?: string;
  videoUrl?: string;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  postReport?: string;
  isVisible: boolean;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  type: 'photo' | 'video';
  title: string;
  description?: string;
  url: string;
  thumbnail?: string;
  albumName: string;
  linkedSecretariatId?: string;
  linkedInitiativeId?: string;
  linkedEventId?: string;
  isVisible: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface LiveStream {
  id: string;
  title: string;
  description: string;
  streamUrl: string;
  isActive: boolean;
  platform: 'youtube' | 'facebook' | 'other';
  startedAt?: string;
}

export interface MembershipApplication {
  id: string;
  applicationNumber: string;
  fullName: string;
  nationalId: string;
  dateOfBirth: string;
  gender: 'ذكر' | 'أنثى';
  maritalStatus: 'أعزب' | 'متزوج' | 'أخرى';
  governorate: string;
  district: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  qualification: string;
  job: string;
  workplace: string;
  skills: string;
  interests: string;
  volunteerExperience: string;
  reasonForJoining: string;
  personalPhotoUrl: string;
  nationalIdFrontUrl: string;
  nationalIdBackUrl: string;
  consentAgreed: boolean;
  status: 'جديد' | 'قيد المراجعة' | 'مطلوب استكمال' | 'مقبول' | 'مرفوض';
  internalNotes: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface AssignmentHistory {
  id: string;
  title: string;
  secretariatId?: string;
  secretariatName?: string;
  startDate: string;
  endDate?: string;
  assignedBy: string;
  notes?: string;
}

export interface MemberRecord {
  id: string;
  fullName: string;
  nationalId: string;
  phone: string;
  email: string;
  governorate: string;
  district: string;
  address: string;
  photoUrl?: string;
  secretariatId?: string;
  title: string;
  assignmentStatus: 'نشط' | 'منتهي';
  assignmentHistory: AssignmentHistory[];
  joinedAt: string;
  applicationId?: string;
}

export interface CMSPage {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  content: string;
  coverImage?: string;
  galleryImages: string[];
  metaDescription?: string;
  isPublished: boolean;
  updatedAt: string;
}

export interface AdminRole {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'sub_admin';
  roleId?: string;
  adminScope?: 'general' | 'specialized'; // إدارة عامة أو إدارة أمانة تخصصية محددة
  managedSecretariatId?: string; // معرف الأمانة المسندة في حالة التخصيص
  permissions: string[];
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  adminEmail: string;
  adminName: string;
  action: string;
  entityType: string;
  entityId?: string;
  details: string;
  timestamp: string;
}

export interface SiteCustomTexts {
  // Hero section
  heroBadge?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroBtnPrimary?: string;
  heroBtnSecondary?: string;

  // Stats Counters
  statsCard1Value?: string;
  statsCard1Label?: string;
  statsCard1Sub?: string;

  statsCard2Value?: string;
  statsCard2Label?: string;
  statsCard2Sub?: string;

  statsCard3Value?: string;
  statsCard3Label?: string;
  statsCard3Sub?: string;

  statsCard4Value?: string;
  statsCard4Label?: string;
  statsCard4Sub?: string;

  // Section Headers
  partyLeadersBadge?: string;
  partyLeadersTitle?: string;
  partyLeadersSubtitle?: string;

  secLeadersBadge?: string;
  secLeadersTitle?: string;
  secLeadersSubtitle?: string;

  secretariatsBadge?: string;
  secretariatsTitle?: string;
  secretariatsSubtitle?: string;

  initiativesBadge?: string;
  initiativesTitle?: string;
  initiativesSubtitle?: string;

  newsBadge?: string;
  newsTitle?: string;
  newsSubtitle?: string;

  eventsBadge?: string;
  eventsTitle?: string;
  eventsSubtitle?: string;

  joinTitle?: string;
  joinSubtitle?: string;
}

export interface ApplicationInquiryResult {
  found: boolean;
  applicationNumber?: string;
  fullName?: string;
  governorate?: string;
  district?: string;
  status?: 'جديد' | 'قيد المراجعة' | 'مطلوب استكمال' | 'مقبول' | 'مرفوض';
  createdAt?: string;
  reviewedAt?: string;
  officialMessage?: string;
}

export interface SiteSettings {
  partyName: string;
  secretariatName: string;
  slogan: string;
  officialLogo: string;
  phone: string;
  whatsapp: string;
  whatsappLink: string;
  email: string;
  address: string;
  locationUrl?: string;
  mapEmbedUrl?: string;
  coordinates?: string;
  facebookUrl?: string;
  googleAnalyticsId?: string; // Google Analytics 4 Measurement ID (e.g. G-XXXXXXXXXX)
  customTexts?: SiteCustomTexts;
  socialLinks: Array<{ id: string; platform: string; url: string; label: string }>;
  aboutParty: string;
  aboutSecretariat: string;
  vision: string;
  principles: string[];
}

export interface PublicPortalData {
  settings: SiteSettings;
  partyLeaders: PartyLeader[];
  secretariatLeaders: SecretariatLeader[];
  specializedSecretariats: SpecializedSecretariat[];
  secretariatMembers: SecretariatMember[];
  initiatives: Initiative[];
  news: NewsItem[];
  events: EventItem[];
  media: MediaItem[];
  liveStream: LiveStream;
  pages: CMSPage[];
}

export interface AdminStats {
  partyLeadersCount: number;
  secretariatLeadersCount: number;
  secretariatsCount: number;
  membersCount: number;
  initiativesCount: number;
  activeInitiativesCount: number;
  applicationsCount: number;
  newApplicationsCount: number;
  reviewingApplicationsCount: number;
  acceptedApplicationsCount: number;
  rejectedApplicationsCount: number;
  newsCount: number;
  eventsCount: number;
  mediaCount: number;
  pagesCount: number;
  rolesCount: number;
}
