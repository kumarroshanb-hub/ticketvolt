// frontend/src/pages/Landing/Landing.js
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Container, Typography, Grid, CircularProgress,
    Alert, TextField, InputAdornment, Button, Chip, Stack,
    useMediaQuery, useTheme, Skeleton,
} from '@mui/material';
import {
    Search as SearchIcon,
    Refresh as RefreshIcon,
    LocationOn as LocationIcon,
    CalendarMonth as CalendarIcon,
    ArrowForward as ArrowForwardIcon,
    LocalActivity as TicketIcon,
    TrendingUp as TrendingIcon,
    ConfirmationNumber as ConfirmationIcon,
} from '@mui/icons-material';
import styled, { keyframes } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import eventService from '../../services/eventService';
import { useAuth } from '../../context/AuthContext';
import EventCard from '../../components/Common/EventCard';
import Logo from '../../components/Logo';
import { theme } from '../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

// ============================================
// ANIMATIONS
// ============================================

const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
`;

const shimmer = keyframes`
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
`;

// ============================================
// STYLED COMPONENTS
// ============================================

const PageWrapper = styled.div`
    background: ${C.bgPrimary};
    min-height: 100vh;
    font-family: ${F.family};
`;

/* ---------- HERO ---------- */

const HeroWrapper = styled.section`
    position: relative;
    isolation: isolate;
    overflow: hidden;
    padding: 120px 0 140px 0;

    /* Dark gradient backdrop — image-friendly, brand-consistent */
    background:
        radial-gradient(circle at 20% 20%, rgba(255, 42, 42, 0.18) 0%, transparent 45%),
        radial-gradient(circle at 80% 80%, rgba(51, 51, 51, 0.55) 0%, transparent 55%),
        linear-gradient(135deg, #1a1a1a 0%, #2b2b2b 55%, #0f0f0f 100%);

    /* Subtle grain texture for depth (no external image needed) */
    &::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image:
            repeating-linear-gradient(
                45deg,
                rgba(255, 255, 255, 0.015) 0px,
                rgba(255, 255, 255, 0.015) 1px,
                transparent 1px,
                transparent 6px
            );
        pointer-events: none;
        z-index: 0;
    }

    @media (max-width: 900px) {
        padding: 80px 0 100px 0;
    }
`;

const HeroContent = styled(Container)`
    position: relative;
    z-index: 1;
    text-align: center;
`;

const HeroBadge = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(255, 42, 42, 0.12);
    border: 1px solid rgba(255, 42, 42, 0.35);
    color: ${C.secondaryLight};
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    margin-bottom: 24px;
    animation: ${fadeUp} 0.6s ease forwards;

    .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: ${C.secondary};
        box-shadow: 0 0 8px ${C.secondary};
    }
`;

const HeroTitle = styled.h1`
    font-family: ${F.family};
    font-size: clamp(2.2rem, 5.5vw, 4rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.05;
    color: ${C.textInverse};
    margin: 0 0 20px 0;
    animation: ${fadeUp} 0.7s 0.05s ease both;

    .highlight {
        background: linear-gradient(135deg, ${C.secondary} 0%, ${C.secondaryLight} 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }
`;

const HeroSubtitle = styled.p`
    font-family: ${F.family};
    font-size: clamp(1rem, 1.6vw, 1.15rem);
    color: rgba(255, 255, 255, 0.72);
    max-width: 620px;
    margin: 0 auto 32px auto;
    line-height: 1.6;
    animation: ${fadeUp} 0.7s 0.15s ease both;
`;

const HeroStats = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 32px;
    padding: 16px 28px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(8px);
    margin-bottom: 32px;
    animation: ${fadeUp} 0.7s 0.25s ease both;

    @media (max-width: 600px) {
        gap: 20px;
        padding: 12px 18px;
    }
`;

const HeroStat = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;

    .value {
        font-size: 22px;
        font-weight: 800;
        color: ${C.textInverse};
        line-height: 1;
        font-family: ${F.family};
    }

    .label {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.55);
        text-transform: uppercase;
        letter-spacing: 0.6px;
        font-weight: 600;
        margin-top: 6px;
    }

    @media (max-width: 600px) {
        .value { font-size: 18px; }
        .label { font-size: 10px; }
    }
`;

