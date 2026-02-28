import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const SCRYPT_KEYLEN = 64
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1

function toHex(buffer: Buffer): string {
  return buffer.toString('hex')
}

function fromHex(hex: string): Buffer {
  return Buffer.from(hex, 'hex')
}

export function hashPassword(password: string): string {
  const normalized = password.normalize('NFKC')
  const salt = randomBytes(16)
  const derived = scryptSync(normalized, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }) as Buffer
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${toHex(salt)}$${toHex(derived)}`
}

export function verifyPassword(password: string, hash: string): boolean {
  const parts = hash.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false
  }

  const [_, nRaw, rRaw, pRaw, saltHex, derivedHex] = parts
  const n = Number.parseInt(nRaw, 10)
  const r = Number.parseInt(rRaw, 10)
  const p = Number.parseInt(pRaw, 10)
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false
  }

  const salt = fromHex(saltHex)
  const expected = fromHex(derivedHex)
  const normalized = password.normalize('NFKC')
  const actual = scryptSync(normalized, salt, expected.length, { N: n, r, p }) as Buffer
  return timingSafeEqual(expected, actual)
}
