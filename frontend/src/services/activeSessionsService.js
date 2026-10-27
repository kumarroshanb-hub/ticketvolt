// frontend/src/services/activeSessionsService.js
import api from './api';

const activeSessionsService = {
    async getActiveSessions({ includeAnonymous = false, idleMinutes = 30 } = {}) {
        const res = await api.get('/admin/active-sessions/', {
            params: {
                include_anonymous: includeAnonymous ? 1 : 0,
                idle_minutes: idleMinutes,
            },
        });
        return res.data;
    },
};

export default activeSessionsService;