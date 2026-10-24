// frontend/src/pages/Users/Users.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useMediaQuery, useTheme } from '@mui/material';
import { toast } from 'react-toastify';
import {
  Search,
  Edit,
  Delete,
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
  Password,
  EnhancedEncryption,
} from '@mui/icons-material';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { theme } from '../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

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
    color: ${C.textPrimary};
    margin: 0;
    font-family: ${F.family};
`;

const PageSubtitle = styled.p`
    font-size: 14px;
    color: ${C.textSecondary};
    margin: 4px 0 0;
    font-family: ${F.family};
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
    background: ${C.bgCard};
    border-radius: 12px;
    padding: 20px;
    border: 1px solid ${C.borderLight};
    box-shadow: ${theme.shadows.card};
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
        transform: translateY(-2px);
        box-shadow: ${theme.shadows.cardHover};
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
    background: ${props => props.$bg};
    color: ${props => props.$color};

    @media (max-width: 600px) {
        width: 34px;
        height: 34px;
        margin-bottom: 8px;
    }
`;

const StatValue = styled.h3`
    font-size: 28px;
    font-weight: 700;
    color: ${C.textPrimary};
    margin: 0;
    font-family: ${F.family};

    @media (max-width: 600px) {
        font-size: 22px;
    }
`;

const StatLabel = styled.p`
    font-size: 12px;
    color: ${C.textSecondary};
    margin: 4px 0 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-family: ${F.family};

    @media (max-width: 600px) {
        font-size: 10px;
    }
`;

const FilterCard = styled.div`
    background: ${C.bgCard};
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 24px;
    border: 1px solid ${C.borderLight};

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
    border: 1px solid ${C.borderLight};
    border-radius: 8px;
    font-size: 16px;
    color: ${C.textPrimary};
    background: ${C.bgSecondary};
    outline: none;
    transition: all 0.2s ease;
    min-height: 44px;
    box-sizing: border-box;
    font-family: ${F.family};

    &:focus {
        border-color: ${C.primary};
        box-shadow: 0 0 0 3px ${C.primary}1A;
    }

    &::placeholder {
        color: ${C.textLight};
    }
`;

const SearchWrapper = styled.div`
    position: relative;

    .search-icon {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        color: ${C.textLight};
    }
`;

const Select = styled.select`
    width: 100%;
    padding: 10px 14px;
    border: 1px solid ${C.borderLight};
    border-radius: 8px;
    font-size: 16px;
    color: ${C.textPrimary};
    background: ${C.bgSecondary};
    outline: none;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 44px;
    box-sizing: border-box;
    font-family: ${F.family};

    &:focus {
        border-color: ${C.primary};
        box-shadow: 0 0 0 3px ${C.primary}1A;
    }
`;

const TableContainer = styled.div`
    background: ${C.bgCard};
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid ${C.borderLight};
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
`;

const TableHead = styled.thead`
    background: ${C.bgSecondary};
    border-bottom: 2px solid ${C.borderLight};
`;

const TableHeaderCell = styled.th`
    padding: 12px 16px;
    text-align: ${props => props.align || 'left'};
    font-size: 12px;
    font-weight: 600;
    color: ${C.textSecondary};
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
    font-family: ${F.family};
`;

const TableBody = styled.tbody`
    background: ${C.bgCard};
`;

const TableRow = styled.tr`
    border-bottom: 1px solid ${C.borderLight};
    cursor: pointer;
    transition: background 0.2s ease;

    &:hover {
        background: ${C.bgHover};
    }

    &:last-child {
        border-bottom: none;
    }
`;

const TableCell = styled.td`
    padding: 12px 16px;
    font-size: 14px;
    color: ${C.textPrimary};
    vertical-align: middle;
    font-family: ${F.family};
`;

const MobileUserCard = styled.div`
    background: ${C.bgCard};
    border: 1px solid ${C.borderLight};
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:active {
        transform: scale(0.99);
        background: ${C.bgHover};
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
    border-top: 1px dashed ${C.borderLight};
    margin-bottom: 12px;

    .field-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 600;
        color: ${C.textLight};
        display: block;
        margin-bottom: 2px;
        font-family: ${F.family};
    }

    .field-value {
        font-size: 13px;
        color: ${C.textPrimary};
        word-break: break-word;
        font-family: ${F.family};
    }

    .full-width {
        grid-column: 1 / -1;
    }
