/**
 * Workflow Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createWorkflowService } from '../src/services/workflow.service.js';

describe('WorkflowService', () => {
  let service: ReturnType<typeof createWorkflowService>;

  beforeEach(() => {
    service = createWorkflowService();
  });

  describe('Initial State', () => {
    it('should have draft as default status', () => {
      const state = service.getStatus('asset-123');
      expect(state).toBe('draft');
    });

    it('should get workflow state for asset', () => {
      const state = service.getWorkflowState('asset-123', 'editor');
      expect(state.assetId).toBe('asset-123');
      expect(state.status).toBe('draft');
      expect(state.canTransitionTo).toContain('review');
    });
  });

  describe('Status Transitions', () => {
    it('should allow draft to review transition for editor', async () => {
      const event = await service.submitForReview('asset-123', {}, 'user-1', 'Editor User');
      expect(event.toStatus).toBe('review');

      const state = service.getStatus('asset-123');
      expect(state).toBe('review');
    });

    it('should allow review to approved transition for admin', async () => {
      await service.submitForReview('asset-123', {}, 'user-1', 'Editor User');

      const event = await service.reviewDecision(
        'asset-123',
        { approved: true, comment: 'Looks good' },
        'admin-1',
        'Admin'
      );

      expect(event.toStatus).toBe('approved');
      expect(service.getStatus('asset-123')).toBe('approved');
    });

    it('should allow approved to published transition for admin', async () => {
      await service.submitForReview('asset-123', {}, 'user-1', 'Editor');
      await service.reviewDecision('asset-123', { approved: true }, 'admin-1', 'Admin');

      const event = await service.publish('asset-123', {}, 'admin-1', 'Admin');
      expect(event.toStatus).toBe('published');
    });

    it('should reject invalid transition for insufficient role', async () => {
      service.setStatus('asset-123', 'approved');

      await expect(
        service.changeStatus(
          'asset-123',
          { status: 'published' },
          'user-1',
          'Editor',
          'editor'
        )
      ).rejects.toThrow();
    });

    it('should allow reject decision', async () => {
      await service.submitForReview('asset-123', {}, 'user-1', 'Editor');

      const event = await service.reviewDecision(
        'asset-123',
        { approved: false, comment: 'Needs more work' },
        'admin-1',
        'Admin'
      );

      expect(event.toStatus).toBe('rejected');
    });

    it('should allow rejected to go back to draft', async () => {
      service.setStatus('asset-123', 'rejected');

      const event = await service.restore('asset-123', 'user-1', 'Editor');
      expect(event.toStatus).toBe('draft');
    });
  });

  describe('Workflow Actions', () => {
    it('should unpublish asset', async () => {
      service.setStatus('asset-123', 'published');

      const event = await service.unpublish('asset-123', { reason: 'Temporarily unavailable' }, 'admin-1');
      expect(event.toStatus).toBe('draft');
    });

    it('should archive asset', async () => {
      service.setStatus('asset-123', 'published');

      const event = await service.archive('asset-123', 'admin-1', 'Admin', 'Old version');
      expect(event.toStatus).toBe('archived');
    });

    it('should restore archived asset', async () => {
      service.setStatus('asset-123', 'archived');

      const event = await service.restore('asset-123', 'admin-1', 'Admin');
      expect(event.toStatus).toBe('draft');
    });

    it('should delete asset', async () => {
      service.setStatus('asset-123', 'draft');

      const event = await service.deleteAsset('asset-123', 'admin-1', 'Admin', 'No longer needed');
      expect(event.toStatus).toBe('deleted');
    });
  });

  describe('Workflow History', () => {
    it('should track status changes in history', async () => {
      await service.submitForReview('asset-history', { comment: 'Ready for review' }, 'user-1', 'Editor');
      await service.reviewDecision('asset-history', { approved: true }, 'admin-1', 'Admin');
      await service.publish('asset-history', {}, 'admin-1', 'Admin');

      const history = service.getHistory('asset-history');
      expect(history).toHaveLength(3);
      // Most recent is first (descending order)
      expect(history[0].fromStatus).toBe('approved');
      expect(history[0].toStatus).toBe('published');
    });

    it('should preserve comments in history', async () => {
      const comment = 'Please review the materials';

      await service.submitForReview('asset-123', { comment }, 'user-1', 'Editor');

      const history = service.getHistory('asset-123');
      expect(history[0].comment).toBe(comment);
    });
  });

  describe('Allowed Transitions', () => {
    it('should return allowed transitions for draft', () => {
      const state = service.getWorkflowState('asset-123', 'editor');
      expect(state.canTransitionTo).toContain('review');
      expect(state.canTransitionTo).not.toContain('published');
    });

    it('should return different transitions for admin', () => {
      const editorState = service.getWorkflowState('asset-123', 'editor');
      const adminState = service.getWorkflowState('asset-123', 'admin');

      expect(adminState.canTransitionTo.length).toBeGreaterThanOrEqual(editorState.canTransitionTo.length);
    });

    it('should validate transition before executing', () => {
      const validation = service.validateTransition('asset-123', 'published', 'viewer');

      expect(validation.valid).toBe(false);
      expect(validation.allowedTransitions).toBeDefined();
    });
  });

  describe('Status Display', () => {
    it('should provide display info for each status', () => {
      const draftDisplay = service.getStatusDisplay('draft');
      expect(draftDisplay.label).toBe('Draft');
      expect(draftDisplay.icon).toBe('✏️');

      const publishedDisplay = service.getStatusDisplay('published');
      expect(publishedDisplay.label).toBe('Published');
      expect(publishedDisplay.icon).toBe('🌐');
    });
  });

  describe('Next Status', () => {
    it('should suggest next status in workflow', () => {
      expect(service.getNextStatus('asset-123')).toBe('review');

      service.setStatus('asset-123', 'review');
      expect(service.getNextStatus('asset-123')).toBe('approved');

      service.setStatus('asset-123', 'approved');
      expect(service.getNextStatus('asset-123')).toBe('published');

      service.setStatus('asset-123', 'published');
      expect(service.getNextStatus('asset-123')).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should calculate statistics for assets', () => {
      const assetIds = ['a1', 'a2', 'a3', 'a4'];

      service.setStatus('a1', 'published');
      service.setStatus('a2', 'published');
      service.setStatus('a3', 'review');
      // a4 remains draft

      const stats = service.getStatistics(assetIds);

      expect(stats.draft).toBe(1);
      expect(stats.review).toBe(1);
      expect(stats.published).toBe(2);
    });
  });

  describe('Filtering', () => {
    it('should get assets awaiting review', () => {
      const assetIds = ['a1', 'a2', 'a3', 'a4'];

      service.setStatus('a1', 'review');
      service.setStatus('a2', 'review');
      service.setStatus('a3', 'approved');
      service.setStatus('a4', 'draft');

      const awaiting = service.getAwaitingReview(assetIds);
      expect(awaiting).toHaveLength(2);
      expect(awaiting).toContain('a1');
      expect(awaiting).toContain('a2');
    });

    it('should get published assets', () => {
      const assetIds = ['a1', 'a2', 'a3'];

      service.setStatus('a1', 'published');
      service.setStatus('a2', 'published');
      service.setStatus('a3', 'archived');

      const published = service.getPublishedAssets(assetIds);
      expect(published).toHaveLength(2);
    });
  });
});
