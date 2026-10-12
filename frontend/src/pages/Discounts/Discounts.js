// frontend/src/pages/Discounts/Discounts.js
import React, { useState, useEffect } from 'react';
import {
    Grid, CardContent, Box, Typography, CircularProgress,
    Paper, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Chip, IconButton, Button,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Switch, FormControlLabel, MenuItem,
    Alert, Tooltip, Divider,
    Card, Autocomplete, Stack, useMediaQuery, useTheme,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon,
    Discount as DiscountIcon,
    People as PeopleIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageSubtitle,
    PageHeaderLeft,
    PageHeaderRight,
    LoadingWrapper,
} from '../../components/Common';
import styled from 'styled-components';

import { theme } from '../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

// ---------------------------------------------------------------------------
// Local styled components
// ---------------------------------------------------------------------------

const StatCard = styled(Paper)`
    background: ${props => props.theme.colors.bgCard};
    border: 1px solid ${props => props.theme.colors.borderLight};
    border-radius: ${props => props.theme.borderRadius.lg};
    padding: 20px;
    box-shadow: ${props => props.theme.shadows.card};
    height: 100%;

    @media (max-width: 600px) { padding: 14px; }
`;

const StatIcon = styled(Box)`
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const TableCard = styled(Paper)`
    background: ${props => props.theme.colors.bgCard};
    border: 1px solid ${props => props.theme.colors.borderLight};
    border-radius: ${props => props.theme.borderRadius.lg};
    box-shadow: ${props => props.theme.shadows.card};
    overflow: hidden;
    transition: all 0.3s ease;

    &:hover {
        border-color: ${props => props.theme.colors.borderHover};
        box-shadow: ${props => props.theme.shadows.cardHover};
    }
`;

const FormPaper = styled(Paper)`
    padding: 24px;
    background: ${props => props.theme.colors.bgCard};
    border: 1px solid ${props => props.theme.colors.borderLight};
    border-radius: ${props => props.theme.borderRadius.lg};

    @media (max-width: 600px) { padding: 16px; }
`;

const FormRow = styled(Grid)`
    margin-bottom: 16px;
`;

const StatusBadge = styled(Chip)`
    font-weight: 600;
    font-size: 11px;