`;

const MobileUserActions = styled.div`
    display: flex;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid ${C.bgInput};
    flex-wrap: wrap;

    button {
        flex: 1;
        justify-content: center;
        min-width: 0;
    }
`;

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
    color: ${C.textInverse};
    background: ${props => props.$bg};
`;

const UserName = styled.div`
    font-weight: 600;
    font-size: 14px;
    color: ${C.textPrimary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ${F.family};
`;

const UserUsername = styled.div`
    font-size: 12px;
    color: ${C.textSecondary};
    font-family: ${F.family};
`;

const Badge = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    font-family: ${F.family};

    &.active {
        background: ${C.success}1A;
        color: ${C.successDark};
    }

    &.inactive {
        background: ${C.error}1A;
        color: ${C.errorDark};
    }

    &.locked {
        background: ${C.error}1A;
        color: ${C.errorDark};
        margin-left: 6px;
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
    font-family: ${F.family};

    &.super_admin {
        background: ${C.success}1A;
        color: ${C.successDark};
    }

    &.admin {
        background: ${C.info}1A;
        color: ${C.infoDark};
    }

    &.organizer {
        background: ${C.warning}1A;
        color: ${C.warningDark};
    }

    &.user {
        background: ${C.bgInput};
        color: ${C.textSecondary};
    }
`;

const ActionButton = styled.button`
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: ${C.textSecondary};
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;

    &:hover {
        background: ${C.primary}1A;
        color: ${C.primary};
    }

    &.danger:hover {
        background: ${C.error}1A;
        color: ${C.error};
    }

    &.success:hover {
        background: ${C.success}1A;
        color: ${C.success};
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
`;

const PaginationContainer = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-top: 1px solid ${C.borderLight};
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
    color: ${C.textSecondary};
    font-family: ${F.family};

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
    border: 1px solid ${C.borderLight};
    border-radius: 8px;
    background: ${props => props.$active ? C.primary : 'transparent'};
    color: ${props => props.$active ? C.textInverse : C.textSecondary};
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
    touch-action: manipulation;
    font-family: ${F.family};

    &:hover {
        border-color: ${C.primary};
        color: ${props => props.$active ? C.textInverse : C.primary};
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

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
    background: ${C.bgCard};
    border-radius: 12px;
    width: ${props => props.$width || '600px'};
    max-width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: ${theme.shadows.modal};
`;

const ModalHeader = styled.div`
    padding: 20px 24px;
    border-bottom: 1px solid ${C.borderLight};
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
    color: ${C.textPrimary};
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: ${F.family};

    @media (max-width: 600px) {
        font-size: 16px;
    }
`;

const ModalClose = styled.button`
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    background: ${C.bgSecondary};
    color: ${C.textSecondary};
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background: ${C.error}1A;
        color: ${C.error};
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
    border-top: 1px solid ${C.borderLight};
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
    color: ${C.textSecondary};
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-family: ${F.family};
`;

const FormInput = styled.input`
    padding: 10px 14px;
    border: 1px solid ${C.borderLight};
    border-radius: 8px;
    font-size: 16px;
    color: ${C.textPrimary};
    background: ${C.bgSecondary};
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    min-height: 44px;
    box-sizing: border-box;
    font-family: ${F.family};

    &:focus {
        border-color: ${C.primary};
        box-shadow: 0 0 0 3px ${C.primary}1A;
    }

    &::placeholder {
        color: ${C.textLight};
    }
`;

const FormSelect = styled.select`
    padding: 10px 14px;
    border: 1px solid ${C.borderLight};
    border-radius: 8px;
    font-size: 16px;
    color: ${C.textPrimary};
    background: ${C.bgSecondary};
    outline: none;
    cursor: pointer;
    min-height: 44px;
    box-sizing: border-box;
    font-family: ${F.family};

    &:focus {
        border-color: ${C.primary};
        box-shadow: 0 0 0 3px ${C.primary}1A;
    }
`;

const FormError = styled.p`
    color: ${C.error};
    font-size: 12px;
    margin: 4px 0 0;
    font-family: ${F.family};
`;

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
    font-family: ${F.family};

    &.primary {
        background: ${C.primary};
        color: ${C.textInverse};

        &:hover {
            background: ${C.primaryDark};
        }
    }

    &.secondary {
        background: ${C.bgSecondary};
        color: ${C.textPrimary};
        border: 1px solid ${C.borderLight};

        &:hover {
            background: ${C.bgInput};
        }
    }

    &.danger {
        background: ${C.error};
        color: ${C.textInverse};

        &:hover {
            background: ${C.errorDark};
        }
    }

    &.success {
        background: ${C.success};
        color: ${C.textInverse};

        &:hover {
            background: ${C.successDark};
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
        background: ${C.borderHover};
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
        background: ${C.bgCard};
        transition: 0.3s;
        border-radius: 50%;
    }

    input:checked + .slider {
        background: ${C.primary};
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
        color: ${C.textPrimary};
        font-family: ${F.family};
    }
`;

const LoadingState = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 60px;
    color: ${C.textSecondary};

    @media (max-width: 600px) {
        padding: 40px 16px;
    }
`;

const Spinner = styled.div`
    width: 40px;
    height: 40px;
    border: 3px solid ${C.primary}1A;
    border-top: 3px solid ${C.primary};
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 16px;
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
    color: ${C.textPrimary};
    margin: 0 0 8px;
    font-family: ${F.family};
`;

const EmptySubtext = styled.p`
    font-size: 14px;
    color: ${C.textSecondary};
    margin: 0;
    font-family: ${F.family};
`;

// ============================================
// HELPER FUNCTIONS
// ============================================

const AVATAR_COLORS = [
    C.warning,
    C.info,
    C.secondary,
    C.success,
    C.error,
    C.primary,
];

const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const getAvatarColor = (name) => {
    let hash = 0;
    const source = name || 'user';
    for (let i = 0; i < source.length; i++) {
        hash = source.charCodeAt(i) + ((hash << 5) - hash);
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

// ✅ NEW: phone helpers — mirror the backend's UserRegistrationSerializer
// validator so client and server agree on what "valid" means.
//   • Optional leading "+"
//   • 7–15 digits after stripping spaces, dashes, parens, dots
const PHONE_RE = /^\+?[0-9]{7,15}$/;

const normalisePhone = (raw) =>
    String(raw || '').replace(/[\s\-\(\)\.]/g, '');

const isValidPhone = (raw) => PHONE_RE.test(normalisePhone(raw));

// ============================================================================
// MODAL COMPONENTS — HOISTED TO MODULE SCOPE
// ============================================================================
// ✅ FIX: these four modals used to be declared *inside* the `Users`
// component body. React treats an inline-declared function component as
// a NEW component type on every parent render, so it unmounts and
// remounts the entire subtree on every keystroke. That destroyed focus
// (and, with `autoFocus` on the "New Password" field, actively stole
// focus back from the "Confirm Password" field on the second keystroke).
//
// Hoisting them to module scope gives them a stable identity, so a
// parent re-render just re-renders them in place.
//
// We also move the password state *into* ResetPasswordModal so the
// controlled inputs' owner never changes. This is belt-and-braces:
// hoisting alone fixes the remount; owning the state in the modal
// removes an extra reason for the browser to reset the caret.
// ============================================================================

const UserFormModal = ({
    mode,
    formData,
    setFormData,
    onClose,
    onSubmit,
    currentUser,
}) => {
    const isEdit = mode === 'edit';

    // ✅ NEW: inline validation for the mobile field on CREATE only.
    // Edit mode stays permissive so legacy profiles with blank phones
    // can still be saved.
    const phoneInvalid =
        !isEdit && formData.phone && !isValidPhone(formData.phone);

    return (
        <ModalOverlay onClick={onClose}>
            <Modal $width="700px" onClick={(e) => e.stopPropagation()}>
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

                            {/* ✅ NEW: Mobile Number, moved to sit next to
                                Email. Required on create; optional on edit.
                                Inline red border + FormError when invalid. */}
                            <FormGroup>
                                <FormLabel>
                                    Mobile Number {isEdit ? '(optional)' : '*'}
                                </FormLabel>
                                <FormInput
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    placeholder="+91 9876543210"
                                    required={!isEdit}
                                    style={{
                                        borderColor: phoneInvalid ? C.error : undefined,
                                    }}
                                />
                                {phoneInvalid && (
                                    <FormError>Enter a valid mobile number (7–15 digits)</FormError>
                                )}
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
                                                borderColor: formData.password !== formData.password_confirm ? C.error : undefined
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
                                                borderColor: formData.password !== formData.password_confirm ? C.error : undefined
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

                        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: `1px solid ${C.borderLight}` }}>
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

const ViewUserModal = ({ user, isMobile, onClose, onEdit }) => {
    if (!user) return null;

    return (
        <ModalOverlay onClick={onClose}>
            <Modal $width="500px" onClick={(e) => e.stopPropagation()}>
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
                        <UserAvatar $bg={getAvatarColor(user.username || 'user')}>
                            {getInitials(user.username)}
                        </UserAvatar>
                        <div style={{ minWidth: 0 }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: F.family }}>
                                {user.first_name} {user.last_name}
                            </h3>
                            <p style={{ margin: '4px 0', fontSize: '14px', color: C.textSecondary, fontFamily: F.family }}>
                                @{user.username}
                            </p>
                            <RoleBadge className={user.role}>
                                {getRoleIcon(user.role)}
                                {getRoleLabel(user.role)}
                            </RoleBadge>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: C.textSecondary, fontFamily: F.family }}>Email</p>
                            <p style={{ margin: '4px 0', fontSize: '14px', wordBreak: 'break-all', fontFamily: F.family }}>
                                <Email fontSize="small" style={{ verticalAlign: 'middle', marginRight: '8px', color: C.primary }} />
                                {user.email}
                            </p>
                        </div>

                        <div>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: C.textSecondary, fontFamily: F.family }}>Phone</p>
                            <p style={{ margin: '4px 0', fontSize: '14px', fontFamily: F.family }}>
                                <Phone fontSize="small" style={{ verticalAlign: 'middle', marginRight: '8px', color: C.primary }} />
                                {user.profile?.phone || 'N/A'}
                            </p>
                        </div>

                        <div>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: C.textSecondary, fontFamily: F.family }}>Location</p>
                            <p style={{ margin: '4px 0', fontSize: '14px', fontFamily: F.family }}>
                                <LocationOn fontSize="small" style={{ verticalAlign: 'middle', marginRight: '8px', color: C.primary }} />
                                {[user.profile?.city, user.profile?.state].filter(Boolean).join(', ') || 'N/A'}
                            </p>
                        </div>

                        <div>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: C.textSecondary, fontFamily: F.family }}>Joined</p>
                            <p style={{ margin: '4px 0', fontSize: '14px', fontFamily: F.family }}>
                                <CalendarToday fontSize="small" style={{ verticalAlign: 'middle', marginRight: '8px', color: C.primary }} />
                                {formatDate(user.date_joined)}
                            </p>
                        </div>
                    </div>

                    <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: `1px solid ${C.borderLight}`, display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <Badge className={user.is_active !== false ? 'active' : 'inactive'}>
                            {user.is_active !== false ? <CheckCircle fontSize="small" /> : <Block fontSize="small" />}
                            {user.is_active !== false ? 'Active' : 'Inactive'}
                        </Badge>
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

