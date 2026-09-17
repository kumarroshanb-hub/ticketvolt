// frontend/src/pages/Events/Create.js
import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Grid,
    Alert,
    CircularProgress,
    MenuItem,
    IconButton,
    Divider,
    Switch,
    FormControlLabel,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    Select,
    FormHelperText,
    Radio,
    RadioGroup,
    FormLabel,
    Chip,
    Card,
    CardContent,
    CardMedia,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Add as AddIcon, Delete as DeleteIcon, Upload as UploadIcon, Image as ImageIcon, Check as CheckIcon } from '@mui/icons-material';
import api from '../../services/api';
import styled from 'styled-components';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageHeaderLeft,
    PrimaryButton,
    OutlineButton,
    LoadingWrapper,
} from '../../components/Common';

// ✅ Import shared constants - COMPLETE
import {
    EVENT_STATUS,
    EVENT_STATUS_LABELS,
    EventStatusUtils,
    EVENT_TYPE,
    EVENT_TYPE_LABELS,
    EVENT_CATEGORY,
    EVENT_CATEGORY_LABELS,
    // ✅ NEW: Template Types
    EVENT_TEMPLATE_TYPE,
    EVENT_TEMPLATE_TYPE_LABELS,
    EVENT_TEMPLATE_TYPE_ICONS,
    EventTemplateTypeUtils,
} from '../../constants';

