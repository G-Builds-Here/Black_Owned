/**
 * Scrape Job Status Transition Tests
 *
 * Tests for status transition validation functions.
 */

import {
  isValidScrapeJobStatus,
  isValidStatusTransition,
  getAllowedTransitions,
  type ScrapeJobStatus,
} from "./scrape-job";

describe("Scrape Job Status Transitions", () => {
  describe("isValidScrapeJobStatus", () => {
    it("should return true for valid status values", () => {
      expect(isValidScrapeJobStatus("pending")).toBe(true);
      expect(isValidScrapeJobStatus("running")).toBe(true);
      expect(isValidScrapeJobStatus("completed")).toBe(true);
      expect(isValidScrapeJobStatus("failed")).toBe(true);
    });

    it("should return false for invalid status values", () => {
      expect(isValidScrapeJobStatus("")).toBe(false);
      expect(isValidScrapeJobStatus("unknown")).toBe(false);
      expect(isValidScrapeJobStatus("Pending")).toBe(false);
      expect(isValidScrapeJobStatus("in-progress")).toBe(false);
    });
  });

  describe("isValidStatusTransition", () => {
    describe("pending transitions", () => {
      it("should allow pending to running transition", () => {
        expect(isValidStatusTransition("pending", "running")).toBe(true);
      });

      it("should not allow pending to completed transition", () => {
        expect(isValidStatusTransition("pending", "completed")).toBe(false);
      });

      it("should not allow pending to failed transition", () => {
        expect(isValidStatusTransition("pending", "failed")).toBe(false);
      });

      it("should not allow pending to pending (no-op)", () => {
        expect(isValidStatusTransition("pending", "pending")).toBe(false);
      });
    });

    describe("running transitions", () => {
      it("should allow running to completed transition", () => {
        expect(isValidStatusTransition("running", "completed")).toBe(true);
      });

      it("should allow running to failed transition", () => {
        expect(isValidStatusTransition("running", "failed")).toBe(true);
      });

      it("should not allow running to pending transition", () => {
        expect(isValidStatusTransition("running", "pending")).toBe(false);
      });

      it("should not allow running to running (no-op)", () => {
        expect(isValidStatusTransition("running", "running")).toBe(false);
      });
    });

    describe("completed transitions", () => {
      it("should not allow completed to any other status", () => {
        expect(isValidStatusTransition("completed", "pending")).toBe(false);
        expect(isValidStatusTransition("completed", "running")).toBe(false);
        expect(isValidStatusTransition("completed", "failed")).toBe(false);
        expect(isValidStatusTransition("completed", "completed")).toBe(false);
      });
    });

    describe("failed transitions", () => {
      it("should not allow failed to any other status", () => {
        expect(isValidStatusTransition("failed", "pending")).toBe(false);
        expect(isValidStatusTransition("failed", "running")).toBe(false);
        expect(isValidStatusTransition("failed", "completed")).toBe(false);
        expect(isValidStatusTransition("failed", "failed")).toBe(false);
      });
    });
  });

  describe("getAllowedTransitions", () => {
    it("should return [running] for pending status", () => {
      expect(getAllowedTransitions("pending")).toEqual(["running"]);
    });

    it("should return [completed, failed] for running status", () => {
      expect(getAllowedTransitions("running")).toEqual(["completed", "failed"]);
    });

    it("should return empty array for completed status", () => {
      expect(getAllowedTransitions("completed")).toEqual([]);
    });

    it("should return empty array for failed status", () => {
      expect(getAllowedTransitions("failed")).toEqual([]);
    });
  });
});
