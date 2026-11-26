"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { User } from "@auth0/auth0-react";
import { COUNTRY_OPTIONS } from "@/lib/country-options";

export default function ProfileSetupDialog({
  user,
  isAuthenticated,
  isLoading,
  getAccessTokenSilently,
}: {
  user?: User;
  isAuthenticated: boolean;
  isLoading: boolean;
  getAccessTokenSilently: () => Promise<string>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [country, setCountry] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("US");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      return;
    }

    let active = true;
    const loadProfile = async () => {
      try {
        const token = await getAccessTokenSilently();
        const response = await fetch(`/api/account?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) return;
        const account = await response.json();
        if (!active) return;

        const resolvedFirstName = account.firstName || user?.given_name || "";
        const resolvedSurname = account.surname || user?.family_name || "";
        const resolvedCountry = account.country || "";

        setFirstName(resolvedFirstName);
        setSurname(resolvedSurname);
        setCountry(resolvedCountry);
        setPhoneCountry(account.phoneCountry || "US");
        setPhoneNumber(account.phoneNumber || "");
        setHasLoaded(true);

        if (!resolvedFirstName || !resolvedSurname || !resolvedCountry) {
          setIsOpen(true);
        } else {
          setIsOpen(false);
        }
      } catch {
        if (active) setHasLoaded(true);
      }
    };

    void loadProfile();
    return () => {
      active = false;
    };
  }, [getAccessTokenSilently, isAuthenticated, isLoading, user?.sub, user?.given_name, user?.family_name]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const trimmedFirstName = firstName.trim();
    const trimmedSurname = surname.trim();
    if (!trimmedFirstName || !trimmedSurname || !country) {
      setError("Enter your name, surname, and location.");
      return;
    }

    setIsSaving(true);
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: trimmedFirstName,
          surname: trimmedSurname,
          country,
          phoneCountry,
          phoneNumber,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || result.error || "Could not update profile.");

      setFirstName(result.firstName);
      setSurname(result.surname);
      setCountry(result.country);
      setPhoneCountry(result.phoneCountry);
      setPhoneNumber(result.phoneNumber);
      window.dispatchEvent(new CustomEvent("teller:profile-updated", {
        detail: { firstName: result.firstName, surname: result.surname },
      }));
      setIsOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update profile.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!isAuthenticated || isLoading || !isOpen || !hasLoaded) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setIsOpen(false);
      }}
    >
      <section
        aria-labelledby="profile-setup-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 text-white shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold" id="profile-setup-title">
              Complete your profile
            </h2>
            <p className="mt-2 text-sm text-neutral-400">
              Update your name and location to personalize Teller.
            </p>
          </div>
          <button
            aria-label="Close profile dialog"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={(event) => void saveProfile(event)}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm text-neutral-300">
              <span className="mb-1.5 block">Name</span>
              <input
                autoComplete="given-name"
                maxLength={60}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                disabled={isSaving}
                className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-white outline-none focus:border-white disabled:opacity-60"
              />
            </label>
            <label className="block text-sm text-neutral-300">
              <span className="mb-1.5 block">Surname</span>
              <input
                autoComplete="family-name"
                maxLength={60}
                value={surname}
                onChange={(event) => setSurname(event.target.value)}
                disabled={isSaving}
                className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-white outline-none focus:border-white disabled:opacity-60"
              />
            </label>
          </div>

          <label className="block text-sm text-neutral-300">
            <span className="mb-1.5 block">Location</span>
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              disabled={isSaving}
              className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-white outline-none focus:border-white disabled:opacity-60"
            >
              <option value="">Select a country</option>
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>{option.name}</option>
              ))}
            </select>
          </label>

          {error && (
            <p aria-live="polite" className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <button
            className="h-10 w-full rounded-md bg-white px-4 text-sm font-semibold text-neutral-950 hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "Saving..." : "Save profile"}
          </button>
        </form>
      </section>
    </div>
  );
}
