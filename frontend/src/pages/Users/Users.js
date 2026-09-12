// frontend/src/pages/Users/Users.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useMediaQuery, useTheme } from '@mui/material';
import { toast } from 'react-toastify';
import {
  Search,
  Add,
  Edit,
  Delete,
  MoreVert,
  Person,
  PersonAdd,
  Block,
  CheckCircle,
  Email,
  Phone,
  LocationOn,
  CalendarToday,
  AdminPanelSettings,
  Storefront,
  SupervisorAccount,
  Group,
  Refresh,
  LockOpen,
  Visibility,
  Close,
  Save,
  Cancel,
  FilterList,
} from '@mui/icons-material';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../constants';

// ============================================
// STYLED COMPONENTS
// ============================================

const PageContainer = styled.div`
    padding: 24px;
    max-width: 100%;

    @media (max-width: 900px) {
        padding: 16px;
    }
`;

const PageHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 16px;
`;

const PageTitle = styled.h1`
    font-size: 24px;
    font-weight: 700;
    color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    margin: 0;
`;

const PageSubtitle = styled.p`
    font-size: 14px;
    color: ${props => props.theme?.colors?.textSecondary || '#64748b'};
    margin: 4px 0 0;
`;

const HeaderActions = styled.div`
    display: flex;
    gap: 12px;
    align-items: center;

    @media (max-width: 600px) {
        width: 100%;

        button {
            flex: 1;
            justify-content: center;
        }
    }
`;

// Stats Cards
const StatsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;

    @media (max-width: 600px) {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
    }
`;

const StatCard = styled.div`
    background: ${props => props.theme?.colors?.bgCard || '#ffffff'};
    border-radius: 12px;
    padding: 20px;
    border: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    @media (max-width: 600px) {
        padding: 14px;
    }
`;

const StatIcon = styled.div`
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    background: ${props => props.bg || 'rgba(79, 70, 229, 0.1)'};
    color: ${props => props.color || '#4f46e5'};

    @media (max-width: 600px) {
        width: 34px;
        height: 34px;
        margin-bottom: 8px;
    }
`;

const StatValue = styled.h3`
    font-size: 28px;
    font-weight: 700;
    color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    margin: 0;

    @media (max-width: 600px) {
        font-size: 22px;
    }
`;

const StatLabel = styled.p`
    font-size: 12px;
    color: ${props => props.theme?.colors?.textSecondary || '#64748b'};
    margin: 4px 0 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;

    @media (max-width: 600px) {
        font-size: 10px;
    }
`;

// Filter Card
const FilterCard = styled.div`
    background: ${props => props.theme?.colors?.bgCard || '#ffffff'};
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 24px;
    border: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};

    @media (max-width: 600px) {
        padding: 14px;
    }
`;

const FilterGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    align-items: center;

    @media (max-width: 600px) {
        grid-template-columns: 1fr;
        gap: 10px;
    }
`;

const SearchInput = styled.input`
    width: 100%;
    padding: 10px 14px 10px 40px;
    border: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    border-radius: 8px;
    font-size: 16px;
    color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    background: ${props => props.theme?.colors?.bgSecondary || '#f8fafc'};
    outline: none;
    transition: all 0.2s ease;
    min-height: 44px;
    box-sizing: border-box;

    &:focus {
        border-color: #4f46e5;
        box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
    }

    &::placeholder {
        color: #94a3b8;
    }
`;

const SearchWrapper = styled.div`
    position: relative;

    .search-icon {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        color: #94a3b8;
    }
`;

const Select = styled.select`
    width: 100%;
    padding: 10px 14px;
    border: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    border-radius: 8px;
    font-size: 16px;
    color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    background: ${props => props.theme?.colors?.bgSecondary || '#f8fafc'};
    outline: none;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 44px;
    box-sizing: border-box;

    &:focus {
        border-color: #4f46e5;
        box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
    }
`;

// Table Styles
const TableContainer = styled.div`
    background: ${props => props.theme?.colors?.bgCard || '#ffffff'};
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
`;

const TableHead = styled.thead`
    background: ${props => props.theme?.colors?.bgSecondary || '#f8fafc'};
    border-bottom: 2px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
`;

const TableHeaderCell = styled.th`
    padding: 12px 16px;
    text-align: ${props => props.align || 'left'};
    font-size: 12px;
    font-weight: 600;
    color: ${props => props.theme?.colors?.textSecondary || '#64748b'};
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
`;

const TableBody = styled.tbody`
    background: ${props => props.theme?.colors?.bgCard || '#ffffff'};
`;

const TableRow = styled.tr`
    border-bottom: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    cursor: pointer;
    transition: background 0.2s ease;

    &:hover {
        background: ${props => props.theme?.colors?.bgHover || '#f8fafc'};
    }

    &:last-child {
        border-bottom: none;
    }
