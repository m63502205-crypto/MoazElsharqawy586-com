/**
 * Google Analytics (GA4) Tracking Utility
 * Handles dynamic measurement ID configuration, SPA route pageviews,
 * and custom conversion events for the party portal.
 */

declare global {
  interface Window {
    dataLayer: any[];
    gtag?: (...args: any[]) => void;
  }
}

let activeMeasurementId: string | null = null;

/**
 * Initialize or update Google Analytics with the given Measurement ID (G-XXXXXXXXXX)
 */
export function initGoogleAnalytics(measurementId?: string): boolean {
  const id = measurementId?.trim() || (import.meta.env.VITE_GA_MEASUREMENT_ID as string)?.trim();

  if (!id) {
    return false;
  }

  // Validate format (G-XXXXXXXXXX or GTM-XXXXXXX or UA-XXXXX-Y)
  const isValidFormat = /^G-[A-Za-z0-9]+$/i.test(id) || /^GTM-[A-Za-z0-9]+$/i.test(id) || /^UA-\d+-\d+$/i.test(id);
  if (!isValidFormat) {
    console.warn(`[Google Analytics] Warning: "${id}" does not look like a standard Measurement ID (expected format: G-XXXXXXXXXX)`);
  }

  // If already initialized with this exact ID, return true
  if (activeMeasurementId === id) {
    return true;
  }

  activeMeasurementId = id;

  // Initialize dataLayer
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
  }

  // Inject or update the Google Analytics script tag
  const scriptId = 'google-analytics-gtag';
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
  } else {
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  }

  window.gtag('js', new Date());
  window.gtag('config', id, {
    send_page_view: false, // We dispatch pageviews manually to accurately support SPA hash routes
    cookie_flags: 'SameSite=None;Secure'
  });

  console.log(`[Google Analytics] ✅ Successfully initialized GA4 with Measurement ID: ${id}`);
  return true;
}

/**
 * Returns current active Measurement ID or null
 */
export function getActiveMeasurementId(): string | null {
  return activeMeasurementId;
}

/**
 * Track an SPA pageview
 */
export function trackPageView(pagePath: string, pageTitle?: string) {
  if (!window.gtag || !activeMeasurementId) {
    return;
  }

  const fullUrl = window.location.href;
  window.gtag('event', 'page_view', {
    page_title: pageTitle || document.title,
    page_location: fullUrl,
    page_path: pagePath,
  });
}

/**
 * Track custom user actions (e.g. membership form submitted, WhatsApp click, etc.)
 */
export function trackEvent(eventName: string, params: Record<string, any> = {}) {
  if (window.gtag && activeMeasurementId) {
    window.gtag('event', eventName, params);
  } else if (window.dataLayer) {
    window.dataLayer.push({
      event: eventName,
      ...params,
    });
  }
}
