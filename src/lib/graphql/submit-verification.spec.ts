/**
 * Submit Verification Integration Tests
 *
 * Tests for the submitVerification GraphQL mutation.
 */

import { submitVerification } from "./resolvers";
import { MinioService } from "../minio/minio-service";

// Mock the MinioService
jest.mock("../minio/minio-service", () => {
  const mockPresignedUrls = [
    {
      url: "https://minio.bws.local/verification-docs/biz-123/license.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=test-signature-1",
      expiresInSeconds: 900,
      objectName: "biz-123/license.pdf",
      bucket: "verification-docs",
    },
    {
      url: "https://minio.bws.local/verification-docs/biz-123/tax.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=test-signature-2",
      expiresInSeconds: 900,
      objectName: "biz-123/tax.pdf",
      bucket: "verification-docs",
    },
  ];

  return {
    MinioService: jest.fn().mockImplementation(() => ({
      generatePresignedPutUrlsBatch: jest.fn().mockResolvedValue(mockPresignedUrls),
    })),
    createMinioServiceFromEnv: jest.fn().mockImplementation(() => ({
      generatePresignedPutUrlsBatch: jest.fn().mockResolvedValue(mockPresignedUrls),
    })),
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
    // Mock MinioService to throw an error
    const mockMinioService = {
      generatePresignedPutUrlsBatch: jest.fn()
        .mockRejectedValue(new Error("MinIO connection failed")),
    };

    (MinioService as jest.Mock).mockImplementation(() => mockMinioService);

    const result = await submitVerification(null, {
      businessId: "biz-error",
      fileNames: ["test.pdf"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("MinIO connection failed");
  });

  it("should handle generic error from MinIO service", async () => {
    const mockMinioService = {
      generatePresignedPutUrlsBatch: jest
        .mockRejectedValue("Unknown error"),
    };

    (MinioService as jest.Mock).mockImplementation(() => mockMinioService);

    const result = await submitVerification(null, {
      businessId: "biz-error",
      fileNames: ["test.pdf"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
