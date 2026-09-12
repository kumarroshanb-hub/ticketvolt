const Redis = require('ioredis');
const logger = require('../utils/logger');

class NumberRestrictions {
    constructor() {
        this.redis = null;
        this.isConnected = false;
        this.whitelistKey = 'whatsapp:whitelist';
        this.blacklistKey = 'whatsapp:blacklist';
        this.bookingRestrictionsKey = 'whatsapp:booking:restrictions';
        
        // Default restricted numbers (for testing)
        this.defaultWhitelist = [
            '919562159890', // Your test number            
            // Add numbers that can initiate booking
            // Format: '91XXXXXXXXXX' (with country code)
            // Example:
            // '919876543210',  // Customer 1
            // '918765432109',  // Customer 2
            // '919123456789',  // Customer 3
        ];
        
        this.defaultBlacklist = [
            // Add numbers to blacklist here
            // '919999999999',  // Example blocked number
        ];
        
        this.defaultBookingRestrictions = {
            maxBookingsPerDay: 5,
            maxBookingsPerUser: 10,
            maxTicketsPerBooking: 10,
            minTicketsPerBooking: 1
        };
    }

    async connect() {
        try {
            const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
            this.redis = new Redis(redisUrl, {
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
                maxRetriesPerRequest: 3,
            });

            this.redis.on('connect', () => {
                this.isConnected = true;
                console.log('✅ Redis connected for number restrictions');
            });

            this.redis.on('error', (error) => {
                console.error('❌ Redis error:', error.message);
                this.isConnected = false;
            });

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Redis connection timeout'));
                }, 5000);
                this.redis.once('connect', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });

            // Initialize default whitelist
            await this.initializeDefaults();

            return this.redis;
        } catch (error) {
            console.error('❌ Failed to connect to Redis:', error.message);
            return null;
        }
    }

    async initializeDefaults() {
        try {
            // Initialize whitelist
            for (const number of this.defaultWhitelist) {
                await this.addToWhitelist(number);
            }
            
            // Initialize blacklist
            for (const number of this.defaultBlacklist) {
                await this.addToBlacklist(number);
            }

            // Initialize booking restrictions
            await this.setBookingRestrictions(this.defaultBookingRestrictions);
            
            console.log('✅ Number restrictions initialized');
        } catch (error) {
            console.error('❌ Failed to initialize restrictions:', error.message);
        }
    }

    // ============ WHITELIST MANAGEMENT ============
    async addToWhitelist(phoneNumber) {
        const formatted = this.formatPhoneNumber(phoneNumber);
        try {
            if (this.isConnected) {
                await this.redis.sadd(this.whitelistKey, formatted);
            }
            console.log(`✅ Added ${formatted} to whitelist`);
            return { success: true };
        } catch (error) {
            console.error('❌ Failed to add to whitelist:', error.message);
            return { success: false, error: error.message };
        }
    }

    async removeFromWhitelist(phoneNumber) {
        const formatted = this.formatPhoneNumber(phoneNumber);
        try {
            if (this.isConnected) {
                await this.redis.srem(this.whitelistKey, formatted);
            }
            console.log(`✅ Removed ${formatted} from whitelist`);
            return { success: true };
        } catch (error) {
            console.error('❌ Failed to remove from whitelist:', error.message);
            return { success: false, error: error.message };
        }
    }

    async isInWhitelist(phoneNumber) {
        const formatted = this.formatPhoneNumber(phoneNumber);
        try {
            if (this.isConnected) {
                return await this.redis.sismember(this.whitelistKey, formatted);
            }
            // Fallback: check in-memory
            return this.defaultWhitelist.includes(formatted);
        } catch (error) {
            console.error('❌ Failed to check whitelist:', error.message);
            return false;
        }
    }

    async getWhitelist() {
        try {
            if (this.isConnected) {
                return await this.redis.smembers(this.whitelistKey);
            }
            return this.defaultWhitelist;
        } catch (error) {
            console.error('❌ Failed to get whitelist:', error.message);
            return [];
        }
    }

    // ============ BLACKLIST MANAGEMENT ============
    async addToBlacklist(phoneNumber) {
        const formatted = this.formatPhoneNumber(phoneNumber);
        try {
            if (this.isConnected) {
                await this.redis.sadd(this.blacklistKey, formatted);
            }
            console.log(`✅ Added ${formatted} to blacklist`);
            return { success: true };
        } catch (error) {
            console.error('❌ Failed to add to blacklist:', error.message);
            return { success: false, error: error.message };
        }
    }

    async removeFromBlacklist(phoneNumber) {
        const formatted = this.formatPhoneNumber(phoneNumber);
        try {
            if (this.isConnected) {
                await this.redis.srem(this.blacklistKey, formatted);
            }
            console.log(`✅ Removed ${formatted} from blacklist`);
            return { success: true };
        } catch (error) {
            console.error('❌ Failed to remove from blacklist:', error.message);
            return { success: false, error: error.message };
        }
    }

    async isInBlacklist(phoneNumber) {
        const formatted = this.formatPhoneNumber(phoneNumber);
        try {
            if (this.isConnected) {
                return await this.redis.sismember(this.blacklistKey, formatted);
            }
            return this.defaultBlacklist.includes(formatted);
        } catch (error) {
            console.error('❌ Failed to check blacklist:', error.message);
            return false;
        }
    }

    async getBlacklist() {
        try {
            if (this.isConnected) {
                return await this.redis.smembers(this.blacklistKey);
            }
            return this.defaultBlacklist;
        } catch (error) {
            console.error('❌ Failed to get blacklist:', error.message);
            return [];
        }
    }

    // ============ BOOKING RESTRICTIONS ============
    async setBookingRestrictions(restrictions) {
        try {
            if (this.isConnected) {
                await this.redis.hset(this.bookingRestrictionsKey, restrictions);
            }
            this.currentRestrictions = restrictions;
            console.log('✅ Booking restrictions updated:', restrictions);
            return { success: true };
        } catch (error) {
            console.error('❌ Failed to set booking restrictions:', error.message);
            return { success: false, error: error.message };
        }
    }

    async getBookingRestrictions() {
        try {
            if (this.isConnected) {
                const restrictions = await this.redis.hgetall(this.bookingRestrictionsKey);
                if (Object.keys(restrictions).length > 0) {
                    return restrictions;
                }
            }
            return this.defaultBookingRestrictions;
        } catch (error) {
            console.error('❌ Failed to get booking restrictions:', error.message);
            return this.defaultBookingRestrictions;
        }
    }

    async incrementUserBookingCount(phoneNumber) {
        const key = `whatsapp:user:${this.formatPhoneNumber(phoneNumber)}:bookings`;
        try {
            const count = await this.redis.incr(key);
            await this.redis.expire(key, 86400); // 24 hours
            return { success: true, count };
        } catch (error) {
            console.error('❌ Failed to increment booking count:', error.message);
            return { success: false, error: error.message };
        }
    }

    async getUserBookingCount(phoneNumber) {
        const key = `whatsapp:user:${this.formatPhoneNumber(phoneNumber)}:bookings`;
        try {
            const count = await this.redis.get(key);
            return { success: true, count: parseInt(count) || 0 };
        } catch (error) {
            console.error('❌ Failed to get booking count:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ============ AUTHORIZATION CHECKS ============
    async canRespond(phoneNumber) {
        const formatted = this.formatPhoneNumber(phoneNumber);
        
        // Check blacklist first
        if (await this.isInBlacklist(formatted)) {
            console.log(`🚫 ${formatted} is blacklisted`);
            return { allowed: false, reason: 'Number is blacklisted' };
        }

        // Check whitelist (if whitelist is not empty)
        const whitelist = await this.getWhitelist();
        if (whitelist.length > 0 && !await this.isInWhitelist(formatted)) {
            console.log(`🚫 ${formatted} is not in whitelist`);
            return { allowed: false, reason: 'Number not authorized' };
        }

        return { allowed: true };
    }

    async canInitiateBooking(phoneNumber) {
        const formatted = this.formatPhoneNumber(phoneNumber);
        
        // Check if number can respond
        const responseCheck = await this.canRespond(formatted);
        if (!responseCheck.allowed) {
            return responseCheck;
        }

        // Check booking limits
        const restrictions = await this.getBookingRestrictions();
        const bookingCount = await this.getUserBookingCount(formatted);
        
        if (bookingCount.success && bookingCount.count >= parseInt(restrictions.maxBookingsPerUser || 10)) {
            return { allowed: false, reason: 'Maximum bookings per user reached' };
        }

        return { allowed: true };
    }

    formatPhoneNumber(phone) {
        let cleaned = phone.replace(/\D/g, '');
        cleaned = cleaned.replace(/^0+/, '');
        if (cleaned.length === 10) {
            cleaned = '91' + cleaned;
        }
        return cleaned;
    }

    // ============ ADMIN COMMANDS ============
    async handleAdminCommand(phoneNumber, command) {
        if (!await this.isInWhitelist(phoneNumber)) {
            return { error: 'Unauthorized' };
        }

        const parts = command.split(' ');
        const action = parts[0].toLowerCase();

        switch (action) {
            case 'whitelist':
                if (parts.length < 2) return { error: 'Usage: whitelist <number>' };
                return await this.addToWhitelist(parts[1]);

            case 'blacklist':
                if (parts.length < 2) return { error: 'Usage: blacklist <number>' };
                return await this.addToBlacklist(parts[1]);

            case 'remove':
                if (parts.length < 3) return { error: 'Usage: remove <whitelist|blacklist> <number>' };
                if (parts[1] === 'whitelist') return await this.removeFromWhitelist(parts[2]);
                if (parts[1] === 'blacklist') return await this.removeFromBlacklist(parts[2]);
                return { error: 'Invalid list type. Use whitelist or blacklist' };

            case 'restrictions':
                if (parts.length < 3) return { error: 'Usage: restrictions <key> <value>' };
                const restriction = await this.getBookingRestrictions();
                restriction[parts[1]] = parts[2];
                return await this.setBookingRestrictions(restriction);

            case 'stats':
                const stats = await this.getStats();
                return { stats };

            default:
                return { error: 'Unknown admin command' };
        }
    }

    async getStats() {
        try {
            const whitelist = await this.getWhitelist();
            const blacklist = await this.getBlacklist();
            const restrictions = await this.getBookingRestrictions();
            
            return {
                whitelistCount: whitelist.length,
                blacklistCount: blacklist.length,
                restrictions,
                isConnected: this.isConnected
            };
        } catch (error) {
            console.error('❌ Failed to get stats:', error.message);
            return null;
        }
    }
}

module.exports = new NumberRestrictions();
