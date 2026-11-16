import {
  SpecializedSecretariat,
  SecretariatMember,
  SecretariatLeader,
  PartyLeader,
  AssistantSecretaryEntry,
  PublicPortalData,
  NewsItem,
  EventItem,
  Initiative
} from '../types';

export interface ResolvedPersonProfile {
  personKey: string;
  name: string;
  role: string;
  tierLabel: string;
  secretariat: SpecializedSecretariat;
  photoUrl?: string;
  bio?: string;
  phone?: string;
  email?: string;
  assignmentDate?: string;
  notes?: string;
}

export interface PersonPostContribution {
  kind: 'news' | 'event' | 'initiative' | 'activity';
  id: string;
  title: string;
  date?: string;
  contributionRole: string;
  positionUsed?: string;
  secretariatId?: string;
  coverImage?: string;
  rawNews?: NewsItem;
  rawEvent?: EventItem;
  rawInitiative?: Initiative;
}

const TITLE_PREFIX_REGEX =
  /^(?:أ\.د\/|أ\.د\.|أ\.م\/|أ\.\/|أ\.|د\.|م\.|لواء\.|لواء\/|مستشار\/|المستشار|المهندس|المهندسة|الدكتور|الدكتورة|الأستاذ|الأستاذة|الاستاذ|الاستاذة|الكاتب|اللواء|سيادة|النائب)\s+/g;

export function normalizeArabicPersonName(input?: string | null): string {
  if (!input) return '';
  let s = String(input)
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\w\s\u0600-\u06FF./]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Iteratively strip common honorific prefixes
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(TITLE_PREFIX_REGEX, '').trim();
  }
  return s.replace(/[./]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function namesMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizeArabicPersonName(a);
  const nb = normalizeArabicPersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Require at least two tokens for substring matching to avoid false positives on first names
  const wordsA = na.split(' ').filter(Boolean);
  const wordsB = nb.split(' ').filter(Boolean);
  if (wordsA.length >= 2 && wordsB.length >= 2) {
    if (na.includes(nb) || nb.includes(na)) return true;
    // Check first two + last word similarity
    if (wordsA[0] === wordsB[0] && wordsA[1] === wordsB[1]) return true;
  }
  return false;
}

function getAllAssistantsForSecretariat(
  sec: SpecializedSecretariat,
  members: SecretariatMember[]
): AssistantSecretaryEntry[] {
  const base: AssistantSecretaryEntry[] =
    sec.assistantSecretaries && sec.assistantSecretaries.length > 0
      ? sec.assistantSecretaries.filter(a => a.name?.trim())
      : sec.assistantSecretaryName
      ? [
          {
            id: 'asst-primary',
            name: sec.assistantSecretaryName,
            title: 'الأمين المساعد للأمانة',
            photoUrl: sec.assistantSecretaryPhotoUrl || '',
            bio: sec.assistantSecretaryBio || '',
            phone: sec.assistantSecretaryPhone || ''
          }
        ]
      : [];

  const memberAssts: AssistantSecretaryEntry[] = members
    .filter(m => m.secretariatId === sec.id && m.tier === 'assistant_secretary' && m.name?.trim())
    .filter(m => !base.some(b => namesMatch(b.name, m.name)))
    .map(m => ({
      id: m.id,
      name: m.name,
      title: m.bureauTitle || m.role || 'الأمين المساعد للأمانة',
      photoUrl: m.photoUrl || '',
      bio: m.notes || '',
      phone: m.phone || ''
    }));

  return [...base, ...memberAssts];
}

