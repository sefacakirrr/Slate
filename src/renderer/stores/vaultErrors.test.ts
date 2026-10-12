import { describe, expect, it } from 'vitest'
import { describeVaultError } from './vaultErrors'

describe('describeVaultError', () => {
  it('maps known codes to sentences', () => {
    expect(describeVaultError('file-exists')).toMatch(/already exists/)
    expect(describeVaultError('invalid-name')).toMatch(/can't contain/)
  })

  it('keeps the raw code for unknown errors', () => {
    expect(describeVaultError('EACCES: permission denied')).toContain('EACCES')
  })
})
