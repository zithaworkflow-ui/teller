"use client";

import { useEffect, useState } from "react";

export default function GoogleLoginDialog({
  isOpen,
  onClose,
  onContinue,
  buttonLabel = "Continue with Google",
  description = "Sign in securely with your Google account.",
  showGoogleMark = true,
}: {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => Promise<void>;
  buttonLabel?: string;
  description?: string;
  showGoogleMark?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isLoading) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLoading, isOpen, onClose]);

  if (!isOpen) return null;

  async function continueWithGoogle() {
    setIsLoading(true);
    setError("");
    try {
      await onContinue();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Google sign-in could not be completed. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isLoading) onClose();
      }}
    >
      <section
        aria-labelledby="google-login-title"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6 text-white shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold" id="google-login-title">
              Log in to Teller AI
            </h2>
            <p className="mt-2 text-sm text-neutral-400">
              {description}
            </p>
          </div>
          <button
            aria-label="Close login"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-50"
            disabled={isLoading}
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <button
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-medium text-neutral-900 hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-70"
          disabled={isLoading}
          onClick={() => void continueWithGoogle()}
          type="button"
        >
          {showGoogleMark && (
            <span aria-hidden="true" className="font-bold text-base text-blue-600">
              G
            </span>
          )}
          {isLoading ? "Connecting..." : buttonLabel}
        </button>
        {error && (
          <p aria-live="polite" className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