export function getAllPeopleInSecretariat(
  sec: SpecializedSecretariat,
  secretariatMembers: SecretariatMember[],
  secretariatLeaders: SecretariatLeader[],
  partyLeaders: PartyLeader[] = []
): ResolvedPersonProfile[] {
  const list: ResolvedPersonProfile[] = [];
  const membersForSec = (secretariatMembers || []).filter(m => m.secretariatId === sec.id);

  const findMatchingLeader = (name: string) =>
    (secretariatLeaders || []).find(l => namesMatch(l.name, name));

  const findMatchingPartyLeader = (name: string) =>
    (partyLeaders || []).find(l => namesMatch(l.name, name));

  const findMatchingMember = (name: string) =>
    membersForSec.find(m => namesMatch(m.name, name));

  // 1. Secretary
  if (sec.secretaryName?.trim()) {
    const leaderMatch = findMatchingLeader(sec.secretaryName);
    const partyMatch = findMatchingPartyLeader(sec.secretaryName);
    const memberMatch = findMatchingMember(sec.secretaryName);
    list.push({
      personKey: sec.secretaryName.trim(),
      name: sec.secretaryName.trim(),
      role: `أمين ${sec.name}`,
      tierLabel: 'أمين الأمانة (المسؤول الأول)',
      secretariat: sec,
      photoUrl: sec.secretaryPhotoUrl || memberMatch?.photoUrl || leaderMatch?.photoUrl || partyMatch?.photoUrl || '',
      bio: sec.secretaryBio || leaderMatch?.bio || partyMatch?.bio || memberMatch?.notes || '',
      phone: sec.secretaryPhone || memberMatch?.phone || '',
      email: memberMatch?.email || '',
      assignmentDate: memberMatch?.assignmentDate || leaderMatch?.appointmentDate || ''
    });
  }

  // 2. Assistant Secretaries
  const assistants = getAllAssistantsForSecretariat(sec, membersForSec);
  for (const asst of assistants) {
    if (!asst.name?.trim()) continue;
    const leaderMatch = findMatchingLeader(asst.name);
    const partyMatch = findMatchingPartyLeader(asst.name);
    const memberMatch = findMatchingMember(asst.name);
    list.push({
      personKey: asst.id || asst.name.trim(),
      name: asst.name.trim(),
      role: asst.title || memberMatch?.bureauTitle || memberMatch?.role || 'الأمين المساعد للأمانة',
      tierLabel: 'الأمين المساعد للأمانة',
      secretariat: sec,
      photoUrl: asst.photoUrl || memberMatch?.photoUrl || leaderMatch?.photoUrl || partyMatch?.photoUrl || '',
      bio: asst.bio || memberMatch?.notes || leaderMatch?.bio || partyMatch?.bio || '',
      phone: asst.phone || memberMatch?.phone || '',
      email: memberMatch?.email || '',
      assignmentDate: memberMatch?.assignmentDate || leaderMatch?.appointmentDate || ''
    });
  }

  // 3. Remaining members (bureau / member / secretary tier not already added)
  for (const m of membersForSec) {
    if (!m.name?.trim()) continue;
    if (list.some(existing => namesMatch(existing.name, m.name))) continue;
    const leaderMatch = findMatchingLeader(m.name);
    const partyMatch = findMatchingPartyLeader(m.name);
    list.push({
      personKey: m.id || m.name.trim(),
      name: m.name.trim(),
      role: m.bureauTitle || m.role || 'عضو هيئة مكتب الأمانة',
      tierLabel:
        m.tier === 'secretary'
          ? 'أمين الأمانة'
          : m.tier === 'assistant_secretary'
          ? 'الأمين المساعد'
          : 'عضو هيئة مكتب الأمانة',
      secretariat: sec,
      photoUrl: m.photoUrl || leaderMatch?.photoUrl || partyMatch?.photoUrl || '',
      bio: m.notes || leaderMatch?.bio || partyMatch?.bio || '',
      phone: m.phone || '',
      email: m.email || '',
      assignmentDate: m.assignmentDate || m.joinDate || leaderMatch?.appointmentDate || '',
      notes: m.notes || ''
    });
  }

  // 4. Any SecretariatLeader explicitly linked to this secretariat who is not yet in the list
  for (const ldr of secretariatLeaders || []) {
    if (ldr.specializedSecretariatId !== sec.id || !ldr.name?.trim()) continue;
    if (list.some(existing => namesMatch(existing.name, ldr.name))) continue;
    list.push({
      personKey: ldr.id || ldr.name.trim(),
      name: ldr.name.trim(),
      role: ldr.title || `قيادة في ${sec.name}`,
      tierLabel: 'قيادة مقيدة بالأمانة',
      secretariat: sec,
      photoUrl: ldr.photoUrl || '',
      bio: ldr.bio || '',
      assignmentDate: ldr.appointmentDate || ''
    });
  }

  // 5. Any PartyLeader explicitly linked to this secretariat who is not yet in the list
  for (const pldr of partyLeaders || []) {
    if (pldr.specializedSecretariatId !== sec.id || !pldr.name?.trim()) continue;
    if (list.some(existing => namesMatch(existing.name, pldr.name))) continue;
    list.push({
      personKey: pldr.id || pldr.name.trim(),
      name: pldr.name.trim(),
      role: pldr.position || `قيادة مقيدة في ${sec.name}`,
      tierLabel: pldr.level || 'قيادة حزبية مقيدة بالأمانة',
      secretariat: sec,
      photoUrl: pldr.photoUrl || '',
      bio: pldr.bio || ''
    });
  }

  return list;
}

