import { describe, expect, it } from 'vitest'
import {
  checkVerifier,
  deriveKey,
  EncryptionService,
  generateSalt,
  isEncryptedPath,
  makeVerifier,
  open,
  seal,
} from './EncryptionService'

/**
 * Pure crypto core (Epic 10, Phase 00). No app wiring — exercises the container
 * format, KDF determinism, AES-256-GCM round-trip + tamper detection, the
 * verifier, and the session-key state machine. Runs under Electron's Node runtime
 * via the shared test runner, but uses only `node:crypto` (no better-sqlite3).
 */

describe('isEncryptedPath', () => {
  it('detects locked notes by extension, with no I/O', () => {
    expect(isEncryptedPath('a/b/secret.md.enc')).toBe(true)
    expect(isEncryptedPath('a/b/note.md')).toBe(false)
    expect(isEncryptedPath('note.txt')).toBe(false)
  })
})

describe('deriveKey', () => {
  it('is deterministic for the same password + salt (cross-platform stable)', () => {
    const salt = generateSalt()
    expect(deriveKey('correct horse', salt)).toEqual(deriveKey('correct horse', salt))
  })

  it('changes with a different password or a different salt', () => {
    const salt = generateSalt()
    expect(deriveKey('a', salt)).not.toEqual(deriveKey('b', salt))
    expect(deriveKey('a', salt)).not.toEqual(deriveKey('a', generateSalt()))
  })

  it('produces a 32-byte (AES-256) key', () => {
    expect(deriveKey('pw', generateSalt())).toHaveLength(32)
  })

  it('normalizes the password (NFC) so the same characters unlock across platforms', () => {
    const salt = generateSalt()
    // Same "gül": composed U+00FC (NFC) vs "u" + combining diaeresis U+0308 (NFD,
    // as macOS may deliver it). Different byte sequences, must derive one key.
    const composed = 'g\u00fcl' // NFC: u-umlaut as one code point
    const decomposed = 'gu\u0308l' // NFD: u + combining diaeresis
    expect(composed).not.toBe(decomposed)
    expect(deriveKey(composed, salt)).toEqual(deriveKey(decomposed, salt))
  })
})

describe('seal / open', () => {
  const key = deriveKey('vault-pw', generateSalt())

  it('round-trips content exactly', () => {
    for (const text of ['', 'hello', 'top secret 日本語 🔒', 'x'.repeat(100_000)]) {
      expect(open(seal(text, key), key)).toBe(text)
    }
  })

  it('produces a versioned "SLATENC" container (magic + version byte)', () => {
    const c = seal('data', key)
    expect(c.subarray(0, 7).toString('ascii')).toBe('SLATENC')
    expect(c[7]).toBe(1)
  })

  it('uses a fresh nonce each time (identical plaintext -> different bytes)', () => {
    expect(seal('same', key).equals(seal('same', key))).toBe(false)
  })

  it('fails to open under a different key', () => {
    const other = deriveKey('other-pw', generateSalt())
    expect(() => open(seal('secret', key), other)).toThrow()
  })

  it('rejects a tampered ciphertext or tag (GCM auth)', () => {
    const c = seal('secret', key)
    const flipTag = Buffer.from(c)
    flipTag[flipTag.length - 1] ^= 0xff // corrupt the tag
    expect(() => open(flipTag, key)).toThrow()

    const flipBody = Buffer.from(c)
    flipBody[20] ^= 0xff // corrupt a ciphertext byte
    expect(() => open(flipBody, key)).toThrow()
  })

  it('rejects a malformed or wrong-magic container', () => {
    expect(() => open(Buffer.from('too short'), key)).toThrow()
    const c = seal('x', key)
    const badMagic = Buffer.from(c)
    badMagic[0] ^= 0xff
    expect(() => open(badMagic, key)).toThrow()
  })
})

describe('verifier', () => {
  it('accepts the correct key and rejects a wrong one, without throwing', () => {
    const salt = generateSalt()
    const key = deriveKey('right', salt)
    const verifier = makeVerifier(key)
    expect(checkVerifier(verifier, key)).toBe(true)
    expect(checkVerifier(verifier, deriveKey('wrong', salt))).toBe(false)
    expect(checkVerifier('not-base64-valid-blob', key)).toBe(false)
  })
})

describe('EncryptionService session state', () => {
  it('starts locked; initPassword unlocks and yields persistable secret', () => {
    const svc = new EncryptionService()
    expect(svc.isUnlocked()).toBe(false)

    const secret = svc.initPassword('vault-pw')
    expect(svc.isUnlocked()).toBe(true)
    expect(secret.salt).toBeTruthy()
    expect(secret.verifier).toBeTruthy()
  })

  it('unlock accepts the right password and rejects the wrong one', () => {
    const secret = new EncryptionService().initPassword('vault-pw')

    const wrong = new EncryptionService()
    expect(wrong.unlock('nope', secret)).toBe(false)
    expect(wrong.isUnlocked()).toBe(false)

    const right = new EncryptionService()
    expect(right.unlock('vault-pw', secret)).toBe(true)
    expect(right.isUnlocked()).toBe(true)
  })

  it('lockVault clears the session key', () => {
    const svc = new EncryptionService()
    svc.initPassword('vault-pw')
    svc.lockVault()
    expect(svc.isUnlocked()).toBe(false)
    expect(() => svc.sealForSession('x')).toThrow()
  })

  it('session seal/open round-trips while unlocked and refuses while locked', () => {
    const svc = new EncryptionService()
    svc.initPassword('vault-pw')
    const container = svc.sealForSession('top secret')
    expect(svc.openForSession(container)).toBe('top secret')

    svc.lockVault()
    expect(() => svc.openForSession(container)).toThrow('encryption:locked')
  })

  it('isLocked reports path state independent of session', () => {
    const svc = new EncryptionService()
    expect(svc.isLocked('a.md.enc')).toBe(true)
    expect(svc.isLocked('a.md')).toBe(false)
  })
})
