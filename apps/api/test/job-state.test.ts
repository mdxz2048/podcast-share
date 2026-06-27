import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "../src/utils/job-state.js";

describe("import job state machine", () => {
  it("allows valid transitions", () => {
    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("running", "completed")).toBe(true);
    expect(canTransition("waiting_for_input", "running")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("completed", "running")).toBe(false);
    expect(() => assertTransition("failed", "running")).toThrow(/invalid job status transition/i);
  });
});
