// Demo-only frontend session. Replace these functions with the agreed auth API.
// Only a boolean demo-session marker is stored; credentials are never persisted.
const SESSION_KEY = "cicada_demo_session";
const REMEMBER_KEY = "cicada_demo_remembered_session";
const ACCOUNT_EMAIL_KEY = "cicada_demo_account_email";

export async function loginDemo({ email, password, remember = false }) {
  await new Promise((resolve) => setTimeout(resolve, 350));
  if (!email?.trim() || !password) {
    return { success: false, message: "Enter an email address and password to continue." };
  }
  logoutDemo();
  try {
    (remember ? localStorage : sessionStorage).setItem(remember ? REMEMBER_KEY : SESSION_KEY, "true");
    // Keep the non-secret account label for the current browser tab across refreshes.
    sessionStorage.setItem(ACCOUNT_EMAIL_KEY, email.trim());
  } catch {
    logoutDemo();
    return { success: false, message: "Browser storage is unavailable. Enable storage to start the demo session." };
  }
  return { success: true, mode: "demo", accountEmail: email.trim() };
}

export function getDemoAccountEmail() {
  try {
    return sessionStorage.getItem(ACCOUNT_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

export function isDemoSessionActive() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "true" || localStorage.getItem(REMEMBER_KEY) === "true";
  } catch {
    return false;
  }
}

export function logoutDemo() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    sessionStorage.removeItem(ACCOUNT_EMAIL_KEY);
  } catch {
    // The frontend remains unauthenticated if browser storage is unavailable.
  }
}
