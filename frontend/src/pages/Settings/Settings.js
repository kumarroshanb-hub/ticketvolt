// frontend/src/pages/Settings/Settings.js
import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import {
    Person as PersonIcon,
    Security as SecurityIcon,
    Notifications as NotificationsIcon,
    Palette as PaletteIcon,
    Language as LanguageIcon,
    Settings as SettingsIcon,
    Save as SaveIcon,
} from '@mui/icons-material';
import {
    Alert,
    CircularProgress,
    Switch,
    FormControlLabel,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageSubtitle,
    PageHeaderLeft,
    PrimaryButton,
} from '../../components/Common';
import { theme as tokens } from '../../theme/tokens';
import PlatformSettingsTab from './PlatformSettingsTab';
import { useRole } from '../../context/RoleContext';

const C = tokens.colors;
const F = tokens.fonts;

// ============================================
// STYLED COMPONENTS
// ============================================

const SettingsGrid = styled.div`
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 24px;

    @media (max-width: 900px) {
        grid-template-columns: 1fr;
        gap: 16px;
    }
`;

const SettingsSidebar = styled.div`
    background: ${props => props.theme.colors.bgCard};
    border: 1px solid ${props => props.theme.colors.borderLight};
    border-radius: ${props => props.theme.borderRadius.lg};
    padding: 8px;
    height: fit-content;
    box-shadow: ${props => props.theme.shadows.card};

    @media (max-width: 900px) {
        display: flex;
        flex-direction: row;
        overflow-x: auto;
        padding: 6px;
        gap: 6px;
        -webkit-overflow-scrolling: touch;
        scroll-snap-type: x proximity;

        &::-webkit-scrollbar {
            height: 0;
        }
    }
`;

const SettingsTab = styled.button`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    width: 100%;
    min-height: 44px;
    border: none;
    background: ${props => props.active ? 'rgba(51, 51, 51, 0.08)' : 'transparent'};
    color: ${props => props.active ? props.theme.colors.primary : props.theme.colors.textSecondary};
    border-radius: ${props => props.theme.borderRadius.md};
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
    touch-action: manipulation;
    font-family: ${F.family};

    .icon {
        font-size: 20px;
        color: ${props => props.active ? props.theme.colors.primary : props.theme.colors.textMuted};
    }

    &:hover {
        background: ${props => props.active ? 'rgba(51, 51, 51, 0.08)' : props.theme.colors.bgCardHover};
        color: ${props => props.theme.colors.textPrimary};

        .icon {
            color: ${props => props.active ? props.theme.colors.primary : props.theme.colors.textPrimary};
        }
    }

    @media (max-width: 900px) {
        flex-shrink: 0;
        width: auto;
        padding: 8px 12px;
        gap: 6px;
        white-space: nowrap;
        font-size: 13px;
        scroll-snap-align: start;
    }
`;

const SettingsContent = styled.div`
    background: ${props => props.theme.colors.bgCard};
    border: 1px solid ${props => props.theme.colors.borderLight};
    border-radius: ${props => props.theme.borderRadius.lg};
    padding: 32px;
    box-shadow: ${props => props.theme.shadows.card};

    @media (max-width: 900px) {
        padding: 20px;
    }

    @media (max-width: 600px) {
        padding: 16px;
    }
`;

const SettingsSection = styled.div`
    h2 {
        font-size: 20px;
        font-weight: 600;
        color: ${props => props.theme.colors.textPrimary};
        margin-bottom: 8px;
        font-family: ${F.family};

        @media (max-width: 900px) {
            font-size: 18px;
        }
    }

    .description {
        color: ${props => props.theme.colors.textSecondary};
        font-size: 14px;
        margin-bottom: 24px;
    }
`;

