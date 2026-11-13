// frontend/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { theme } from './theme/tokens';
import muiTheme from './theme/muiTheme';
import { GlobalStyle } from './styles/global';

import { AuthProvider, useAuth } from './context/AuthContext';
import { OrgProvider, useOrg } from './context/OrgContext';
import { BrandingProvider } from './context/BrandingContext';
import { FeatureProvider } from './context/FeatureContext';
import { SettingsProvider } from './context/SettingsContext';
import { RoleProvider, useRole } from './context/RoleContext';

import Layout from './components/Layout';

// Public pages
import Landing from './pages/Landing/Landing';
import GuestOrRegisterGate from './pages/Gate/GuestOrRegisterGate';
import ForgotPassword from './pages/ForgotPassword/ForgotPassword';
import ResetPassword from './pages/ResetPassword/ResetPassword';

// Authenticated app pages
import Dashboard from './pages/Dashboard/Dashboard';
import Events from './pages/Events/index';
import PublicEvents from './pages/Events/PublicEvents';
import Venues from './pages/Venues/index';
import CreateVenue from './pages/Venues/Create';   // ✅ NEW import
import Bookings from './pages/Bookings/Bookings';
import BookingTickets from './pages/Bookings/BookingTickets';
import CreateBooking from './pages/Bookings/CreateBooking';
import Checkin from './pages/Checkin/Checkin';
import Analytics from './pages/Analytics/Analytics';
import Reports from './pages/Reports';
import PaymentSettings from './pages/PaymentSettings';
import Payouts from './pages/Payouts';
import AuditLogs from './pages/AuditLogs';
import Features from './pages/Features';
import Security from './pages/Security';
import AcceptTransfer from './pages/Transfers/AcceptTransfer';
import Billing from './pages/Billing/Billing';
import Discounts from './pages/Discounts/Discounts';
import Settings from './pages/Settings/Settings';
import Login from './pages/Login/Login';
import TicketView from './pages/Tickets/TicketView';
import Unauthorized from './pages/Unauthorized/Unauthorized';
import Register from './pages/Register/Register';
import PublicEventPage from './pages/Events/Public/PublicEventPage';
import Users from './pages/Users/Users';
import Profile from './pages/Profile';
import CancellationPolicies from './pages/CancellationPolicies';
import ActiveSessions from './pages/ActiveSessions';
import Organizations from './pages/Organizations';
import MagicLinkVerify from './pages/Auth/MagicLinkVerify';
import GoogleCallback from './pages/Auth/GoogleCallback';
import EventFeedback from './pages/Feedback/EventFeedback';
import PublicOrganization from './pages/PublicOrganization';
import TeamMembers from './pages/Organizations/TeamMembers';
import VenueLayoutEditor from './pages/Venues/VenueLayoutEditor';
import Membership from './pages/Membership/Membership';
import { BulkUpload, ManagePlans, ReviewOffline } from './pages/Membership';

import {
    PLATFORM_ROLES,
    MEMBERSHIP_ROLES,
} from './constants';

// ---- Loading spinner ----
const LoadingSpinner = () => {
    const C = theme.colors;
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            background: C.bgDark,
            color: C.textInverse,
            fontSize: '18px',
            fontFamily: theme.fonts.family,
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    border: `3px solid ${C.bgDarkBorder}`,
                    borderTop: `3px solid ${C.secondary}`,
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 16px',
                }} />
                Loading...
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Route wrappers
// ---------------------------------------------------------------------------

const PublicOnlyRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    const location = useLocation();

    if (loading) return <LoadingSpinner />;

    if (isAuthenticated) {
        const token =
            localStorage.getItem('token') ||
            sessionStorage.getItem('token');
        if (!token) {
            return children;
        }
        const target = location.state?.from || '/app/dashboard';
        return <Navigate to={target} replace />;
    }

    return children;
};

