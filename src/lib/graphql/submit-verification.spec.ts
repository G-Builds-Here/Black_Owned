/**
 * Submit Verification Integration Tests
 *
 * Tests for the submitVerification GraphQL mutation.
 */

import { submitVerification } from "./resolvers";

// Mock the MinioService. The resolver maps the requested fileNames to
// `{businessId}/{fileName}` object names and asks MinIO for one presigned PUT
// URL per object name, so the batch mock returns one entry per object name it
// is given rather than a fixed array. Both MinioService and
// createMinioServiceFromEnv return the SAME instance so the resolver's
// module-level cached service references this mock; the error tests grab the
// exposed reference and make it throw to exercise the resolver's catch path.
jest.mock("../minio/minio-service", () => {
  const bucket = "verification-docs";
  const generatePresignedPutUrlsBatch = jest
    .fn()
    .mockImplementation(
      async (
        _bucket: string,
        objectNames: string[],
        expirySeconds: number
      ): Promise<Record<string, unknown>[]> =>
        objectNames.map((objectName) => ({
          url: `https://minio.bws.local/${bucket}/${objectName}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=test-signature`,
          expiresInSeconds: expirySeconds,
          objectName,
          bucket,
        }))
    );
  const instance = { generatePresignedPutUrlsBatch };

  return {
    MinioService: jest.fn().mockImplementation(() => instance),
    createMinioServiceFromEnv: jest.fn().mockImplementation(() => instance),
    // Expose the shared batch mock so tests can reconfigure it (e.g. make it
    // throw). Not part of the real module's public API.
    _sharedBatchMock: generatePresignedPutUrlsBatch,
  };
});

describe("submitVerification mutation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should generate presigned URLs for valid businessId and fileNames", async () => {
    const result = await submitVerification(null, {
      businessId: "biz-123",
      fileNames: ["license.pdf", "tax.pdf"],
    });

    expect(result.success).toBe(true);
    expect(result.presignedUrls).toBeDefined();
    expect(result.presignedUrls?.length).toBe(2);
    expect(result.presignedUrls?.[0].objectName).toBe("biz-123/license.pdf");
    expect(result.presignedUrls?.[1].objectName).toBe("biz-123/tax.pdf");
    expect(result.presignedUrls?.[0].expiresInSeconds).toBe(900);
  });

  it("should return error when businessId is missing", async () => {
    const result = await submitVerification(null, {
      businessId: "",
      fileNames: ["license.pdf"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("businessId");
    expect(result.presignedUrls).toBeUndefined();
  });

  it("should return error when businessId is whitespace only", async () => {
    const result = await submitVerification(null, {
      businessId: "   ",
      fileNames: ["license.pdf"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("businessId");
  });

  it("should return error when fileNames is empty array", async () => {
    const result = await submitVerification(null, {
      businessId: "biz-123",
      fileNames: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("fileNames");
  });

  it("should return error when fileNames is missing", async () => {
    const result = await submitVerification(null, {
      businessId: "biz-123",
      fileNames: [],
    } as any);

    expect(result.success).toBe(false);
    expect(result.error).toContain("fileNames");
  });

  it("should generate URLs with correct bucket path", async () => {
    const result = await submitVerification(null, {
      businessId: "biz-456",
      fileNames: ["document.pdf"],
    });

    expect(result.success).toBe(true);
    expect(result.presignedUrls?.[0].bucket).toBe("verification-docs");
    expect(result.presignedUrls?.[0].objectName).toBe("biz-456/document.pdf");
  });

  it("should handle single file upload", async () => {
    const result = await submitVerification(null, {
      businessId: "biz-789",
      fileNames: ["single-file.pdf"],
    });

    expect(result.success).toBe(true);
    expect(result.presignedUrls?.length).toBe(1);
    expect(result.presignedUrls?.[0].objectName).toBe("biz-789/single-file.pdf");
  });

  it("should handle many files in batch", async () => {
    const manyFiles = Array.from({ length: 10 }, (_, i) => `file-${i}.pdf`);

    const result = await submitVerification(null, {
      businessId: "biz-batch",
      fileNames: manyFiles,
    });

    expect(result.success).toBe(true);
    expect(result.presignedUrls?.length).toBe(10);
  });

  it("should handle error from MinIO service", async () => {
    // Make the resolver's cached MinIO service throw on this one call.
    const batchMock = (
      jest.requireMock("../minio/minio-service") as {
        _sharedBatchMock: jest.Mock;
      }
    )._sharedBatchMock;
    batchMock.mockRejectedValueOnce(new Error("MinIO connection failed"));

    const result = await submitVerification(null, {
      businessId: "biz-error",
      fileNames: ["test.pdf"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("MinIO connection failed");
  });

  it("should handle generic error from MinIO service", async () => {
    const batchMock = (
      jest.requireMock("../minio/minio-service") as {
        _sharedBatchMock: jest.Mock;
      }
    )._sharedBatchMock;
    batchMock.mockRejectedValueOnce(new Error("Unknown error"));

    const result = await submitVerification(null, {
      businessId: "biz-error",
      fileNames: ["test.pdf"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
