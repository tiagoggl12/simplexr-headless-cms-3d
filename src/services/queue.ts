export interface QueueJob {
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export class InMemoryQueue {
  private jobs: QueueJob[] = [];

  async enqueue(type: string, payload: Record<string, unknown>) {
    this.jobs.push({ type, payload, createdAt: new Date().toISOString() });
  }

  list() {
    return [...this.jobs];
  }
}
