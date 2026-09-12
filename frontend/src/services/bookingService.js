import api from './api';

const bookingService = {
    getAll: async () => {
        const response = await api.get('/bookings/');
        return response.data;
    },
    getById: async (id) => {
        const response = await api.get(`/bookings/${id}/`);
        return response.data;
    },
    create: async (data) => {
        const response = await api.post('/bookings/', data);
        return response.data;
    },
    update: async (id, data) => {
        const response = await api.put(`/bookings/${id}/`, data);
        return response.data;
    },
    cancel: async (id) => {
        const response = await api.post(`/bookings/${id}/cancel/`);
        return response.data;
    },
    confirmPayment: async (id, paymentData) => {
        const response = await api.post(`/bookings/${id}/confirm_payment/`, paymentData);
        return response.data;
    },
    refund: async (id) => {
        const response = await api.post(`/bookings/${id}/refund/`);
        return response.data;
    }
};

export default bookingService;
