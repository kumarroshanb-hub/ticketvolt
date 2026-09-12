import React from 'react';
import { Container, Paper, Typography, Grid, Card, CardContent, Box } from '@mui/material';
import { Event, ConfirmationNumber, AttachMoney, People } from '@mui/icons-material';

const Dashboard = () => {
    const stats = [
        { title: 'Total Events', value: '12', icon: <Event />, color: '#1976d2' },
        { title: 'Tickets Sold', value: '1,234', icon: <ConfirmationNumber />, color: '#2e7d32' },
        { title: 'Revenue', value: '₹45,678', icon: <AttachMoney />, color: '#ed6c02' },
        { title: 'Attendees', value: '890', icon: <People />, color: '#9c27b0' },
    ];

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" gutterBottom>
                Dashboard
            </Typography>
            <Grid container spacing={3}>
                {stats.map((stat, index) => (
                    <Grid item xs={12} sm={6} md={3} key={index}>
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box>
                                        <Typography color="textSecondary" gutterBottom>
                                            {stat.title}
                                        </Typography>
                                        <Typography variant="h5">
                                            {stat.value}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ color: stat.color }}>
                                        {stat.icon}
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>
            <Paper sx={{ p: 3, mt: 3 }}>
                <Typography variant="h6" gutterBottom>
                    Recent Activity
                </Typography>
                <Typography color="textSecondary">
                    Welcome to TicketVolt Admin Dashboard!
                </Typography>
            </Paper>
        </Container>
    );
};

export default Dashboard;
