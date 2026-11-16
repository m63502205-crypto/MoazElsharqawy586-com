import nodemailer from 'nodemailer';
import type { AppDatabase, EmailDispatchLog, NotificationDispatchResult } from './db.ts';

export interface PublishNotificationPayload {
  itemType: 'news' | 'event' | 'initiative';
  itemId: string;
  title: string;
  summary: string;
  imageUrl?: string;
  linkPath: string;
  publishDate?: string;
  authorName?: string;
  authorPosition?: string;
  isUrgent?: boolean;
}

export interface SmtpConfigSummary {
  configured: boolean;
  host: string;
  port: number;
  from: string;
}

function getSmtpSettings() {
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  let host = (process.env.SMTP_HOST || '').trim();

  if (!host && user.toLowerCase().endsWith('@gmail.com')) {
    host = 'smtp.gmail.com';
  }

  const port = Number(process.env.SMTP_PORT) || (host === 'smtp.gmail.com' ? 465 : 587);
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1'
      : port === 465;

  const fromAddress = (process.env.SMTP_FROM || '').trim() || user;
  const configured = Boolean(host && user && pass);

  return {
    configured,
    host,
    port,
    secure,
    user,
    pass,
    from: fromAddress
  };
}

export function isSmtpConfigured(): boolean {
  return getSmtpSettings().configured;
}

export function getSmtpStatus(): SmtpConfigSummary {
  const cfg = getSmtpSettings();
  return {
    configured: cfg.configured,
    host: cfg.host || '',
    port: cfg.port,
    from: cfg.from || ''
  };
}

