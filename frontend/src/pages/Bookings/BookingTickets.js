// frontend/src/pages/Bookings/BookingTickets.js
import React, { useState, useEffect } from 'react';
import {
    Box, Button, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Typography, Chip, IconButton,
    CircularProgress, Card, CardContent, Grid,
    Alert, Tooltip, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField, InputAdornment,
    useMediaQuery, useTheme, Divider, Paper,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    Refresh as RefreshIcon,
    QrCode as QrCodeIcon,
    CheckCircle as CheckCircleIcon,
    Print as PrintIcon,
    Download as DownloadIcon,
    Search as SearchIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageSubtitle,
    PageHeaderLeft,
    PageHeaderRight,
    StyledCard,
    StyledTableContainer,
    StatusChip,
    LoadingWrapper,
    OutlineButton,
    PrimaryButton,
    StatsGrid,
} from '../../components/Common';

// Try to import QRCodeSVG, fallback if not available
let QRCodeSVG;
try {
    const qrModule = require('qrcode.react');
    QRCodeSVG = qrModule.QRCodeSVG;
} catch (e) {
    console.warn('qrcode.react not installed, using fallback');
    QRCodeSVG = null;
}

const BackButton = styled(IconButton)`
    color: ${props => props.theme.colors.textSecondary};

    &:hover {
        color: ${props => props.theme.colors.textPrimary};
        background: ${props => props.theme.colors.bgCardHover};
    }
`;

const SearchField = styled(TextField)`
    margin-bottom: 16px;

    & .MuiOutlinedInput-root {
        background: ${props => props.theme.colors.bgInput};
        border-radius: 10px;

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

    & .MuiInputBase-input {
        color: ${props => props.theme.colors.textPrimary};
    }
`;

const StatValue = styled(Typography)`
    color: ${props => props.color || props.theme.colors.textPrimary};
    font-weight: 700;
    font-size: 24px;
`;

const StatLabel = styled(Typography)`
    color: ${props => props.theme.colors.textMuted};
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

const FooterSummary = styled(Box)`
    margin-top: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 0;
    border-top: 1px solid ${props => props.theme.colors.borderLight};
