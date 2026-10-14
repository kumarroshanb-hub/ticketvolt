// frontend/src/pages/Events/components/EventBasicInfo.js
import React from 'react';
import { Grid, FormControl, InputLabel, Select, MenuItem, Divider } from '@mui/material';
import { StyledTextField, SectionTitle } from './styled';
import {
    EVENT_TYPE,
    EVENT_TYPE_LABELS,
    EVENT_CATEGORY,
    EVENT_CATEGORY_LABELS,
} from '../../../constants';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

export const EventBasicInfo = ({ formData, onChange, venues }) => (
    <>
        <Grid item xs={12}>
            <SectionTitle variant="h6">Basic Information</SectionTitle>
            <Divider sx={{ borderColor: C.borderLight }} />
        </Grid>

        <Grid item xs={12}>
            <StyledTextField
                fullWidth
                label="Event Title"
                name="title"
                value={formData.title}
                onChange={onChange}
                required
            />
        </Grid>

        <Grid item xs={12}>
            <StyledTextField
                fullWidth
                label="Short Description"
                name="short_description"
                value={formData.short_description}
                onChange={onChange}
                multiline
                rows={2}
            />
        </Grid>

        <Grid item xs={12}>
            <StyledTextField
                fullWidth
                label="Description"
                name="description"
                value={formData.description}
                onChange={onChange}
                multiline
                rows={4}
            />
        </Grid>

        <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
                <InputLabel id="event-type-label">Event Type</InputLabel>
                <Select
                    labelId="event-type-label"
                    name="event_type"
                    value={formData.event_type}
                    onChange={onChange}
                    label="Event Type"
                >
                    {Object.values(EVENT_TYPE).map((type) => (
                        <MenuItem key={type} value={type}>
                            {EVENT_TYPE_LABELS[type] || type}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
                <InputLabel id="category-label">Category</InputLabel>
                <Select
                    labelId="category-label"
                    name="category"
                    value={formData.category}
                    onChange={onChange}
                    label="Category"
                >
                    {Object.values(EVENT_CATEGORY).map((cat) => (
                        <MenuItem key={cat} value={cat}>
                            {EVENT_CATEGORY_LABELS[cat] || cat}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        </Grid>

        <Grid item xs={12}>
            <FormControl fullWidth>
                <InputLabel id="venue-label">Venue</InputLabel>
                <Select
                    labelId="venue-label"
                    name="venue_id"
                    value={formData.venue_id}
                    onChange={onChange}
                    label="Venue"
                >
                    <MenuItem value="">Select Venue</MenuItem>
                    {venues.map((venue) => (
                        <MenuItem key={venue.id} value={venue.id}>
                            {venue.name}
                            {venue.city ? ` (${venue.city})` : ''}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        </Grid>
    </>
);