const FormGroup = styled.div`
    margin-bottom: 20px;

    @media (max-width: 900px) {
        margin-bottom: 16px;
    }

    label {
        display: block;
        font-size: 14px;
        font-weight: 500;
        color: ${props => props.theme.colors.textSecondary};
        margin-bottom: 6px;
    }

    input, select {
        width: 100%;
        padding: 10px 14px;
        border-radius: ${props => props.theme.borderRadius.md};
        border: 1px solid ${props => props.theme.colors.borderLight};
        background: ${props => props.theme.colors.bgInput};
        color: ${props => props.theme.colors.textPrimary};
        font-size: 16px;
        transition: all 0.2s ease;
        font-family: ${F.family};
        min-height: 44px;
        box-sizing: border-box;

        &:focus {
            outline: none;
            border-color: ${props => props.theme.colors.primary};
            box-shadow: 0 0 0 3px rgba(51, 51, 51, 0.1);
        }

        &::placeholder {
            color: ${props => props.theme.colors.textMuted};
        }
    }

    select {
        appearance: auto;
    }
`;

const SaveButton = styled(PrimaryButton)`
    padding: 12px 32px;
    font-size: 14px;
    margin-top: 8px;
    min-height: 44px;

    @media (max-width: 900px) {
        width: 100%;
    }
`;

// Shared MUI Switch styling — reads from tokens
const switchSx = {
    '& .MuiSwitch-switchBase.Mui-checked': { color: C.primary },
    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
        backgroundColor: C.primary,
    },
};

// ============================================
// TABS CONFIG
// ============================================

// The 5 user-facing tabs are always present.
// The Platform tab is appended only for superadmins.
const getSettingsTabs = (canManagePlatform, t) => {
    const tabs = [
        { id: 'profile', label: t('settings.tabProfile'), icon: <PersonIcon /> },
        { id: 'security', label: t('settings.tabSecurity'), icon: <SecurityIcon /> },
        { id: 'notifications', label: t('settings.tabNotifications'), icon: <NotificationsIcon /> },
        { id: 'appearance', label: t('settings.tabAppearance'), icon: <PaletteIcon /> },
        { id: 'language', label: t('settings.tabLanguage'), icon: <LanguageIcon /> },
    ];
    if (canManagePlatform) {
        tabs.push({ id: 'platform', label: t('settings.tabPlatform'), icon: <SettingsIcon /> });
    }
    return tabs;
};

// ============================================
// MAIN COMPONENT
// ============================================

