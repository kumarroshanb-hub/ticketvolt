// frontend/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { theme } from './theme';
import muiTheme from './theme/muiTheme';
import { GlobalStyle } from './styles/global';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RoleProvider, useRole } from './context/RoleContext';
import Layout from './components/Layout';
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
import Profile from './pages/Profile'; // ✅ barrel import (Profile/index.js)
//import Organizers from './pages/Organizer/Organizers';
import { ROLES } from './constants';

const LoadingSpinner = () => (
    <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: '#0A0B1A',
        color: 'white',
        fontSize: '18px'
    }}>
        <div style={{ textAlign: 'center' }}>
            <div style={{ 
                width: '40px', 
                height: '40px', 
                border: '3px solid rgba(255,255,255,0.1)',
                borderTop: '3px solid #5B5FEF',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px'
            }} />
            Loading...
        </div>
    </div>
);

const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return <LoadingSpinner />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return children;
};

// ✅ Role-Based Route Component
const RoleBasedRoute = ({ children, allowedRoles }) => {
    const { user } = useAuth();
    const { role } = useRole();

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // If no roles specified, allow all authenticated users
    if (!allowedRoles || allowedRoles.includes(role)) {
        return children;
    }

    return <Navigate to="/unauthorized" replace />;
};

const AppRoutes = () => {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return <LoadingSpinner />;
    }

    return (
        <Routes>
            {/* Public Routes */}
            <Route path="/login" element={
                isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
            } />
            <Route path="/register" element={
                isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />
            } />
            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* Protected Routes with Layout */}
            <Route path="/" element={
                <ProtectedRoute>
                    <Layout />
                </ProtectedRoute>
            }>
                <Route index element={<Navigate to="/dashboard" replace />} />
                
                {/* ============================================
                    DASHBOARD - Everyone can access
                ============================================ */}
                <Route path="dashboard" element={<Dashboard />} />
                
                {/* ============================================
                    EVENTS - Everyone can access
                    Uses Events/index which handles list/create/edit internally
                ============================================ */}
                <Route path="events/*" element={<Events />} />
                
                {/* ============================================
                    VENUES - Organizers and above
                ============================================ */}
                <Route path="venues/*" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <Venues />
                    </RoleBasedRoute>
                } />
                
                {/* ============================================
                    BOOKINGS - ALL AUTHENTICATED USERS
                    IMPORTANT: Specific routes FIRST
                ============================================ */}
                <Route path="bookings/create" element={<CreateBooking />} />
                <Route path="bookings/:bookingId/tickets" element={<BookingTickets />} />
                <Route path="bookings" element={<Bookings />} />
                
                {/* ============================================
                    CHECKIN / QR SCANNER - Admin and above
                ============================================ */}
                <Route path="checkin" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <Checkin />
                    </RoleBasedRoute>
                } />
                
                {/* ============================================
                    ANALYTICS - Organizers and above
                ============================================ */}
                <Route path="analytics" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <Analytics />
                    </RoleBasedRoute>
                } />
                
                {/* ============================================
                    DISCOUNTS - Organizers and above
                ============================================ */}
                <Route path="discounts" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <Discounts />
                    </RoleBasedRoute>
                } />
                
                {/* ============================================
                    SETTINGS - Admin and above
                ============================================ */}
                <Route path="settings" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <Settings />
                    </RoleBasedRoute>
                } />
                
                {/* ============================================
                    PROFILE - Everyone can access (own profile)
                ============================================ */}
                <Route path="profile" element={<Profile />} />
                
                {/* ============================================
                    TICKET VIEW - Everyone can access
                ============================================ */}
                <Route path="tickets/:ticketId" element={<TicketView />} />
                <Route path="tickets/:ticketId/booking/:bookingId" element={<TicketView />} />
                
                {/* ============================================
                    USERS - Admin and above
                ============================================ */}
                <Route path="users" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <Users />
                    </RoleBasedRoute>
                } />
                
                {/* ❌ REMOVE ORGANIZERS ROUTE 
                <Route path="organizers" element={
                    <RoleBasedRoute allowedRoles={[ROLES.ADMIN, ROLES.SUPER_ADMIN]}>
                        <Organizers />
                    </RoleBasedRoute>
                } />
                */}
            </Route>
            
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
};

// ============================================
// Detect mobile for toast positioning
// ============================================
const isMobileViewport = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 768px)').matches;
};

const App = () => {
    // Determine toast position once on mount
    const [toastPosition, setToastPosition] = React.useState(
        isMobileViewport() ? 'top-center' : 'top-right'
    );

    // Update on resize (handles rotate + window resize)
    React.useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');
        const handleChange = (e) => {
            setToastPosition(e.matches ? 'top-center' : 'top-right');
        };
        // Modern browsers
        if (mq.addEventListener) {
            mq.addEventListener('change', handleChange);
            return () => mq.removeEventListener('change', handleChange);
        }
        // Safari < 14
        mq.addListener(handleChange);
        return () => mq.removeListener(handleChange);
    }, []);

    return (
        <ThemeProvider theme={theme}>
            {/* MUI ThemeProvider must be inside styled-components ThemeProvider
                so that MUI components can still read styled-components theme
                via the useTheme hook if needed, while MUI gets its own theme. */}
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