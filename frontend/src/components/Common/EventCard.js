// frontend/src/components/Common/EventCard.js
import React, { useState, useEffect } from 'react';
import {
    Card, CardContent, CardActions, Button, Box, Typography,
    Collapse, CircularProgress,
} from '@mui/material';
import {
    LocationOn, CalendarMonth, ShoppingCart,
    CheckCircle as CheckCircleIcon,
    HowToReg as HowToRegIcon,
    Visibility as VisibilityIcon,
    KeyboardArrowDown as ArrowDownIcon, KeyboardArrowUp as ArrowUpIcon,
} from '@mui/icons-material';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import eventService from '../../services/eventService';
import { theme as appTheme } from '../../theme/tokens';

const C = appTheme.colors;
const F = appTheme.fonts;

const StyledCard = styled(Card)`
    && {
        background: ${C.bgCard};
        border: 1px solid ${C.borderLight};
        border-radius: 20px;
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;

        &:hover {
            transform: translateY(-6px);
            border-color: ${C.primary};
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.1), 0 4px 12px rgba(0, 0, 0, 0.06);
        }
    }
`;

const CardImageBanner = styled.div`
    width: 100%;
    height: 100%;
    position: relative;
    background-color: ${C.bgInput};

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    &::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 40px;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.1), transparent);
        pointer-events: none;
    }
`;

const TopAccent = styled.div`
    height: 4px;
    background: ${(p) =>
        p.$isSoldOut
            ? `linear-gradient(90deg, ${C.warning} 0%, ${C.warningLight} 100%)`
            : `linear-gradient(90deg, ${C.primary} 0%, ${C.secondary} 100%)`};
`;

const CardBody = styled(CardContent)`
    && {
        flex: 1;
        padding: 22px 22px 16px 22px;
        display: flex;
        flex-direction: column;
    }
`;

const TitleRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 14px;
`;

const EventTitle = styled(Typography)`
    && {
        color: ${C.textPrimary};
        font-weight: 700;
        font-size: 18px;
        line-height: 1.3;
        font-family: ${F.family};
        min-width: 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
`;

const CategoryTag = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 999px;
    background: ${C.bgInput};
    color: ${C.textSecondary};
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    font-family: ${F.family};
    white-space: nowrap;
    flex-shrink: 0;
`;

const FlowTag = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    font-family: ${F.family};
    background: ${(p) =>
        p.$flow === 'free_registration'
            ? `${C.success}1A`
            : p.$flow === 'paid_registration'
                ? `${C.info}1A`
                : C.bgInput};
    color: ${(p) =>
        p.$flow === 'free_registration'
            ? C.successDark
            : p.$flow === 'paid_registration'
                ? C.infoDark
                : C.textSecondary};
`;

const InfoRow = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 10px;
    color: ${C.textSecondary};
    font-size: 13px;
    font-family: ${F.family};
    margin-bottom: 10px;

    svg {
        font-size: 16px;
        color: ${C.textMuted};
        flex-shrink: 0;
        margin-top: 2px;
    }

    .text {
        min-width: 0;
        line-height: 1.4;
    }
`;

const SessionList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 2px;

    .session-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
        color: ${C.textPrimary};
    }

    .session-more {
        font-size: 11px;
        color: ${C.primary};
        font-weight: 600;
    }
`;

const PriceRow = styled.div`
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding-top: 14px;
    margin-top: auto;
    border-top: 1px dashed ${C.borderLight};

    .from-label {
        font-size: 11px;
        color: ${C.textMuted};
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 600;
        font-family: ${F.family};
    }

    .price {
        font-size: 20px;
        font-weight: 800;
        color: ${C.textPrimary};
        font-family: ${F.family};
        display: flex;
        align-items: center;
        gap: 8px;

        .currency {
            font-size: 14px;
            font-weight: 600;
            color: ${C.textSecondary};
            margin-right: 2px;
        }

        .free-label {
            color: ${C.success};
        }
    }

    .slots {
        font-size: 12px;
        color: ${(p) => (p.$low ? C.error : C.success)};
        font-weight: 600;
        font-family: ${F.family};
    }
`;

const TiersToggle = styled.button`
    background: none;
    border: none;
    color: ${C.primary};
    font-size: 12px;
    font-weight: 600;
    font-family: ${F.family};
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    padding: 0;
    margin-top: 10px;

    &:hover {
        text-decoration: underline;
    }
