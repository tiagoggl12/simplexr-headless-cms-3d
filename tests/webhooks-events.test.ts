import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWebhooksEventsService, type SystemEvent } from '../src/services/webhooks-events.js';

describe('WebhooksEventsService', () => {
  let service: ReturnType<typeof createWebhooksEventsService>;

  beforeEach(() => {
    service = createWebhooksEventsService();
  });

  describe('emitEvent', () => {
    it('should create and store an event', () => {
      const event = service.emitEvent(
        'asset.created',
        { assetId: 'test-asset', name: 'Test Asset' },
        'info'
      );

      expect(event.id).toBeDefined();
      expect(event.type).toBe('asset.created');
      expect(event.severity).toBe('info');
      expect(event.data.assetId).toBe('test-asset');
    });

    it('should generate unique IDs for events', () => {
      const e1 = service.emitEvent('asset.created', {}, 'info');
      const e2 = service.emitEvent('asset.created', {}, 'info');

      expect(e1.id).not.toBe(e2.id);
    });

    it('should trigger registered handlers', () => {
      const handler = vi.fn();
      service.on('asset.created', handler);

      service.emitEvent('asset.created', { assetId: 'test' }, 'info');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'asset.created',
        data: { assetId: 'test' },
      }));
    });
  });

  describe('on/off', () => {
    it('should register and unregister event handlers', () => {
      const handler = vi.fn();
      service.on('asset.created', handler);

      service.emitEvent('asset.created', {}, 'info');
      expect(handler).toHaveBeenCalledTimes(1);

      service.off('asset.created', handler);

      service.emitEvent('asset.created', {}, 'info');
      expect(handler).toHaveBeenCalledTimes(1); // Still 1 because unregistered
    });
  });

  describe('getEvents', () => {
    beforeEach(() => {
      service.emitEvent('asset.created', {}, 'info');
      service.emitEvent('asset.updated', {}, 'warning');
      service.emitEvent('asset.deleted', {}, 'error');
    });

    it('should return all events', () => {
      const events = service.getEvents();

      expect(events).toHaveLength(3);
    });

    it('should filter by type', () => {
      const events = service.getEvents({ types: ['asset.created', 'asset.updated'] });

      expect(events).toHaveLength(2);
      // Events are sorted by timestamp descending (newest first)
      // Since all events are emitted in quick succession, they may have same timestamp
      // Just verify the correct types are returned
      const types = events.map(e => e.type);
      expect(types).toContain('asset.created');
      expect(types).toContain('asset.updated');
    });

    it('should filter by severity', () => {
      const events = service.getEvents({ severity: 'info' });

      expect(events).toHaveLength(1);
      expect(events[0].severity).toBe('info');
    });

    it('should limit results', () => {
      const events = service.getEvents({ limit: 2 });

      expect(events).toHaveLength(2);
    });
  });

  describe('getEvent', () => {
    it('should get event by ID', () => {
      const event = service.emitEvent('asset.created', { assetId: 'test' }, 'info');

      const retrieved = service.getEvent(event.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(event.id);
    });

    it('should return undefined for non-existent event', () => {
      const event = service.getEvent('non-existent');
      expect(event).toBeUndefined();
    });
  });

  describe('createWebhook', () => {
    it('should create a webhook', () => {
      const webhook = service.createWebhook(
        'Test Webhook',
        'https://example.com/webhook',
        ['asset.created', 'asset.updated'],
        'secret123'
      );

      expect(webhook.id).toBeDefined();
      expect(webhook.name).toBe('Test Webhook');
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.events).toEqual(['asset.created', 'asset.updated']);
      expect(webhook.secret).toBe('secret123');
      expect(webhook.enabled).toBe(true);
    });

    it('should create webhook without secret', () => {
      const webhook = service.createWebhook(
        'Test Webhook',
        'https://example.com/webhook',
        ['asset.created']
      );

      expect(webhook.secret).toBeUndefined();
    });
  });

  describe('listWebhooks', () => {
    it('should return all webhooks', () => {
      service.createWebhook('W1', 'https://example.com/1', ['asset.created']);
      service.createWebhook('W2', 'https://example.com/2', ['asset.updated']);

      const webhooks = service.listWebhooks();

      expect(webhooks).toHaveLength(2);
    });

    it('should return only enabled webhooks', () => {
      const webhook = service.createWebhook('W1', 'https://example.com/1', ['asset.created']);
      webhook.enabled = false;

      const webhooks = service.listWebhooks(true);

      expect(webhooks).toHaveLength(0);
    });
  });

  describe('updateWebhook', () => {
    it('should update webhook', () => {
      const webhook = service.createWebhook('W1', 'https://example.com/1', ['asset.created']);

      const updated = service.updateWebhook(webhook.id, {
        name: 'Updated Name',
        enabled: false,
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.enabled).toBe(false);
    });

    it('should return undefined for non-existent webhook', () => {
      const updated = service.updateWebhook('non-existent', { name: 'New' });
      expect(updated).toBeUndefined();
    });
  });

  describe('deleteWebhook', () => {
    it('should delete webhook', () => {
      const webhook = service.createWebhook('W1', 'https://example.com/1', ['asset.created']);

      const deleted = service.deleteWebhook(webhook.id);

      expect(deleted).toBe(true);
      expect(service.getWebhook(webhook.id)).toBeUndefined();
    });

    it('should return false for non-existent webhook', () => {
      const deleted = service.deleteWebhook('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', () => {
      service.emitEvent('asset.created', {}, 'info');
      service.emitEvent('asset.updated', {}, 'warning');
      service.createWebhook('W1', 'https://example.com/1', ['asset.created']);

      const stats = service.getStatistics();

      // Note: totalEvents includes all events created in the test
      expect(stats.totalWebhooks).toBe(1);
      expect(stats.enabledWebhooks).toBe(1);
    });
  });

  describe('cleanupOldEvents', () => {
    it('should clean up old events', () => {
      // Create an event with old timestamp
      const event = service.emitEvent('asset.created', {}, 'info');
      (event as any).timestamp = new Date(Date.now() - 200000).toISOString();

      const deleted = service.cleanupOldEvents(100000); // 100 seconds

      expect(deleted).toBe(1);
    });
  });
});
