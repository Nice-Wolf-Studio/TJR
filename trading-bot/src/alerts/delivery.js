const axios = require('axios');
const EventEmitter = require('events');

/**
 * Alert Delivery System - Discord webhook integration with rate limiting and retry logic
 * Handles message formatting, delivery confirmation, and error recovery
 */
class AlertDelivery extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            // Discord API limits
            rateLimitWindow: config.rateLimitWindow || 60000, // 1 minute
            maxMessagesPerMinute: config.maxMessagesPerMinute || 30,
            maxEmbedsPerMessage: config.maxEmbedsPerMessage || 10,

            // Retry configuration
            maxRetries: config.maxRetries || 3,
            baseRetryDelay: config.baseRetryDelay || 1000, // 1 second
            maxRetryDelay: config.maxRetryDelay || 30000, // 30 seconds

            // Delivery options
            enableBatching: config.enableBatching !== false,
            batchWindow: config.batchWindow || 5000, // 5 seconds
            maxBatchSize: config.maxBatchSize || 5,

            // Webhook URLs
            webhooks: config.webhooks || {},

            // Timeout settings
            requestTimeout: config.requestTimeout || 10000, // 10 seconds
            ...config
        };

        // Internal state
        this.messageQueue = new Map(); // channelId -> message queue
        this.rateLimitTracking = new Map(); // channelId -> rate limit data
        this.deliveryMetrics = {
            sent: 0,
            failed: 0,
            retried: 0,
            rateLimited: 0,
            batched: 0
        };

        // Batch processing
        this.batchQueues = new Map(); // channelId -> batch queue
        this.batchTimers = new Map(); // channelId -> timer

        // Start delivery processing
        this.startDeliveryProcessor();
    }

    /**
     * Send alert to Discord channel
     */
    async sendAlert(alert, recipients, templates) {
        try {
            // Format alert message
            const formattedMessage = await this.formatAlert(alert, templates);

            // Process delivery to all recipients
            const deliveryResults = [];

            for (const recipient of recipients) {
                const result = await this.deliverToRecipient(
                    formattedMessage,
                    recipient,
                    alert
                );
                deliveryResults.push(result);
            }

            // Aggregate results
            const successCount = deliveryResults.filter(r => r.success).length;
            const failCount = deliveryResults.filter(r => !r.success).length;

            this.emit('alert_delivered', {
                alertId: alert.id,
                successCount,
                failCount,
                results: deliveryResults
            });

            return {
                success: successCount > 0,
                delivered: successCount,
                failed: failCount,
                results: deliveryResults
            };

        } catch (error) {
            this.emit('delivery_error', {
                alertId: alert.id,
                error: error.message
            });

            throw new Error(`Alert delivery failed: ${error.message}`);
        }
    }

    /**
     * Format alert using templates
     */
    async formatAlert(alert, templates) {
        try {
            let formattedMessage;

            // Choose appropriate template based on alert type
            switch (alert.type) {
                case 'SETUP_ALERT':
                    formattedMessage = templates.formatSetupAlert(alert);
                    break;

                case 'DAILY_BIAS':
                    formattedMessage = templates.formatDailyBiasReport(alert);
                    break;

                case 'SESSION_REPORT':
                    formattedMessage = templates.formatSessionReport(alert);
                    break;

                case 'PERFORMANCE_SUMMARY':
                    formattedMessage = templates.formatPerformanceSummary(alert);
                    break;

                case 'ERROR_NOTIFICATION':
                    formattedMessage = templates.formatErrorNotification(alert);
                    break;

                default:
                    formattedMessage = templates.formatSimpleAlert(alert);
            }

            // Validate message structure
            this.validateDiscordMessage(formattedMessage);

            return formattedMessage;

        } catch (error) {
            throw new Error(`Message formatting failed: ${error.message}`);
        }
    }

    /**
     * Deliver formatted message to recipient
     */
    async deliverToRecipient(message, recipient, alert) {
        const { userId, preferences } = recipient;

        try {
            // Determine delivery channels
            const channels = this.getDeliveryChannels(preferences);

            const deliveryResults = [];

            for (const channel of channels) {
                // Check rate limiting
                if (!this.checkRateLimit(channel.id)) {
                    // Queue for later delivery
                    await this.queueMessage(channel.id, message, alert);
                    deliveryResults.push({
                        channel: channel.id,
                        success: true,
                        queued: true,
                        reason: 'Rate limited - queued for later'
                    });
                    continue;
                }

                // Attempt delivery
                const result = await this.deliverToChannel(message, channel, alert);
                deliveryResults.push(result);
            }

            return {
                userId,
                success: deliveryResults.some(r => r.success),
                channels: deliveryResults
            };

        } catch (error) {
            return {
                userId,
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get delivery channels based on preferences
     */
    getDeliveryChannels(preferences) {
        const channels = [];

        // Direct message channel
        if (preferences.deliveryChannels.includes('DM')) {
            channels.push({
                id: `dm_${preferences.userId}`,
                type: 'DM',
                webhook: this.config.webhooks.dm || this.config.webhooks.default
            });
        }

        // Public channels
        if (preferences.deliveryChannels.includes('ALERTS')) {
            channels.push({
                id: 'alerts',
                type: 'CHANNEL',
                webhook: this.config.webhooks.alerts
            });
        }

        if (preferences.deliveryChannels.includes('PREMIUM')) {
            channels.push({
                id: 'premium',
                type: 'CHANNEL',
                webhook: this.config.webhooks.premium
            });
        }

        return channels.filter(channel => channel.webhook);
    }

    /**
     * Deliver message to specific Discord channel
     */
    async deliverToChannel(message, channel, alert, retryCount = 0) {
        try {
            // Prepare webhook payload
            const payload = this.prepareWebhookPayload(message, channel);

            // Make HTTP request
            const response = await axios.post(channel.webhook, payload, {
                timeout: this.config.requestTimeout,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TJR-Trading-Bot/1.0'
                }
            });

            // Update rate limiting
            this.updateRateLimit(channel.id);

            // Update metrics
            this.deliveryMetrics.sent++;

            this.emit('message_sent', {
                alertId: alert.id,
                channelId: channel.id,
                responseStatus: response.status
            });

            return {
                channel: channel.id,
                success: true,
                status: response.status,
                messageId: response.data?.id
            };

        } catch (error) {
            return await this.handleDeliveryError(
                message,
                channel,
                alert,
                error,
                retryCount
            );
        }
    }

    /**
     * Handle delivery errors with retry logic
     */
    async handleDeliveryError(message, channel, alert, error, retryCount) {
        const { response } = error;

        // Check if this is a rate limit error
        if (response?.status === 429) {
            const retryAfter = parseInt(response.headers['retry-after']) * 1000 || 5000;

            this.deliveryMetrics.rateLimited++;

            // Queue message for retry after rate limit expires
            setTimeout(() => {
                this.queueMessage(channel.id, message, alert);
            }, retryAfter);

            return {
                channel: channel.id,
                success: false,
                rateLimited: true,
                retryAfter,
                error: 'Rate limited'
            };
        }

        // Check if we should retry
        if (retryCount < this.config.maxRetries && this.shouldRetry(error)) {
            const delay = this.calculateRetryDelay(retryCount);

            this.deliveryMetrics.retried++;

            setTimeout(async () => {
                await this.deliverToChannel(message, channel, alert, retryCount + 1);
            }, delay);

            return {
                channel: channel.id,
                success: false,
                retry: true,
                retryCount: retryCount + 1,
                retryDelay: delay,
                error: error.message
            };
        }

        // Failed permanently
        this.deliveryMetrics.failed++;

        this.emit('delivery_failed', {
            alertId: alert.id,
            channelId: channel.id,
            error: error.message,
            retryCount
        });

        return {
            channel: channel.id,
            success: false,
            error: error.message,
            retryCount,
            permanent: true
        };
    }

    /**
     * Prepare webhook payload for Discord
     */
    prepareWebhookPayload(message, channel) {
        const payload = {
            ...message,
            username: 'TJR Trading Bot',
            avatar_url: 'https://cdn.discordapp.com/attachments/123/456/avatar.png'
        };

        // Add thread ID for channel-specific threading
        if (channel.type === 'CHANNEL' && channel.threadId) {
            payload.thread_id = channel.threadId;
        }

        // Ensure embeds don't exceed Discord limits
        if (payload.embeds && payload.embeds.length > this.config.maxEmbedsPerMessage) {
            payload.embeds = payload.embeds.slice(0, this.config.maxEmbedsPerMessage);
        }

        return payload;
    }

    /**
     * Check rate limiting for channel
     */
    checkRateLimit(channelId) {
        const now = Date.now();
        const windowStart = now - this.config.rateLimitWindow;

        const rateLimitData = this.rateLimitTracking.get(channelId) || {
            messages: [],
            resetTime: now
        };

        // Remove old messages outside the window
        rateLimitData.messages = rateLimitData.messages.filter(
            timestamp => timestamp > windowStart
        );

        // Check if under limit
        return rateLimitData.messages.length < this.config.maxMessagesPerMinute;
    }

    /**
     * Update rate limiting tracking
     */
    updateRateLimit(channelId) {
        const now = Date.now();
        const rateLimitData = this.rateLimitTracking.get(channelId) || {
            messages: [],
            resetTime: now
        };

        rateLimitData.messages.push(now);
        this.rateLimitTracking.set(channelId, rateLimitData);
    }

    /**
     * Queue message for later delivery
     */
    async queueMessage(channelId, message, alert) {
        if (!this.messageQueue.has(channelId)) {
            this.messageQueue.set(channelId, []);
        }

        const queue = this.messageQueue.get(channelId);
        queue.push({
            message,
            alert,
            timestamp: Date.now(),
            retries: 0
        });

        this.emit('message_queued', {
            alertId: alert.id,
            channelId,
            queueLength: queue.length
        });

        // Enable batching if configured
        if (this.config.enableBatching) {
            this.scheduleBatchDelivery(channelId);
        }
    }

    /**
     * Schedule batch delivery
     */
    scheduleBatchDelivery(channelId) {
        // Clear existing timer
        if (this.batchTimers.has(channelId)) {
            clearTimeout(this.batchTimers.get(channelId));
        }

        // Set new timer
        const timer = setTimeout(() => {
            this.processBatchDelivery(channelId);
        }, this.config.batchWindow);

        this.batchTimers.set(channelId, timer);
    }

    /**
     * Process batch delivery for channel
     */
    async processBatchDelivery(channelId) {
        const queue = this.messageQueue.get(channelId);
        if (!queue || queue.length === 0) return;

        // Get messages for batch
        const batchSize = Math.min(queue.length, this.config.maxBatchSize);
        const batch = queue.splice(0, batchSize);

        if (batch.length === 1) {
            // Single message - deliver normally
            const { message, alert } = batch[0];
            const channels = [{ id: channelId, webhook: this.getWebhookForChannel(channelId) }];

            if (channels[0].webhook) {
                await this.deliverToChannel(message, channels[0], alert);
            }
        } else {
            // Multiple messages - create batch
            await this.deliverBatch(channelId, batch);
        }

        // Schedule next batch if queue not empty
        if (queue.length > 0) {
            this.scheduleBatchDelivery(channelId);
        } else {
            this.batchTimers.delete(channelId);
        }
    }

    /**
     * Deliver batch of messages
     */
    async deliverBatch(channelId, batch) {
        try {
            // Create batch message
            const batchMessage = this.createBatchMessage(batch);

            const channel = {
                id: channelId,
                webhook: this.getWebhookForChannel(channelId)
            };

            if (!channel.webhook) return;

            await this.deliverToChannel(
                batchMessage,
                channel,
                { id: 'batch_' + Date.now() }
            );

            this.deliveryMetrics.batched += batch.length;

            this.emit('batch_delivered', {
                channelId,
                messageCount: batch.length
            });

        } catch (error) {
            // If batch fails, queue individual messages
            const queue = this.messageQueue.get(channelId) || [];
            queue.unshift(...batch);
            this.messageQueue.set(channelId, queue);

            this.emit('batch_failed', {
                channelId,
                error: error.message,
                messageCount: batch.length
            });
        }
    }

    /**
     * Create batch message from multiple alerts
     */
    createBatchMessage(batch) {
        const alerts = batch.map(item => item.alert);

        // Use batch template
        const templates = require('./templates');
        const templateInstance = new templates();

        return templateInstance.formatBatchAlert(alerts);
    }

    /**
     * Get webhook URL for channel
     */
    getWebhookForChannel(channelId) {
        if (channelId.startsWith('dm_')) {
            return this.config.webhooks.dm || this.config.webhooks.default;
        }

        return this.config.webhooks[channelId] || this.config.webhooks.default;
    }

    /**
     * Start delivery processor
     */
    startDeliveryProcessor() {
        setInterval(() => {
            this.processQueuedMessages();
        }, 1000); // Process every second
    }

    /**
     * Process queued messages
     */
    async processQueuedMessages() {
        for (const [channelId, queue] of this.messageQueue) {
            if (queue.length === 0) continue;

            // Check if rate limit allows processing
            if (!this.checkRateLimit(channelId)) continue;

            // Process one message
            const queuedMessage = queue.shift();
            const { message, alert } = queuedMessage;

            const channel = {
                id: channelId,
                webhook: this.getWebhookForChannel(channelId)
            };

            if (channel.webhook) {
                await this.deliverToChannel(message, channel, alert);
            }
        }
    }

    /**
     * Validate Discord message structure
     */
    validateDiscordMessage(message) {
        // Check content length
        if (message.content && message.content.length > 2000) {
            throw new Error('Message content exceeds 2000 characters');
        }

        // Check embed limits
        if (message.embeds) {
            if (message.embeds.length > 10) {
                throw new Error('Too many embeds (max 10)');
            }

            for (const embed of message.embeds) {
                if (embed.description && embed.description.length > 4096) {
                    throw new Error('Embed description exceeds 4096 characters');
                }

                if (embed.fields && embed.fields.length > 25) {
                    throw new Error('Too many embed fields (max 25)');
                }
            }
        }
    }

    /**
     * Determine if error is retryable
     */
    shouldRetry(error) {
        const retryableStatuses = [408, 429, 500, 502, 503, 504];
        const status = error.response?.status;

        return retryableStatuses.includes(status) || !status; // Network errors
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    calculateRetryDelay(retryCount) {
        const delay = this.config.baseRetryDelay * Math.pow(2, retryCount);
        const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd

        return Math.min(delay + jitter, this.config.maxRetryDelay);
    }

    /**
     * Get delivery metrics
     */
    getDeliveryMetrics() {
        const totalAttempts = this.deliveryMetrics.sent + this.deliveryMetrics.failed;
        const successRate = totalAttempts > 0 ?
            this.deliveryMetrics.sent / totalAttempts : 0;

        return {
            ...this.deliveryMetrics,
            totalAttempts,
            successRate,
            queuedMessages: Array.from(this.messageQueue.values())
                .reduce((sum, queue) => sum + queue.length, 0)
        };
    }

    /**
     * Clear queued messages for channel
     */
    clearQueue(channelId) {
        if (this.messageQueue.has(channelId)) {
            const cleared = this.messageQueue.get(channelId).length;
            this.messageQueue.set(channelId, []);
            return cleared;
        }
        return 0;
    }

    /**
     * Add webhook URL
     */
    addWebhook(channelId, webhookUrl) {
        this.config.webhooks[channelId] = webhookUrl;
        this.emit('webhook_added', { channelId, webhookUrl });
    }

    /**
     * Remove webhook URL
     */
    removeWebhook(channelId) {
        delete this.config.webhooks[channelId];
        this.emit('webhook_removed', { channelId });
    }

    /**
     * Test webhook connectivity
     */
    async testWebhook(channelId, webhookUrl = null) {
        const webhook = webhookUrl || this.getWebhookForChannel(channelId);
        if (!webhook) {
            throw new Error('No webhook URL found for channel');
        }

        try {
            const testMessage = {
                content: '🟢 Webhook connectivity test successful!',
                embeds: [{
                    title: 'Connection Test',
                    description: 'This is a test message to verify webhook connectivity.',
                    color: 0x57F287,
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: 'TJR Trading Bot - System Test'
                    }
                }]
            };

            const response = await axios.post(webhook, testMessage, {
                timeout: this.config.requestTimeout,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                status: response.status,
                messageId: response.data?.id
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                status: error.response?.status
            };
        }
    }
}

module.exports = AlertDelivery;