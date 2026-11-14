import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface PartyLeader {
  id: string;
  name: string;
  position: string;
  level: 'national' | 'governorate' | 'other';
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

export interface AssistantSecretaryEntry {
  id: string;
  name: string;
  title?: string;
  photoUrl?: string;
  bio?: string;
  phone?: string;
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
  assistantSecretaries?: AssistantSecretaryEntry[];
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
  galleryImages?: string[];
  isVisible: boolean;
  createdAt: string;
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  summary?: string;
  coverImage?: string;
  galleryImages: string[];
  videoUrl?: string;
  publishDate: string;
  linkedSecretariatId?: string;
  linkedInitiativeId?: string;
  isFeatured: boolean;
  isUrgent?: boolean;
  isDraft: boolean;
  authorName?: string;
  authorPosition?: string;
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
  galleryImages?: string[];
  coverUrl?: string;
  coverImage?: string;
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
  isSpecial?: boolean; // معرض خاص
  specialCategory?: string;
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
  passwordHash: string;
  role: 'super_admin' | 'sub_admin';
  roleId?: string;
  adminScope?: 'general' | 'specialized'; // إدارة عامة أو أمانة تخصصية محددة
  managedSecretariatId?: string; // معرف الأمانة المسندة إليه عند التخصيص
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
  googleAnalyticsId?: string;
  heroMediaType?: 'video' | 'images' | 'both';
  heroVideoUrl?: string;
  heroPosterUrl?: string;
  heroImages?: string[];
  heroDefaultMuted?: boolean;
  heroSlides?: Array<{
    id: string;
    type: 'video' | 'image';
    url: string;
    posterUrl?: string;
    title?: string;
    caption?: string;
  }>;
  entranceImageUrl?: string;
  membershipTitle?: string;
  membershipSubtitle?: string;
  membershipCtaText?: string;
  membershipWhatsapp?: string;
  membershipFieldRequirements?: Record<string, boolean>;
  customTexts?: any;
  socialLinks: Array<{ id: string; platform: string; url: string; label: string }>;
  aboutParty: string;
  aboutSecretariat: string;
  vision: string;
  principles: string[];
  secretariatsVersion?: number;
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

export interface AppDatabase {
  partyLeaders: PartyLeader[];
  secretariatLeaders: SecretariatLeader[];
  specializedSecretariats: SpecializedSecretariat[];
  secretariatMembers: SecretariatMember[];
  initiatives: Initiative[];
  news: NewsItem[];
  events: EventItem[];
  media: MediaItem[];
  liveStream: LiveStream;
  applications: MembershipApplication[];
  members: MemberRecord[];
  roles: AdminRole[];
  pages: CMSPage[];
  admins: AdminUser[];
  auditLogs: AuditLog[];
  settings: SiteSettings;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + '_nfp_salt_2026').digest('hex');
}

const INITIAL_SECRETARIATS: SpecializedSecretariat[] = [
  {
    id: 'sec-org',
    name: 'أمانة التنظيم',
    slug: 'organization',
    description: 'العصب التنظيمي والميداني المسؤول عن بناء الهياكل والقواعد الحزبية وتنسيق الأنشطة بين الوحدات والأمانات في قسم ثالث أكتوبر.',
    duties: [
      'بناء ومتابعة التشكيلات التنظيمية في القطاعات والأحياء.',
      'تنظيم المؤتمرات واللقاءات التنظيمية والجماهيرية.',
      'التنسيق والتكامل الإداري بين كافة الأمانات التخصصية.'
    ],
    goals: [
      'ترسيخ التواجد الحزبي المنظم في كافة مناطق قسم ثالث أكتوبر.',
      'إدارة العمل التنظيمي بكفاءة وانضباط واستمرارية.'
    ],
    isActive: true,
    sortOrder: 1,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-membership',
    name: 'أمانة العضوية',
    slug: 'membership',
    description: 'المسؤولة عن استقطاب الأعضاء الجدد، وتحديث قاعدة بيانات العضوية، وتيسير إجراءات الانضمام وتوزيع الكوادر وفق المهارات.',
    duties: [
      'استقبال ومراجعة طلبات الانضمام وتوجيه الكوادر للأمانات المناسبة.',
      'إعداد وتحديث سجلات العضوية وبطاقات الانتماء الحزبي.',
      'متابعة تفعيل مشاركة الأعضاء الجدد في الأنشطة الميدانية.'
    ],
    goals: [
      'توسيع قاعدة العضوية الفاعلة في قسم ثالث أكتوبر.',
      'بناء سجل عضوية دقيق ومنظم يربط الطاقات الوطنية بالعمل العام.'
    ],
    isActive: true,
    sortOrder: 2,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-youth-sports',
    name: 'أمانة الشباب والرياضة',
    slug: 'youth-and-sports',
    description: 'المسؤولة عن تمكين الشباب، واكتشاف المهارات القيادية، وتنظيم البطولات والفعاليات الرياضية والأنشطة الشبابية.',
    duties: [
      'تنظيم الدورات والبطولات الرياضية والملتقيات الشبابية.',
      'إعداد برامج تأهيل وتدريب للشباب للمشاركة في العمل العام والمحلي.',
      'دعم المبادرات الشبابية والمواهب الرياضية والثقافية في المنطقة.'
    ],
    goals: [
      'استثمار طاقات الشباب في البناء المجتمعي والعمل الوطني.',
      'تعزيز الروح الرياضية والانتماء الوطني لدى شباب قسم ثالث أكتوبر.'
    ],
    isActive: true,
    sortOrder: 3,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-women',
    name: 'أمانة المرأة',
    slug: 'women',
    description: 'المسؤولة عن دعم وتمكين المرأة المصرية اجتماعياً واقتصادياً وسياسياً، ورعاية المبادرات الخاصة بالأسرة والطفل.',
    duties: [
      'إطلاق مبادرات التمكين الاقتصادي والمشروعات المنزلية للمرأة.',
      'تنظيم الندوات التوعوية حول حقوق المرأة وصحة الأسرة والطفل.',
      'تعزيز مشاركة المرأة في الحياة السياسية والعمل العام.'
    ],
    goals: [
      'رفع كفاءة ودور المرأة في المجتمع المحلي بقسم ثالث أكتوبر.',
      'حماية الأسرة ودعم المرأة المعيلة وتكافؤ الفرص.'
    ],
    isActive: true,
    sortOrder: 4,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-agriculture',
    name: 'أمانة الزراعة والري وشؤون الفلاحين',
    slug: 'agriculture-irrigation-farmers',
    description: 'المسؤولة عن متابعة ملفات الزراعة والري والأمن الغذائي، والتواصل مع الفلاحين والمزارعين لتذليل التحديات ودعم الإنتاج الزراعي.',
    duties: [
      'رصد مشكلات المزارعين والفلاحين ونقلها للجهات المعنية.',
      'تنظيم ندوات إرشاد زراعي وترشيد استخدام مياه الري.',
      'دعم مبادرات التشجير والزراعة الحضرية والأمن الغذائي.'
    ],
    goals: [
      'تطوير الوعي الزراعي ودعم استدامة الموارد المائية.',
      'مساندة الفلاح والمزارع وتحسين منظومة الإنتاج الزراعي.'
    ],
    isActive: true,
    sortOrder: 5,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-disability',
    name: 'أمانة ذوي الهمم',
    slug: 'people-of-determination',
    description: 'المسؤولة عن رعاية حقوق ذوي الهمم ودمجهم الكامل في المجتمع، وتسهيل حصولهم على الخدمات الصحية والتعليمية والوظيفية.',
    duties: [
      'حصر احتياجات ذوي الهمم وتيسير إجراءات الدعم والتأهيل.',
      'تنظيم فعاليات ومبادرات دمج مجتمعي وثقافي ورياضي لذوي الهمم.',
      'التنسيق لتوفير فرص تدريب وتشغيل مناسبة بالتعاون مع مؤسسات المجتمع.'
    ],
    goals: [
      'تحقيق الدمج المجتمعي الكامل وصون كرامة وحقوق ذوي الهمم.',
      'بناء بيئة محلية ميسرة وداعمة في قسم ثالث أكتوبر.'
    ],
    isActive: true,
    sortOrder: 6,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-education',
    name: 'أمانة التعليم والبحث العلمي',
    slug: 'education-and-scientific-research',
    description: 'المسؤولة عن دعم العملية التعليمية والبحثية، ورعاية المتفوقين، ومحاربة التسرب التعليمي وتنظيم القوافل والمراجعات التعليمية.',
    duties: [
      'تنظيم قوافل تعليمية ومراجعات مجانية للطلاب في المراحل الدراسية.',
      'دعم الأبحاث التطبيقية وربط الباحثين بقضايا التنمية المحلية.',
      'متابعة أوضاع المدارس والمنشآت التعليمية والتنسيق لتطويرها.'
    ],
    goals: [
      'الارتقاء بجودة التعليم وبناء جيل واعٍ ومثقف ومبتكر.',
      'تشجيع البحث العلمي كركيزة للتنمية المستدامة.'
    ],
    isActive: true,
    sortOrder: 7,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-housing',
    name: 'أمانة الإسكان والتنمية العمرانية',
    slug: 'housing-and-urban-development',
    description: 'المسؤولة عن متابعة قضايا الإسكان والمرافق والتخطيط العمراني، ورصد احتياجات الأحياء الجديدة ومناطق ابني بيتك والتوسعات بأكتوبر.',
    duties: [
      'حصر احتياجات المرافق والطرق والإنارة والمناطق السكنية بقسم ثالث أكتوبر.',
      'إعداد مقترحات وتصورات عمرانية لتحسين جودة الحياة في الأحياء.',
      'التواصل مع الأجهزة التنفيذية لمتابعة مشروعات البنية التحتية.'
    ],
    goals: [
      'تحسين البيئة العمرانية والخدمات الأساسية لأهالي قسم ثالث أكتوبر.',
      'دعم التخطيط العمراني المتوازن والسكني اللائق.'
    ],
    isActive: true,
    sortOrder: 8,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-trade',
    name: 'أمانة التجارة والصناعة',
    slug: 'trade-and-industry',
    description: 'المسؤولة عن دعم القطاعات التجارية والصناعية، والتواصل مع المصانع والمستثمرين والتجار لتنشيط الأسواق المحلية وحل التحديات.',
    duties: [
      'رصد تحديات المصانع والمنشآت التجارية في نطاق أكتوبر والجيزة.',
      'دعم مبادرات المنتج المحلي ومعارض السلع بأسعار مخفضة للمواطنين.',
      'تنظيم لقاءات مع مجتمع الأعمال لربط الصناعة باحتياجات السوق.'
    ],
    goals: [
      'تنشيط الحركة التجارية والصناعية وتوفير فرص عمل لأبناء المنطقة.',
      'دعم استقرار الأسواق ومواجهة الممارسات الاحتكارية.'
    ],
    isActive: true,
    sortOrder: 9,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-health',
    name: 'أمانة الصحة والسكان',
    slug: 'health-and-population',
    description: 'المسؤولة عن تنظيم القوافل الطبية المجانية، وحملات التوعية الصحية، ومتابعة الخدمات الصحية والمراكز الطبية بالمنطقة.',
    duties: [
      'إطلاق وتنظيم قوافل طبية شاملة في مختلف التخصصات لأهالي المنطقة.',
      'تنفيذ حملات توعية صحية والوقاية من الأمراض ودعم الصحة الإنجابية.',
      'التنسيق مع المستشفيات والوحدات الصحية لتسهيل خدمة المواطنين.'
    ],
    goals: [
      'توفير رعاية صحية أولية وتوعوية قريبة من كل مواطن.',
      'تعزيز الصحة العامة ومواجهة التحديات السكانية.'
    ],
    isActive: true,
    sortOrder: 10,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-religious',
    name: 'أمانة الشؤون الدينية',
    slug: 'religious-affairs',
    description: 'المسؤولة عن نشر القيم الأخلاقية والروحية السمحة، وتعزيز الخطاب الديني الوسطي، وتنظيم الندوات والاحتفالات الدينية.',
    duties: [
      'تنظيم الندوات التثقيفية التي ترسخ قيم التسامح والانتماء والخلق القويم.',
      'المشاركة في إحياء المناسبات الدينية والوطنية ومبادرات التكافل.',
      'مواجهة الأفكار المتطرفة بتعزيز الوعي المستنير.'
    ],
    goals: [
      'ترسيخ القيم الدينية والوطنية الجامعة لكل المصريين.',
      'تعزيز السلم المجتمعي والترابط الأسري والأخلاقي.'
    ],
    isActive: true,
    sortOrder: 11,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-entrepreneurship',
    name: 'أمانة ريادة الأعمال',
    slug: 'entrepreneurship',
    description: 'المسؤولة عن احتضان الأفكار الابتكارية للشباب، ودعم الشركات الناشئة والتدريب على نماذج الأعمال الحديثة والتحول الرقمي.',
    duties: [
      'تنظيم ورش عمل في ريادة الأعمال والتسويق الرقمي وإدارة المشاريع.',
      'توجيه الشباب المبتكر لجهات التمويل وحاضنات الأعمال.',
      'عقد ملتقيات لعرض تجارب رواد الأعمال الناجحين.'
    ],
    goals: [
      'نشر ثقافة العمل الحر والابتكار بين شباب قسم ثالث أكتوبر.',
      'بناء جيل من رواد الأعمال القادرين على خلق فرص عمل جديدة.'
    ],
    isActive: true,
    sortOrder: 12,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-investment',
    name: 'أمانة الاستثمار والشؤون الاقتصادية',
    slug: 'investment-and-economic-affairs',
    description: 'المسؤولة عن إعداد الرؤى الاقتصادية، وتحفيز المناخ الاستثماري، ودراسة الفرص التنموية في نطاق قسم ثالث أكتوبر ومحافظة الجيزة.',
    duties: [
      'إعداد أوراق عمل ودراسات حول الفرص الاستثمارية والملفات الاقتصادية.',
      'رصد أثر السياسات الاقتصادية على المواطنين وتقديم توصيات عملية.',
      'بناء جسور تعاون مع المستثمرين لدعم المشروعات ذات العائد المجتمعي.'
    ],
    goals: [
      'تعزيز النمو الاقتصادي المستدام وجذب الاستثمارات المنتجة.',
      'صياغة مقترحات اقتصادية تخدم التنمية المحلية والوطنية.'
    ],
    isActive: true,
    sortOrder: 13,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-social-protection',
    name: 'أمانة الحماية الاجتماعية',
    slug: 'social-protection',
    description: 'المسؤولة عن شبكات الأمان والتكافل الاجتماعي، ورعاية الأسر الأولى بالرعاية والأيتام وكبار السن وتنظيم القوافل الإغاثية.',
    duties: [
      'حصر الأسر الأولى بالرعاية وتنظيم قوافل الدعم الغذائي والاجتماعي.',
      'تسهيل وصول المواطنين لبرامج الحماية الاجتماعية والخدمات التكافلية.',
      'تنظيم المبادرات الموسمية لرفع الأعباء عن كاهل الأسر.'
    ],
    goals: [
      'تحقيق العدالة والتكافل الاجتماعي في كافة أحياء قسم ثالث أكتوبر.',
      'توفير مظلة دعم إنسانية مستدامة للفئات الأكثر احتياجاً.'
    ],
    isActive: true,
    sortOrder: 14,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-crisis',
    name: 'أمانة إدارة الأزمات والتدخلات العاجلة',
    slug: 'crisis-management-and-urgent-interventions',
    description: 'المسؤولة عن سرعة الاستجابة للطوارئ والأزمات الميدانية، وتنسيق فرق المتطوعين والتدخل السريع لخدمة أهالي المنطقة.',
    duties: [
      'تشكيل غرف متابعة وفرق تدخل سريع للاستجابة للبلاغات والطوارئ.',
      'تنسيق جهود الإغاثة والدعم الفوري في حالات الأزمات المناخية أو الخدمية.',
      'إعداد خطط استباقية للتعامل مع المخاطر والأزمات المحلية.'
    ],
    goals: [
      'حماية المواطنين وتقليل آثار الأزمات عبر سرعة التدخل والتنسيق.',
      'بناء منظومة جاهزية وتطوع ميداني سريعة وفعالة.'
    ],
    isActive: true,
    sortOrder: 15,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-sme',
    name: 'أمانة المشروعات الصغيرة والمتوسطة',
    slug: 'small-and-medium-enterprises',
    description: 'المسؤولة عن دعم أصحاب الورش والمشروعات الصغيرة والمتوسطة، وتقديم الإرشاد الإداري والفني وتيسير التمويل والتسويق.',
    duties: [
      'تقديم الدعم الاستشاري ودراسات الجدوى لأصحاب المشروعات الصغيرة.',
      'تنظيم معارض تسويقية لمنتجات المشروعات الصغيرة والحرفية.',
      'تذليل العقبات التمويلية والإجرائية بالتعاون مع الجهات المعنية.'
    ],
    goals: [
      'تعزيز مساهمة المشروعات الصغيرة والمتوسطة في الاقتصاد المحلي.',
      'تحويل الأفكار الإنتاجية إلى مشروعات مستقرة ومربحة.'
    ],
    isActive: true,
    sortOrder: 16,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-media',
    name: 'أمانة الإعلام',
    slug: 'media',
    description: 'الذراع الإعلامي الرسمي المسؤول عن إدارة الرسالة الإعلامية، والتغطية الصحفية، والإنتاج المرئي والمنصات الرقمية للأمانة.',
    duties: [
      'تغطية وتوثيق كافة الفعاليات والمبادرات بالصور والفيديو والبيانات الصحفية.',
      'إدارة المنصات الرقمية والتواصل الفعال مع وسائل الإعلام.',
      'إبراز إنجازات الحزب وأنشطة أمانة قسم ثالث أكتوبر بصورة احترافية.'
    ],
    goals: [
      'إيصال صوت الحزب ورؤيته بوضوح ومصداقية لجميع المواطنين.',
      'تقديم محتوى إعلامي مهني يعكس نبض الشارع واحتياجاته.'
    ],
    isActive: true,
    sortOrder: 17,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-citizenship',
    name: 'أمانة المواطنة',
    slug: 'citizenship',
    description: 'المسؤولة عن ترسيخ قيم المواطنة الكاملة والمساواة دون تمييز، وتعزيز الوحدة الوطنية والاندماج المجتمعي في كل المناسبات.',
    duties: [
      'تنظيم لقاءات وحوارات مجتمعية تعزز التماسك والوحدة الوطنية.',
      'نشر ثقافة الحقوق والواجبات وسيادة القانون وتكافؤ الفرص.',
      'المشاركة في المبادرات المشتركة بين كافة أطياف المجتمع.'
    ],
    goals: [
      'ترسيخ مبدأ «مصر للجميع» والمساواة الكاملة بين كافة المواطنين.',
      'بناء مجتمع متماسك يسوده الاحترام المتبادل والانتماء للوطن.'
    ],
    isActive: true,
    sortOrder: 18,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-tourism',
    name: 'أمانة السياحة والآثار',
    slug: 'tourism-and-antiquities',
    description: 'المسؤولة عن الترويج للسياحة الثقافية والأثرية والترفيهية، ودعم المبادرات المرتبطة بالمنطقة الأثرية بالجيزة وأكتوبر والمتحف المصري الكبير.',
    duties: [
      'تنظيم زيارات وبرامج تعريفية بالمعالم السياحية والأثرية لأهالي وشباب المنطقة.',
      'إعداد مقترحات لتنشيط السياحة والخدمات الفندقية والإرشادية بالجيزة وأكتوبر.',
      'نشر الوعي بأهمية الحفاظ على التراث الحضاري والآثار المصرية.'
    ],
    goals: [
      'تعظيم الاستفادة المجتمعية والاقتصادية من المقومات السياحية بالجيزة.',
      'تعزيز الوعي التاريخي والانتماء الحضاري لدى الشباب.'
    ],
    isActive: true,
    sortOrder: 19,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-tribes',
    name: 'أمانة القبائل العربية',
    slug: 'arab-tribes',
    description: 'المسؤولة عن مد جسور التواصل مع العائلات والقبائل العربية في نطاق أكتوبر والجيزة، وتعزيز دورهم الوطني والمجتمعي.',
    duties: [
      'عقد اللقاءات التشاورية مع رموز وعواقل القبائل والعائلات العربية.',
      'تعزيز المشاركة المجتمعية وحل النزاعات ودعم السلم الأهلي.',
      'تفعيل دور أبناء القبائل العربية في المبادرات التنموية والخدمية.'
    ],
    goals: [
      'تعميق التلاحم الوطني والاجتماعي مع القبائل والعائلات العربية.',
      'استثمار الترابط الأسري والقبلي في خدمة المجتمع المحلي.'
    ],
    isActive: true,
    sortOrder: 20,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-local-councils',
    name: 'أمانة شؤون المجالس المحلية',
    slug: 'local-councils-affairs',
    description: 'المسؤولة عن إعداد وتأهيل الكوادر للعمل المحلي، ومتابعة ملفات الإدارة المحلية والرقابة المجتمعية على الخدمات العامة.',
    duties: [
      'تأهيل الكوادر الحزبية بالقوانين المنظمة للإدارة والمجالس المحلية.',
      'رصد أولويات الخدمات المحلية في الأحياء ورفع تقارير ومقترحات بشأنها.',
      'بناء تواصل فعال بين المواطنين وآليات العمل المحلي والتنفيذي.'
    ],
    goals: [
      'إعداد قيادات محلية واعية وقادرة على تمثيل أهالي قسم ثالث أكتوبر.',
      'تحسين كفاءة المرافق والخدمات المحلية بمشاركة مجتمعية فاعلة.'
    ],
    isActive: true,
    sortOrder: 21,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-culture',
    name: 'أمانة الثقافة والفنون',
    slug: 'culture-and-arts',
    description: 'المسؤولة عن رعاية الحراك الثقافي والفني، واكتشاف المواهب الأدبية والفنية، وتنظيم الصالونات الثقافية ومعارض الكتاب والفنون.',
    duties: [
      'تنظيم الندوات والصالونات الثقافية والمسابقات الأدبية والفنية.',
      'رعاية المواهب الشابة في الفنون التشكيلية والمسرح والموسيقى والكتابة.',
      'نشر الوعي الثقافي وإتاحة الأنشطة الإبداعية لأهالي المنطقة.'
    ],
    goals: [
      'إثراء الحياة الثقافية والفنية في قسم ثالث أكتوبر.',
      'بناء الوعي الإبداعي والحفاظ على الهوية الثقافية المصرية.'
    ],
    isActive: true,
    sortOrder: 22,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-environment',
    name: 'أمانة البيئة والتنمية المستدامة',
    slug: 'environment-and-sustainable-development',
    description: 'المسؤولة عن حماية البيئة، وتنظيم حملات التشجير والنظافة وإعادة التدوير، ونشر ثقافة التنمية المستدامة والطاقة النظيفة.',
    duties: [
      'تنفيذ مبادرات التشجير وتجميل الميادين والحدائق بأحياء قسم ثالث أكتوبر.',
      'نشر الوعي البيئي وثقافة ترشيد الموارد وإدارة المخلفات.',
      'رصد التحديات البيئية وتقديم حلول مستدامة بالتعاون مع المجتمع المدني.'
    ],
    goals: [
      'تحقيق بيئة صحية ونظيفة وخضراء لأهالي قسم ثالث أكتوبر.',
      'دعم أهداف التنمية المستدامة والتحول الأخضر.'
    ],
    isActive: true,
    sortOrder: 23,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-workers',
    name: 'أمانة العمال',
    slug: 'workers',
    description: 'المسؤولة عن دعم ورعاية حقوق العمال والفنيين والحرفيين في المناطق الصناعية والخدمية، وتنظيم ملتقيات التوظيف والتدريب المهني.',
    duties: [
      'التواصل المباشر مع العمال في المناطق الصناعية والورش لبحث احتياجاتهم.',
      'تنظيم دورات تدريب مهني وملتقيات توظيف بالتعاون مع الشركات والمصانع.',
      'نشر الوعي بقوانين العمل والسلامة والصحة المهنية.'
    ],
    goals: [
      'حماية حقوق العمال وتحسين ظروف العمل والإنتاج.',
      'ربط الكوادر العمالية والحرفية بفرص التشغيل والتأهيل المهني.'
    ],
    isActive: true,
    sortOrder: 24,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-public-outreach',
    name: 'أمانة التواصل الجماهيري',
    slug: 'public-outreach',
    description: 'المسؤولة عن مد جسور التواصل الميداني والمباشر مع المواطنين في كافة الشوارع والأحياء، واستقبال مقترحاتهم وشكاواهم وتعزيز التفاعل الجماهيري.',
    duties: [
      'تنظيم اللقاءات الجماهيرية المفتوحة والاستماع المباشر لمطالب المواطنين.',
      'إدارة قنوات التواصل المجتمعي والمبادرات التشاركية في الأحياء.',
      'متابعة شكاوى ومقترحات الأهالي وتوجيهها للأمانات والجهات المختصة.'
    ],
    goals: [
      'تحقيق تواصل مستمر وفعّال يضع المواطن في قلب أولويات الأمانة.',
      'بناء ثقة راسخة ومشاركة شعبية حقيقية في قسم ثالث أكتوبر.'
    ],
    isActive: true,
    sortOrder: 25,
    createdAt: new Date().toISOString()
  }
];

const INITIAL_ROLES: AdminRole[] = [
  {
    id: 'role-super-admin',
    name: 'المدير العام الرئيسي (Super Admin)',
    description: 'كامل الصلاحيات الإدارية والتقنية وإدارة الأدوار والمستخدمين وسجل العمليات',
    isSystem: true,
    permissions: [
      'leaders_party',
      'leaders_secretariat',
      'secretariats',
      'initiatives',
      'applications',
      'members',
      'news',
      'events',
      'media',
      'livestream',
      'pages',
      'roles',
      'admins',
      'settings',
      'audit'
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'role-content-manager',
    name: 'مدير المحتوى والإعلام (Content Manager)',
    description: 'صلاحيات كاملة لنشر وتعديل وحذف الأخبار والبيانات الصحفية وإدارة صفحات المحتوى الثابت (CMS)',
    isSystem: true,
    permissions: ['news', 'pages'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'role-membership-officer',
    name: 'مسؤول العضوية وشؤون المنضمين (Membership Officer)',
    description: 'فحص ومراجعة طلبات الانضمام الرقمية ومستندات الهوية وإدراج الأعضاء بالسجل المركزي',
    isSystem: true,
    permissions: ['applications', 'members'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'role-events-coordinator',
    name: 'منسق الفعاليات والأنشطة (Events Coordinator)',
    description: 'جدولة وتنظيم الفعاليات والمؤتمرات الميدانية وإدارة البث المباشر',
    isSystem: true,
    permissions: ['events', 'livestream'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'role-leadership-admin',
    name: 'مسؤول القيادات والهياكل (Leadership Administrator)',
    description: 'إدارة وتحديث قيادات الحزب على مستوى الجمهورية والمحافظات وقيادات أمانة قسم ثالث أكتوبر',
    isSystem: true,
    permissions: ['leaders_party', 'leaders_secretariat'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'role-secretariats-manager',
    name: 'مدير الأمانات (Secretariats Manager)',
    description: 'إدارة أمانات الحزب وتكليفات الأعضاء ونقل الأعضاء بين الأمانات',
    isSystem: true,
    permissions: ['secretariats'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'role-media-officer',
    name: 'أمين المعرض والوسائط (Media & Gallery Officer)',
    description: 'إدارة وتوثيق ألبومات الصور ومقاطع الفيديو التوثيقية',
    isSystem: true,
    permissions: ['media'],
    createdAt: new Date().toISOString()
  }
];

const INITIAL_PAGES: CMSPage[] = [
  {
    id: 'page-about',
    slug: 'about',
    title: 'عن الحزب والأمانة',
    subtitle: 'الرؤية والرسالة والمبادئ الوطنية لحزب الجبهة الوطنية',
    content: `حزب الجبهة الوطنية هو حزب سياسى مدنى ديمقراطى يحق لأى مصرى الإنتماء إلى عضويته دون تفرقة أو تمييز ويهدف إلى إعلاء قيم العدل والمساواة والحرية وإحترام حقوق الإنسان. وهو كيان سياسي مصري يهدف إلى إحداث تغيير حقيقي في المشهد السياسي من خلال تعزيز المشاركة الشعبية الفاعلة والصادقة.\n\nتختص أمانة قسم ثالث أكتوبر بمحافظة الجيزة بتنظيم العمل الحزبي الميداني وخدمة أهالي وشباب المنطقة عبر شبكة من الأمانات واللجان الفاعلة والمبادرات التنموية البناءة وتسهيل انضمام الكوادر المخلصة للعمل العام، انطلاقاً من مبدأ أن العمل الجماعي هو السبيل لتحقيق تطلعات الشعب المصري.\n\nرؤيتنا:\nيعمل الحزب على بناء نموذج ديمقراطي يُعزز ثقافة الحوار والتعاون بين جميع أطياف المجتمع، مع التركيز على تحقيق العدالة الاجتماعية والتنمية المستدامة. يسعى الحزب إلى أن يكون بيت خبرة وطني يخدم مصلحة الوطن العليا بعيدًا عن أي توجهات ضيقة أو شخصية، مستندًا إلى رؤية شاملة تستند إلى قيم الحرية، العدالة، وسيادة القانون. يجمع الحزب بين طاقات الشباب وخبرات الأجيال لإيجاد حلول حقيقية للتحديات التي تواجه الوطن، إيمانًا بأن العمل الجماعي هو السبيل لتحقيق تطلعات الشعب المصري نحو مستقبل أفضل.\n\nمبادئنا الأساسية:\n1. معًا نبني مستقبلًا مشرقًا لمصر.\n2. حزب سياسي مدني ديمقراطي يحق لأي مصري الانتماء إلى عضويته دون تفرقة أو تمييز.\n3. إعلاء قيم العدل والمساواة والحرية واحترام حقوق الإنسان وسيادة القانون.\n4. تعزيز المشاركة الشعبية الفاعلة والصادقة وإحداث تغيير حقيقي في المشهد السياسي.\n5. العدالة الاجتماعية والتنمية المستدامة وتكافؤ الفرص لكافة المواطنين.\n6. بيت خبرة وطني يخدم مصلحة الوطن العليا ويجمع بين طاقات الشباب وخبرات الأجيال.`,
    coverImage: '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg',
    galleryImages: [],
    metaDescription: 'الرؤية والرسالة والمبادئ الوطنية لحزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر بمحافظة الجيزة.',
    isPublished: true,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'page-leadership',
    slug: 'party-leadership-overview',
    title: 'نظرة عامة على قيادات الحزب',
    subtitle: 'الهيكل القيادي والتسلسل التنظيمي على مستوى الجمهورية والمحافظات',
    content: `يقوم البناء التنظيمي لحزب الجبهة الوطنية على هيكل مؤسسي رصين يجمع بين الخبرات الوطنية والقيادات الواعدة، بدءاً من رئاسة الحزب والهيئة العليا، ونواب رئيس الحزب، والأمانة العامة والأمناء العامين المساعدين، مروراً بأمانات المحافظات وعلى رأسها أمانة محافظة الجيزة.\n\nيحرص الحزب على دعم العمل الميداني اللامركزي، حيث تحظى كل أمانة فرعية بالصلاحيات الكافية لتنفيذ الخطط التنموية وخدمة المواطنين في نطاقها الجغرافي بما يحقق مصلحة الوطن والمواطن.`,
    coverImage: '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg',
    galleryImages: [],
    metaDescription: 'نظرة عامة شاملة على قيادات حزب الجبهة الوطنية والتسلسل القيادي العام بالمحافظات.',
    isPublished: true,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'page-committees',
    slug: 'specialized-committees',
    title: 'أمانات الحزب واللجان النوعية',
    subtitle: 'محركات التخطيط والتنفيذ الميداني بأمانة قسم ثالث أكتوبر',
    content: `تعتمد أمانة قسم ثالث أكتوبر على أمانات فاعلة تعمل بتكامل تام لتغطية كافة متطلبات العمل العام والخدمة المجتمعية.`,
    coverImage: '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg',
    galleryImages: [],
    metaDescription: 'دليل أمانات حزب الجبهة الوطنية واللجان النوعية بأمانة قسم ثالث أكتوبر – محافظة الجيزة.',
    isPublished: true,
    updatedAt: new Date().toISOString()
  }
];

function getInitialDatabase(): AppDatabase {
  return {
    partyLeaders: [],
    secretariatLeaders: [],
    specializedSecretariats: INITIAL_SECRETARIATS,
    secretariatMembers: [],
    initiatives: [
      {
        id: 'init-1',
        slug: 'october-first',
        title: 'مبادرة أهالينا – دعم وتنمية قسم ثالث أكتوبر',
        description: 'مبادرة مجتمعية شاملة تستهدف تقديم الدعم التنموي والخدمي والصحي لأهالي ومناطق قسم ثالث أكتوبر بمحافظة الجيزة بمشاركة كل الأمانات التخصصية.',
        goals: [
          'تنظيم قوافل طبية وغذائية دورية.',
          'تقديم الاستشارات القانونية والمجتمعية المجانية.',
          'رعاية ودعم الأسر الأولى بالرعاية والشباب الباحث عن فرص عمل.'
        ],
        startDate: '2026-01-01',
        status: 'active',
        activities: [
          {
            title: 'إطلاق المرحلة الأولى الميدانية وتوزيع المساعدات',
            date: '2026-02-15',
            description: 'انطلاق فرق العمل الميدانية في شوارع وأحياء قسم ثالث أكتوبر.'
          }
        ],
        isVisible: true,
        createdAt: new Date().toISOString()
      }
    ],
    news: [
      {
        id: 'news-1',
        title: 'أمانة قسم ثالث أكتوبر تدشن منصتها الإلكترونية المتكاملة لخدمة المواطنين',
        excerpt: 'في إطار التحول الرقمي للحزب، انطلقت رسمياً المنصة الإلكترونية لتسهيل التواصل وتقديم طلبات الانضمام.',
        content: `أعلنت أمانة قسم ثالث أكتوبر بحزب الجبهة الوطنية بمحافظة الجيزة عن إطلاق منصتها الإلكترونية الرسمية، تحت شعار «مصر للجميع»، بهدف تعزيز التواصل المستمر مع أهالي المنطقة، وتوفير نافذة رقمية آمنة ومباشرة لتقديم طلبات الانضمام ومتابعة الفعاليات والمبادرات لحظة بلحظة. وأكدت الأمانة أن المنصة تعكس التزام الحزب بالشفافية والعمل المؤسسي الحديث.`,
        coverImage: '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg',
        galleryImages: [],
        publishDate: new Date().toISOString().split('T')[0],
        isFeatured: true,
        isDraft: false,
        createdAt: new Date().toISOString()
      }
    ],
    events: [
      {
        id: 'event-1',
        title: 'اللقاء التنظيمي الموسع لقيادات وكوادر قسم ثالث أكتوبر',
        description: 'اجتماع تنظيمي هام لمناقشة خطة العمل الميدانية للأشهر القادمة وتنسيق فعاليات الأمانات التخصصية لخدمة أهالي الجيزة.',
        dateTime: '2026-11-20T18:00',
        venue: 'مقر حزب الجبهة الوطنية – قسم ثالث أكتوبر',
        organizer: 'أمانة التنظيم وأمانة قسم ثالث أكتوبر',
        images: ['/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg'],
        status: 'upcoming',
        isVisible: true,
        createdAt: new Date().toISOString()
      }
    ],
    media: [
      {
        id: 'med-1',
        type: 'photo',
        title: 'شعار وهوية حزب الجبهة الوطنية الرسمية',
        description: 'الهوية البصرية الرسمية لأمانة قسم ثالث أكتوبر – محافظة الجيزة',
        url: '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg',
        albumName: 'الهوية الرسمية والفعاليات',
        isVisible: true,
        sortOrder: 1,
        createdAt: new Date().toISOString()
      }
    ],
    liveStream: {
      id: 'stream-default',
      title: 'البث المباشر لفعاليات ومؤتمرات الحزب',
      description: 'تابع البث المباشر للمؤتمرات والندوات العامة لأمانة قسم ثالث أكتوبر.',
      streamUrl: 'https://www.facebook.com/fational.front.party',
      isActive: false,
      platform: 'facebook'
    },
    applications: [],
    members: [],
    roles: INITIAL_ROLES,
    pages: INITIAL_PAGES,
    admins: [
      {
        id: 'super-admin-1',
        email: 'moazmahmoud586@gmail.com',
        name: 'معاذ محمود (المدير الرئيسي)',
        passwordHash: hashPassword('Moaz2008@'),
        role: 'super_admin',
        roleId: 'role-super-admin',
        permissions: [
          'leaders_party',
          'leaders_secretariat',
          'secretariats',
          'initiatives',
          'applications',
          'members',
          'news',
          'events',
          'media',
          'livestream',
          'pages',
          'roles',
          'admins',
          'settings',
          'audit'
        ],
        isActive: true,
        createdAt: new Date().toISOString()
      }
    ],
    auditLogs: [
      {
        id: 'log-init',
        adminEmail: 'system',
        adminName: 'النظام',
        action: 'تأسيس المنصة وقاعدة البيانات',
        entityType: 'System',
        details: 'تم إعداد قاعدة البيانات الدائمة وتهيئة حساب المدير الرئيسي والأمانات التخصصية بنجاح.',
        timestamp: new Date().toISOString()
      }
    ],
    settings: {
      partyName: 'حزب الجبهة الوطنية',
      secretariatName: 'أمانة قسم ثالث أكتوبر – محافظة الجيزة',
      slogan: 'مصر للجميع',
      officialLogo: '/assets/aistudio/FB_IMG_1793904484101_850eafaf.jpg',
      phone: '01003070108',
      whatsapp: '01003070108',
      whatsappLink: 'https://wa.me/201003070108',
      email: 'nationalfrontpartyrdofoctoberd@gmail.com',
      address: 'قسم ثالث أكتوبر، محافظة الجيزة، جمهورية مصر العربية',
      facebookUrl: 'https://www.facebook.com/fational.front.party',
      socialLinks: [
        {
          id: 'soc-fb',
          platform: 'facebook',
          url: 'https://www.facebook.com/fational.front.party',
          label: 'صفحة فيسبوك الرسمية'
        },
        {
          id: 'soc-wa',
          platform: 'whatsapp',
          url: 'https://wa.me/201003070108',
          label: 'واتساب الأمانة'
        }
      ],
      aboutParty: 'حزب الجبهة الوطنية هو حزب سياسى مدنى ديمقراطى يحق لأى مصرى الإنتماء إلى عضويته دون تفرقة أو تمييز ويهدف إلى إعلاء قيم العدل والمساواة والحرية وإحترام حقوق الإنسان. وهو كيان سياسي مصري يهدف إلى إحداث تغيير حقيقي في المشهد السياسي من خلال تعزيز المشاركة الشعبية الفاعلة والصادقة.',
      aboutSecretariat: 'تختص أمانة قسم ثالث أكتوبر بمحافظة الجيزة بتنظيم العمل الحزبي الميداني وخدمة أهالي وشباب المنطقة عبر شبكة من الأمانات واللجان الفاعلة والمبادرات التنموية البناءة وتسهيل انضمام الكوادر المخلصة للعمل العام، انطلاقاً من مبدأ أن العمل الجماعي هو السبيل لتحقيق تطلعات الشعب المصري.',
      vision: 'يعمل الحزب على بناء نموذج ديمقراطي يُعزز ثقافة الحوار والتعاون بين جميع أطياف المجتمع، مع التركيز على تحقيق العدالة الاجتماعية والتنمية المستدامة. يسعى الحزب إلى أن يكون بيت خبرة وطني يخدم مصلحة الوطن العليا بعيدًا عن أي توجهات ضيقة أو شخصية، مستندًا إلى رؤية شاملة تستند إلى قيم الحرية، العدالة، وسيادة القانون. يجمع الحزب بين طاقات الشباب وخبرات الأجيال لإيجاد حلول حقيقية للتحديات التي تواجه الوطن، إيمانًا بأن العمل الجماعي هو السبيل لتحقيق تطلعات الشعب المصري نحو مستقبل أفضل.',
      principles: [
        'معًا نبني مستقبلًا مشرقًا لمصر.',
        'حزب سياسي مدني ديمقراطي يحق لأي مصري الانتماء إلى عضويته دون تفرقة أو تمييز.',
        'إعلاء قيم العدل والمساواة والحرية واحترام حقوق الإنسان وسيادة القانون.',
        'تعزيز المشاركة الشعبية الفاعلة والصادقة وإحداث تغيير حقيقي في المشهد السياسي.',
        'العدالة الاجتماعية والتنمية المستدامة وتكافؤ الفرص لكافة المواطنين.',
        'بيت خبرة وطني يخدم مصلحة الوطن العليا ويجمع بين طاقات الشباب وخبرات الأجيال.'
      ],
      locationUrl: 'https://maps.app.goo.gl/iw7sGSbbb2K1g6yZ7?g_st=ac',
      mapEmbedUrl: 'https://maps.google.com/maps?q=%D8%AD%D8%B2%D8%A8+%D8%A7%D9%84%D8%AC%D8%A8%D9%87%D8%A9+%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A%D8%A9+%D8%A3%D9%85%D8%A7%D9%86%D8%A9+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+%D8%A7%D9%83%D8%AA%D9%88%D8%A8%D8%B1%D8%8C+%D8%B7%D8%B1%D9%8A%D9%82+%D8%A7%D9%84%D8%B4%D8%A7%D8%B0%D9%84%D9%89+%D8%A7%D8%A8%D9%86%D9%89+%D8%A8%D9%8A%D8%AA%D9%83+7%D8%8C+%D9%82%D8%B3%D9%85+%D8%AB%D8%A7%D9%84%D8%AB+6+%D8%A3%D9%83%D8%AA%D9%88%D8%A8%D8%B1%D8%8C+%D9%85%D8%AD%D8%A7%D9%81%D8%B8%D8%A9+%D8%A7%D9%84%D8%AC%D9%8A%D8%B2%D8%A9&t=&z=16&ie=UTF8&iwloc=B&output=embed',
      coordinates: '29.980836, 30.840788',
      secretariatsVersion: 25
    }
  };
}

class DatabaseManager {
  private data: AppDatabase;

  constructor() {
    this.ensureDirectory();
    this.data = this.load();
  }

  private ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const uploadsDir = path.join(DATA_DIR, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  }

  private load(): AppDatabase {
    const backupFile = `${DB_FILE}.bak`;
    let raw = '';
    try {
      if (fs.existsSync(DB_FILE)) {
        raw = fs.readFileSync(DB_FILE, 'utf-8');
      } else if (fs.existsSync(backupFile)) {
        raw = fs.readFileSync(backupFile, 'utf-8');
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        const initial = getInitialDatabase();
        const assembled: AppDatabase = {
          ...initial,
          ...parsed,
          settings: { ...initial.settings, ...(parsed.settings || {}), secretariatsVersion: parsed.settings?.secretariatsVersion },
          partyLeaders: Array.isArray(parsed.partyLeaders) ? parsed.partyLeaders : [],
          secretariatLeaders: Array.isArray(parsed.secretariatLeaders) ? parsed.secretariatLeaders : [],
          specializedSecretariats: Array.isArray(parsed.specializedSecretariats)
            ? parsed.specializedSecretariats
            : initial.specializedSecretariats,
          secretariatMembers: Array.isArray(parsed.secretariatMembers) ? parsed.secretariatMembers : [],
          initiatives: Array.isArray(parsed.initiatives) ? parsed.initiatives : initial.initiatives,
          news: Array.isArray(parsed.news) ? parsed.news : initial.news,
          events: Array.isArray(parsed.events) ? parsed.events : initial.events,
          media: Array.isArray(parsed.media) ? parsed.media : initial.media,
          liveStream: parsed.liveStream || initial.liveStream,
          applications: Array.isArray(parsed.applications) ? parsed.applications : [],
          members: Array.isArray(parsed.members) ? parsed.members : [],
          roles: Array.isArray(parsed.roles) ? parsed.roles : initial.roles,
          pages: Array.isArray(parsed.pages) ? parsed.pages : initial.pages,
          admins: Array.isArray(parsed.admins) ? parsed.admins : initial.admins,
          auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : initial.auditLogs
        };

        const migrated = this.migrateSecretariatsIfNeeded(assembled);
        if (migrated) {
          this.save(assembled);
        }
        return assembled;
      }
    } catch (err) {
      console.error('Error loading database file:', err);
      // Try loading from backup
      if (fs.existsSync(backupFile)) {
        try {
          const bakRaw = fs.readFileSync(backupFile, 'utf-8');
          const parsed = JSON.parse(bakRaw);
          const initial = getInitialDatabase();
          const assembled = { ...initial, ...parsed };
          this.migrateSecretariatsIfNeeded(assembled);
          return assembled;
        } catch {
          // ignore
        }
      }
    }
    const initial = getInitialDatabase();
    // Only save initial if DB_FILE genuinely doesn't exist
    if (!fs.existsSync(DB_FILE)) {
      this.save(initial);
    }
    return initial;
  }

  private migrateSecretariatsIfNeeded(dbObj: AppDatabase): boolean {
    const normalizeAr = (s: string) =>
      String(s || '')
        .trim()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/\s+/g, ' ');

    const isBannedSectionSec = (s: SpecializedSecretariat) => {
      const n = normalizeAr(s.name || '');
      return n === 'امانه القسم' || n === 'قسم ثالث اكتوبر' || s.slug === 'district-secretariat';
    };

    let changed = false;

    // One-time upgrade from legacy 9 secretariats -> canonical 25 secretariats
    if (dbObj.settings.secretariatsVersion !== 25) {
      const existing = dbObj.specializedSecretariats || [];

      // Map old secretariat IDs/names to the closest canonical ID so zero members/records are orphaned
      const legacyToCanonicalId: Record<string, string> = {
        'sec-org': 'sec-org',
        'sec-hr': 'sec-membership',
        'sec-training': 'sec-education',
        'sec-tech': 'sec-entrepreneurship',
        'sec-pr': 'sec-public-outreach',
        'sec-media': 'sec-media',
        'sec-marketing': 'sec-public-outreach',
        'sec-me': 'sec-org',
        'sec-rd': 'sec-education'
      };

      const oldById = new Map<string, SpecializedSecretariat>();
      const oldByNormName = new Map<string, SpecializedSecretariat>();
      for (const s of existing) {
        if (s?.id) oldById.set(s.id, s);
        if (s?.name) oldByNormName.set(normalizeAr(s.name), s);
      }

      const idRemap: Record<string, string> = { ...legacyToCanonicalId };

      const newList: SpecializedSecretariat[] = INITIAL_SECRETARIATS.map(canonical => {
        // Check if an old secretariat matches by normalized name or exact mapped ID (e.g. sec-org, sec-media)
        const matchedOld =
          oldByNormName.get(normalizeAr(canonical.name)) ||
          (canonical.id === 'sec-org' ? oldById.get('sec-org') : undefined) ||
          (canonical.id === 'sec-media' ? oldById.get('sec-media') : undefined);

        if (matchedOld) {
          idRemap[matchedOld.id] = canonical.id;
          return {
            ...canonical,
            secretaryName: matchedOld.secretaryName || canonical.secretaryName,
            secretaryPhotoUrl: matchedOld.secretaryPhotoUrl || canonical.secretaryPhotoUrl,
            secretaryBio: matchedOld.secretaryBio || canonical.secretaryBio,
            secretaryPhone: matchedOld.secretaryPhone || canonical.secretaryPhone,
            assistantSecretaries:
              matchedOld.assistantSecretaries && matchedOld.assistantSecretaries.length > 0
                ? matchedOld.assistantSecretaries
                : canonical.assistantSecretaries,
            assistantSecretaryName: matchedOld.assistantSecretaryName || canonical.assistantSecretaryName,
            assistantSecretaryPhotoUrl: matchedOld.assistantSecretaryPhotoUrl || canonical.assistantSecretaryPhotoUrl,
            assistantSecretaryBio: matchedOld.assistantSecretaryBio || canonical.assistantSecretaryBio,
            assistantSecretaryPhone: matchedOld.assistantSecretaryPhone || canonical.assistantSecretaryPhone,
            galleryImages:
              matchedOld.galleryImages && matchedOld.galleryImages.length > 0
                ? matchedOld.galleryImages
                : canonical.galleryImages,
            videos:
              matchedOld.videos && matchedOld.videos.length > 0
                ? matchedOld.videos
                : canonical.videos,
            logoUrl: matchedOld.logoUrl || canonical.logoUrl,
            coverUrl: matchedOld.coverUrl || canonical.coverUrl
          };
        }
        return { ...canonical };
      });

      const remapSecId = (oldId?: string): string | undefined => {
        if (!oldId) return oldId;
        if (idRemap[oldId]) return idRemap[oldId];
        const found = oldById.get(oldId);
        if (found && !isBannedSectionSec(found)) {
          const byName = newList.find(n => normalizeAr(n.name) === normalizeAr(found.name));
          if (byName) return byName.id;
        }
        return oldId;
      };

      // Re-link all existing member, leader, media, event, initiative, and admin assignments safely
      dbObj.secretariatMembers = (dbObj.secretariatMembers || []).map(sm => ({
        ...sm,
        secretariatId: remapSecId(sm.secretariatId) || sm.secretariatId
      }));
      dbObj.members = (dbObj.members || []).map(m => ({
        ...m,
        secretariatId: remapSecId(m.secretariatId),
        assignmentHistory: (m.assignmentHistory || []).map(h => {
          const nextId = remapSecId(h.secretariatId);
          const nextSec = newList.find(s => s.id === nextId);
          return {
            ...h,
            secretariatId: nextId,
            secretariatName: nextSec ? nextSec.name : h.secretariatName
          };
        })
      }));
      dbObj.secretariatLeaders = (dbObj.secretariatLeaders || []).map(l => ({
        ...l,
        specializedSecretariatId: remapSecId(l.specializedSecretariatId)
      }));
      dbObj.media = (dbObj.media || []).map(m => ({
        ...m,
        linkedSecretariatId: remapSecId(m.linkedSecretariatId)
      }));
      dbObj.news = (dbObj.news || []).map(n => ({
        ...n,
        linkedSecretariatId: remapSecId(n.linkedSecretariatId)
      }));
      dbObj.admins = (dbObj.admins || []).map(a => ({
        ...a,
        managedSecretariatId: remapSecId(a.managedSecretariatId)
      }));

      dbObj.specializedSecretariats = newList;
      dbObj.settings.secretariatsVersion = 25;
      changed = true;
    }

    // Always strip banned "أمانة القسم" and deduplicate by normalized Arabic name
    const seen = new Set<string>();
    const deduped: SpecializedSecretariat[] = [];
    for (const s of dbObj.specializedSecretariats || []) {
      if (!s || isBannedSectionSec(s)) {
        changed = true;
        continue;
      }
      const key = normalizeAr(s.name);
      if (seen.has(key)) {
        changed = true;
        continue;
      }
      seen.add(key);
      deduped.push(s);
    }
    if (deduped.length !== (dbObj.specializedSecretariats || []).length) {
      dbObj.specializedSecretariats = deduped;
      changed = true;
    }

    return changed;
  }

  public save(dataToSave?: AppDatabase): void {
    if (dataToSave) {
      this.data = dataToSave;
    }
    try {
      const backupFile = `${DB_FILE}.bak`;
      const tempPath = `${DB_FILE}.tmp.${Date.now()}`;
      const serialized = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(tempPath, serialized, 'utf-8');
      if (fs.existsSync(DB_FILE)) {
        try {
          fs.copyFileSync(DB_FILE, backupFile);
        } catch {
          // ignore
        }
      }
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Error saving database atomically:', err);
    }
  }

  public get(): AppDatabase {
    return this.data;
  }

  public update<K extends keyof AppDatabase>(key: K, value: AppDatabase[K]): void {
    this.data[key] = value;
    this.save();
  }

  public addAuditLog(adminEmail: string, adminName: string, action: string, entityType: string, details: string, entityId?: string) {
    const log: AuditLog = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      adminEmail,
      adminName,
      action,
      entityType,
      entityId,
      details,
      timestamp: new Date().toISOString()
    };
    this.data.auditLogs.unshift(log);
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    this.save();
  }
}

export const db = new DatabaseManager();
