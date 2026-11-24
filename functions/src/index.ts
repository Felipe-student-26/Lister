import { setGlobalOptions } from 'firebase-functions/v2';

// Cambia la región aquí y en VITE_FUNCTIONS_REGION del cliente.
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

export { loginGate, loginAttempt, loginSuccess, reportMfaFailure, beforeSignIn } from './login';
export {
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  passkeyList,
  passkeyRemove,
  passkeyLoginOptions,
  passkeyLoginVerify,
} from './passkeys';
export { createTherapist, therapistResetLink, removeTherapist } from './team';
