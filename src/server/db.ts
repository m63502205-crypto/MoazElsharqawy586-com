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
  assistantSecretaryName?: string;
  assistantSecretaryPhotoUrl?: string;
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
  heroVideoUrl?: string;
  heroPosterUrl?: string;
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
    id: 'sec-hr',
    name: 'أمانة إدارة الموارد البشرية',
    slug: 'human-resources',
    description: 'المسؤولة عن استقطاب وتأهيل الكوادر الحزبية وبناء خطط التمكين والتطوير الإداري لكافة فرق العمل بالأمانة.',
    duties: [
      'استقبال وتقييم الكوادر المنضمة حديثاً للأمانة وتوجيهها للمسار الأنسب.',
      'إعداد الهياكل التنظيمية والتوصيف الدقيق للمهام.',
      'متابعة الحضور والأداء ومؤشرات الإنجاز لأعضاء هيئة المكتب واللجان.'
    ],
    goals: [
      'بناء كوادر حزبية محترفة وقادرة على القيادة الميدانية.',
      'خلق بيئة عمل تشاركية محفزة ومستدامة بأكتوبر.'
    ],
    isActive: true,
    sortOrder: 1,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-org',
    name: 'أمانة التنظيم',
    slug: 'organization',
    description: 'العصب الميداني المسؤول عن بناء القواعد الجماهيرية وتنسيق الأنشطة والوحدات الحزبية في كافة مناطق قسم ثالث أكتوبر.',
    duties: [
      'تأسيس ومتابعة التشكيلات التنظيمية بالقطاعات والأحياء.',
      'تنظيم المؤتمرات واللقاءات الجماهيرية والندوات العامة.',
      'التنسيق والتكامل بين جميع الأمانات التخصصية بالأمانة.'
    ],
    goals: [
      'ترسيخ التواجد الحزبي في كل شبر بقسم ثالث أكتوبر.',
      'إدارة الفعاليات الميدانية بكفاءة وانضباط تنظيمي صارم.'
    ],
    isActive: true,
    sortOrder: 2,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-training',
    name: 'أمانة التدريب والتثقيف',
    slug: 'training-and-education',
    description: 'المسؤولة عن بناء الوعي الوطني والسياسي، وإعداد برامج تدريبية تخصصية لشباب وكوادر الحزب.',
    duties: [
      'تنظيم ورش عمل وبرامج لإعداد القادة الشباب.',
      'إصدار النشرات والملخصات التثقيفية حول القضايا الوطنية.',
      'التعاون مع خبراء وأكاديميين لتقديم دورات معتمدة.'
    ],
    goals: [
      'تثقيف الكوادر بالقضايا الوطنية والتشريعية والدولية.',
      'رفع كفاءة أعضاء الأمانة في مهارات التواصل والخطاب العام.'
    ],
    isActive: true,
    sortOrder: 3,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-tech',
    name: 'أمانة التكنولوجيا',
    slug: 'technology',
    description: 'المسؤولة عن التحول الرقمي بالأمانة وإدارة المنظومة الإلكترونية وحماية البيانات وتطوير الأدوات التقنية.',
    duties: [
      'إدارة وصيانة المنصة الإلكترونية وقواعد البيانات المركزية.',
      'تأمين المعاملات والبيانات الشخصية وطلبات العضوية.',
      'تطوير الحلول الرقمية لتسهيل التواصل مع المواطنين.'
    ],
    goals: [
      'أمانة رقمية ذكية بالكامل خالية من التعقيدات الورقية.',
      'توظيف التكنولوجيا الحديثة لخدمة أهالي قسم ثالث أكتوبر.'
    ],
    isActive: true,
    sortOrder: 4,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-pr',
    name: 'أمانة العلاقات العامة',
    slug: 'public-relations',
    description: 'حلقة الوصل بين الحزب ومختلف المؤسسات الرسمية والمجتمعية والشخصيات العامة بمحافظة الجيزة.',
    duties: [
      'بناء شراكات مستمرة مع الجمعيات الأهلية والجهات التنفيذية.',
      'استقبال الوفود وتنسيق الزيارات والبروتوكولات الرسمية.',
      'إدارة العلاقات المجتمعية والمناسبات الوطنية والدينية.'
    ],
    goals: [
      'تعزيز الصورة الذهنية الإيجابية والمشرفة للحزب.',
      'توسيع شبكة التواصل المجتمعي الفعال والمؤثر.'
    ],
    isActive: true,
    sortOrder: 5,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-media',
    name: 'أمانة الميديا',
    slug: 'media',
    description: 'الذراع الإعلامي المسؤول عن توثيق كافة الأنشطة، والإنتاج المرئي، والتغطيات الإخبارية، والبث المباشر.',
    duties: [
      'تصوير وتوثيق الفعاليات والمبادرات بأحدث التقنيات.',
      'صناعة المحتوى المرئي والموشن جرافيك والتقارير المصورة.',
      'إدارة منصات التواصل الاجتماعي والبث المباشر للأحداث.'
    ],
    goals: [
      'تغطية إعلامية فورية واحترافية تعكس نبض الأمانة.',
      'إيصال رسالة الحزب ورؤيته لكل فئات المجتمع.'
    ],
    isActive: true,
    sortOrder: 6,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-marketing',
    name: 'أمانة التسويق',
    slug: 'marketing',
    description: 'المسؤولة عن الترويج للمبادرات والأنشطة، والحملات الجماهيرية، والوصول لأكبر شريحة من المواطنين.',
    duties: [
      'تخطيط وتنفيذ الحملات الترويجية للمبادرات الخدمية.',
      'دراسة اتجاهات واحتياجات المواطنين بمنطقة أكتوبر.',
      'ابتكار آليات استقطاب تفاعلية للشباب والكوادر.'
    ],
    goals: [
      'تحقيق أعلى تفاعل ومشاركة شعبية في مبادرات الحزب.',
      'ترسيخ شعار الحزب «مصر للجميع» في الوجدان العام.'
    ],
    isActive: true,
    sortOrder: 7,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-me',
    name: 'أمانة المتابعة والتقييم',
    slug: 'monitoring-and-evaluation',
    description: 'المسؤولة عن قياس الأثر، وتدقيق معدلات إنجاز الخطط التشغيلية، ورفع تقارير الأداء الدورية للأمين العام.',
    duties: [
      'وضع مؤشرات أداء رئيسية (KPIs) لكل أمانة ومبادرة.',
      'إعداد تقارير دورية ومحايدة عن مسار الأنشطة.',
      'رصد التحديات واقتراح المعالجات والتحسينات الفورية.'
    ],
    goals: [
      'ضمان أعلى معايير الجودة والشفافية والانضباط الحزبي.',
      'تحويل الأهداف إلى نتائج ملموسة يشعر بها المواطن.'
    ],
    isActive: true,
    sortOrder: 8,
    createdAt: new Date().toISOString()
  },
  {
    id: 'sec-rd',
    name: 'أمانة البحث والتطوير',
    slug: 'research-and-development',
    description: 'المرصد الفكري والبحثي المسؤول عن دراسة قضايا وتحديات منطقة قسم ثالث أكتوبر وتقديم أوراق سياسات ومقترحات حلول.',
    duties: [
      'إجراء استطلاعات رأي ودراسات ميدانية لاحتياجات المنطقة.',
      'إعداد أوراق عمل للمشكلات الخدمية والتنموية.',
      'تقديم مقترحات لمبادرات نوعية مبتكرة تخدم المواطنين.'
    ],
    goals: [
      'صياغة قرارات حزبية ومبادرات مبنية على دراسات علمية رصينة.',
      'المساهمة الفعالة في تنمية مجتمع قسم ثالث أكتوبر.'
    ],
    isActive: true,
    sortOrder: 9,
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
      coordinates: '29.980836, 30.840788'
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
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // Merge with defaults to ensure all required arrays exist
        const initial = getInitialDatabase();
        return {
          ...initial,
          ...parsed,
          settings: { ...initial.settings, ...(parsed.settings || {}) },
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
      }
    } catch (err) {
      console.error('Error loading database file, falling back to initial data:', err);
    }
    const initial = getInitialDatabase();
    this.save(initial);
    return initial;
  }

  public save(dataToSave?: AppDatabase): void {
    if (dataToSave) {
      this.data = dataToSave;
    }
    try {
      const tempPath = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
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
