import { describe, expect, test, vi } from 'vitest'

import {
  decryptPrivateDeviceDataArchive,
  describePrivateArchiveEncryptionError,
  encryptPrivateDeviceDataArchive
} from './taroPrivateArchiveEncryption'

vi.mock('@tarojs/taro', () => ({
  default: {
    getRandomValues: vi.fn()
  }
}))

const PASSPHRASE = 'correct-horse-battery-staple'

function deterministicRandomBytes(length: number) {
  return Uint8Array.from(
    { length },
    (_value, index) => (index * 29 + 3) % 256
  )
}

describe('Taro private archive encryption adapter', () => {
  test('encrypts and restores bytes through the shared audited core', async () => {
    const plaintext = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])
    const encrypted = await encryptPrivateDeviceDataArchive(
      plaintext,
      PASSPHRASE,
      deterministicRandomBytes
    )

    expect(Array.from(encrypted.slice(0, 8))).toEqual([
      0x50,
      0x49,
      0x45,
      0x32,
      0x45,
      0x45,
      0x30,
      0x31
    ])
    await expect(
      decryptPrivateDeviceDataArchive(encrypted, PASSPHRASE)
    ).resolves.toEqual(plaintext)
  })

  test('turns authenticated decryption failure into a safe user message', async () => {
    const encrypted = await encryptPrivateDeviceDataArchive(
      new Uint8Array([1, 2, 3]),
      PASSPHRASE,
      deterministicRandomBytes
    )
    try {
      await decryptPrivateDeviceDataArchive(encrypted, 'another-safe-password')
      throw new Error('Expected decryption failure')
    } catch (error) {
      expect(describePrivateArchiveEncryptionError(error)).toContain(
        '恢复密码不正确'
      )
    }
  })
})