`;

const TierItem = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid ${C.bgInput};
    font-size: 13px;
    font-family: ${F.family};

    &:last-child { border-bottom: none; }

    .name { color: ${C.textPrimary}; font-weight: 500; }
    .price { color: ${C.textSecondary}; font-weight: 600; }
    .sold-out { color: ${C.error}; font-size: 11px; text-transform: uppercase; }
`;

const StyledActions = styled(CardActions)`
    && {
        padding: 0 22px 22px 22px;
    }
`;

const BookButton = styled(Button)`
    && {
        width: 100%;
        min-height: 46px;
        border-radius: 12px;
        background: ${C.primaryGradient};
        color: ${C.textInverse};
        text-transform: none;
        font-weight: 700;
        font-size: 14px;
        font-family: ${F.family};
        letter-spacing: 0.2px;
        box-shadow: 0 4px 14px rgba(51, 51, 51, 0.15);
        transition: all 0.25s ease;

        &:hover {
            background: linear-gradient(135deg, ${C.primaryDark} 0%, ${C.primaryLight} 100%);
            transform: translateY(-1px);
            box-shadow: 0 8px 20px rgba(51, 51, 51, 0.25);
        }

        &.Mui-disabled {
            background: ${C.bgInput};
            color: ${C.textMuted};
            box-shadow: none;
        }
    }
`;

