import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * At-rest encryption for locked notes (Epic 10). Pure Node `crypto` — no native
 * dependency, so a note sealed on macOS opens byte-identically on Windows.
 *
 * A locked note lives on disk as a versioned binary container:
 *
 *   magic "SLATENC" (7B) | version (1B) | nonce (12B) | ciphertext (…) | GCM tag (16B)
 *
 * The key is derived from a single vault password via scrypt against a vault-wide
 * salt (stored, non-secret, in settings). The password/key are held only in this
 * service's memory for the session and never persisted or sent to the renderer.
 * There is no recovery: a forgotten password means the content is unrecoverable.
 */

const MAGIC = Buffer.from('SLATENC', 'ascii') // 7 bytes
const VERSION = 1
const NONCE_LEN = 12 // GCM standard nonce
const TAG_LEN = 16 // GCM auth tag
const KEY_LEN = 32 // AES-256
const SALT_LEN = 16
const HEADER_LEN = MAGIC.length + 1 + NONCE_LEN // magic + version + nonce

// scrypt cost parameters. N=2^15 needs ~34 MiB (128*N*r); raise maxmem past that
// or scrypt throws. These are fixed and versioned-in via the container format.
const SCRYPT_N = 1 << 15
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_MAXMEM = 64 * 1024 * 1024

/** Known plaintext sealed under the key to validate a password on unlock. */
const VERIFIER_CONSTANT = 'slate-vault-verifier-v1'

/** True for a locked note's on-disk path. Pure string check — no I/O. */
export function isEncryptedPath(relPath: string): boolean {
  return relPath.endsWith('.enc')
}

/** A fresh random vault salt (base64), generated once at first password set. */
export function generateSalt(): string {
  return randomBytes(SALT_LEN).toString('base64')
}

/**
 * Derives the 32-byte vault key from a password and the vault salt (base64).
 *
 * The password is NFC-normalized first: macOS and Windows can hand us the same
 * typed characters in different Unicode forms (e.g. Turkish ç/ğ/ü as composed
 * vs decomposed), which would otherwise derive different keys and lock a note
 * out across platforms. Normalizing makes the key depend on the characters, not
 * their byte encoding.
 */
export function deriveKey(password: string, saltB64: string): Buffer {
  const salt = Buffer.from(saltB64, 'base64')
  return scryptSync(password.normalize('NFC'), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })
}

/**
 * Seals UTF-8 plaintext into a container Buffer with AES-256-GCM under a fresh
 * random nonce. The auth tag is appended, so {@link open} both decrypts and
 * verifies integrity.
 */
export function seal(plaintext: string, key: Buffer): Buffer {
  const nonce = randomBytes(NONCE_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), nonce, ciphertext, tag])
}

/**
 * Opens a container Buffer back to UTF-8 plaintext. Throws on a malformed header,
 * an unknown version, or a failed authentication (wrong key or tampered bytes).
 */
export function open(container: Buffer, key: Buffer): string {
  if (container.length < HEADER_LEN + TAG_LEN) {
    throw new Error('encryption:malformed')
  }
  if (!container.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('encryption:bad-magic')
  }
  const version = container[MAGIC.length]
  if (version !== VERSION) {
    throw new Error(`encryption:unsupported-version:${version}`)
  }
  const nonce = container.subarray(MAGIC.length + 1, HEADER_LEN)
  const tag = container.subarray(container.length - TAG_LEN)
  const ciphertext = container.subarray(HEADER_LEN, container.length - TAG_LEN)

  const decipher = createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(tag)
  // `final()` throws if the tag doesn't verify — this is the wrong-password signal.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8')
}

/** Seals the verifier constant under the key. Stored (base64) alongside the salt. */
export function makeVerifier(key: Buffer): string {
  return seal(VERIFIER_CONSTANT, key).toString('base64')
}

/** True iff `key` opens the verifier to the expected constant. Never throws. */
export function checkVerifier(verifierB64: string, key: Buffer): boolean {
  try {
    return open(Buffer.from(verifierB64, 'base64'), key) === VERIFIER_CONSTANT
  } catch {
    return false
  }
}

/** The non-secret material persisted in settings to derive + validate the key. */
export type VaultSecret = {
  salt: string
  verifier: string
}

/**
 * Owns the vault session key. The key exists only here, only in memory, only
 * while the vault is unlocked. Handlers call the session-scoped seal/open — they
 * never see the key. `isLocked(path)` is independent of session state: it only
 * reports whether a given path is an encrypted note.
 */
export class EncryptionService {
  private sessionKey: Buffer | null = null

  /** Whether an on-disk note at this path is encrypted. Pure, no I/O. */
  isLocked(relPath: string): boolean {
    return isEncryptedPath(relPath)
  }

  /** Whether a session key is currently held (vault unlocked). */
  isUnlocked(): boolean {
    return this.sessionKey !== null
  }

  /** Clears the session key from memory (zeroed, then dropped). The vault re-locks. */
  lockVault(): void {
    this.sessionKey?.fill(0)
    this.sessionKey = null
  }

  /**
   * First-time password setup: derives the key, holds it for the session, and
   * returns the salt + verifier to persist (non-secret). The password itself is
   * never returned or stored.
   */
  initPassword(password: string): VaultSecret {
    const salt = generateSalt()
    const key = deriveKey(password, salt)
    this.sessionKey = key
    return { salt, verifier: makeVerifier(key) }
  }

  /**
   * Validates `password` against the stored secret; on success holds the key and
   * returns true. On a wrong password no key is held and false is returned.
   */
  unlock(password: string, secret: VaultSecret): boolean {
    const key = deriveKey(password, secret.salt)
    if (!checkVerifier(secret.verifier, key)) return false
    this.sessionKey = key
    return true
  }

  /** Seals plaintext with the session key. Throws if the vault is locked. */
  sealForSession(plaintext: string): Buffer {
    if (!this.sessionKey) throw new Error('encryption:locked')
    return seal(plaintext, this.sessionKey)
  }

  /** Opens a container with the session key. Throws if locked or on auth failure. */
  openForSession(container: Buffer): string {
    if (!this.sessionKey) throw new Error('encryption:locked')
    return open(container, this.sessionKey)
  }
}