const DeleteUserModal = ({ user, onClose, onConfirm }) => {
    if (!user) return null;

    return (
        <ModalOverlay onClick={onClose}>
            <Modal $width="400px" onClick={(e) => e.stopPropagation()}>
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
                    <p style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.6, fontFamily: F.family }}>
                        Are you sure you want to delete the user <strong>{user.username}</strong>?
                    </p>
                    <p style={{ margin: 0, fontSize: '14px', color: C.error, fontFamily: F.family }}>
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

// ============================================================================
// ✅ FIX: ResetPasswordModal now owns its own field state.
//   - `user` prop is read once for display.
//   - `newPassword` / `confirmPassword` are local state.
//   - The "Reset" action calls `onReset(userId, newPassword)`.
//   - `busy` comes from the parent, which flips to true while the API
//     call is in flight and back to false when it resolves or rejects.
//
// This means: as the user types in either field, no parent state
// changes, so the parent doesn't re-render, so the input the user is
// currently typing in is never unmounted. Focus is preserved.
// ============================================================================
const ResetPasswordModal = ({ user, onClose, onReset, busy }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    if (!user) return null;

    const mismatch = newPassword !== confirmPassword && confirmPassword.length > 0;
    const canSubmit = Boolean(newPassword.trim()) && !mismatch && !busy;

    const handleSubmit = () => {
        if (!canSubmit) return;
        onReset(user.id, newPassword);
    };

    return (
        <ModalOverlay onClick={busy ? undefined : onClose}>
            <Modal $width="480px" onClick={(e) => e.stopPropagation()}>
                <ModalHeader>
                    <ModalTitle>
                        <Password />
                        Reset Password
                    </ModalTitle>
                    <ModalClose onClick={busy ? undefined : onClose}>
                        <Close fontSize="small" />
                    </ModalClose>
                </ModalHeader>

                <ModalBody>
                    <p style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.6, fontFamily: F.family }}>
                        Set a new password for <strong>{user.username}</strong>.
                    </p>
                    <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: `${C.warning}1A`, border: `1px solid ${C.warning}4D` }}>
                        <p style={{ margin: 0, fontSize: '12px', color: C.warningDark, fontFamily: F.family }}>
                            ⚠️ The user will be signed out of every session. Any Axes lockout will also be cleared.
                        </p>
                    </div>

                    <FormGrid>
                        <FormGroup>
                            <FormLabel>New Password *</FormLabel>
                            <FormInput
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Minimum 10 characters"
                                autoFocus
                                disabled={busy}
                                autoComplete="new-password"
                            />
                        </FormGroup>
                        <FormGroup>
                            <FormLabel>Confirm Password *</FormLabel>
                            <FormInput
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Re-enter password"
                                disabled={busy}
                                autoComplete="new-password"
                                style={{ borderColor: mismatch ? C.error : undefined }}
                            />
                            {mismatch && <FormError>Passwords do not match</FormError>}
                        </FormGroup>
                    </FormGrid>
                </ModalBody>

                <ModalFooter>
                    <Button className="secondary" onClick={onClose} disabled={busy}>
                        <Cancel fontSize="small" />
                        Cancel
                    </Button>
                    <Button
                        className="primary"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                    >
                        <EnhancedEncryption fontSize="small" />
                        {busy ? 'Resetting…' : 'Reset Password'}
                    </Button>
                </ModalFooter>
            </Modal>
        </ModalOverlay>
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const Users = () => {
    const { user: currentUser } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);

    // ✅ FIX: only user + open live in the parent now.
    // The password fields live inside ResetPasswordModal.
    const [resetTarget, setResetTarget] = useState(null);
    const [actionBusy, setActionBusy] = useState(false);

    const [lockStatus, setLockStatus] = useState({});

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

    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        organizers: 0,
        admins: 0,
    });

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

    useEffect(() => {
        if (!users?.length) {
            setLockStatus({});
            return;
        }
        let cancelled = false;
        (async () => {
            const results = await Promise.all(
                users.map((u) =>
                    api.get(`/users/${u.id}/lockout_status/`)
                        .then((r) => [u.id, r.data])
                        .catch(() => [u.id, null])
                )
            );
            if (!cancelled) setLockStatus(Object.fromEntries(results));
        })();
        return () => { cancelled = true; };
    }, [users]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            loadUsers();
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

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

    const handleCreateUser = async (e) => {
        if (e?.preventDefault) e.preventDefault();

        if (formData.password !== formData.password_confirm) {
            toast.error('Passwords do not match');
            return;
        }

        if (!formData.username || !formData.email || !formData.password) {
            toast.error('Please fill all required fields');
            return;
        }

        // ✅ NEW: Mobile number is mandatory on create.
        if (!formData.phone?.trim()) {
            toast.error('Mobile number is required');
            return;
        }
        if (!isValidPhone(formData.phone)) {
            toast.error('Enter a valid mobile number (7–15 digits)');
            return;
        }

        try {
            // ✅ NEW: Send a normalised phone so the stored value matches
            // the format used by the backend validator. WhatsApp defaults
            // to the phone when the admin left it blank.
            const payload = {
                ...formData,
                phone: normalisePhone(formData.phone),
                whatsapp_number: formData.whatsapp_number
                    ? normalisePhone(formData.whatsapp_number)
                    : normalisePhone(formData.phone),
            };
            await api.post('/users/', payload);
            toast.success('User created successfully');
            setShowCreateModal(false);
            resetForm();
            loadUsers();
        } catch (err) {
            const errorData = err.response?.data;
            let errorMsg = 'Failed to create user';
            if (errorData?.phone) errorMsg = errorData.phone[0];
            else if (errorData?.whatsapp_number) errorMsg = errorData.whatsapp_number[0];
            else if (errorData?.detail) errorMsg = errorData.detail;
            else if (errorData) errorMsg = Object.values(errorData)[0];
            toast.error(Array.isArray(errorMsg) ? errorMsg[0] : errorMsg);
        }
    };

    const handleUpdateUser = async (e) => {
        if (e?.preventDefault) e.preventDefault();

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

            await api.patch(`/users/${selectedUser.id}/`, updateData);
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

    const handleToggleActive = async (user) => {
        try {
            const response = await api.post(`/users/${user.id}/toggle_active/`);
            toast.success(response.data.message || `User ${user.is_active !== false ? 'deactivated' : 'activated'}`);
            loadUsers();
        } catch (err) {
            toast.error('Failed to update user status');
        }
    };

    const handleUnlock = async (user) => {
        setActionBusy(true);
        try {
            const { data } = await api.post(`/users/${user.id}/unlock/`);
            toast.success(data.message || `Unlocked ${user.username}`);
            setLockStatus((prev) => ({
                ...prev,
                [user.id]: {
                    ...(prev[user.id] || {}),
                    is_locked: false,
                    failures_since_start: 0,
                    is_active: data.is_active,
                },
            }));
            await loadUsers();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to unlock user');
        } finally {
            setActionBusy(false);
        }
    };

    const openResetPassword = (user) => {
        setResetTarget(user);
    };

    const closeResetPassword = () => {
        if (actionBusy) return;
        setResetTarget(null);
    };

    // ✅ FIX: the modal calls this with (userId, newPassword).
    // We never touch the password fields from here — that's the modal's
    // state — so a keystroke can never re-render `Users` mid-typing.
    const handleResetPassword = async (userId, newPassword) => {
        if (!userId) return;
        setActionBusy(true);
        try {
            const { data } = await api.post(
                `/users/${userId}/reset_password/`,
                { password: newPassword }
            );
            toast.success(data.message || 'Password reset.');
            setResetTarget(null);
            await loadUsers();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to reset password');
        } finally {
            setActionBusy(false);
        }
    };

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

    const handleViewUser = (user) => {
        setSelectedUser(user);
        setShowViewModal(true);
    };

    const renderAvatar = (user) => (
        <UserAvatar $bg={getAvatarColor(user.username || 'user')}>
            {getInitials(user.username)}
        </UserAvatar>
    );

    const renderRoleBadge = (role) => (
        <RoleBadge className={role}>
            {getRoleIcon(role)}
            {getRoleLabel(role)}
        </RoleBadge>
    );

    const renderStatusBadge = (isActive) => {
        const active = isActive !== false;
        return (
            <Badge className={active ? 'active' : 'inactive'}>
                {active ? <CheckCircle fontSize="small" /> : <Block fontSize="small" />}
                {active ? 'Active' : 'Inactive'}
            </Badge>
        );
    };

    const renderLockBadge = (userId) => {
        const info = lockStatus[userId];
        if (!info?.is_locked) return null;
        return (
            <Badge className="locked" title={`${info.failures_since_start} failed attempt(s)`}>
                🔒 Locked
            </Badge>
        );
    };

    const needsUnlock = (user) => {
        const info = lockStatus[user.id];
        return Boolean(info?.is_locked) || user.is_active === false;
    };

    // ============================================
    // MAIN RENDER
    // ============================================

    return (
        <PageContainer>
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

            <StatsGrid>
                <StatCard>
                    <StatIcon $bg={`${C.primary}1A`} $color={C.primary}>
                        <Group />
                    </StatIcon>
                    <StatValue>{totalUsers}</StatValue>
                    <StatLabel>Total Users</StatLabel>
                </StatCard>

                <StatCard>
                    <StatIcon $bg={`${C.success}1A`} $color={C.success}>
                        <CheckCircle />
                    </StatIcon>
                    <StatValue>{stats.active}</StatValue>
                    <StatLabel>Active Users</StatLabel>
                </StatCard>

                <StatCard>
                    <StatIcon $bg={`${C.warning}1A`} $color={C.warningDark}>
                        <Storefront />
                    </StatIcon>
                    <StatValue>{stats.organizers}</StatValue>
                    <StatLabel>Organizers</StatLabel>
                </StatCard>

                <StatCard>
                    <StatIcon $bg={`${C.info}1A`} $color={C.infoDark}>
                        <AdminPanelSettings />
                    </StatIcon>
                    <StatValue>{stats.admins}</StatValue>
                    <StatLabel>Admins</StatLabel>
                </StatCard>
            </StatsGrid>

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

            <TableContainer>
                {loading ? (
                    <LoadingState>
                        <div style={{ textAlign: 'center' }}>
                            <Spinner />
                            Loading users...
                        </div>
                    </LoadingState>
                ) : error ? (
                    <LoadingState>
                        <div style={{ textAlign: 'center', color: C.error }}>
                            <p style={{ fontSize: '16px', fontWeight: 600, fontFamily: F.family }}>Error loading users</p>
                            <p style={{ fontSize: '14px', fontFamily: F.family }}>{error}</p>
                        </div>
                    </LoadingState>
                ) : users.length === 0 ? (
                    <EmptyState>
                        <EmptyIcon>👥</EmptyIcon>
                        <EmptyText>No users found</EmptyText>
                        <EmptySubtext>Try adjusting your search or filters</EmptySubtext>
                    </EmptyState>
                ) : isMobile ? (
                    <div style={{ padding: 12 }}>
                        {users.map((user) => (
                            <MobileUserCard key={user.id} onClick={() => handleViewUser(user)}>
                                <MobileUserHeader>
                                    {renderAvatar(user)}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <UserName>{user.first_name} {user.last_name}</UserName>
                                        <UserUsername>@{user.username}</UserUsername>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                        {renderStatusBadge(user.is_active !== false)}
                                        {renderLockBadge(user.id)}
                                    </div>
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
                                            openResetPassword(user);
                                        }}
                                        disabled={actionBusy}
                                    >
                                        <Password fontSize="small" />
                                        Reset
                                    </Button>
                                    {needsUnlock(user) && (
                                        <Button
                                            className="success"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleUnlock(user);
                                            }}
                                            disabled={actionBusy}
                                        >
                                            <LockOpen fontSize="small" />
                                            Unlock
                                        </Button>
                                    )}
                                    <Button
                                        className="secondary"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleActive(user);
                                        }}
                                        style={{ color: user.is_active !== false ? C.error : C.success }}
                                    >
                                        {user.is_active !== false ? <Block fontSize="small" /> : <LockOpen fontSize="small" />}
                                        {user.is_active !== false ? 'Block' : 'Unblock'}
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
                                    <TableCell>
                                        {renderStatusBadge(user.is_active !== false)}
                                        {renderLockBadge(user.id)}
                                    </TableCell>
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
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openResetPassword(user);
                                                }}
                                                title="Reset Password"
                                                disabled={actionBusy}
                                            >
                                                <Password fontSize="small" />
                                            </ActionButton>
                                            {needsUnlock(user) && (
                                                <ActionButton
                                                    className="success"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleUnlock(user);
                                                    }}
                                                    title="Unlock & reactivate"
                                                    disabled={actionBusy}
                                                >
                                                    <LockOpen fontSize="small" />
                                                </ActionButton>
                                            )}
                                            <ActionButton
                                                className="danger"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleToggleActive(user);
                                                }}
                                                title={user.is_active !== false ? 'Deactivate' : 'Activate'}
                                            >
                                                {user.is_active !== false ? <Block fontSize="small" /> : <LockOpen fontSize="small" />}
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
                                            $active={page === pageNum}
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

            {showCreateModal && (
                <UserFormModal
                    mode="create"
                    formData={formData}
                    setFormData={setFormData}
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={handleCreateUser}
                    currentUser={currentUser}
                />
            )}

            {showEditModal && selectedUser && (
                <UserFormModal
                    mode="edit"
                    formData={formData}
                    setFormData={setFormData}
                    onClose={() => {
                        setShowEditModal(false);
                        setSelectedUser(null);
                    }}
                    onSubmit={handleUpdateUser}
                    currentUser={currentUser}
                />
            )}

            {showViewModal && selectedUser && (
                <ViewUserModal
                    user={selectedUser}
                    isMobile={isMobile}
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

            {/* ✅ ResetPasswordModal is now a stable, module-scope
                component. Its password state lives inside it, so typing
                there never re-renders `Users` and never steals focus. */}
            {resetTarget && (
                <ResetPasswordModal
                    user={resetTarget}
                    onClose={closeResetPassword}
                    onReset={handleResetPassword}
                    busy={actionBusy}
                />
            )}
        </PageContainer>
    );
};

export default Users;