// ============================================
// TIMEZONE DATA
// ============================================
// Format: { value: IANA identifier, label: "IANA — Friendly Country/City" }
// Grouped by region for a cleaner dropdown.
const TIMEZONE_GROUPS = [
    {
        region: '🌏 Asia',
        timezones: [
            { value: 'Asia/Kolkata',       label: 'Asia/Kolkata — India' },
            { value: 'Asia/Hong_Kong',     label: 'Asia/Hong_Kong — Hong Kong' },
            { value: 'Asia/Singapore',     label: 'Asia/Singapore — Singapore' },
            { value: 'Asia/Tokyo',         label: 'Asia/Tokyo — Japan' },
            { value: 'Asia/Seoul',         label: 'Asia/Seoul — South Korea' },
            { value: 'Asia/Shanghai',      label: 'Asia/Shanghai — China' },
            { value: 'Asia/Dubai',         label: 'Asia/Dubai — UAE' },
            { value: 'Asia/Riyadh',        label: 'Asia/Riyadh — Saudi Arabia' },
            { value: 'Asia/Karachi',       label: 'Asia/Karachi — Pakistan' },
            { value: 'Asia/Dhaka',         label: 'Asia/Dhaka — Bangladesh' },
            { value: 'Asia/Colombo',       label: 'Asia/Colombo — Sri Lanka' },
            { value: 'Asia/Kathmandu',     label: 'Asia/Kathmandu — Nepal' },
            { value: 'Asia/Bangkok',       label: 'Asia/Bangkok — Thailand' },
            { value: 'Asia/Jakarta',       label: 'Asia/Jakarta — Indonesia' },
            { value: 'Asia/Kuala_Lumpur',  label: 'Asia/Kuala_Lumpur — Malaysia' },
            { value: 'Asia/Manila',        label: 'Asia/Manila — Philippines' },
            { value: 'Asia/Taipei',        label: 'Asia/Taipei — Taiwan' },
            { value: 'Asia/Yangon',        label: 'Asia/Yangon — Myanmar' },
            { value: 'Asia/Kabul',         label: 'Asia/Kabul — Afghanistan' },
            { value: 'Asia/Tehran',        label: 'Asia/Tehran — Iran' },
            { value: 'Asia/Baghdad',       label: 'Asia/Baghdad — Iraq' },
            { value: 'Asia/Jerusalem',     label: 'Asia/Jerusalem — Israel' },
            { value: 'Asia/Beirut',        label: 'Asia/Beirut — Lebanon' },
            { value: 'Asia/Kuwait',        label: 'Asia/Kuwait — Kuwait' },
            { value: 'Asia/Qatar',         label: 'Asia/Qatar — Qatar' },
            { value: 'Asia/Bahrain',       label: 'Asia/Bahrain — Bahrain' },
            { value: 'Asia/Muscat',        label: 'Asia/Muscat — Oman' },
        ],
    },
    {
        region: '🌍 Europe',
        timezones: [
            { value: 'Europe/London',      label: 'Europe/London — United Kingdom' },
            { value: 'Europe/Paris',       label: 'Europe/Paris — France' },
            { value: 'Europe/Berlin',      label: 'Europe/Berlin — Germany' },
            { value: 'Europe/Madrid',      label: 'Europe/Madrid — Spain' },
            { value: 'Europe/Rome',        label: 'Europe/Rome — Italy' },
            { value: 'Europe/Amsterdam',   label: 'Europe/Amsterdam — Netherlands' },
            { value: 'Europe/Brussels',    label: 'Europe/Brussels — Belgium' },
            { value: 'Europe/Vienna',      label: 'Europe/Vienna — Austria' },
            { value: 'Europe/Zurich',      label: 'Europe/Zurich — Switzerland' },
            { value: 'Europe/Stockholm',   label: 'Europe/Stockholm — Sweden' },
            { value: 'Europe/Oslo',        label: 'Europe/Oslo — Norway' },
            { value: 'Europe/Copenhagen',  label: 'Europe/Copenhagen — Denmark' },
            { value: 'Europe/Helsinki',    label: 'Europe/Helsinki — Finland' },
            { value: 'Europe/Warsaw',      label: 'Europe/Warsaw — Poland' },
            { value: 'Europe/Prague',      label: 'Europe/Prague — Czech Republic' },
            { value: 'Europe/Budapest',    label: 'Europe/Budapest — Hungary' },
            { value: 'Europe/Athens',      label: 'Europe/Athens — Greece' },
            { value: 'Europe/Lisbon',      label: 'Europe/Lisbon — Portugal' },
            { value: 'Europe/Dublin',      label: 'Europe/Dublin — Ireland' },
            { value: 'Europe/Moscow',      label: 'Europe/Moscow — Russia' },
            { value: 'Europe/Istanbul',    label: 'Europe/Istanbul — Turkey' },
            { value: 'Europe/Kyiv',        label: 'Europe/Kyiv — Ukraine' },
        ],
    },
    {
        region: '🌎 Americas',
        timezones: [
            { value: 'America/New_York',     label: 'America/New_York — USA (Eastern)' },
            { value: 'America/Chicago',      label: 'America/Chicago — USA (Central)' },
            { value: 'America/Denver',       label: 'America/Denver — USA (Mountain)' },
            { value: 'America/Phoenix',      label: 'America/Phoenix — USA (Arizona)' },
            { value: 'America/Los_Angeles',  label: 'America/Los_Angeles — USA (Pacific)' },
            { value: 'America/Anchorage',    label: 'America/Anchorage — USA (Alaska)' },
            { value: 'Pacific/Honolulu',     label: 'Pacific/Honolulu — USA (Hawaii)' },
            { value: 'America/Toronto',      label: 'America/Toronto — Canada (Eastern)' },
            { value: 'America/Vancouver',    label: 'America/Vancouver — Canada (Pacific)' },
            { value: 'America/Mexico_City',  label: 'America/Mexico_City — Mexico' },
            { value: 'America/Sao_Paulo',    label: 'America/Sao_Paulo — Brazil' },
            { value: 'America/Argentina/Buenos_Aires', label: 'America/Argentina/Buenos_Aires — Argentina' },
            { value: 'America/Bogota',       label: 'America/Bogota — Colombia' },
            { value: 'America/Lima',         label: 'America/Lima — Peru' },
            { value: 'America/Santiago',     label: 'America/Santiago — Chile' },
            { value: 'America/Caracas',      label: 'America/Caracas — Venezuela' },
        ],
    },
    {
        region: '🌏 Oceania',
        timezones: [
            { value: 'Australia/Sydney',    label: 'Australia/Sydney — Australia (Eastern)' },
            { value: 'Australia/Melbourne', label: 'Australia/Melbourne — Australia (Victoria)' },
            { value: 'Australia/Brisbane',  label: 'Australia/Brisbane — Australia (Queensland)' },
            { value: 'Australia/Perth',     label: 'Australia/Perth — Australia (Western)' },
            { value: 'Australia/Adelaide',  label: 'Australia/Adelaide — Australia (South)' },
            { value: 'Pacific/Auckland',    label: 'Pacific/Auckland — New Zealand' },
            { value: 'Pacific/Fiji',        label: 'Pacific/Fiji — Fiji' },
        ],
    },
    {
        region: '🌍 Africa',
        timezones: [
            { value: 'Africa/Cairo',        label: 'Africa/Cairo — Egypt' },
            { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg — South Africa' },
            { value: 'Africa/Lagos',        label: 'Africa/Lagos — Nigeria' },
            { value: 'Africa/Nairobi',      label: 'Africa/Nairobi — Kenya' },
            { value: 'Africa/Casablanca',   label: 'Africa/Casablanca — Morocco' },
            { value: 'Africa/Accra',        label: 'Africa/Accra — Ghana' },
            { value: 'Africa/Addis_Ababa',  label: 'Africa/Addis_Ababa — Ethiopia' },
        ],
    },
    {
        region: '🌐 UTC',
        timezones: [
            { value: 'UTC', label: 'UTC — Coordinated Universal Time' },
        ],
    },
];

// Helper to get a friendly display for a given IANA value
const getTimezoneLabel = (value) => {
    for (const group of TIMEZONE_GROUPS) {
        const found = group.timezones.find((tz) => tz.value === value);
        if (found) return found.label;
    }
    return value || '';
};

const StyledPaper = styled(Paper)`
    background: ${props => props.theme.colors.bgCard};
    border: 1px solid ${props => props.theme.colors.borderLight};
    border-radius: ${props => props.theme.borderRadius.lg};
    padding: 32px;
    box-shadow: ${props => props.theme.shadows.card};

    @media (max-width: 900px) {
        padding: 16px;
    }
`;

const SectionTitle = styled(Typography)`
    color: ${props => props.theme.colors.textPrimary};
    font-weight: 600;
    margin-bottom: 16px;
`;

const SessionPaper = styled(Paper)`
    background: ${props => props.theme.colors.bgCard};
    border: 1px solid ${props => props.theme.colors.borderLight};
    border-radius: ${props => props.theme.borderRadius.md};
    padding: 16px;
    margin-bottom: 12px;
    box-shadow: ${props => props.theme.shadows.card};
`;

const TierPaper = styled(Paper)`
    background: ${props => props.theme.colors.bgCard};
    border: 1px solid ${props => props.theme.colors.borderLight};
    border-radius: ${props => props.theme.borderRadius.md};
    padding: 16px;
    margin-bottom: 12px;
    box-shadow: ${props => props.theme.shadows.card};
`;

const TemplateCard = styled(Card)`
    border: ${props => props.isDefault ? '2px solid #22c55e' : '1px solid #e2e8f0'};
    border-radius: 12px;
    transition: all 0.2s ease;
    cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
    opacity: ${props => props.disabled ? 0.6 : 1};

    &:hover {
        border-color: ${props => props.disabled ? '#e2e8f0' : '#4f46e5'};
        box-shadow: ${props => props.disabled ? 'none' : '0 4px 12px rgba(0,0,0,0.08)'};
        transform: ${props => props.disabled ? 'none' : 'translateY(-2px)'};
    }
`;

// Helper function to format date for datetime-local input
const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (e) {
        return '';
    }
};

