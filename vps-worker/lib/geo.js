/**
 * IP/timezone/locale matching utilities so context settings agree with proxy geo.
 */

const COUNTRY_TZ = {
  FR: 'Europe/Paris',
  IT: 'Europe/Rome',
  ES: 'Europe/Madrid',
  DE: 'Europe/Berlin',
  GR: 'Europe/Athens',
  GB: 'Europe/London',
  PT: 'Europe/Lisbon',
  NL: 'Europe/Amsterdam',
  BE: 'Europe/Brussels',
  CH: 'Europe/Zurich',
  AT: 'Europe/Vienna',
  PL: 'Europe/Warsaw',
  DZ: 'Africa/Algiers',
  TN: 'Africa/Tunis',
  MA: 'Africa/Casablanca',
};

const COUNTRY_LOCALE = {
  FR: { locale: 'fr-FR', langs: ['fr-FR', 'fr', 'en-US', 'en'] },
  IT: { locale: 'it-IT', langs: ['it-IT', 'it', 'en-US', 'en'] },
  ES: { locale: 'es-ES', langs: ['es-ES', 'es', 'en-US', 'en'] },
  DE: { locale: 'de-DE', langs: ['de-DE', 'de', 'en-US', 'en'] },
  GR: { locale: 'el-GR', langs: ['el-GR', 'el', 'en-US', 'en'] },
  GB: { locale: 'en-GB', langs: ['en-GB', 'en'] },
  PT: { locale: 'pt-PT', langs: ['pt-PT', 'pt', 'en-US', 'en'] },
};

export function geoForCountry(cc) {
  const c = (cc || '').toUpperCase();
  return {
    timezoneId: COUNTRY_TZ[c] || 'Europe/Paris',
    locale: (COUNTRY_LOCALE[c] || COUNTRY_LOCALE.GB).locale,
    languages: (COUNTRY_LOCALE[c] || COUNTRY_LOCALE.GB).langs,
    acceptLanguage: (COUNTRY_LOCALE[c] || COUNTRY_LOCALE.GB).langs.join(','),
  };
}

/**
 * Pick a proxy whose geo_country matches the target country if possible.
 * Falls back to any non-quarantined proxy.
 */
export function pickGeoMatchedProxy(proxies, country, isProxyOk = () => true) {
  const cc = (country || '').toUpperCase();
  const ok = proxies.filter(isProxyOk);
  const matches = ok.filter((p) => (p.geo_country || '').toUpperCase() === cc);
  return matches[0] || ok[0] || null;
}