export function resolvePersonInSecretariats(params: {
  name?: string | null;
  personKey?: string | null;
  position?: string | null;
  explicitSecretariatId?: string | null;
  specializedSecretariats: SpecializedSecretariat[];
  secretariatMembers: SecretariatMember[];
  secretariatLeaders: SecretariatLeader[];
  partyLeaders?: PartyLeader[];
}): ResolvedPersonProfile | null {
  const {
    name,
    personKey,
    position,
    explicitSecretariatId,
    specializedSecretariats = [],
    secretariatMembers = [],
    secretariatLeaders = [],
    partyLeaders = []
  } = params;

  if (!specializedSecretariats.length) return null;

  // Helper to search inside a specific secretariat
  const findInSec = (sec: SpecializedSecretariat): ResolvedPersonProfile | null => {
    const people = getAllPeopleInSecretariat(sec, secretariatMembers, secretariatLeaders, partyLeaders);
    if (personKey) {
      const byKey = people.find(p => p.personKey === personKey || namesMatch(p.name, personKey));
      if (byKey) return byKey;
    }
    if (name) {
      const byName = people.find(p => namesMatch(p.name, name));
      if (byName) return byName;
    }
    return null;
  };

  // 1. Check explicit secretariat ID first against registered directory
  const targetSec = explicitSecretariatId
    ? specializedSecretariats.find(
        s => s.id === explicitSecretariatId || s.slug === explicitSecretariatId
      )
    : undefined;

  if (targetSec) {
    const match = findInSec(targetSec);
    if (match) return match;
    const matchedLeader = (secretariatLeaders || []).find(
      l =>
        l.specializedSecretariatId === targetSec.id &&
        ((name && namesMatch(l.name, name)) || (personKey && (l.id === personKey || namesMatch(l.name, personKey))))
    );
    if (matchedLeader) {
      return {
        personKey: matchedLeader.id,
        name: matchedLeader.name,
        role: matchedLeader.title,
        tierLabel: 'قيادة مقيدة بالأمانة',
        secretariat: targetSec,
        photoUrl: matchedLeader.photoUrl || '',
        bio: matchedLeader.bio || '',
        assignmentDate: matchedLeader.appointmentDate || ''
      };
    }
    const matchedParty = (partyLeaders || []).find(
      l =>
        l.specializedSecretariatId === targetSec.id &&
        ((name && namesMatch(l.name, name)) || (personKey && (l.id === personKey || namesMatch(l.name, personKey))))
    );
    if (matchedParty) {
      return {
        personKey: matchedParty.id,
        name: matchedParty.name,
        role: matchedParty.position,
        tierLabel: matchedParty.level || 'قيادة حزبية مقيدة بالأمانة',
        secretariat: targetSec,
        photoUrl: matchedParty.photoUrl || '',
        bio: matchedParty.bio || ''
      };
    }
  }

  // 2. Search across all active secretariats for an actual registered profile
  for (const sec of specializedSecretariats) {
    const match = findInSec(sec);
    if (match) return match;
  }

  // 3. If party leader has an explicit secretariat link even if not passed by caller
  if (name || personKey) {
    const linkedParty = (partyLeaders || []).find(
      l =>
        Boolean(l.specializedSecretariatId) &&
        ((name && namesMatch(l.name, name)) || (personKey && (l.id === personKey || namesMatch(l.name, personKey))))
    );
    if (linkedParty?.specializedSecretariatId) {
      const sec = specializedSecretariats.find(s => s.id === linkedParty.specializedSecretariatId);
      if (sec) {
        return {
          personKey: linkedParty.id,
          name: linkedParty.name,
          role: linkedParty.position,
          tierLabel: linkedParty.level || 'قيادة حزبية مقيدة بالأمانة',
          secretariat: sec,
          photoUrl: linkedParty.photoUrl || '',
          bio: linkedParty.bio || ''
        };
      }
    }
  }

  // 4. Fallback: if a post explicitly tagged a secretariat for this person, resolve into that secretariat
  if (targetSec && (name?.trim() || personKey?.trim())) {
    const cleanName = (name || personKey || '').trim();
    return {
      personKey: cleanName,
      name: cleanName,
      role: position?.trim() || `مشارك / محرر في ${targetSec.name}`,
      tierLabel: 'مسؤول / محرر مقيد بالأمانة',
      secretariat: targetSec,
      photoUrl: '',
      bio: ''
    };
  }

  return null;
}

