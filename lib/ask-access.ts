import { createHash } from 'node:crypto';

// The Ask assistant sits behind a passcode. Only a salted hash lives in the code; the unlock cookie is tied to the user id.
const SALT = 'gtrain-ask-v1';
const CODE_HASH = '7aff85f773d756e957d1d4a19ebf6464c88ce20fe14888ef9b2adc4fa40bb7fc';
export const ASK_COOKIE = 'gt_ask';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const askCodeOk = (code: string) => sha(`${SALT}:${code.trim()}`) === CODE_HASH;
export const askToken = (userId: string) => sha(`${SALT}:${CODE_HASH}:${userId}`);
