"use client";

import { Auth0Provider as Auth0SdkProvider, useAuth0 } from "@auth0/auth0-react";
import type {
  AppState,
  LogoutOptions,
  RedirectLoginOptions,
  User,
} from "@auth0/auth0-react";
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { LOCAL_TEST_ACCESS_TOKEN, LOCAL_TEST_USER_ID } from "@/lib/local-test-auth";

const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
const configuredCallbackUrl = process.env.NEXT_PUBLIC_AUTH0_CALLBACK_URL;
const audience = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE;
const localSessionKey = "teller-local-test-session";
const localTestUser: User = {
  sub: LOCAL_TEST_USER_ID,
  name: "Local Test Account",
  email: "local-test@example.test",
};
const localAuthListeners = new Set<() => void>();

function subscribeToLocalAuth(listener: () => void) {
  localAuthListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    localAuthListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getLocalAuthSnapshot() {
  return localStorage.getItem(localSessionKey) !== "signed-out";
}

function notifyLocalAuthChange(isAuthenticated: boolean) {
  localStorage.setItem(localSessionKey, isAuthenticated ? "signed-in" : "signed-out");
  localAuthListeners.forEach((listener) => listener());
}

type AppAuth = {
  user?: User;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithRedirect: (options?: RedirectLoginOptions) => Promise<void>;
  logout: (options?: LogoutOptions) => Promise<void>;
  getAccessTokenSilently: () => Promise<string>;
};

const AppAuthContext = createContext<AppAuth | null>(null);

export function useAppAuth() {
  const auth = useContext(AppAuthContext);
  if (!auth) throw new Error("useAppAuth must be used within AppAuthProvider.");
  return auth;
}

function Auth0AppAuthBridge({ children }: { children: ReactNode }) {
  const auth = useAuth0();
  return <AppAuthContext.Provider value={auth}>{children}</AppAuthContext.Provider>;
}

function LocalTestAuthProvider({ children }: { children: ReactNode }) {
  const isAuthenticated = useSyncExternalStore(
    subscribeToLocalAuth,
    getLocalAuthSnapshot,
    () => true,
  );

  const loginWithRedirect = useCallback(async (options?: RedirectLoginOptions) => {
    notifyLocalAuthChange(true);
    const returnTo = options?.appState?.returnTo;
    if (returnTo) window.location.assign(returnTo);
  }, []);

  const logout = useCallback(async (options?: LogoutOptions) => {
    notifyLocalAuthChange(false);
    window.location.assign(options?.logoutParams?.returnTo || "/");
  }, []);

  const getAccessTokenSilently = useCallback(async () => LOCAL_TEST_ACCESS_TOKEN, []);

  const value = useMemo<AppAuth>(
    () => ({
      user: isAuthenticated ? localTestUser : undefined,
      isAuthenticated,
      isLoading: false,
      loginWithRedirect,
      logout,
      getAccessTokenSilently,
    }),
    [getAccessTokenSilently, isAuthenticated, loginWithRedirect, logout],
  );

  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>;
}

export function AppAuthProvider({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "development") {
    return <LocalTestAuthProvider>{children}</LocalTestAuthProvider>;
  }

  if (!domain || !clientId) {
    return (
      <main className="m-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-semibold">Auth0 is not configured</h1>
        <p className="mt-3 text-sm">
          Set NEXT_PUBLIC_AUTH0_DOMAIN and NEXT_PUBLIC_AUTH0_CLIENT_ID to enable sign-in.
        </p>
      </main>
    );
  }

  // Auth0's SPA SDK throws on insecure origins (plain http://), which crashes
  // the whole page. Upgrade to HTTPS before the SDK is initialised.
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "http:" &&
    !window.isSecureContext
  ) {
    window.location.replace(
      `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    return null;
  }

  const redirectUri =
    configuredCallbackUrl ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/`
      : "http://localhost:3000/");

  function handleRedirectCallback(appState?: AppState) {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, document.title, appState?.returnTo || "/settings");
    }
  }

  return (
    <Auth0SdkProvider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: redirectUri,
        ...(audience ? { audience } : {}),
        scope: "openid profile email",
      }}
      onRedirectCallback={handleRedirectCallback}
      cacheLocation="localstorage"
    >
      <Auth0AppAuthBridge>{children}</Auth0AppAuthBridge>
    </Auth0SdkProvider>
  );
}