export function getPersonContributions(
  personName: string | undefined | null,
  data: PublicPortalData
): PersonPostContribution[] {
  if (!personName || !personName.trim()) return [];
  const list: PersonPostContribution[] = [];

  for (const item of data.news || []) {
    const isAuthor = namesMatch(item.authorName, personName);
    const isPublisher = namesMatch(item.publisherName, personName);
    if (isAuthor || isPublisher) {
      list.push({
        kind: 'news',
        id: item.id,
        title: item.title,
        date: item.publishDate,
        contributionRole:
          isAuthor && isPublisher
            ? 'كتابة وإعداد ونشر الخبر'
            : isAuthor
            ? 'كتابة / إعداد الخبر'
            : 'نشر ورفع الخبر (أمانة الإعلام)',
        positionUsed: isAuthor ? item.authorPosition : item.publisherPosition,
        secretariatId: isAuthor
          ? item.authorSecretariatId || item.linkedSecretariatId
          : item.publisherSecretariatId,
        coverImage: item.coverImage,
        rawNews: item
      });
    }
  }

  for (const ev of data.events || []) {
    const isAuthor = namesMatch(ev.authorName, personName);
    const isPublisher = namesMatch(ev.publisherName, personName);
    if (isAuthor || isPublisher) {
      list.push({
        kind: 'event',
        id: ev.id,
        title: ev.title,
        date: ev.dateTime ? ev.dateTime.slice(0, 10) : undefined,
        contributionRole:
          isAuthor && isPublisher
            ? 'تنظيم ونشر الفعالية'
            : isAuthor
            ? 'القائم بالفعالية وتنفيذها'
            : 'نشر وتغطية الفعالية (أمانة الإعلام)',
        positionUsed: isAuthor ? ev.authorPosition : ev.publisherPosition,
        secretariatId: isAuthor ? ev.authorSecretariatId : ev.publisherSecretariatId,
        coverImage: ev.coverUrl || ev.coverImage,
        rawEvent: ev
      });
    }
  }

  for (const init of data.initiatives || []) {
    const isAuthor = namesMatch(init.authorName, personName);
    const isPublisher = namesMatch(init.publisherName, personName);
    if (isAuthor || isPublisher) {
      list.push({
        kind: 'initiative',
        id: init.id,
        title: init.title,
        date: init.startDate,
        contributionRole:
          isAuthor && isPublisher
            ? 'إعداد وتنفيذ ونشر المبادرة'
            : isAuthor
            ? 'القائم بالمبادرة / مُعدّها'
            : 'نشر ورفع المبادرة (أمانة الإعلام)',
        positionUsed: isAuthor ? init.authorPosition : init.publisherPosition,
        secretariatId: isAuthor ? init.authorSecretariatId : init.publisherSecretariatId,
        coverImage: init.coverUrl,
        rawInitiative: init
      });
    }

    (init.activities || []).forEach((act, idx) => {
      const actAuthor = namesMatch(act.authorName, personName);
      const actPublisher = namesMatch(act.publisherName, personName);
      if (actAuthor || actPublisher) {
        list.push({
          kind: 'activity',
          id: `${init.id}-act-${idx}`,
          title: `${act.title} (${init.title})`,
          date: act.date,
          contributionRole:
            actAuthor && actPublisher
              ? 'تنفيذ ونشر النشاط الميداني'
              : actAuthor
              ? 'القائم بالنشاط الميداني'
              : 'نشر وتوثيق النشاط (أمانة الإعلام)',
          positionUsed: actAuthor ? act.authorPosition : act.publisherPosition,
          secretariatId: actAuthor ? act.authorSecretariatId : act.publisherSecretariatId,
          coverImage: init.coverUrl,
          rawInitiative: init
        });
      }
    });
  }

  return list;
}

