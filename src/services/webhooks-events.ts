import { randomUUID } from 'crypto';
import type { Asset3D, MaterialVariant } from '../models.js';

/**
 * Event types in the system
 */
export type SystemEventType =
  | 'asset.created'
  | 'asset.updated'
  | 'asset.deleted'
  | 'asset.status_changed'
  | 'asset.processing_started'
  | 'asset.processing_completed'
  | 'asset.processing_failed'
  | 'variant.created'
  | 'variant.updated'
  | 'variant.deleted'
  | 'batch_operation.completed'
  | 'batch_operation.failed'
  | 'system.error'
  | 'user.login'
  | 'user.logout'
  | 'webhook.created'
  | 'webhook.deleted'
  | 'webhook.updated';

/**
 * Event severity
 */
export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * System event
 */
export interface SystemEvent {
  id: string;
  type: SystemEventType;
  severity: EventSeverity;
  timestamp: string;
  data: Record<string, unknown>;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Webhook configuration
 */
export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: SystemEventType[]; // Events to subscribe to
  secret?: string; // HMAC secret for verification
  enabled: boolean;
  headers?: Record<string, string>; // Custom headers
  retryConfig?: RetryConfig;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt?: string;
  failureCount: number;
  lastFailure?: string;
}

/**
 * Webhook retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  retryDelay: number; // milliseconds
  backoffMultiplier: number;
  maxRetryDelay: number; // milliseconds
}

/**
 * Webhook delivery result
 */
export interface WebhookDelivery {
  webhookId: string;
  eventId: string;
  status: 'pending' | 'delivered' | 'failed';
  statusCode?: number;
  response?: string;
  attempt: number;
  timestamp: string;
  duration: number; // milliseconds
  error?: string;
}

/**
 * Event filter
 */
export interface EventFilter {
  types?: SystemEventType[];
  severity?: EventSeverity[];
  startDate?: string;
  endDate?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Webhooks and Events Service
 *
 * Manages system events and webhook notifications.
 * Provides event logging and external notifications.
 */
export class WebhooksEventsService {
  private events: SystemEvent[] = [];
  private webhooks: Map<string, Webhook> = new Map();
  private deliveries: WebhookDelivery[] = [];
  private eventHandlers: Map<SystemEventType, Array<(event: SystemEvent) => void>> = new Map();

  private readonly DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
    maxRetryDelay: 30000,
  };

