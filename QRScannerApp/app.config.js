// QRScannerApp/app.config.js
//
// Extends app.json with dynamic values read at build time.
// Expo automatically merges this with app.json — you don't need to
// duplicate any of the static config here.
//
// SECURITY:
//   • Demo credentials are read from process.env at BUILD TIME only.
//   • In production EAS builds SHOW_DEMO_CREDS is unset → showDemoCreds is
//     false → LoginScreen never renders the demo block.
//   • No production password is ever baked into the shipped JS bundle.

import 'dotenv/config';

export default ({ config }) => ({
    ...config,
    extra: {
        ...(config.extra ?? {}),
        // -----------------------------------------------------------------
        // Demo credentials — populated ONLY in local dev builds.
        // -----------------------------------------------------------------
        showDemoCreds: process.env.SHOW_DEMO_CREDS === 'true',
        demoAdminEmail: process.env.DEMO_ADMIN_EMAIL,
        demoAdminPassword: process.env.DEMO_ADMIN_PASSWORD,
        demoOrganizerEmail: process.env.DEMO_ORGANIZER_EMAIL,
        demoOrganizerPassword: process.env.DEMO_ORGANIZER_PASSWORD,
        demoUserEmail: process.env.DEMO_USER_EMAIL,
        demoUserPassword: process.env.DEMO_USER_PASSWORD,
    },
});