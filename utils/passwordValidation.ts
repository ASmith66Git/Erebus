export type PasswordValidationResult = { valid: true } | { valid: false; errorKey: string };

export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < 12) {
    return { valid: false, errorKey: 'auth.passwordMinLength' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, errorKey: 'auth.passwordNeedsUppercase' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, errorKey: 'auth.passwordNeedsNumber' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(password)) {
    return { valid: false, errorKey: 'auth.passwordNeedsSpecial' };
  }
  return { valid: true };
}
