/**
 * Google Analytics (GA4) Tracking Utility
 * Handles dynamic measurement ID configuration, duplicate-tag prevention,
 * SPA route pageviews, referrer/source & device metadata, and custom events.
 */

export const DEFAULT_GA4_MEASUREMENT_ID = 'G-NX1MQ9NHXW';

declare global {
  interface Window {
    dataLayer: any[];
    gtag?: (...args: any[]) => void;
    __nfpGaConfigured?: Record<string, boolean>;
    __nfpGaJsCalled?: boolean;
  }
}

let activeMeasurementId: string | null = null;

/**
 * Initialize or update Google Analytics with the given Measurement ID (G-XXXXXXXXXX)
 * Strictly avoids duplicate <script> tags and duplicate gtag('config', id) calls.
 */
export function initGoogleAnalytics(measurementId?: string): boolean {
  const id =
    measurementId?.trim() ||
    (import.meta.env.VITE_GA_MEASUREMENT_ID as string)?.trim() ||
    DEFAULT_GA4_MEASUREMENT_ID;

  if (!id) {
    return false;
  }

  const isValidFormat =
    /^G-[A-Za-z0-9]+$/i.test(id) ||
    /^GTM-[A-Za-z0-9]+$/i.test(id) ||
    /^UA-\d+-\d+$/i.test(id);
  if (!isValidFormat) {
    console.warn(`[Google Analytics] Warning: "${id}" does not match expected Measurement ID format`);
  }

  window.dataLayer = window.dataLayer || [];
  window.__nfpGaConfigured = window.__nfpGaConfigured || {};

  if (!window.gtag) {
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
  }

  // Only inject script if not already in <head>
  const existingHeadTag = document.querySelector(`script[src*="gtag/js?id=${encodeURIComponent(id)}"]`);
  if (!existingHeadTag) {
    const scriptId = 'google-analytics-gtag';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      document.head.appendChild(script);
    } else if (!script.src.includes(`id=${encodeURIComponent(id)}`)) {
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    }
  }

  // Only configure each Measurement ID once
  if (!window.__nfpGaConfigured[id]) {
    if (!window.__nfpGaJsCalled) {
      window.gtag('js', new Date());
      window.__nfpGaJsCalled = true;
    }
    window.gtag('config', id, {
      send_page_view: false,
      cookie_flags: 'SameSite=None;Secure'
    });
    window.__nfpGaConfigured[id] = true;
  }

  activeMeasurementId = id;
  return true;
}

/**
 * Returns current active Measurement ID or default
 */
export function getActiveMeasurementId(): string | null {
  return activeMeasurementId || DEFAULT_GA4_MEASUREMENT_ID;
}

/**
 * Track an SPA pageview (includes referrer/traffic source & screen context automatically via GA4)
 */
export function trackPageView(pagePath: string, pageTitle?: string) {
  if (!activeMeasurementId) {
    initGoogleAnalytics(DEFAULT_GA4_MEASUREMENT_ID);
  }
  if (!window.gtag || !activeMeasurementId) {
    return;
  }

  window.gtag('event', 'page_view', {
    page_title: pageTitle || document.title,
    page_location: window.location.href,
    page_path: pagePath,
    page_referrer: document.referrer || undefined,
    language: document.documentElement.lang || 'ar'
  });
}

/**
 * Track custom user actions (e.g. membership form submitted, WhatsApp click, etc.)
 */
export function trackEvent(eventName: string, params: Record<string, any> = {}) {
  if (!activeMeasurementId) {
    initGoogleAnalytics(DEFAULT_GA4_MEASUREMENT_ID);
  }
  if (window.gtag && activeMeasurementId) {
    window.gtag('event', eventName, params);
  } else if (window.dataLayer) {
    window.dataLayer.push({
      event: eventName,
      ...params
    });
  }
}