const HeroStatDivider = styled.div`
    width: 1px;
    height: 32px;
    background: rgba(255, 255, 255, 0.12);
`;

const HeroButtons = styled.div`
    display: inline-flex;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: center;
    animation: ${fadeUp} 0.7s 0.35s ease both;

    @media (max-width: 600px) {
        width: 100%;
        flex-direction: column;
        align-items: stretch;
    }
`;

const PrimaryHeroButton = styled(Button)`
    && {
        background: ${C.secondary};
        color: ${C.textInverse};
        text-transform: none;
        font-weight: 700;
        padding: 14px 32px;
        border-radius: 12px;
        font-size: 15px;
        letter-spacing: 0.3px;
        box-shadow: 0 8px 24px rgba(255, 42, 42, 0.35);
        transition: all 0.25s ease;

        &:hover {
            background: ${C.secondaryDark};
            transform: translateY(-2px);
            box-shadow: 0 12px 32px rgba(255, 42, 42, 0.45);
        }
    }
`;

const GhostHeroButton = styled(Button)`
    && {
        background: rgba(255, 255, 255, 0.06);
        color: ${C.textInverse};
        border: 1px solid rgba(255, 255, 255, 0.18);
        text-transform: none;
        font-weight: 600;
        padding: 14px 28px;
        border-radius: 12px;
        font-size: 15px;
        transition: all 0.25s ease;

        &:hover {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(255, 255, 255, 0.35);
        }
    }
`;

/* ---------- SEARCH OVERLAY ---------- */

const SearchOverlayWrapper = styled(Container)`
    position: relative;
    z-index: 2;
    margin-top: -52px;
`;

const SearchCard = styled.div`
    background: ${C.bgCard};
    border-radius: 20px;
    padding: 10px;
    box-shadow:
        0 20px 60px rgba(0, 0, 0, 0.12),
        0 4px 12px rgba(0, 0, 0, 0.06);
    border: 1px solid ${C.borderLight};
    display: flex;
    align-items: stretch;
    gap: 8px;

    @media (max-width: 700px) {
        flex-direction: column;
        gap: 10px;
        padding: 12px;
    }
`;

const SearchField = styled(TextField)`
    flex: 1;

    & .MuiOutlinedInput-root {
        background: transparent;
        border-radius: 14px;
        padding-left: 8px;

        fieldset {
            border-color: transparent;
        }

        &:hover fieldset {
            border-color: ${C.borderLight};
        }

        &.Mui-focused fieldset {
            border-color: ${C.secondary};
            border-width: 2px;
        }
    }

    & .MuiInputBase-input {
        padding: 16px 12px;
        font-size: 15px;
        color: ${C.textPrimary};
        font-family: ${F.family};

        &::placeholder {
            color: ${C.textMuted};
            opacity: 1;
        }
    }
`;

const RefreshBtn = styled(Button)`
    && {
        background: ${C.primary};
        color: ${C.textInverse};
        text-transform: none;
        font-weight: 600;
        border-radius: 14px;
        padding: 0 24px;
        min-height: 54px;
        flex-shrink: 0;

        &:hover {
            background: ${C.primaryDark};
        }

        @media (max-width: 700px) {
            width: 100%;
            min-height: 48px;
        }
    }
`;

/* ---------- CATEGORY FILTERS ---------- */

const SectionWrapper = styled(Container)`
    padding-top: 60px;
    padding-bottom: 80px;
`;

const SectionHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 28px;
`;

const SectionTitle = styled.h2`
    font-family: ${F.family};
    font-size: clamp(1.5rem, 2.5vw, 2rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    color: ${C.textPrimary};
    margin: 0;
`;

const SectionSubtitle = styled.p`
    font-family: ${F.family};
    font-size: 14px;
    color: ${C.textSecondary};
    margin: 6px 0 0 0;
`;

const CategoryChips = styled.div`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding-bottom: 4px;
    overflow-x: auto;

    /* Hide scrollbar on horizontal scroll on mobile */
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }

    @media (max-width: 600px) {
        flex-wrap: nowrap;
        margin: 0 -16px;
        padding: 0 16px 8px 16px;
    }
