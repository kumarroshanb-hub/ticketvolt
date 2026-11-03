import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
} from '@mui/icons-material';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { theme } from '../../theme/tokens';
import {
  COUNTRY_OPTIONS,
  normaliseCountryName,
} from '../../config/countries';

// ✅ Platform Filter Imports
import usePlatformFilter from '../../hooks/usePlatformFilter';
import { OrgFilterSelect } from '../../components/Common';

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
const PageHeader = styled.div`display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;`;
const PageTitle = styled.h1`font-size: 24px; font-weight: 700; color: ${C.textPrimary}; margin: 0; font-family: ${F.family};`;
const PageSubtitle = styled.p`font-size: 14px; color: ${C.textSecondary}; margin: 4px 0 0; font-family: ${F.family};`;
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
const TableContainer = styled.div`background: ${C.bgCard}; border-radius: 12px; overflow: hidden; border: 1px solid ${C.borderLight};`;
const Table = styled.table`width: 100%; border-collapse: collapse;`;
const TableHead = styled.thead`background: ${C.bgSecondary}; border-bottom: 2px solid ${C.borderLight};`;
const TableHeaderCell = styled.th`padding: 12px 16px; text-align: ${props => props.align || 'left'}; font-size: 12px; font-weight: 600; color: ${C.textSecondary}; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; font-family: ${F.family};`;
const TableBody = styled.tbody`background: ${C.bgCard};`;
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
const TableCell = styled.td`padding: 12px 16px; font-size: 14px; color: ${C.textPrimary}; vertical-align: middle; font-family: ${F.family};`;
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
const MobileUserHeader = styled.div`display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;`;
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
const UserCell = styled.div`display: flex; align-items: center; gap: 12px;`;
const UserAvatar = styled.div`width: 40px; height: 40px; min-width: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; color: ${C.textInverse}; background: ${props => props.$bg};`;
const UserName = styled.div`font-weight: 600; font-size: 14px; color: ${C.textPrimary}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ${F.family};`;
const UserUsername = styled.div`font-size: 12px; color: ${C.textSecondary}; font-family: ${F.family};`;
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
 &.owner, &.organizer {
     background: ${C.warning}1A;
     color: ${C.warningDark};
 }
 &.admin {
     background: ${C.info}1A;
     color: ${C.infoDark};
 }
 &.staff {
     background: ${C.secondary}1A;
     color: ${C.secondaryDark};
 }
 &.member {
     background: ${C.primary}1A;
     color: ${C.primaryDark};
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
const Modal = styled.div`background: ${C.bgCard}; border-radius: 12px; width: ${props => props.$width || '600px'}; max-width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: ${theme.shadows.modal};`;
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
const FormGroup = styled.div`display: flex; flex-direction: column; gap: 6px;`;
const FormLabel = styled.label`font-size: 12px; font-weight: 600; color: ${C.textSecondary}; text-transform: uppercase; letter-spacing: 0.5px; font-family: ${F.family};`;
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
const FormError = styled.p`color: ${C.error}; font-size: 12px; margin: 4px 0 0; font-family: ${F.family};`;
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
const Spinner = styled.div`width: 40px; height: 40px; border: 3px solid ${C.primary}1A; border-top: 3px solid ${C.primary}; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;`;
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
const EmptyIcon = styled.div`font-size: 48px; margin-bottom: 16px;`;
const EmptyText = styled.h3`font-size: 18px; font-weight: 600; color: ${C.textPrimary}; margin: 0 0 8px; font-family: ${F.family};`;
const EmptySubtext = styled.p`font-size: 14px; color: ${C.textSecondary}; margin: 0; font-family: ${F.family};`;

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
    'owner': 'Owner',
    'admin': 'Admin',
    'staff': 'Staff',
    'member': 'Member',
    'organizer': 'Owner',
    'user': 'Regular User'
  };
  return labels[role] || role;
};

