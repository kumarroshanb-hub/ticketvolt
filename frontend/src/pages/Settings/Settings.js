// frontend/src/pages/Settings/Settings.js
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import {
    Person as PersonIcon,
    Security as SecurityIcon,
    Notifications as NotificationsIcon,
    Palette as PaletteIcon,
    Language as LanguageIcon,
    Save as SaveIcon,
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import {
    Alert,
    CircularProgress,
    Switch,
    FormControlLabel,
    Divider,
    IconButton,
    InputAdornment,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageSubtitle,
    PageHeaderLeft,
    PrimaryButton,
    OutlineButton,
    LoadingWrapper,
} from '../../components/Common';

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
    background: ${props => props.active ? 'rgba(79, 70, 229, 0.08)' : 'transparent'};
    color: ${props => props.active ? props.theme.colors.primary : props.theme.colors.textSecondary};
    border-radius: ${props => props.theme.borderRadius.md};
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
    touch-action: manipulation;

    .icon {
        font-size: 20px;
        color: ${props => props.active ? props.theme.colors.primary : props.theme.colors.textMuted};
    }

    &:hover {
        background: ${props => props.active ? 'rgba(79, 70, 229, 0.08)' : props.theme.colors.bgCardHover};
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
        font-family: 'Inter', sans-serif;
        min-height: 44px;
        box-sizing: border-box;

        &:focus {
            outline: none;
            border-color: ${props => props.theme.colors.primary};
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
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

const settingsTabs = [
    { id: 'profile', label: 'Profile', icon: <PersonIcon /> },
    { id: 'security', label: 'Security', icon: <SecurityIcon /> },
    { id: 'notifications', label: 'Notifications', icon: <NotificationsIcon /> },
    { id: 'appearance', label: 'Appearance', icon: <PaletteIcon /> },
    { id: 'language', label: 'Language', icon: <LanguageIcon /> },
];

const Settings = () => {
    const { user, updateUser } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const response = await api.get('/settings/');
            if (response.data) {
                setFormData({
                    ...formData,
                    ...response.data,
                });
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData({
            ...formData,
            [name]: type === 'checkbox' ? checked : value,
        });
    };

    const handlePasswordChange = (e) => {
        const { name, value } = e.target;
        setPasswordData({
            ...passwordData,
            [name]: value,
        });
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

            if (updateUser) {
                updateUser(response.data);
            }

            setSuccess('Profile updated successfully!');
            toast.success('Profile updated successfully!');
        } catch (error) {
            console.error('Save error:', error);
            setError(error.response?.data?.detail || 'Failed to update profile');
            toast.error('Failed to update profile');
        }
        setLoading(false);
    };

    const handleSavePassword = async () => {
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setError('Passwords do not match');
            toast.error('Passwords do not match');
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

            setSuccess('Password updated successfully!');
            toast.success('Password updated successfully!');
            setPasswordData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
            });
        } catch (error) {
            console.error('Password error:', error);
            setError(error.response?.data?.detail || 'Failed to update password');
            toast.error('Failed to update password');
        }
        setLoading(false);
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

            setSuccess('Notification preferences updated!');
            toast.success('Notification preferences updated!');
        } catch (error) {
            console.error('Save error:', error);
            setError(error.response?.data?.detail || 'Failed to update preferences');
            toast.error('Failed to update preferences');
        }
        setLoading(false);
    };

    const handleSaveAppearance = async () => {
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            await api.put('/settings/appearance/', {
                theme: formData.theme,
            });

            setSuccess('Theme updated successfully!');
            toast.success('Theme updated successfully!');
        } catch (error) {
            console.error('Save error:', error);
            setError(error.response?.data?.detail || 'Failed to update theme');
            toast.error('Failed to update theme');
        }
        setLoading(false);
    };

    const handleSaveLanguage = async () => {
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            await api.put('/settings/language/', {
                language: formData.language,
            });

            setSuccess('Language updated successfully!');
            toast.success('Language updated successfully!');
        } catch (error) {
            console.error('Save error:', error);
            setError(error.response?.data?.detail || 'Failed to update language');
            toast.error('Failed to update language');
        }
        setLoading(false);
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'profile':
                return (
                    <SettingsSection>
                        <h2>Profile Settings</h2>
                        <p className="description">Update your personal information</p>

                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                        <FormGroup>
                            <label htmlFor="fullName">Full Name</label>
                            <input
                                id="fullName"
                                name="name"
                                type="text"
                                value={formData.name}
                                onChange={handleChange}
                                autoComplete="name"
                                placeholder="Enter your full name"
                            />
                        </FormGroup>
                        <FormGroup>
                            <label htmlFor="emailAddress">Email Address</label>
                            <input
                                id="emailAddress"
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleChange}
                                autoComplete="email"
                                inputMode="email"
                                placeholder="Enter your email address"
                            />
                        </FormGroup>
                        <FormGroup>
                            <label htmlFor="timezone">Timezone</label>
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
                            {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : (
                                <>
                                    <SaveIcon fontSize="small" />
                                    Save Changes
                                </>
                            )}
                        </SaveButton>
                    </SettingsSection>
                );
            case 'security':
                return (
                    <SettingsSection>
                        <h2>Security Settings</h2>
                        <p className="description">Manage your security preferences</p>

                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                        <FormGroup>
                            <label htmlFor="currentPassword">Current Password</label>
                            <input
                                id="currentPassword"
                                name="currentPassword"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Enter current password"
                                value={passwordData.currentPassword}
                                onChange={handlePasswordChange}
                                autoComplete="current-password"
                            />
                        </FormGroup>
                        <FormGroup>
                            <label htmlFor="newPassword">New Password</label>
                            <input
                                id="newPassword"
                                name="newPassword"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Enter new password"
                                value={passwordData.newPassword}
                                onChange={handlePasswordChange}
                                autoComplete="new-password"
                            />
                        </FormGroup>
                        <FormGroup>
                            <label htmlFor="confirmPassword">Confirm New Password</label>
                            <input
                                id="confirmPassword"
                                name="confirmPassword"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Confirm new password"
                                value={passwordData.confirmPassword}
                                onChange={handlePasswordChange}
                                autoComplete="new-password"
                            />
                        </FormGroup>

                        <FormControlLabel
                            control={
                                <Switch
                                    checked={showPassword}
                                    onChange={() => setShowPassword(!showPassword)}
                                    sx={{
                                        '& .MuiSwitch-switchBase.Mui-checked': { color: '#4f46e5' },
                                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#4f46e5' }
                                    }}
                                />
                            }
                            label="Show passwords"
                            sx={{ color: '#475569', mb: 2 }}
                        />

                        <SaveButton onClick={handleSavePassword} disabled={loading}>
                            {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : (
                                <>
                                    <SaveIcon fontSize="small" />
                                    Update Password
                                </>
                            )}
                        </SaveButton>
                    </SettingsSection>
                );
            case 'notifications':
                return (
                    <SettingsSection>
                        <h2>Notification Preferences</h2>
                        <p className="description">Choose what notifications you receive</p>

                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                        <FormGroup>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.emailNotifications}
                                        onChange={handleChange}
                                        name="emailNotifications"
                                        sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': { color: '#4f46e5' },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#4f46e5' }
                                        }}
                                    />
                                }
                                label="Email Notifications"
                                sx={{ color: '#475569' }}
                            />
                        </FormGroup>
                        <FormGroup>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.pushNotifications}
                                        onChange={handleChange}
                                        name="pushNotifications"
                                        sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': { color: '#4f46e5' },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#4f46e5' }
                                        }}
                                    />
                                }
                                label="Push Notifications"
                                sx={{ color: '#475569' }}
                            />
                        </FormGroup>

                        <SaveButton onClick={handleSaveNotifications} disabled={loading}>
                            {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : (
                                <>
                                    <SaveIcon fontSize="small" />
                                    Save Preferences
                                </>
                            )}
                        </SaveButton>
                    </SettingsSection>
                );
            case 'appearance':
                return (
                    <SettingsSection>
                        <h2>Appearance Settings</h2>
                        <p className="description">Customize the look and feel</p>

                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                        <FormGroup>
                            <label htmlFor="themeSelect">Theme</label>
                            <select
                                id="themeSelect"
                                name="theme"
                                value={formData.theme}
                                onChange={handleChange}
                            >
                                <option value="light">Light</option>
                                <option value="dark">Dark</option>
                                <option value="system">System Default</option>
                            </select>
                        </FormGroup>

                        <SaveButton onClick={handleSaveAppearance} disabled={loading}>
                            {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : (
                                <>
                                    <SaveIcon fontSize="small" />
                                    Save Theme
                                </>
                            )}
                        </SaveButton>
                    </SettingsSection>
                );
            case 'language':
                return (
                    <SettingsSection>
                        <h2>Language Settings</h2>
                        <p className="description">Choose your preferred language</p>

                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                        <FormGroup>
                            <label htmlFor="languageSelect">Language</label>
                            <select
                                id="languageSelect"
                                name="language"
                                value={formData.language}
                                onChange={handleChange}
                            >
                                <option value="English">English</option>
                                <option value="Spanish">Spanish</option>
                                <option value="French">French</option>
                                <option value="German">German</option>
                                <option value="Chinese">Chinese (Simplified)</option>
                                <option value="Chinese Traditional">Chinese (Traditional)</option>
                                <option value="Japanese">Japanese</option>
                                <option value="Korean">Korean</option>
                                <option value="Portuguese">Portuguese</option>
                                <option value="Russian">Russian</option>
                                <option value="Arabic">Arabic</option>
                                <option value="Hindi">Hindi</option>
                                <option value="Italian">Italian</option>
                                <option value="Dutch">Dutch</option>
                            </select>
                        </FormGroup>

                        <SaveButton onClick={handleSaveLanguage} disabled={loading}>
                            {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : (
                                <>
                                    <SaveIcon fontSize="small" />
                                    Save Language
                                </>
                            )}
                        </SaveButton>
                    </SettingsSection>
                );
            default:
                return <div>Select a tab</div>;
        }
    };

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>Settings</PageTitle>
                    {!isMobile && <PageSubtitle>Manage your account settings and preferences</PageSubtitle>}
                </PageHeaderLeft>
            </PageHeader>

            <SettingsGrid>
                <SettingsSidebar>
                    {settingsTabs.map(tab => (
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