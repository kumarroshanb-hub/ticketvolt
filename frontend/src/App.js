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
import { OrgProvider } from './context/OrgContext';           // ✅ NEW
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
import Organizations from './pages/Organizations';            // ✅ NEW

import { ROLES } from './constants';

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

const RoleBasedRoute = ({ children, allowedRoles }) => {
    const { user, loading } = useAuth();
    const { role } = useRole();
    if (loading) return <LoadingSpinner />;
    if (!user) return <Navigate to="/login" replace />;
    if (!allowedRoles || allowedRoles.includes(role)) return children;
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
                element={
                    <PublicOnlyRoute>
                        <Login />
                    </PublicOnlyRoute>
                }
            />
            <Route
                path="/register"
                element={
                    <PublicOnlyRoute>
                        <Register />
                    </PublicOnlyRoute>
                }
            />

            {/* Password Reset Routes (Public) */}
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />

            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* ============================================
                APP SHELL (under /app/*)
               ============================================ */}
            <Route path="/app" element={<Layout />}>
                <Route index element={<Navigate to="/app/dashboard" replace />} />

                {/* ✅ NEW: Organizations (tenant bootstrap) — visible to
                    every logged-in user, since any user may create one
                    and become its owner. */}
                <Route
                    path="organizations"
                    element={
                        <ProtectedRoute>
                            <Organizations />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="bookings/create"
                    element={
                        <GuestAllowedRoute>
                            <CreateBooking />
                        </GuestAllowedRoute>
                    }
                />

                <Route
                    path="dashboard"
                    element={
                        <ProtectedRoute>
                            <Dashboard />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="events/*"
                    element={
                        <ProtectedRoute>
                            <Events />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="venues/*"
                    element={
                        <RoleBasedRoute
                            allowedRoles={[ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN]}
                        >
                            <Venues />
                        </RoleBasedRoute>
                    }
                />

                <Route
                    path="bookings/:bookingId/tickets"
                    element={
                        <ProtectedRoute>
                            <BookingTickets />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="bookings"
                    element={
                        <ProtectedRoute>
                            <Bookings />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="checkin"
                    element={
                        <RoleBasedRoute
                            allowedRoles={[ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN]}
                        >
                            <Checkin />
                        </RoleBasedRoute>
                    }
                />

                <Route
                    path="analytics"
                    element={
                        <RoleBasedRoute
                            allowedRoles={[ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN]}
                        >
                            <Analytics />
                        </RoleBasedRoute>
                    }
                />

                <Route
                    path="discounts"
                    element={
                        <RoleBasedRoute
                            allowedRoles={[ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN]}
                        >
                            <Discounts />
                        </RoleBasedRoute>
                    }
                />

                <Route
                    path="settings"
                    element={
                        <RoleBasedRoute
                            allowedRoles={[ROLES.ADMIN, ROLES.SUPER_ADMIN]}
                        >
                            <Settings />
                        </RoleBasedRoute>
                    }
                />

                <Route
                    path="profile"
                    element={
                        <ProtectedRoute>
                            <Profile />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="tickets/:ticketId"
                    element={
                        <ProtectedRoute>
                            <TicketView />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="tickets/:ticketId/booking/:bookingId"
                    element={
                        <ProtectedRoute>
                            <TicketView />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="cancellation-policies"
                    element={
                        <RoleBasedRoute
                            allowedRoles={[ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN]}
                        >
                            <CancellationPolicies />
                        </RoleBasedRoute>
                    }
                />

                <Route
                    path="users"
                    element={
                        <RoleBasedRoute
                            allowedRoles={[ROLES.ADMIN, ROLES.SUPER_ADMIN]}
                        >
                            <Users />
                        </RoleBasedRoute>
                    }
                />

                <Route
                    path="active-sessions"
                    element={
                        <RoleBasedRoute
                            allowedRoles={[ROLES.SUPER_ADMIN]}
                        >
                            <ActiveSessions />
                        </RoleBasedRoute>
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
                        {/* ✅ NEW: OrgProvider sits inside AuthProvider
                            (needs the token) and outside SettingsProvider
                            (settings don't depend on orgs). */}
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