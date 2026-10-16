// frontend/src/pages/Landing/Landing.js
import React, { useState, useEffect } from 'react';
import {
    Box, Container, Typography, Grid, CircularProgress,
    Alert, TextField, InputAdornment, Button, useMediaQuery, useTheme,
} from '@mui/material';
import {
    Search as SearchIcon,
    Refresh as RefreshIcon,
} from '@mui/icons-material';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

// Import services and components
import eventService from '../../services/eventService';
import { useAuth } from '../../context/AuthContext';
import EventCard from '../../components/Common/EventCard';
import Logo from '../../components/Logo';
import { theme } from '../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

// ============================================
// STYLED COMPONENTS
// ============================================

const PageWrapper = styled.div`
    background: ${C.bgPrimary};
    min-height: 100vh;
    font-family: ${F.family};
`;

const HeroSection = styled.section`
    background: ${C.primaryGradient};
    color: ${C.textInverse};
    padding: 80px 0 120px 0;
    text-align: center;
    position: relative;
    
    /* Perforated edge effect */
    &::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 20px;
        background: repeating-linear-gradient(
            90deg,
            transparent,
            transparent 8px,
            ${C.bgPrimary} 8px,
            ${C.bgPrimary} 10px
        );
    }
`;

const ContentSection = styled(Container)`
    margin-top: -60px;
    padding-bottom: 60px;
`;

const SearchContainer = styled.div`
    background: ${C.bgCard};
    padding: 24px;
    border-radius: 16px;
    box-shadow: ${theme.shadows.cardHover};
    max-width: 800px;
    margin: 0 auto 40px auto;
    display: flex;
    gap: 16px;

    @media (max-width: 600px) {
        flex-direction: column;
    }
`;

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

    const filteredEvents = events.filter(event =>
        event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (event.venue?.name && event.venue.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handleLoginClick = () => {
        navigate('/login');
    };

    return (
        <PageWrapper>
            <HeroSection>
                <Container>
                    <Box sx={{ mb: 4 }}>
                        <Logo variant="full" height={60} inverse />
                    </Box>
                    <Typography
                        variant="h3"
                        component="h1"
                        sx={{
                            fontWeight: 800,
                            color: C.textInverse,
                            mb: 2,
                            fontSize: { xs: '2rem', md: '3rem' },
                        }}
                    >
                        Find Your Next Experience
                    </Typography>
                    <Typography
                        variant="h6"
                        sx={{
                            color: 'rgba(255, 255, 255, 0.8)',
                            fontWeight: 400,
                            maxWidth: 600,
                            margin: '0 auto',
                        }}
                    >
                        Discover and book tickets for the best events around you.
                    </Typography>
                    <Button
                        onClick={isAuthenticated ? () => navigate('/app/dashboard') : handleLoginClick}
                        variant="contained"
                        sx={{
                            mt: 4,
                            backgroundColor: C.secondary,
                            color: C.textInverse,
                            '&:hover': { backgroundColor: C.secondaryDark },
                            textTransform: 'none',
                            fontWeight: 600,
                            px: 4,
                            py: 1.5,
                        }}
                    >
                        {isAuthenticated ? 'Go to Dashboard' : 'Admin / Login'}
                    </Button>
                </Container>
            </HeroSection>

            <ContentSection>
                <SearchContainer>
                    <TextField
                        fullWidth
                        placeholder="Search events by name or venue..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ color: C.textMuted }} />
                                </InputAdornment>
                            ),
                        }}
                    />
                    <Button
                        onClick={loadEvents}
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        sx={{
                            borderColor: C.borderLight,
                            color: C.textSecondary,
                            '&:hover': { borderColor: C.primary, color: C.primary },
                            flexShrink: 0,
                            minHeight: 56,
                        }}
                    >
                        Refresh
                    </Button>
                </SearchContainer>

                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                        <CircularProgress sx={{ color: C.primary }} />
                    </Box>
                )}

                {error && !loading && (
                    <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
                )}

                {!loading && !error && (
                    <Grid container spacing={isMobile ? 2 : 3}>
                        {filteredEvents.length > 0 ? (
                            filteredEvents.map((event) => (
                                <Grid item xs={12} sm={6} md={4} key={event.id}>
                                    <EventCard event={event} />
                                </Grid>
                            ))
                        ) : (
                            <Grid item xs={12}>
                                <Box sx={{ textAlign: 'center', py: 8, color: C.textMuted }}>
                                    <Typography variant="h6">
                                        {searchTerm ? 'No events match your search.' : 'No events are currently available.'}
                                    </Typography>
                                </Box>
                            </Grid>
                        )}
                    </Grid>
                )}
            </ContentSection>
        </PageWrapper>
    );
};

export default Landing;