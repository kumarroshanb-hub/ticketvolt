// frontend/src/pages/Bookings/components/BookingsStats.js
import React from 'react';
import { Grid, useMediaQuery, useTheme } from '@mui/material';
import {
    Event as EventIcon,
    Payment as PaymentIcon,
    QrCode as QrCodeIcon,
    Receipt as ReceiptIcon,
    Cancel as CancelIcon,
    AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import { StatCard } from './StatCard';
import { useTranslation } from 'react-i18next';
import { theme as appTheme } from '../../../theme/tokens';

const C = appTheme.colors;

export const BookingsStats = ({ stats }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const size = isMobile ? 20 : 24;

    const cards = [
        { title: t('booking.total'),     value: stats.total,     icon: <EventIcon   sx={{ color: C.primary,     fontSize: size }} />, color: C.primary },
        { title: t('status.booking.pending'),   value: stats.pending,   icon: <PaymentIcon sx={{ color: C.warning,     fontSize: size }} />, color: C.warning },
        { title: t('status.booking.confirmed'), value: stats.confirmed, icon: <QrCodeIcon  sx={{ color: C.success,     fontSize: size }} />, color: C.success },
        { title: t('status.booking.completed'), value: stats.completed, icon: <ReceiptIcon sx={{ color: C.successDark, fontSize: size }} />, color: C.successDark },
        { title: t('status.booking.cancelled'), value: stats.cancelled, icon: <CancelIcon  sx={{ color: C.error,       fontSize: size }} />, color: C.error },
        { title: t('status.booking.refunded'),  value: stats.refunded,  icon: <MoneyIcon   sx={{ color: C.secondary,   fontSize: size }} />, color: C.secondary },
    ];

    return (
        <Grid container spacing={isMobile ? 1.5 : 2} sx={{ mb: 3 }}>
            {cards.map((card) => (
                <Grid item xs={6} sm={6} md={2} key={card.title}>
                    <StatCard {...card} />
                </Grid>
            ))}
        </Grid>
    );
};