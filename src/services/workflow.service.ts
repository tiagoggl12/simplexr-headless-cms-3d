/**
 * Workflow Service
 * Manages asset lifecycle workflow: draft → review → approved → published → archived
 */

import { randomBytes } from 'node:crypto';
import type {
  WorkflowStatus,
  WorkflowEvent,
  StatusChangeRequest,
  SubmitForReviewRequest,
  ReviewDecisionRequest,
  PublishRequest,
  UnpublishRequest,
  AssetWorkflowState,
  WorkflowValidationResult,
} from '../models/workflow.js';
import {
  DEFAULT_TRANSITIONS,
  getAllowedTransitions,
  hasRolePermission,
  validateTransition,
  getNextStatus,
  STATUS_DISPLAY,
} from '../models/workflow.js';

/**
 * User role for permissions
 */
export type UserRole = 'admin' | 'editor' | 'viewer';

/**
 * Workflow event data
 */
interface WorkflowEventData {
  id: string;
  assetId: string;
  fromStatus: WorkflowStatus;
  toStatus: WorkflowStatus;
  userId: string;
  userName?: string;
  comment?: string;
  timestamp: string;
}

/**
 * In-memory workflow store
 * In production, this would be PostgreSQL
 */
class WorkflowStore {
  private events = new Map<string, WorkflowEventData>();
  private eventsByAsset = new Map<string, WorkflowEventData[]>();

  // Events CRUD
  createEvent(
    assetId: string,
    fromStatus: WorkflowStatus,
    toStatus: WorkflowStatus,
    userId: string,
    userName?: string,
    comment?: string
  ): WorkflowEventData {
    const now = new Date().toISOString();
    const event: WorkflowEventData = {
      id: `wf_event_${randomBytes(16).toString('hex')}`,
      assetId,
      fromStatus,
      toStatus,
      userId,
      userName,
      comment,
      timestamp: now,
    };

    this.events.set(event.id, event);

    const assetEvents = this.eventsByAsset.get(assetId) || [];
    assetEvents.push(event);
    this.eventsByAsset.set(assetId, assetEvents);

    return event;
  }

  getEvent(id: string): WorkflowEventData | undefined {
    return this.events.get(id);
  }

  getEventsByAsset(assetId: string): WorkflowEventData[] {
    return (this.eventsByAsset.get(assetId) || []).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  deleteEventsByAsset(assetId: string): void {
    const events = this.eventsByAsset.get(assetId) || [];
    for (const event of events) {
      this.events.delete(event.id);
    }
    this.eventsByAsset.delete(assetId);
  }
}

/**
 * Asset status tracking (in production, this would be in Asset3D table)
 */
class AssetStatusStore {
  private statuses = new Map<string, WorkflowStatus>();

  setStatus(assetId: string, status: WorkflowStatus): void {
    this.statuses.set(assetId, status);
  }

  getStatus(assetId: string): WorkflowStatus | undefined {
    return this.statuses.get(assetId);
  }

  deleteStatus(assetId: string): void {
    this.statuses.delete(assetId);
  }
}

/**
 * Workflow Service
 */
export class WorkflowService {
  private store: WorkflowStore;
  private statusStore: AssetStatusStore;
  private transitions: WorkflowTransition[];

  constructor(transitions: WorkflowTransition[] = DEFAULT_TRANSITIONS) {
    this.store = new WorkflowStore();
    this.statusStore = new AssetStatusStore();
    this.transitions = transitions;
  }

  /**
   * Get current status of an asset
   */
  getStatus(assetId: string): WorkflowStatus {
    return this.statusStore.getStatus(assetId) || 'draft';
  }

  /**
   * Set status directly (for initialization)
   */
  setStatus(assetId: string, status: WorkflowStatus): void {
    this.statusStore.setStatus(assetId, status);
  }

  /**
   * Get workflow state for an asset
   */
  getWorkflowState(assetId: string, userRole: UserRole = 'viewer'): AssetWorkflowState {
    const status = this.getStatus(assetId);
    const events = this.store.getEventsByAsset(assetId);
    const canTransitionTo = getAllowedTransitions(status, userRole, this.transitions);

    return {
      assetId,
      status,
      canTransitionTo,
      lastEvent: events[0] as WorkflowEvent | undefined,
    };
  }

  /**
   * Validate if a transition is allowed
   */
  validateTransition(
    assetId: string,
    toStatus: WorkflowStatus,
    userRole: UserRole = 'viewer'
  ): WorkflowValidationResult {
    const fromStatus = this.getStatus(assetId);
    return validateTransition(fromStatus, toStatus, userRole, this.transitions);
  }

  /**
   * Change asset status
   */
  async changeStatus(
    assetId: string,
    request: StatusChangeRequest,
    userId: string,
    userName?: string,
    userRole: UserRole = 'editor'
  ): Promise<WorkflowEvent> {
    const fromStatus = this.getStatus(assetId);

    // Validate transition
    const validation = validateTransition(fromStatus, request.status, userRole, this.transitions);

    if (!validation.valid && !request.force) {
      const error = new Error(
        `Cannot transition from ${fromStatus} to ${request.status}: ${validation.errors?.join(', ')}`
      );
      (error as any).code = 'INVALID_TRANSITION';
      (error as any).details = validation;
      throw error;
    }

    // Create event
    const event = this.store.createEvent(
      assetId,
      fromStatus,
      request.status,
      userId,
      userName,
      request.comment
    );

    // Update status
    this.statusStore.setStatus(assetId, request.status);

    return event as WorkflowEvent;
  }

