// frontend/src/config/defaults.js
//
// Single source of truth for application-level defaults.
// Override per-deployment via .env:
//   REACT_APP_DEFAULT_TIMEZONE=Asia/Kolkata
//   REACT_APP_DEFAULT_COUNTRY=India
//
// These are only consulted when the user's device locale cannot be
// detected (SSR, privacy mode, or a region not yet in the map).

export const DEFAULTS = {
    timezone:
        process.env.REACT_APP_DEFAULT_TIMEZONE || 'Asia/Hong_Kong',
    country:
        process.env.REACT_APP_DEFAULT_COUNTRY || 'Hong Kong',
};