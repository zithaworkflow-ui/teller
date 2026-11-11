export const VOICE_PROMPT_MANAGER_EMAIL = "sizwe@qqwertyworkflow.co.za";

export function isVoicePromptManager(
  email: string | null | undefined,
  emailVerified = false,
) {
  return emailVerified && email?.trim().toLowerCase() === VOICE_PROMPT_MANAGER_EMAIL;
}
