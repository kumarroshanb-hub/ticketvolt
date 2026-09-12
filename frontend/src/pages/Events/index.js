// admin-frontend/src/pages/Events/index.js
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import EventsList from './Events';
import CreateEvent from './Create';
import EventDetail from './EventDetail';

const EventsModule = () => {
    return (
        <Routes>
            <Route index element={<EventsList />} />
            <Route path="create" element={<CreateEvent />} />
            <Route path=":id" element={<EventDetail />} />
            <Route path=":id/edit" element={<CreateEvent />} />
            <Route path="*" element={<Navigate to="/events" replace />} />
        </Routes>
    );
};

export default EventsModule;