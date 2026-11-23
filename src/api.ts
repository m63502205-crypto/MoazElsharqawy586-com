import {
  PublicPortalData,
  SpecializedSecretariat,
  SecretariatMember,
  Initiative,
  NewsItem,
  EventItem,
  MediaItem,
  MembershipApplication,
  MemberRecord,
  AdminUser,
  AdminStats,
  SiteSettings,
  PartyLeader,
  SecretariatLeader,
  AuditLog,
  CMSPage,
  AdminRole,
  ApplicationInquiryResult,
  EmailSubscriber,
  EmailDispatchLog,
  NotificationDispatchResult,
  AdminAnalyticsResponse
} from './types';
import {
  hydratePortalDataFromFirestore,
  persistImageUrlToFirestore,
  syncPublicRecordToFirestore,
  deletePublicRecordFromFirestore,
  syncSiteConfigToFirestore,
  syncPrivateRecordToFirestore,
  deletePrivateRecordFromFirestore,
  isFirebaseAdminReady
} from './utils/firestoreSync';

const TOKEN_KEY = 'nfp_admin_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    ...options,
    headers
  });

  let data: any = {};
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => ({}));
  } else {
    const rawText = await res.text().catch(() => '');
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }
  }

  if (!res.ok) {
    if (res.status === 413) {
      throw new Error('حجم الصورة أو البيانات المرسلة كبير جداً، يرجى تقليل حجم الصور ثم المحاولة مجدداً');
    }
    throw new Error(data.error || `حدث خطأ أثناء معالجة الطلب (${res.status})`);
  }

  return data as T;
}

