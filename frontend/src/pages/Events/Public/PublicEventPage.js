import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    Accordion, AccordionDetails, AccordionSummary, Alert, Avatar, Box,
    Button, Chip, CircularProgress, Divider, Grid, Paper, Stack, Typography,
} from '@mui/material';
import {
    AccessibilityNew, CalendarMonth, ConfirmationNumber, LocalParking,
    ExpandMore, InfoOutlined, LocationOn, Schedule, Share, Timer,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import eventService from '../../../services/eventService';
import Logo from '../../../components/Logo';
import { useAuth } from '../../../context/AuthContext';
import { useSettings } from '../../../context/SettingsContext';
import { theme } from '../../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

const formatEventDate = (value, locale) => {
    if (!value) return '';
    return new Date(value).toLocaleDateString(locale, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
};

const formatEventTime = (value, locale) => {
    if (!value) return '';
    return new Date(value).toLocaleTimeString(locale, {
        hour: '2-digit', minute: '2-digit',
    });
};

const SectionHeading = ({ children, action = null }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1.5 }}>
        <Typography variant="h5" sx={{ fontFamily: F.family, fontWeight: 800, letterSpacing: '-0.02em', color: C.textPrimary }}>
            {children}
        </Typography>
        {action}
    </Box>
);

const InfoCard = ({ icon, title, children }) => (
    <Paper variant="outlined" sx={{ p: 2, borderColor: C.borderLight, borderRadius: 3, height: '100%', bgcolor: C.bgCard }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
            <Box sx={{ width: 32, height: 32, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: C.bgPrimary, color: C.secondary }}>
                {icon}
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{title}</Typography>
        </Box>
        <Typography variant="body2" sx={{ color: C.textSecondary, whiteSpace: 'pre-line' }}>{children}</Typography>
    </Paper>
);

const PublicEventPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { isAuthenticated } = useAuth();
    const { formatMoney } = useSettings();
    const [event, setEvent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        eventService.getPublicEventDetails(id)
            .then((data) => {
                setEvent(data);
                document.title = `${data.title} · TicketVault`;
                const meta = document.querySelector("meta[name='description']") || document.createElement('meta');
                meta.name = 'description';
                meta.content = data.description || '';
                document.head.appendChild(meta);
            })
            .catch((err) => setError(err.response?.data?.detail || err.message))
            .finally(() => setLoading(false));
    }, [id, i18n.language]);

    const derived = useMemo(() => {
        if (!event) return {};
        const reserved = Boolean(event.venue?.has_reserved_seating);
        const seatCategories = event.seat_categories || [];
        const tierPrices = (event.tiers || [])
            .map((tier) => Number(tier.price) || 0)
            .filter((price) => price > 0);
        const seatPrices = seatCategories
            .map((category) => Number(category.price) || 0)
            .filter((price) => price > 0);
        const minPrice = tierPrices.length
            ? Math.min(...tierPrices)
            : (seatPrices.length ? Math.min(...seatPrices) : (Number(event.min_seat_price) > 0 ? Number(event.min_seat_price) : null));
        const soldOut = reserved
            ? event.available_seats === 0
            : ((event.tiers || []).length > 0 && event.tiers.every((tier) => (tier.available || 0) <= 0));
        const remaining = reserved
            ? (event.available_seats ?? 0)
            : (event.tiers || []).reduce((sum, tier) => sum + Math.max(0, tier.available || 0), 0);
        const both = Boolean(event.show_bilingual_content);
        const faqs = event.faqs || [];
        const goodToKnow = [
            event.age_info ? { icon: <InfoOutlined fontSize="small" />, title: t('events.ageInfo', 'Age information'), body: event.age_info } : null,
            event.parking_info ? { icon: <LocalParking fontSize="small" />, title: t('events.parkingInfo', 'Parking'), body: event.parking_info } : null,
            event.accessibility_info ? { icon: <AccessibilityNew fontSize="small" />, title: t('events.accessibilityInfo', 'Accessibility'), body: event.accessibility_info } : null,
        ].filter(Boolean);
        const description = both
            ? [event.description, event.description_zh].filter(Boolean)
            : [event.description].filter(Boolean);
        return {
            reserved, seatCategories, minPrice, soldOut, remaining, both, faqs, goodToKnow,
            description,
            refundPolicy: event.cancellation_policy,
            mapLink: event.venue?.map_url || event.map_url,
            startDate: formatEventDate(event.start_date, 'en-HK'),
            startTime: formatEventTime(event.start_date, 'en-HK'),
            endTime: formatEventTime(event.end_date, 'en-HK'),
        };
    }, [event, t]);

    if (loading) {
        return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: C.bgPrimary }}><CircularProgress sx={{ color: C.secondary }} /></Box>;
    }
    if (error || !event) {
        return (
            <Box sx={{ minHeight: '100vh', bgcolor: C.bgPrimary, p: 3 }}>
                <Alert severity="error" sx={{ maxWidth: 720, mx: 'auto' }}>{error || 'Event not found'}</Alert>
            </Box>
        );
    }

    const {
        reserved, seatCategories, minPrice, soldOut, remaining, both, faqs,
        goodToKnow, description, refundPolicy, mapLink, startDate, startTime, endTime,
    } = derived;

    const book = () => {
        if (isAuthenticated) navigate(`/app/bookings/create?event=${event.id}`);
        else navigate(`/gate?event=${event.id}`, { state: { eventTitle: event.title, eventId: event.id } });
    };

    const share = async () => {
        const url = window.location.href;
        try {
            if (navigator.share) await navigator.share({ title: event.title, url });
            else {
                await navigator.clipboard.writeText(url);
                toast.success(t('events.linkCopied', 'Link copied.'));
            }
        } catch {
            // user cancelled
        }
    };

    const priceLabel = minPrice !== null ? formatMoney(minPrice) : t('events.ticketsTitle', 'Tickets');

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: C.bgPrimary, fontFamily: F.family }}>
            <Box
                component="header"
                sx={{
                    position: 'sticky', top: 0, zIndex: 100,
                    bgcolor: 'rgba(255,255,255,0.94)',
                    borderBottom: `1px solid ${C.borderLight}`,
                    backdropFilter: 'blur(18px)',
                    WebkitBackdropFilter: 'blur(18px)',
                }}
            >
                <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, md: 3 }, minHeight: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                    <Link to="/" aria-label="TiketVault home" style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <Logo height={38} />
                    </Link>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Typography variant="caption" sx={{ color: C.textMuted, display: { xs: 'none', sm: 'block' } }}>
                            {t('events.publicPageLabel', 'Official event page')}
                        </Typography>
                        <Button size="small" variant="outlined" startIcon={<Share />} onClick={share} sx={{ borderRadius: 99 }}>
                            {t('events.share', 'Share')}
                        </Button>
                    </Stack>
                </Box>
            </Box>

            <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, md: 3 } }}>
                <Box
                    sx={{
                        position: 'relative', mt: 2.5, borderRadius: { xs: 3, md: 4 }, overflow: 'hidden',
                        minHeight: event.cover_image ? { xs: 220, sm: 330, md: 430 } : { xs: 150, sm: 190, md: 230 },
                        background: event.cover_image
                            ? `url(${event.cover_image}) center/cover no-repeat`
                            : `linear-gradient(135deg, ${C.primaryDark} 0%, ${C.primary} 52%, ${C.secondary} 100%)`,
                        boxShadow: '0 20px 50px rgba(51,51,51,0.14)',
                    }}
                >
                    <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(17,17,17,0.42), transparent 55%)' }} />
                    <Chip
                        label={t(`category.${event.category}`, { defaultValue: event.category || 'Event' })}
                        sx={{ position: 'absolute', top: 16, left: 16, bgcolor: 'rgba(255,255,255,0.94)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}
                    />
                </Box>

                <Grid container spacing={{ xs: 2, md: 4 }} sx={{ mt: 0.5, pb: { xs: 13, md: 8 } }}>
                    <Grid item xs={12} md={8}>
                        <Box sx={{ pt: { xs: 1, md: 2 } }}>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.2 }}>
                                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: C.secondary }} />
                                <Typography variant="caption" sx={{ fontWeight: 800, color: C.secondary, letterSpacing: '.09em', textTransform: 'uppercase' }}>
                                    {t('events.publicPageLabel', 'Official event page')}
                                </Typography>
                            </Stack>

                            <Typography
                                component="h1"
                                sx={{ fontSize: { xs: '2rem', sm: '2.7rem', md: '3.35rem' }, lineHeight: 1.04, letterSpacing: '-0.045em', fontWeight: 800, color: C.textPrimary }}
                            >
                                {event.title}
                            </Typography>
                            {both && event.title_zh && (
                                <Typography sx={{ mt: 1, fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: C.textSecondary }}>
                                    {event.title_zh}
                                </Typography>
                            )}

                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2.5 }}>
                                <Chip
                                    icon={<CalendarMonth />}
                                    label={`${startDate} · ${startTime}${endTime ? ` – ${endTime}` : ''}`}
                                    sx={{
                                        bgcolor: C.bgCard, border: `1px solid ${C.borderLight}`, fontWeight: 600, py: 2.1,
                                        width: { xs: '100%', sm: 'auto' }, justifyContent: 'flex-start',
                                        '& .MuiChip-label': { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'unset', lineHeight: 1.35 },
                                    }}
                                />
                                {event.venue?.name && (
                                    <Chip
                                        icon={<LocationOn />}
                                        label={event.venue.name}
                                        component={mapLink ? 'a' : 'div'}
                                        href={mapLink || undefined}
                                        target="_blank"
                                        clickable={Boolean(mapLink)}
                                        sx={{
                                            bgcolor: C.bgCard, border: `1px solid ${C.borderLight}`, fontWeight: 600, py: 2.1,
                                            width: { xs: '100%', sm: 'auto' }, justifyContent: 'flex-start',
                                            '& .MuiChip-label': { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'unset', lineHeight: 1.35 },
                                        }}
                                    />
                                )}
                            </Stack>

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 2.5, p: 1.5, border: `1px solid ${C.borderLight}`, borderRadius: 3, bgcolor: C.bgCard, width: 'fit-content', pr: 2.5 }}>
                                <Avatar sx={{ width: 40, height: 40, bgcolor: C.primary, fontWeight: 800 }}>
                                    {(event.organizer_name || 'T').charAt(0).toUpperCase()}
                                </Avatar>
                                <Box>
                                    <Typography variant="caption" sx={{ color: C.textMuted, display: 'block', lineHeight: 1.2 }}>
                                        {t('events.organizedBy', 'Organized by')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 800 }}>{event.organizer_name || t('common.organizer', 'Organizer')}</Typography>
                                </Box>
                            </Box>

                            <Box sx={{ mt: 4 }}>
                                <SectionHeading>{t('events.overview', 'Overview')}</SectionHeading>
                                {description.length > 0 ? description.map((paragraph, index) => (
                                    <Typography key={index} variant="body1" sx={{ color: C.textSecondary, whiteSpace: 'pre-line', mb: 1.5, lineHeight: 1.75, fontSize: { xs: '.95rem', md: '1rem' } }}>
                                        {paragraph}
                                    </Typography>
                                )) : (
                                    <Typography variant="body2" sx={{ color: C.textMuted }}>{t('events.detailNoDescription', 'Details coming soon.')}</Typography>
                                )}
                            </Box>

                            {goodToKnow.length > 0 && (
                                <Box sx={{ mt: 4 }}>
                                    <SectionHeading>{t('events.goodToKnow', 'Good to know')}</SectionHeading>
                                    <Grid container spacing={2}>
                                        {goodToKnow.map((item) => (
                                            <Grid item xs={12} sm={6} key={item.title}>
                                                <InfoCard icon={item.icon} title={item.title}>{item.body}</InfoCard>
                                            </Grid>
                                        ))}
                                    </Grid>
                                </Box>
                            )}

                            {(refundPolicy || event.cancellation_policy_text) && (
                                <Box sx={{ mt: 4 }}>
                                    <SectionHeading>{t('events.refundPolicyTitle', 'Refund policy')}</SectionHeading>
                                    <Paper variant="outlined" sx={{ p: 2.5, borderColor: C.borderLight, borderRadius: 3, bgcolor: C.bgCard }}>
                                        {refundPolicy?.name && (
                                            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>{refundPolicy.name}</Typography>
                                        )}
                                        <Typography variant="body2" sx={{ color: C.textSecondary, whiteSpace: 'pre-line', lineHeight: 1.7 }}>
                                            {[refundPolicy?.description, event.cancellation_policy_text].filter(Boolean).join('\n')}
                                        </Typography>
                                    </Paper>
                                </Box>
                            )}

                            <Box sx={{ mt: 4 }}>
                                <SectionHeading>{t('events.ticketsTitle', 'Tickets')}</SectionHeading>
                                {reserved ? (
                                    <Paper variant="outlined" sx={{ p: 2.5, borderColor: C.borderLight, borderRadius: 3, bgcolor: C.bgCard }}>
                                        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                                            <Box>
                                                <Typography variant="h6" sx={{ fontWeight: 800 }}>{t('events.reservedSeating', 'Reserved seating')}</Typography>
                                                <Typography variant="body2" sx={{ color: C.textSecondary }}>
                                                    {t('events.chooseSeatAtCheckout', 'Choose your exact seat at checkout.')}
                                                </Typography>
                                            </Box>
                                            <Box sx={{ textAlign: 'right' }}>
                                                <Typography variant="caption" sx={{ color: C.textMuted, display: 'block', fontWeight: 700 }}>{t('eventWizard.startingFrom', 'From')}</Typography>
                                                <Typography variant="h6" sx={{ fontWeight: 800 }}>{priceLabel}</Typography>
                                            </Box>
                                        </Box>
                                        <Divider sx={{ my: 2 }} />
                                        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                                            {seatCategories.length > 0 ? seatCategories.map((category) => (
                                                <Box key={category.id || category.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: category.hex_color }} />
                                                    <Typography variant="caption" sx={{ color: C.textSecondary }}>
                                                        {category.name} · <b>{formatMoney(category.price)}</b>
                                                    </Typography>
                                                </Box>
                                            )) : (
                                                <Typography variant="caption" sx={{ color: C.textMuted }}>{remaining} {t('events.seatsAvailable', 'seats available')}</Typography>
                                            )}
                                        </Stack>
                                    </Paper>
                                ) : (
                                    <Stack spacing={1.5}>
                                        {(event.tiers || []).filter((tier) => Number(tier.price) > 0).map((tier) => (
                                            <Paper key={tier.id} variant="outlined" sx={{ p: 2, borderColor: C.borderLight, borderRadius: 3, bgcolor: C.bgCard, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
                                                <Box>
                                                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{tier.name}</Typography>
                                                    <Typography variant="caption" sx={{ color: (tier.available || 0) > 0 ? C.success : C.error }}>
                                                        {(tier.available || 0) > 0 ? t('events.seatsLeft', { count: tier.available, defaultValue: '{{count}} left' }) : t('events.soldOut', 'Sold out')}
                                                    </Typography>
                                                </Box>
                                                <Typography variant="h6" sx={{ fontWeight: 800 }}>{formatMoney(tier.price)}</Typography>
                                            </Paper>
                                        ))}
                                        {(event.tiers || []).filter((tier) => Number(tier.price) > 0).length === 0 && (
                                            <Typography variant="body2" sx={{ color: C.textMuted }}>{t('events.ticketsUnavailable', 'Ticket details will be available soon.')}</Typography>
                                        )}
                                    </Stack>
                                )}
                            </Box>

                            {faqs.length > 0 && (
                                <Box sx={{ mt: 4 }}>
                                    <SectionHeading>{t('events.faqs', 'Frequently asked questions')}</SectionHeading>
                                    {faqs.map((faq, index) => (
                                        <Accordion key={index} disableGutters elevation={0} sx={{ bgcolor: 'transparent', borderBottom: `1px solid ${C.borderLight}`, '&:before': { display: 'none' } }}>
                                            <AccordionSummary expandIcon={<ExpandMore />} sx={{ px: 0 }}>
                                                <Typography sx={{ fontWeight: 700 }}>{faq.question || faq.q}</Typography>
                                            </AccordionSummary>
                                            <AccordionDetails sx={{ px: 0, pt: 0 }}>
                                                <Typography variant="body2" sx={{ color: C.textSecondary, whiteSpace: 'pre-line' }}>{faq.answer || faq.a}</Typography>
                                                {both && faq.question_zh && (
                                                    <Typography sx={{ fontWeight: 700, mt: 1.5 }}>{faq.question_zh}</Typography>
                                                )}
                                                {both && faq.answer_zh && (
                                                    <Typography variant="body2" sx={{ color: C.textSecondary, whiteSpace: 'pre-line' }}>{faq.answer_zh}</Typography>
                                                )}
                                            </AccordionDetails>
                                        </Accordion>
                                    ))}
                                </Box>
                            )}

                            {event.venue && (event.venue.address_line1 || event.venue.city) && (
                                <Box sx={{ mt: 4 }}>
                                    <SectionHeading>{t('events.location', 'Location')}</SectionHeading>
                                    <Paper variant="outlined" sx={{ p: 2.5, borderColor: C.borderLight, borderRadius: 3, bgcolor: C.bgCard }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{event.venue.name}</Typography>
                                        <Typography variant="body2" sx={{ color: C.textSecondary, mt: 0.5 }}>
                                            {[event.venue.address_line1, event.venue.city, event.venue.state, event.venue.country].filter(Boolean).join(', ')}
                                        </Typography>
                                        {mapLink && (
                                            <Button component="a" href={mapLink} target="_blank" rel="noopener noreferrer" size="small" startIcon={<LocationOn />} sx={{ mt: 1.5 }}>
                                                {t('events.showMap', 'Show map')}
                                            </Button>
                                        )}
                                    </Paper>
                                </Box>
                            )}
                        </Box>
                    </Grid>

                    <Grid item xs={12} md={4}>
                        <Box sx={{ position: { md: 'sticky' }, top: { md: 92 }, display: { xs: 'none', md: 'block' }, pt: 2 }}>
                            <Paper sx={{ p: 2.5, borderRadius: 3, border: `1px solid ${C.borderLight}`, boxShadow: '0 18px 45px rgba(51,51,51,0.10)', bgcolor: C.bgCard }}>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: C.textMuted, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                                    {minPrice !== null ? t('eventWizard.startingFrom', 'From') : t('events.ticketsTitle', 'Tickets')}
                                </Typography>
                                <Typography sx={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-.03em', color: C.textPrimary, mb: 1 }}>
                                    {minPrice !== null ? priceLabel : t('events.viewTickets', 'View tickets')}
                                </Typography>
                                <Stack spacing={0.5} sx={{ color: C.textSecondary, mb: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CalendarMonth sx={{ fontSize: 17 }} /><Typography variant="body2">{startDate}</Typography></Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Schedule sx={{ fontSize: 17 }} /><Typography variant="body2">{startTime}{endTime ? ` – ${endTime}` : ''}</Typography></Box>
                                </Stack>
                                <Button fullWidth variant="contained" color="secondary" size="large" startIcon={<ConfirmationNumber />} disabled={soldOut} onClick={book} sx={{ minHeight: 52 }}>
                                    {soldOut ? t('events.soldOut', 'Sold out') : t('events.getTicketsCta', 'Get tickets')}
                                </Button>
                                <Button fullWidth variant="text" startIcon={<Share />} onClick={share} sx={{ mt: 1 }}>
                                    {t('events.share', 'Share')}
                                </Button>
                                {!soldOut && remaining > 0 && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, mt: 1.5, color: remaining <= 10 ? C.error : C.success }}>
                                        <Timer sx={{ fontSize: 16 }} />
                                        <Typography variant="caption" sx={{ fontWeight: 700 }}>{remaining} {t('events.seatsAvailable', 'seats available')}</Typography>
                                    </Box>
                                )}
                            </Paper>
                        </Box>
                    </Grid>
                </Grid>
            </Box>

            <Box
                sx={{
                    display: { xs: 'flex', md: 'none' }, position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 110,
                    alignItems: 'center', justifyContent: 'space-between', gap: 1.5, px: 2, py: 1.25,
                    pb: 'calc(10px + env(safe-area-inset-bottom))',
                    bgcolor: 'rgba(255,255,255,0.97)', borderTop: `1px solid ${C.borderLight}`,
                    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                }}
            >
                <Box sx={{ minWidth: 0 }}>
                    {minPrice !== null && (
                        <Typography variant="caption" sx={{ color: C.textMuted, display: 'block', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                            {t('eventWizard.startingFrom', 'From')}
                        </Typography>
                    )}
                    <Typography variant="h6" sx={{ fontWeight: 800, color: C.textPrimary, lineHeight: 1.15 }}>
                        {minPrice !== null ? priceLabel : t('events.ticketsTitle', 'Tickets')}
                    </Typography>
                </Box>
                <Button variant="contained" color="secondary" size="large" startIcon={<ConfirmationNumber />} disabled={soldOut} onClick={book} sx={{ flex: '0 0 auto', minWidth: 145, minHeight: 48 }}>
                    {soldOut ? t('events.soldOut', 'Sold out') : t('events.getTicketsCta', 'Get tickets')}
                </Button>
            </Box>
        </Box>
    );
};

export default PublicEventPage;
