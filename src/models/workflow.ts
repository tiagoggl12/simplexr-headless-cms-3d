/**
 * Asset Lifecycle Workflow Models
 * Implements approval workflow: draft → review → approved → published → archived
 */

/**
 * Extended asset status for workflow
 */
export type WorkflowStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'published'
  | 'archived'
  | 'deleted'
  | 'rejected';

/**
 * Transition action type
 */
export type TransitionAction = 'auto' | 'manual';

/**
 * Required role for a transition
 */
export type RequiredRole = 'admin' | 'editor' | 'viewer';

/**
 * Condition for workflow transition
 */
export interface WorkflowCondition {
  type: 'field_present' | 'field_equals' | 'tag_present' | 'no_rejected_variants' | 'custom';
  field?: string;
  value?: any;
  tags?: string[];
  customCheck?: string; // Function name for custom validation
}

/**
 * Valid workflow transition
 */
export interface WorkflowTransition {
  from: WorkflowStatus;
  to: WorkflowStatus;
  action: TransitionAction;
  requiredRole?: RequiredRole;
  conditions?: WorkflowCondition[];
}

/**
 * Workflow event - tracks status changes
 */
export interface WorkflowEvent {
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
 * Workflow transition request
 */
export interface StatusChangeRequest {
  status: WorkflowStatus;
  comment?: string;
  force?: boolean; // Skip condition checks if admin
}

/**
 * Workflow action requests
 */
export interface SubmitForReviewRequest {
  comment?: string;
}

export interface ReviewDecisionRequest {
  approved: boolean;
  comment?: string;
}

export interface PublishRequest {
  scheduledAt?: string; // ISO date string for scheduled publishing
  comment?: string;
}

export interface UnpublishRequest {
  reason?: string;
}

/**
 * Workflow state for an asset
 */
export interface AssetWorkflowState {
  assetId: string;
  status: WorkflowStatus;
  canTransitionTo: WorkflowStatus[];
  pendingApprovals?: string[]; // User IDs waiting for approval
  lastEvent?: WorkflowEvent;
}

/**
 * Workflow validation result
 */
export interface WorkflowValidationResult {
  valid: boolean;
  allowedTransitions: WorkflowStatus[];
  errors?: string[];
  conditions?: WorkflowCondition[];
}

/**
 * Default workflow transitions
 */
export const DEFAULT_TRANSITIONS: WorkflowTransition[] = [
  // Draft can go to review or deleted
  { from: 'draft', to: 'review', action: 'manual', requiredRole: 'editor' },
  { from: 'draft', to: 'deleted', action: 'manual', requiredRole: 'admin' },

  // Review can go to approved, rejected, or back to draft
  { from: 'review', to: 'approved', action: 'manual', requiredRole: 'admin' },
  { from: 'review', to: 'rejected', action: 'manual', requiredRole: 'admin' },
  { from: 'review', to: 'draft', action: 'manual', requiredRole: 'editor' },

  // Approved can go to published, back to review, or draft
  { from: 'approved', to: 'published', action: 'manual', requiredRole: 'admin' },
  { from: 'approved', to: 'review', action: 'manual', requiredRole: 'admin' },
  { from: 'approved', to: 'draft', action: 'manual', requiredRole: 'editor' },

  // Published can go to archived or back to draft
  { from: 'published', to: 'archived', action: 'manual', requiredRole: 'admin' },
  { from: 'published', to: 'draft', action: 'manual', requiredRole: 'admin' },

  // Rejected can go back to draft
  { from: 'rejected', to: 'draft', action: 'manual', requiredRole: 'editor' },

  // Archived can be restored to draft or deleted
  { from: 'archived', to: 'draft', action: 'manual', requiredRole: 'admin' },
  { from: 'archived', to: 'deleted', action: 'manual', requiredRole: 'admin' },

  // Deleted can be restored to draft (soft delete)
  { from: 'deleted', to: 'draft', action: 'manual', requiredRole: 'admin' },
];

/**
 * Status display metadata
 */
export const STATUS_DISPLAY: Record<WorkflowStatus, { label: string; color: string; icon: string }> = {
  draft: { label: 'Draft', color: '#9CA3AF', icon: '✏️' },
  review: { label: 'Under Review', color: '#F59E0B', icon: '👁️' },
  approved: { label: 'Approved', color: '#10B981', icon: '✅' },
  published: { label: 'Published', color: '#3B82F6', icon: '🌐' },
  archived: { label: 'Archived', color: '#6B7280', icon: '📦' },
  deleted: { label: 'Deleted', color: '#EF4444', icon: '🗑️' },
  rejected: { label: 'Rejected', color: '#EF4444', icon: '❌' },
};

/**
 * Get allowed transitions for a status
 */
export function getAllowedTransitions(
  currentStatus: WorkflowStatus,
  userRole: RequiredRole = 'viewer',
  transitions: WorkflowTransition[] = DEFAULT_TRANSITIONS
): WorkflowStatus[] {
  return transitions
    .filter(t => t.from === currentStatus && hasRolePermission(userRole, t.requiredRole))
    .map(t => t.to);
}

/**
 * Check if user has permission for role requirement
 */
export function hasRolePermission(userRole: RequiredRole, requiredRole?: RequiredRole): boolean {
  if (!requiredRole) return true;

  const roleHierarchy: Record<RequiredRole, number> = {
    viewer: 1,
    editor: 2,
    admin: 3,
  };

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

/**
 * Validate if a transition is allowed
 */
export function validateTransition(
  from: WorkflowStatus,
  to: WorkflowStatus,
  userRole: RequiredRole = 'viewer',
  transitions: WorkflowTransition[] = DEFAULT_TRANSITIONS
): WorkflowValidationResult {
  const transition = transitions.find(t => t.from === from && t.to === to);

  if (!transition) {
    return {
      valid: false,
      allowedTransitions: getAllowedTransitions(from, userRole, transitions),
      errors: [`Cannot transition from ${from} to ${to}`],
    };
  }

  if (!hasRolePermission(userRole, transition.requiredRole)) {
    return {
      valid: false,
      allowedTransitions: getAllowedTransitions(from, userRole, transitions),
      errors: [`Requires ${transition.requiredRole} role or higher`],
      conditions: transition.conditions,
    };
  }

  return {
    valid: true,
    allowedTransitions: getAllowedTransitions(from, userRole, transitions),
    conditions: transition.conditions,
  };
}

/**
 * Get next suggested status in workflow
 */
export function getNextStatus(currentStatus: WorkflowStatus): WorkflowStatus | null {
  const workflow: Record<WorkflowStatus, WorkflowStatus | null> = {
    draft: 'review',
    review: 'approved',
    approved: 'published',
    published: null,
    archived: null,
    deleted: null,
    rejected: 'draft',
  };

  return workflow[currentStatus];
}
