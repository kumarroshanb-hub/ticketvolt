import api from './api';

const eventService = {
    // Get all events
    getAll: async () => {
        const response = await api.get('/events/');
        return response.data;
    },

    // Get single event
    getById: async (id) => {
        const response = await api.get(`/events/${id}/`);
        return response.data;
    },

    // Create event
    create: async (eventData) => {
        const response = await api.post('/events/', eventData);
        return response.data;
    },

    // Update event
    update: async (id, eventData) => {
        const response = await api.put(`/events/${id}/`, eventData);
        return response.data;
    },

    // Delete event
    delete: async (id) => {
        const response = await api.delete(`/events/${id}/`);
        return response.data;
    },

    // Publish event
    publish: async (id) => {
        const response = await api.post(`/events/${id}/publish/`);
        return response.data;
    },

    // Duplicate event
    duplicate: async (id) => {
        const response = await api.post(`/events/${id}/duplicate/`);
        return response.data;
    },

    // Get event stats
    getStats: async (id) => {
        const response = await api.get(`/events/${id}/stats/`);
        return response.data;
    }
};

export default eventService;
