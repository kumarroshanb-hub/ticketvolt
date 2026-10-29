// frontend/src/pages/Profile/Profile.js
import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';                       // ✅ NEW
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import {
    Person as PersonIcon,
    Email as EmailIcon,
    Badge as BadgeIcon,
    Save as SaveIcon,
    ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

import { theme } from '../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

// ============================================
// STYLED COMPONENTS
// ============================================

const PageWrapper = styled.div`
    max-width: 720px;
    margin: 0 auto;
    padding: 0 0 40px;
`;

const Card = styled.div`
    background: ${C.bgCard};
    border: 1px solid ${C.borderLight};
    border-radius: 16px;
    padding: 28px;
    box-shadow: ${theme.shadows.card};
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 28px;
    padding-bottom: 24px;
    border-bottom: 1px solid ${C.bgInput};

    @media (max-width: 600px) {
        flex-direction: column;
        text-align: center;
    }
`;

const Avatar = styled.div`
    width: 88px;
    height: 88px;
    min-width: 88px;
    border-radius: 50%;
    background: ${C.primaryGradient};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${C.textInverse};
    font-weight: 700;
    font-size: 36px;
    box-shadow: 0 8px 20px rgba(51, 51, 51, 0.25);
`;

const HeaderText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
`;

const Name = styled.h1`
    font-size: 24px;
    font-weight: 700;
    color: ${C.textPrimary};
    margin: 0;
    word-break: break-word;
`;

const RolePill = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.4px;

    background: ${p => {
        switch (p.$role) {
            case 'super_admin': return `${C.success}1A`;
            case 'admin':       return `${C.info}1A`;
            case 'organizer':   return `${C.warning}1A`;
            default:            return C.bgInput;
        }
    }};
    color: ${p => {
        switch (p.$role) {
            case 'super_admin': return C.successDark;
            case 'admin':       return C.infoDark;
            case 'organizer':   return C.warningDark;
            default:            return C.textSecondary;
        }
    }};

    @media (max-width: 600px) {
        align-self: center;
    }
`;

const SectionTitle = styled.h2`
    font-size: 14px;
    font-weight: 700;
    color: ${C.textSecondary};
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin: 0 0 16px;
`;

const Field = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 14px 0;
    border-bottom: 1px solid ${C.bgInput};

    &:last-of-type {
        border-bottom: none;
    }
`;

const FieldIcon = styled.div`
    width: 38px;
    height: 38px;
    min-width: 38px;
    border-radius: 10px;
    background: ${C.bgInput};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${C.primary};

    svg {
        font-size: 20px;
    }
`;

const FieldBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
`;

const FieldLabel = styled.span`
    font-size: 12px;
    color: ${C.textSecondary};
    font-weight: 500;
`;

const FieldValue = styled.span`
    font-size: 15px;
    color: ${C.textPrimary};
    font-weight: 500;
    word-break: break-word;
`;

const Input = styled.input`
    font-size: 15px;
    color: ${C.textPrimary};
    font-weight: 500;
    padding: 8px 12px;
    border: 1px solid ${C.borderHover};
    border-radius: 8px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    font-family: ${F.family};

    &:focus {
        border-color: ${C.primary};
        box-shadow: 0 0 0 4px ${C.primary}1A;
    }
`;

const Actions = styled.div`
    display: flex;
    gap: 10px;
    margin-top: 24px;
    flex-wrap: wrap;
`;

const Button = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    font-size: 14px;
    font-weight: 600;
    border-radius: 10px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;
    min-height: 44px;
    font-family: ${F.family};

    svg { font-size: 18px; }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const PrimaryButton = styled(Button)`
    background: ${C.primary};
    color: ${C.textInverse};

    &:hover:not(:disabled) {
        background: ${C.primaryDark};
    }
`;

const GhostButton = styled(Button)`
    background: ${C.bgCard};
    color: ${C.textPrimary};
    border-color: ${C.borderLight};

    &:hover:not(:disabled) {
        background: ${C.bgPrimary};
        border-color: ${C.borderHover};
    }
`;

const Message = styled.div`
    margin-top: 16px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;

    background: ${p => (p.$error ? `${C.error}1A` : `${C.success}1A`)};
    color:      ${p => (p.$error ? C.errorDark : C.successDark)};
    border: 1px solid ${p => (p.$error ? `${C.error}4D` : `${C.success}4D`)};
`;

// ============================================
// COMPONENT
// ============================================

const Profile = () => {
    const { user, updateProfile } = useAuth();
    const { role, isSuperAdmin, isAdmin, isOrganizer } = useRole();
    const { t } = useTranslation();                                    // ✅ NEW
    const navigate = useNavigate();

    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(user?.name || user?.username || '');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    const getRoleLabel = () => {
        if (isSuperAdmin) return t('roles.superAdmin');                // ✅ FIX
        if (isAdmin) return t('roles.admin');
        if (isOrganizer) return t('roles.organizer');
        return t('roles.user');
    };

    const getInitial = () => {
        const source = user?.name || user?.username || 'U';
        return source.charAt(0).toUpperCase();
    };

    const handleSave = async () => {
        if (!updateProfile) {
            setMessage({ text: t('profile.editingUnsupported'), error: true });
            return;
        }
        if (!name.trim()) {
            setMessage({ text: t('profile.nameEmpty'), error: true });
            return;
        }

        try {
            setSaving(true);
            setMessage(null);
            await updateProfile({ name: name.trim() });
            setMessage({ text: t('profile.saveSuccess'), error: false });
            setEditing(false);
        } catch (err) {
            setMessage({
                text: err?.message || t('profile.saveFailed'),
                error: true,
            });
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setName(user?.name || user?.username || '');
        setEditing(false);
        setMessage(null);
    };

    return (
        <PageWrapper>
            <Card>
                <Header>
                    <Avatar>{getInitial()}</Avatar>
                    <HeaderText>
                        <Name>{user?.name || user?.username || t('common.user')}</Name>
                        <RolePill $role={role}>{getRoleLabel()}</RolePill>
                    </HeaderText>
                </Header>

                <SectionTitle>{t('profile.accountInformation')}</SectionTitle>

                <Field>
                    <FieldIcon><PersonIcon /></FieldIcon>
                    <FieldBody>
                        <FieldLabel>{t('profile.fullName')}</FieldLabel>
                        {editing ? (
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('profile.enterName')}
                                autoFocus
                            />
                        ) : (
                            <FieldValue>{user?.name || '—'}</FieldValue>
                        )}
                    </FieldBody>
                </Field>

                <Field>
                    <FieldIcon><EmailIcon /></FieldIcon>
                    <FieldBody>
                        <FieldLabel>{t('profile.email')}</FieldLabel>
                        <FieldValue>{user?.email || '—'}</FieldValue>
                    </FieldBody>
                </Field>

                <Field>
                    <FieldIcon><BadgeIcon /></FieldIcon>
                    <FieldBody>
                        <FieldLabel>{t('profile.username')}</FieldLabel>
                        <FieldValue>{user?.username || '—'}</FieldValue>
                    </FieldBody>
                </Field>

                <Field>
                    <FieldIcon><BadgeIcon /></FieldIcon>
                    <FieldBody>
                        <FieldLabel>{t('profile.role')}</FieldLabel>
                        <FieldValue>{getRoleLabel()}</FieldValue>
                    </FieldBody>
                </Field>

                {message && (
                    <Message $error={message.error}>{message.text}</Message>
                )}

                <Actions>
                    {editing ? (
                        <>
                            <PrimaryButton
                                onClick={handleSave}
                                disabled={saving}
                            >
                                <SaveIcon />
                                {saving ? t('profile.saving') : t('profile.saveChanges')}
                            </PrimaryButton>
                            <GhostButton
                                onClick={handleCancel}
                                disabled={saving}
                            >
                                {t('common.cancel')}
                            </GhostButton>
                        </>
                    ) : (
                        <>
                            <PrimaryButton
                                onClick={() => {
                                    setEditing(true);
                                    setMessage(null);
                                }}
                                disabled={!updateProfile}
                                title={
                                    !updateProfile
                                        ? t('profile.editingUnsupported')
                                        : undefined
                                }
                            >
                                {t('profile.editProfile')}
                            </PrimaryButton>
                            <GhostButton onClick={() => navigate(-1)}>
                                <ArrowBackIcon />
                                {t('common.back')}
                            </GhostButton>
                        </>
                    )}
                </Actions>
            </Card>
        </PageWrapper>
    );
};

export default Profile;