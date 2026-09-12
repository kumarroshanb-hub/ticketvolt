// frontend/src/components/RoleBasedRoute.js
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/RoleContext';

const RoleBasedRoute = ({ children, allowedRoles }) => {
    const { isAuthenticated, loading } = useAuth();
    const { role } = useRole();

    if (loading) return null;
    if (!isAuthenticated) return <Navigate to="/login" replace />;

    // If allowedRoles is not specified, allow all authenticated users
    if (!allowedRoles || allowedRoles.includes(role)) {
        return children;
    }

    return <Navigate to="/unauthorized" replace />;
};

export default RoleBasedRoute;