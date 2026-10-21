// frontend/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { theme } from './theme/tokens';      // single source of truth
import muiTheme from './theme/muiTheme';
import { GlobalStyle } from './styles/global';

import { AuthProvider, useAuth } from './context/AuthContext';
import { RoleProvider, useRole } from './context/RoleContext';

import Layout from './components/Layout';

// Public pages
import Landing from './pages/Landing/Landing';
import GuestOrRegisterGate from './pages/Gate/GuestOrRegisterGate';

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

import { ROLES } from './constants';

// ---- Loading spinner uses the theme (no hardcoded hex) ----
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
// AuthGuard for public-only pages (/login, /register).
//
// If the user is already authenticated, we do NOT want them to see the
// login/register page. But we also don't want to nuke the redirect
// intent they may be carrying (`location.state.from`). Preserving it
// means that if a user came from `/gate?event=X` → `/login`, and they
// were somehow already authenticated, the post-login destination is
// still correct.
// ---------------------------------------------------------------------------
const PublicOnlyRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    const location = useLocation();

    if (loading) return <LoadingSpinner />;

    if (isAuthenticated) {
        // Honour the carried intent if there is one; otherwise dashboard.
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
        // Preserve the current path so we can send the user back here
        // after they log in. This is what makes deep links work.
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

const AppRoutes = () => {
    const { isAuthenticated, loading } = useAuth();
    if (loading) return <LoadingSpinner />;

    return (
        <Routes>
            {/* ============================================
                PUBLIC ROUTES
               ============================================ */}

            {/* Landing page — visible to everyone (logged in or not) */}
            <Route path="/" element={<Landing />} />

            {/* ✅ Guest-or-Register gate.
                Deliberately PUBLIC — the whole point is to be reachable
                by visitors who don't have an account yet. If a logged-in
                user navigates here, the component short-circuits to the
                booking wizard via `navigate(..., { replace: true })`. */}
            <Route path="/gate" element={<GuestOrRegisterGate />} />

            {/* Login & Register — skipped if already authenticated,
                but the redirect intent carried in `location.state.from`
                is preserved. */}
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
            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* ============================================
                PROTECTED APP (under /app/*)
               ============================================ */}
            <Route path="/app" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route index element={<Navigate to="/app/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="events/*" element={<Events />} />

                <Route path="venues/*" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <Venues />
                    </RoleBasedRoute>
                } />

                <Route path="bookings/create" element={<CreateBooking />} />
                <Route path="bookings/:bookingId/tickets" element={<BookingTickets />} />
                <Route path="bookings" element={<Bookings />} />

                <Route path="checkin" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <Checkin />
                    </RoleBasedRoute>
                } />

                <Route path="analytics" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <Analytics />
                    </RoleBasedRoute>
                } />

                <Route path="discounts" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <Discounts />
                    </RoleBasedRoute>
                } />

                <Route path="settings" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <Settings />
                    </RoleBasedRoute>
                } />

                <Route path="profile" element={<Profile />} />

                <Route path="tickets/:ticketId" element={<TicketView />} />
                <Route path="tickets/:ticketId/booking/:bookingId" element={<TicketView />} />

                <Route path="cancellation-policies" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <CancellationPolicies />
                    </RoleBasedRoute>
                } />

                <Route path="users" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <Users />
                    </RoleBasedRoute>
                } />
            </Route>

            {/* ============================================
                FALLBACK — redirect based on auth state
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
                    </AuthProvider>
                </Router>
            </MuiThemeProvider>
        </ThemeProvider>
    );
};

export default App;