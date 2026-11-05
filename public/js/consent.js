// Consent banner and Google Analytics, on every page. Google Analytics starts only after the visitor
// accepts it, so before that a page contacts no server other than this site. privacy.html lists the
// cookies this sets: change them together.
import * as CookieConsent from '../vendor/cookieconsent.esm.js';

const GOOGLE_ANALYTICS_ID = 'G-WDN0Q9FRX8';
const ANALYTICS_COOKIES = /^(_ga|_gid|_gcl_)/;
const POLICY_LINK = '<a href="privacy.html">Privacy policy</a>';

let analyticsStarted = false;

function startAnalytics() {
  if (analyticsStarted) return;
  analyticsStarted = true;
  window.dataLayer = window.dataLayer || [];
  // gtag.js reads the arguments object itself, so this cannot be an arrow function with rest parameters.
  function gtag() {
    window.dataLayer.push(arguments);
  }
  // The site shows no ads: without this, the tag can also store advertising identifiers.
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  gtag('js', new Date());
  gtag('config', GOOGLE_ANALYTICS_ID);

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`;
  document.head.append(script);
}

/**
 * Runs when the visitor withdraws consent, before the page reloads. On leaving a page Google Analytics
 * sends a last hit, which can write its cookies again after the library has removed them, so it is
 * switched off first. Its cookies are on the parent domain, and autoClear leaves localStorage alone.
 */
function stopAnalytics() {
  window[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = true;
  for (const name of document.cookie.split('; ').map((cookie) => cookie.split('=')[0])) {
    if (!ANALYTICS_COOKIES.test(name)) continue;
    document.cookie = `${name}=; Max-Age=0; path=/`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=${location.hostname}`;
  }
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('_gcl_')) localStorage.removeItem(key);
  }
}

CookieConsent.run({
  guiOptions: {
    consentModal: { layout: 'box', position: 'bottom left', equalWeightButtons: true },
    preferencesModal: { layout: 'box', equalWeightButtons: true },
  },
  categories: {
    necessary: { enabled: true, readOnly: true },
    analytics: { autoClear: { cookies: [{ name: ANALYTICS_COOKIES }], reloadPage: true } },
  },
  onConsent: () => {
    if (CookieConsent.acceptedCategory('analytics')) startAnalytics();
  },
  onChange: () => {
    if (CookieConsent.acceptedCategory('analytics')) startAnalytics();
    else stopAnalytics();
  },
  language: {
    default: 'en',
    translations: {
      en: {
        consentModal: {
          title: 'Cookies for visit statistics',
          description:
            'If you accept, this site uses Google Analytics and its cookies to see how many people visit and which pages they read. ' +
            'Google gets your IP address and details of your browser. ' +
            'Declining changes nothing on the site, and you can change your mind under "Cookie settings".',
          acceptAllBtn: 'Accept',
          acceptNecessaryBtn: 'Decline',
          footer: POLICY_LINK,
        },
        preferencesModal: {
          title: 'Cookie settings',
          acceptAllBtn: 'Accept',
          acceptNecessaryBtn: 'Decline',
          savePreferencesBtn: 'Save settings',
          closeIconLabel: 'Close',
          sections: [
            {
              title: 'Necessary <span class="pm__badge">Always on</span>',
              description: 'Remembers your choice about cookies, and nothing else.',
              linkedCategory: 'necessary',
            },
            {
              title: 'Statistics',
              description: 'Google Analytics: shows how many people visit this site and which pages they read.',
              linkedCategory: 'analytics',
            },
            { title: 'More information', description: POLICY_LINK },
          ],
        },
      },
    },
  },
});
