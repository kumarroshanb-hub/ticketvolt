import api from './api';

const checkinService = {
    validate: async (code, eventId) => {
        const response = await api.post('/checkin/validate/', { code, event_id: eventId });
        return response.data;
    },
    batch: async (tickets) => {
        const response = await api.post('/checkin/batch/', { tickets });
        return response.data;
    },
    syncOffline: async (entries) => {
        const response = await api.post('/checkin/sync_offline/', { entries });
        return response.data;
    },
    getStats: async (eventId) => {
        const response = await api.get(`/checkin/stats/?event=${eventId}`);
        return response.data;
    }
};

export default checkinService;
