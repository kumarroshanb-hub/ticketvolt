// frontend/src/services/eventVenuePlanService.js
import api from './api';

const eventVenuePlanService = {
    async get(eventId) {
        const { data } = await api.get(`/events/${eventId}/venue-plan/`);
        return data;
    },

    async createCategory(eventId, payload) {
        const { data } = await api.post(
            `/events/${eventId}/venue-plan/categories/`, payload,
        );
        return data;
    },

    async updateCategory(eventId, categoryId, payload) {
        const { data } = await api.patch(
            `/events/${eventId}/venue-plan/categories/${categoryId}/`, payload,
        );
        return data;
    },

    async deleteCategory(eventId, categoryId) {
        await api.delete(
            `/events/${eventId}/venue-plan/categories/${categoryId}/`,
        );
    },

    async bulkAssign(eventId, categoryId, seatIds) {
        const { data } = await api.post(
            `/events/${eventId}/venue-plan/assign/`,
            { category_id: categoryId, seat_ids: seatIds },
        );
        return data;
    },

    async bulkUnassign(eventId, seatIds) {
        const { data } = await api.post(
            `/events/${eventId}/venue-plan/unassign/`,
            { seat_ids: seatIds },
        );
        return data;
    },
};

export default eventVenuePlanService;