`;

const BookingTickets = () => {
    const { bookingId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState(null);
    const [tickets, setTickets] = useState([]);
    const [filteredTickets, setFilteredTickets] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [qrDialogOpen, setQrDialogOpen] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        used: 0,
        cancelled: 0
    });

    const loadBookingTickets = async () => {
        setLoading(true);
        try {
            const bookingResponse = await api.get(`/bookings/${bookingId}/`);
            setBooking(bookingResponse.data);

            const ticketsResponse = await api.get(`/bookings/${bookingId}/tickets/`);
            const ticketList = ticketsResponse.data.tickets || [];
            setTickets(ticketList);
            setFilteredTickets(ticketList);

            const stats = {
                total: ticketList.length,
                active: ticketList.filter(t => t.status === 'active').length,
                used: ticketList.filter(t => t.status === 'used').length,
                cancelled: ticketList.filter(t => t.status === 'cancelled' || t.status === 'refunded').length
            };
            setStats(stats);

        } catch (error) {
            console.error('Error loading tickets:', error);
            toast.error('Failed to load tickets');
        }
        setLoading(false);
    };

    useEffect(() => {
        loadBookingTickets();
    }, [bookingId]);

    useEffect(() => {
        if (searchTerm.trim() === '') {
            setFilteredTickets(tickets);
        } else {
            const filtered = tickets.filter(ticket =>
                ticket.unique_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                ticket.attendee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                ticket.status?.toLowerCase().includes(searchTerm.toLowerCase())
            );
            setFilteredTickets(filtered);
        }
    }, [searchTerm, tickets]);

    const getStatusChip = (status) => {
        const config = {
            active: { color: 'success', label: 'ACTIVE' },
            used: { color: 'error', label: 'USED' },
            cancelled: { color: 'default', label: 'CANCELLED' },
            expired: { color: 'warning', label: 'EXPIRED' },
            refunded: { color: 'secondary', label: 'REFUNDED' }
        };
        const { color, label } = config[status] || { color: 'default', label: status || 'UNKNOWN' };
        return <StatusChip label={label} size="small" color={color} />;
    };

    const handleBack = () => {
        navigate('/bookings');
    };

    const handlePrint = () => {
        window.print();
    };

    const handleExport = () => {
        try {
            const headers = ['Ticket Code', 'Attendee Name', 'Status', 'Check-in Time', 'Tier', 'Price'];
            const rows = filteredTickets.map(t => [
                t.unique_code || '',
                t.attendee_name || 'Guest',
                t.status || '',
                t.check_in_time ? new Date(t.check_in_time).toLocaleString() : '-',
                t.tier_name || 'N/A',
                `₹${t.price || '0'}`
            ]);

            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tickets_${booking?.booking_reference || 'booking'}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast.success('Tickets exported successfully');
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Failed to export tickets');
        }
    };

    const handleViewQr = (ticket) => {
        setSelectedTicket(ticket);
        setQrDialogOpen(true);
    };

    const renderQrCode = (qrData) => {
        if (!qrData) {
            return (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                    <QrCodeIcon sx={{ fontSize: 60, color: '#94a3b8' }} />
                    <Typography sx={{ color: '#94a3b8' }}>QR Code not available</Typography>
                </Box>
            );
        }

        if (qrData.startsWith('data:image')) {
            return (
                <img
                    src={qrData}
                    alt="QR Code"
                    style={{
                        maxWidth: '100%',
                        maxHeight: 300,
                        objectFit: 'contain',
                        borderRadius: '8px'
                    }}
                    onError={(e) => {
                        console.error('QR image failed to load');
                        e.target.style.display = 'none';
                    }}
                />
            );
        }

        if (qrData.startsWith('http://') || qrData.startsWith('https://')) {
            return (
                <img
                    src={qrData}
                    alt="QR Code"
                    style={{
                        maxWidth: '100%',
                        maxHeight: 300,
                        objectFit: 'contain',
                        borderRadius: '8px'
                    }}
                    onError={(e) => {
                        e.target.style.display = 'none';
                    }}
                />
            );
        }

        if (typeof qrData === 'string' && qrData.match(/^[A-Za-z0-9+/=]+$/)) {
            return (
                <img
                    src={`data:image/png;base64,${qrData}`}
                    alt="QR Code"
                    style={{
                        maxWidth: '100%',
                        maxHeight: 300,
                        objectFit: 'contain',
                        borderRadius: '8px'
                    }}
                />
            );
        }

        if (QRCodeSVG && typeof qrData === 'string') {
            try {
                return (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                        <QRCodeSVG
                            value={qrData}
                            size={200}
                            level="H"
                            includeMargin={true}
                            bgColor="#ffffff"
                            fgColor="#1a1a1a"
                        />
                        <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mt: 2 }}>
                            QR Code generated from ticket data
                        </Typography>
                    </Box>
                );
            } catch (error) {
                console.error('QR generation error:', error);
            }
        }

        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <QrCodeIcon sx={{ fontSize: 60, color: '#94a3b8' }} />
                <Typography sx={{ color: '#94a3b8', mt: 2 }}>
                    QR Code data available
                </Typography>
                <Typography variant="caption" sx={{ color: '#cbd5e1', display: 'block', mt: 1, wordBreak: 'break-all' }}>
                    {typeof qrData === 'string' && qrData.length > 50 ? qrData.substring(0, 50) + '...' : qrData}
                </Typography>
            </Box>
        );
    };

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: '#4f46e5' }} />
            </LoadingWrapper>
        );
    }

    if (!booking) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error" sx={{ mb: 2 }}>Booking not found</Alert>
                <Button startIcon={<ArrowBackIcon />} onClick={handleBack}>
                    Back to Bookings
                </Button>
            </Box>
        );
    }

    return (
        <PageContainer>
            {/* Header */}
            <PageHeader>
                <PageHeaderLeft>
                    <BackButton onClick={handleBack}>
                        <ArrowBackIcon />
                    </BackButton>
                    <Box>
                        <PageTitle>Booking Tickets</PageTitle>
                        <PageSubtitle>
                            {booking.booking_reference} - {booking.customer_name}
                        </PageSubtitle>
                    </Box>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton variant="outlined" startIcon={<RefreshIcon />} onClick={loadBookingTickets} size="small">
                        Refresh
                    </OutlineButton>
                    <OutlineButton variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint} size="small">
                        Print
                    </OutlineButton>
                    <OutlineButton variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport} size="small">
                        Export CSV
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            {/* Booking Summary Cards */}
            <Grid container spacing={isMobile ? 2 : 3} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6} md={4}>
                    <StyledCard>
                        <CardContent>
                            <Typography sx={{ color: '#64748b' }} gutterBottom variant="caption">
                                Customer
                            </Typography>
                            <Typography variant="h6" sx={{ color: '#0f172a', wordBreak: 'break-word' }}>
                                {booking.customer_name}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#334155', wordBreak: 'break-word' }}>
                                {booking.customer_email}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#334155' }}>
                                {booking.customer_phone}
                            </Typography>
                        </CardContent>
                    </StyledCard>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                    <StyledCard>
                        <CardContent>
                            <Typography sx={{ color: '#64748b' }} gutterBottom variant="caption">
                                Event
                            </Typography>
                            <Typography variant="h6" sx={{ color: '#0f172a', wordBreak: 'break-word' }}>
                                {booking.event_title || booking.event?.title || 'N/A'}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#334155' }}>
                                Amount: ₹{booking.total_amount}
                            </Typography>
                            <Box sx={{ mt: 1 }}>
                                <StatusChip
                                    label={booking.status?.toUpperCase()}
                                    size="small"
                                    color={booking.status === 'paid' || booking.status === 'confirmed' ? 'success' : 'warning'}
                                />
                            </Box>
                        </CardContent>
                    </StyledCard>
                </Grid>
                <Grid item xs={12} sm={12} md={4}>
                    <StyledCard>
                        <CardContent>
                            <Typography sx={{ color: '#64748b' }} gutterBottom variant="caption">
                                Ticket Statistics
                            </Typography>
                            <Grid container spacing={1}>
                                <Grid item xs={3}>
                                    <StatValue color="#4f46e5">{stats.total}</StatValue>
                                    <StatLabel>Total</StatLabel>
                                </Grid>
                                <Grid item xs={3}>
                                    <StatValue color="#10b981">{stats.active}</StatValue>
                                    <StatLabel>Active</StatLabel>
                                </Grid>
                                <Grid item xs={3}>
                                    <StatValue color="#ef4444">{stats.used}</StatValue>
                                    <StatLabel>Used</StatLabel>
                                </Grid>
                                <Grid item xs={3}>
                                    <StatValue color="#94a3b8">{stats.cancelled}</StatValue>
                                    <StatLabel>Cancelled</StatLabel>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </StyledCard>
                </Grid>
            </Grid>

            {/* Search Bar */}
            <SearchField
                placeholder={isMobile ? 'Search tickets...' : 'Search by ticket code, attendee name, or status...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                size="small"
                fullWidth
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon sx={{ color: '#94a3b8' }} />
                        </InputAdornment>
                    ),
                }}
            />

            {/* ==================== MOBILE: CARD LIST ==================== */}
            {isMobile ? (
                filteredTickets.length === 0 ? (
                    <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                        <Typography sx={{ color: '#94a3b8' }}>
                            {tickets.length === 0 ? 'No tickets found for this booking' : 'No matching tickets found'}
                        </Typography>
                    </Paper>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {filteredTickets.map((ticket, index) => (
                            <Card
                                key={ticket.id || index}
                                sx={{
                                    borderRadius: 2,
                                    border: '1px solid #e2e8f0',
                                    overflow: 'hidden',
                                }}
                            >
                                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, gap: 1 }}>
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography
                                                variant="subtitle2"
                                                sx={{
                                                    fontFamily: 'monospace',
                                                    fontWeight: 700,
                                                    color: '#0f172a',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {ticket.unique_code}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                                #{index + 1}
                                            </Typography>
                                        </Box>
                                        {getStatusChip(ticket.status)}
                                    </Box>

                                    <Divider sx={{ my: 1.5 }} />

                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                                            Attendee
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#334155', fontWeight: 500 }}>
                                            {ticket.attendee_name || 'Guest'}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                                            Tier
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#334155' }}>
                                            {ticket.tier_name || 'N/A'}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                                            Price
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#334155', fontWeight: 600 }}>
                                            ₹{ticket.price || '0'}
                                        </Typography>
                                    </Box>
                                    {ticket.check_in_time && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                                                Checked In
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 600 }}>
                                                {new Date(ticket.check_in_time).toLocaleString()}
                                            </Typography>
                                        </Box>
                                    )}

                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        startIcon={<QrCodeIcon />}
                                        onClick={() => handleViewQr(ticket)}
                                        sx={{
                                            mt: 1.5,
                                            borderColor: '#c7d2fe',
                                            color: '#4f46e5',
                                            textTransform: 'none',
                                        }}
                                    >
                                        View QR Code
                                    </Button>
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
                                    <TableCell sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>#</TableCell>
                                    <TableCell sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Ticket Code</TableCell>
                                    <TableCell sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Attendee Name</TableCell>
                                    <TableCell align="center" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Status</TableCell>
                                    <TableCell sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Tier</TableCell>
                                    <TableCell align="right" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Price</TableCell>
                                    <TableCell align="center" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Check-in Time</TableCell>
                                    <TableCell align="center" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredTickets.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                                            <Typography sx={{ color: '#94a3b8' }}>
                                                {tickets.length === 0 ? 'No tickets found for this booking' : 'No matching tickets found'}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredTickets.map((ticket, index) => (
                                        <TableRow
                                            key={ticket.id || index}
                                            hover
                                            sx={{ '&:hover': { backgroundColor: '#f8fafc' } }}
                                        >
                                            <TableCell sx={{ color: '#64748b' }}>{index + 1}</TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="bold" sx={{ color: '#0f172a' }}>
                                                    {ticket.unique_code}
                                                </Typography>
                                            </TableCell>
                                            <TableCell sx={{ color: '#334155' }}>{ticket.attendee_name || 'Guest'}</TableCell>
                                            <TableCell align="center">{getStatusChip(ticket.status)}</TableCell>
                                            <TableCell sx={{ color: '#334155' }}>{ticket.tier_name || 'N/A'}</TableCell>
                                            <TableCell align="right" sx={{ color: '#334155' }}>₹{ticket.price || '0'}</TableCell>
                                            <TableCell align="center">
                                                {ticket.check_in_time ? (
                                                    <Tooltip title={new Date(ticket.check_in_time).toLocaleString()}>
                                                        <StatusChip
                                                            label={new Date(ticket.check_in_time).toLocaleDateString()}
                                                            size="small"
                                                            color="success"
                                                            variant="outlined"
                                                            icon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                                                        />
                                                    </Tooltip>
                                                ) : (
                                                    <StatusChip
                                                        label="Not checked in"
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{ borderColor: '#e2e8f0', color: '#94a3b8' }}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell align="center">
                                                <Tooltip title="View QR Code">
                                                    <IconButton
                                                        size="small"
                                                        sx={{ color: '#4f46e5' }}
                                                        onClick={() => handleViewQr(ticket)}
                                                    >
                                                        <QrCodeIcon />
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

            {/* Footer Summary */}
            {filteredTickets.length > 0 && (
                <FooterSummary>
                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                        Showing {filteredTickets.length} of {tickets.length} tickets
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                        Total: {stats.total} | Active: {stats.active} | Used: {stats.used} | Cancelled: {stats.cancelled}
                    </Typography>
                </FooterSummary>
            )}

            {/* QR Code Dialog */}
            <Dialog
                open={qrDialogOpen}
                onClose={() => setQrDialogOpen(false)}
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
                <DialogTitle>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 600 }}>QR Code</Typography>
                        {selectedTicket && getStatusChip(selectedTicket.status)}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {selectedTicket && (
                        <Box sx={{ textAlign: 'center', py: 2 }}>
                            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                Ticket Code
                            </Typography>
                            <Typography variant="h5" gutterBottom sx={{ color: '#0f172a', fontWeight: 700, wordBreak: 'break-all' }}>
                                {selectedTicket.unique_code}
                            </Typography>

                            <Box sx={{
                                my: 3,
                                p: 3,
                                bgcolor: '#f8fafc',
                                borderRadius: 2,
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                minHeight: 250,
                                border: '1px solid #e2e8f0'
                            }}>
                                {selectedTicket.qr_code ? (
                                    renderQrCode(selectedTicket.qr_code)
                                ) : (
                                    <Box sx={{ textAlign: 'center', py: 4 }}>
                                        <QrCodeIcon sx={{ fontSize: 60, color: '#94a3b8' }} />
                                        <Typography sx={{ color: '#94a3b8' }}>
                                            QR Code not available
                                        </Typography>
                                    </Box>
                                )}
                            </Box>

                            <Grid container spacing={2} sx={{ mt: 1 }}>
                                <Grid item xs={6}>
                                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                        Attendee
                                    </Typography>
                                    <Typography variant="body2" fontWeight="bold" sx={{ color: '#0f172a' }}>
                                        {selectedTicket.attendee_name || 'Guest'}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                        Status
                                    </Typography>
                                    <Typography variant="body2" fontWeight="bold" sx={{ color: '#0f172a' }}>
                                        {selectedTicket.status?.toUpperCase()}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                        Tier
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#334155' }}>
                                        {selectedTicket.tier_name || 'N/A'}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                        Price
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#334155' }}>
                                        ₹{selectedTicket.price || '0'}
                                    </Typography>
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <OutlineButton onClick={() => setQrDialogOpen(false)}>
                        Close
                    </OutlineButton>
                    {selectedTicket?.qr_code && (
                        <PrimaryButton
                            onClick={() => {
                                const qrData = selectedTicket.qr_code;
                                if (qrData.startsWith('data:image')) {
                                    const link = document.createElement('a');
                                    link.href = qrData;
                                    link.download = `qr_${selectedTicket.unique_code}.png`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    toast.success('QR code downloaded');
                                } else if (qrData.startsWith('http')) {
                                    window.open(qrData, '_blank');
                                } else {
                                    toast.info('QR code is embedded and cannot be downloaded directly');
                                }
                            }}
                        >
                            Download QR
                        </PrimaryButton>
                    )}
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default BookingTickets;