const getRoleIcon = (role) => {
  if (role === 'super_admin') return <SupervisorAccount fontSize="small" />;
  if (role === 'owner' || role === 'organizer') return <Storefront fontSize="small" />;
  if (role === 'admin') return <AdminPanelSettings fontSize="small" />;
  if (role === 'staff') return <Group fontSize="small" />;
  if (role === 'member') return <Person fontSize="small" />;
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

const PHONE_RE = /^\+?[0-9]{7,15}$/;
const normalisePhone = (raw) => String(raw || '').replace(/[\s-().]/g, '');
const isValidPhone = (raw) => PHONE_RE.test(normalisePhone(raw));

const normalizeUserResponse = (data) => {
  if (Array.isArray(data)) {
    return { users: data, count: data.length };
  }
  if (data && Array.isArray(data.results)) {
    return {
      users: data.results,
      count: typeof data.count === 'number' ? data.count : data.results.length,
    };
  }
  if (data && typeof data === 'object') {
    const values = Object.values(data).filter(
      (u) => u && u.id && u.username,
    );
    return { users: values, count: values.length };
  }
  return { users: [], count: 0 };
};

// ============================================================================
// MODAL COMPONENTS
// ============================================================================
const UserFormModal = ({
  mode,
  formData,
  setFormData,
  onClose,
  onSubmit,
  currentUser,
  countryOptions,
  defaultCountry,
  showOrgPicker,
  isSuperuser,
  requesterOrgs,
}) => {
  const isEdit = mode === 'edit';
  const phoneInvalid = !isEdit && formData.phone && !isValidPhone(formData.phone);

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
              {/* ✅ Username field completely removed. Backend auto-generates it from email. */}
              
              <FormGroup>
                <FormLabel>Email *</FormLabel>
                <FormInput
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="user@example.com"
                  required
                  disabled={isEdit}
                />
              </FormGroup>
              <FormGroup>
                <FormLabel>
                  Mobile Number {isEdit ? '(optional)' : '*'}
                </FormLabel>
                <FormInput
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
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
              
              {/* ✅ Passwordless Info Banner */}
              {!isEdit && (
                <div style={{ gridColumn: '1 / -1', padding: '12px', borderRadius: 8, background: `${C.info}1A`, border: `1px solid ${C.info}4D` }}>
                  <p style={{ margin: 0, fontSize: '13px', color: C.infoDark, fontFamily: F.family }}>
                    🔐 <strong>Passwordless:</strong> The user will receive a secure magic link via email to log in. No password is required.
                  </p>
                </div>
              )}

              <FormGroup>
                <FormLabel>First Name</FormLabel>
                <FormInput
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                  placeholder="John"
                />
              </FormGroup>
              <FormGroup>
                <FormLabel>Last Name</FormLabel>
                <FormInput
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                  placeholder="Doe"
                />
              </FormGroup>
              <FormGroup>
                <FormLabel>WhatsApp Number</FormLabel>
                <FormInput
                  type="tel"
                  value={formData.whatsapp_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, whatsapp_number: e.target.value }))}
                  placeholder="+91 9876543210"
                />
              </FormGroup>
              <FormGroup>
                <FormLabel>City</FormLabel>
                <FormInput
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="Mumbai"
                />
              </FormGroup>
              <FormGroup>
                <FormLabel>State</FormLabel>
                <FormInput
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                  placeholder="Maharashtra"
                />
              </FormGroup>
              <FormGroup>
                <FormLabel>Country</FormLabel>
                <FormSelect
                  value={normaliseCountryName(formData.country) || defaultCountry}
                  onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                >
                  {countryOptions.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </FormSelect>
              </FormGroup>
              
              {showOrgPicker && (
                <FormGroup>
                  <FormLabel>Organization {isSuperuser && formData.role !== 'owner' ? '(Optional)' : '*'}</FormLabel>
                  <FormSelect
                    value={formData.organization_id || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData(prev => ({
                        ...prev,
                        organization_id: val || null,
                      }));
                    }}
                    required={!isSuperuser || formData.role === 'owner'}
                  >
                    <option value="">
                      {isSuperuser && formData.role !== 'owner' ? 'None (Assign later via Organizations page)' : 'Select an organization…'}
                    </option>
                    {requesterOrgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </FormSelect>
                </FormGroup>
              )}

              <FormGroup>
                <FormLabel>Role</FormLabel>
                <FormSelect
                  value={formData.role}
                  onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                >
                  <option value="user">Regular User (Guest)</option>
                  <option value="member">Member</option>
                  <option value="staff">Staff</option>
                  <option value="owner">Owner</option> {/* ✅ Added Owner Role */}
                  {currentUser?.is_superuser && (
                    <>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </>
                  )}
                </FormSelect>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: C.textLight, fontFamily: F.family }}>
                  {formData.role === 'owner' 
                    ? 'Owners have full control over the selected organization.' 
                    : 'Organization Owners can also be managed via the Organizations page.'}
                </p>
              </FormGroup>
            </FormGrid>
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: `1px solid ${C.borderLight}` }}>
              <FormLabel style={{ marginBottom: '8px', display: 'block' }}>Account Status</FormLabel>
              <SwitchRow>
                <Switch>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
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
              {getInitials(user.first_name ? `${user.first_name} ${user.last_name}` : user.username)}
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
// MAIN COMPONENT
// ============================================================================
const Users = () => {
  const { user: currentUser } = useAuth();
  const { settings } = useSettings();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // ✅ 1. Initialize Platform Filter Hook
  const { 
    params: orgParams, 
    isPlatformAdmin, 
    orgFilter, 
    setOrgFilter, 
    organizations 
  } = usePlatformFilter();

  const platformCountry = useMemo(() => {
    const normalised = normaliseCountryName(settings?.country);
    return normalised || 'Hong Kong';
  }, [settings?.country]);

  const countryOptions = useMemo(() => {
    if (!platformCountry) return COUNTRY_OPTIONS;
    const preferred = COUNTRY_OPTIONS.filter((o) => o.value === platformCountry);
    const rest = COUNTRY_OPTIONS.filter((o) => o.value !== platformCountry);
    return [...preferred, ...rest];
  }, [platformCountry]);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const PAGE_SIZE = 10;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [lockStatus, setLockStatus] = useState({});

  const [requesterOrgs, setRequesterOrgs] = useState([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);

  // ✅ Removed username from state
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    whatsapp_number: '',
    city: '',
    state: '',
    country: platformCountry,
    role: 'user',
    is_active: true,
    organization_id: null,
  });

  useEffect(() => {
    let cancelled = false;
    api.get('/organizations/mine/')
      .then(({ data }) => {
        if (!cancelled) setRequesterOrgs(data.results ?? data ?? []);
      })
      .catch(() => {
        if (!cancelled) setRequesterOrgs([]);
      })
      .finally(() => {
        if (!cancelled) setOrgsLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const isSuperuser = Boolean(currentUser?.is_superuser);
  
  // ✅ Updated showOrgPicker logic to handle Owner role properly
  const showOrgPicker = useMemo(() => {
    const isMultiOrgAdmin = !isSuperuser && requesterOrgs.length > 1;
    const isCreatingOrgRole = ['owner', 'admin', 'staff', 'member'].includes(formData.role);
    
    if (isSuperuser) {
      return isCreatingOrgRole; // Superusers need to pick an org for any org-bound role
    }
    // Non-superusers: show picker if they have multiple orgs, or if they are creating an Owner (to be explicit about which org)
    return isMultiOrgAdmin || (formData.role === 'owner' && requesterOrgs.length > 0);
  }, [isSuperuser, requesterOrgs.length, formData.role]);

  useEffect(() => {
    if (requesterOrgs.length === 1) {
      setFormData((prev) => {
        if (!prev.organization_id) {
          return { ...prev, organization_id: requesterOrgs[0].id };
        }
        return prev;
      });
    }
  }, [requesterOrgs]);

  useEffect(() => {
    setFormData((prev) => {
      if (prev.country && prev.country !== '') return prev;
      return { ...prev, country: platformCountry };
    });
  }, [platformCountry]);

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    owners: 0,
    admins: 0,
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: page,
        page_size: PAGE_SIZE,
        search: search || undefined,
        role: roleFilter !== 'all' ? roleFilter : undefined,
        is_active: statusFilter !== 'all' ? statusFilter === 'active' : undefined,
        ...orgParams, // ✅ 2. Merge orgParams (Super Admin sees all if empty, or filtered if selected)
      };
      const response = await api.get('/users/', { params });
      const { users: pageUsers, count } = normalizeUserResponse(response.data);
      setUsers(pageUsers);
      setTotalUsers(count);
      setTotalPages(Math.max(1, Math.ceil(count / PAGE_SIZE)));
      
      setStats({
        total: count,
        active: pageUsers.filter((u) => u.is_active).length,
        owners: pageUsers.filter((u) => u.role === 'owner' || u.role === 'organizer').length,
        admins: pageUsers.filter((u) => ['admin', 'super_admin'].includes(u.role)).length,
      });
    } catch (err) {
      console.error('Error loading users:', err);
      setError(err.response?.data?.detail || 'Failed to load users');
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter, PAGE_SIZE, orgParams]); // ✅ 3. Added orgParams to dependency array

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

  // ✅ Removed username from resetForm
  const resetForm = () => {
    setFormData({
      email: '',
      first_name: '',
      last_name: '',
      phone: '',
      whatsapp_number: '',
      city: '',
      state: '',
      country: platformCountry,
      role: 'user',
      is_active: true,
      organization_id: requesterOrgs.length === 1 ? requesterOrgs[0].id : null,
    });
  };

  const handleCreateUser = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!formData.email) {
      toast.error('Email is required');
      return;
    }
    if (!formData.phone?.trim()) {
      toast.error('Mobile number is required');
      return;
    }
    if (!isValidPhone(formData.phone)) {
      toast.error('Enter a valid mobile number (7–15 digits)');
      return;
    }
    
    // ✅ Validation for Organization requirement based on role
    const orgBoundRoles = ['owner', 'admin', 'staff', 'member'];
    if (orgBoundRoles.includes(formData.role) && !formData.organization_id && !isSuperuser) {
        toast.error('Please select an organization for this role');
        return;
    }
    if (formData.role === 'owner' && !formData.organization_id) {
        toast.error('An organization must be selected to create an Owner');
        return;
    }

    try {
      const payload = {
        ...formData,
        organization_id: formData.organization_id || undefined,
        phone: normalisePhone(formData.phone),
        whatsapp_number: formData.whatsapp_number
          ? normalisePhone(formData.whatsapp_number)
          : normalisePhone(formData.phone),
      };
      
      // Ensure no legacy password fields are sent
      delete payload.password;
      delete payload.password_confirm;

      await api.post('/users/', payload);
      toast.success('User created successfully. A welcome email has been sent.');
      setShowCreateModal(false);
      resetForm();
      loadUsers();
    } catch (err) {
      const errorData = err.response?.data;
      
      if (errorData?.code === 'MULTI_ORG_REQUIRED') {
        if (Array.isArray(errorData.organizations) && errorData.organizations.length) {
          setRequesterOrgs(errorData.organizations);
        }
        toast.error(errorData.detail || 'Please select an organization.');
        return;
      }

      const errorMsg =
        errorData?.detail ||
        errorData?.phone?.[0] ||
        errorData?.whatsapp_number?.[0] ||
        Object.values(errorData || {})[0] ||
        'Failed to create user';
      toast.error(Array.isArray(errorMsg) ? errorMsg[0] : errorMsg);
    }
  };

  const handleUpdateUser = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!selectedUser) return;
    
    try {
      const updateData = { ...formData };
      delete updateData.password;
      delete updateData.password_confirm;
      
      await api.patch(`/users/${selectedUser.id}/`, updateData);
      
      toast.success('User updated successfully');
      setShowEditModal(false);
      setSelectedUser(null);
      resetForm();
      loadUsers();
    } catch (err) {
      const errorData = err.response?.data;
      const errorMsg =
        errorData?.error ||
        errorData?.detail ||
        Object.values(errorData || {})[0] ||
        'Failed to update user';
      toast.error(Array.isArray(errorMsg) ? errorMsg[0] : errorMsg);
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

  // ✅ Removed username from handleEditUser
  const handleEditUser = (user) => {
    setSelectedUser(user);
    setFormData({
      email: user.email || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone: user.profile?.phone || '',
      whatsapp_number: user.profile?.whatsapp_number || '',
      city: user.profile?.city || '',
      state: user.profile?.state || '',
      country: normaliseCountryName(user.profile?.country) || platformCountry,
      role: user.role || 'user',
      is_active: user.is_active !== false,
      organization_id: user.organization_id || null,
    });
    setShowEditModal(true);
  };

  const handleViewUser = (user) => {
    setSelectedUser(user);
    setShowViewModal(true);
  };

  const renderAvatar = (user) => (
    <UserAvatar $bg={getAvatarColor(user.username || 'user')}>
      {getInitials(user.first_name ? `${user.first_name} ${user.last_name}` : user.username)}
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
          <StatValue>{stats.owners}</StatValue>
          <StatLabel>Owners</StatLabel>
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
          {/* ✅ 4. Render the Organization Filter Dropdown */}
          <OrgFilterSelect
            isPlatformAdmin={isPlatformAdmin}
            organizations={organizations}
            orgFilter={orgFilter}
            setOrgFilter={setOrgFilter}
            onPageReset={() => setPage(1)}
          />
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
            <option value="super_admin">Super Admin</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
            <option value="member">Member</option>
            <option value="user">Regular User</option>
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
            <EmptyIcon></EmptyIcon>
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
          countryOptions={countryOptions}
          defaultCountry={platformCountry}
          showOrgPicker={showOrgPicker}
          isSuperuser={isSuperuser}
          requesterOrgs={requesterOrgs}
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
          countryOptions={countryOptions}
          defaultCountry={platformCountry}
          showOrgPicker={showOrgPicker}
          isSuperuser={isSuperuser}
          requesterOrgs={requesterOrgs}
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
    </PageContainer>
  );
};

export default Users;