  /**
   * Emit a system event
   *
   * @param type Event type
   * @param data Event data
   * @param severity Event severity
   * @param userId User ID
   * @param requestId Request ID for tracing
   * @returns Created event
   */
  emitEvent(
    type: SystemEventType,
    data: Record<string, unknown>,
    severity: EventSeverity = 'info',
    userId?: string,
    requestId?: string
  ): SystemEvent {
    const event: SystemEvent = {
      id: randomUUID(),
      type,
      severity,
      timestamp: new Date().toISOString(),
      data,
      userId,
      requestId,
    };

    this.events.push(event);

    // Log event
    this.logEvent(event);

    // Trigger registered handlers
    const handlers = this.eventHandlers.get(type) || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(`[Events] Handler error for ${type}:`, error);
      }
    }

    // Trigger webhooks
    this.triggerWebhooks(event).catch((err) => {
      console.error(`[Events] Webhook triggering failed for ${type}:`, err);
    });

    return event;
  }

  /**
   * Register an event handler
   *
   * @param type Event type
   * @param handler Handler function
   */
  on(type: SystemEventType, handler: (event: SystemEvent) => void): void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, []);
    }
    this.eventHandlers.get(type)!.push(handler);
    console.log(`[Events] Registered handler for ${type}`);
  }

  /**
   * Unregister an event handler
   *
   * @param type Event type
   * @param handler Handler function
   */
  off(type: SystemEventType, handler: (event: SystemEvent) => void): void {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Query events
   *
   * @param filter Event filter
   * @returns Array of events
   */
  getEvents(filter: EventFilter = {}): SystemEvent[] {
    let filtered = [...this.events];

    if (filter.types && filter.types.length > 0) {
      filtered = filtered.filter(e => filter.types!.includes(e.type));
    }

    if (filter.severity && filter.severity.length > 0) {
      filtered = filtered.filter(e => filter.severity!.includes(e.severity));
    }

    if (filter.userId) {
      filtered = filtered.filter(e => e.userId === filter.userId);
    }

    if (filter.startDate) {
      filtered = filtered.filter(e => e.timestamp >= filter.startDate!);
    }

    if (filter.endDate) {
      filtered = filtered.filter(e => e.timestamp <= filter.endDate!);
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Get event by ID
   *
   * @param eventId Event ID
   * @returns Event or undefined
   */
  getEvent(eventId: string): SystemEvent | undefined {
    return this.events.find(e => e.id === eventId);
  }

  /**
   * Create a webhook
   *
   * @param name Webhook name
   * @param url Webhook URL
   * @param events Events to subscribe to
   * @param secret Optional HMAC secret
   * @param headers Optional custom headers
   * @returns Created webhook
   */
  createWebhook(
    name: string,
    url: string,
    events: SystemEventType[],
    secret?: string,
    headers?: Record<string, string>
  ): Webhook {
    const webhook: Webhook = {
      id: randomUUID(),
      name,
      url,
      events,
      secret,
      enabled: true,
      headers,
      retryConfig: { ...this.DEFAULT_RETRY_CONFIG },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failureCount: 0,
    };

    this.webhooks.set(webhook.id, webhook);

    this.emitEvent('webhook.created', {
      webhookId: webhook.id,
      name: webhook.name,
      url: webhook.url,
    }, 'info');

    console.log(`[Webhooks] Created webhook ${webhook.id} for ${events.join(', ')}`);

    return webhook;
  }

  /**
   * Get webhook by ID
   *
   * @param webhookId Webhook ID
   * @returns Webhook or undefined
   */
  getWebhook(webhookId: string): Webhook | undefined {
    return this.webhooks.get(webhookId);
  }

  /**
   * List all webhooks
   *
   * @param enabledOnly Only return enabled webhooks
   * @returns Array of webhooks
   */
  listWebhooks(enabledOnly: boolean = false): Webhook[] {
    const all = Array.from(this.webhooks.values());
    return enabledOnly ? all.filter(w => w.enabled) : all;
  }

  /**
   * Update webhook
   *
   * @param webhookId Webhook ID
   * @param updates Updates to apply
   * @returns Updated webhook or undefined
   */
  updateWebhook(
    webhookId: string,
    updates: Partial<Omit<Webhook, 'id' | 'createdAt'>>
  ): Webhook | undefined {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      return undefined;
    }

    Object.assign(webhook, updates, {
      updatedAt: new Date().toISOString(),
    });

    this.webhooks.set(webhookId, webhook);

    console.log(`[Webhooks] Updated webhook ${webhookId}`);

    return webhook;
  }

  /**
   * Delete webhook
   *
   * @param webhookId Webhook ID
   * @returns True if deleted
   */
  deleteWebhook(webhookId: string): boolean {
    const deleted = this.webhooks.delete(webhookId);

    if (deleted) {
      this.emitEvent('webhook.deleted', {
        webhookId,
      }, 'info');

      console.log(`[Webhooks] Deleted webhook ${webhookId}`);
    }

    return deleted;
  }

  /**
   * Trigger webhooks for an event
   *
   * @param event System event
   */
  private async triggerWebhooks(event: SystemEvent): Promise<void> {
    const webhooks = this.listWebhooks(true).filter(w =>
      w.events.includes(event.type)
    );

    if (webhooks.length === 0) {
      return;
    }

    console.log(`[Webhooks] Triggering ${webhooks.length} webhook(s) for ${event.type}`);

    const promises = webhooks.map(webhook =>
      this.deliverWebhook(webhook, event)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Deliver webhook with retry logic
   *
   * @param webhook Webhook to deliver
   * @param event Event to deliver
   * @param attempt Attempt number
   * @param delay Delay before retry
   */
  private async deliverWebhook(
    webhook: Webhook,
    event: SystemEvent,
    attempt: number = 1,
    delay: number = 0
  ): Promise<void> {
    if (delay > 0) {
      await this.sleep(delay);
    }

    const startTime = Date.now();
    const delivery: WebhookDelivery = {
      webhookId: webhook.id,
      eventId: event.id,
      status: 'pending',
      attempt,
      timestamp: new Date().toISOString(),
      duration: 0,
    };

    try {
      // Prepare payload
      const payload = this.prepareWebhookPayload(webhook, event);

      // Send webhook
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-ID': webhook.id,
          'X-Event-ID': event.id,
          'X-Event-Type': event.type,
          'X-Timestamp': event.timestamp,
          ...webhook.headers,
        },
        body: JSON.stringify(payload),
      });

      const duration = Date.now() - startTime;
      delivery.duration = duration;
      delivery.statusCode = response.status;

      if (response.ok) {
        delivery.status = 'delivered';
        webhook.lastTriggeredAt = new Date().toISOString();
        webhook.failureCount = 0;

        console.log(
          `[Webhooks] Delivered ${event.type} to ${webhook.url} ` +
          `(${response.status}) in ${duration}ms`
        );
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      delivery.duration = duration;
      delivery.status = 'failed';
      delivery.error = String(error);

      webhook.failureCount++;
      webhook.lastFailure = new Date().toISOString();

      console.error(
        `[Webhooks] Failed to deliver ${event.type} to ${webhook.url}:`,
        error
      );

      // Retry logic
      const retryConfig = webhook.retryConfig || this.DEFAULT_RETRY_CONFIG;
      if (attempt < retryConfig.maxRetries) {
        const nextDelay = Math.min(
          retryConfig.retryDelay * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
          retryConfig.maxRetryDelay
        );

        console.log(`[Webhooks] Retrying in ${nextDelay}ms (attempt ${attempt + 1}/${retryConfig.maxRetries})`);

        return this.deliverWebhook(webhook, event, attempt + 1, nextDelay);
      }
    } finally {
      this.deliveries.push(delivery);
    }
  }

  /**
   * Prepare webhook payload with optional signature
   *
   * @param webhook Webhook configuration
   * @param event Event to deliver
   * @returns Payload object
   */
  private prepareWebhookPayload(webhook: Webhook, event: SystemEvent): Record<string, unknown> {
    const payload = {
      id: randomUUID(),
      webhookId: webhook.id,
      event: {
        id: event.id,
        type: event.type,
        severity: event.severity,
        timestamp: event.timestamp,
        data: event.data,
      },
      timestamp: new Date().toISOString(),
    };

    // Add signature if secret is configured
    if (webhook.secret) {
      const signature = this.generateSignature(payload, webhook.secret);
      (payload as any).signature = signature;
    }

    return payload;
  }

  /**
   * Generate HMAC signature for webhook payload
   *
   * @param payload Payload object
   * @param secret Secret key
   * @returns Hex signature
   */
  private generateSignature(payload: Record<string, unknown>, secret: string): string {
    // In production, use crypto.createHmac
    const payloadStr = JSON.stringify(payload);
    // Stub: return simple hash
    return Buffer.from(payloadStr + secret).toString('hex').slice(0, 32);
  }

  /**
   * Get webhook delivery history
   *
   * @param webhookId Webhook ID
   * @param limit Maximum deliveries to return
   * @returns Array of deliveries
   */
  getDeliveries(webhookId?: string, limit: number = 100): WebhookDelivery[] {
    let filtered = webhookId
      ? this.deliveries.filter(d => d.webhookId === webhookId)
      : this.deliveries;

    return filtered
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Test webhook
   *
   * @param webhookId Webhook ID
   * @returns Test delivery result
   */
  async testWebhook(webhookId: string): Promise<{
    success: boolean;
    statusCode?: number;
    error?: string;
  }> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      return { success: false, error: 'Webhook not found' };
    }

    const testEvent: SystemEvent = {
      id: randomUUID(),
      type: 'system.error',
      severity: 'info',
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        message: 'Webhook test delivery',
      },
    };

    try {
      await this.deliverWebhook(webhook, testEvent);
      const lastDelivery = this.deliveries[this.deliveries.length - 1];
      return {
        success: lastDelivery.status === 'delivered',
        statusCode: lastDelivery.statusCode,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Get statistics
   *
   * @returns Events and webhooks statistics
   */
  getStatistics(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    totalWebhooks: number;
    enabledWebhooks: number;
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    averageDeliveryTime: number;
  } {
    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};

    for (const event of this.events) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
    }

    const successfulDeliveries = this.deliveries.filter(d => d.status === 'delivered').length;
    const failedDeliveries = this.deliveries.filter(d => d.status === 'failed').length;
    const totalDeliveryTime = this.deliveries.reduce((sum, d) => sum + d.duration, 0);
    const averageDeliveryTime = this.deliveries.length > 0
      ? totalDeliveryTime / this.deliveries.length
      : 0;

    return {
      totalEvents: this.events.length,
      eventsByType,
      eventsBySeverity,
      totalWebhooks: this.webhooks.size,
      enabledWebhooks: Array.from(this.webhooks.values()).filter(w => w.enabled).length,
      totalDeliveries: this.deliveries.length,
      successfulDeliveries,
      failedDeliveries,
      averageDeliveryTime,
    };
  }

  /**
   * Clean up old events
   *
   * @param olderThan Delete events older than this (milliseconds)
   * @returns Number of events deleted
   */
  cleanupOldEvents(olderThan: number = 7 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - olderThan;
    const beforeLength = this.events.length;

    this.events = this.events.filter(e => new Date(e.timestamp).getTime() > cutoff);

    const deleted = beforeLength - this.events.length;
    if (deleted > 0) {
      console.log(`[Events] Cleaned up ${deleted} old event(s)`);
    }

    return deleted;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log event to console
   */
  private logEvent(event: SystemEvent): void {
    const prefix = {
      info: '[INFO]',
      warning: '[WARN]',
      error: '[ERROR]',
      critical: '[CRITICAL]',
    }[event.severity];

    console.log(
      `${prefix} [${event.type}] ` +
      `${event.userId ? `user=${event.userId} ` : ''}` +
      `${event.requestId ? `req=${event.requestId} ` : ''}` +
      `${JSON.stringify(event.data)}`
    );
  }
}

/**
 * Create a webhooks and events service instance
 */
export function createWebhooksEventsService(): WebhooksEventsService {
  return new WebhooksEventsService();
}
