import api from './api';

const discountService = {
    getAll: async () => {
        const response = await api.get('/discounts/');
        return response.data;
    },
    getById: async (id) => {
        const response = await api.get(`/discounts/${id}/`);
        return response.data;
    },
    create: async (data) => {
        const response = await api.post('/discounts/', data);
        return response.data;
    },
    update: async (id, data) => {
        const response = await api.put(`/discounts/${id}/`, data);
        return response.data;
    },
    delete: async (id) => {
        const response = await api.delete(`/discounts/${id}/`);
        return response.data;
    },
    validate: async (code, amount) => {
        const response = await api.post('/discounts/validate/', { code, amount });
        return response.data;
    },
    getUsageStats: async (id) => {
        const response = await api.get(`/discounts/${id}/usage_stats/`);
        return response.data;
    }
};

export default discountService;