`;

const CategoryChip = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 16px;
    border-radius: 999px;
    border: 1px solid ${props => props.$active ? C.primary : C.borderLight};
    background: ${props => props.$active ? C.primary : C.bgCard};
    color: ${props => props.$active ? C.textInverse : C.textSecondary};
    font-size: 13px;
    font-weight: 600;
    font-family: ${F.family};
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    min-height: 40px;

    &:hover {
        border-color: ${C.primary};
        color: ${props => props.$active ? C.textInverse : C.primary};
        transform: translateY(-1px);
    }
`;

/* ---------- EVENT GRID ---------- */

const EventGrid = styled(Grid)`
    animation: ${fadeUp} 0.5s ease both;
`;

/* ---------- EMPTY STATE ---------- */

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 24px;
    text-align: center;
    background: ${C.bgCard};
    border: 1px dashed ${C.borderLight};
    border-radius: 20px;

    .icon-wrap {
        width: 72px;
        height: 72px;
        border-radius: 20px;
        background: ${C.bgInput};
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
        color: ${C.textMuted};
    }

    .title {
        font-size: 18px;
        font-weight: 700;
        color: ${C.textPrimary};
        margin: 0 0 8px 0;
        font-family: ${F.family};
    }

    .subtitle {
        font-size: 14px;
        color: ${C.textSecondary};
        margin: 0 0 24px 0;
        max-width: 380px;
        line-height: 1.6;
        font-family: ${F.family};
    }
`;

/* ---------- FOOTER ---------- */

const Footer = styled.footer`
    background: #1a1a1a;
    color: rgba(255, 255, 255, 0.65);
    padding: 40px 0 32px 0;
    margin-top: 40px;
    font-family: ${F.family};

    .inner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 20px;
        padding-top: 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .copy {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.45);
    }

    .links {
        display: flex;
        gap: 20px;

        a {
            color: rgba(255, 255, 255, 0.55);
            text-decoration: none;
            font-size: 13px;
            transition: color 0.2s ease;

            &:hover {
                color: ${C.secondary};
            }
        }
    }
`;

/* ---------- SKELETON LOADER ---------- */

const SkeletonCard = styled.div`
    background: ${C.bgCard};
    border: 1px solid ${C.borderLight};
    border-radius: 16px;
    padding: 24px;
    height: 260px;
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const SkeletonBar = styled.div`
    height: ${props => props.$h || 14}px;
    width: ${props => props.$w || '100%'};
    border-radius: 8px;
    background: linear-gradient(
        90deg,
        ${C.bgInput} 0%,
        ${C.borderLight} 50%,
        ${C.bgInput} 100%
    );
    background-size: 800px 100%;
    animation: ${shimmer} 1.6s infinite linear;
`;

// ============================================
// CATEGORY DEFINITIONS
// ============================================

const CATEGORIES = [
    { value: 'all',          label: 'All Events',  icon: '✨' },
    { value: 'concert',      label: 'Concerts',    icon: '🎵' },
    { value: 'sports',       label: 'Sports',      icon: '⚽' },
    { value: 'theater',      label: 'Theater',     icon: '🎭' },
    { value: 'conference',   label: 'Conferences', icon: '💼' },
    { value: 'workshop',     label: 'Workshops',   icon: '🔧' },
    { value: 'party',        label: 'Parties',     icon: '🎉' },
    { value: 'festival',     label: 'Festivals',   icon: '🎪' },
    { value: 'exhibition',   label: 'Exhibitions', icon: '🖼️' },
    { value: 'other',        label: 'Other',       icon: '📌' },
];

// ============================================
// MAIN COMPONENT
// ============================================

