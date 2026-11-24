import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  FileText,
  Presentation,
  CheckSquare,
  Calendar as CalendarIcon,
  Plus,
  ExternalLink,
  RefreshCw,
  LogOut,
  Check,
  Trash2,
  X,
  AlertTriangle
} from 'lucide-react';
import {
  initWorkspaceAuth,
  signInWithGoogleWorkspace,
  getWorkspaceAccessToken,
  signOutGoogleWorkspace
} from '../../firebase';

interface DriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface TaskListSummary {
  id: string;
  title: string;
}

interface GoogleTaskItem {
  id: string;
  title: string;
  status: 'needsAction' | 'completed';
  notes?: string;
  due?: string;
}

interface GoogleCalendarEventItem {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  htmlLink?: string;
  location?: string;
}

interface PendingMutationDialog {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}

interface WorkspaceIntegrationCardProps {
  secretariatsCount: number;
  newsCount: number;
  initiativesCount: number;
  eventsCount: number;
  onNotify?: (type: 'success' | 'error', msg: string) => void;
}

export const WorkspaceIntegrationCard: React.FC<WorkspaceIntegrationCardProps> = ({
  secretariatsCount,
  newsCount,
  initiativesCount,
  eventsCount,
  onNotify
}) => {
  const [workspaceUser, setWorkspaceUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeService, setActiveService] = useState<'docs' | 'slides' | 'tasks' | 'calendar'>('docs');
  const [loadingData, setLoadingData] = useState(false);

  const [docsFiles, setDocsFiles] = useState<DriveFileSummary[]>([]);
  const [slidesFiles, setSlidesFiles] = useState<DriveFileSummary[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<{ title: string; body: string } | null>(null);

  const [taskLists, setTaskLists] = useState<TaskListSummary[]>([]);
  const [selectedTaskListId, setSelectedTaskListId] = useState<string>('');
  const [tasks, setTasks] = useState<GoogleTaskItem[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEventItem[]>([]);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('');

  const [newDocTitle, setNewDocTitle] = useState('تقرير أنشطة أمانة قسم ثالث أكتوبر');
  const [newSlideTitle, setNewSlideTitle] = useState('العرض التقديمي الرسمي لأمانة قسم ثالث أكتوبر');

  const [pendingDialog, setPendingDialog] = useState<PendingMutationDialog | null>(null);
  const [executingDialog, setExecutingDialog] = useState(false);

  useEffect(() => {
    const unsub = initWorkspaceAuth(
      (user) => {
        setWorkspaceUser(user);
        setNeedsAuth(false);
      },
      () => {
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, []);

  const requireToken = async (): Promise<string | null> => {
    const tok = await getWorkspaceAccessToken();
    if (!tok) {
      setNeedsAuth(true);
      return null;
    }
    return tok;
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const res = await signInWithGoogleWorkspace();
      if (res) {
        setWorkspaceUser(res.user);
        setNeedsAuth(false);
        onNotify?.('success', 'تم ربط حساب Google Workspace بنجاح');
        void loadServiceData(activeService);
      }
    } catch (err: any) {
      onNotify?.('error', err?.message || 'تعذر تسجيل الدخول عبر حساب جوجل');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOutGoogleWorkspace();
    setWorkspaceUser(null);
    setNeedsAuth(true);
    setDocsFiles([]);
    setSlidesFiles([]);
    setTaskLists([]);
    setTasks([]);
    setCalendarEvents([]);
    setSelectedPreview(null);
  };

  const loadServiceData = async (service: 'docs' | 'slides' | 'tasks' | 'calendar') => {
    const token = await requireToken();
    if (!token) return;
    setLoadingData(true);
    setSelectedPreview(null);
    try {
      if (service === 'docs') {
        const q = encodeURIComponent("mimeType='application/vnd.google-apps.document' and trashed=false");
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=10&fields=files(id,name,mimeType,modifiedTime,webViewLink)`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error('تعذر جلب مستندات Google Docs');
        const json = await res.json();
        setDocsFiles(Array.isArray(json.files) ? json.files : []);
      } else if (service === 'slides') {
        const q = encodeURIComponent("mimeType='application/vnd.google-apps.presentation' and trashed=false");
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=10&fields=files(id,name,mimeType,modifiedTime,webViewLink)`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error('تعذر جلب عروض Google Slides');
        const json = await res.json();
        setSlidesFiles(Array.isArray(json.files) ? json.files : []);
      } else if (service === 'tasks') {
        const res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('تعذر جلب قوائم مهام Google Tasks');
        const json = await res.json();
        const lists: TaskListSummary[] = Array.isArray(json.items) ? json.items : [];
        setTaskLists(lists);
        const listId = selectedTaskListId || lists[0]?.id || '';
        if (listId) {
          setSelectedTaskListId(listId);
          const tasksRes = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks?showCompleted=true&maxResults=25`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (tasksRes.ok) {
            const tasksJson = await tasksRes.json();
            setTasks(Array.isArray(tasksJson.items) ? tasksJson.items : []);
          }
        }
      } else {
        const timeMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=15&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error('تعذر جلب مواعيد Google Calendar');
        const json = await res.json();
        setCalendarEvents(Array.isArray(json.items) ? json.items : []);
      }
    } catch (err: any) {
      onNotify?.('error', err?.message || 'حدث خطأ أثناء الاتصال بخدمات جوجل');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!needsAuth) {
      void loadServiceData(activeService);
    }
  }, [activeService, needsAuth]);

  const previewDocument = async (file: DriveFileSummary) => {
    const token = await requireToken();
    if (!token) return;
    setLoadingData(true);
    try {
      if (activeService === 'docs') {
        const res = await fetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(file.id)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('تعذر قراءة محتوى المستند');
        const docData = await res.json();
        const paragraphs: string[] = [];
        for (const el of docData?.body?.content || []) {
          const runs = el?.paragraph?.elements || [];
          const text = runs.map((r: any) => r?.textRun?.content || '').join('').trim();
          if (text) paragraphs.push(text);
        }
        setSelectedPreview({
          title: docData?.title || file.name,
          body: paragraphs.slice(0, 12).join('\n\n') || 'المستند فارغ حالياً.'
        });
      } else {
        const res = await fetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(file.id)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('تعذر قراءة محتوى العرض التقديمي');
        const presData = await res.json();
        const slidesSummary = (presData?.slides || []).map((slide: any, idx: number) => {
          const texts: string[] = [];
          for (const pe of slide?.pageElements || []) {
            for (const te of pe?.shape?.text?.textElements || []) {
              const content = te?.textRun?.content?.trim();
              if (content) texts.push(content);
            }
          }
          return `الشريحة ${idx + 1}: ${texts.join(' — ') || '(بدون نص)'}`;
        });
        setSelectedPreview({
          title: presData?.title || file.name,
          body: slidesSummary.join('\n\n') || 'لا توجد شرائح في العرض.'
        });
      }
    } catch (err: any) {
      onNotify?.('error', err?.message || 'تعذر معاينة الملف');
    } finally {
      setLoadingData(false);
    }
  };

  const requestCreateGoogleDoc = () => {
    const title = newDocTitle.trim() || 'تقرير أمانة قسم ثالث أكتوبر';
    setPendingDialog({
      title: 'تأكيد إنشاء مستند في Google Docs',
      description: `سيتم إنشاء مستند جديد باسم «${title}» داخل حسابك على Google Drive وتضمينه ملخص الإحصائيات الحالية (${secretariatsCount} أمانة، ${newsCount} خبر، ${initiativesCount} مبادرة). هل تريد المتابعة؟`,
      confirmLabel: 'تأكيد وإنشاء المستند',
      onConfirm: async () => {
        const token = await requireToken();
        if (!token) return;
        const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ title })
        });
        if (!createRes.ok) throw new Error('تعذر إنشاء مستند Google Docs');
        const created = await createRes.json();
        const summaryText = `حزب الجبهة الوطنية – أمانة قسم ثالث أكتوبر\n\nملخص الحالة الحالية:\n- عدد الأمانات التخصصية: ${secretariatsCount}\n- عدد الأخبار والبيانات: ${newsCount}\n- عدد المبادرات المجتمعية: ${initiativesCount}\n- عدد الفعاليات: ${eventsCount}\n`;
        await fetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(created.documentId)}:batchUpdate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests: [{ insertText: { location: { index: 1 }, text: summaryText } }]
          })
        });
        onNotify?.('success', `تم إنشاء مستند «${title}» في Google Docs بنجاح`);
        await loadServiceData('docs');
      }
    });
  };

  const requestCreateGoogleSlides = () => {
    const title = newSlideTitle.trim() || 'العرض التقديمي الرسمي لأمانة قسم ثالث أكتوبر';
    setPendingDialog({
      title: 'تأكيد إنشاء عرض تقديمي في Google Slides',
      description: `سيتم إنشاء عرض تقديمي جديد باسم «${title}» على حساب Google Workspace الخاص بك وتضمينه شريحة إضافية. هل تريد المتابعة؟`,
      confirmLabel: 'تأكيد وإنشاء العرض',
      onConfirm: async () => {
        const token = await requireToken();
        if (!token) return;
        const createRes = await fetch('https://slides.googleapis.com/v1/presentations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ title })
        });
        if (!createRes.ok) throw new Error('تعذر إنشاء عرض Google Slides');
        const created = await createRes.json();
        await fetch(
          `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(created.presentationId)}:batchUpdate`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              requests: [
                {
                  createSlide: {
                    insertionIndex: 1,
                    slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' }
                  }
                }
              ]
            })
          }
        );
        onNotify?.('success', `تم إنشاء عرض «${title}» في Google Slides بنجاح`);
        await loadServiceData('slides');
      }
    });
  };

  const requestAddTask = () => {
    const title = newTaskTitle.trim();
    if (!title || !selectedTaskListId) return;
    setPendingDialog({
      title: 'تأكيد إضافة مهمة في Google Tasks',
      description: `سيتم إضافة المهمة «${title}» إلى قائمة مهام Google Tasks المرتبطة بحسابك. هل تريد المتابعة؟`,
      confirmLabel: 'إضافة المهمة',
      onConfirm: async () => {
        const token = await requireToken();
        if (!token) return;
        const res = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(selectedTaskListId)}/tasks`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title })
          }
        );
        if (!res.ok) throw new Error('تعذر إضافة المهمة');
        setNewTaskTitle('');
        onNotify?.('success', 'تمت إضافة المهمة إلى Google Tasks بنجاح');
        await loadServiceData('tasks');
      }
    });
  };

  const requestToggleTask = (task: GoogleTaskItem) => {
    if (!selectedTaskListId) return;
    const nextStatus = task.status === 'completed' ? 'needsAction' : 'completed';
    setPendingDialog({
      title: 'تأكيد تحديث حالة المهمة',
      description: `هل تريد تغيير حالة المهمة «${task.title}» إلى ${nextStatus === 'completed' ? 'مكتملة' : 'قيد التنفيذ'}؟`,
      confirmLabel: 'تحديث الحالة',
      onConfirm: async () => {
        const token = await requireToken();
        if (!token) return;
        const res = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(selectedTaskListId)}/tasks/${encodeURIComponent(task.id)}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: nextStatus })
          }
        );
        if (!res.ok) throw new Error('تعذر تحديث حالة المهمة');
        onNotify?.('success', 'تم تحديث حالة المهمة في Google Tasks');
        await loadServiceData('tasks');
      }
    });
  };

  const requestDeleteTask = (task: GoogleTaskItem) => {
    if (!selectedTaskListId) return;
    setPendingDialog({
      title: 'تأكيد حذف المهمة من Google Tasks',
      description: `هل أنت متأكد من حذف المهمة «${task.title}» نهائياً من قائمة مهام Google Tasks؟`,
      confirmLabel: 'حذف المهمة',
      danger: true,
      onConfirm: async () => {
        const token = await requireToken();
        if (!token) return;
        const res = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(selectedTaskListId)}/tasks/${encodeURIComponent(task.id)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        if (!res.ok) throw new Error('تعذر حذف المهمة');
        onNotify?.('success', 'تم حذف المهمة من Google Tasks');
        await loadServiceData('tasks');
      }
    });
  };

  const requestCreateCalendarEvent = () => {
    const summary = newEventTitle.trim();
    if (!summary || !newEventDate) return;
    setPendingDialog({
      title: 'تأكيد جدولة فعالية في Google Calendar',
      description: `سيتم إضافة الحدث «${summary}» بتاريخ ${newEventDate} إلى تقويمك الأساسي في Google Calendar. هل تريد المتابعة؟`,
      confirmLabel: 'تأكيد الجدولة',
      onConfirm: async () => {
        const token = await requireToken();
        if (!token) return;
        const startDt = new Date(newEventDate);
        const endDt = new Date(startDt.getTime() + 2 * 60 * 60 * 1000);
        const res = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              summary,
              location: 'مقر أمانة حزب الجبهة الوطنية – قسم ثالث أكتوبر، الجيزة',
              start: { dateTime: startDt.toISOString() },
              end: { dateTime: endDt.toISOString() }
            })
          }
        );
        if (!res.ok) throw new Error('تعذر إنشاء الحدث في Google Calendar');
        setNewEventTitle('');
        setNewEventDate('');
        onNotify?.('success', 'تمت جدولة الفعالية في Google Calendar بنجاح');
        await loadServiceData('calendar');
      }
    });
  };

  const requestDeleteCalendarEvent = (ev: GoogleCalendarEventItem) => {
    setPendingDialog({
      title: 'تأكيد حذف الموعد من Google Calendar',
      description: `هل أنت متأكد من حذف الموعد «${ev.summary || 'بدون عنوان'}» من تقويم Google Calendar؟`,
      confirmLabel: 'حذف الموعد',
      danger: true,
      onConfirm: async () => {
        const token = await requireToken();
        if (!token) return;
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(ev.id)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        if (!res.ok) throw new Error('تعذر حذف الحدث من Google Calendar');
        onNotify?.('success', 'تم حذف الموعد من Google Calendar');
        await loadServiceData('calendar');
      }
    });
  };

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
        <div>
          <h3 className="font-black text-stone-900 text-base">
            تكامل Google Workspace (Docs · Slides · Tasks · Calendar)
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            إدارة التقارير الرسمية والعروض التقديمية والمهام التنظيمية وجدول اجتماعات الأمانة.
          </p>
        </div>

        {needsAuth ? (
          <button
            type="button"
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="gsi-material-button inline-flex items-center gap-2.5 bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 rounded-xl px-4 py-2 text-xs font-bold shadow-xs cursor-pointer disabled:opacity-60 shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            <span>{isLoggingIn ? 'جارٍ الاتصال...' : 'Sign in with Google'}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
              {workspaceUser?.email || 'حساب جوجل متصل'}
            </span>
            <button
              type="button"
              onClick={() => void loadServiceData(activeService)}
              className="p-2 rounded-lg bg-white border border-stone-200 text-stone-600 hover:text-red-700 cursor-pointer"
              title="تحديث"
            >
              <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-3 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-600 hover:text-red-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>فصل الحساب</span>
            </button>
          </div>
        )}
      </div>

      {!needsAuth && (
        <>
          <div className="flex items-center gap-2 border-b border-stone-200 pb-3 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveService('docs')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 cursor-pointer ${
                activeService === 'docs'
                  ? 'bg-red-700 text-white'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Google Docs</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveService('slides')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 cursor-pointer ${
                activeService === 'slides'
                  ? 'bg-red-700 text-white'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              <Presentation className="w-4 h-4" />
              <span>Google Slides</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveService('tasks')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 cursor-pointer ${
                activeService === 'tasks'
                  ? 'bg-red-700 text-white'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              <span>Google Tasks</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveService('calendar')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 cursor-pointer ${
                activeService === 'calendar'
                  ? 'bg-red-700 text-white'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              <CalendarIcon className="w-4 h-4" />
              <span>Google Calendar</span>
            </button>
          </div>

          {activeService === 'docs' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  placeholder="عنوان المستند الرسمي الجديد"
                  className="flex-1 bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={requestCreateGoogleDoc}
                  className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>إنشاء تقرير Google Doc</span>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {docsFiles.map((file) => (
                  <div key={file.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void previewDocument(file)}
                      className="text-right min-w-0 flex-1 cursor-pointer hover:text-red-700"
                    >
                      <div className="font-bold text-xs text-stone-900 truncate">{file.name}</div>
                      <div className="text-[10px] text-stone-400">اضغط للمعاينة النصية</div>
                    </button>
                    {file.webViewLink && (
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-700 hover:underline text-xs p-1.5"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
                {!loadingData && docsFiles.length === 0 && (
                  <p className="text-xs text-stone-500 col-span-full">لا توجد مستندات Google Docs متاحة للعرض.</p>
                )}
              </div>
            </div>
          )}

          {activeService === 'slides' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newSlideTitle}
                  onChange={(e) => setNewSlideTitle(e.target.value)}
                  placeholder="عنوان العرض التقديمي الجديد"
                  className="flex-1 bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={requestCreateGoogleSlides}
                  className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>إنشاء عرض Google Slides</span>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {slidesFiles.map((file) => (
                  <div key={file.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void previewDocument(file)}
                      className="text-right min-w-0 flex-1 cursor-pointer hover:text-red-700"
                    >
                      <div className="font-bold text-xs text-stone-900 truncate">{file.name}</div>
                      <div className="text-[10px] text-stone-400">اضغط لعرض محتوى الشرائح</div>
                    </button>
                    {file.webViewLink && (
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-700 hover:underline text-xs p-1.5"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
                {!loadingData && slidesFiles.length === 0 && (
                  <p className="text-xs text-stone-500 col-span-full">لا توجد عروض Google Slides متاحة للعرض.</p>
                )}
              </div>
            </div>
          )}

          {activeService === 'tasks' && (
            <div className="space-y-3">
              {taskLists.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-stone-700">قائمة المهام:</span>
                  <select
                    value={selectedTaskListId}
                    onChange={(e) => {
                      setSelectedTaskListId(e.target.value);
                      void loadServiceData('tasks');
                    }}
                    className="bg-white border border-stone-300 rounded-xl px-3 py-1.5 text-xs"
                  >
                    {taskLists.map((tl) => (
                      <option key={tl.id} value={tl.id}>
                        {tl.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="أدخل عنوان مهمة تنظيمية جديدة..."
                  className="flex-1 bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={requestAddTask}
                  disabled={!newTaskTitle.trim() || !selectedTaskListId}
                  className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة مهمة</span>
                </button>
              </div>

              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => requestToggleTask(task)}
                      className="flex items-center gap-2 text-right flex-1 min-w-0 cursor-pointer"
                    >
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                          task.status === 'completed'
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-stone-300 bg-white'
                        }`}
                      >
                        {task.status === 'completed' && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <span
                        className={`text-xs font-bold truncate ${
                          task.status === 'completed' ? 'line-through text-stone-400' : 'text-stone-900'
                        }`}
                      >
                        {task.title}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDeleteTask(task)}
                      className="text-stone-400 hover:text-red-600 p-1 cursor-pointer"
                      title="حذف المهمة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {!loadingData && tasks.length === 0 && (
                  <p className="text-xs text-stone-500">لا توجد مهام حالياً في القائمة المحددة.</p>
                )}
              </div>
            </div>
          )}

          {activeService === 'calendar' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <input
                  type="text"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  placeholder="عنوان الفعالية أو الاجتماع التنظيمي..."
                  className="sm:col-span-6 bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs"
                />
                <input
                  type="datetime-local"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="sm:col-span-4 bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={requestCreateCalendarEvent}
                  disabled={!newEventTitle.trim() || !newEventDate}
                  className="sm:col-span-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-3 py-2 rounded-xl inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>جدولة</span>
                </button>
              </div>
              <div className="space-y-2">
                {calendarEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1 text-right">
                      <div className="font-bold text-xs text-stone-900 truncate">
                        {ev.summary || 'موعد بدون عنوان'}
                      </div>
                      <div className="text-[10px] text-stone-500">
                        {ev.start?.dateTime || ev.start?.date || ''}
                        {ev.location ? ` · ${ev.location}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {ev.htmlLink && (
                        <a
                          href={ev.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-red-700 hover:underline p-1"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => requestDeleteCalendarEvent(ev)}
                        className="text-stone-400 hover:text-red-600 p-1 cursor-pointer"
                        title="حذف الموعد"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {!loadingData && calendarEvents.length === 0 && (
                  <p className="text-xs text-stone-500">لا توجد مواعيد قادمة مسجلة على التقويم.</p>
                )}
              </div>
            </div>
          )}

          {selectedPreview && (
            <div className="bg-white border border-amber-300 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-xs text-stone-900">{selectedPreview.title}</h4>
                <button
                  type="button"
                  onClick={() => setSelectedPreview(null)}
                  className="text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <pre className="text-xs text-stone-700 whitespace-pre-wrap font-sans leading-relaxed max-h-60 overflow-y-auto">
                {selectedPreview.body}
              </pre>
            </div>
          )}
        </>
      )}

      {/* Mandatory explicit confirmation dialog before any mutating/destructive Workspace action */}
      {pendingDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 max-w-md w-full p-6 shadow-2xl space-y-4 text-right">
            <div className="flex items-center gap-2 text-stone-900 font-black text-sm">
              <AlertTriangle className={`w-5 h-5 shrink-0 ${pendingDialog.danger ? 'text-red-600' : 'text-amber-600'}`} />
              <span>{pendingDialog.title}</span>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">{pendingDialog.description}</p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={executingDialog}
                onClick={() => setPendingDialog(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={executingDialog}
                onClick={async () => {
                  setExecutingDialog(true);
                  try {
                    await pendingDialog.onConfirm();
                    setPendingDialog(null);
                  } catch (err: any) {
                    onNotify?.('error', err?.message || 'تعذر تنفيذ العملية في Google Workspace');
                    setPendingDialog(null);
                  } finally {
                    setExecutingDialog(false);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-black text-white cursor-pointer disabled:opacity-60 ${
                  pendingDialog.danger ? 'bg-red-700 hover:bg-red-800' : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                {executingDialog ? 'جارٍ التنفيذ...' : pendingDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
