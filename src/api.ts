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
  ApplicationInquiryResult
} from './types';

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

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'حدث خطأ أثناء معالجة الطلب');
  }

  return data as T;
}

export const api = {
  // Public
  getPublicData: () => apiFetch<PublicPortalData>('/api/public/data'),
  
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

  // Admin Auth
  adminLogin: (credentials: { email: string; password: string }) =>
    apiFetch<{ success: boolean; token: string; user: AdminUser }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
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
    }>('/api/admin/full-db'),

  // Party Leaders
  createPartyLeader: (leader: Partial<PartyLeader>) =>
    apiFetch<{ success: boolean; leader: PartyLeader }>('/api/admin/party-leaders', {
      method: 'POST',
      body: JSON.stringify(leader)
    }),
  updatePartyLeader: (id: string, leader: Partial<PartyLeader>) =>
    apiFetch<{ success: boolean; leader: PartyLeader }>(`/api/admin/party-leaders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(leader)
    }),
  deletePartyLeader: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/party-leaders/${id}`, { method: 'DELETE' }),

  // Secretariat Leaders (3rd October Giza)
  createSecretariatLeader: (leader: Partial<SecretariatLeader>) =>
    apiFetch<{ success: boolean; leader: SecretariatLeader }>('/api/admin/secretariat-leaders', {
      method: 'POST',
      body: JSON.stringify(leader)
    }),
  updateSecretariatLeader: (id: string, leader: Partial<SecretariatLeader>) =>
    apiFetch<{ success: boolean; leader: SecretariatLeader }>(`/api/admin/secretariat-leaders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(leader)
    }),
  deleteSecretariatLeader: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/secretariat-leaders/${id}`, { method: 'DELETE' }),

  // Specialized Secretariats (Secured Admin Endpoints)
  createSecretariat: (sec: Partial<SpecializedSecretariat>) =>
    apiFetch<{ success: boolean; secretariat: SpecializedSecretariat }>('/api/admin/secretariats', {
      method: 'POST',
      body: JSON.stringify(sec)
    }),
  updateSecretariat: (id: string, sec: Partial<SpecializedSecretariat>) =>
    apiFetch<{ success: boolean; secretariat: SpecializedSecretariat }>(`/api/admin/secretariats/${id}`, {
      method: 'PUT',
      body: JSON.stringify(sec)
    }),
  deleteSecretariat: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/secretariats/${id}`, { method: 'DELETE' }),
  saveAllSecretariats: (secretariats?: SpecializedSecretariat[]) =>
    apiFetch<{ success: boolean; count: number; message: string }>('/api/admin/secretariats/save-all', {
      method: 'POST',
      body: JSON.stringify({ secretariats })
    }),

  // Secretariat Members & Transfers
  createSecretariatMember: (member: Partial<SecretariatMember>) =>
    apiFetch<{ success: boolean; member: SecretariatMember }>('/api/admin/secretariat-members', {
      method: 'POST',
      body: JSON.stringify(member)
    }),
  updateSecretariatMember: (id: string, member: Partial<SecretariatMember>) =>
    apiFetch<{ success: boolean; member: SecretariatMember }>(`/api/admin/secretariat-members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(member)
    }),
  transferSecretariatMember: (data: { memberId: string; targetSecretariatId: string; newRole?: string; notes?: string }) =>
    apiFetch<{ success: boolean; member: SecretariatMember }>('/api/admin/secretariat-members/transfer', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  deleteSecretariatMember: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/secretariat-members/${id}`, { method: 'DELETE' }),

  // Initiatives
  createInitiative: (init: Partial<Initiative>) =>
    apiFetch<{ success: boolean; initiative: Initiative }>('/api/admin/initiatives', {
      method: 'POST',
      body: JSON.stringify(init)
    }),
  updateInitiative: (id: string, init: Partial<Initiative>) =>
    apiFetch<{ success: boolean; initiative: Initiative }>(`/api/admin/initiatives/${id}`, {
      method: 'PUT',
      body: JSON.stringify(init)
    }),
  deleteInitiative: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/initiatives/${id}`, { method: 'DELETE' }),

  // News
  createNews: (news: Partial<NewsItem>) =>
    apiFetch<{ success: boolean; news: NewsItem }>('/api/admin/news', {
      method: 'POST',
      body: JSON.stringify(news)
    }),
  updateNews: (id: string, news: Partial<NewsItem>) =>
    apiFetch<{ success: boolean; news: NewsItem }>(`/api/admin/news/${id}`, {
      method: 'PUT',
      body: JSON.stringify(news)
    }),
  deleteNews: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/news/${id}`, { method: 'DELETE' }),

  // Events
  createEvent: (event: Partial<EventItem>) =>
    apiFetch<{ success: boolean; event: EventItem }>('/api/admin/events', {
      method: 'POST',
      body: JSON.stringify(event)
    }),
  updateEvent: (id: string, event: Partial<EventItem>) =>
    apiFetch<{ success: boolean; event: EventItem }>(`/api/admin/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(event)
    }),
  deleteEvent: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/events/${id}`, { method: 'DELETE' }),

  // Media
  createMedia: (media: Partial<MediaItem>) =>
    apiFetch<{ success: boolean; media: MediaItem }>('/api/admin/media', {
      method: 'POST',
      body: JSON.stringify(media)
    }),
  updateMedia: (id: string, media: Partial<MediaItem>) =>
    apiFetch<{ success: boolean; media: MediaItem }>(`/api/admin/media/${id}`, {
      method: 'PUT',
      body: JSON.stringify(media)
    }),
  deleteMedia: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/media/${id}`, { method: 'DELETE' }),

  // Live Stream
  updateLiveStream: (stream: any) =>
    apiFetch<{ success: boolean; liveStream: any }>('/api/admin/livestream', {
      method: 'PUT',
      body: JSON.stringify(stream)
    }),

  // Applications
  getApplications: (search?: string, status?: string) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    return apiFetch<MembershipApplication[]>(`/api/admin/applications?${params.toString()}`);
  },
  updateApplication: (id: string, data: Partial<MembershipApplication>) =>
    apiFetch<{ success: boolean; application: MembershipApplication }>(`/api/admin/applications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  convertToMember: (id: string, data: { secretariatId?: string; title: string; notes?: string }) =>
    apiFetch<{ success: boolean; member: MemberRecord }>(`/api/admin/applications/${id}/convert-to-member`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // Members
  getMembers: () => apiFetch<MemberRecord[]>('/api/admin/members'),
  updateMember: (id: string, data: Partial<MemberRecord>) =>
    apiFetch<{ success: boolean; member: MemberRecord }>(`/api/admin/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  assignMember: (id: string, data: { title: string; secretariatId?: string; notes?: string }) =>
    apiFetch<{ success: boolean; member: MemberRecord }>(`/api/admin/members/${id}/assignment`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  endMemberAssignment: (id: string, notes?: string) =>
    apiFetch<{ success: boolean; member: MemberRecord }>(`/api/admin/members/${id}/end-assignment`, {
      method: 'PUT',
      body: JSON.stringify({ notes })
    }),

  // Admin Users
  getAdminUsers: () => apiFetch<AdminUser[]>('/api/admin/users'),
  createAdminUser: (user: any) =>
    apiFetch<{ success: boolean; user: AdminUser }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(user)
    }),
  updateAdminUser: (id: string, user: any) =>
    apiFetch<{ success: boolean; user: AdminUser }>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(user)
    }),
  deleteAdminUser: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/users/${id}`, { method: 'DELETE' }),

  // Media Upload (saves base64 to server data/uploads directory and returns URL)
  uploadMedia: (fileData: string, fileName?: string) =>
    apiFetch<{ success: boolean; url: string }>('/api/admin/upload', {
      method: 'POST',
      body: JSON.stringify({ data: fileData, filename: fileName })
    }),

  // Settings
  updateSettings: (settings: Partial<SiteSettings>) =>
    apiFetch<{ success: boolean; settings: SiteSettings }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    }),

  // Audit Logs
  getAuditLogs: () => apiFetch<AuditLog[]>('/api/admin/audit-logs'),

  // CMS Pages
  getCMSPages: () => apiFetch<CMSPage[]>('/api/admin/pages'),
  createCMSPage: (page: Partial<CMSPage>) =>
    apiFetch<{ success: boolean; page: CMSPage }>('/api/admin/pages', {
      method: 'POST',
      body: JSON.stringify(page)
    }),
  updateCMSPage: (id: string, page: Partial<CMSPage>) =>
    apiFetch<{ success: boolean; page: CMSPage }>(`/api/admin/pages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(page)
    }),
  deleteCMSPage: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/pages/${id}`, { method: 'DELETE' }),

  // Granular Roles (RBAC)
  getRoles: () => apiFetch<AdminRole[]>('/api/admin/roles'),
  createRole: (role: Partial<AdminRole>) =>
    apiFetch<{ success: boolean; role: AdminRole }>('/api/admin/roles', {
      method: 'POST',
      body: JSON.stringify(role)
    }),
  updateRole: (id: string, role: Partial<AdminRole>) =>
    apiFetch<{ success: boolean; role: AdminRole }>(`/api/admin/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(role)
    }),
  deleteRole: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/roles/${id}`, { method: 'DELETE' })
};
