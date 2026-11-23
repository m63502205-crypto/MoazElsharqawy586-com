import {
  PublicPortalData,
  SiteSettings,
  LiveStream,
  PartyLeader,
  SecretariatLeader,
  SpecializedSecretariat,
  SecretariatMember,
  Initiative,
  NewsItem,
  EventItem,
  MediaItem,
  CMSPage
} from '../types';

export type PreviewEntityKind =
  | 'settings'
  | 'livestream'
  | 'party_leader'
  | 'secretariat_leader'
  | 'secretariat'
  | 'secretariat_member'
  | 'initiative'
  | 'news'
  | 'event'
  | 'media'
  | 'page';

export interface PreviewTargetRoute {
  view: string;
  slug?: string;
  newsId?: string | null;
  eventId?: string | null;
  person?: string | null;
  activity?: number | null;
}

export interface PortalPreviewDraft {
  active: boolean;
  kind: PreviewEntityKind;
  label: string;
  updatedAt: string;
  targetRoute?: PreviewTargetRoute;
  settings?: Partial<SiteSettings>;
  liveStream?: Partial<LiveStream>;
  partyLeader?: Partial<PartyLeader>;
  secretariatLeader?: Partial<SecretariatLeader>;
  secretariat?: Partial<SpecializedSecretariat>;
  secretariatMember?: Partial<SecretariatMember>;
  initiative?: Partial<Initiative>;
  news?: Partial<NewsItem>;
  event?: Partial<EventItem>;
  media?: Partial<MediaItem>;
  page?: Partial<CMSPage>;
}

const PREVIEW_DRAFT_STORAGE_KEY = 'nfp_preview_mode_draft_v1';

export const PREVIEW_SYNTHETIC_IDS = {
  partyLeader: '__preview_party_leader__',
  secretariatLeader: '__preview_secretariat_leader__',
  secretariat: '__preview_secretariat__',
  secretariatMember: '__preview_secretariat_member__',
  initiative: '__preview_initiative__',
  news: '__preview_news__',
  event: '__preview_event__',
  media: '__preview_media__',
  page: '__preview_page__'
} as const;

function upsertPreviewItem<T extends { id: string }>(
  list: T[],
  draftItem: Partial<T>,
  fallbackId: string,
  defaults: Partial<T>
): T[] {
  const targetId = String((draftItem as any).id || fallbackId);
  const existingIdx = list.findIndex(item => item.id === targetId);
  if (existingIdx >= 0) {
    const merged = {
      ...list[existingIdx],
      ...draftItem,
      id: targetId
    } as T;
    const next = [...list];
    next[existingIdx] = merged;
    return next;
  }
  const created = {
    ...defaults,
    ...draftItem,
    id: targetId
  } as T;
  return [created, ...list];
}

