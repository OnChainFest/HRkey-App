const KEY_STORAGE_KEY = 'wsd_wallet_key_v1';
const KEY_REF = 'local:wsd:aes-gcm:v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)));

const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), char => char.charCodeAt(0));

async function loadOrCreateKey(): Promise<CryptoKey> {
  const stored = typeof window !== 'undefined' ? window.localStorage.getItem(KEY_STORAGE_KEY) : null;
  if (stored) {
    const raw = fromBase64(stored);
    return window.crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
  }

  const key = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt'
  ]);
  const raw = await window.crypto.subtle.exportKey('raw', key);
  window.localStorage.setItem(KEY_STORAGE_KEY, toBase64(raw));
  return key;
}

export async function encryptString(value: string) {
  const key = await loadOrCreateKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(value)
  );

  return {
    alg: 'AES-GCM',
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
    key_ref: KEY_REF
  };
}

export async function decryptString(payload: {
  ciphertext: string;
  iv: string;
}) {
  const key = await loadOrCreateKey();
  const plaintext = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) },
    key,
    fromBase64(payload.ciphertext)
  );
  return decoder.decode(plaintext);
}
