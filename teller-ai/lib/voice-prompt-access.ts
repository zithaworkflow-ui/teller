export const VOICE_PROMPT_MANAGER_EMAIL = "orticalinkworkflow@gmail.com";

export function isVoicePromptManager(
  email: string | null | undefined,
  emailVerified = false,
) {
  return emailVerified && email?.trim().toLowerCase() === VOICE_PROMPT_MANAGER_EMAIL;
}
