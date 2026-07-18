export type JobStatus =
  | "queued"
  | "waiting_for_input"
  | "waiting_for_auth"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

const transitions: Record<JobStatus, JobStatus[]> = {
  queued: ["running", "waiting_for_input", "waiting_for_auth", "failed", "cancelled", "timeout"],
  waiting_for_input: ["running", "failed", "cancelled", "timeout"],
  waiting_for_auth: ["running", "failed", "cancelled", "timeout"],
  running: ["completed", "failed", "cancelled", "timeout", "waiting_for_input", "waiting_for_auth"],
  completed: [],
  failed: [],
  cancelled: [],
  timeout: []
};

export function isTerminalJobStatus(status: JobStatus): boolean {
  return transitions[status].length === 0;
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`invalid job status transition: ${from} -> ${to}`);
  }
}
