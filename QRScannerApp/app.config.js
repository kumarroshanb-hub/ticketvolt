// QRScannerApp/app.config.js
//
// Extends app.json with dynamic values read at build time.
// Expo automatically merges this with app.json.
//
// SECURITY:
//   • Demo credentials are read from process.env at BUILD TIME only.
//   • In production EAS builds SHOW_DEMO_CREDS is unset → showDemoCreds is
//     false → LoginScreen never renders the demo block.
//   • No production password is ever baked into the shipped JS bundle.

import 'dotenv/config';

const IS_PRODUCTION_BUILD =
    process.env.EAS_BUILD_PROFILE === 'production' ||
    process.env.NODE_ENV === 'production';

const showDemoCreds = process.env.SHOW_DEMO_CREDS === 'true';

// ✅ Fail the production build if someone accidentally enables demo creds.
//    This prevents a compromised bundle from ever shipping.
if (IS_PRODUCTION_BUILD && showDemoCreds) {
    throw new Error(
        '🚨 SECURITY: SHOW_DEMO_CREDS must NOT be "true" in production builds.'
    );
}

export default ({ config }) => ({
    ...config,
    extra: {
        ...(config.extra ?? {}),
        // -----------------------------------------------------------------
        // Demo credentials — populated ONLY in local dev builds.
        // -----------------------------------------------------------------
        showDemoCreds: showDemoCreds && !IS_PRODUCTION_BUILD,
        demoAdminEmail: process.env.DEMO_ADMIN_EMAIL,
        demoAdminPassword: process.env.DEMO_ADMIN_PASSWORD,
        demoOrganizerEmail: process.env.DEMO_ORGANIZER_EMAIL,
        demoOrganizerPassword: process.env.DEMO_ORGANIZER_PASSWORD,
        demoUserEmail: process.env.DEMO_USER_EMAIL,
        demoUserPassword: process.env.DEMO_USER_PASSWORD,
    },
});