const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    const location = useLocation();
    if (loading) return <LoadingSpinner />;
    if (!isAuthenticated) {
        return (
            <Navigate
                to="/login"
                replace
                state={{ from: location.pathname + location.search }}
            />
        );
    }
    return children;
};

// ---- RoleBasedRoute ----
// PLATFORM-level gating only. allowedRoles must contain PLATFORM_ROLES values.
// As of the removal of PLATFORM_ROLES.STAFF, the only valid value is
// PLATFORM_ROLES.SUPER_ADMIN. Never pass membership roles here — use
// OrgRoleRoute for org-scoped gating.
//
// NOTE: Do NOT pass PLATFORM_ROLES.STAFF — it no longer exists (undefined),
// which would cause allowedRoles.includes(platformRole) to silently fail and
// the route to never match.
const RoleBasedRoute = ({ children, allowedRoles }) => {
    const { user, loading } = useAuth();
    const { platformRole } = useRole();
    if (loading) return <LoadingSpinner />;
    if (!user) return <Navigate to="/login" replace />;
    if (!allowedRoles || allowedRoles.includes(platformRole)) return children;
    return <Navigate to="/app/unauthorized" replace />;
};

// ---- OrgRoleRoute ----
// Gates a route on the user's MEMBERSHIP role in the CURRENT organization.
// Super admins bypass. A user with no memberships is redirected to
// /app/organizations so they can create or join one.
const OrgRoleRoute = ({ children, minOrgRole, orgRoles }) => {
    const { user, loading } = useAuth();
    const { isSuperAdmin, hasOrgRole, membershipRole } = useRole();
    const { hasNoMemberships } = useOrg();

    if (loading) return <LoadingSpinner />;
    if (!user) return <Navigate to="/login" replace />;
    if (isSuperAdmin) return children;
    if (hasNoMemberships) {
        return <Navigate to="/app/organizations" replace />;
    }
    if (orgRoles?.includes(membershipRole)) return children;
    if (!orgRoles && hasOrgRole(minOrgRole)) return children;
    return <Navigate to="/app/unauthorized" replace />;
};

const EventsEntry = () => {
    const { hasNoMemberships, loading: orgLoading } = useOrg();
    const { isSuperAdmin } = useRole();

    if (orgLoading) return <LoadingSpinner />;

    // Customers without an organisation membership get the public
    // browse page. Org members/managers get the workspace Events module.
    if (hasNoMemberships && !isSuperAdmin) {
        return <PublicEvents />;
    }
    return (
        <OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.MEMBER}>
            <Events />
        </OrgRoleRoute>
    );
};

const GuestAllowedRoute = ({ children }) => {
    return children;
};

// ---------------------------------------------------------------------------
// Route tree
// ---------------------------------------------------------------------------