const Landing = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');

    const loadEvents = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await eventService.getPublicEvents();
            setEvents(data.results || []);
        } catch (err) {
            console.error('Failed to load public events:', err);
            setError('Could not load events. Please try again later.');
            toast.error('Failed to load events.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEvents();
    }, []);

    // ---- Derived: filtered events ----
    const filteredEvents = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return events.filter((event) => {
            // Category filter
            if (activeCategory !== 'all') {
                const cat = (event.category || 'other').toLowerCase();
                if (cat !== activeCategory) return false;
            }
            // Search filter
            if (q) {
                const inTitle = (event.title || '').toLowerCase().includes(q);
                const inVenue = (event.venue?.name || '').toLowerCase().includes(q);
                const inCity = (event.venue?.city || '').toLowerCase().includes(q);
                if (!inTitle && !inVenue && !inCity) return false;
            }
            return true;
        });
    }, [events, searchTerm, activeCategory]);

    // ---- Count by category (for chip badges) ----
    const categoryCounts = useMemo(() => {
        const counts = { all: events.length };
        events.forEach((e) => {
            const cat = (e.category || 'other').toLowerCase();
            counts[cat] = (counts[cat] || 0) + 1;
        });
        return counts;
    }, [events]);

    // ---- Hero stats ----
    const heroStats = useMemo(() => {
        const cities = new Set();
        events.forEach((e) => {
            if (e.venue?.city) cities.add(e.venue.city);
        });
        return {
            eventCount: events.length,
            cityCount: cities.size,
        };
    }, [events]);

    const handleLoginClick = () => navigate('/login');
    const handleDashboardClick = () => navigate('/app/dashboard');

    return (
        <PageWrapper>
            {/* =====================================================
                HERO
               ===================================================== */}
            <HeroWrapper>
                <HeroContent maxWidth="lg">
                    <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center' }}>
                        <Logo variant="full" height={70} inverse />
                    </Box>

                    <HeroBadge>
                        <span className="dot" />
                        Live · {heroStats.eventCount} Event{heroStats.eventCount === 1 ? '' : 's'} Available
                    </HeroBadge>

                    <HeroTitle>
                        Find Your Next <span className="highlight">Experience</span>
                    </HeroTitle>

                    <HeroSubtitle>
                        Discover concerts, sports, theater, and more. Book tickets
                        in seconds with instant confirmation and e-ticket delivery.
                    </HeroSubtitle>

                    <HeroStats>
                        <HeroStat>
                            <span className="value">{heroStats.eventCount}</span>
                            <span className="label">Events</span>
                        </HeroStat>
                        <HeroStatDivider />
                        <HeroStat>
                            <span className="value">{heroStats.cityCount || '—'}</span>
                            <span className="label">Cities</span>
                        </HeroStat>
                        <HeroStatDivider />
                        <HeroStat>
                            <span className="value">24/7</span>
                            <span className="label">Booking</span>
                        </HeroStat>
                    </HeroStats>

                    <HeroButtons>
                        <PrimaryHeroButton
                            onClick={isAuthenticated ? handleDashboardClick : handleLoginClick}
                            endIcon={<ArrowForwardIcon />}
                        >
                            {isAuthenticated ? 'Go to Dashboard' : 'Book Tickets'}
                        </PrimaryHeroButton>
                        <GhostHeroButton
                            onClick={() => {
                                document
                                    .getElementById('events-section')
                                    ?.scrollIntoView({ behavior: 'smooth' });
                            }}
                        >
                            Browse Events
                        </GhostHeroButton>
                    </HeroButtons>
                </HeroContent>
            </HeroWrapper>

            {/* =====================================================
                FLOATING SEARCH
               ===================================================== */}
            <SearchOverlayWrapper maxWidth="lg">
                <SearchCard>
                    <SearchField
                        placeholder="Search by event name, venue, or city..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ color: C.textMuted, ml: 1 }} />
                                </InputAdornment>
                            ),
                        }}
                    />
                    <RefreshBtn onClick={loadEvents} startIcon={<RefreshIcon />}>
                        Refresh
                    </RefreshBtn>
                </SearchCard>
            </SearchOverlayWrapper>

            {/* =====================================================
                EVENTS SECTION
               ===================================================== */}
            <SectionWrapper maxWidth="lg" id="events-section">
                <SectionHeader>
                    <div>
                        <SectionTitle>Upcoming Events</SectionTitle>
                        <SectionSubtitle>
                            {loading
                                ? 'Loading events...'
                                : `${filteredEvents.length} event${filteredEvents.length === 1 ? '' : 's'} found`}
                        </SectionSubtitle>
                    </div>
                </SectionHeader>

                {/* Category filter chips */}
                <Box sx={{ mb: 4 }}>
                    <CategoryChips>
                        {CATEGORIES.map((cat) => {
                            const count = categoryCounts[cat.value] || 0;
                            // Skip empty categories (except "All")
                            if (cat.value !== 'all' && count === 0) return null;

                            return (
                                <CategoryChip
                                    key={cat.value}
                                    $active={activeCategory === cat.value}
                                    onClick={() => setActiveCategory(cat.value)}
                                >
                                    <span>{cat.icon}</span>
                                    {cat.label}
                                    {count > 0 && (
                                        <span
                                            style={{
                                                marginLeft: 2,
                                                opacity: 0.7,
                                                fontWeight: 500,
                                            }}
                                        >
                                            ({count})
                                        </span>
                                    )}
                                </CategoryChip>
                            );
                        })}
                    </CategoryChips>
                </Box>

                {/* Content */}
                {loading ? (
                    <EventGrid container spacing={isMobile ? 2 : 3}>
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <Grid item xs={12} sm={6} md={4} key={i}>
                                <SkeletonCard>
                                    <SkeletonBar $w="60%" $h={20} />
                                    <SkeletonBar $w="40%" $h={12} />
                                    <Box sx={{ flex: 1 }} />
                                    <SkeletonBar $w="80%" $h={12} />
                                    <SkeletonBar $w="70%" $h={12} />
                                    <SkeletonBar $w="100%" $h={40} />
                                </SkeletonCard>
                            </Grid>
                        ))}
                    </EventGrid>
                ) : error ? (
                    <Alert
                        severity="error"
                        action={
                            <Button color="inherit" size="small" onClick={loadEvents}>
                                Retry
                            </Button>
                        }
                    >
                        {error}
                    </Alert>
                ) : filteredEvents.length > 0 ? (
                    <EventGrid container spacing={isMobile ? 2 : 3}>
                        {filteredEvents.map((event) => (
                            <Grid item xs={12} sm={6} md={4} key={event.id}>
                                <EventCard event={event} />
                            </Grid>
                        ))}
                    </EventGrid>
                ) : (
                    <EmptyState>
                        <div className="icon-wrap">
                            <TicketIcon sx={{ fontSize: 36 }} />
                        </div>
                        <h3 className="title">
                            {searchTerm || activeCategory !== 'all'
                                ? 'No matching events'
                                : 'No events available yet'}
                        </h3>
                        <p className="subtitle">
                            {searchTerm || activeCategory !== 'all'
                                ? 'Try adjusting your search or choosing a different category.'
                                : 'Check back soon — new events are added regularly.'}
                        </p>
                        {(searchTerm || activeCategory !== 'all') && (
                            <Button
                                variant="outlined"
                                onClick={() => {
                                    setSearchTerm('');
                                    setActiveCategory('all');
                                }}
                                sx={{ textTransform: 'none' }}
                            >
                                Clear filters
                            </Button>
                        )}
                    </EmptyState>
                )}
            </SectionWrapper>

            {/* =====================================================
                FOOTER
               ===================================================== */}
            <Footer>
                <Container maxWidth="lg">
                    <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
                        <Logo variant="full" height={48} inverse />
                    </Box>
                    <div className="inner">
                        <span className="copy">
                            © {new Date().getFullYear()} TiKetVault. All rights reserved.
                        </span>
                        <div className="links">
                            <a
                                href="#events-section"
                                onClick={(e) => {
                                    e.preventDefault();
                                    document
                                        .getElementById('events-section')
                                        ?.scrollIntoView({ behavior: 'smooth' });
                                }}
                            >
                                Browse Events
                            </a>
                            <a
                                href="/login"
                                onClick={(e) => {
                                    e.preventDefault();
                                    navigate('/login');
                                }}
                            >
                                Admin Login
                            </a>
                        </div>
                    </div>
                </Container>
            </Footer>
        </PageWrapper>
    );
};

export default Landing;