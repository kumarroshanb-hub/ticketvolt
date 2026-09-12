// admin-frontend/src/pages/Venues/index.js
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import VenuesList from './Venues';
import CreateVenue from './Create';
import VenueDetail from './Detail';

const VenuesModule = () => {
    console.log('🏟️ VenuesModule rendered');
    return (
        <Routes>
            <Route index element={<VenuesList />} />
            <Route path="create" element={<CreateVenue />} />
            <Route path=":id" element={<VenueDetail />} />
            <Route path="edit/:id" element={<CreateVenue />} />
            <Route path="*" element={<Navigate to="/venues" replace />} />
        </Routes>
    );
};

export default VenuesModule;