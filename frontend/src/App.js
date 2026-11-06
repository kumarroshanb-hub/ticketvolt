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
import Venues from './pages/Venues/index';
import Bookings from './pages/Bookings/Bookings';
import BookingTickets from './pages/Bookings/BookingTickets';
import CreateBooking from './pages/Bookings/CreateBooking';
import Checkin from './pages/Checkin/Checkin';
import Analytics from './pages/Analytics/Analytics';
import Discounts from './pages/Discounts/Discounts';
import Settings from './pages/Settings/Settings';
import Login from './pages/Login/Login';
import TicketView from './pages/Tickets/TicketView';
import Unauthorized from './pages/Unauthorized/Unauthorized';
import Register from './pages/Register/Register';
import Users from './pages/Users/Users';
import Profile from './pages/Profile';
import CancellationPolicies from './pages/CancellationPolicies';
import ActiveSessions from './pages/ActiveSessions';
import Organizations from './pages/Organizations';
import MagicLinkVerify from './pages/Auth/MagicLinkVerify';
import TeamMembers from './pages/Organizations/TeamMembers';
import VenueLayoutEditor from './pages/Venues/VenueLayoutEditor';
import Membership from './pages/Membership/Membership';
import { ManagePlans, ReviewOffline } from './pages/Membership';

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
// PLATFORM-level gating only. allowedRoles must contain PLATFORM_ROLES values
// (e.g. SUPER_ADMIN). Never pass membership roles here — use OrgRoleRoute.
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
const OrgRoleRoute = ({ children, minOrgRole }) => {
    const { user, loading } = useAuth();
    const { isSuperAdmin, hasOrgRole } = useRole();
    const { hasNoMemberships } = useOrg();

    if (loading) return <LoadingSpinner />;
    if (!user) return <Navigate to="/login" replace />;
    if (isSuperAdmin) return children;
    if (hasNoMemberships) {
        return <Navigate to="/app/organizations" replace />;
    }
    if (hasOrgRole(minOrgRole)) return children;
    return <Navigate to="/app/unauthorized" replace />;
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

            <Route
                path="/login"
                element={<PublicOnlyRoute><Login /></PublicOnlyRoute>}
            />
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
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><Events /></OrgRoleRoute>}
                />
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
                    path="cancellation-policies"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><CancellationPolicies /></OrgRoleRoute>}
                />
                <Route
                    path="users"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><Users /></OrgRoleRoute>}
                />
                <Route
                    path="membership/manage"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><ManagePlans /></OrgRoleRoute>}
                />
                <Route
                    path="membership/review-offline"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}><ReviewOffline /></OrgRoleRoute>}
                />

                {/* Scanner requires staff or higher in current org. */}
                <Route
                    path="checkin"
                    element={<OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.STAFF}><Checkin /></OrgRoleRoute>}
                />

                {/* Platform-only routes. */}
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

                {/* Venue Layout Editor — inside the shell so Layout (nav/auth) applies. */}
                <Route
                    path="venues/:venueId/layout"
                    element={
                        <OrgRoleRoute minOrgRole={MEMBERSHIP_ROLES.ADMIN}>
                            <VenueLayoutEditor />
                        </OrgRoleRoute>
                    }
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
                        </OrgProvider>
                    </AuthProvider>
                </Router>
            </MuiThemeProvider>
        </ThemeProvider>
    );
};

export default App;