`;

const TableCell = styled.td`
    padding: 12px 16px;
    font-size: 14px;
    color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    vertical-align: middle;
`;

// Mobile User Card (Phase 3)
const MobileUserCard = styled.div`
    background: ${props => props.theme?.colors?.bgCard || '#ffffff'};
    border: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:active {
        transform: scale(0.99);
        background: ${props => props.theme?.colors?.bgHover || '#f8fafc'};
    }

    &:last-child {
        margin-bottom: 0;
    }
`;

const MobileUserHeader = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
`;

const MobileUserBody = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px dashed ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    margin-bottom: 12px;

    .field-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 600;
        color: #94a3b8;
        display: block;
        margin-bottom: 2px;
    }

    .field-value {
        font-size: 13px;
        color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
        word-break: break-word;
    }

    .full-width {
        grid-column: 1 / -1;
    }
`;

const MobileUserActions = styled.div`
    display: flex;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid #f1f5f9;

    button {
        flex: 1;
        justify-content: center;
    }
`;

// User Cell
const UserCell = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const UserAvatar = styled.div`
    width: 40px;
    height: 40px;
    min-width: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    color: white;
    background: ${props => props.bg || '#4f46e5'};
`;

const UserName = styled.div`
    font-weight: 600;
    font-size: 14px;
    color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const UserUsername = styled.div`
    font-size: 12px;
    color: ${props => props.theme?.colors?.textSecondary || '#64748b'};
`;

// Badges
const Badge = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;

    &.active {
        background: #dcfce7;
        color: #16a34a;
    }

    &.inactive {
        background: #fee2e2;
        color: #dc2626;
    }
`;

const RoleBadge = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;

    &.super_admin {
        background: #dcfce7;
        color: #16a34a;
    }

    &.admin {
        background: #dbeafe;
        color: #2563eb;
    }

    &.organizer {
        background: #fef3c7;
        color: #d97706;
    }

    &.user {
        background: #f1f5f9;
        color: #64748b;
    }
`;

const ActionButton = styled.button`
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: ${props => props.theme?.colors?.textSecondary || '#64748b'};
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;

    &:hover {
        background: rgba(79, 70, 229, 0.1);
        color: #4f46e5;
    }

    &.danger:hover {
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
    }
`;

// Pagination
const PaginationContainer = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-top: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    flex-wrap: wrap;
    gap: 12px;

    @media (max-width: 600px) {
        flex-direction: column;
        align-items: stretch;
        padding: 12px;
    }
`;

const PaginationInfo = styled.span`
    font-size: 14px;
    color: ${props => props.theme?.colors?.textSecondary || '#64748b'};

    @media (max-width: 600px) {
        text-align: center;
        font-size: 12px;
    }
`;

const PaginationButtons = styled.div`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;

    @media (max-width: 600px) {
        width: 100%;
        justify-content: center;
    }
`;

const PageButton = styled.button`
    padding: 8px 12px;
    min-width: 40px;
    min-height: 40px;
    border: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    border-radius: 8px;
    background: ${props => props.active ? '#4f46e5' : 'transparent'};
    color: ${props => props.active ? 'white' : props.theme?.colors?.textSecondary || '#64748b'};
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
    touch-action: manipulation;

    &:hover {
        border-color: #4f46e5;
        color: ${props => props.active ? 'white' : '#4f46e5'};
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

// Modal Styles
const ModalOverlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;

    @media (max-width: 600px) {
        padding: 12px;
    }
`;

const Modal = styled.div`
    background: ${props => props.theme?.colors?.bgCard || '#ffffff'};
    border-radius: 12px;
    width: ${props => props.width || '600px'};
    max-width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
`;

const ModalHeader = styled.div`
    padding: 20px 24px;
    border-bottom: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    display: flex;
    justify-content: space-between;
    align-items: center;

    @media (max-width: 600px) {
        padding: 14px 16px;
    }
`;

const ModalTitle = styled.h2`
    font-size: 18px;
    font-weight: 700;
    color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;

    @media (max-width: 600px) {
        font-size: 16px;
    }
`;

const ModalClose = styled.button`
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    background: ${props => props.theme?.colors?.bgSecondary || '#f8fafc'};
    color: ${props => props.theme?.colors?.textSecondary || '#64748b'};
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background: #fee2e2;
        color: #ef4444;
    }
`;

const ModalBody = styled.div`
    padding: 24px;

    @media (max-width: 600px) {
        padding: 16px;
    }
`;

const ModalFooter = styled.div`
    padding: 16px 24px;
    border-top: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    display: flex;
    justify-content: flex-end;
    gap: 12px;

    @media (max-width: 600px) {
        padding: 12px 16px;
        flex-direction: column-reverse;

        button {
            width: 100%;
            justify-content: center;
        }
    }
`;

// Form Styles
const FormGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;

    @media (max-width: 600px) {
        grid-template-columns: 1fr;
        gap: 12px;
    }
`;

const FormGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const FormLabel = styled.label`
    font-size: 12px;
    font-weight: 600;
    color: ${props => props.theme?.colors?.textSecondary || '#64748b'};
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

const FormInput = styled.input`
    padding: 10px 14px;
    border: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    border-radius: 8px;
    font-size: 16px;
    color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    background: ${props => props.theme?.colors?.bgSecondary || '#f8fafc'};
    outline: none;
    transition: all 0.2s ease;
    min-height: 44px;
    box-sizing: border-box;

    &:focus {
        border-color: #4f46e5;
        box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
    }

    &::placeholder {
        color: #94a3b8;
    }
`;

const FormSelect = styled.select`
    padding: 10px 14px;
    border: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    border-radius: 8px;
    font-size: 16px;
    color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    background: ${props => props.theme?.colors?.bgSecondary || '#f8fafc'};
    outline: none;
    cursor: pointer;
    min-height: 44px;
    box-sizing: border-box;

    &:focus {
        border-color: #4f46e5;
        box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
    }
`;

const FormError = styled.p`
    color: #ef4444;
    font-size: 12px;
    margin: 4px 0 0;
`;

// Buttons
const Button = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    min-height: 44px;
    border-radius: 8px;
    border: none;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    touch-action: manipulation;

    &.primary {
        background: #4f46e5;
        color: white;

        &:hover {
            background: #4338ca;
        }
    }

    &.secondary {
        background: ${props => props.theme?.colors?.bgSecondary || '#f8fafc'};
        color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
        border: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};

        &:hover {
            background: #e2e8f0;
        }
    }

    &.danger {
        background: #ef4444;
        color: white;

        &:hover {
            background: #dc2626;
        }
    }

    &.success {
        background: #10b981;
        color: white;

        &:hover {
            background: #059669;
        }
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const Switch = styled.label`
    position: relative;
    display: inline-block;
    width: 48px;
    height: 24px;

    input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: #cbd5e1;
        transition: 0.3s;
        border-radius: 24px;
    }

    .slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background: white;
        transition: 0.3s;
        border-radius: 50%;
    }

    input:checked + .slider {
        background: #4f46e5;
    }

    input:checked + .slider:before {
        transform: translateX(24px);
    }

    input:disabled + .slider {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const SwitchRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;

    .switch-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    }
`;

const LoadingState = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 60px;
    color: ${props => props.theme?.colors?.textSecondary || '#64748b'};

    @media (max-width: 600px) {
        padding: 40px 16px;
    }
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px;
    text-align: center;

    @media (max-width: 600px) {
        padding: 40px 16px;
    }
`;

const EmptyIcon = styled.div`
    font-size: 48px;
    margin-bottom: 16px;
`;

const EmptyText = styled.h3`
    font-size: 18px;
    font-weight: 600;
    color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    margin: 0 0 8px;
`;

const EmptySubtext = styled.p`
    font-size: 14px;
    color: ${props => props.theme?.colors?.textSecondary || '#64748b'};
    margin: 0;
`;

// ============================================
// HELPER FUNCTIONS
// ============================================

const AVATAR_COLORS = ['#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#ef4444', '#06b6d4', '#84cc16'];

const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const getAvatarColor = (name) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const getRoleLabel = (role) => {
    const labels = {
        'super_admin': 'Super Admin',
        'admin': 'Admin',
        'organizer': 'Organizer',
        'user': 'Regular User'
    };
    return labels[role] || role;
};

const getRoleIcon = (role) => {
    if (role === 'super_admin') return <SupervisorAccount fontSize="small" />;
    if (role === 'admin') return <AdminPanelSettings fontSize="small" />;
    if (role === 'organizer') return <Storefront fontSize="small" />;
    return <Person fontSize="small" />;
};

const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

// ============================================
// MAIN COMPONENT
// ============================================