`;

const EmptyState = ({ children, py = 4 }) => (
    <Box
        sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            py,
        }}
    >
        <Typography sx={{ color: 'text.disabled' }}>{children}</Typography>
    </Box>
);

const EMPTY_DISCOUNT = {
    code: '',
    name: '',
    type: 'percentage',
    value: '',
    min_order_amount: '',
    max_discount: '',
    max_uses: '',
    max_uses_per_user: '',
    min_ticket_count: 0,
    first_time_buyers_only: false,
    stackable: false,
    valid_from: '',
    valid_to: '',
    is_active: true,
    applicable_events: [],
};

const generateDiscountCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

const toDateInput = (value) => {
    if (!value) return '';
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return '';

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    } catch {
        return '';
    }
};

const fromDateInput = (value, { endOfDay = false } = {}) => {
    if (!value) return null;
    try {
        const [year, month, day] = value.split('-').map((n) => parseInt(n, 10));
        if (!year || !month || !day) return null;

        const hours = endOfDay ? 23 : 0;
        const minutes = endOfDay ? 59 : 0;
        const seconds = endOfDay ? 59 : 0;

        const local = new Date(year, month - 1, day, hours, minutes, seconds, 0);
        if (isNaN(local.getTime())) return null;

        return local.toISOString();
    } catch {
        return null;
    }
};

const Discounts = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

    const [loading, setLoading] = useState(true);
    const [discounts, setDiscounts] = useState([]);
    const [events, setEvents] = useState([]);
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        used: 0,
        expired: 0,
    });
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingDiscount, setEditingDiscount] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleteDialog, setDeleteDialog] = useState({
        open: false,
        id: null,
        code: '',
    });
    const [formData, setFormData] = useState({ ...EMPTY_DISCOUNT });

    const loadDiscounts = async () => {
        setLoading(true);
        try {
            const response = await api.get('/discounts/');
            const list = response.data?.results || response.data || [];
            setDiscounts(list);
            calculateStats(list);
        } catch (error) {
            console.error('Failed to load discounts:', error);
            toast.error('Failed to load discounts');
            setDiscounts([]);
        } finally {
            setLoading(false);
        }
    };

    const loadEvents = async () => {
        try {
            const response = await api.get('/events/');
            const list = response.data?.results || response.data || [];
            setEvents(list);
        } catch (error) {
            console.error('Failed to load events:', error);
            setEvents([]);
        }
    };

    const calculateStats = (data) => {
        const now = new Date();
        const total = data.length;
        const active = data.filter(
            (d) => d.is_active && (!d.valid_to || new Date(d.valid_to) > now)
        ).length;
        const used = data.filter((d) => (d.used_count || 0) > 0).length;
        const expired = data.filter(
            (d) => !d.is_active || (d.valid_to && new Date(d.valid_to) <= now)
        ).length;
        setStats({ total, active, used, expired });
    };

    useEffect(() => {
        loadDiscounts();
        loadEvents();
    }, []);

    const handleOpenDialog = (discount = null) => {
        if (discount) {
            setEditingDiscount(discount);
            setFormData({
                code: discount.code || '',
                name: discount.name || '',
                type: discount.type || 'percentage',
                value: discount.value ?? '',
                min_order_amount: discount.min_order_amount ?? '',
                max_discount: discount.max_discount ?? '',
                max_uses: discount.max_uses ?? '',
                max_uses_per_user: discount.max_uses_per_user ?? '',
                min_ticket_count: discount.min_ticket_count ?? 0,
                first_time_buyers_only: !!discount.first_time_buyers_only,
                stackable: !!discount.stackable,
                valid_from: toDateInput(discount.valid_from),
                valid_to: toDateInput(discount.valid_to),
                is_active: discount.is_active !== undefined ? discount.is_active : true,
                applicable_events: discount.applicable_events || [],
            });
        } else {
            setEditingDiscount(null);
            setFormData({
                ...EMPTY_DISCOUNT,
                code: generateDiscountCode(),
            });
        }
        setDialogOpen(true);
    };

    const handleFormChange = (e) => {
        const { name, value, checked, type } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);

        try {
            const payload = {
                code: (formData.code || '').trim(),
                name: formData.name || '',
                type: formData.type,
                value: parseFloat(formData.value) || 0,
                min_order_amount: formData.min_order_amount
                    ? parseFloat(formData.min_order_amount)
                    : 0,
                max_discount: formData.max_discount
                    ? parseFloat(formData.max_discount)
                    : null,
                max_uses: formData.max_uses
                    ? parseInt(formData.max_uses, 10)
                    : null,
                max_uses_per_user: formData.max_uses_per_user
                    ? parseInt(formData.max_uses_per_user, 10)
                    : null,
                min_ticket_count:
                    parseInt(formData.min_ticket_count, 10) || 0,
                first_time_buyers_only: !!formData.first_time_buyers_only,
                stackable: !!formData.stackable,
                valid_from: fromDateInput(formData.valid_from),
                valid_to: fromDateInput(formData.valid_to, { endOfDay: true }),
                is_active: !!formData.is_active,
                applicable_events: (formData.applicable_events || []).map(
                    (ev) => (typeof ev === 'string' ? ev : ev.id)
                ),
            };

            if (editingDiscount) {
                await api.put(`/discounts/${editingDiscount.id}/`, payload);
                toast.success('Discount updated successfully!');
            } else {
                await api.post('/discounts/', payload);
                toast.success('Discount created successfully!');
            }

            setDialogOpen(false);
            setFormData({ ...EMPTY_DISCOUNT });
            setEditingDiscount(null);
            loadDiscounts();
        } catch (error) {
            console.error('Save error:', error);
            const data = error.response?.data;
            let msg = 'Failed to save discount';
            if (typeof data === 'string') msg = data;
            else if (data?.detail) msg = data.detail;
            else if (data && typeof data === 'object') {
                const firstKey = Object.keys(data)[0];
                const firstVal = data[firstKey];
                msg = Array.isArray(firstVal) ? firstVal[0] : String(firstVal);
            }
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/discounts/${deleteDialog.id}/`);
            toast.success('Discount deleted successfully');
            setDeleteDialog({ open: false, id: null, code: '' });
            loadDiscounts();
        } catch (error) {
            console.error('Delete error:', error);
            toast.error(
                error.response?.data?.detail || 'Failed to delete discount'
            );
        }
    };

    const handleCopyCode = (code) => {
        if (!code) return;
        navigator.clipboard.writeText(code);
        toast.success('Discount code copied to clipboard!');
    };

    const getStatusChip = (discount) => {
        const now = new Date();
        if (!discount.is_active) {
            return <StatusBadge label="INACTIVE" size="small" color="default" />;
        }
        if (discount.valid_to && new Date(discount.valid_to) < now) {
            return <StatusBadge label="EXPIRED" size="small" color="error" />;
        }
        if (
            discount.max_uses &&
            (discount.used_count || 0) >= discount.max_uses
        ) {
            return (
                <StatusBadge label="EXHAUSTED" size="small" color="warning" />
            );
        }
        return <StatusBadge label="ACTIVE" size="small" color="success" />;
    };

    // ✅ Token-driven stat cards
    const statCards = [
        {
            title: 'Total Discounts',
            value: stats.total,
            icon: <DiscountIcon />,
            color: C.primary,
            bg: `${C.primary}14`,
        },
        {
            title: 'Active',
            value: stats.active,
            icon: <CheckCircleIcon />,
            color: C.success,
            bg: `${C.success}14`,
        },
        {
            title: 'Used',
            value: stats.used,
            icon: <PeopleIcon />,
            color: C.secondary,
            bg: `${C.secondary}14`,
        },
        {
            title: 'Expired',
            value: stats.expired,
            icon: <CancelIcon />,
            color: C.error,
            bg: `${C.error}14`,
        },
    ];

    if (loading && discounts.length === 0) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: C.primary }} />
            </LoadingWrapper>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>Discounts</PageTitle>
                    {!isMobile && (
                        <PageSubtitle>Manage promotional codes and discounts</PageSubtitle>
                    )}
                </PageHeaderLeft>
                <PageHeaderRight>
                    <Stack
                        direction="row"
                        spacing={1}
                        flexWrap="wrap"
                        useFlexGap
                        sx={{
                            justifyContent: 'flex-end',
                            width: isMobile ? '100%' : 'auto',
                        }}
                    >
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<RefreshIcon />}
                            onClick={loadDiscounts}
                            sx={{
                                textTransform: 'none',
                                borderColor: 'divider',
                                color: 'text.secondary',
                            }}
                        >
                            Refresh
                        </Button>
                        <Button
                            variant="contained"
                            size="small"
                            startIcon={<AddIcon />}
                            onClick={() => handleOpenDialog()}
                            sx={{
                                textTransform: 'none',
                                background: C.primaryGradient,
                                color: C.textInverse,
                            }}
                        >
                            {isMobile ? 'Create' : 'Create Discount'}
                        </Button>
                    </Stack>
                </PageHeaderRight>
            </PageHeader>

            <Grid container spacing={isMobile ? 1.5 : 2} sx={{ mb: 3 }}>
                {statCards.map((stat, index) => (
                    <Grid item xs={6} sm={6} md={3} key={index}>
                        <StatCard>
                            <Box
                                sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 1,
                                }}
                            >
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            color: 'text.secondary',
                                            fontWeight: 600,
                                            letterSpacing: 0.5,
                                            fontSize: isSmall ? '10px' : '12px',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        {stat.title}
                                    </Typography>
                                    <Typography
                                        variant="h4"
                                        sx={{
                                            fontWeight: 700,
                                            color: 'text.primary',
                                            mt: 1,
                                            fontSize: isSmall ? '1.25rem' : '1.75rem',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {stat.value}
                                    </Typography>
                                </Box>
                                <StatIcon sx={{ backgroundColor: stat.bg, color: stat.color }}>
                                    {stat.icon}
                                </StatIcon>
                            </Box>
                        </StatCard>
                    </Grid>
                ))}
            </Grid>

            {isMobile ? (
                discounts.length === 0 ? (
                    <TableCard sx={{ p: 4 }}>
                        <EmptyState py={2}>
                            No discounts found. Create your first discount!
                        </EmptyState>
                    </TableCard>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {discounts.map((discount) => (
                            <Card
                                key={discount.id}
                                sx={{
                                    borderRadius: 2,
                                    border: `1px solid ${C.borderLight}`,
                                    overflow: 'hidden',
                                    background: C.bgCard,
                                }}
                            >
                                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <Typography
                                            variant="h6"
                                            sx={{
                                                fontFamily: F.familyMono,
                                                fontWeight: 700,
                                                color: 'text.primary',
                                                flex: 1,
                                                minWidth: 0,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}
                                        >
                                            {discount.code}
                                        </Typography>
                                        <IconButton
                                            size="small"
                                            sx={{ color: 'text.disabled' }}
                                            onClick={() => handleCopyCode(discount.code)}
                                        >
                                            <ContentCopyIcon fontSize="small" />
                                        </IconButton>
                                    </Box>

                                    {discount.name && (
                                        <Box sx={{ mb: 1 }}>
                                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                                {discount.name}
                                            </Typography>
                                        </Box>
                                    )}

                                    <Divider sx={{ my: 1.5 }} />

                                    <Box
                                        sx={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr 1fr',
                                            gap: 1.5,
                                            mb: 1.5,
                                        }}
                                    >
                                        {[
                                            {
                                                label: 'Type',
                                                value: (discount.type || 'percentage').toUpperCase(),
                                                color: C.primary,
                                                weight: 600,
                                            },
                                            {
                                                label: 'Value',
                                                value:
                                                    discount.type === 'percentage'
                                                        ? `${discount.value}%`
                                                        : `₹${discount.value}`,
                                                color: C.textPrimary,
                                                weight: 700,
                                            },
                                            {
                                                label: 'Used',
                                                value: `${discount.used_count || 0}${
                                                    discount.max_uses ? ` / ${discount.max_uses}` : ''
                                                }`,
                                                color: C.textPrimary,
                                                weight: 500,
                                            },
                                            {
                                                label: 'Valid Until',
                                                value: discount.valid_to
                                                    ? new Date(discount.valid_to).toLocaleDateString()
                                                    : 'Never',
                                                color: C.textPrimary,
                                                weight: 500,
                                            },
                                        ].map((item) => (
                                            <Box key={item.label}>
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color: 'text.disabled',
                                                        textTransform: 'uppercase',
                                                        fontSize: '10px',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {item.label}
                                                </Typography>
                                                <Typography
                                                    variant="body2"
                                                    sx={{ color: item.color, fontWeight: item.weight }}
                                                >
                                                    {item.value}
                                                </Typography>
                                            </Box>
                                        ))}
                                    </Box>

                                    <Box sx={{ mb: 1.5 }}>{getStatusChip(discount)}</Box>

                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <Button
                                            fullWidth
                                            size="small"
                                            variant="outlined"
                                            startIcon={<EditIcon />}
                                            onClick={() => handleOpenDialog(discount)}
                                            sx={{
                                                borderColor: C.primary,
                                                color: C.primary,
                                                textTransform: 'none',
                                            }}
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            fullWidth
                                            size="small"
                                            variant="outlined"
                                            startIcon={<DeleteIcon />}
                                            onClick={() =>
                                                setDeleteDialog({
                                                    open: true,
                                                    id: discount.id,
                                                    code: discount.code,
                                                })
                                            }
                                            sx={{
                                                borderColor: `${C.error}4D`,
                                                color: C.error,
                                                textTransform: 'none',
                                            }}
                                        >
                                            Delete
                                        </Button>
                                    </Box>
                                </CardContent>
                            </Card>
                        ))}
                    </Box>
                )
            ) : (
                <TableCard>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    {[
                                        { label: 'Code', align: 'left' },
                                        { label: 'Name', align: 'left' },
                                        { label: 'Type', align: 'center' },
                                        { label: 'Value', align: 'center' },
                                        { label: 'Used / Limit', align: 'center' },
                                        { label: 'Status', align: 'center' },
                                        { label: 'Valid Until', align: 'center' },
                                        { label: 'Actions', align: 'center' },
                                    ].map((h) => (
                                        <TableCell
                                            key={h.label}
                                            align={h.align}
                                            sx={{
                                                color: 'text.secondary',
                                                fontWeight: 600,
                                                borderBottom: `1px solid ${C.borderLight}`,
                                                background: C.bgPrimary,
                                            }}
                                        >
                                            {h.label}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {discounts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                                            <EmptyState py={2}>
                                                No discounts found. Create your first discount!
                                            </EmptyState>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    discounts.map((discount) => (
                                        <TableRow
                                            key={discount.id}
                                            hover
                                            sx={{ '&:hover': { backgroundColor: C.bgPrimary } }}
                                        >
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography
                                                        variant="body2"
                                                        fontWeight="bold"
                                                        sx={{
                                                            color: 'text.primary',
                                                            fontFamily: F.familyMono,
                                                        }}
                                                    >
                                                        {discount.code}
                                                    </Typography>
                                                    <Tooltip title="Copy code">
                                                        <IconButton
                                                            size="small"
                                                            sx={{ color: 'text.disabled' }}
                                                            onClick={() => handleCopyCode(discount.code)}
                                                        >
                                                            <ContentCopyIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </TableCell>
                                            <TableCell sx={{ color: 'text.primary' }}>
                                                {discount.name || '-'}
                                            </TableCell>
                                            <TableCell align="center">
                                                <Chip
                                                    label={(discount.type || 'percentage').toUpperCase()}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{
                                                        borderColor: C.primary,
                                                        color: C.primary,
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell align="center" sx={{ fontWeight: 600, color: 'text.primary' }}>
                                                {discount.type === 'percentage'
                                                    ? `${discount.value}%`
                                                    : `₹${discount.value}`}
                                            </TableCell>
                                            <TableCell align="center" sx={{ color: 'text.secondary' }}>
                                                {discount.used_count || 0}
                                                {discount.max_uses && ` / ${discount.max_uses}`}
                                            </TableCell>
                                            <TableCell align="center">{getStatusChip(discount)}</TableCell>
                                            <TableCell align="center" sx={{ color: 'text.secondary' }}>
                                                {discount.valid_to
                                                    ? new Date(discount.valid_to).toLocaleDateString()
                                                    : 'Never'}
                                            </TableCell>
                                            <TableCell align="center">
                                                <Tooltip title="Edit">
                                                    <IconButton
                                                        size="small"
                                                        sx={{ color: C.primary }}
                                                        onClick={() => handleOpenDialog(discount)}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                    <IconButton
                                                        size="small"
                                                        sx={{ color: C.error }}
                                                        onClick={() =>
                                                            setDeleteDialog({
                                                                open: true,
                                                                id: discount.id,
                                                                code: discount.code,
                                                            })
                                                        }
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </TableCard>
            )}

            <Dialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        background: C.bgCard,
                        border: `1px solid ${C.borderLight}`,
                        borderRadius: '16px',
                        boxShadow: theme.shadows.modal,
                    },
                }}
            >
                <DialogTitle sx={{ color: 'text.primary', fontWeight: 700 }}>
                    {editingDiscount ? 'Edit Discount' : 'Create New Discount'}
                </DialogTitle>
                <DialogContent>
                    <FormPaper component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
                        <FormRow container spacing={2}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Discount Code"
                                    name="code"
                                    value={formData.code}
                                    onChange={handleFormChange}
                                    required
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    select
                                    label="Discount Type"
                                    name="type"
                                    value={formData.type}
                                    onChange={handleFormChange}
                                >
                                    <MenuItem value="percentage">Percentage (%)</MenuItem>
                                    <MenuItem value="fixed">Fixed Amount (₹)</MenuItem>
                                </TextField>
                            </Grid>
                        </FormRow>

                        <FormRow container spacing={2}>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    label="Name (internal)"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleFormChange}
                                    helperText="Not shown to customers"
                                />
                            </Grid>
                        </FormRow>

                        <FormRow container spacing={2}>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label={formData.type === 'percentage' ? 'Percentage (%)' : 'Amount (₹)'}
                                    name="value"
                                    type="number"
                                    value={formData.value}
                                    onChange={handleFormChange}
                                    required
                                    inputProps={{ min: 0, step: '0.01' }}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label="Min Order Amount (₹)"
                                    name="min_order_amount"
                                    type="number"
                                    value={formData.min_order_amount}
                                    onChange={handleFormChange}
                                    inputProps={{ min: 0, step: '0.01' }}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label="Max Discount Amount (₹)"
                                    name="max_discount"
                                    type="number"
                                    value={formData.max_discount}
                                    onChange={handleFormChange}
                                    helperText="Cap on percentage discounts"
                                    inputProps={{ min: 0, step: '0.01' }}
                                />
                            </Grid>
                        </FormRow>

                        <FormRow container spacing={2}>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label="Global Usage Limit"
                                    name="max_uses"
                                    type="number"
                                    value={formData.max_uses}
                                    onChange={handleFormChange}
                                    helperText="Empty = unlimited"
                                    inputProps={{ min: 1 }}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label="Max Uses Per User"
                                    name="max_uses_per_user"
                                    type="number"
                                    value={formData.max_uses_per_user}
                                    onChange={handleFormChange}
                                    helperText="Empty = unlimited"
                                    inputProps={{ min: 1 }}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label="Min Ticket Count"
                                    name="min_ticket_count"
                                    type="number"
                                    value={formData.min_ticket_count}
                                    onChange={handleFormChange}
                                    helperText="0 = no minimum"
                                    inputProps={{ min: 0 }}
                                />
                            </Grid>
                        </FormRow>

                        <FormRow container spacing={2}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Valid From"
                                    name="valid_from"
                                    type="date"
                                    value={formData.valid_from}
                                    onChange={handleFormChange}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Valid To"
                                    name="valid_to"
                                    type="date"
                                    value={formData.valid_to}
                                    onChange={handleFormChange}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                        </FormRow>

                        <FormRow container spacing={2}>
                            <Grid item xs={12}>
                                <Autocomplete
                                    multiple
                                    options={events}
                                    getOptionLabel={(option) =>
                                        typeof option === 'string' ? option : option.title || ''
                                    }
                                    isOptionEqualToValue={(option, value) =>
                                        (option.id || option) === (value.id || value)
                                    }
                                    value={(formData.applicable_events || [])
                                        .map((id) =>
                                            typeof id === 'string'
                                                ? events.find((ev) => ev.id === id) || id
                                                : id
                                        )
                                        .filter(Boolean)}
                                    onChange={(_, newValue) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            applicable_events: newValue,
                                        }))
                                    }
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Applicable Events"
                                            helperText="Leave empty to apply to all your events"
                                        />
                                    )}
                                />
                            </Grid>
                        </FormRow>

                        <FormRow container spacing={2}>
                            <Grid item xs={12} md={6}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={formData.first_time_buyers_only}
                                            onChange={handleFormChange}
                                            name="first_time_buyers_only"
                                        />
                                    }
                                    label="First-time buyers only"
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={formData.stackable}
                                            onChange={handleFormChange}
                                            name="stackable"
                                        />
                                    }
                                    label="Allow stacking with other discounts"
                                />
                            </Grid>
                        </FormRow>

                        <FormRow container spacing={2}>
                            <Grid item xs={12}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={formData.is_active}
                                            onChange={handleFormChange}
                                            name="is_active"
                                        />
                                    }
                                    label="Active"
                                />
                            </Grid>
                        </FormRow>

                        <Box
                            sx={{
                                display: 'flex',
                                gap: 2,
                                justifyContent: 'flex-end',
                                mt: 3,
                                pt: 2,
                                borderTop: `1px solid ${C.borderLight}`,
                                flexWrap: 'wrap',
                            }}
                        >
                            <Button
                                type="button"
                                variant="outlined"
                                size="small"
                                onClick={() => setDialogOpen(false)}
                                disabled={saving}
                                sx={{
                                    textTransform: 'none',
                                    borderColor: 'divider',
                                    color: 'text.secondary',
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="contained"
                                size="small"
                                disabled={saving}
                                sx={{
                                    textTransform: 'none',
                                    background: C.primaryGradient,
                                    color: C.textInverse,
                                    minWidth: 100,
                                }}
                            >
                                {saving ? (
                                    <CircularProgress size={20} sx={{ color: C.textInverse }} />
                                ) : editingDiscount ? (
                                    'Update'
                                ) : (
                                    'Create'
                                )}
                            </Button>
                        </Box>
                    </FormPaper>
                </DialogContent>
            </Dialog>

            <Dialog
                open={deleteDialog.open}
                onClose={() => setDeleteDialog({ open: false, id: null, code: '' })}
                PaperProps={{
                    sx: {
                        background: C.bgCard,
                        border: `1px solid ${C.borderLight}`,
                        borderRadius: '16px',
                        boxShadow: theme.shadows.modal,
                    },
                }}
            >
                <DialogTitle sx={{ color: 'text.primary', fontWeight: 700 }}>
                    Delete Discount
                </DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        This action cannot be undone.
                    </Alert>
                    <Typography sx={{ color: 'text.secondary' }}>
                        Are you sure you want to delete the discount code "{deleteDialog.code}"?
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setDeleteDialog({ open: false, id: null, code: '' })}
                        sx={{
                            textTransform: 'none',
                            borderColor: 'divider',
                            color: 'text.secondary',
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        size="small"
                        color="error"
                        onClick={handleDelete}
                        sx={{ textTransform: 'none' }}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default Discounts;