const Settings = () => {
    const { t } = useTranslation();
    const { user, updateUser } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Platform settings tab is for superadmin only.
    const { isSuperAdmin } = useRole();
    const canManagePlatform = Boolean(isSuperAdmin);

    const [activeTab, setActiveTab] = useState('profile');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        timezone: 'UTC+5:30',
        language: 'English',
        theme: 'light',
        notifications: true,
        emailNotifications: true,
        pushNotifications: true,
    });
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });

    // Defensive: if the user's role changes (or a non-admin lands here with
    // a stale activeTab='platform' value), fall back to 'profile'.
    useEffect(() => {
        if (activeTab === 'platform' && !canManagePlatform) {
            setActiveTab('profile');
        }
    }, [activeTab, canManagePlatform]);

    // Memoized so the effect dep list is stable.
    const loadSettings = useCallback(async () => {
        try {
            const response = await api.get('/settings/');
            if (response.data) {
                setFormData((prev) => ({ ...prev, ...response.data }));
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handlePasswordChange = (e) => {
        const { name, value } = e.target;
        setPasswordData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSaveProfile = async () => {
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            const response = await api.put('/settings/profile/', {
                name: formData.name,
                email: formData.email,
                timezone: formData.timezone,
            });

            if (updateUser) updateUser(response.data);

            setSuccess(t('settings.profileUpdated'));
            toast.success(t('settings.profileUpdated'));
        } catch (err) {
            console.error('Save error:', err);
            setError(err.response?.data?.detail || t('settings.profileUpdateFailed'));
            toast.error(t('settings.profileUpdateFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleSavePassword = async () => {
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setError(t('settings.passwordsMismatch'));
            toast.error(t('settings.passwordsMismatch'));
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');
        try {
            await api.put('/settings/password/', {
                current_password: passwordData.currentPassword,
                new_password: passwordData.newPassword,
            });

            setSuccess(t('settings.passwordUpdated'));
            toast.success(t('settings.passwordUpdated'));
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err) {
            console.error('Password error:', err);
            setError(err.response?.data?.detail || t('settings.passwordUpdateFailed'));
            toast.error(t('settings.passwordUpdateFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleSaveNotifications = async () => {
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            await api.put('/settings/notifications/', {
                email_notifications: formData.emailNotifications,
                push_notifications: formData.pushNotifications,
            });

            setSuccess(t('settings.notificationsUpdated'));
            toast.success(t('settings.notificationsUpdated'));
        } catch (err) {
            console.error('Save error:', err);
            setError(err.response?.data?.detail || t('settings.notificationsUpdateFailed'));
            toast.error(t('settings.notificationsUpdateFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAppearance = async () => {
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            await api.put('/settings/appearance/', { theme: formData.theme });

            setSuccess(t('settings.themeUpdated'));
            toast.success(t('settings.themeUpdated'));
        } catch (err) {
            console.error('Save error:', err);
            setError(err.response?.data?.detail || t('settings.themeUpdateFailed'));
            toast.error(t('settings.themeUpdateFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleSaveLanguage = async () => {
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            await api.put('/settings/language/', { language: formData.language });

            setSuccess(t('settings.languageUpdated'));
            toast.success(t('settings.languageUpdated'));
        } catch (err) {
            console.error('Save error:', err);
            setError(err.response?.data?.detail || t('settings.languageUpdateFailed'));
            toast.error(t('settings.languageUpdateFailed'));
        } finally {
            setLoading(false);
        }
    };

    // ------------------------------------------------------------
    // TAB CONTENT
    // ------------------------------------------------------------

    const renderContent = () => {
        switch (activeTab) {
            case 'profile':
                return (
                    <SettingsSection>
                        <h2>{t('settings.profileTitle')}</h2>
                        <p className="description">{t('settings.profileSubtitle')}</p>

                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                        <FormGroup>
                            <label htmlFor="fullName">{t('settings.fullNameLabel')}</label>
                            <input
                                id="fullName"
                                name="name"
                                type="text"
                                value={formData.name}
                                onChange={handleChange}
                                autoComplete="name"
                                placeholder={t('settings.fullNamePlaceholder')}
                            />
                        </FormGroup>
                        <FormGroup>
                            <label htmlFor="emailAddress">{t('settings.emailLabel')}</label>
                            <input
                                id="emailAddress"
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleChange}
                                autoComplete="email"
                                inputMode="email"
                                placeholder={t('settings.emailPlaceholder')}
                            />
                        </FormGroup>
                        <FormGroup>
                            <label htmlFor="timezone">{t('settings.timezoneLabel')}</label>
                            <select
                                id="timezone"
                                name="timezone"
                                value={formData.timezone}
                                onChange={handleChange}
                            >
                                <option value="UTC-12">UTC-12</option>
                                <option value="UTC-11">UTC-11</option>
                                <option value="UTC-10">UTC-10</option>
                                <option value="UTC-9">UTC-9</option>
                                <option value="UTC-8">UTC-8</option>
                                <option value="UTC-7">UTC-7</option>
                                <option value="UTC-6">UTC-6</option>
                                <option value="UTC-5">UTC-5 (EST)</option>
                                <option value="UTC-4">UTC-4</option>
                                <option value="UTC-3">UTC-3</option>
                                <option value="UTC-2">UTC-2</option>
                                <option value="UTC-1">UTC-1</option>
                                <option value="UTC+0">UTC (GMT)</option>
                                <option value="UTC+1">UTC+1 (CET)</option>
                                <option value="UTC+2">UTC+2 (EET)</option>
                                <option value="UTC+3">UTC+3</option>
                                <option value="UTC+4">UTC+4</option>
                                <option value="UTC+5">UTC+5</option>
                                <option value="UTC+5:30">UTC+5:30 (IST)</option>
                                <option value="UTC+6">UTC+6</option>
                                <option value="UTC+7">UTC+7</option>
                                <option value="UTC+8">UTC+8 (SGT)</option>
                                <option value="UTC+9">UTC+9 (JST)</option>
                                <option value="UTC+10">UTC+10</option>
                                <option value="UTC+11">UTC+11</option>
                                <option value="UTC+12">UTC+12</option>
                            </select>
                        </FormGroup>
                        <SaveButton onClick={handleSaveProfile} disabled={loading}>
                            {loading ? (
                                <CircularProgress size={24} sx={{ color: C.textInverse }} />
                            ) : (
                                <>
                                    <SaveIcon fontSize="small" />
                                    {t('settings.saveChanges')}
                                </>
                            )}
                        </SaveButton>
                    </SettingsSection>
                );

            case 'security':
                return (
                    <SettingsSection>
                        <h2>{t('settings.securityTitle')}</h2>
                        <p className="description">{t('settings.securitySubtitle')}</p>

                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                        <FormGroup>
                            <label htmlFor="currentPassword">{t('settings.currentPasswordLabel')}</label>
                            <input
                                id="currentPassword"
                                name="currentPassword"
                                type={showPassword ? 'text' : 'password'}
                                placeholder={t('settings.currentPasswordPlaceholder')}
                                value={passwordData.currentPassword}
                                onChange={handlePasswordChange}
                                autoComplete="current-password"
                            />
                        </FormGroup>
                        <FormGroup>
                            <label htmlFor="newPassword">{t('settings.newPasswordLabel')}</label>
                            <input
                                id="newPassword"
                                name="newPassword"
                                type={showPassword ? 'text' : 'password'}
                                placeholder={t('settings.newPasswordPlaceholder')}
                                value={passwordData.newPassword}
                                onChange={handlePasswordChange}
                                autoComplete="new-password"
                            />
                        </FormGroup>
                        <FormGroup>
                            <label htmlFor="confirmPassword">{t('settings.confirmPasswordLabel')}</label>
                            <input
                                id="confirmPassword"
                                name="confirmPassword"
                                type={showPassword ? 'text' : 'password'}
                                placeholder={t('settings.confirmPasswordPlaceholder')}
                                value={passwordData.confirmPassword}
                                onChange={handlePasswordChange}
                                autoComplete="new-password"
                            />
                        </FormGroup>

                        <FormControlLabel
                            control={
                                <Switch
                                    checked={showPassword}
                                    onChange={() => setShowPassword((v) => !v)}
                                    sx={switchSx}
                                />
                            }
                            label={t('settings.showPasswords')}
                            sx={{ color: C.textSecondary, mb: 2 }}
                        />

                        <SaveButton onClick={handleSavePassword} disabled={loading}>
                            {loading ? (
                                <CircularProgress size={24} sx={{ color: C.textInverse }} />
                            ) : (
                                <>
                                    <SaveIcon fontSize="small" />
                                    {t('settings.updatePassword')}
                                </>
                            )}
                        </SaveButton>
                    </SettingsSection>
                );

            case 'notifications':
                return (
                    <SettingsSection>
                        <h2>{t('settings.notificationsTitle')}</h2>
                        <p className="description">{t('settings.notificationsSubtitle')}</p>

                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                        <FormGroup>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.emailNotifications}
                                        onChange={handleChange}
                                        name="emailNotifications"
                                        sx={switchSx}
                                    />
                                }
                                label={t('settings.emailNotificationsLabel')}
                                sx={{ color: C.textSecondary }}
                            />
                        </FormGroup>
                        <FormGroup>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.pushNotifications}
                                        onChange={handleChange}
                                        name="pushNotifications"
                                        sx={switchSx}
                                    />
                                }
                                label={t('settings.pushNotificationsLabel')}
                                sx={{ color: C.textSecondary }}
                            />
                        </FormGroup>

                        <SaveButton onClick={handleSaveNotifications} disabled={loading}>
                            {loading ? (
                                <CircularProgress size={24} sx={{ color: C.textInverse }} />
                            ) : (
                                <>
                                    <SaveIcon fontSize="small" />
                                    {t('settings.savePreferences')}
                                </>
                            )}
                        </SaveButton>
                    </SettingsSection>
                );

            case 'appearance':
                return (
                    <SettingsSection>
                        <h2>{t('settings.appearanceTitle')}</h2>
                        <p className="description">{t('settings.appearanceSubtitle')}</p>

                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                        <FormGroup>
                            <label htmlFor="themeSelect">{t('settings.themeLabel')}</label>
                            <select
                                id="themeSelect"
                                name="theme"
                                value={formData.theme}
                                onChange={handleChange}
                            >
                                <option value="light">{t('settings.themeLight')}</option>
                                <option value="dark">{t('settings.themeDark')}</option>
                                <option value="system">{t('settings.themeSystem')}</option>
                            </select>
                        </FormGroup>

                        <SaveButton onClick={handleSaveAppearance} disabled={loading}>
                            {loading ? (
                                <CircularProgress size={24} sx={{ color: C.textInverse }} />
                            ) : (
                                <>
                                    <SaveIcon fontSize="small" />
                                    {t('settings.saveTheme')}
                                </>
                            )}
                        </SaveButton>
                    </SettingsSection>
                );

            case 'language':
                return (
                    <SettingsSection>
                        <h2>{t('settings.languageTitle')}</h2>
                        <p className="description">{t('settings.languageSubtitle')}</p>

                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                        <FormGroup>
                            <label htmlFor="languageSelect">{t('settings.languageLabel')}</label>
                            <select
                                id="languageSelect"
                                name="language"
                                value={formData.language}
                                onChange={handleChange}
                            >
                                <option value="English">{t('settings.languageOptionEnglish')}</option>
                                <option value="Spanish">{t('settings.languageOptionSpanish')}</option>
                                <option value="French">{t('settings.languageOptionFrench')}</option>
                                <option value="German">{t('settings.languageOptionGerman')}</option>
                                <option value="Chinese">{t('settings.languageOptionChineseSimplified')}</option>
                                <option value="Chinese Traditional">{t('settings.languageOptionChineseTraditional')}</option>
                                <option value="Japanese">{t('settings.languageOptionJapanese')}</option>
                                <option value="Korean">{t('settings.languageOptionKorean')}</option>
                                <option value="Portuguese">{t('settings.languageOptionPortuguese')}</option>
                                <option value="Russian">{t('settings.languageOptionRussian')}</option>
                                <option value="Arabic">{t('settings.languageOptionArabic')}</option>
                                <option value="Hindi">{t('settings.languageOptionHindi')}</option>
                                <option value="Italian">{t('settings.languageOptionItalian')}</option>
                                <option value="Dutch">{t('settings.languageOptionDutch')}</option>
                            </select>
                        </FormGroup>

                        <SaveButton onClick={handleSaveLanguage} disabled={loading}>
                            {loading ? (
                                <CircularProgress size={24} sx={{ color: C.textInverse }} />
                            ) : (
                                <>
                                    <SaveIcon fontSize="small" />
                                    {t('settings.saveLanguage')}
                                </>
                            )}
                        </SaveButton>
                    </SettingsSection>
                );

            case 'platform':
                // Render the platform tab only if the user is allowed to see it.
                if (!canManagePlatform) {
                    return (
                        <SettingsSection>
                            <h2>{t('settings.accessDeniedTitle')}</h2>
                            <p className="description">
                                {t('settings.accessDeniedBody')}
                            </p>
                        </SettingsSection>
                    );
                }
                return (
                    <SettingsSection>
                        <PlatformSettingsTab />
                    </SettingsSection>
                );

            default:
                return <div>{t('settings.selectTab')}</div>;
        }
    };

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>{t('settings.title')}</PageTitle>
                    {!isMobile && (
                        <PageSubtitle>{t('settings.subtitle')}</PageSubtitle>
                    )}
                </PageHeaderLeft>
            </PageHeader>

            <SettingsGrid>
                <SettingsSidebar>
                    {getSettingsTabs(canManagePlatform, t).map((tab) => (
                        <SettingsTab
                            key={tab.id}
                            active={activeTab === tab.id}
                            onClick={() => {
                                setActiveTab(tab.id);
                                setError('');
                                setSuccess('');
                            }}
                        >
                            <span className="icon">{tab.icon}</span>
                            {tab.label}
                        </SettingsTab>
                    ))}
                </SettingsSidebar>

                <SettingsContent>
                    {renderContent()}
                </SettingsContent>
            </SettingsGrid>
        </PageContainer>
    );
};

export default Settings;