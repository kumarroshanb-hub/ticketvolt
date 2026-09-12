const Redis = require('ioredis');
const logger = require('../utils/logger');

class MessageQueue {
    constructor() {
        this.redis = null;
        this.isConnected = false;
        this.queueName = 'whatsapp:queue';
        this.retryQueueName = 'whatsapp:retry';
        this.processingQueue = 'whatsapp:processing';
        this.isProcessing = false;
        this.maxRetries = 3;
        this.retryDelay = 60000; // 1 minute
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
                console.log('✅ Redis connected for message queue');
            });

            this.redis.on('error', (error) => {
                console.error('❌ Redis error:', error.message);
                this.isConnected = false;
            });

            // Wait for connection
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Redis connection timeout'));
                }, 5000);
                this.redis.once('connect', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });

            // Start processing queue
            this.startProcessing();

            return this.redis;
        } catch (error) {
            console.error('❌ Failed to connect to Redis:', error.message);
            return null;
        }
    }

    async enqueue(message) {
        if (!this.isConnected) {
            console.error('❌ Redis not connected. Message queued in memory fallback.');
            return this.enqueueMemory(message);
        }

        try {
            const messageData = {
                ...message,
                queuedAt: new Date().toISOString(),
                retryCount: 0,
                status: 'pending'
            };
            
            await this.redis.lpush(this.queueName, JSON.stringify(messageData));
            console.log(`📥 Message enqueued for ${message.phoneNumber}`);
            return { success: true, queued: true };
        } catch (error) {
            console.error('❌ Failed to enqueue message:', error.message);
            return this.enqueueMemory(message);
        }
    }

    async enqueueMemory(message) {
        // Fallback in-memory queue
        if (!this.memoryQueue) {
            this.memoryQueue = [];
        }
        this.memoryQueue.push({
            ...message,
            queuedAt: new Date().toISOString(),
            retryCount: 0,
            status: 'pending'
        });
        console.log(`📥 Message queued in memory (fallback) for ${message.phoneNumber}`);
        return { success: true, queued: true, fallback: true };
    }

    async startProcessing() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        console.log('🔄 Starting message queue processor...');

        // Process every 5 seconds
        setInterval(async () => {
            await this.processQueue();
        }, 5000);

        // Process retry queue every minute
        setInterval(async () => {
            await this.processRetryQueue();
        }, this.retryDelay);
    }

    async processQueue() {
        try {
            if (!this.isConnected) {
                // Use memory queue
                if (this.memoryQueue && this.memoryQueue.length > 0) {
                    const message = this.memoryQueue.shift();
                    await this.processMessage(message);
                }
                return;
            }

            // Get next message from Redis
            const messageData = await this.redis.rpop(this.queueName);
            
            if (!messageData) return;

            try {
                const message = JSON.parse(messageData);
                await this.processMessage(message);
            } catch (error) {
                console.error('❌ Failed to parse message:', error.message);
            }
        } catch (error) {
            console.error('❌ Error processing queue:', error.message);
        }
    }

    async processRetryQueue() {
        try {
            if (!this.isConnected) return;

            const messages = await this.redis.lrange(this.retryQueueName, 0, -1);
            
            if (messages.length === 0) return;

            console.log(`🔄 Processing ${messages.length} retry messages...`);

            for (const messageData of messages) {
                const message = JSON.parse(messageData);
                const retryCount = message.retryCount || 0;

                if (retryCount >= this.maxRetries) {
                    // Max retries reached - move to dead letter queue
                    await this.redis.rpush('whatsapp:dead', messageData);
                    await this.redis.lrem(this.retryQueueName, 0, messageData);
                    console.log(`💀 Message moved to dead letter queue for ${message.phoneNumber}`);
                    continue;
                }

                // Process retry
                message.retryCount = retryCount + 1;
                const result = await this.processMessage(message);

                if (result.success) {
                    await this.redis.lrem(this.retryQueueName, 0, messageData);
                } else {
                    // Keep in retry queue
                    await this.redis.lset(this.retryQueueName, -1, JSON.stringify(message));
                }

                // Rate limit between retries
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('❌ Error processing retry queue:', error.message);
        }
    }

    async processMessage(message) {
        try {
            // Here you would actually send the WhatsApp message
            console.log(`📤 Processing message for ${message.phoneNumber}: ${message.text}`);
            
            // Simulate processing
            // In real implementation, call your sendMessage function
            
            return { success: true };
        } catch (error) {
            console.error(`❌ Failed to process message for ${message.phoneNumber}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    async getQueueStats() {
        try {
            if (!this.isConnected) {
                return {
                    queueLength: this.memoryQueue?.length || 0,
                    retryQueueLength: 0,
                    isConnected: false
                };
            }

            const queueLength = await this.redis.llen(this.queueName);
            const retryQueueLength = await this.redis.llen(this.retryQueueName);
            const deadQueueLength = await this.redis.llen('whatsapp:dead');

            return {
                queueLength,
                retryQueueLength,
                deadQueueLength,
                isConnected: true
            };
        } catch (error) {
            console.error('❌ Failed to get queue stats:', error.message);
            return {
                queueLength: 0,
                retryQueueLength: 0,
                deadQueueLength: 0,
                isConnected: false
            };
        }
    }

    async clearQueue() {
        try {
            if (this.isConnected) {
                await this.redis.del(this.queueName);
                await this.redis.del(this.retryQueueName);
                await this.redis.del('whatsapp:dead');
            }
            if (this.memoryQueue) {
                this.memoryQueue = [];
            }
            console.log('🧹 All queues cleared');
            return { success: true };
        } catch (error) {
            console.error('❌ Failed to clear queues:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new MessageQueue();
