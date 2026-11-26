"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import metallicTEmblem from "../Futuristic Metallic T Emblem.png";

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
          <div className="flex items-start gap-3">
            <Image
              src={metallicTEmblem}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
            <div>
              <h2 className="text-xl font-semibold" id="google-login-title">
                Log in to Teller
              </h2>
              <p className="mt-2 text-sm text-neutral-400">
                {description}
              </p>
            </div>
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
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-neutral-300 bg-white/95 px-4 py-3 text-sm font-semibold text-neutral-900 shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur transition hover:-translate-y-0.5 hover:border-neutral-200 hover:bg-white hover:shadow-[0_12px_28px_rgba(0,0,0,0.24)] disabled:cursor-wait disabled:translate-y-0 disabled:opacity-70"
          disabled={isLoading}
          onClick={() => void continueWithGoogle()}
          type="button"
        >
          {showGoogleMark && (
            <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.24-.16-1.82H9v3.44h4.84a4.14 4.14 0 0 1-1.8 2.72v2.27h2.92c1.71-1.57 2.68-3.89 2.68-6.61Z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34A9 9 0 0 0 9 18Z" />
              <path fill="#FBBC05" d="M3.97 10.7A5.41 5.41 0 0 1 3.69 9c0-.59.1-1.16.28-1.7V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.34Z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A8.65 8.65 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z" />
            </svg>
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