// Styled TextField with light theme
const StyledTextField = styled(TextField)`
    & .MuiOutlinedInput-root {
        color: ${props => props.theme.colors.textPrimary};
        background: ${props => props.theme.colors.bgInput};

        fieldset {
            border-color: ${props => props.theme.colors.borderLight};
        }

        &:hover fieldset {
            border-color: ${props => props.theme.colors.borderHover};
        }

        &.Mui-focused fieldset {
            border-color: ${props => props.theme.colors.primary};
        }
    }

    & .MuiInputLabel-root {
        color: ${props => props.theme.colors.textSecondary};
    }

    & .MuiInputLabel-root.Mui-focused {
        color: ${props => props.theme.colors.primary};
    }

    & .MuiSvgIcon-root {
        color: ${props => props.theme.colors.textMuted};
    }
`;

const CreateEvent = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [venues, setVenues] = useState([]);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        short_description: '',
        event_type: EVENT_TYPE.SINGLE,
        category: EVENT_CATEGORY.OTHER,
        venue_id: '',
        start_date: '',
        end_date: '',
        timezone: 'Asia/Kolkata',
        status: EVENT_STATUS.DRAFT,
        is_public: true,
        ticket_format: 'pdf',
        combine_tickets: false,
        tickets_per_page: 4,
    });
    const [sessions, setSessions] = useState([]);
    const [tiers, setTiers] = useState([]);

    // ============================================
    // TEMPLATE STATE
    // ============================================
    const [templates, setTemplates] = useState({});
    const [templateTypes, setTemplateTypes] = useState([]);
    const [templateUploadDialog, setTemplateUploadDialog] = useState(false);
    const [selectedTemplateType, setSelectedTemplateType] = useState('');
    const [templateFormData, setTemplateFormData] = useState({
        name: '',
        description: '',
        template_type_id: '',
        image: null,
        is_default: false,
    });
    const [uploadingTemplate, setUploadingTemplate] = useState(false);

    // Load venues
    useEffect(() => {
        const loadVenues = async () => {
            try {
                const response = await api.get('/venues/');
                setVenues(response.data || []);
            } catch (error) {
                console.error('Failed to load venues:', error);
                setVenues([]);
            }
        };
        loadVenues();
    }, []);

    // ✅ Load template types from constants (no API call needed)
    useEffect(() => {
        const types = EventTemplateTypeUtils.getOptions();
        setTemplateTypes(types);
        console.log('📋 Template Types loaded from constants:', types);
    }, []);

    // Load templates for this event if editing
    useEffect(() => {
        if (id) {
            loadTemplates();
        }
    }, [id]);

    const loadTemplates = async () => {
        try {
            const response = await api.get(`/templates/by_type/?event_id=${id}`);
            setTemplates(response.data || {});
        } catch (error) {
            console.error('Failed to load templates:', error);
        }
    };

    // Load event if editing
    useEffect(() => {
        if (id) {
            loadEvent();
        }
    }, [id]);

    const loadEvent = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/events/${id}/`);
            const data = response.data;

            setFormData({
                title: data.title || '',
                description: data.description || '',
                short_description: data.short_description || '',
                event_type: data.event_type || EVENT_TYPE.SINGLE,
                category: data.category || EVENT_CATEGORY.OTHER,
                venue_id: data.venue?.id || '',
                start_date: formatDateForInput(data.start_date),
                end_date: formatDateForInput(data.end_date),
                timezone: data.timezone || 'Asia/Kolkata',
                status: data.status || EVENT_STATUS.DRAFT,
                is_public: data.is_public !== undefined ? data.is_public : true,
                ticket_format: data.ticket_format || 'pdf',
                combine_tickets: data.combine_tickets || false,
                tickets_per_page: data.tickets_per_page || 4,
            });

            const formattedSessions = (data.sessions || []).map(s => ({
                ...s,
                start_time: formatDateForInput(s.start_time),
                end_time: formatDateForInput(s.end_time)
            }));
            setSessions(formattedSessions);
            setTiers(data.tiers || []);
        } catch (error) {
            toast.error('Failed to load event');
            console.error('Load error:', error);
        }
        setLoading(false);
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData({
            ...formData,
            [name]: type === 'checkbox' ? checked : value
        });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case EVENT_STATUS.DRAFT: return 'default';
            case EVENT_STATUS.PUBLISHED: return 'info';
            case EVENT_STATUS.ACTIVE: return 'success';
            case EVENT_STATUS.CANCELLED: return 'error';
            case EVENT_STATUS.COMPLETED: return 'secondary';
            default: return 'default';
        }
    };

    const getStatusLabel = (status) => {
        return EVENT_STATUS_LABELS[status] || status || 'DRAFT';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        try {
            if (!formData.title) {
                setError('Title is required');
                setSubmitting(false);
                return;
            }
            if (!formData.start_date) {
                setError('Start date is required');
                setSubmitting(false);
                return;
            }
            if (!formData.end_date) {
                setError('End date is required');
                setSubmitting(false);
                return;
            }

            const eventData = {
                title: formData.title,
                description: formData.description || '',
                short_description: formData.short_description || '',
                event_type: formData.event_type || EVENT_TYPE.SINGLE,
                category: formData.category || EVENT_CATEGORY.OTHER,
                venue_id: formData.venue_id || null,
                start_date: formData.start_date,
                end_date: formData.end_date,
                timezone: formData.timezone || 'Asia/Kolkata',
                status: formData.status || EVENT_STATUS.DRAFT,
                is_public: formData.is_public !== undefined ? formData.is_public : true,
                ticket_format: formData.ticket_format || 'pdf',
                combine_tickets: formData.combine_tickets || false,
                tickets_per_page: formData.tickets_per_page || 4,
                sessions: sessions.map(s => ({
                    start_time: s.start_time,
                    end_time: s.end_time,
                    capacity: parseInt(s.capacity) || 100
                })),
                tiers: tiers.map(t => ({
                    name: t.name || 'General',
                    price: parseFloat(t.price) || 0,
                    quantity_total: parseInt(t.quantity_total) || 100,
                    ticket_type: t.ticket_type || 'ga'
                }))
            };

            let response;
            if (id) {
                response = await api.put(`/events/${id}/`, eventData);
                toast.success('Event updated successfully!');
            } else {
                response = await api.post('/events/', eventData);
                toast.success('Event created successfully!');
                const newEventId = response.data.id;
                navigate(`/events/${newEventId}/edit`);
                return;
            }

            navigate('/events');
        } catch (error) {
            console.error('Submit error:', error);
            setError(error.response?.data?.message || error.message || 'Failed to save event');
            toast.error('Failed to save event');
        }
        setSubmitting(false);
    };

    // ============================================
    // TEMPLATE HANDLERS
    // ============================================

    const handleTemplateUpload = async () => {
        if (!templateFormData.image || !templateFormData.template_type_id) {
            toast.error('Please select an image and template type');
            return;
        }

        if (!id) {
            toast.error('Please save the event first before uploading templates');
            return;
        }

        setUploadingTemplate(true);
        const formData = new FormData();
        formData.append('image', templateFormData.image);
        formData.append('event_id', id);
        formData.append('template_type_id', templateFormData.template_type_id);
        formData.append('name', templateFormData.name || 'Template');
        formData.append('description', templateFormData.description || '');
        formData.append('is_default', templateFormData.is_default ? 'true' : 'false');

        try {
            await api.post('/templates/upload/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success('Template uploaded successfully!');
            setTemplateUploadDialog(false);
            setTemplateFormData({
                name: '',
                description: '',
                template_type_id: '',
                image: null,
                is_default: false,
            });
            if (id) {
                await loadTemplates();
            }
        } catch (error) {
            console.error('Upload error:', error);
            toast.error(error.response?.data?.error || 'Failed to upload template');
        }
        setUploadingTemplate(false);
    };

    const handleDeleteTemplate = async (templateId, templateName) => {
        if (!window.confirm(`Are you sure you want to delete "${templateName}"?`)) return;
        try {
            await api.delete(`/templates/${templateId}/`);
            toast.success('Template deleted');
            if (id) {
                await loadTemplates();
            }
        } catch (error) {
            console.error('Delete error:', error);
            toast.error('Failed to delete template');
        }
    };

    const handleSetDefaultTemplate = async (templateId) => {
        try {
            await api.post(`/templates/${templateId}/set_default/`);
            toast.success('Default template updated');
            if (id) {
                await loadTemplates();
            }
        } catch (error) {
            console.error('Set default error:', error);
            toast.error('Failed to set default template');
        }
    };

    const handleCloseTemplateDialog = () => {
        setTemplateUploadDialog(false);
        setTemplateFormData({
            name: '',
            description: '',
            template_type_id: '',
            image: null,
            is_default: false,
        });
    };

    const addSession = () => {
        setSessions([...sessions, { start_time: '', end_time: '', capacity: 100 }]);
    };

    const removeSession = (index) => {
        setSessions(sessions.filter((_, i) => i !== index));
    };

    const updateSession = (index, field, value) => {
        const newSessions = [...sessions];
        newSessions[index][field] = value;
        setSessions(newSessions);
    };

    const addTier = () => {
        setTiers([...tiers, {
            name: '',
            price: 0,
            quantity_total: 100,
            ticket_type: 'ga'
        }]);
    };

    const removeTier = (index) => {
        setTiers(tiers.filter((_, i) => i !== index));
    };

    const updateTier = (index, field, value) => {
        const newTiers = [...tiers];
        newTiers[index][field] = value;
        setTiers(newTiers);
    };

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: '#4f46e5' }} />
            </LoadingWrapper>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>{id ? 'Edit Event' : 'Create New Event'}</PageTitle>
                </PageHeaderLeft>
            </PageHeader>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <StyledPaper>
                <form onSubmit={handleSubmit}>
                    <Grid container spacing={isMobile ? 2 : 3}>
                        {/* ============================================ */}
                        {/* BASIC INFORMATION */}
                        {/* ============================================ */}
                        <Grid item xs={12}>
                            <SectionTitle variant="h6">Basic Information</SectionTitle>
                            <Divider sx={{ borderColor: '#e2e8f0' }} />
                        </Grid>

                        <Grid item xs={12}>
                            <StyledTextField
                                fullWidth
                                label="Event Title"
                                name="title"
                                value={formData.title}
                                onChange={handleChange}
                                required
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <StyledTextField
                                fullWidth
                                label="Short Description"
                                name="short_description"
                                value={formData.short_description}
                                onChange={handleChange}
                                multiline
                                rows={2}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <StyledTextField
                                fullWidth
                                label="Description"
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                multiline
                                rows={4}
                            />
                        </Grid>

                        {/* Event Type + Category — stack on mobile */}
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth>
                                <InputLabel id="event-type-label">Event Type</InputLabel>
                                <Select
                                    labelId="event-type-label"
                                    id="event-type-select"
                                    name="event_type"
                                    value={formData.event_type}
                                    onChange={handleChange}
                                    label="Event Type"
                                    sx={{
                                        backgroundColor: '#f8fafc',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4f46e5' },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#4f46e5' },
                                    }}
                                >
                                    {Object.values(EVENT_TYPE).map((type) => (
                                        <MenuItem key={type} value={type}>
                                            {EVENT_TYPE_LABELS[type] || type}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth>
                                <InputLabel id="category-label">Category</InputLabel>
                                <Select
                                    labelId="category-label"
                                    id="category-select"
                                    name="category"
                                    value={formData.category}
                                    onChange={handleChange}
                                    label="Category"
                                    sx={{
                                        backgroundColor: '#f8fafc',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4f46e5' },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#4f46e5' },
                                    }}
                                >
                                    {Object.values(EVENT_CATEGORY).map((category) => (
                                        <MenuItem key={category} value={category}>
                                            {EVENT_CATEGORY_LABELS[category] || category}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12}>
                            <FormControl fullWidth>
                                <InputLabel id="venue-label">Venue</InputLabel>
                                <Select
                                    labelId="venue-label"
                                    id="venue-select"
                                    name="venue_id"
                                    value={formData.venue_id}
                                    onChange={handleChange}
                                    label="Venue"
                                    sx={{
                                        backgroundColor: '#f8fafc',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4f46e5' },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#4f46e5' },
                                    }}
                                >
                                    <MenuItem value="">Select Venue</MenuItem>
                                    {venues.map((venue) => (
                                        <MenuItem key={venue.id} value={venue.id}>
                                            {venue.name} {venue.city ? `(${venue.city})` : ''}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        {/* Date & Time — stack on mobile */}
                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                label="Start Date"
                                name="start_date"
                                type="datetime-local"
                                value={formData.start_date}
                                onChange={handleChange}
                                InputLabelProps={{ shrink: true }}
                                required
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                label="End Date"
                                name="end_date"
                                type="datetime-local"
                                value={formData.end_date}
                                onChange={handleChange}
                                InputLabelProps={{ shrink: true }}
                                required
                            />
                        </Grid>

                        {/* ============================================ */}
                        {/* TIMEZONE DROPDOWN (FIXED) */}
                        {/* ============================================ */}
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth>
                                <InputLabel id="timezone-label">Timezone</InputLabel>
                                <Select
                                    labelId="timezone-label"
                                    id="timezone-select"
                                    name="timezone"
                                    value={formData.timezone}
                                    onChange={handleChange}
                                    label="Timezone"
                                    MenuProps={{
                                        PaperProps: {
                                            sx: {
                                                maxHeight: 400,
                                                '& .MuiMenuItem-root': {
                                                    fontSize: 14,
                                                },
                                            },
                                        },
                                    }}
                                    sx={{
                                        backgroundColor: '#f8fafc',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4f46e5' },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#4f46e5' },
                                    }}
                                    renderValue={(selected) => {
                                        const label = getTimezoneLabel(selected);
                                        return (
                                            <Typography variant="body2" sx={{ color: '#0f172a' }}>
                                                {label || 'Select timezone'}
                                            </Typography>
                                        );
                                    }}
                                >
                                    {TIMEZONE_GROUPS.map((group) => [
                                        // Section header
                                        <MenuItem
                                            key={`header-${group.region}`}
                                            disabled
                                            sx={{
                                                fontWeight: 700,
                                                fontSize: '11px',
                                                textTransform: 'uppercase',
                                                letterSpacing: 0.5,
                                                color: '#4f46e5',
                                                bgcolor: '#f8fafc',
                                                opacity: '1 !important',
                                                borderTop: '1px solid #e2e8f0',
                                            }}
                                        >
                                            {group.region}
                                        </MenuItem>,
                                        // Timezone items
                                        ...group.timezones.map((tz) => (
                                            <MenuItem
                                                key={tz.value}
                                                value={tz.value}
                                                sx={{ pl: 3 }}
                                            >
                                                {tz.label}
                                            </MenuItem>
                                        )),
                                    ])}
                                </Select>
                                <FormHelperText>
                                    Used for displaying event times correctly on all devices and in WhatsApp messages.
                                </FormHelperText>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth>
                                <InputLabel id="status-label">Status</InputLabel>
                                <Select
                                    labelId="status-label"
                                    id="status-select"
                                    name="status"
                                    value={formData.status}
                                    onChange={handleChange}
                                    label="Status"
                                    sx={{
                                        backgroundColor: '#f8fafc',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4f46e5' },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#4f46e5' },
                                    }}
                                >
                                    {Object.values(EVENT_STATUS).map((status) => (
                                        <MenuItem key={status} value={status}>
                                            {EVENT_STATUS_LABELS[status] || status}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.is_public}
                                        onChange={handleChange}
                                        name="is_public"
                                        sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': { color: '#4f46e5' },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#4f46e5' }
                                        }}
                                    />
                                }
                                label="Public Event"
                                sx={{ color: '#475569' }}
                            />
                        </Grid>

                        {/* ============================================ */}
                        {/* TICKET SETTINGS */}
                        {/* ============================================ */}
                        <Grid item xs={12}>
                            <SectionTitle variant="h6">Ticket Settings</SectionTitle>
                            <Divider sx={{ borderColor: '#e2e8f0' }} />
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth>
                                <FormLabel sx={{ color: '#0f172a', fontWeight: 600, mb: 1 }}>
                                    Ticket Format
                                </FormLabel>
                                {/* ✅ Radio group stacks vertically on mobile */}
                                <RadioGroup
                                    row={!isMobile}
                                    name="ticket_format"
                                    value={formData.ticket_format || 'pdf'}
                                    onChange={handleChange}
                                >
                                    <FormControlLabel
                                        value="pdf"
                                        control={<Radio />}
                                        label={
                                            <Box>
                                                <Typography variant="body2">📄 PDF</Typography>
                                                <Typography variant="caption" sx={{ color: '#64748b' }}>
                                                    Print-ready, professional
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                    <FormControlLabel
                                        value="png"
                                        control={<Radio />}
                                        label={
                                            <Box>
                                                <Typography variant="body2">🖼️ PNG</Typography>
                                                <Typography variant="caption" sx={{ color: '#64748b' }}>
                                                    Image format, easy sharing
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                    <FormControlLabel
                                        value="both"
                                        control={<Radio />}
                                        label={
                                            <Box>
                                                <Typography variant="body2">📄➕🖼️ Both</Typography>
                                                <Typography variant="caption" sx={{ color: '#64748b' }}>
                                                    Send both formats
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                </RadioGroup>
                                <FormHelperText>
                                    Choose the format for ticket delivery to customers
                                </FormHelperText>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.combine_tickets || false}
                                        onChange={handleChange}
                                        name="combine_tickets"
                                        sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': { color: '#4f46e5' },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#4f46e5' }
                                        }}
                                    />
                                }
                                label="Combine tickets into single file"
                                sx={{ color: '#475569' }}
                            />
                            <FormHelperText>
                                Combine all tickets into one file instead of individual files
                            </FormHelperText>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <StyledTextField
                                fullWidth
                                label="Tickets Per Page"
                                name="tickets_per_page"
                                type="number"
                                value={formData.tickets_per_page || 4}
                                onChange={handleChange}
                                InputProps={{ inputProps: { min: 1, max: 10 } }}
                                helperText="Number of tickets to show per page (for combined tickets)"
                                disabled={!formData.combine_tickets}
                            />
                        </Grid>

                        {/* ============================================ */}
                        {/* SESSIONS */}
                        {/* ============================================ */}
                        <Grid item xs={12}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, flexWrap: 'wrap', gap: 1 }}>
                                <SectionTitle variant="h6" sx={{ mb: 0 }}>Sessions</SectionTitle>
                                <Button
                                    startIcon={<AddIcon />}
                                    variant="outlined"
                                    onClick={addSession}
                                    size="small"
                                    sx={{
                                        borderColor: '#e2e8f0',
                                        color: '#475569',
                                        '&:hover': {
                                            borderColor: '#4f46e5',
                                            color: '#4f46e5',
                                            backgroundColor: 'rgba(79, 70, 229, 0.04)'
                                        }
                                    }}
                                >
                                    Add Session
                                </Button>
                            </Box>
                            <Divider sx={{ mt: 1, borderColor: '#e2e8f0' }} />
                        </Grid>

                        {sessions.map((session, index) => (
                            <Grid item xs={12} key={index}>
                                <SessionPaper>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="subtitle1" sx={{ color: '#0f172a', fontWeight: 600 }}>
                                            Session #{index + 1}
                                        </Typography>
                                        <IconButton size="small" onClick={() => removeSession(index)} sx={{ color: '#ef4444' }}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </Box>
                                    <Grid container spacing={2} sx={{ mt: 1 }}>
                                        <Grid item xs={12} sm={4}>
                                            <StyledTextField
                                                fullWidth
                                                label="Start Time"
                                                type="datetime-local"
                                                value={session.start_time}
                                                onChange={(e) => updateSession(index, 'start_time', e.target.value)}
                                                InputLabelProps={{ shrink: true }}
                                                size="small"
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={4}>
                                            <StyledTextField
                                                fullWidth
                                                label="End Time"
                                                type="datetime-local"
                                                value={session.end_time}
                                                onChange={(e) => updateSession(index, 'end_time', e.target.value)}
                                                InputLabelProps={{ shrink: true }}
                                                size="small"
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={4}>
                                            <StyledTextField
                                                fullWidth
                                                label="Capacity"
                                                type="number"
                                                value={session.capacity}
                                                onChange={(e) => updateSession(index, 'capacity', parseInt(e.target.value))}
                                                size="small"
                                            />
                                        </Grid>
                                    </Grid>
                                </SessionPaper>
                            </Grid>
                        ))}

                        {/* ============================================ */}
                        {/* TICKET TIERS */}
                        {/* ============================================ */}
                        <Grid item xs={12}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, flexWrap: 'wrap', gap: 1 }}>
                                <SectionTitle variant="h6" sx={{ mb: 0 }}>Ticket Tiers</SectionTitle>
                                <Button
                                    startIcon={<AddIcon />}
                                    variant="outlined"
                                    onClick={addTier}
                                    size="small"
                                    sx={{
                                        borderColor: '#e2e8f0',
                                        color: '#475569',
                                        '&:hover': {
                                            borderColor: '#4f46e5',
                                            color: '#4f46e5',
                                            backgroundColor: 'rgba(79, 70, 229, 0.04)'
                                        }
                                    }}
                                >
                                    Add Tier
                                </Button>
                            </Box>
                            <Divider sx={{ mt: 1, borderColor: '#e2e8f0' }} />
                        </Grid>

                        {tiers.map((tier, index) => (
                            <Grid item xs={12} key={index}>
                                <TierPaper>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="subtitle1" sx={{ color: '#0f172a', fontWeight: 600 }}>
                                            Tier #{index + 1}
                                        </Typography>
                                        <IconButton size="small" onClick={() => removeTier(index)} sx={{ color: '#ef4444' }}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </Box>
                                    <Grid container spacing={2} sx={{ mt: 1 }}>
                                        <Grid item xs={12} sm={4}>
                                            <StyledTextField
                                                fullWidth
                                                label="Name"
                                                value={tier.name}
                                                onChange={(e) => updateTier(index, 'name', e.target.value)}
                                                size="small"
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={4}>
                                            <StyledTextField
                                                fullWidth
                                                label="Price (₹)"
                                                type="number"
                                                value={tier.price}
                                                onChange={(e) => updateTier(index, 'price', parseFloat(e.target.value))}
                                                size="small"
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={4}>
                                            <StyledTextField
                                                fullWidth
                                                label="Quantity"
                                                type="number"
                                                value={tier.quantity_total}
                                                onChange={(e) => updateTier(index, 'quantity_total', parseInt(e.target.value))}
                                                size="small"
                                            />
                                        </Grid>
                                    </Grid>
                                </TierPaper>
                            </Grid>
                        ))}

                        {/* ============================================ */}
                        {/* TEMPLATES SECTION */}
                        {/* ============================================ */}
                        <Grid item xs={12}>
                            <SectionTitle variant="h6">Event Templates</SectionTitle>
                            <Divider sx={{ borderColor: '#e2e8f0' }} />
                            <Typography variant="body2" sx={{ color: '#64748b', mb: 2, mt: 1 }}>
                                Upload templates for different purposes (Announcement, Ticket, Flyer, etc.)
                            </Typography>
                            {!id && (
                                <Alert severity="info" sx={{ mt: 1, mb: 2 }}>
                                    💡 Save the event first to enable template uploads.
                                </Alert>
                            )}
                        </Grid>

                        {/* Template Types Grid */}
                        <Grid item xs={12}>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                {templateTypes && templateTypes.length > 0 ? (
                                    templateTypes.map((type) => {
                                        const typeTemplates = templates[type.label] || [];
                                        const defaultTemplate = typeTemplates.find(t => t.is_default);
                                        const hasTemplates = typeTemplates.length > 0;
                                        const isDisabled = !id;

                                        return (
                                            <TemplateCard
                                                key={type.value}
                                                disabled={isDisabled}
                                                sx={{
                                                    flex: '1 1 150px',
                                                    minWidth: 150,
                                                    maxWidth: isMobile ? '100%' : 200,
                                                    border: defaultTemplate ? '2px solid #22c55e' : '1px solid #e2e8f0',
                                                    borderRadius: 2,
                                                    p: 2,
                                                    position: 'relative',
                                                }}
                                                onClick={() => {
                                                    if (isDisabled) {
                                                        toast.warning('Please save the event first before adding templates');
                                                        return;
                                                    }
                                                    setSelectedTemplateType(type.value);
                                                    setTemplateFormData({
                                                        ...templateFormData,
                                                        template_type_id: type.value,
                                                    });
                                                    setTemplateUploadDialog(true);
                                                }}
                                            >
                                                <Box sx={{ textAlign: 'center' }}>
                                                    <Typography variant="h2" sx={{ fontSize: 32 }}>
                                                        {type.icon || '📄'}
                                                    </Typography>
                                                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                                        {type.label}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                                                        {hasTemplates ? `${typeTemplates.length} template(s)` : 'No templates'}
                                                        {defaultTemplate && ' ⭐'}
                                                    </Typography>
                                                    {isDisabled ? (
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            disabled
                                                            sx={{ mt: 1, opacity: 0.5 }}
                                                        >
                                                            Save Event First
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            startIcon={<UploadIcon />}
                                                            sx={{ mt: 1 }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedTemplateType(type.value);
                                                                setTemplateFormData({
                                                                    ...templateFormData,
                                                                    template_type_id: type.value,
                                                                });
                                                                setTemplateUploadDialog(true);
                                                            }}
                                                        >
                                                            {hasTemplates ? 'Add More' : 'Upload'}
                                                        </Button>
                                                    )}
                                                </Box>
                                            </TemplateCard>
                                        );
                                    })
                                ) : (
                                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                                        Loading template types...
                                    </Typography>
                                )}
                            </Box>
                        </Grid>

                        {/* Template List */}
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#0f172a', mb: 1 }}>
                                Uploaded Templates
                            </Typography>
                            {Object.keys(templates).length === 0 ? (
                                <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                                    {id ? 'No templates uploaded yet. Click on a template type above to upload.' : 'Save the event first to upload templates.'}
                                </Typography>
                            ) : (
                                <Grid container spacing={2}>
                                    {Object.keys(templates).map((typeName) => (
                                        <Grid item xs={12} key={typeName}>
                                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                                                {typeName}
                                            </Typography>
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                                                {templates[typeName].map((template) => (
                                                    <Chip
                                                        key={template.id}
                                                        label={template.name}
                                                        color={template.is_default ? 'success' : 'default'}
                                                        variant={template.is_default ? 'filled' : 'outlined'}
                                                        icon={template.is_default ? <CheckIcon /> : <ImageIcon />}
                                                        onDelete={() => handleDeleteTemplate(template.id, template.name)}
                                                        onClick={() => {
                                                            if (!template.is_default && id) {
                                                                handleSetDefaultTemplate(template.id);
                                                            }
                                                        }}
                                                        sx={{
                                                            mb: 1,
                                                            cursor: template.is_default ? 'default' : 'pointer',
                                                            '&:hover': {
                                                                opacity: template.is_default ? 1 : 0.8,
                                                            }
                                                        }}
                                                    />
                                                ))}
                                            </Box>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}
                        </Grid>

                        {/* ============================================ */}
                        {/* SUBMIT */}
                        {/* ============================================ */}
                        <Grid item xs={12}>
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    gap: 2,
                                    mt: 2,
                                }}
                            >
                                <PrimaryButton
                                    variant="contained"
                                    type="submit"
                                    disabled={submitting}
                                    size="large"
                                    sx={isMobile ? { width: '100%' } : undefined}
                                >
                                    {submitting ? <CircularProgress size={24} sx={{ color: 'white' }} /> : (id ? 'Update Event' : 'Create Event')}
                                </PrimaryButton>
                                <OutlineButton
                                    variant="outlined"
                                    onClick={() => navigate('/events')}
                                    sx={isMobile ? { width: '100%' } : undefined}
                                >
                                    Cancel
                                </OutlineButton>
                            </Box>
                        </Grid>
                    </Grid>
                </form>
            </StyledPaper>

            {/* ============================================ */}
            {/* TEMPLATE UPLOAD DIALOG */}
            {/* ============================================ */}
            <Dialog
                open={templateUploadDialog}
                onClose={handleCloseTemplateDialog}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.12)'
                    }
                }}
            >
                <DialogTitle sx={{ color: '#0f172a', fontWeight: 700 }}>
                    Upload Template
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2 }}>
                        <FormControl fullWidth sx={{ mb: 2 }}>
                            <InputLabel>Template Type</InputLabel>
                            <Select
                                value={templateFormData.template_type_id}
                                onChange={(e) => setTemplateFormData({ ...templateFormData, template_type_id: e.target.value })}
                                label="Template Type"
                            >
                                {templateTypes && templateTypes.length > 0 ? (
                                    templateTypes.map((type) => (
                                        <MenuItem key={type.value} value={type.value}>
                                            {type.label}
                                        </MenuItem>
                                    ))
                                ) : (
                                    <MenuItem value="">No template types available</MenuItem>
                                )}
                            </Select>
                        </FormControl>

                        <TextField
                            fullWidth
                            label="Template Name"
                            value={templateFormData.name}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, name: e.target.value })}
                            sx={{ mb: 2 }}
                        />

                        <TextField
                            fullWidth
                            label="Description"
                            value={templateFormData.description}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, description: e.target.value })}
                            multiline
                            rows={2}
                            sx={{ mb: 2 }}
                        />

                        <Box
                            sx={{
                                border: '2px dashed #e2e8f0',
                                borderRadius: 2,
                                p: isMobile ? 2 : 3,
                                textAlign: 'center',
                                cursor: 'pointer',
                                '&:hover': { borderColor: '#4f46e5' },
                            }}
                            onClick={() => document.getElementById('template-file-input').click()}
                        >
                            <input
                                id="template-file-input"
                                type="file"
                                accept="image/png,image/jpeg,image/jpg"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    if (e.target.files[0]) {
                                        setTemplateFormData({ ...templateFormData, image: e.target.files[0] });
                                    }
                                }}
                            />
                            {templateFormData.image ? (
                                <Box>
                                    <img
                                        src={URL.createObjectURL(templateFormData.image)}
                                        alt="Preview"
                                        style={{ maxWidth: '100%', maxHeight: 150, objectFit: 'contain' }}
                                    />
                                    <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mt: 1 }}>
                                        {templateFormData.image.name}
                                    </Typography>
                                </Box>
                            ) : (
                                <>
                                    <UploadIcon sx={{ fontSize: 40, color: '#94a3b8' }} />
                                    <Typography variant="body1" sx={{ color: '#64748b' }}>
                                        Click to select template image
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                        PNG or JPG • Max 5MB
                                    </Typography>
                                </>
                            )}
                        </Box>

                        <FormControlLabel
                            control={
                                <Switch
                                    checked={templateFormData.is_default}
                                    onChange={(e) => setTemplateFormData({ ...templateFormData, is_default: e.target.checked })}
                                />
                            }
                            label="Set as default template"
                            sx={{ mt: 2 }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={handleCloseTemplateDialog}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={handleTemplateUpload}
                        disabled={uploadingTemplate || !id}
                        startIcon={uploadingTemplate ? <CircularProgress size={20} /> : <UploadIcon />}
                        sx={{
                            background: '#4f46e5',
                            '&:hover': { background: '#4338ca' },
                            '&:disabled': { opacity: 0.5 }
                        }}
                    >
                        {uploadingTemplate ? 'Uploading...' : 'Upload'}
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default CreateEvent;