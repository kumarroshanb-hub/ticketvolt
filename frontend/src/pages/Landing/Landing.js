// frontend/src/pages/Landing/Landing.js
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Container, Grid, Alert, TextField, InputAdornment, Button,
    useMediaQuery, useTheme,
} from '@mui/material';
import {
    Search as SearchIcon,
    Refresh as RefreshIcon,
    ArrowForward as ArrowForwardIcon,
    LocalActivity as TicketIcon,
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
    padding: 100px 0 120px 0;

    background:
        radial-gradient(circle at 20% 20%, rgba(255, 42, 42, 0.15) 0%, transparent 45%),
        radial-gradient(circle at 80% 80%, rgba(51, 51, 51, 0.4) 0%, transparent 55%),
        linear-gradient(135deg, #1a1a1a 0%, #2b2b2b 55%, #0f0f0f 100%);

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
        padding: 70px 0 100px 0;
    }
`;

const HeroContent = styled(Container)`
    position: relative;
    z-index: 1;
    text-align: center;
`;

const ResponsiveLogoWrapper = styled.div`
    display: flex;
    justify-content: center;
    margin-bottom: 24px;

    img {
        height: 60px !important;
        width: auto !important;
    }

    @media (min-width: 601px) {
        img { height: 85px !important; }
    }

    @media (min-width: 1025px) {
        img { height: 110px !important; }
        margin-bottom: 32px;
    }
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
    font-size: clamp(2.4rem, 5vw, 4.5rem);
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
    font-size: clamp(1rem, 1.5vw, 1.25rem);
    color: rgba(255, 255, 255, 0.72);
    max-width: 700px;
    margin: 0 auto 32px auto;
    line-height: 1.6;
    animation: ${fadeUp} 0.7s 0.15s ease both;
`;

// ---------- Hero Action area (stats + buttons) ----------
const HeroActionArea = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    animation: ${fadeUp} 0.7s 0.25s ease both;
`;

const HeroStats = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 40px;
    padding: 16px 40px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(8px);

    @media (max-width: 600px) {
        gap: 20px;
        padding: 12px 24px;
        width: 100%;
        justify-content: center;
    }
`;

const HeroStat = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;

    .value {
        font-size: 24px;
        font-weight: 800;
        color: ${C.textInverse};
        line-height: 1;
        font-family: ${F.family};
    }

    .label {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.55);
        text-transform: uppercase;
        letter-spacing: 0.6px;
        font-weight: 600;
        margin-top: 6px;
    }

    @media (max-width: 600px) {
        .value { font-size: 20px; }
        .label { font-size: 10px; }
    }
`;

const HeroStatDivider = styled.div`
    width: 1px;
    height: 36px;
    background: rgba(255, 255, 255, 0.12);

    @media (max-width: 600px) { height: 28px; }
`;

const HeroButtons = styled.div`
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;

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
        padding: 16px 40px;
        border-radius: 12px;
        font-size: 16px;
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
        padding: 16px 32px;
        border-radius: 12px;
        font-size: 16px;
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
    margin-top: -56px;
`;

const SearchCard = styled.div`
    background: ${C.bgCard};
    border-radius: 20px;
    padding: 12px;
    box-shadow:
        0 20px 60px rgba(0, 0, 0, 0.12),
        0 4px 12px rgba(0, 0, 0, 0.06);
    border: 1px solid ${C.borderLight};
    display: flex;
    align-items: stretch;
    gap: 12px;

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

        fieldset { border-color: transparent; }
        &:hover fieldset { border-color: ${C.borderLight}; }
        &.Mui-focused fieldset { border-color: ${C.secondary}; border-width: 2px; }
    }

    & .MuiInputBase-input {
        padding: 16px 12px;
        font-size: 16px;
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
        font-weight: 700;
        border-radius: 14px;
        padding: 0 32px;
        min-height: 56px;
        font-size: 15px;
        flex-shrink: 0;

        &:hover { background: ${C.primaryDark}; }

        @media (max-width: 700px) {
            width: 100%;
            min-height: 48px;
        }
    }
`;

/* ---------- SECTION & FILTERS ---------- */

const SectionWrapper = styled(Container)`
    padding-top: 60px;
    padding-bottom: 80px;
    scroll-margin-top: 80px;
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
    font-size: clamp(1.75rem, 3vw, 2.5rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    color: ${C.textPrimary};
    margin: 0;
`;

const SectionSubtitle = styled.p`
    font-family: ${F.family};
    font-size: 15px;
    color: ${C.textSecondary};
    margin: 8px 0 0 0;
`;

const CategoryChips = styled.div`
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    padding-bottom: 4px;
    overflow-x: auto;

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
    gap: 8px;
    padding: 10px 20px;
    border-radius: 999px;
    border: 1px solid ${(p) => (p.$active ? C.primary : C.borderLight)};
    background: ${(p) => (p.$active ? C.primary : C.bgCard)};
    color: ${(p) => (p.$active ? C.textInverse : C.textSecondary)};
    font-size: 14px;
    font-weight: 600;
    font-family: ${F.family};
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    min-height: 44px;

    &:hover {
        border-color: ${C.primary};
        color: ${(p) => (p.$active ? C.textInverse : C.primary)};
        transform: translateY(-1px);
    }
`;

const EventGrid = styled(Grid)`
    animation: ${fadeUp} 0.5s ease both;
`;

/* ---------- EMPTY & SKELETON STATES ---------- */

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
        width: 80px;
        height: 80px;
        border-radius: 20px;
        background: ${C.bgInput};
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
        color: ${C.textMuted};
    }

    .title {
        font-size: 20px;
        font-weight: 700;
        color: ${C.textPrimary};
        margin: 0 0 8px 0;
        font-family: ${F.family};
    }

    .subtitle {
        font-size: 15px;
        color: ${C.textSecondary};
        margin: 0 0 24px 0;
        max-width: 400px;
        line-height: 1.6;
        font-family: ${F.family};
    }