function getSiteOrigin(dbObj: AppDatabase): string {
  const envUrl = (process.env.PUBLIC_SITE_URL || process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl;
  const settingsUrl = (dbObj.settings?.officialSiteUrl || '').trim().replace(/\/+$/, '');
  if (settingsUrl && /^https?:\/\//i.test(settingsUrl)) return settingsUrl;
  return 'https://www.algabhaalwataniya-oct3.org';
}

function escapeHtml(val: string): string {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildNewsletterHtml(params: {
  payload: PublishNotificationPayload;
  siteUrl: string;
  unsubscribeUrl: string;
  partyName: string;
  secretariatName: string;
  slogan: string;
}): string {
  const { payload, siteUrl, unsubscribeUrl, partyName, secretariatName, slogan } = params;
  const typeLabel =
    payload.itemType === 'news'
      ? payload.isUrgent
        ? 'خبر عاجل'
        : 'خبر وبيان رسمي'
      : payload.itemType === 'event'
      ? 'فعالية ونشاط جديد'
      : 'مبادرة مجتمعية جديدة';

  const badgeBg =
    payload.itemType === 'news'
      ? '#b91c1c'
      : payload.itemType === 'event'
      ? '#b45309'
      : '#047857';

  const fullLink = `${siteUrl}${payload.linkPath.startsWith('/') ? payload.linkPath : `/${payload.linkPath}`}`;
  const cleanSummary = payload.summary.slice(0, 420);

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:'Cairo','Tajawal',Arial,sans-serif;direction:rtl;text-align:right;color:#1c1917;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f5f4;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4;">
          <tr>
            <td style="background-color:#1c1917;padding:20px 24px;border-bottom:3px solid #d97706;">
              <div style="font-size:18px;font-weight:900;color:#ffffff;">${escapeHtml(partyName)}</div>
              <div style="font-size:13px;font-weight:700;color:#fbbf24;margin-top:4px;">${escapeHtml(secretariatName)} &bull; «${escapeHtml(slogan)}»</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <div style="display:inline-block;background-color:${badgeBg};color:#ffffff;font-size:12px;font-weight:800;padding:4px 12px;border-radius:6px;margin-bottom:14px;">
                ${escapeHtml(typeLabel)}
              </div>
              <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.45;font-weight:900;color:#1c1917;">
                ${escapeHtml(payload.title)}
              </h1>
              ${payload.publishDate ? `<div style="font-size:12px;color:#78716c;margin-bottom:14px;">التاريخ: ${escapeHtml(payload.publishDate)}</div>` : ''}
              <p style="margin:0 0 18px 0;font-size:14px;line-height:1.8;color:#44403c;">
                ${escapeHtml(cleanSummary)}
              </p>
              ${payload.authorName ? `<div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:18px;background-color:#fffbeb;padding:10px 14px;border-radius:10px;border:1px solid #fde68a;">نشر / إعداد: ${escapeHtml(payload.authorName)}${payload.authorPosition ? ` — ${escapeHtml(payload.authorPosition)}` : ''}</div>` : ''}
              <a href="${escapeHtml(fullLink)}" style="display:inline-block;background-color:#b91c1c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;padding:12px 24px;border-radius:10px;">
                عرض التفاصيل الكاملة على الموقع الرسمي
              </a>
            </td>
          </tr>
          <tr>
            <td style="background-color:#fafaf9;padding:16px 24px;border-top:1px solid #e7e5e4;font-size:11px;color:#78716c;line-height:1.7;">
              <div>تصلك هذه الرسالة لأنك مشترك في النشرة البريدية لأخبار وفعاليات ومبادرات ${escapeHtml(secretariatName)}.</div>
              <div style="margin-top:6px;">
                <a href="${escapeHtml(unsubscribeUrl)}" style="color:#b91c1c;text-decoration:underline;">إلغاء الاشتراك في التنبيهات البريدية</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function dispatchSubscriberNotifications(
  dbObj: AppDatabase,
  payload: PublishNotificationPayload,
  saveFn: () => void
): Promise<NotificationDispatchResult> {
  const topicKey =
    payload.itemType === 'news'
      ? 'news'
      : payload.itemType === 'event'
      ? 'events'
      : 'initiatives';

  const activeSubscribers = (dbObj.subscribers || []).filter(
    s => s && s.status === 'active' && s.email && s.topics?.[topicKey] !== false
  );

  const recordLog = (
    mode: EmailDispatchLog['mode'],
    sentCount: number,
    failedCount: number,
    errorMessage?: string
  ): NotificationDispatchResult => {
    const logEntry: EmailDispatchLog = {
      id: 'mail-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      itemType: payload.itemType,
      itemId: payload.itemId,
      title: payload.title,
      recipientCount: activeSubscribers.length,
      sentCount,
      failedCount,
      mode,
      errorMessage,
      dispatchedAt: new Date().toISOString()
    };
    if (!dbObj.emailDispatchLogs) dbObj.emailDispatchLogs = [];
    dbObj.emailDispatchLogs.unshift(logEntry);
    if (dbObj.emailDispatchLogs.length > 200) {
      dbObj.emailDispatchLogs = dbObj.emailDispatchLogs.slice(0, 200);
    }
    saveFn();
    return {
      attempted: true,
      mode,
      recipientCount: activeSubscribers.length,
      sentCount,
      failedCount,
      errorMessage
    };
  };

  if (activeSubscribers.length === 0) {
    return recordLog('no_subscribers', 0, 0);
  }

  const smtp = getSmtpSettings();
  if (!smtp.configured) {
    return recordLog(
      'unconfigured',
      0,
      0,
      'لم يتم ضبط إعدادات خادم البريد (SMTP_HOST/SMTP_USER/SMTP_PASS) في متغيرات البيئة'
    );
  }

  const siteUrl = getSiteOrigin(dbObj);
  const partyName = dbObj.settings?.partyName || 'حزب الجبهة الوطنية';
  const secretariatName = dbObj.settings?.secretariatName || 'أمانة قسم ثالث أكتوبر – محافظة الجيزة';
  const slogan = dbObj.settings?.slogan || 'مصر للجميع';

  const subjectPrefix =
    payload.itemType === 'news'
      ? payload.isUrgent
        ? 'عاجل | '
        : 'خبر جديد | '
      : payload.itemType === 'event'
      ? 'فعالية جديدة | '
      : 'مبادرة جديدة | ';

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass
      }
    });

    let sentCount = 0;
    let failedCount = 0;
    let lastError = '';

    for (const sub of activeSubscribers) {
      const unsubscribeUrl = `${siteUrl}/api/public/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken)}`;
      const html = buildNewsletterHtml({
        payload,
        siteUrl,
        unsubscribeUrl,
        partyName,
        secretariatName,
        slogan
      });
      const text = `${subjectPrefix}${payload.title}\n\n${payload.summary}\n\nالتفاصيل: ${siteUrl}${payload.linkPath}\n\nلإلغاء الاشتراك: ${unsubscribeUrl}`;

      try {
        await transporter.sendMail({
          from: `"${partyName} - أمانة ثالث أكتوبر" <${smtp.from}>`,
          to: sub.email,
          subject: `${subjectPrefix}${payload.title} – ${partyName}`,
          text,
          html
        });
        sentCount++;
      } catch (sendErr: any) {
        failedCount++;
        lastError = sendErr?.message || 'فشل إرسال الرسالة';
      }
    }

    const finalMode: EmailDispatchLog['mode'] = sentCount > 0 ? 'smtp' : 'error';
    return recordLog(finalMode, sentCount, failedCount, lastError || undefined);
  } catch (err: any) {
    return recordLog('error', 0, activeSubscribers.length, err?.message || 'خطأ في الاتصال بخادم البريد');
  }
}