export const api = {
  // Public
  getPublicData: async (): Promise<PublicPortalData> => {
    const portal = await apiFetch<PublicPortalData>('/api/public/data');
    return await hydratePortalDataFromFirestore(portal);
  },
  
  getSecretariatDetail: (slug: string) =>
    apiFetch<{
      secretariat: SpecializedSecretariat;
      members: SecretariatMember[];
      relatedNews: NewsItem[];
      relatedEvents: EventItem[];
      relatedMedia: MediaItem[];
    }>(`/api/public/secretariat/${slug}`),

  getInitiativeDetail: (slug: string) =>
    apiFetch<{
      initiative: Initiative;
      relatedNews: NewsItem[];
      relatedMedia: MediaItem[];
    }>(`/api/public/initiative/${slug}`),

  submitApplication: (data: Partial<MembershipApplication>) =>
    apiFetch<{ success: boolean; message: string; applicationNumber: string }>('/api/public/apply', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  inquireApplication: (query: string) =>
    apiFetch<ApplicationInquiryResult>('/api/public/inquire', {
      method: 'POST',
      body: JSON.stringify({ query })
    }),

  subscribeNewsletter: (payload: {
    email: string;
    name?: string;
    topics?: { news?: boolean; events?: boolean; initiatives?: boolean };
  }) =>
    apiFetch<{ success: boolean; alreadySubscribed?: boolean; message: string }>('/api/public/subscribe', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  trackPublicVisit: (payload: {
    path: string;
    title?: string;
    referrer?: string;
    device?: 'mobile' | 'desktop';
    visitorId?: string;
  }) =>
    fetch('/api/public/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => undefined),

  // Admin Auth
  adminLogin: (credentials: { email?: string; identifier?: string; phone?: string; password: string }) =>
    apiFetch<{ success: boolean; token: string; user: AdminUser }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    }),

  adminGoogleLogin: (idToken: string) =>
    apiFetch<{ success: boolean; token: string; user: AdminUser }>('/api/admin/google-login', {
      method: 'POST',
      body: JSON.stringify({ idToken })
    }),

  adminGetMe: () => apiFetch<{ user: AdminUser }>('/api/admin/me'),

  adminLogout: async () => {
    try {
      await apiFetch<{ success: boolean }>('/api/admin/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setAuthToken(null);
    }
  },

  // Admin Data & Stats
  getAdminStats: () => apiFetch<AdminStats>('/api/admin/stats'),

  getAdminAnalytics: (range: '7d' | '14d' | '30d' = '14d') =>
    apiFetch<AdminAnalyticsResponse>(`/api/admin/analytics?range=${encodeURIComponent(range)}`),

  getFullDatabase: () =>
    apiFetch<{
      partyLeaders: PartyLeader[];
      secretariatLeaders: SecretariatLeader[];
      specializedSecretariats: SpecializedSecretariat[];
      secretariatMembers: SecretariatMember[];
      initiatives: Initiative[];
      news: NewsItem[];
      events: EventItem[];
      media: MediaItem[];
      liveStream: any;
      applications: MembershipApplication[];
      members: MemberRecord[];
      admins: AdminUser[];
      auditLogs: AuditLog[];
      settings: SiteSettings;
      pages: CMSPage[];
      roles: AdminRole[];
      subscribers: EmailSubscriber[];
      emailDispatchLogs: EmailDispatchLog[];
      smtpStatus?: { configured: boolean };
    }>('/api/admin/full-db'),

  // Party Leaders
  createPartyLeader: async (leader: Partial<PartyLeader>) => {
    const res = await apiFetch<{ success: boolean; leader: PartyLeader }>('/api/admin/party-leaders', {
      method: 'POST',
      body: JSON.stringify(leader)
    });
    if (res.leader) await syncPublicRecordToFirestore('party_leaders', res.leader);
    return res;
  },
  updatePartyLeader: async (id: string, leader: Partial<PartyLeader>) => {
    const res = await apiFetch<{ success: boolean; leader: PartyLeader }>(`/api/admin/party-leaders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(leader)
    });
    if (res.leader) await syncPublicRecordToFirestore('party_leaders', res.leader);
    return res;
  },
  deletePartyLeader: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/api/admin/party-leaders/${id}`, { method: 'DELETE' });
    await deletePublicRecordFromFirestore('party_leaders', id);
    return res;
  },

  // Secretariat Leaders (3rd October Giza)
  createSecretariatLeader: async (leader: Partial<SecretariatLeader>) => {
    const res = await apiFetch<{ success: boolean; leader: SecretariatLeader }>('/api/admin/secretariat-leaders', {
      method: 'POST',
      body: JSON.stringify(leader)
    });
    if (res.leader) await syncPublicRecordToFirestore('secretariat_leaders', res.leader);
    return res;
  },
  updateSecretariatLeader: async (id: string, leader: Partial<SecretariatLeader>) => {
    const res = await apiFetch<{ success: boolean; leader: SecretariatLeader }>(`/api/admin/secretariat-leaders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(leader)
    });
    if (res.leader) await syncPublicRecordToFirestore('secretariat_leaders', res.leader);
    return res;
  },
  deleteSecretariatLeader: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/api/admin/secretariat-leaders/${id}`, { method: 'DELETE' });
    await deletePublicRecordFromFirestore('secretariat_leaders', id);
    return res;
  },

  // Specialized Secretariats (Secured Admin Endpoints)
  createSecretariat: async (sec: Partial<SpecializedSecretariat>) => {
    const res = await apiFetch<{ success: boolean; secretariat: SpecializedSecretariat }>('/api/admin/secretariats', {
      method: 'POST',
      body: JSON.stringify(sec)
    });
    if (res.secretariat) await syncPublicRecordToFirestore('secretariats', res.secretariat);
    return res;
  },
  updateSecretariat: async (id: string, sec: Partial<SpecializedSecretariat>) => {
    const res = await apiFetch<{ success: boolean; secretariat: SpecializedSecretariat }>(`/api/admin/secretariats/${id}`, {
      method: 'PUT',
      body: JSON.stringify(sec)
    });
    if (res.secretariat) await syncPublicRecordToFirestore('secretariats', res.secretariat);
    return res;
  },
  deleteSecretariat: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/api/admin/secretariats/${id}`, { method: 'DELETE' });
    await deletePublicRecordFromFirestore('secretariats', id);
    return res;
  },
  saveAllSecretariats: async (secretariats?: SpecializedSecretariat[]) => {
    const res = await apiFetch<{ success: boolean; count: number; message: string }>('/api/admin/secretariats/save-all', {
      method: 'POST',
      body: JSON.stringify({ secretariats })
    });
    if (Array.isArray(secretariats)) {
      for (const sec of secretariats) {
        if (sec && sec.id) await syncPublicRecordToFirestore('secretariats', sec);
      }
    }
    return res;
  },

  // Secretariat Members & Transfers
  createSecretariatMember: async (member: Partial<SecretariatMember>) => {
    const res = await apiFetch<{ success: boolean; member: SecretariatMember }>('/api/admin/secretariat-members', {
      method: 'POST',
      body: JSON.stringify(member)
    });
    if (res.member) await syncPublicRecordToFirestore('secretariat_members', res.member);
    return res;
  },
  updateSecretariatMember: async (id: string, member: Partial<SecretariatMember>) => {
    const res = await apiFetch<{ success: boolean; member: SecretariatMember }>(`/api/admin/secretariat-members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(member)
    });
    if (res.member) await syncPublicRecordToFirestore('secretariat_members', res.member);
    return res;
  },
  transferSecretariatMember: async (data: { memberId: string; targetSecretariatId: string; newRole?: string; notes?: string }) => {
    const res = await apiFetch<{ success: boolean; member: SecretariatMember }>('/api/admin/secretariat-members/transfer', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.member) await syncPublicRecordToFirestore('secretariat_members', res.member);
    return res;
  },
  deleteSecretariatMember: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/api/admin/secretariat-members/${id}`, { method: 'DELETE' });
    await deletePublicRecordFromFirestore('secretariat_members', id);
    return res;
  },

  // Initiatives
  createInitiative: async (init: Partial<Initiative>) => {
    const res = await apiFetch<{ success: boolean; initiative: Initiative; notificationResult?: NotificationDispatchResult | null }>('/api/admin/initiatives', {
      method: 'POST',
      body: JSON.stringify(init)
    });
    if (res.initiative) await syncPublicRecordToFirestore('initiatives', res.initiative);
    return res;
  },
  updateInitiative: async (id: string, init: Partial<Initiative>) => {
    const res = await apiFetch<{ success: boolean; initiative: Initiative }>(`/api/admin/initiatives/${id}`, {
      method: 'PUT',
      body: JSON.stringify(init)
    });
    if (res.initiative) await syncPublicRecordToFirestore('initiatives', res.initiative);
    return res;
  },
  deleteInitiative: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/api/admin/initiatives/${id}`, { method: 'DELETE' });
    await deletePublicRecordFromFirestore('initiatives', id);
    return res;
  },

  // News
  createNews: async (news: Partial<NewsItem>) => {
    const res = await apiFetch<{ success: boolean; news: NewsItem; notificationResult?: NotificationDispatchResult | null }>('/api/admin/news', {
      method: 'POST',
      body: JSON.stringify(news)
    });
    if (res.news) await syncPublicRecordToFirestore('news', res.news);
    return res;
  },
  updateNews: async (id: string, news: Partial<NewsItem>) => {
    const res = await apiFetch<{ success: boolean; news: NewsItem; notificationResult?: NotificationDispatchResult | null }>(`/api/admin/news/${id}`, {
      method: 'PUT',
      body: JSON.stringify(news)
    });
    if (res.news) await syncPublicRecordToFirestore('news', res.news);
    return res;
  },
  deleteNews: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/api/admin/news/${id}`, { method: 'DELETE' });
    await deletePublicRecordFromFirestore('news', id);
    return res;
  },

  // Events
  createEvent: async (event: Partial<EventItem>) => {
    const res = await apiFetch<{ success: boolean; event: EventItem; notificationResult?: NotificationDispatchResult | null }>('/api/admin/events', {
      method: 'POST',
      body: JSON.stringify(event)
    });
    if (res.event) await syncPublicRecordToFirestore('events', res.event);
    return res;
  },
  updateEvent: async (id: string, event: Partial<EventItem>) => {
    const res = await apiFetch<{ success: boolean; event: EventItem }>(`/api/admin/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(event)
    });
    if (res.event) await syncPublicRecordToFirestore('events', res.event);
    return res;
  },
  deleteEvent: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/api/admin/events/${id}`, { method: 'DELETE' });
    await deletePublicRecordFromFirestore('events', id);
    return res;
  },

  // Media
  createMedia: async (media: Partial<MediaItem>) => {
    const res = await apiFetch<{ success: boolean; media: MediaItem }>('/api/admin/media', {
      method: 'POST',
      body: JSON.stringify(media)
    });
    if (res.media) await syncPublicRecordToFirestore('media', res.media);
    return res;
  },
  updateMedia: async (id: string, media: Partial<MediaItem>) => {
    const res = await apiFetch<{ success: boolean; media: MediaItem }>(`/api/admin/media/${id}`, {
      method: 'PUT',
      body: JSON.stringify(media)
    });
    if (res.media) await syncPublicRecordToFirestore('media', res.media);
    return res;
  },
  deleteMedia: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/api/admin/media/${id}`, { method: 'DELETE' });
    await deletePublicRecordFromFirestore('media', id);
    return res;
  },

  // Live Stream
  updateLiveStream: async (stream: any) => {
    const res = await apiFetch<{ success: boolean; liveStream: any }>('/api/admin/livestream', {
      method: 'PUT',
      body: JSON.stringify(stream)
    });
    if (res.liveStream) await syncSiteConfigToFirestore('livestream', res.liveStream);
    return res;
  },

  // Applications
  getApplications: (search?: string, status?: string) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    return apiFetch<MembershipApplication[]>(`/api/admin/applications?${params.toString()}`);
  },
  updateApplication: async (id: string, data: Partial<MembershipApplication>) => {
    const res = await apiFetch<{ success: boolean; application: MembershipApplication }>(`/api/admin/applications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (res.application) await syncPrivateRecordToFirestore('applications', res.application);
    return res;
  },
  convertToMember: async (id: string, data: { secretariatId?: string; title: string; notes?: string }) => {
    const res = await apiFetch<{ success: boolean; member: MemberRecord }>(`/api/admin/applications/${id}/convert-to-member`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.member) await syncPrivateRecordToFirestore('members', res.member);
    return res;
  },

  // Members
  getMembers: () => apiFetch<MemberRecord[]>('/api/admin/members'),
  updateMember: async (id: string, data: Partial<MemberRecord>) => {
    const res = await apiFetch<{ success: boolean; member: MemberRecord }>(`/api/admin/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (res.member) await syncPrivateRecordToFirestore('members', res.member);
    return res;
  },
  assignMember: async (id: string, data: { title: string; secretariatId?: string; notes?: string }) => {
    const res = await apiFetch<{ success: boolean; member: MemberRecord }>(`/api/admin/members/${id}/assignment`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.member) await syncPrivateRecordToFirestore('members', res.member);
    return res;
  },
  endMemberAssignment: async (id: string, notes?: string) => {
    const res = await apiFetch<{ success: boolean; member: MemberRecord }>(`/api/admin/members/${id}/end-assignment`, {
      method: 'PUT',
      body: JSON.stringify({ notes })
    });
    if (res.member) await syncPrivateRecordToFirestore('members', res.member);
    return res;
  },

  // Admin Users
  getAdminUsers: () => apiFetch<AdminUser[]>('/api/admin/users'),
  createAdminUser: async (user: any) => {
    const res = await apiFetch<{ success: boolean; user: AdminUser }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(user)
    });
    if (res.user) await syncPrivateRecordToFirestore('admin_users', res.user);
    return res;
  },
  updateAdminUser: async (id: string, user: any) => {
    const res = await apiFetch<{ success: boolean; user: AdminUser }>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(user)
    });
    if (res.user) await syncPrivateRecordToFirestore('admin_users', res.user);
    return res;
  },
  deleteAdminUser: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/api/admin/users/${id}`, { method: 'DELETE' });
    await deletePrivateRecordFromFirestore('admin_users', id);
    return res;
  },

  // Media Upload (saves locally AND persists permanently to Firestore uploads_public)
  uploadMedia: async (fileData: string, fileName?: string) => {
    const res = await apiFetch<{ success: boolean; url: string }>('/api/admin/upload', {
      method: 'POST',
      body: JSON.stringify({ data: fileData, filename: fileName })
    });
    if (res.url && isFirebaseAdminReady() && fileData.startsWith('data:image/')) {
      const permanentUrl = await persistImageUrlToFirestore(fileData);
      if (permanentUrl.startsWith('/api/public/firestore-asset/')) {
        return { ...res, url: permanentUrl };
      }
    }
    return res;
  },

  // Settings
  updateSettings: async (settings: Partial<SiteSettings>) => {
    const res = await apiFetch<{ success: boolean; settings: SiteSettings }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
    if (res.settings) await syncSiteConfigToFirestore('public', res.settings);
    return res;
  },

  // Audit Logs
  getAuditLogs: () => apiFetch<AuditLog[]>('/api/admin/audit-logs'),

  // CMS Pages
  getCMSPages: () => apiFetch<CMSPage[]>('/api/admin/pages'),
  createCMSPage: async (page: Partial<CMSPage>) => {
    const res = await apiFetch<{ success: boolean; page: CMSPage }>('/api/admin/pages', {
      method: 'POST',
      body: JSON.stringify(page)
    });
    if (res.page) await syncPublicRecordToFirestore('pages', res.page);
    return res;
  },
  updateCMSPage: async (id: string, page: Partial<CMSPage>) => {
    const res = await apiFetch<{ success: boolean; page: CMSPage }>(`/api/admin/pages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(page)
    });
    if (res.page) await syncPublicRecordToFirestore('pages', res.page);
    return res;
  },
  deleteCMSPage: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/api/admin/pages/${id}`, { method: 'DELETE' });
    await deletePublicRecordFromFirestore('pages', id);
    return res;
  },

  // Granular Roles (RBAC)
  getRoles: () => apiFetch<AdminRole[]>('/api/admin/roles'),
  createRole: async (role: Partial<AdminRole>) => {
    const res = await apiFetch<{ success: boolean; role: AdminRole }>('/api/admin/roles', {
      method: 'POST',
      body: JSON.stringify(role)
    });
    if (res.role) await syncPrivateRecordToFirestore('roles', res.role);
    return res;
  },
  updateRole: async (id: string, role: Partial<AdminRole>) => {
    const res = await apiFetch<{ success: boolean; role: AdminRole }>(`/api/admin/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(role)
    });
    if (res.role) await syncPrivateRecordToFirestore('roles', res.role);
    return res;
  },
  deleteRole: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/api/admin/roles/${id}`, { method: 'DELETE' });
    await deletePrivateRecordFromFirestore('roles', id);
    return res;
  },

  // Email Subscribers & Instant Notifications
  getSubscribers: () =>
    apiFetch<{
      subscribers: EmailSubscriber[];
      dispatchLogs: EmailDispatchLog[];
      smtpStatus: { configured: boolean };
    }>('/api/admin/subscribers'),
  toggleSubscriber: async (id: string) => {
    const res = await apiFetch<{ success: boolean; subscriber: EmailSubscriber }>(`/api/admin/subscribers/${id}/toggle`, {
      method: 'POST'
    });
    if (res.subscriber) await syncPrivateRecordToFirestore('subscribers', res.subscriber);
    return res;
  },
  deleteSubscriber: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/api/admin/subscribers/${id}`, { method: 'DELETE' });
    await deletePrivateRecordFromFirestore('subscribers', id);
    return res;
  },
  dispatchSubscriberItem: (itemType: 'news' | 'event' | 'initiative', itemId: string) =>
    apiFetch<{ success: boolean; result: NotificationDispatchResult }>('/api/admin/subscribers/dispatch-item', {
      method: 'POST',
      body: JSON.stringify({ itemType, itemId })
    })
};
