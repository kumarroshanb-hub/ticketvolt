// frontend/src/components/Common/EventCard.js
import React, { useState, useEffect } from 'react';
import {
    Card, CardContent, CardActions, Button, Box, Typography,
    Collapse, CircularProgress,
} from '@mui/material';
import {
    LocationOn, CalendarMonth, ShoppingCart,
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

// ---------- Styled wrappers ----------
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

// ---------- Helpers ----------
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

// ---------- Component ----------
const EventCard = ({ event: initialEvent }) => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();

    const [event, setEvent] = useState(initialEvent);
    const [tiersExpanded, setTiersExpanded] = useState(false);
    
    const [detailsLoading, setDetailsLoading] = useState(!initialEvent.tiers);
    const [detailsLoaded, setDetailsLoaded] = useState(!!initialEvent.tiers);

    useEffect(() => {
        let isMounted = true;
        const fetchFullDetails = async () => {
            if (detailsLoaded) return;
            try {
                const fullDetails = await eventService.getPublicEventDetails(initialEvent.id);
                if (isMounted) {
                    setEvent((prev) => ({ ...prev, ...fullDetails }));
                    setDetailsLoaded(true);
                }
            } catch (err) {
                console.error('Failed to load event details', err);
            } finally {
                if (isMounted) {
                    setDetailsLoading(false);
                }
            }
        };

        fetchFullDetails();
        return () => { isMounted = false; };
    }, [initialEvent.id, detailsLoaded]);

    const isSoldOut = event.status === 'sold_out';

    const tiers = event.tiers || [];
    const availableSlots = tiers.reduce((sum, tier) => sum + Math.max(0, (tier.quantity_total || 0) - (tier.quantity_sold || 0)), 0);
    const prices = tiers.map(t => parseFloat(t.price)).filter(p => !isNaN(p));
    const minPrice = prices.length ? Math.min(...prices) : null;
    const lowStock = availableSlots > 0 && availableSlots <= 10;
    const isActuallySoldOut = isSoldOut || (detailsLoaded && tiers.length > 0 && availableSlots === 0);

    const sessions = event.sessions || [];
    const displaySessions = sessions.length > 0 
        ? sessions 
        : [{ start_time: event.start_date, end_time: event.end_date, capacity: event.total_capacity }];
    
    const visibleSessions = displaySessions.slice(0, 2);
    const remainingSessionsCount = displaySessions.length - visibleSessions.length;

    const handleBookNow = () => {
        const target = `/app/bookings/create?event=${event.id}`;
        if (!isAuthenticated) {
            toast.info('Please log in to book tickets.');
            navigate('/login', { state: { from: target } });
        } else {
            navigate(target);
        }
    };

    return (
        <StyledCard elevation={0}>
            <TopAccent $isSoldOut={isActuallySoldOut} />
            <CardBody>
                <TitleRow>
                    <EventTitle>{event.title}</EventTitle>
                    <CategoryTag>
                        {getCategoryIcon(event.category)} {event.category || 'Event'}
                    </CategoryTag>
                </TitleRow>

                <InfoRow>
                    <CalendarMonth />
                    <div className="text">
                        {displaySessions.length === 1 ? (
                            <div style={{ fontWeight: 500, color: C.textPrimary }}>
                                {formatDate(displaySessions[0].start_time || event.start_date)}
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
                        {event.venue?.name || 'Online Event'}
                        {event.venue?.city ? ` · ${event.venue.city}` : ''}
                    </span>
                </InfoRow>

                <PriceRow $low={lowStock}>
                    <div>
                        <div className="from-label">From</div>
                        <div className="price">
                            {detailsLoading ? (
                                <CircularProgress size={16} sx={{ color: C.textMuted }} />
                            ) : (
                                <>
                                    <span className="currency">₹</span>
                                    {minPrice !== null ? minPrice.toLocaleString() : '—'}
                                </>
                            )}
                        </div>
                    </div>
                    {isActuallySoldOut ? (
                        <span className="slots" style={{ color: C.error }}>Sold out</span>
                    ) : availableSlots > 0 ? (
                        <span className="slots">
                            {lowStock ? `Only ${availableSlots} left` : `${availableSlots} seats`}
                        </span>
                    ) : (
                        !detailsLoading && <span className="slots" style={{ color: C.textMuted }}>Check availability</span>
                    )}
                </PriceRow>

                <Box sx={{ mt: 1 }}>
                    <TiersToggle onClick={() => setTiersExpanded(!tiersExpanded)}>
                        {tiersExpanded ? <ArrowUpIcon fontSize="small" /> : <ArrowDownIcon fontSize="small" />}
                        {tiersExpanded ? 'Hide Ticket Tiers' : 'View Ticket Tiers'}
                    </TiersToggle>
                    
                    <Collapse in={tiersExpanded}>
                        <Box sx={{ mt: 1, p: 1.5, bgcolor: C.bgPrimary, borderRadius: 2 }}>
                            {detailsLoading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                                    <CircularProgress size={20} sx={{ color: C.primary }} />
                                </Box>
                            ) : tiers.length > 0 ? (
                                tiers.map((tier, idx) => {
                                    const available = (tier.quantity_total || 0) - (tier.quantity_sold || 0);
                                    const isTierSoldOut = available <= 0;
                                    return (
                                        <TierItem key={tier.id || idx}>
                                            <span className="name">{tier.name}</span>
                                            <Box textAlign="right">
                                                <div className="price">₹{parseFloat(tier.price).toFixed(2)}</div>
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
            </CardBody>

            <StyledActions>
                <BookButton
                    variant="contained"
                    onClick={handleBookNow}
                    disabled={isActuallySoldOut}
                    startIcon={<ShoppingCart />}
                >
                    {isActuallySoldOut ? 'Sold Out' : 'Book Tickets'}
                </BookButton>
            </StyledActions>
        </StyledCard>
    );
};

export default EventCard;