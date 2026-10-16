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
import { toast } from 'react-toastify';

import {
    PageContainer, PageHeader, PageTitle, PageHeaderLeft, PageHeaderRight,
    PrimaryButton, OutlineButton, LoadingWrapper,
} from '../../components/Common';

import Ticket from '../../components/Ticket/E-Ticket';
import { ROLES } from '../../constants';
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

const C = appTheme.colors;

const Bookings = () => {
    const navigate = useNavigate();
    const { role } = useRole();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const isRegularUser = role === ROLES.USER;
    const canManageAllBookings =
        role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN || role === ROLES.ORGANIZER;

    // ---- Data ----
    const { bookings, loading, error, loadBookings } = useBookings();
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

    const handleBulkApply = useCallback(() => {
        actions.promptBulkAction(selection.bulkAction, selection.selectedIds);
    }, [actions, selection.bulkAction, selection.selectedIds]);

    if (loading) {
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
                        {isRegularUser ? 'My Bookings' : 'Bookings'}
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
                            ? 'View and manage your bookings'
                            : 'Manage all customer bookings'}
                    </Typography>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton variant="outlined" startIcon={<RefreshIcon />} onClick={loadBookings}>
                        Refresh
                    </OutlineButton>
                    <PrimaryButton
                        variant="contained"
                        startIcon={<ShoppingCartIcon />}
                        onClick={handleBookTickets}
                    >
                        Book Tickets
                    </PrimaryButton>
                </PageHeaderRight>
            </PageHeader>

            <BookingsStats stats={stats} />

            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                    <Button size="small" onClick={loadBookings} sx={{ ml: 2 }}>
                        Retry
                    </Button>
                </Alert>
            )}

            {isRegularUser && bookings.length === 0 && !error && (
                <Alert severity="info" sx={{ mb: 3 }}>
                    You don't have any bookings yet. Click "Book Tickets" to browse events and book
                    your first ticket!
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
                                onDownload={() => toast.success('Ticket downloaded!')}
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