export function publicLoginFailureCode(): "invalid_credentials" {
  return "invalid_credentials";
}

export function publicLoginFailureMessage(): string {
  return "Email or password is incorrect.";
}

export function sanitizeAuthFailure(
  create: boolean,
  rawMessage: string,
): { code: string; message: string } {
  const lowered = rawMessage.toLowerCase();
  if (create && (lowered.indexOf("exists") !== -1 || lowered.indexOf("already") !== -1)) {
    return { code: "email_taken", message: "That email is already registered." };
  }
  return { code: publicLoginFailureCode(), message: publicLoginFailureMessage() };
}