const AppRoutes = () => {
    const { isAuthenticated, loading } = useAuth();
    if (loading) return <LoadingSpinner />;

    return (
        <Routes>
            {/* ============================================
                PUBLIC ROUTES
               ============================================ */}

            <Route path="/" element={<Landing />} />
            <Route path="/gate" element={<GuestOrRegisterGate />} />
            <Route path="/events/:id" element={<PublicEventPage />} />

            <Route
                path="/login"
                element={<PublicOnlyRoute><Login /></PublicOnlyRoute>}
            />
            <Route path="/auth/google/callback" element={<GoogleCallback />} />
            <Route path="/feedback/:token" element={<EventFeedback />} />
            <Route path="/org/:slug" element={<PublicOrganization />} />
            <Route
                path="/register"
                element={<PublicOnlyRoute><Register /></PublicOnlyRoute>}
            />

            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
            <Route path="/auth/verify" element={<MagicLinkVerify />} />
            <Route path="/invite/accept" element={<MagicLinkVerify />} />
            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* ============================================
                APP SHELL (under /app/*)
               ============================================ */}
            <Route path="/app" element={<Layout />}>
                <Route index element={<Navigate to="/app/dashboard" replace />} />

                {/* Organizations — every authenticated user can see this. */}
                <Route
                    path="organizations"
                    element={<ProtectedRoute><Organizations /></ProtectedRoute>}
                />

                <Route
                    path="organizations/:orgId/team"
                    element={
                        <OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}>
                            <TeamMembers />
                        </OrgRoleRoute>
                    }
                />

                {/* Bookings — everyone sees their own. */}
                <Route
                    path="bookings"
                    element={<ProtectedRoute><Bookings /></ProtectedRoute>}
                />
                <Route
                    path="bookings/create"
                    element={<GuestAllowedRoute><CreateBooking /></GuestAllowedRoute>}
                />

                {/* Booking tickets view (nested under bookings, kept for parity) */}
                <Route
                    path="bookings/:bookingId/tickets"
                    element={<ProtectedRoute><BookingTickets /></ProtectedRoute>}
                />

                {/* Org-admin pages: owner/admin membership in current org. */}
                <Route
                    path="events/*"
                    element={<ProtectedRoute><EventsEntry /></ProtectedRoute>}
                />

                {/* ============================================
                    VENUES
                    ⚠️ ORDER MATTERS. The literal `/new` route MUST come
                    before the `:venueId` route, otherwise `"new"` is
                    captured as a venue id and `Create.js` fires
                    `GET /api/venues/new/` → 404 (confirmed in your logs).
                   ============================================ */}
                <Route
                    path="venues"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><Venues /></OrgRoleRoute>}
                />
                <Route
                    path="venues/new"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><CreateVenue /></OrgRoleRoute>}
                />
                <Route
                    path="venues/:venueId/layout"
                    element={
                        <OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}>
                            <VenueLayoutEditor />
                        </OrgRoleRoute>
                    }
                />
                {/* Catch-all for nested venue pages handled by the Venues
                    index. Kept after /venues/new and /venues/:venueId/layout
                    so both specific routes win first. */}
                <Route
                    path="venues/*"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><Venues /></OrgRoleRoute>}
                />

                <Route
                    path="discounts"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><Discounts /></OrgRoleRoute>}
                />
                <Route
                    path="analytics"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><Analytics /></OrgRoleRoute>}
                />
                <Route
                    path="reports"
                    element={<OrgRoleRoute orgRoles={[MEMBERSHIP_ROLES.OWNER, MEMBERSHIP_ROLES.ADMIN, MEMBERSHIP_ROLES.FINANCE]}><Reports /></OrgRoleRoute>}
                />
                <Route
                    path="payment-settings"
                    element={<OrgRoleRoute orgRoles={[MEMBERSHIP_ROLES.OWNER, MEMBERSHIP_ROLES.ADMIN, MEMBERSHIP_ROLES.FINANCE]}><PaymentSettings /></OrgRoleRoute>}
                />
                <Route
                    path="payouts"
                    element={<OrgRoleRoute orgRoles={[MEMBERSHIP_ROLES.OWNER, MEMBERSHIP_ROLES.ADMIN, MEMBERSHIP_ROLES.FINANCE]}><Payouts /></OrgRoleRoute>}
                />
                <Route
                    path="audit-logs"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><AuditLogs /></OrgRoleRoute>}
                />
                <Route
                    path="features"
                    element={<RoleBasedRoute allowedRoles={[PLATFORM_ROLES.SUPER_ADMIN]}><Features /></RoleBasedRoute>}
                />
                <Route
                    path="security"
                    element={<RoleBasedRoute allowedRoles={[PLATFORM_ROLES.SUPER_ADMIN]}><Security /></RoleBasedRoute>}
                />
                <Route
                    path="transfers/:token"
                    element={<ProtectedRoute><AcceptTransfer /></ProtectedRoute>}
                />
                <Route
                    path="billing"
                    element={<OrgRoleRoute orgRoles={[MEMBERSHIP_ROLES.OWNER, MEMBERSHIP_ROLES.ADMIN, MEMBERSHIP_ROLES.FINANCE]}><Billing /></OrgRoleRoute>}
                />
                <Route
                    path="cancellation-policies"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><CancellationPolicies /></OrgRoleRoute>}
                />
                {/* Platform-wide user administration is SYSTEM-level only.
                    Tenant admins manage their own team through
                    Organization → Team. */}
                <Route
                    path="users"
                    element={
                        <RoleBasedRoute allowedRoles={[PLATFORM_ROLES.SUPER_ADMIN]}>
                            <Users />
                        </RoleBasedRoute>
                    }
                />
                <Route
                    path="membership/manage"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><ManagePlans /></OrgRoleRoute>}
                />
                <Route
                    path="membership/review-offline"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><ReviewOffline /></OrgRoleRoute>}
                />
                <Route
                    path="membership/bulk-upload"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.STAFF}><BulkUpload /></OrgRoleRoute>}
                />

                {/* Scanner requires staff or higher in current org. */}
                <Route
                    path="checkin"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.STAFF}><Checkin /></OrgRoleRoute>}
                />

                {/* Platform-only routes.
                    Only PLATFORM_ROLES.SUPER_ADMIN is valid here.
                    (PLATFORM_ROLES.STAFF has been removed.) */}
                <Route
                    path="active-sessions"
                    element={
                        <RoleBasedRoute allowedRoles={[PLATFORM_ROLES.SUPER_ADMIN]}>
                            <ActiveSessions />
                        </RoleBasedRoute>
                    }
                />

                {/* Any authenticated user. */}
                <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="membership" element={<ProtectedRoute><Membership /></ProtectedRoute>} />
                <Route path="tickets/:ticketId" element={<ProtectedRoute><TicketView /></ProtectedRoute>} />
                <Route
                    path="tickets/:ticketId/booking/:bookingId"
                    element={<ProtectedRoute><TicketView /></ProtectedRoute>}
                />
            </Route>

            {/* ============================================
                FALLBACK — must stay LAST
               ============================================ */}
            <Route
                path="*"
                element={
                    isAuthenticated
                        ? <Navigate to="/app/dashboard" replace />
                        : <Navigate to="/" replace />
                }
            />
        </Routes>
    );
};