const formatDate = (dateString) => {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'TBD';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (dateString) => {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'TBD';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const getCategoryIcon = (category) => {
    const icons = {
        concert: '🎵', sports: '⚽', theater: '🎭',
        conference: '💼', workshop: '🔧', party: '🎉',
        dining: '🍽️', festival: '🎪', exhibition: '🖼️',
        community: '🤝', virtual: '💻', other: '📌',
    };
    return icons[(category || 'other').toLowerCase()] || '📌';
};

const pickAnnouncementImage = (event) => {
    const images = event.template_images || {};

    return (
        images.default ||
        images.announcement ||
        images.flyer ||
        images.ticket ||
        images.social ||
        images.invite ||
        images.certificate ||
        Object.values(images)[0] ||
        event.cover_image ||
        null
    );
};

const getFullVenueAddress = (venue) => {
    if (!venue) return 'Online Event';

    const parts = [
        venue.name,
        venue.address_line1,
        venue.city,
        venue.state,
    ].filter((p) => p && String(p).trim().length > 0);

    return parts.length > 0 ? parts.join(', ') : 'Online Event';
};

const VALID_FLOWS = ['ticketed', 'free_registration', 'paid_registration'];

const resolveFlow = (event) => {
    const raw = event?.event_flow;

    if (VALID_FLOWS.includes(raw)) return raw;

    if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(
            `[EventCard] event ${event?.id ?? '?'} has unknown event_flow ` +
            `${JSON.stringify(raw)}. Falling back to 'ticketed'.`
        );
    }
    return 'ticketed';
};

const isRegistrationFlow = (flow) =>
    flow === 'free_registration' || flow === 'paid_registration';

// ============================================================
// ✅ ENHANCEMENT: `context` decides what the CTA says and does.
//
//   'public'     → Book / Register (existing behaviour)
//   'management' → View Details (routes to the event detail page)
// ============================================================
const resolveCta = (event, isActuallySoldOut, context = 'public') => {
    const flow = resolveFlow(event);

    // Management context wins over the sold-out rule: admins and
    // organizers still want to view details of a sold-out event.
    if (context === 'management') {
        return {
            label: 'View Details',
            icon: <VisibilityIcon />,
            disabled: false,
            flow,
        };
    }

    if (isActuallySoldOut) {
        return {
            label: 'Sold Out',
            icon: <ShoppingCart />,
            disabled: true,
            flow,
        };
    }

    switch (flow) {
        case 'free_registration':
            return {
                label: 'Register Free',
                icon: <CheckCircleIcon />,
                disabled: false,
                flow,
            };
        case 'paid_registration':
            return {
                label: 'Register',
                icon: <HowToRegIcon />,
                disabled: false,
                flow,
            };
        case 'ticketed':
        default:
            return {
                label: 'Book Tickets',
                icon: <ShoppingCart />,
                disabled: false,
                flow: 'ticketed',
            };
    }
};

const resolvePriceDisplay = (flow, minPrice, tiers) => {
    if (flow === 'free_registration') {
        return { kind: 'free' };
    }
    if (minPrice !== null && !Number.isNaN(minPrice)) {
        return { kind: 'number', value: minPrice };
    }
    if (tiers.length === 0) {
        return { kind: 'dash' };
    }
    return { kind: 'dash' };
};

const EventCard = ({
    event: initialEvent,
    onSelect = null,
    selected = false,
    context = 'public',       // ✅ ENHANCEMENT: 'public' | 'management'
}) => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();

    const [event, setEvent] = useState(initialEvent);
    const [tiersExpanded, setTiersExpanded] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(!initialEvent.tiers);
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const fetchDetails = async () => {
            if (initialEvent.tiers && initialEvent.tiers.length > 0) {
                setLoadingDetails(false);
                return;
            }
            try {
                const fullDetails = await eventService.getPublicEventDetails(initialEvent.id);
                if (isMounted) {
                    setEvent((prev) => ({
                        ...prev,
                        ...fullDetails,
                        event_flow: fullDetails.event_flow ?? prev.event_flow,
                    }));
                }
            } catch (err) {
                console.error('Failed to load event details:', err);
            } finally {
                if (isMounted) setLoadingDetails(false);
            }
        };
        fetchDetails();
        return () => { isMounted = false; };
    }, [initialEvent.id, initialEvent.tiers]);

    const tiers = event.tiers || [];
    const sessions = event.sessions || [];

    let availableSlots = 0;
    if (sessions.length > 0) {
        availableSlots = sessions.reduce(
            (sum, session) => sum + Math.max(0, (session.capacity || 0) - (session.booked || 0)),
            0
        );
    } else if (typeof event.total_capacity === 'number') {
        availableSlots = Math.max(0, event.total_capacity - (event.total_tickets_sold || 0));
    } else {
        availableSlots = tiers.reduce(
            (sum, tier) => sum + Math.max(0, (tier.quantity_total || 0) - (tier.quantity_sold || 0)),
            0
        );
    }

    const prices = tiers
        .map((t) => parseFloat(t.price))
        .filter((p) => !isNaN(p) && p > 0);
    const minPrice = prices.length ? Math.min(...prices) : null;
    const lowStock = availableSlots > 0 && availableSlots <= 10;

    const flow = resolveFlow(event);
    const registrationFlow = isRegistrationFlow(flow);

    const isActuallySoldOut =
        event.status === 'sold_out' ||
        (!registrationFlow && availableSlots === 0);

    const displaySessions = sessions.length > 0
        ? sessions
        : [{ start_time: event.start_date, end_time: event.end_date }];

    const visibleSessions = displaySessions.slice(0, 2);
    const remainingSessionsCount = displaySessions.length - visibleSessions.length;

    const announcementImage = pickAnnouncementImage(event);

    // ✅ ENHANCEMENT: pass `context` through.
    const cta = resolveCta(event, isActuallySoldOut, context);
    const priceDisplay = resolvePriceDisplay(flow, minPrice, tiers);

    const handleCtaClick = () => {
        // Management context: always go to the details page via onSelect.
        // (No sold-out short-circuit — admins still want to inspect it.)
        if (context === 'management') {
            if (onSelect) onSelect(event);
            return;
        }

        // Public context: honour the existing wizard / gate flow.
        if (isActuallySoldOut) return;

        if (onSelect) {
            onSelect(event);
            return;
        }

        const wizardUrl = `/app/bookings/create?event=${event.id}`;

        if (isAuthenticated) {
            navigate(wizardUrl);
            return;
        }

        navigate(`/gate?event=${event.id}`, {
            state: {
                eventTitle: event.title,
                eventId: event.id,
                flow: cta.flow,
            },
        });
    };

    const showImage = announcementImage && !imageFailed;

    return (
        <StyledCard
            elevation={0}
            sx={selected ? { border: `2px solid ${C.primary}` } : {}}
        >
            {showImage ? (
                <CardImageBanner>
                    <img
                        src={announcementImage}
                        alt={event.title}
                        onError={() => {
                            console.error('❌ Image failed to load:', announcementImage);
                            setImageFailed(true);
                        }}
                    />
                </CardImageBanner>
            ) : (
                <TopAccent $isSoldOut={isActuallySoldOut} />
            )}
            <CardBody>
                <TitleRow>
                    <EventTitle>{event.title}</EventTitle>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-end', flexShrink: 0 }}>
                        <CategoryTag>
                            {getCategoryIcon(event.category)} {event.category || 'Event'}
                        </CategoryTag>
                        {/* ✅ ENHANCEMENT: show the event_flow badge */}
                        {flow !== 'ticketed' && (
                            <FlowTag $flow={flow}>
                                {flow === 'free_registration' ? 'Free Reg' : 'Paid Reg'}
                            </FlowTag>
                        )}
                    </Box>
                </TitleRow>

                <InfoRow>
                    <CalendarMonth />
                    <div className="text">
                        {displaySessions.length === 1 ? (
                            <div style={{ fontWeight: 500, color: C.textPrimary }}>
                                {formatDate(displaySessions[0].start_time)} · {formatTime(displaySessions[0].start_time)}
                            </div>
                        ) : (
                            <SessionList>
                                {visibleSessions.map((sess, idx) => (
                                    <div key={idx} className="session-item">
                                        <span>{formatDate(sess.start_time)}</span>
                                        <span style={{ color: C.textMuted, fontSize: '11px', fontWeight: 400 }}>
                                            at {formatTime(sess.start_time)}
                                        </span>
                                    </div>
                                ))}
                                {remainingSessionsCount > 0 && (
                                    <div className="session-more">
                                        +{remainingSessionsCount} more date{remainingSessionsCount > 1 ? 's' : ''}
                                    </div>
                                )}
                            </SessionList>
                        )}
                    </div>
                </InfoRow>

                <InfoRow>
                    <LocationOn />
                    <span className="text">
                        {getFullVenueAddress(event.venue)}
                    </span>
                </InfoRow>

                <PriceRow $low={lowStock}>
                    <div>
                        <div className="from-label">
                            {priceDisplay.kind === 'free' ? 'Admission' : 'From'}
                        </div>
                        <div className="price">
                            {loadingDetails ? (
                                <CircularProgress size={16} sx={{ color: C.textMuted }} />
                            ) : priceDisplay.kind === 'free' ? (
                                <span className="free-label">Free</span>
                            ) : priceDisplay.kind === 'number' ? (
                                <>
                                    <span className="currency">₹</span>
                                    {priceDisplay.value.toLocaleString()}
                                </>
                            ) : (
                                <>
                                    <span className="currency">₹</span>
                                    —
                                </>
                            )}
                        </div>
                    </div>
                    {isActuallySoldOut ? (
                        <span className="slots" style={{ color: C.error }}>
                            Sold out
                        </span>
                    ) : availableSlots > 0 ? (
                        <span className="slots">
                            {lowStock ? `Only ${availableSlots} left` : `${availableSlots} seats`}
                        </span>
                    ) : (
                        !loadingDetails && (
                            <span className="slots" style={{ color: C.textMuted }}>
                                {flow === 'free_registration'
                                    ? 'Registration open'
                                    : 'Check availability'}
                            </span>
                        )
                    )}
                </PriceRow>

                {tiers.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                        <TiersToggle onClick={() => setTiersExpanded(!tiersExpanded)}>
                            {tiersExpanded ? <ArrowUpIcon fontSize="small" /> : <ArrowDownIcon fontSize="small" />}
                            {tiersExpanded ? 'Hide Ticket Tiers' : 'View Ticket Tiers'}
                        </TiersToggle>

                        <Collapse in={tiersExpanded}>
                            <Box sx={{ mt: 1, p: 1.5, bgcolor: C.bgPrimary, borderRadius: 2 }}>
                                {loadingDetails ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                                        <CircularProgress size={20} sx={{ color: C.primary }} />
                                    </Box>
                                ) : tiers.length > 0 ? (
                                    tiers.map((tier, idx) => {
                                        const available = (tier.quantity_total || 0) - (tier.quantity_sold || 0);
                                        const isTierSoldOut = available <= 0;
                                        const tierPrice = parseFloat(tier.price);
                                        return (
                                            <TierItem key={tier.id || idx}>
                                                <span className="name">{tier.name}</span>
                                                <Box textAlign="right">
                                                    <div className="price">
                                                        {tierPrice > 0
                                                            ? `₹${tierPrice.toFixed(2)}`
                                                            : 'Free'}
                                                    </div>
                                                    {isTierSoldOut && <div className="sold-out">Sold out</div>}
                                                </Box>
                                            </TierItem>
                                        );
                                    })
                                ) : (
                                    <Typography variant="body2" sx={{ color: C.textSecondary, textAlign: 'center', fontSize: '12px' }}>
                                        No tiers configured.
                                    </Typography>
                                )}
                            </Box>
                        </Collapse>
                    </Box>
                )}
            </CardBody>

            <StyledActions>
                <BookButton
                    variant="contained"
                    onClick={handleCtaClick}
                    disabled={cta.disabled}
                    startIcon={cta.icon}
                    color={selected ? "success" : "primary"}
                >
                    {selected ? 'Selected' : cta.label}
                </BookButton>
            </StyledActions>
        </StyledCard>
    );
};

export default EventCard;