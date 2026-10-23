// frontend/src/utils/localeDefaults.js
//
// Resolves sensible defaults for timezone and country WITHOUT
// hardcoding a specific market. Priority:
//
//   1. User's device timezone / region (via Intl + navigator.language)
//   2. Explicit product default from config (env-overridable)
//   3. Hardcoded ultimate fallback (only used if both above fail)
//
// If you need a specific market default, override it in the
// deployment's .env via REACT_APP_DEFAULT_TIMEZONE / _COUNTRY.

import { DEFAULTS } from '../config/defaults';

const REGION_TO_COUNTRY = {
    HK: 'Hong Kong',
    IN: 'India',
    SG: 'Singapore',
    MY: 'Malaysia',
    PH: 'Philippines',
    ID: 'Indonesia',
    TH: 'Thailand',
    VN: 'Vietnam',
    AU: 'Australia',
    NZ: 'New Zealand',
    US: 'USA',
    CA: 'Canada',
    UK: 'UK',
    GB: 'UK',
    DE: 'Germany',
    FR: 'France',
    ES: 'Spain',
    IT: 'Italy',
    NL: 'Netherlands',
    AE: 'UAE',
    SA: 'Saudi Arabia',
    JP: 'Japan',
    KR: 'South Korea',
    CN: 'China',
    TW: 'Taiwan',
};

export const getDeviceTimezone = () => {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!tz || tz === 'UTC') return null;
        return tz;
    } catch {
        return null;
    }
};

export const getDeviceCountry = () => {
    try {
        const languages = navigator.languages?.length
            ? navigator.languages
            : [navigator.language || ''];

        for (const lang of languages) {
            const parts = String(lang).split('-');
            if (parts.length < 2) continue;
            const region = parts[1].toUpperCase();
            if (REGION_TO_COUNTRY[region]) return REGION_TO_COUNTRY[region];
        }
        return null;
    } catch {
        return null;
    }
};

export const resolveTimezoneDefault = () =>
    getDeviceTimezone() || DEFAULTS.timezone;

export const resolveCountryDefault = () =>
    getDeviceCountry() || DEFAULTS.country;