// frontend/src/pages/Bookings/Bookings.js
import React, { useCallback, useState } from 'react';
import {
    Box, Typography, Dialog, DialogContent,
    CircularProgress, Alert, Button,
    useMediaQuery, useTheme,
} from '@mui/material';
import {
    Refresh as RefreshIcon,
    ShoppingCart as ShoppingCartIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import api from '../../services/api';

import {
    PageContainer, PageHeader, PageTitle, PageHeaderLeft, PageHeaderRight,
    PrimaryButton, OutlineButton, LoadingWrapper,
} from '../../components/Common';

import Ticket from '../../components/Ticket/E-Ticket';
import { MEMBERSHIP_ROLES } from '../../constants';
import { useRole } from '../../context/RoleContext';
import { theme as appTheme } from '../../theme/tokens';

import { useBookings } from '../../features/bookings/useBookings';
import { useBookingStats } from '../../features/bookings/useBookingStats';
import { useBookingSelection } from '../../features/bookings/useBookingSelection';
import { useBookingActions } from '../../features/bookings/useBookingActions';
import { useBookingTickets } from '../../features/bookings/useBookingTickets';

import { BookingsStats } from './components/BookingsStats';
import { BookingsBulkBar } from './components/BookingsBulkBar';
import { BookingsMobileList } from './components/BookingsMobileList';
import { BookingsTable } from './components/BookingsTable';
import { ConfirmActionDialog } from './components/ConfirmActionDialog';
import { BookingDetailsDialog } from './components/BookingDetailsDialog';

// ✅ Platform Filter Imports
import usePlatformFilter from '../../hooks/usePlatformFilter';
import { OrgFilterSelect } from '../../components/Common';

const C = appTheme.colors;

const Bookings = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { hasOrgRole } = useRole();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // "Regular user" = no owner/admin rights in the current org.
    // They see only their own bookings (the backend already scopes this).
    //
    // NOTE: This must be ADMIN (owner/admin), not STAFF. The backend's
    // BookingViewSet.get_permissions routes mutating actions through
    // IsBookingManager (owner/admin only), so STAFF would receive 403s for
    // "Mark Paid" / "Refund" etc. Using ADMIN keeps the UI in sync with the
    // backend and makes isRegularUser true for STAFF-only users (correct:
    // they get the "my bookings" view, not the admin view).
    const canManageAllBookings = hasOrgRole(MEMBERSHIP_ROLES.ADMIN);
    const isRegularUser = !canManageAllBookings;

    // ✅ 1. Initialize Platform Filter Hook
    const { 
        params: orgParams, 
        isPlatformAdmin, 
        orgFilter, 
        setOrgFilter, 
        organizations 
    } = usePlatformFilter();

    // ✅ 2. Pass orgParams to the data hook
    const { bookings, loading, error, loadBookings } = useBookings(orgParams);
    const stats = useBookingStats(bookings);

    // ---- Selection ----
    const selection = useBookingSelection(bookings);

    // ---- Actions ----
    const actions = useBookingActions({ onSuccess: loadBookings });

    // ---- Tickets ----
    const tickets = useBookingTickets();

    // ---- Details dialog ----
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState(null);

    const openDetails = useCallback((booking) => {
        setSelectedBooking(booking);
        setDetailsOpen(true);
    }, []);

    const closeDetails = useCallback(() => setDetailsOpen(false), []);

    const handleViewTickets = useCallback(
        (bookingId) => navigate(`/app/bookings/${bookingId}/tickets`),
        [navigate]
    );

    const handleBookTickets = useCallback(() => navigate('/app/bookings/create'), [navigate]);

    const handleMarkPatronContacted = useCallback(async (booking) => {
        try {
            await api.post(`/bookings/${booking.id}/patron-contact/`, {});
            toast.success(t('booking.patronContacted', 'Patron contact recorded.'));
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    }, [t]);

    const handleDownloadTaxReceipt = useCallback(async (booking) => {
        try {
            const res = await api.get(
                `/bookings/${booking.id}/donation-tax-receipt/`,
                { responseType: 'blob' },
            );
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `donation-receipt-${booking.booking_reference}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(
                err.response?.data?.error
                || err.message
                || t('booking.taxReceiptFailed'),
            );
        }
    }, [t]);

    const handleBulkApply = useCallback(() => {
        actions.promptBulkAction(selection.bulkAction, selection.selectedIds);
    }, [actions, selection.bulkAction, selection.selectedIds]);

    if (loading && bookings.length === 0) {
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
                    <PageTitle variant="h4">
                        {isRegularUser ? t('booking.myBookings') : t('booking.bookings')}
                    </PageTitle>
                    <Typography
                        variant="body2"
                        sx={{
                            color: C.textSecondary,
                            ml: isMobile ? 0 : 2,
                            display: 'block',
                            width: isMobile ? '100%' : 'auto',
                        }}
                    >
                        {isRegularUser
                            ? t('booking.viewManageMyBookings')
                            : isPlatformAdmin
                                ? t('bookings.manageAllPlatformBookings')
                                : t('booking.manageAllBookings')}
                    </Typography>
                </PageHeaderLeft>
                <PageHeaderRight>
                    {/* ✅ 3. Render the Organization Filter Dropdown */}
                    <OrgFilterSelect
                        isPlatformAdmin={isPlatformAdmin}
                        organizations={organizations}
                        orgFilter={orgFilter}
                        setOrgFilter={setOrgFilter}
                        onPageReset={loadBookings}
                    />
                    
                    <OutlineButton variant="outlined" startIcon={<RefreshIcon />} onClick={loadBookings}>
                        {t('common.refresh')}
                    </OutlineButton>
                    {!isRegularUser && (
                        <PrimaryButton
                            variant="contained"
                            startIcon={<ShoppingCartIcon />}
                            onClick={handleBookTickets}
                        >
                            {t('booking.bookTickets')}
                        </PrimaryButton>
                    )}
                </PageHeaderRight>
            </PageHeader>

            <BookingsStats stats={stats} />

            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                    <Button size="small" onClick={loadBookings} sx={{ ml: 2 }}>
                        {t('common.retry')}
                    </Button>
                </Alert>
            )}

            {isRegularUser && bookings.length === 0 && !error && (
                <Alert severity="info" sx={{ mb: 3 }}>
                    {t('booking.noBookingsCta')}
                </Alert>
            )}

            {canManageAllBookings && selection.selectedIds.length > 0 && (
                <BookingsBulkBar
                    selectedCount={selection.selectedIds.length}
                    bulkAction={selection.bulkAction}
                    onBulkActionChange={selection.setBulkAction}
                    onApply={handleBulkApply}
                    onClear={selection.clearSelection}
                    loading={actions.actionLoading}
                />
            )}

            {isMobile ? (
                <BookingsMobileList
                    bookings={bookings}
                    canManageAllBookings={canManageAllBookings}
                    isRegularUser={isRegularUser}
                    selectedIds={selection.selectedIds}
                    onSelectOne={selection.handleSelectOne}
                    onOpenDetails={openDetails}
                    actionLoading={actions.actionLoading}
                    handlers={{
                        onViewETicket: tickets.handleViewETicket,
                        onSendEmail: tickets.handleSendEmail,
                        onPromptAction: actions.promptAction,
                    }}
                />
            ) : (
                <BookingsTable
                    bookings={bookings}
                    canManageAllBookings={canManageAllBookings}
                    isRegularUser={isRegularUser}
                    selectedIds={selection.selectedIds}
                    onSelectAll={selection.handleSelectAll}
                    onSelectOne={selection.handleSelectOne}
                    onOpenDetails={openDetails}
                    onViewTickets={handleViewTickets}
                    onViewETicket={tickets.handleViewETicket}
                    onSendEmail={tickets.handleSendEmail}
                    onPromptAction={actions.promptAction}
                    actionLoading={actions.actionLoading}
                />
            )}

            <ConfirmActionDialog
                dialog={actions.confirmDialog}
                onConfirm={actions.executeAction}
                onClose={actions.closeDialog}
                loading={actions.actionLoading}
            />

            <BookingDetailsDialog
                open={detailsOpen}
                booking={selectedBooking}
                canManageAllBookings={canManageAllBookings}
                onClose={closeDetails}
                onViewETicket={(b) => {
                    closeDetails();
                    tickets.handleViewETicket(b);
                }}
                onViewAllTickets={(id) => {
                    closeDetails();
                    handleViewTickets(id);
                }}
                onDownloadTaxReceipt={handleDownloadTaxReceipt}
                onMarkPatronContacted={handleMarkPatronContacted}
            />

            <Dialog
                open={tickets.eticketOpen}
                onClose={tickets.closeETicket}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { background: 'transparent', boxShadow: 'none' } }}
            >
                <DialogContent sx={{ p: 0 }}>
                    {tickets.eticketData.tickets?.length > 0 &&
                        tickets.eticketData.booking &&
                        tickets.eticketData.event && (
                            <Ticket
                                tickets={tickets.eticketData.tickets}
                                booking={tickets.eticketData.booking}
                                event={tickets.eticketData.event}
                                showActions
                                showNavigation
                                onDownload={() => toast.success(t('ticket.downloadedToast'))}
                                onPrint={() => window.print()}
                                onEmail={() =>
                                    tickets.handleSendEmail(tickets.eticketData.booking)
                                }
                            />
                        )}
                </DialogContent>
            </Dialog>
        </PageContainer>
    );
};

export default Bookings;