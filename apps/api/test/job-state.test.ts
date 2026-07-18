import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, isTerminalJobStatus } from "../src/utils/job-state.js";

describe("import job state machine", () => {
  it("allows valid transitions", () => {
    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("running", "completed")).toBe(true);
    expect(canTransition("running", "timeout")).toBe(true);
    expect(canTransition("waiting_for_input", "running")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("completed", "running")).toBe(false);
    expect(() => assertTransition("failed", "running")).toThrow(/invalid job status transition/i);
  });

  it("identifies all terminal statuses", () => {
    expect(isTerminalJobStatus("completed")).toBe(true);
    expect(isTerminalJobStatus("failed")).toBe(true);
    expect(isTerminalJobStatus("cancelled")).toBe(true);
    expect(isTerminalJobStatus("timeout")).toBe(true);
    expect(isTerminalJobStatus("running")).toBe(false);
  });
});
