// frontend/src/pages/Discounts/Discounts.js
import React, { useState, useEffect } from 'react';
import {
    Grid, CardContent, Box, Typography, CircularProgress,
    Paper, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Chip, IconButton, Button,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Switch, FormControlLabel, MenuItem,
    Alert, Tooltip, Divider, InputAdornment,
    Card, useMediaQuery, useTheme,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon,
    Discount as DiscountIcon,
    Percent as PercentIcon,
    CalendarToday as CalendarIcon,
    People as PeopleIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageSubtitle,
    PageHeaderLeft,
    PageHeaderRight,
    StatsCard,
    PrimaryButton,
    OutlineButton,
    LoadingWrapper,
    StatsGrid,
    StatItem,
    StatValue,
    StatLabel,
    StatIcon,
    StyledTableContainer,
    StatusChip,
} from '../../components/Common';
import styled from 'styled-components';

const DiscountForm = styled(Paper)`
    padding: 24px;
    background: ${props => props.theme.colors.bgCard};
    border: 1px solid ${props => props.theme.colors.borderLight};
    border-radius: ${props => props.theme.borderRadius.lg};
`;

const FormRow = styled(Grid)`
    margin-bottom: 16px;
`;

const CodeDisplay = styled(Box)`
    background: ${props => props.theme.colors.bgInput};
    padding: 12px 16px;
    border-radius: ${props => props.theme.borderRadius.md};
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: monospace;
    font-size: 18px;
    font-weight: 600;
    color: ${props => props.theme.colors.primary};
    border: 1px dashed ${props => props.theme.colors.borderLight};
`;

const StatusBadge = styled(Chip)`
    font-weight: 600;
    font-size: 11px;
`;

