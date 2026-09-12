import api from './api';

const venueService = {
    getAll: async () => {
        const response = await api.get('/venues/');
        return response.data;
    },
    getById: async (id) => {
        const response = await api.get(`/venues/${id}/`);
        return response.data;
    },
    create: async (data) => {
        const response = await api.post('/venues/', data);
        return response.data;
    },
    update: async (id, data) => {
        const response = await api.put(`/venues/${id}/`, data);
        return response.data;
    },
    delete: async (id) => {
        const response = await api.delete(`/venues/${id}/`);
        return response.data;
    },
    getStats: async (id) => {
        const response = await api.get(`/venues/${id}/stats/`);
        return response.data;
    }
};

export default venueService;
