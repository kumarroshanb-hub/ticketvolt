// frontend/src/pages/Profile/Profile.js
import React, { useState } from 'react';
import styled from 'styled-components';
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

// ============================================
// STYLED COMPONENTS
// ============================================

const PageWrapper = styled.div`
    max-width: 720px;
    margin: 0 auto;
    padding: 0 0 40px;
`;

const Card = styled.div`
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 28px;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 28px;
    padding-bottom: 24px;
    border-bottom: 1px solid #f1f5f9;

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
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    font-size: 36px;
    box-shadow: 0 8px 20px rgba(79, 70, 229, 0.25);
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
    color: #0f172a;
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
            case 'super_admin': return '#dcfce7';
            case 'admin':       return '#dbeafe';
            case 'organizer':   return '#fef3c7';
            default:            return '#f1f5f9';
        }
    }};
    color: ${p => {
        switch (p.$role) {
            case 'super_admin': return '#16a34a';
            case 'admin':       return '#2563eb';
            case 'organizer':   return '#d97706';
            default:            return '#64748b';
        }
    }};

    @media (max-width: 600px) {
        align-self: center;
    }
`;

const SectionTitle = styled.h2`
    font-size: 14px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin: 0 0 16px;
`;

const Field = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 14px 0;
    border-bottom: 1px solid #f1f5f9;

    &:last-of-type {
        border-bottom: none;
    }
`;

const FieldIcon = styled.div`
    width: 38px;
    height: 38px;
    min-width: 38px;
    border-radius: 10px;
    background: #f1f5f9;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #4f46e5;

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
    color: #64748b;
    font-weight: 500;
`;

const FieldValue = styled.span`
    font-size: 15px;
    color: #0f172a;
    font-weight: 500;
    word-break: break-word;
`;

const Input = styled.input`
    font-size: 15px;
    color: #0f172a;
    font-weight: 500;
    padding: 8px 12px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;

    &:focus {
        border-color: #4f46e5;
        box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
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
    font-family: inherit;

    svg { font-size: 18px; }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const PrimaryButton = styled(Button)`
    background: #4f46e5;
    color: #ffffff;

    &:hover:not(:disabled) {
        background: #4338ca;
    }
`;

const GhostButton = styled(Button)`
    background: #ffffff;
    color: #0f172a;
    border-color: #e2e8f0;

    &:hover:not(:disabled) {
        background: #f8fafc;
        border-color: #cbd5e1;
    }
`;

const Message = styled.div`
    margin-top: 16px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;

    background: ${p => (p.$error ? '#fef2f2' : '#ecfdf5')};
    color:      ${p => (p.$error ? '#b91c1c' : '#047857')};
    border: 1px solid ${p => (p.$error ? '#fecaca' : '#a7f3d0')};
`;

// ============================================
// COMPONENT
// ============================================

const Profile = () => {
    const { user, updateProfile } = useAuth();
    const { role, isSuperAdmin, isAdmin, isOrganizer } = useRole();
    const navigate = useNavigate();

    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(user?.name || user?.username || '');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null); // { text, error }

    const getRoleLabel = () => {
        if (isSuperAdmin) return 'Super Admin';
        if (isAdmin) return 'Admin';
        if (isOrganizer) return 'Organizer';
        return 'User';
    };

    const getInitial = () => {
        const source = user?.name || user?.username || 'U';
        return source.charAt(0).toUpperCase();
    };

    const handleSave = async () => {
        if (!updateProfile) {
            setMessage({ text: 'Profile editing is not supported.', error: true });
            return;
        }
        if (!name.trim()) {
            setMessage({ text: 'Name cannot be empty.', error: true });
            return;
        }

        try {
            setSaving(true);
            setMessage(null);
            await updateProfile({ name: name.trim() });
            setMessage({ text: 'Profile updated successfully.', error: false });
            setEditing(false);
        } catch (err) {
            setMessage({
                text: err?.message || 'Failed to update profile.',
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
                        <Name>{user?.name || user?.username || 'User'}</Name>
                        <RolePill $role={role}>{getRoleLabel()}</RolePill>
                    </HeaderText>
                </Header>

                <SectionTitle>Account Information</SectionTitle>

                <Field>
                    <FieldIcon><PersonIcon /></FieldIcon>
                    <FieldBody>
                        <FieldLabel>Full name</FieldLabel>
                        {editing ? (
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter your name"
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
                        <FieldLabel>Email</FieldLabel>
                        <FieldValue>{user?.email || '—'}</FieldValue>
                    </FieldBody>
                </Field>

                <Field>
                    <FieldIcon><BadgeIcon /></FieldIcon>
                    <FieldBody>
                        <FieldLabel>Username</FieldLabel>
                        <FieldValue>{user?.username || '—'}</FieldValue>
                    </FieldBody>
                </Field>

                <Field>
                    <FieldIcon><BadgeIcon /></FieldIcon>
                    <FieldBody>
                        <FieldLabel>Role</FieldLabel>
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
                                {saving ? 'Saving…' : 'Save changes'}
                            </PrimaryButton>
                            <GhostButton
                                onClick={handleCancel}
                                disabled={saving}
                            >
                                Cancel
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
                                        ? 'Editing not supported by AuthContext'
                                        : undefined
                                }
                            >
                                Edit profile
                            </PrimaryButton>
                            <GhostButton onClick={() => navigate(-1)}>
                                <ArrowBackIcon />
                                Back
                            </GhostButton>
                        </>
                    )}
                </Actions>
            </Card>
        </PageWrapper>
    );
};

export default Profile;