const Discounts = () => {
    const { user } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [loading, setLoading] = useState(true);
    const [discounts, setDiscounts] = useState([]);
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        used: 0,
        expired: 0,
    });
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingDiscount, setEditingDiscount] = useState(null);
    const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, code: '' });
    const [formData, setFormData] = useState({
        code: '',
        description: '',
        discount_type: 'percentage',
        value: '',
        min_order_amount: '',
        max_discount_amount: '',
        usage_limit: '',
        used_count: 0,
        start_date: '',
        end_date: '',
        is_active: true,
    });

    const loadDiscounts = async () => {
        setLoading(true);
        try {
            const response = await api.get('/discounts/');
            setDiscounts(response.data);
            calculateStats(response.data);
        } catch (error) {
            console.error('Failed to load discounts:', error);
            toast.error('Failed to load discounts');
        }
        setLoading(false);
    };

    const calculateStats = (data) => {
        const total = data.length;
        const active = data.filter(d => d.is_active && new Date(d.end_date) > new Date()).length;
        const used = data.filter(d => d.used_count > 0).length;
        const expired = data.filter(d => !d.is_active || new Date(d.end_date) <= new Date()).length;
        setStats({ total, active, used, expired });
    };

    useEffect(() => {
        loadDiscounts();
    }, []);

    const handleOpenDialog = (discount = null) => {
        if (discount) {
            setEditingDiscount(discount);
            setFormData({
                code: discount.code,
                description: discount.description || '',
                discount_type: discount.discount_type || 'percentage',
                value: discount.value || '',
                min_order_amount: discount.min_order_amount || '',
                max_discount_amount: discount.max_discount_amount || '',
                usage_limit: discount.usage_limit || '',
                used_count: discount.used_count || 0,
                start_date: discount.start_date ? discount.start_date.split('T')[0] : '',
                end_date: discount.end_date ? discount.end_date.split('T')[0] : '',
                is_active: discount.is_active !== undefined ? discount.is_active : true,
            });
        } else {
            setEditingDiscount(null);
            setFormData({
                code: generateDiscountCode(),
                description: '',
                discount_type: 'percentage',
                value: '',
                min_order_amount: '',
                max_discount_amount: '',
                usage_limit: '',
                used_count: 0,
                start_date: '',
                end_date: '',
                is_active: true,
            });
        }
        setDialogOpen(true);
    };

    const generateDiscountCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    };

    const handleFormChange = (e) => {
        const { name, value, checked, type } = e.target;
        setFormData({
            ...formData,
            [name]: type === 'checkbox' ? checked : value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const data = {
                ...formData,
                value: parseFloat(formData.value),
                min_order_amount: formData.min_order_amount ? parseFloat(formData.min_order_amount) : null,
                max_discount_amount: formData.max_discount_amount ? parseFloat(formData.max_discount_amount) : null,
                usage_limit: formData.usage_limit ? parseInt(formData.usage_limit) : null,
            };

            let response;
            if (editingDiscount) {
                response = await api.put(`/discounts/${editingDiscount.id}/`, data);
                toast.success('Discount updated successfully!');
            } else {
                response = await api.post('/discounts/', data);
                toast.success('Discount created successfully!');
            }

            setDialogOpen(false);
            loadDiscounts();
        } catch (error) {
            console.error('Save error:', error);
            toast.error(error.response?.data?.detail || 'Failed to save discount');
        } finally {
            setLoading(false);
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
            toast.error('Failed to delete discount');
        }
    };

    const handleCopyCode = (code) => {
        navigator.clipboard.writeText(code);
        toast.success('Discount code copied to clipboard!');
    };

    const getStatusChip = (discount) => {
        if (!discount.is_active) {
            return <StatusBadge label="INACTIVE" size="small" color="default" />;
        }
        if (new Date(discount.end_date) < new Date()) {
            return <StatusBadge label="EXPIRED" size="small" color="error" />;
        }
        if (discount.usage_limit && discount.used_count >= discount.usage_limit) {
            return <StatusBadge label="EXHAUSTED" size="small" color="warning" />;
        }
        return <StatusBadge label="ACTIVE" size="small" color="success" />;
    };

    const statCards = [
        {
            title: 'Total Discounts',
            value: stats.total,
            icon: <DiscountIcon />,
            color: '#4f46e5',
            bg: 'rgba(79, 70, 229, 0.08)'
        },
        {
            title: 'Active',
            value: stats.active,
            icon: <CheckCircleIcon />,
            color: '#10b981',
            bg: 'rgba(16, 185, 129, 0.08)'
        },
        {
            title: 'Used',
            value: stats.used,
            icon: <PeopleIcon />,
            color: '#7c3aed',
            bg: 'rgba(124, 58, 237, 0.08)'
        },
        {
            title: 'Expired',
            value: stats.expired,
            icon: <CancelIcon />,
            color: '#ef4444',
            bg: 'rgba(239, 68, 68, 0.08)'
        },
    ];

    if (loading && discounts.length === 0) {
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
                    <PageTitle>Discounts</PageTitle>
                    {!isMobile && <PageSubtitle>Manage promotional codes and discounts</PageSubtitle>}
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton variant="outlined" startIcon={<RefreshIcon />} onClick={loadDiscounts}>
                        Refresh
                    </OutlineButton>
                    <PrimaryButton variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
                        {isMobile ? 'Create' : 'Create Discount'}
                    </PrimaryButton>
                </PageHeaderRight>
            </PageHeader>

            {/* Stats Cards */}
            <StatsGrid>
                {statCards.map((stat, index) => (
                    <StatsCard key={index}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <StatItem>
                                    <StatLabel>{stat.title}</StatLabel>
                                    <StatValue variant="h4">{stat.value}</StatValue>
                                </StatItem>
                                <StatIcon color={stat.color} bg={stat.bg}>
                                    {stat.icon}
                                </StatIcon>
                            </Box>
                        </CardContent>
                    </StatsCard>
                ))}
            </StatsGrid>

            {/* ==================== MOBILE: CARD LIST ==================== */}
            {isMobile ? (
                discounts.length === 0 ? (
                    <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                        <Typography sx={{ color: '#94a3b8' }}>
                            No discounts found. Create your first discount!
                        </Typography>
                    </Paper>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {discounts.map((discount) => (
                            <Card
                                key={discount.id}
                                sx={{
                                    borderRadius: 2,
                                    border: '1px solid #e2e8f0',
                                    overflow: 'hidden',
                                }}
                            >
                                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <Typography
                                            variant="h6"
                                            sx={{
                                                fontFamily: 'monospace',
                                                fontWeight: 700,
                                                color: '#0f172a',
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
                                            sx={{ color: '#94a3b8' }}
                                            onClick={() => handleCopyCode(discount.code)}
                                        >
                                            <ContentCopyIcon fontSize="small" />
                                        </IconButton>
                                    </Box>

                                    <Box sx={{ mb: 1 }}>
                                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                                            {discount.description || 'No description'}
                                        </Typography>
                                    </Box>

                                    <Divider sx={{ my: 1.5 }} />

                                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
                                        <Box>
                                            <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600 }}>
                                                Type
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: '#4f46e5', fontWeight: 600 }}>
                                                {discount.discount_type?.toUpperCase() || 'PERCENTAGE'}
                                            </Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600 }}>
                                                Value
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 700 }}>
                                                {discount.discount_type === 'percentage'
                                                    ? `${discount.value}%`
                                                    : `₹${discount.value}`}
                                            </Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600 }}>
                                                Used
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: '#334155' }}>
                                                {discount.used_count || 0}
                                                {discount.usage_limit && ` / ${discount.usage_limit}`}
                                            </Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600 }}>
                                                Valid Until
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: '#334155' }}>
                                                {discount.end_date ? new Date(discount.end_date).toLocaleDateString() : 'Never'}
                                            </Typography>
                                        </Box>
                                    </Box>

                                    <Box sx={{ mb: 1.5 }}>{getStatusChip(discount)}</Box>

                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <Button
                                            fullWidth
                                            size="small"
                                            variant="outlined"
                                            startIcon={<EditIcon />}
                                            onClick={() => handleOpenDialog(discount)}
                                            sx={{ borderColor: '#c7d2fe', color: '#4f46e5', textTransform: 'none' }}
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            fullWidth
                                            size="small"
                                            variant="outlined"
                                            startIcon={<DeleteIcon />}
                                            onClick={() =>
                                                setDeleteDialog({ open: true, id: discount.id, code: discount.code })
                                            }
                                            sx={{ borderColor: '#fecaca', color: '#ef4444', textTransform: 'none' }}
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
                /* ==================== DESKTOP: TABLE ==================== */
                <StyledTableContainer>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Code</TableCell>
                                    <TableCell sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Description</TableCell>
                                    <TableCell align="center" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Type</TableCell>
                                    <TableCell align="center" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Value</TableCell>
                                    <TableCell align="center" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Used / Limit</TableCell>
                                    <TableCell align="center" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Status</TableCell>
                                    <TableCell align="center" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Valid Until</TableCell>
                                    <TableCell align="center" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {discounts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                                            <Typography sx={{ color: '#94a3b8' }}>
                                                No discounts found. Create your first discount!
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    discounts.map((discount) => (
                                        <TableRow
                                            key={discount.id}
                                            hover
                                            sx={{ '&:hover': { backgroundColor: '#f8fafc' } }}
                                        >
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography variant="body2" fontWeight="bold" sx={{ color: '#0f172a', fontFamily: 'monospace' }}>
                                                        {discount.code}
                                                    </Typography>
                                                    <Tooltip title="Copy code">
                                                        <IconButton size="small" sx={{ color: '#94a3b8' }} onClick={() => handleCopyCode(discount.code)}>
                                                            <ContentCopyIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </TableCell>
                                            <TableCell sx={{ color: '#334155' }}>
                                                {discount.description || '-'}
                                            </TableCell>
                                            <TableCell align="center">
                                                <Chip
                                                    label={discount.discount_type?.toUpperCase() || 'PERCENTAGE'}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{
                                                        borderColor: '#c7d2fe',
                                                        color: '#4f46e5',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell align="center" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                                {discount.discount_type === 'percentage'
                                                    ? `${discount.value}%`
                                                    : `₹${discount.value}`
                                                }
                                            </TableCell>
                                            <TableCell align="center" sx={{ color: '#475569' }}>
                                                {discount.used_count || 0}
                                                {discount.usage_limit && ` / ${discount.usage_limit}`}
                                            </TableCell>
                                            <TableCell align="center">
                                                {getStatusChip(discount)}
                                            </TableCell>
                                            <TableCell align="center" sx={{ color: '#64748b' }}>
                                                {discount.end_date ? new Date(discount.end_date).toLocaleDateString() : 'Never'}
                                            </TableCell>
                                            <TableCell align="center">
                                                <Tooltip title="Edit">
                                                    <IconButton
                                                        size="small"
                                                        sx={{ color: '#4f46e5' }}
                                                        onClick={() => handleOpenDialog(discount)}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                    <IconButton
                                                        size="small"
                                                        sx={{ color: '#ef4444' }}
                                                        onClick={() => setDeleteDialog({
                                                            open: true,
                                                            id: discount.id,
                                                            code: discount.code
                                                        })}
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
                </StyledTableContainer>
            )}

            {/* Create/Edit Dialog */}
            <Dialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                maxWidth="md"
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
                    {editingDiscount ? 'Edit Discount' : 'Create New Discount'}
                </DialogTitle>
                <DialogContent>
                    <DiscountForm component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
                        <FormRow container spacing={2}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Discount Code"
                                    name="code"
                                    value={formData.code}
                                    onChange={handleFormChange}
                                    required
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            '& fieldset': { borderColor: '#e2e8f0' },
                                            '&:hover fieldset': { borderColor: '#c7d2fe' },
                                            '&.Mui-focused fieldset': { borderColor: '#4f46e5' }
                                        }
                                    }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    select
                                    label="Discount Type"
                                    name="discount_type"
                                    value={formData.discount_type}
                                    onChange={handleFormChange}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            '& fieldset': { borderColor: '#e2e8f0' },
                                            '&:hover fieldset': { borderColor: '#c7d2fe' },
                                            '&.Mui-focused fieldset': { borderColor: '#4f46e5' }
                                        }
                                    }}
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
                                    label="Description"
                                    name="description"
                                    value={formData.description}
                                    onChange={handleFormChange}
                                    multiline
                                    rows={2}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            '& fieldset': { borderColor: '#e2e8f0' },
                                            '&:hover fieldset': { borderColor: '#c7d2fe' },
                                            '&.Mui-focused fieldset': { borderColor: '#4f46e5' }
                                        }
                                    }}
                                />
                            </Grid>
                        </FormRow>

                        <FormRow container spacing={2}>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label={formData.discount_type === 'percentage' ? 'Percentage (%)' : 'Amount (₹)'}
                                    name="value"
                                    type="number"
                                    value={formData.value}
                                    onChange={handleFormChange}
                                    required
                                    InputProps={{
                                        startAdornment: formData.discount_type === 'percentage' ? null : (
                                            <InputAdornment position="start">₹</InputAdornment>
                                        ),
                                        endAdornment: formData.discount_type === 'percentage' ? (
                                            <InputAdornment position="end">%</InputAdornment>
                                        ) : null,
                                    }}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            '& fieldset': { borderColor: '#e2e8f0' },
                                            '&:hover fieldset': { borderColor: '#c7d2fe' },
                                            '&.Mui-focused fieldset': { borderColor: '#4f46e5' }
                                        }
                                    }}
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
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            '& fieldset': { borderColor: '#e2e8f0' },
                                            '&:hover fieldset': { borderColor: '#c7d2fe' },
                                            '&.Mui-focused fieldset': { borderColor: '#4f46e5' }
                                        }
                                    }}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label="Max Discount Amount (₹)"
                                    name="max_discount_amount"
                                    type="number"
                                    value={formData.max_discount_amount}
                                    onChange={handleFormChange}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            '& fieldset': { borderColor: '#e2e8f0' },
                                            '&:hover fieldset': { borderColor: '#c7d2fe' },
                                            '&.Mui-focused fieldset': { borderColor: '#4f46e5' }
                                        }
                                    }}
                                />
                            </Grid>
                        </FormRow>

                        <FormRow container spacing={2}>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label="Usage Limit"
                                    name="usage_limit"
                                    type="number"
                                    value={formData.usage_limit}
                                    onChange={handleFormChange}
                                    helperText="Leave empty for unlimited"
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            '& fieldset': { borderColor: '#e2e8f0' },
                                            '&:hover fieldset': { borderColor: '#c7d2fe' },
                                            '&.Mui-focused fieldset': { borderColor: '#4f46e5' }
                                        }
                                    }}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label="Start Date"
                                    name="start_date"
                                    type="date"
                                    value={formData.start_date}
                                    onChange={handleFormChange}
                                    InputLabelProps={{ shrink: true }}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            '& fieldset': { borderColor: '#e2e8f0' },
                                            '&:hover fieldset': { borderColor: '#c7d2fe' },
                                            '&.Mui-focused fieldset': { borderColor: '#4f46e5' }
                                        }
                                    }}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    fullWidth
                                    label="End Date"
                                    name="end_date"
                                    type="date"
                                    value={formData.end_date}
                                    onChange={handleFormChange}
                                    InputLabelProps={{ shrink: true }}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            '& fieldset': { borderColor: '#e2e8f0' },
                                            '&:hover fieldset': { borderColor: '#c7d2fe' },
                                            '&.Mui-focused fieldset': { borderColor: '#4f46e5' }
                                        }
                                    }}
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
                                            sx={{
                                                '& .MuiSwitch-switchBase.Mui-checked': {
                                                    color: '#4f46e5'
                                                },
                                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                                    backgroundColor: '#4f46e5'
                                                }
                                            }}
                                        />
                                    }
                                    label="Active"
                                />
                            </Grid>
                        </FormRow>

                        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3, pt: 2, borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                            <OutlineButton onClick={() => setDialogOpen(false)}>
                                Cancel
                            </OutlineButton>
                            <PrimaryButton type="submit" variant="contained" disabled={loading}>
                                {loading ? <CircularProgress size={24} /> : (editingDiscount ? 'Update' : 'Create')}
                            </PrimaryButton>
                        </Box>
                    </DiscountForm>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialog.open}
                onClose={() => setDeleteDialog({ open: false, id: null, code: '' })}
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
                    Delete Discount
                </DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: '#475569' }}>
                        Are you sure you want to delete the discount code "{deleteDialog.code}"? This action cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <OutlineButton onClick={() => setDeleteDialog({ open: false, id: null, code: '' })}>
                        Cancel
                    </OutlineButton>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleDelete}
                        sx={{
                            background: '#ef4444',
                            '&:hover': {
                                background: '#dc2626',
                            }
                        }}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default Discounts;