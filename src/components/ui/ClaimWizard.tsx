'use client';

import React, { useState, useCallback } from 'react';
import Modal from './Modal';
import Button from './Button';
import { useToast } from './Toast';

export interface Business {
  id: string;
  name: string;
  address?: string;
  verified: boolean;
  claimStatus?: 'unclaimed' | 'claimed' | 'rejected';
  previousRejectionReason?: string;
}

export interface ClaimWizardProps {
  business: Business | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (businessId: string, fileNames: string[]) => Promise<void>;
}

type WizardStep = 1 | 2 | 3;

/**
 * ClaimWizard component - 3-step wizard for claiming a business
 *
 * Step 1: Confirm ownership (display business info for verification)
 * Step 2: Document upload (PDF/image files, 10MB limit)
 * Step 3: Summary and submit
 */
export function ClaimWizard({ business, isOpen, onClose, onSubmit }: ClaimWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addToast } = useToast();

  const resetWizard = useCallback(() => {
    setCurrentStep(1);
    setUploadedFiles([]);
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    resetWizard();
    onClose();
  }, [onClose, resetWizard]);

  const handleNext = useCallback(() => {
    if (currentStep < 3) {
      setCurrentStep((step) => (step + 1) as WizardStep);
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((step) => (step - 1) as WizardStep);
    }
  }, [currentStep]);

  const handleSubmit = useCallback(async () => {
    if (!business || uploadedFiles.length === 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit(business.id, uploadedFiles);
      addToast('Claim request submitted - you\'ll hear back within 48 hours', {
        variant: 'success',
      });
      handleClose();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to submit claim', {
        variant: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [business, uploadedFiles, onSubmit, addToast, handleClose]);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const validFiles: string[] = [];
    const fileNames: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Check file type
      const isValidType =
        file.type === 'application/pdf' ||
        file.type.startsWith('image/') ||
        file.name.toLowerCase().endsWith('.pdf');

      if (!isValidType) {
        addToast(`${file.name}: Only PDF and image files are allowed`, { variant: 'warning' });
        continue;
      }

      // Check file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        addToast(`${file.name}: File size exceeds 10MB limit`, { variant: 'warning' });
        continue;
      }

      validFiles.push(file.name);
      fileNames.push(file.name);
    }

    setUploadedFiles((prev) => [...prev, ...fileNames]);
  }, [addToast]);

  const handleRemoveFile = useCallback((fileName: string) => {
    setUploadedFiles((prev) => prev.filter((name) => name !== fileName));
  }, []);

  // Check if business is already claimed
  const isAlreadyClaimed = business?.claimStatus === 'claimed';

  // Check if this is a reclaim after rejection
  const isReclaim = business?.claimStatus === 'rejected';

  // Step 1: Confirm ownership
  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="bg-neutral-50 rounded-lg p-6 border border-neutral-200">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
          Confirm you are the owner
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-neutral-500 mb-1">
              Business Name
            </label>
            <p className="text-neutral-900 font-medium">{business?.name}</p>
          </div>
          {business?.address && (
            <div>
              <label className="block text-sm font-medium text-neutral-500 mb-1">
                Business Address
              </label>
              <p className="text-neutral-900">{business.address}</p>
            </div>
          )}
        </div>
      </div>
      <p className="text-sm text-neutral-600">
        Please verify the information above is correct before proceeding with your claim.
      </p>
    </div>
  );

  // Step 2: Document upload
  const renderStep2 = () => (
    <div className="space-y-4">
      {isReclaim && business?.previousRejectionReason && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-amber-800 text-sm">
            Previous claim rejected: {business.previousRejectionReason} - please upload clearer documents
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-2">
          Upload supporting documents
        </label>
        <p className="text-sm text-neutral-500 mb-3">
          Accepted formats: PDF, JPG, PNG (max 10MB per file)
        </p>

        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-neutral-300 rounded-lg cursor-pointer hover:border-heritage-ochre hover:bg-neutral-50 transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <svg
              className="w-8 h-8 mb-2 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm text-neutral-500">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-neutral-400 mt-1">PDF or images only</p>
          </div>
          <input
            type="file"
            className="hidden"
            accept=".pdf,image/*"
            multiple
            onChange={handleFileSelect}
          />
        </label>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-700">
            Uploaded files ({uploadedFiles.length})
          </label>
          <ul className="space-y-1">
            {uploadedFiles.map((fileName) => (
              <li
                key={fileName}
                className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-neutral-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="text-sm text-neutral-700">{fileName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(fileName)}
                  className="text-neutral-400 hover:text-heritage-crimson transition-colors"
                  aria-label={`Remove ${fileName}`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  // Step 3: Summary
  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="bg-neutral-50 rounded-lg p-6 border border-neutral-200">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
          Claim Summary
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-neutral-500 mb-1">
              Business
            </label>
            <p className="text-neutral-900">{business?.name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-500 mb-1">
              Documents to submit
            </label>
            <ul className="space-y-1 mt-2">
              {uploadedFiles.map((fileName) => (
                <li key={fileName} className="flex items-center gap-2 text-sm text-neutral-700">
                  <svg
                    className="w-4 h-4 text-heritage-ochre"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {fileName}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <p className="text-sm text-neutral-600">
        By submitting, you confirm that the information provided is accurate and the documents are valid proof of ownership.
      </p>
    </div>
  );

  // Render already claimed message
  const renderAlreadyClaimed = () => (
    <div className="text-center py-8">
      <div className="text-neutral-400 text-5xl mb-4">!</div>
      <h3 className="text-xl font-semibold text-neutral-900 mb-3">
        This business has already been claimed
      </h3>
      <p className="text-neutral-600 mb-6">
        If you are the rightful owner, contact support.
      </p>
      <a
        href="mailto:support@blackowned.local"
        className="inline-flex items-center gap-2 text-heritage-ochre hover:text-heritage-terracotta transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        support@blackowned.local
      </a>
    </div>
  );

  // Step indicator
  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-6">
      {[1, 2, 3].map((step) => (
        <div key={step} className="flex items-center">
          <div
            className={`
              flex items-center justify-center w-8 h-8 rounded-full font-medium text-sm
              ${
                currentStep >= step
                  ? 'bg-heritage-ochre text-white'
                  : 'bg-neutral-200 text-neutral-500'
              }
            `}
          >
            {step}
          </div>
          {step < 3 && (
            <div
              className={`
                w-16 h-1 mx-2
                ${currentStep > step ? 'bg-heritage-ochre' : 'bg-neutral-200'}
              `}
            />
          )}
        </div>
      ))}
    </div>
  );

  // Step titles
  const stepTitles: Record<WizardStep, string> = {
    1: 'Confirm Ownership',
    2: 'Upload Documents',
    3: 'Review & Submit',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Claim Business"
      size="lg"
      closeOnBackdrop={!isSubmitting}
      footer={
        !isAlreadyClaimed && (
          <div className="flex justify-between w-full">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={currentStep === 1 || isSubmitting}
            >
              Back
            </Button>
            <div className="flex gap-3">
              <Button variant="tertiary" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              {currentStep < 3 ? (
                <Button
                  onClick={handleNext}
                  disabled={currentStep === 2 && uploadedFiles.length === 0 || isSubmitting}
                >
                  Next
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  isLoading={isSubmitting}
                  loadingText="Submitting..."
                  disabled={uploadedFiles.length === 0}
                >
                  Submit for Review
                </Button>
              )}
            </div>
          </div>
        )
      }
    >
      {isAlreadyClaimed ? (
        renderAlreadyClaimed()
      ) : (
        <div className="space-y-4">
          {renderStepIndicator()}
          <h4 className="text-lg font-semibold text-neutral-900">
            {stepTitles[currentStep]}
          </h4>
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
        </div>
      )}
    </Modal>
  );
}

export default ClaimWizard;
