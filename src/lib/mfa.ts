import {
  multiFactor,
  TotpMultiFactorGenerator,
  type MultiFactorInfo,
  type TotpSecret,
  type User,
} from 'firebase/auth';

/** Enrolamiento TOTP (Firebase Auth MFA; requiere Identity Platform con TOTP habilitado). */
export async function startTotpEnrollment(user: User): Promise<{ secret: TotpSecret; uri: string; key: string }> {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  return { secret, uri: secret.generateQrCodeUrl(user.email ?? 'usuario', 'Lister'), key: secret.secretKey };
}

export async function finishTotpEnrollment(user: User, secret: TotpSecret, code: string, name = 'App autenticadora') {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
  await multiFactor(user).enroll(assertion, name);
}

export function listFactors(user: User): MultiFactorInfo[] {
  return multiFactor(user).enrolledFactors;
}

export async function removeFactor(user: User, factor: MultiFactorInfo) {
  await multiFactor(user).unenroll(factor);
}

/** Traduce los errores de Firebase a mensajes claros (el usuario nunca ve códigos crudos). */
export function mfaErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code ?? '';
  switch (code) {
    case 'auth/invalid-verification-code':
      return 'Código incorrecto o vencido. Revisa tu app e inténtalo de nuevo.';
    case 'auth/operation-not-allowed':
      return 'La verificación en dos pasos (TOTP) no está habilitada en Firebase. Actívala en Identity Platform.';
    case 'auth/requires-recent-login':
      return 'Por seguridad, confirma de nuevo tu contraseña.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Contraseña incorrecta.';
    case 'auth/network-request-failed':
      return 'Sin conexión. Inténtalo cuando vuelva internet.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos.';
    default:
      return 'No se pudo completar la operación.';
  }
}
