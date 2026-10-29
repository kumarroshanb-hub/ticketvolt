// frontend/src/i18n.js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import zhHant from './locales/zh-Hant.json';

export const SUPPORTED_LANGUAGES = [
    {
        code: 'en',
        label: 'English',
        nativeLabel: 'English',
        flag: '🇬🇧',
        locale: 'en-HK',   // BCP-47 for formatting
        dir: 'ltr',
    },
    {
        code: 'zh-Hant',
        label: 'Traditional Chinese',
        nativeLabel: '繁體中文',
        flag: '🇭🇰',
        locale: 'zh-HK',
        dir: 'ltr',
    },
];

const STORAGE_KEY = 'tv_language';

// ---------------------------------------------------------------------------
// Normalise any language tag to one of our two canonical codes.
// Keep identical to core/i18n_views._canonical() on the backend.
// ---------------------------------------------------------------------------
export const normalizeLanguage = (lng) => {
    if (!lng) return 'en';
    const lower = String(lng).toLowerCase().replace('_', '-');
    if (lower.startsWith('zh')) return 'zh-Hant';
    return 'en';
};

// ---------------------------------------------------------------------------
// i18next init.
//
// DO NOT use:
//   • load: 'currentOnly'          ← reduces zh-Hant → zh → misses the
//                                    supportedLngs match → falls back to en
//   • nonExplicitSupportedLngs     ← same failure with script subtags
// Both interact badly with BCP-47 codes that contain a script subtag
// ('zh-Hant') and cause i18next to silently resolve to 'en' even though
// tv_language = 'zh-Hant'. This was the root cause of the "button does
// nothing" bug: i18n.language was 'en' at runtime while localStorage
// still showed 'zh-Hant'.
//
// Instead:
//   • supportedLngs lists every plausible spelling of each code
//   • load: 'all' preserves every resolved language in i18n.languages
//   • resources registered under every alias so a lookup miss is
//     impossible
//   • fallbackLng is an object that cascades zh-Hant → zh-hant → zh → en
// ---------------------------------------------------------------------------
i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en:           { translation: en },
            'zh':         { translation: zhHant },
            'zh-Hant':    { translation: zhHant },
            'zh-hant':    { translation: zhHant },
            'zh-Hant-HK': { translation: zhHant },
            'zh-hant-hk': { translation: zhHant },
            'zh-HK':      { translation: zhHant },
            'zh-hk':      { translation: zhHant },
        },
        fallbackLng: {
            'zh-Hant':    ['zh-hant', 'zh', 'en'],
            'zh-hant':    ['zh-Hant', 'zh', 'en'],
            'zh-Hant-HK': ['zh-Hant', 'zh-hant', 'zh', 'en'],
            'zh-HK':      ['zh-Hant', 'zh-hant', 'zh', 'en'],
            'zh':         ['zh-Hant', 'zh-hant', 'en'],
            default:      ['en'],
        },
        supportedLngs: [
            'en',
            'zh',
            'zh-Hant',
            'zh-hant',
            'zh-Hant-HK',
            'zh-hant-hk',
            'zh-HK',
            'zh-hk',
        ],
        load: 'all',
        nonExplicitSupportedLngs: false,
        lowerCaseLng: false,
        cleanCode: false,
        interpolation: { escapeValue: false },
        detection: {
            order: ['localStorage', 'navigator', 'htmlTag'],
            lookupLocalStorage: STORAGE_KEY,
            caches: ['localStorage'],
            // Force every detected value through our normaliser BEFORE
            // i18next compares against supportedLngs. Without this,
            // navigator.language === 'en-HK' would arrive at i18next
            // untouched and (with the old settings) be reduced to 'en'.
            convertDetectedLanguage: normalizeLanguage,
        },
        react: { useSuspense: false },
        debug: process.env.NODE_ENV !== 'production',
    });

// ---------------------------------------------------------------------------
// Dev-only diagnostics. In production these listeners are not attached.
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== 'production') {
    i18n.on('initialized', () => {
        // eslint-disable-next-line no-console
        console.log(
            '[i18n] initialized. language=%s languages=%o resources=%o',
            i18n.language,
            i18n.languages,
            Object.keys(i18n.store?.data || {}),
        );
        // eslint-disable-next-line no-console
        console.log(
            '[i18n] sample t(nav.dashboard) = %s',
            i18n.t('nav.dashboard'),
        );
    });
    i18n.on('languageChanged', (lng) => {
        // eslint-disable-next-line no-console
        console.log(
            '[i18n] languageChanged → %s, t(nav.dashboard) = %s',
            lng,
            i18n.t('nav.dashboard'),
        );
    });
    i18n.on('failedLoading', (lng, ns, msg) => {
        // eslint-disable-next-line no-console
        console.error('[i18n] failedLoading', lng, ns, msg);
    });
}

// ---------------------------------------------------------------------------
// Public setLanguage — the only entry point components should call.
// ---------------------------------------------------------------------------
export const setLanguage = async (code) => {
    const normalized = normalizeLanguage(code);

    if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log(`🌐 setLanguage: ${i18n.language} → ${normalized}`);
    }

    await i18n.changeLanguage(normalized);

    if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log(
            `🌐 i18n.language is now: ${i18n.language} ` +
            `(t(nav.dashboard) = ${i18n.t('nav.dashboard')})`,
        );
    }

    try {
        localStorage.setItem(STORAGE_KEY, normalized);
        document.documentElement.lang = normalized;
        const meta = SUPPORTED_LANGUAGES.find((l) => l.code === normalized);
        document.documentElement.dir = meta?.dir || 'ltr';
    } catch { /* storage may be unavailable */ }

    try {
        const { default: api } = await import('./services/api');
        await api.post('/i18n/setlang/', { language: normalized });
    } catch { /* best-effort; not critical */ }

    return normalized;
};

export const getCurrentLanguage = () => normalizeLanguage(i18n.language);

export default i18n;