  /**
   * Submit asset for review
   */
  async submitForReview(
    assetId: string,
    request: SubmitForReviewRequest,
    userId: string,
    userName?: string
  ): Promise<WorkflowEvent> {
    return this.changeStatus(
      assetId,
      { status: 'review', comment: request.comment },
      userId,
      userName,
      'editor'
    );
  }

  /**
   * Approve or reject asset in review
   */
  async reviewDecision(
    assetId: string,
    request: ReviewDecisionRequest,
    userId: string,
    userName?: string
  ): Promise<WorkflowEvent> {
    const newStatus = request.approved ? 'approved' : 'rejected';
    const comment = request.approved
      ? request.comment
      : `Rejeitado: ${request.comment || 'Sem motivo especificado'}`;

    return this.changeStatus(
      assetId,
      { status: newStatus, comment },
      userId,
      userName,
      'admin'
    );
  }

  /**
   * Publish asset
   */
  async publish(
    assetId: string,
    request: PublishRequest,
    userId: string,
    userName?: string
  ): Promise<WorkflowEvent> {
    return this.changeStatus(
      assetId,
      {
        status: 'published',
        comment: request.comment || 'Asset publicado',
      },
      userId,
      userName,
      'admin'
    );
  }

  /**
   * Unpublish asset (return to draft)
   */
  async unpublish(
    assetId: string,
    request: UnpublishRequest,
    userId: string,
    userName?: string
  ): Promise<WorkflowEvent> {
    return this.changeStatus(
      assetId,
      {
        status: 'draft',
        comment: request.reason || 'Asset despublicado',
      },
      userId,
      userName,
      'admin'
    );
  }

  /**
   * Archive asset
   */
  async archive(
    assetId: string,
    userId: string,
    userName?: string,
    comment?: string
  ): Promise<WorkflowEvent> {
    return this.changeStatus(
      assetId,
      { status: 'archived', comment: comment || 'Asset arquivado' },
      userId,
      userName,
      'admin'
    );
  }

  /**
   * Delete asset (soft delete)
   */
  async deleteAsset(
    assetId: string,
    userId: string,
    userName?: string,
    comment?: string
  ): Promise<WorkflowEvent> {
    return this.changeStatus(
      assetId,
      { status: 'deleted', comment: comment || 'Asset deletado' },
      userId,
      userName,
      'admin'
    );
  }

  /**
   * Restore asset
   */
  async restore(
    assetId: string,
    userId: string,
    userName?: string
  ): Promise<WorkflowEvent> {
    return this.changeStatus(
      assetId,
      { status: 'draft', comment: 'Asset restaurado' },
      userId,
      userName,
      'admin'
    );
  }

  /**
   * Get workflow history for an asset
   */
  getHistory(assetId: string): WorkflowEvent[] {
    const events = this.store.getEventsByAsset(assetId);
    return events as WorkflowEvent[];
  }

  /**
   * Get all assets by status
   */
  getAssetsByStatus(
    status: WorkflowStatus,
    assetIds: string[]
  ): string[] {
    return assetIds.filter(id => this.getStatus(id) === status);
  }

  /**
   * Get assets awaiting review
   */
  getAwaitingReview(assetIds: string[]): string[] {
    return this.getAssetsByStatus('review', assetIds);
  }

  /**
   * Get published assets
   */
  getPublishedAssets(assetIds: string[]): string[] {
    return this.getAssetsByStatus('published', assetIds);
  }

  /**
   * Delete all workflow data for an asset
   */
  deleteAssetWorkflow(assetId: string): void {
    this.store.deleteEventsByAsset(assetId);
    this.statusStore.deleteStatus(assetId);
  }

  /**
   * Get status display info
   */
  getStatusDisplay(status: WorkflowStatus): { label: string; color: string; icon: string } {
    return STATUS_DISPLAY[status];
  }

  /**
   * Get next suggested status
   */
  getNextStatus(assetId: string): WorkflowStatus | null {
    const status = this.getStatus(assetId);
    return getNextStatus(status);
  }

  /**
   * Check if user has permission for action
   */
  hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
    return hasRolePermission(userRole, requiredRole);
  }

  /**
   * Get statistics
   */
  getStatistics(assetIds: string[]): Record<WorkflowStatus, number> {
    const stats: Record<string, number> = {};

    for (const status of Object.keys(STATUS_DISPLAY) as WorkflowStatus[]) {
      stats[status] = this.getAssetsByStatus(status, assetIds).length;
    }

    return stats as Record<WorkflowStatus, number>;
  }
}

/**
 * Service singleton
 */
let workflowServiceInstance: WorkflowService | null = null;

export function getWorkflowService(): WorkflowService {
  if (!workflowServiceInstance) {
    workflowServiceInstance = new WorkflowService();
  }
  return workflowServiceInstance;
}

export function createWorkflowService(transitions?: WorkflowTransition[]): WorkflowService {
  return new WorkflowService(transitions);
}