const Users = () => {
    const { user: currentUser } = useAuth();
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // State
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);

    // Modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        password_confirm: '',
        first_name: '',
        last_name: '',
        phone: '',
        whatsapp_number: '',
        city: '',
        state: '',
        country: 'India',
        role: 'user',
        is_active: true,
    });

    // Stats
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        organizers: 0,
        admins: 0,
    });

    // Load users
    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {
                page: page,
                page_size: 10,
                search: search || undefined,
                role: roleFilter !== 'all' ? roleFilter : undefined,
                is_active: statusFilter !== 'all' ? statusFilter === 'active' : undefined,
            };

            const response = await api.get('/users/', { params });
            const data = response.data;

            setUsers(data.results || data);
            setTotalPages(Math.ceil((data.count || 0) / 10));
            setTotalUsers(data.count || 0);

            setStats(prev => ({
                ...prev,
                total: data.count || 0,
                active: (data.results || data).filter(u => u.is_active).length,
                organizers: (data.results || data).filter(u => u.role === 'organizer').length,
                admins: (data.results || data).filter(u => ['admin', 'super_admin'].includes(u.role)).length,
            }));
        } catch (err) {
            console.error('Error loading users:', err);
            setError(err.response?.data?.detail || 'Failed to load users');
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    }, [page, search, roleFilter, statusFilter]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            loadUsers();
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Reset form
    const resetForm = () => {
        setFormData({
            username: '',
            email: '',
            password: '',
            password_confirm: '',
            first_name: '',
            last_name: '',
            phone: '',
            whatsapp_number: '',
            city: '',
            state: '',
            country: 'India',
            role: 'user',
            is_active: true,
        });
    };

    // Handle create user
    const handleCreateUser = async (e) => {
        e.preventDefault();

        if (formData.password !== formData.password_confirm) {
            toast.error('Passwords do not match');
            return;
        }

        if (!formData.username || !formData.email || !formData.password) {
            toast.error('Please fill all required fields');
            return;
        }

        try {
            const response = await api.post('/users/', formData);
            toast.success('User created successfully');
            setShowCreateModal(false);
            resetForm();
            loadUsers();
        } catch (err) {
            const errorData = err.response?.data;
            const errorMsg = errorData?.detail || Object.values(errorData || {})[0] || 'Failed to create user';
            toast.error(errorMsg);
        }
    };

    // Handle update user
    const handleUpdateUser = async (e) => {
        e.preventDefault();

        if (!selectedUser) return;

        if (formData.password && formData.password !== formData.password_confirm) {
            toast.error('Passwords do not match');
            return;
        }

        try {
            const updateData = { ...formData };
            if (!updateData.password) {
                delete updateData.password;
                delete updateData.password_confirm;
            }

            const response = await api.patch(`/users/${selectedUser.id}/`, updateData);
            toast.success('User updated successfully');
            setShowEditModal(false);
            setSelectedUser(null);
            resetForm();
            loadUsers();
        } catch (err) {
            const errorData = err.response?.data;
            const errorMsg = errorData?.detail || Object.values(errorData || {})[0] || 'Failed to update user';
            toast.error(errorMsg);
        }
    };

    // Handle delete user
    const handleDeleteUser = async () => {
        if (!selectedUser) return;

        try {
            await api.delete(`/users/${selectedUser.id}/`);
            toast.success('User deleted successfully');
            setShowDeleteModal(false);
            setSelectedUser(null);
            loadUsers();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to delete user');
        }
    };

    // Toggle active status
    const handleToggleActive = async (user) => {
        try {
            const response = await api.post(`/users/${user.id}/toggle_active/`);
            toast.success(response.data.message || `User ${user.is_active ? 'deactivated' : 'activated'}`);
            loadUsers();
        } catch (err) {
            toast.error('Failed to update user status');
        }
    };

    // Handle edit
    const handleEditUser = (user) => {
        setSelectedUser(user);
        setFormData({
            username: user.username || '',
            email: user.email || '',
            password: '',
            password_confirm: '',
            first_name: user.first_name || '',
            last_name: user.last_name || '',
            phone: user.profile?.phone || '',
            whatsapp_number: user.profile?.whatsapp_number || '',
            city: user.profile?.city || '',
            state: user.profile?.state || '',
            country: user.profile?.country || 'India',
            role: user.role || 'user',
            is_active: user.is_active !== false,
        });
        setShowEditModal(true);
    };

    // Handle view
    const handleViewUser = (user) => {
        setSelectedUser(user);
        setShowViewModal(true);
    };

    // Render user avatar
    const renderAvatar = (user) => (
        <UserAvatar bg={getAvatarColor(user.username || 'user')}>
            {getInitials(user.username)}
        </UserAvatar>
    );

    // Render role badge
    const renderRoleBadge = (role) => (
        <RoleBadge className={role}>
            {getRoleIcon(role)}
            {getRoleLabel(role)}
        </RoleBadge>
    );

    // Render status badge
    const renderStatusBadge = (isActive) => (
        <Badge className={isActive ? 'active' : 'inactive'}>
            {isActive ? <CheckCircle fontSize="small" /> : <Block fontSize="small" />}
            {isActive ? 'Active' : 'Inactive'}
        </Badge>
    );

    // ============================================
    // SUB-COMPONENTS
    // ============================================

    // Create/Edit User Modal
    const UserFormModal = ({ mode, onClose, onSubmit }) => {
        const isEdit = mode === 'edit';

        return (
            <ModalOverlay onClick={onClose}>
                <Modal width="700px" onClick={(e) => e.stopPropagation()}>
                    <ModalHeader>
                        <ModalTitle>
                            {isEdit ? <Edit /> : <PersonAdd />}
                            {isEdit ? 'Edit User' : 'Create New User'}
                        </ModalTitle>
                        <ModalClose onClick={onClose}>
                            <Close fontSize="small" />
                        </ModalClose>
                    </ModalHeader>

                    <ModalBody>
                        <form onSubmit={onSubmit}>
                            <FormGrid>
                                <FormGroup>
                                    <FormLabel>Username *</FormLabel>
                                    <FormInput
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        disabled={isEdit}
                                        placeholder="username"
                                        required
                                    />
                                </FormGroup>

                                <FormGroup>
                                    <FormLabel>Email *</FormLabel>
                                    <FormInput
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="user@example.com"
                                        required
                                    />
                                </FormGroup>

                                {!isEdit && (
                                    <>
                                        <FormGroup>
                                            <FormLabel>Password *</FormLabel>
                                            <FormInput
                                                type="password"
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                placeholder="********"
                                                required
                                            />
                                        </FormGroup>

                                        <FormGroup>
                                            <FormLabel>Confirm Password *</FormLabel>
                                            <FormInput
                                                type="password"
                                                value={formData.password_confirm}
                                                onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })}
                                                placeholder="********"
                                                required
                                                style={{
                                                    borderColor: formData.password !== formData.password_confirm ? '#ef4444' : undefined
                                                }}
                                            />
                                            {formData.password !== formData.password_confirm && (
                                                <FormError>Passwords do not match</FormError>
                                            )}
                                        </FormGroup>
                                    </>
                                )}

                                {isEdit && (
                                    <>
                                        <FormGroup>
                                            <FormLabel>New Password (optional)</FormLabel>
                                            <FormInput
                                                type="password"
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                placeholder="Leave blank to keep current"
                                            />
                                        </FormGroup>

                                        <FormGroup>
                                            <FormLabel>Confirm New Password</FormLabel>
                                            <FormInput
                                                type="password"
                                                value={formData.password_confirm}
                                                onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })}
                                                placeholder="Leave blank to keep current"
                                                style={{
                                                    borderColor: formData.password !== formData.password_confirm ? '#ef4444' : undefined
                                                }}
                                            />
                                            {formData.password !== formData.password_confirm && (
                                                <FormError>Passwords do not match</FormError>
                                            )}
                                        </FormGroup>
                                    </>
                                )}

                                <FormGroup>
                                    <FormLabel>First Name</FormLabel>
                                    <FormInput
                                        type="text"
                                        value={formData.first_name}
                                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                        placeholder="John"
                                    />
                                </FormGroup>

                                <FormGroup>
                                    <FormLabel>Last Name</FormLabel>
                                    <FormInput
                                        type="text"
                                        value={formData.last_name}
                                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                        placeholder="Doe"
                                    />
                                </FormGroup>

                                <FormGroup>
                                    <FormLabel>Phone</FormLabel>
                                    <FormInput
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="+91 9876543210"
                                    />
                                </FormGroup>

                                <FormGroup>
                                    <FormLabel>WhatsApp Number</FormLabel>
                                    <FormInput
                                        type="tel"
                                        value={formData.whatsapp_number}
                                        onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                                        placeholder="+91 9876543210"
                                    />
                                </FormGroup>

                                <FormGroup>
                                    <FormLabel>City</FormLabel>
                                    <FormInput
                                        type="text"
                                        value={formData.city}
                                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                        placeholder="Mumbai"
                                    />
                                </FormGroup>

                                <FormGroup>
                                    <FormLabel>State</FormLabel>
                                    <FormInput
                                        type="text"
                                        value={formData.state}
                                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                                        placeholder="Maharashtra"
                                    />
                                </FormGroup>

                                <FormGroup>
                                    <FormLabel>Country</FormLabel>
                                    <FormSelect
                                        value={formData.country}
                                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                                    >
                                        <option value="India">India</option>
                                        <option value="USA">United States</option>
                                        <option value="UK">United Kingdom</option>
                                        <option value="Australia">Australia</option>
                                        <option value="Canada">Canada</option>
                                        <option value="Other">Other</option>
                                    </FormSelect>
                                </FormGroup>

                                <FormGroup>
                                    <FormLabel>Role</FormLabel>
                                    <FormSelect
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                        disabled={!currentUser?.is_superuser && ['admin', 'super_admin'].includes(formData.role)}
                                    >
                                        <option value="user">Regular User</option>
                                        <option value="organizer">Organizer</option>
                                        {currentUser?.is_superuser && (
                                            <>
                                                <option value="admin">Admin</option>
                                                <option value="super_admin">Super Admin</option>
                                            </>
                                        )}
                                    </FormSelect>
                                </FormGroup>
                            </FormGrid>

                            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                                <FormLabel style={{ marginBottom: '8px', display: 'block' }}>Account Status</FormLabel>
                                <SwitchRow>
                                    <Switch>
                                        <input
                                            type="checkbox"
                                            checked={formData.is_active}
                                            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                        />
                                        <span className="slider" />
                                    </Switch>
                                    <span className="switch-label">
                                        {formData.is_active ? <CheckCircle color="success" /> : <Block color="error" />}
                                        {formData.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </SwitchRow>
                            </div>
                        </form>
                    </ModalBody>

                    <ModalFooter>
                        <Button className="secondary" onClick={onClose}>
                            <Cancel fontSize="small" />
                            Cancel
                        </Button>
                        <Button className="primary" type="button" onClick={onSubmit}>
                            <Save fontSize="small" />
                            {isEdit ? 'Save Changes' : 'Create User'}
                        </Button>
                    </ModalFooter>
                </Modal>
            </ModalOverlay>
        );
    };

    // View User Modal
    const ViewUserModal = ({ user, onClose, onEdit }) => {
        if (!user) return null;

        return (
            <ModalOverlay onClick={onClose}>
                <Modal width="500px" onClick={(e) => e.stopPropagation()}>
                    <ModalHeader>
                        <ModalTitle>
                            <Visibility />
                            User Profile
                        </ModalTitle>
                        <ModalClose onClick={onClose}>
                            <Close fontSize="small" />
                        </ModalClose>
                    </ModalHeader>

                    <ModalBody>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                            {renderAvatar(user)}
                            <div style={{ minWidth: 0 }}>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {user.first_name} {user.last_name}
                                </h3>
                                <p style={{ margin: '4px 0', fontSize: '14px', color: '#64748b' }}>
                                    @{user.username}
                                </p>
                                {renderRoleBadge(user.role)}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                            <div>
                                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Email</p>
                                <p style={{ margin: '4px 0', fontSize: '14px', wordBreak: 'break-all' }}>
                                    <Email fontSize="small" style={{ verticalAlign: 'middle', marginRight: '8px', color: '#4f46e5' }} />
                                    {user.email}
                                </p>
                            </div>

                            <div>
                                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Phone</p>
                                <p style={{ margin: '4px 0', fontSize: '14px' }}>
                                    <Phone fontSize="small" style={{ verticalAlign: 'middle', marginRight: '8px', color: '#4f46e5' }} />
                                    {user.profile?.phone || 'N/A'}
                                </p>
                            </div>

                            <div>
                                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Location</p>
                                <p style={{ margin: '4px 0', fontSize: '14px' }}>
                                    <LocationOn fontSize="small" style={{ verticalAlign: 'middle', marginRight: '8px', color: '#4f46e5' }} />
                                    {[user.profile?.city, user.profile?.state].filter(Boolean).join(', ') || 'N/A'}
                                </p>
                            </div>

                            <div>
                                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Joined</p>
                                <p style={{ margin: '4px 0', fontSize: '14px' }}>
                                    <CalendarToday fontSize="small" style={{ verticalAlign: 'middle', marginRight: '8px', color: '#4f46e5' }} />
                                    {formatDate(user.date_joined)}
                                </p>
                            </div>
                        </div>

                        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            {renderStatusBadge(user.is_active)}
                            {user.is_staff && (
                                <Badge className="active">
                                    <AdminPanelSettings fontSize="small" />
                                    Staff
                                </Badge>
                            )}
                        </div>
                    </ModalBody>

                    <ModalFooter>
                        <Button className="secondary" onClick={onClose}>
                            Close
                        </Button>
                        <Button className="primary" onClick={() => onEdit(user)}>
                            <Edit fontSize="small" />
                            Edit
                        </Button>
                    </ModalFooter>
                </Modal>
            </ModalOverlay>
        );
    };

    // Delete Confirmation Modal
    const DeleteUserModal = ({ user, onClose, onConfirm }) => {
        if (!user) return null;

        return (
            <ModalOverlay onClick={onClose}>
                <Modal width="400px" onClick={(e) => e.stopPropagation()}>
                    <ModalHeader>
                        <ModalTitle>
                            <Delete />
                            Delete User
                        </ModalTitle>
                        <ModalClose onClick={onClose}>
                            <Close fontSize="small" />
                        </ModalClose>
                    </ModalHeader>

                    <ModalBody>
                        <p style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.6 }}>
                            Are you sure you want to delete the user <strong>{user.username}</strong>?
                        </p>
                        <p style={{ margin: 0, fontSize: '14px', color: '#ef4444' }}>
                            This action cannot be undone. All associated data will be permanently deleted.
                        </p>
                    </ModalBody>

                    <ModalFooter>
                        <Button className="secondary" onClick={onClose}>
                            <Cancel fontSize="small" />
                            Cancel
                        </Button>
                        <Button className="danger" onClick={onConfirm}>
                            <Delete fontSize="small" />
                            Delete User
                        </Button>
                    </ModalFooter>
                </Modal>
            </ModalOverlay>
        );
    };

    // ============================================
    // MAIN RENDER
    // ============================================

    return (
        <PageContainer>
            {/* Page Header */}
            <PageHeader>
                <div>
                    <PageTitle>User Management</PageTitle>
                    <PageSubtitle>Manage all users in the system</PageSubtitle>
                </div>
                <HeaderActions>
                    <Button className="secondary" onClick={loadUsers}>
                        <Refresh fontSize="small" />
                        Refresh
                    </Button>
                    <Button className="primary" onClick={() => {
                        resetForm();
                        setShowCreateModal(true);
                    }}>
                        <PersonAdd fontSize="small" />
                        Add User
                    </Button>
                </HeaderActions>
            </PageHeader>

            {/* Stats Cards */}
            <StatsGrid>
                <StatCard>
                    <StatIcon bg="rgba(79, 70, 229, 0.1)" color="#4f46e5">
                        <Group />
                    </StatIcon>
                    <StatValue>{totalUsers}</StatValue>
                    <StatLabel>Total Users</StatLabel>
                </StatCard>

                <StatCard>
                    <StatIcon bg="rgba(16, 185, 129, 0.1)" color="#10b981">
                        <CheckCircle />
                    </StatIcon>
                    <StatValue>{stats.active}</StatValue>
                    <StatLabel>Active Users</StatLabel>
                </StatCard>

                <StatCard>
                    <StatIcon bg="rgba(217, 119, 6, 0.1)" color="#d97706">
                        <Storefront />
                    </StatIcon>
                    <StatValue>{stats.organizers}</StatValue>
                    <StatLabel>Organizers</StatLabel>
                </StatCard>

                <StatCard>
                    <StatIcon bg="rgba(37, 99, 235, 0.1)" color="#2563eb">
                        <AdminPanelSettings />
                    </StatIcon>
                    <StatValue>{stats.admins}</StatValue>
                    <StatLabel>Admins</StatLabel>
                </StatCard>
            </StatsGrid>

            {/* Filters */}
            <FilterCard>
                <FilterGrid>
                    <SearchWrapper>
                        <Search className="search-icon" fontSize="small" />
                        <SearchInput
                            type="text"
                            placeholder="Search users..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </SearchWrapper>

                    <Select
                        value={roleFilter}
                        onChange={(e) => {
                            setRoleFilter(e.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="all">All Roles</option>
                        <option value="user">Regular User</option>
                        <option value="organizer">Organizer</option>
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super Admin</option>
                    </Select>

                    <Select
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </Select>
                </FilterGrid>
            </FilterCard>

            {/* Users Table / Card list */}
            <TableContainer>
                {loading ? (
                    <LoadingState>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                border: '3px solid rgba(79,70,229,0.1)',
                                borderTop: '3px solid #4f46e5',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                                margin: '0 auto 16px'
                            }} />
                            Loading users...
                        </div>
                    </LoadingState>
                ) : error ? (
                    <LoadingState>
                        <div style={{ textAlign: 'center', color: '#ef4444' }}>
                            <p style={{ fontSize: '16px', fontWeight: 600 }}>Error loading users</p>
                            <p style={{ fontSize: '14px' }}>{error}</p>
                        </div>
                    </LoadingState>
                ) : users.length === 0 ? (
                    <EmptyState>
                        <EmptyIcon>👥</EmptyIcon>
                        <EmptyText>No users found</EmptyText>
                        <EmptySubtext>Try adjusting your search or filters</EmptySubtext>
                    </EmptyState>
                ) : isMobile ? (
                    // ==================== MOBILE: CARD LIST ====================
                    <div style={{ padding: 12 }}>
                        {users.map((user) => (
                            <MobileUserCard key={user.id} onClick={() => handleViewUser(user)}>
                                <MobileUserHeader>
                                    {renderAvatar(user)}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <UserName>{user.first_name} {user.last_name}</UserName>
                                        <UserUsername>@{user.username}</UserUsername>
                                    </div>
                                    {renderStatusBadge(user.is_active)}
                                </MobileUserHeader>

                                <MobileUserBody>
                                    <div className="full-width">
                                        <span className="field-label">Email</span>
                                        <span className="field-value">{user.email}</span>
                                    </div>
                                    <div>
                                        <span className="field-label">Role</span>
                                        <span className="field-value">{renderRoleBadge(user.role)}</span>
                                    </div>
                                    <div>
                                        <span className="field-label">Joined</span>
                                        <span className="field-value">{formatDate(user.date_joined)}</span>
                                    </div>
                                </MobileUserBody>

                                <MobileUserActions>
                                    <Button
                                        className="secondary"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleViewUser(user);
                                        }}
                                    >
                                        <Visibility fontSize="small" />
                                        View
                                    </Button>
                                    <Button
                                        className="secondary"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditUser(user);
                                        }}
                                    >
                                        <Edit fontSize="small" />
                                        Edit
                                    </Button>
                                    <Button
                                        className="secondary"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleActive(user);
                                        }}
                                        style={{ color: user.is_active ? '#ef4444' : '#10b981' }}
                                    >
                                        {user.is_active ? <Block fontSize="small" /> : <LockOpen fontSize="small" />}
                                        {user.is_active ? 'Block' : 'Unblock'}
                                    </Button>
                                    <Button
                                        className="danger"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedUser(user);
                                            setShowDeleteModal(true);
                                        }}
                                    >
                                        <Delete fontSize="small" />
                                    </Button>
                                </MobileUserActions>
                            </MobileUserCard>
                        ))}
                    </div>
                ) : (
                    // ==================== DESKTOP: TABLE ====================
                    <Table>
                        <TableHead>
                            <tr>
                                <TableHeaderCell>User</TableHeaderCell>
                                <TableHeaderCell>Email</TableHeaderCell>
                                <TableHeaderCell>Role</TableHeaderCell>
                                <TableHeaderCell>Status</TableHeaderCell>
                                <TableHeaderCell>Joined</TableHeaderCell>
                                <TableHeaderCell align="right">Actions</TableHeaderCell>
                            </tr>
                        </TableHead>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user.id} onClick={() => handleViewUser(user)}>
                                    <TableCell>
                                        <UserCell>
                                            {renderAvatar(user)}
                                            <div>
                                                <UserName>{user.first_name} {user.last_name}</UserName>
                                                <UserUsername>@{user.username}</UserUsername>
                                            </div>
                                        </UserCell>
                                    </TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>{renderRoleBadge(user.role)}</TableCell>
                                    <TableCell>{renderStatusBadge(user.is_active)}</TableCell>
                                    <TableCell>{formatDate(user.date_joined)}</TableCell>
                                    <TableCell align="right">
                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                            <ActionButton onClick={(e) => {
                                                e.stopPropagation();
                                                handleViewUser(user);
                                            }} title="View">
                                                <Visibility fontSize="small" />
                                            </ActionButton>
                                            <ActionButton onClick={(e) => {
                                                e.stopPropagation();
                                                handleEditUser(user);
                                            }} title="Edit">
                                                <Edit fontSize="small" />
                                            </ActionButton>
                                            <ActionButton
                                                className="danger"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleToggleActive(user);
                                                }}
                                                title={user.is_active ? 'Deactivate' : 'Activate'}
                                            >
                                                {user.is_active ? <Block fontSize="small" /> : <LockOpen fontSize="small" />}
                                            </ActionButton>
                                            <ActionButton
                                                className="danger"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedUser(user);
                                                    setShowDeleteModal(true);
                                                }}
                                                title="Delete"
                                            >
                                                <Delete fontSize="small" />
                                            </ActionButton>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                {/* Pagination */}
                {!loading && !error && users.length > 0 && (
                    <PaginationContainer>
                        <PaginationInfo>
                            Showing {users.length} of {totalUsers} users
                        </PaginationInfo>
                        <PaginationButtons>
                            <PageButton
                                onClick={() => setPage(Math.max(1, page - 1))}
                                disabled={page === 1}
                            >
                                ← Prev
                            </PageButton>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let startPage = Math.max(1, page - 2);
                                let endPage = Math.min(totalPages, startPage + 4);
                                if (endPage - startPage < 4) {
                                    startPage = Math.max(1, endPage - 4);
                                }
                                const pageNum = startPage + i;
                                if (pageNum <= endPage) {
                                    return (
                                        <PageButton
                                            key={pageNum}
                                            active={page === pageNum}
                                            onClick={() => setPage(pageNum)}
                                        >
                                            {pageNum}
                                        </PageButton>
                                    );
                                }
                                return null;
                            })}
                            <PageButton
                                onClick={() => setPage(Math.min(totalPages, page + 1))}
                                disabled={page === totalPages}
                            >
                                Next →
                            </PageButton>
                        </PaginationButtons>
                    </PaginationContainer>
                )}
            </TableContainer>

            {/* Modals */}
            {showCreateModal && (
                <UserFormModal
                    mode="create"
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={handleCreateUser}
                />
            )}

            {showEditModal && selectedUser && (
                <UserFormModal
                    mode="edit"
                    onClose={() => {
                        setShowEditModal(false);
                        setSelectedUser(null);
                    }}
                    onSubmit={handleUpdateUser}
                />
            )}

            {showViewModal && selectedUser && (
                <ViewUserModal
                    user={selectedUser}
                    onClose={() => {
                        setShowViewModal(false);
                        setSelectedUser(null);
                    }}
                    onEdit={(user) => {
                        setShowViewModal(false);
                        handleEditUser(user);
                    }}
                />
            )}

            {showDeleteModal && selectedUser && (
                <DeleteUserModal
                    user={selectedUser}
                    onClose={() => {
                        setShowDeleteModal(false);
                        setSelectedUser(null);
                    }}
                    onConfirm={handleDeleteUser}
                />
            )}
        </PageContainer>
    );
};

export default Users;