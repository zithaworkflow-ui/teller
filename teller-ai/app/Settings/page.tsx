"use client";

import { useAppAuth } from "@/components/Auth0Provider";
import { LoaderCircle, Upload } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import PayPalUpgradeButton from "@/components/PayPalUpgradeButton";
import { COUNTRY_OPTIONS, PHONE_CODE_OPTIONS, countryFlag, splitInternationalPhone } from "@/lib/country-options";
import { prepareVoicePrompt } from "@/lib/voice-prompt-client";
import { isVoicePromptManager, VOICE_PROMPT_MANAGER_EMAIL } from "@/lib/voice-prompt-access";

export default function SettingsPage() {
  const { user, isAuthenticated, isLoading, loginWithRedirect, logout, getAccessTokenSilently } = useAppAuth();
  const canManageVoiceSample = isVoicePromptManager(user?.email, user?.email_verified);
  const accountId = user?.sub || user?.email || "guest";
  const preferencesKey = `teller_preferences:${accountId}`;
  const [monthlyChatCount, setMonthlyChatCount] = useState(0);
  const [planName, setPlanName] = useState("Free");
  const [usageLimit, setUsageLimit] = useState(100);
  const [aiResponsesEnabled, setAiResponsesEnabled] = useState(true);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [saveMessage, setSaveMessage] = useState("");
  const [firstName, setFirstName] = useState(user?.given_name || user?.name?.split(" ")[0] || "");
  const [surname, setSurname] = useState(user?.family_name || user?.name?.split(" ").slice(1).join(" ") || "");
  const [country, setCountry] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("US");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingVoiceSample, setIsUploadingVoiceSample] = useState(false);
  const [isPreparingVoiceSample, setIsPreparingVoiceSample] = useState(false);
  const [voiceSampleMessage, setVoiceSampleMessage] = useState("");
  const [voiceSampleError, setVoiceSampleError] = useState("");

  const accountProfile = {
    name: [firstName, surname].filter(Boolean).join(" ") || user?.name || "Teller User",
    email: user?.email || "user@example.com",
    picture:
      user?.picture ||
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
  };

  useEffect(() => {
    try {
      const storedPreferences = JSON.parse(localStorage.getItem(preferencesKey) || "null");
      if (storedPreferences) {
        setAiResponsesEnabled(storedPreferences.aiResponsesEnabled ?? true);
        setAutoScrollEnabled(storedPreferences.autoScrollEnabled ?? true);
      }
    } catch {
      setAiResponsesEnabled(true);
      setAutoScrollEnabled(true);
    }
  }, [preferencesKey]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const loadAccount = async () => {
      try {
        const token = await getAccessTokenSilently();
        const response = await fetch(`/api/account?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) return;
        const account = await response.json();
        setFirstName(account.firstName || user?.given_name || account.name?.split(" ")[0] || "");
        setSurname(account.surname || user?.family_name || account.name?.split(" ").slice(1).join(" ") || "");
        setCountry(account.country || "");
        const parsedPhone = splitInternationalPhone(account.phone || "");
        const matchedPhoneCountry = PHONE_CODE_OPTIONS.find(
          (option) => option.code === account.phoneCountry && option.dialCode === parsedPhone.phoneCountryCode,
        );
        const selectedPhoneCountry = matchedPhoneCountry || PHONE_CODE_OPTIONS.find(
          (option) => option.dialCode === parsedPhone.phoneCountryCode,
        );
        setPhoneCountry(selectedPhoneCountry?.code || "US");
        setPhoneNumber(parsedPhone.phoneNumber);
        setPlanName(account.plan);
        setUsageLimit(account.usageLimit);
        if (Number.isInteger(account.usageCount)) setMonthlyChatCount(account.usageCount);
      } catch {
      }
    };

    void loadAccount();
    window.addEventListener("focus", loadAccount);
    window.addEventListener("pageshow", loadAccount);
    return () => {
      window.removeEventListener("focus", loadAccount);
      window.removeEventListener("pageshow", loadAccount);
    };
  }, [getAccessTokenSilently, isAuthenticated, isLoading, user]);

  async function saveProfile() {
    setIsSavingProfile(true);
    setProfileMessage("");
    setProfileError("");

    try {
      const token = await getAccessTokenSilently();
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ firstName, surname, country, phoneCountry, phoneNumber }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || result.error || "Could not update profile.");
      setFirstName(result.firstName);
      setSurname(result.surname);
      setCountry(result.country);
      setPhoneCountry(result.phoneCountry);
      setPhoneNumber(result.phoneNumber);
      setProfileMessage("Profile saved");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Could not update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function uploadVoiceSample(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsUploadingVoiceSample(true);
    setIsPreparingVoiceSample(true);
    setVoiceSampleMessage("");
    setVoiceSampleError("");
    try {
      const voicePrompt = await prepareVoicePrompt(file);
      setIsPreparingVoiceSample(false);
      const token = await getAccessTokenSilently();
      const formData = new FormData();
      formData.append("voiceSample", voicePrompt, "voice-prompt.wav");
      const response = await fetch("/api/speech/voice-prompt", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not upload the voice sample.");
      setVoiceSampleMessage("First 10 seconds prepared and saved to PostgreSQL.");
    } catch (error) {
      setVoiceSampleError(error instanceof Error ? error.message : "Could not upload the voice sample.");
    } finally {
      setIsUploadingVoiceSample(false);
      setIsPreparingVoiceSample(false);
    }
  }

  function saveSettings() {
    localStorage.setItem(
      preferencesKey,
      JSON.stringify({ aiResponsesEnabled, autoScrollEnabled }),
    );
    setSaveMessage("Settings saved");
    window.setTimeout(() => setSaveMessage(""), 2500);
  }

  if (isLoading) {
    return <main className="min-h-screen bg-neutral-950 px-6 py-10 text-white">Loading account...</main>;
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-4">
          <img
            src={accountProfile.picture}
            alt={accountProfile.name}
            className="h-14 w-14 rounded-full object-cover"
          />
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-neutral-400">
              Profile
            </p>
            <h1 className="text-3xl font-bold">Account Settings</h1>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
            <h2 className="text-lg font-semibold">Personal details</h2>
            <div className="mt-4 space-y-4 text-sm text-neutral-300">
              <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block">Name</span>
                  <input
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    disabled={!isAuthenticated || isSavingProfile}
                    className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-white outline-none focus:border-white disabled:opacity-60"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block">Surname</span>
                  <input
                    autoComplete="family-name"
                    value={surname}
                    onChange={(event) => setSurname(event.target.value)}
                    disabled={!isAuthenticated || isSavingProfile}
                    className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-white outline-none focus:border-white disabled:opacity-60"
                  />
                </label>
              </div>
              <div className="border-b border-neutral-800 pb-3">
                <span>Email</span>
                <span className="float-right text-neutral-100">{accountProfile.email}</span>
              </div>
              <label className="block max-w-xl">
                <span className="mb-1.5 block">Country</span>
                <select
                  value={country}
                  onChange={(event) => {
                    setCountry(event.target.value);
                    const selectedCountry = COUNTRY_OPTIONS.find((option) => option.code === event.target.value);
                    if (selectedCountry) setPhoneCountry(selectedCountry.code);
                  }}
                  disabled={!isAuthenticated || isSavingProfile}
                  className="h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-white outline-none focus:border-white disabled:opacity-60"
                >
                  <option value="">Select a country</option>
                  {COUNTRY_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>{option.name}</option>
                  ))}
                </select>
              </label>
              <div className="max-w-xl">
                <label className="mb-1.5 block" htmlFor="phone-number">Phone</label>
                <div className="flex max-w-md gap-2">
                  <select
                    aria-label="Phone country calling code"
                    value={phoneCountry}
                    onChange={(event) => setPhoneCountry(event.target.value)}
                    disabled={!isAuthenticated || isSavingProfile}
                    className="h-9 w-36 shrink-0 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-white outline-none focus:border-white disabled:opacity-60"
                  >
                    {PHONE_CODE_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {countryFlag(option.code)} {option.dialCode} {option.name}
                      </option>
                    ))}
                  </select>
                  <input
                    id="phone-number"
                    type="tel"
                    autoComplete="tel-national"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    disabled={!isAuthenticated || isSavingProfile}
                    placeholder="Phone number"
                    className="h-9 min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-white outline-none focus:border-white disabled:opacity-60"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span>Plan</span>
                <span className="text-neutral-100">{planName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Chats this month</span>
                <span className="text-neutral-100">{monthlyChatCount}/{usageLimit}</span>
              </div>
            </div>
            {isAuthenticated && (
              <div className="mt-4 flex items-center justify-end gap-3">
                {profileMessage && <span className="text-sm text-emerald-400">{profileMessage}</span>}
                {profileError && <span className="text-sm text-red-400">{profileError}</span>}
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={isSavingProfile}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
                >
                  {isSavingProfile ? "Saving..." : "Save profile"}
                </button>
              </div>
            )}
          </section>

          {isAuthenticated && (
            <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-lg font-semibold">Shared AI voice sample</h2>
              <p className="mt-2 text-sm text-neutral-400">
                {canManageVoiceSample
                  ? "This sample is used for speech generation across all accounts. Upload a browser-supported audio recording of at least 3 seconds. The first 10 seconds are automatically cut and converted to mono, 16-bit PCM WAV at 22.05 kHz. Uploading replaces the shared sample."
                  : `This sample is used for speech generation across all accounts and is managed by ${VOICE_PROMPT_MANAGER_EMAIL}.`}
              </p>
              {canManageVoiceSample && <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                  {isUploadingVoiceSample
                    ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
                    : <Upload aria-hidden="true" className="h-4 w-4" />}
                  {isPreparingVoiceSample
                    ? "Preparing..."
                    : isUploadingVoiceSample
                      ? "Uploading..."
                      : "Upload voice sample"}
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(event) => void uploadVoiceSample(event)}
                    disabled={isUploadingVoiceSample}
                    className="sr-only"
                  />
                </label>
                {voiceSampleMessage && <span role="status" className="text-sm text-emerald-400">{voiceSampleMessage}</span>}
                {voiceSampleError && <span role="alert" className="text-sm text-red-400">{voiceSampleError}</span>}
              </div>}
            </section>
          )}

          {isAuthenticated && planName === "Free" && (
            <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-lg font-semibold">Upgrade your plan</h2>
              <p className="mt-2 text-sm text-neutral-400">Unlock more messages and faster responses.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <PayPalUpgradeButton
                  plan="pro-monthly"
                  className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black"
                >
                  Upgrade to Pro
                </PayPalUpgradeButton>
                <PayPalUpgradeButton
                  plan="business-monthly"
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
                >
                  Upgrade to Business
                </PayPalUpgradeButton>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
            <h2 className="text-lg font-semibold">Preferences</h2>
            <div className="mt-4 space-y-3 text-sm text-neutral-300">
              <label className="flex items-center justify-between gap-4">
                <span>AI responses in chat</span>
                <input
                  type="checkbox"
                  checked={aiResponsesEnabled}
                  onChange={(event) => setAiResponsesEnabled(event.target.checked)}
                  className="h-4 w-4 accent-white"
                />
              </label>
              <label className="flex items-center justify-between gap-4">
                <span>Auto-scroll history</span>
                <input
                  type="checkbox"
                  checked={autoScrollEnabled}
                  onChange={(event) => setAutoScrollEnabled(event.target.checked)}
                  className="h-4 w-4 accent-white"
                />
              </label>
            </div>
          </section>

          <div className="flex items-center justify-end gap-3 pt-2">
            {saveMessage && <span className="text-sm text-emerald-400">{saveMessage}</span>}
            <button
              type="button"
              onClick={saveSettings}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Save
            </button>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => logout({ logoutParams: { returnTo: typeof window !== "undefined" ? window.location.origin : undefined } })}
                className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-white"
              >
                Log out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => loginWithRedirect()}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
              >
                Log in
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