`;

const SkeletonCard = styled.div`
    background: ${C.bgCard};
    border: 1px solid ${C.borderLight};
    border-radius: 20px;
    padding: 24px;
    height: 320px;
    display: flex;
    flex-direction: column;
    gap: 14px;
`;

const SkeletonBar = styled.div`
    height: ${(p) => p.$h || 14}px;
    width: ${(p) => p.$w || '100%'};
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

/* ---------- FOOTER ---------- */

const Footer = styled.footer`
    background: #1a1a1a;
    color: rgba(255, 255, 255, 0.65);
    padding: 48px 0 32px 0;
    margin-top: 40px;
    font-family: ${F.family};

    .inner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 24px;
        padding-top: 24px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .copy {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.45);
    }

    .links {
        display: flex;
        gap: 24px;

        a {
            color: rgba(255, 255, 255, 0.55);
            text-decoration: none;
            font-size: 14px;
            transition: color 0.2s ease;

            &:hover { color: ${C.secondary}; }
        }
    }
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
            // ✅ Defensive: the API returns `{count, results}` but a
            // future endpoint change to a bare array should not break
            // the page.
            const list = Array.isArray(data) ? data : (data?.results || []);
            setEvents(list);
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

    const filteredEvents = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return events.filter((event) => {
            if (activeCategory !== 'all') {
                const cat = (event.category || 'other').toLowerCase();
                if (cat !== activeCategory) return false;
            }
            if (q) {
                const inTitle = (event.title || '').toLowerCase().includes(q);
                const inVenue = (event.venue?.name || '').toLowerCase().includes(q);
                const inCity = (event.venue?.city || '').toLowerCase().includes(q);
                if (!inTitle && !inVenue && !inCity) return false;
            }
            return true;
        });
    }, [events, searchTerm, activeCategory]);

    const categoryCounts = useMemo(() => {
        const counts = { all: events.length };
        events.forEach((e) => {
            const cat = (e.category || 'other').toLowerCase();
            counts[cat] = (counts[cat] || 0) + 1;
        });
        return counts;
    }, [events]);

    const heroStats = useMemo(() => {
        const cities = new Set();
        events.forEach((e) => {
            if (e.venue?.city) cities.add(e.venue.city);
        });
        return {
            eventCount: events.length,
            cityCount: cities.size,
            // ✅ FIX [P24]: show a friendly label instead of the em-dash
            // when no events have a city set. Without this, an empty
            // events list rendered "Cities: —" which looked broken.
            cityCountLabel: cities.size > 0 ? String(cities.size) : 'All',
        };
    }, [events]);

    const handleLoginClick = () => navigate('/login');
    const handleDashboardClick = () => navigate('/app/dashboard');

    return (
        <PageWrapper>
            <HeroWrapper>
                <HeroContent maxWidth="xl">
                    <ResponsiveLogoWrapper>
                        <Logo variant="full" inverse />
                    </ResponsiveLogoWrapper>

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

                    <HeroActionArea>
                        <HeroStats>
                            <HeroStat>
                                <span className="value">{heroStats.eventCount}</span>
                                <span className="label">Events</span>
                            </HeroStat>
                            <HeroStatDivider />
                            <HeroStat>
                                {/* ✅ FIX [P24] */}
                                <span className="value">{heroStats.cityCountLabel}</span>
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
                    </HeroActionArea>
                </HeroContent>
            </HeroWrapper>

            <SearchOverlayWrapper maxWidth="xl">
                <SearchCard>
                    <SearchField
                        placeholder="Search by event name, venue, or city..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ color: C.textMuted, ml: 1, fontSize: 28 }} />
                                </InputAdornment>
                            ),
                        }}
                    />
                    <RefreshBtn onClick={loadEvents} startIcon={<RefreshIcon />}>
                        Refresh
                    </RefreshBtn>
                </SearchCard>
            </SearchOverlayWrapper>

            <SectionWrapper maxWidth="xl" id="events-section">
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

                <Box sx={{ mb: 5 }}>
                    <CategoryChips>
                        {CATEGORIES.map((cat) => {
                            const count = categoryCounts[cat.value] || 0;
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

                {loading ? (
                    <EventGrid container spacing={isMobile ? 2 : 4}>
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <Grid item xs={12} sm={6} md={4} lg={3} key={i}>
                                <SkeletonCard>
                                    <SkeletonBar $w="70%" $h={24} />
                                    <SkeletonBar $w="40%" $h={16} />
                                    <Box sx={{ flex: 1 }} />
                                    <SkeletonBar $w="80%" $h={16} />
                                    <SkeletonBar $w="60%" $h={16} />
                                    <SkeletonBar $w="100%" $h={48} />
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
                    <EventGrid container spacing={isMobile ? 2 : 4}>
                        {filteredEvents.map((event) => (
                            <Grid item xs={12} sm={6} md={4} lg={3} key={event.id}>
                                <EventCard event={event} />
                            </Grid>
                        ))}
                    </EventGrid>
                ) : (
                    <EmptyState>
                        <div className="icon-wrap">
                            <TicketIcon sx={{ fontSize: 40 }} />
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

            <Footer>
                <Container maxWidth="xl">
                    <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center' }}>
                        <Logo variant="full" height={60} inverse />
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