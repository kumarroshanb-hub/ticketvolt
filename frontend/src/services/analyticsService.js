import api from './api';

const analyticsService = {
    getAnalytics: async () => {
        const response = await api.get('/analytics/');
        return response.data;
    }
};

export default analyticsService;