export function applyPreviewDraftToPortalData(
  portal: PublicPortalData,
  draft: PortalPreviewDraft | null
): PublicPortalData {
  if (!draft || !draft.active) {
    return portal;
  }

  let nextSettings = portal.settings;
  if (draft.settings) {
    nextSettings = {
      ...portal.settings,
      ...draft.settings,
      customTexts: draft.settings.customTexts
        ? { ...(portal.settings.customTexts || {}), ...draft.settings.customTexts }
        : portal.settings.customTexts
    };
  }

  let nextLiveStream = portal.liveStream;
  if (draft.liveStream) {
    nextLiveStream = {
      ...(portal.liveStream || {
        id: 'live-1',
        title: '',
        description: '',
        streamUrl: '',
        isActive: false,
        platform: 'youtube'
      }),
      ...draft.liveStream
    };
  }

  let partyLeaders = portal.partyLeaders;
  if (draft.partyLeader) {
    partyLeaders = upsertPreviewItem<PartyLeader>(
      portal.partyLeaders,
      { ...draft.partyLeader, isVisible: draft.partyLeader.isVisible !== false },
      PREVIEW_SYNTHETIC_IDS.partyLeader,
      {
        id: PREVIEW_SYNTHETIC_IDS.partyLeader,
        name: 'قيادة حزبية (معاينة)',
        position: '',
        level: 'قيادة مركزية',
        bio: '',
        photoUrl: '',
        sortOrder: 0,
        isVisible: true,
        createdAt: new Date().toISOString()
      }
    ).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  }

  let secretariatLeaders = portal.secretariatLeaders;
  if (draft.secretariatLeader) {
    secretariatLeaders = upsertPreviewItem<SecretariatLeader>(
      portal.secretariatLeaders,
      { ...draft.secretariatLeader, isVisible: draft.secretariatLeader.isVisible !== false },
      PREVIEW_SYNTHETIC_IDS.secretariatLeader,
      {
        id: PREVIEW_SYNTHETIC_IDS.secretariatLeader,
        name: 'قيادة أمانة (معاينة)',
        title: '',
        bio: '',
        photoUrl: '',
        appointmentDate: '',
        sortOrder: 0,
        isVisible: true,
        createdAt: new Date().toISOString()
      }
    ).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  }

  let specializedSecretariats = portal.specializedSecretariats;
  if (draft.secretariat) {
    const draftSlug =
      draft.secretariat.slug?.trim() ||
      draft.targetRoute?.slug ||
      PREVIEW_SYNTHETIC_IDS.secretariat;
    specializedSecretariats = upsertPreviewItem<SpecializedSecretariat>(
      portal.specializedSecretariats,
      {
        ...draft.secretariat,
        slug: draftSlug,
        isActive: draft.secretariat.isActive !== false
      },
      PREVIEW_SYNTHETIC_IDS.secretariat,
      {
        id: PREVIEW_SYNTHETIC_IDS.secretariat,
        name: 'أمانة تخصصية (معاينة)',
        slug: draftSlug,
        description: '',
        duties: [],
        goals: [],
        isActive: true,
        sortOrder: 0,
        createdAt: new Date().toISOString()
      }
    ).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  }

  let secretariatMembers = portal.secretariatMembers;
  if (draft.secretariatMember) {
    secretariatMembers = upsertPreviewItem<SecretariatMember>(
      portal.secretariatMembers,
      draft.secretariatMember,
      PREVIEW_SYNTHETIC_IDS.secretariatMember,
      {
        id: PREVIEW_SYNTHETIC_IDS.secretariatMember,
        secretariatId: draft.secretariatMember.secretariatId || '',
        name: 'عضو أمانة (معاينة)',
        role: 'عضو أمانة',
        assignmentDate: new Date().toISOString().slice(0, 10)
      }
    );
  }

  let initiatives = portal.initiatives;
  if (draft.initiative) {
    const draftSlug =
      draft.initiative.slug?.trim() ||
      draft.targetRoute?.slug ||
      PREVIEW_SYNTHETIC_IDS.initiative;
    initiatives = upsertPreviewItem<Initiative>(
      portal.initiatives,
      {
        ...draft.initiative,
        slug: draftSlug,
        isVisible: true
      },
      PREVIEW_SYNTHETIC_IDS.initiative,
      {
        id: PREVIEW_SYNTHETIC_IDS.initiative,
        slug: draftSlug,
        title: 'مبادرة (معاينة)',
        description: '',
        goals: [],
        startDate: new Date().toISOString().slice(0, 10),
        status: 'active',
        activities: [],
        isVisible: true,
        createdAt: new Date().toISOString()
      }
    );
  }

  let news = portal.news;
  if (draft.news) {
    const newsDraft = {
      ...draft.news,
      isDraft: false // Always surface the previewed news item inside Preview Mode even if marked draft
    };
    news = upsertPreviewItem<NewsItem>(
      portal.news,
      newsDraft,
      PREVIEW_SYNTHETIC_IDS.news,
      {
        id: PREVIEW_SYNTHETIC_IDS.news,
        title: 'خبر جديد (معاينة)',
        content: '',
        excerpt: '',
        galleryImages: [],
        publishDate: new Date().toISOString().slice(0, 10),
        isFeatured: false,
        isDraft: false,
        createdAt: new Date().toISOString()
      }
    );
  }

  let events = portal.events;
  if (draft.event) {
    events = upsertPreviewItem<EventItem>(
      portal.events,
      { ...draft.event, isVisible: true },
      PREVIEW_SYNTHETIC_IDS.event,
      {
        id: PREVIEW_SYNTHETIC_IDS.event,
        title: 'فعالية (معاينة)',
        description: '',
        dateTime: new Date().toISOString().slice(0, 16),
        venue: '',
        organizer: '',
        images: [],
        status: 'upcoming',
        isVisible: true,
        createdAt: new Date().toISOString()
      }
    );
  }

  let media = portal.media;
  if (draft.media) {
    media = upsertPreviewItem<MediaItem>(
      portal.media,
      { ...draft.media, isVisible: true },
      PREVIEW_SYNTHETIC_IDS.media,
      {
        id: PREVIEW_SYNTHETIC_IDS.media,
        type: 'photo',
        title: 'وسيط (معاينة)',
        url: '',
        albumName: 'فعاليات ومؤتمرات',
        isVisible: true,
        sortOrder: 0,
        createdAt: new Date().toISOString()
      }
    );
  }

  let pages = portal.pages;
  if (draft.page) {
    const draftSlug =
      draft.page.slug?.trim() ||
      draft.targetRoute?.slug ||
      PREVIEW_SYNTHETIC_IDS.page;
    pages = upsertPreviewItem<CMSPage>(
      portal.pages,
      { ...draft.page, slug: draftSlug, isPublished: true },
      PREVIEW_SYNTHETIC_IDS.page,
      {
        id: PREVIEW_SYNTHETIC_IDS.page,
        slug: draftSlug,
        title: 'صفحة (معاينة)',
        content: '',
        galleryImages: [],
        isPublished: true,
        updatedAt: new Date().toISOString()
      }
    );
  }

  return {
    ...portal,
    settings: nextSettings,
    liveStream: nextLiveStream,
    partyLeaders,
    secretariatLeaders,
    specializedSecretariats,
    secretariatMembers,
    initiatives,
    news,
    events,
    media,
    pages
  };
}

export function savePreviewDraftToSession(draft: PortalPreviewDraft | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!draft || !draft.active) {
      window.sessionStorage.removeItem(PREVIEW_DRAFT_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(PREVIEW_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }
  } catch {
    // Ignore storage quota issues for large base64 previews
  }
}

export function clearPreviewDraftSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PREVIEW_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