const isMobileViewport = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 768px)').matches;
};

const App = () => {
    const [toastPosition, setToastPosition] = React.useState(
        isMobileViewport() ? 'top-center' : 'top-right'
    );

    React.useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');
        const handleChange = (e) => {
            setToastPosition(e.matches ? 'top-center' : 'top-right');
        };
        if (mq.addEventListener) {
            mq.addEventListener('change', handleChange);
            return () => mq.removeEventListener('change', handleChange);
        }
        mq.addListener(handleChange);
        return () => mq.removeListener(handleChange);
    }, []);

    return (
        <ThemeProvider theme={theme}>
            <MuiThemeProvider theme={muiTheme}>
                <CssBaseline />
                <GlobalStyle />
                <Router>
                    <AuthProvider>
                        <OrgProvider>
                            <BrandingProvider>
                            <FeatureProvider>
                            <SettingsProvider>
                                <RoleProvider>
                                    <ToastContainer
                                        position={toastPosition}
                                        autoClose={5000}
                                        hideProgressBar={false}
                                        newestOnTop={false}
                                        closeOnClick
                                        rtl={false}
                                        pauseOnFocusLoss
                                        draggable
                                        pauseOnHover
                                        theme="dark"
                                        style={{
                                            fontSize: toastPosition === 'top-center' ? '0.875rem' : '1rem',
                                            width: toastPosition === 'top-center' ? 'calc(100% - 32px)' : 'auto',
                                            maxWidth: toastPosition === 'top-center' ? '420px' : 'none',
                                        }}
                                    />
                                    <AppRoutes />
                                </RoleProvider>
                            </SettingsProvider>
                            </FeatureProvider>
                            </BrandingProvider>
                        </OrgProvider>
                    </AuthProvider>
                </Router>
            </MuiThemeProvider>
        </ThemeProvider>
    );
};

export default App;