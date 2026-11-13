// frontend/src/components/Common/OrgFilterSelect.js
import React from 'react';
import { TextField, MenuItem, InputAdornment } from '@mui/material';
import { Business as BusinessIcon } from '@mui/icons-material';

/**
 * Organization filter dropdown — rendered ONLY for Platform Admins.
 * Lets a Super Admin narrow any cross-tenant list view to a single org,
 * or view everything platform-wide (default).
 *
 * Props:
 *   isPlatformAdmin  {boolean}  – hide entirely for tenant users
 *   organizations    {array}    – list of { id, name }
 *   orgFilter        {string}   – currently selected org id ('' = all)
 *   setOrgFilter     {function} – setter
 *   onPageReset      {function} – optional; called to reset pagination
 *   sx               {object}   – MUI sx override
 */
const OrgFilterSelect = ({
    isPlatformAdmin,
    organizations = [],
    orgFilter,
    setOrgFilter,
    onPageReset,
    sx,
    label = 'Filter by Organization',
}) => {
    if (!isPlatformAdmin) return null;

    return (
        <TextField
            select
            label={label}
            value={orgFilter}
            onChange={(e) => {
                setOrgFilter(e.target.value);
                onPageReset?.();
            }}
            size="small"
            sx={{ minWidth: 240, ...sx }}
            SelectProps={{
                startAdornment: (
                    <InputAdornment position="start">
                        <BusinessIcon fontSize="small" color="action" />
                    </InputAdornment>
                ),
            }}
            helperText={orgFilter ? 'Showing one organization' : 'Showing all organizations'}
        >
            <MenuItem value="">
                <em>All Organizations (Platform-wide)</em>
            </MenuItem>
            {organizations.map((org) => (
                <MenuItem key={org.id} value={org.id}>
                    {org.name}
                </MenuItem>
            ))}
        </TextField>
    );
};

export default OrgFilterSelect;