import { createPrivateKey, createPublicKey } from 'node:crypto';
import { strictBase64Decode } from '../../utils';

type DerElement = {
  start: number;
  tag: number;
  contentStart: number;
  contentEnd: number;
  end: number;
};

export type PublicKeyIdentity = {
  algorithm: 'rsa' | 'ec' | 'ed25519' | 'dsa';
  parameters?: string;
  value: string;
};

export type PemValidationResult = {
  valid: boolean;
  publicKey?: PublicKeyIdentity;
  encrypted?: boolean;
  runtimeValidation?: boolean;
};

type PemBlock = {
  label: string;
  bytes: Uint8Array;
  headers: Record<string, string>;
};

type DecodedPemBlock = {
  block: PemBlock;
  consumesInput: boolean;
};

const OID_RSA_ENCRYPTION = '2a864886f70d010101';
const OID_EC_PUBLIC_KEY = '2a8648ce3d0201';
const OID_DSA = '2a8648ce380401';
const OID_ED25519 = '2b6570';

type EcCurve = {
  size: number;
  p: bigint;
  b: bigint;
  n: bigint;
  gx: bigint;
  gy: bigint;
};

type EcPoint = { x: bigint; y: bigint } | undefined;

const EC_CURVES: Record<string, EcCurve> = {
  // 1.3.132.0.33
  '2b81040021': {
    size: 28,
    p: BigInt('0xffffffffffffffffffffffffffffffff000000000000000000000001'),
    b: BigInt('0xb4050a850c04b3abf54132565044b0b7d7bfd8ba270b39432355ffb4'),
    n: BigInt('0xffffffffffffffffffffffffffff16a2e0b8f03e13dd29455c5c2a3d'),
    gx: BigInt('0xb70e0cbd6bb4bf7f321390b94a03c1d356c21122343280d6115c1d21'),
    gy: BigInt('0xbd376388b5f723fb4c22dfe6cd4375a05a07476444d5819985007e34')
  },
  // 1.2.840.10045.3.1.7
  '2a8648ce3d030107': {
    size: 32,
    p: BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
    b: BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b'),
    n: BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
    gx: BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
    gy: BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')
  },
  // 1.3.132.0.34
  '2b81040022': {
    size: 48,
    p: BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffff'),
    b: BigInt('0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aef'),
    n: BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973'),
    gx: BigInt('0xaa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7'),
    gy: BigInt('0x3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5f')
  },
  // 1.3.132.0.35
  '2b81040023': {
    size: 66,
    p: (1n << 521n) - 1n,
    b: BigInt('0x51953eb9618e1c9a1f929a21a0b68540eea2da725b99b315f3b8b489918ef109e156193951ec7e937b1652c0bd3bb1bf073573df883d2c34f1ef451fd46b503f00'),
    n: BigInt('0x1fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa51868783bf2f966b7fcc0148f709a5d03bb5c9b8899c47aebb6fb71e91386409'),
    gx: BigInt('0xc6858e06b70404e9cd9e3ecb662395b4429c648139053fb521f828af606b4d3dbaa14b5e77efe75928fe1dc127a2ffa8de3348b3c1856a429bf97e7e31c2e5bd66'),
    gy: BigInt('0x11839296a789a3bc0045c8a5fb42c7d1bd998f54449579b446817afbd17273e662c97ee72995ef42640c550b9013fad0761353c7086a272c24088be94769fd16650')
  }
};

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBigInt(value: Uint8Array): bigint {
  const hex = bytesToHex(value);
  return hex ? BigInt(`0x${hex}`) : 0n;
}

function bigIntToEvenHex(value: bigint): string {
  const hex = value.toString(16);
  return hex.length % 2 === 0 ? hex : `0${hex}`;
}

function deriveEd25519PublicKey(seed: Uint8Array): string | undefined {
  if (seed.length !== 32) return undefined;
  const pkcs8Prefix = new Uint8Array([
    0x30, 0x2E, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2B, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
  ]);
  const spkiPrefix = new Uint8Array([
    0x30, 0x2A, 0x30, 0x05, 0x06, 0x03,
    0x2B, 0x65, 0x70, 0x03, 0x21, 0x00
  ]);
  const pkcs8 = new Uint8Array(pkcs8Prefix.length + seed.length);
  pkcs8.set(pkcs8Prefix);
  pkcs8.set(seed, pkcs8Prefix.length);
  try {
    const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
    if (privateKey.asymmetricKeyType !== 'ed25519') return undefined;
    const exported = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
    const spki = new Uint8Array(exported);
    if (
      spki.length !== spkiPrefix.length + 32
      || spkiPrefix.some((byte, index) => spki[index] !== byte)
    ) {
      return undefined;
    }
    return bytesToHex(spki.slice(spkiPrefix.length));
  } catch {
    return undefined;
  }
}

function modulo(value: bigint, modulus: bigint): bigint {
  const result = value % modulus;
  return result < 0n ? result + modulus : result;
}

function inverseModulo(value: bigint, modulus: bigint): bigint | undefined {
  let oldR = modulo(value, modulus);
  let r = modulus;
  let oldS = 1n;
  let s = 0n;
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }
  return oldR === 1n ? modulo(oldS, modulus) : undefined;
}

function bitLength(value: bigint): number {
  return value > 0n ? value.toString(2).length : 0;
}

function addEcPoints(left: EcPoint, right: EcPoint, curve: EcCurve): EcPoint {
  if (!left) return right;
  if (!right) return left;
  if (left.x === right.x && modulo(left.y + right.y, curve.p) === 0n) return undefined;
  const denominator = left.x === right.x && left.y === right.y
    ? inverseModulo(2n * left.y, curve.p)
    : inverseModulo(right.x - left.x, curve.p);
  if (denominator === undefined) return undefined;
  const numerator = left.x === right.x && left.y === right.y
    ? 3n * left.x * left.x - 3n
    : right.y - left.y;
  const slope = modulo(numerator * denominator, curve.p);
  const x = modulo(slope * slope - left.x - right.x, curve.p);
  const y = modulo(slope * (left.x - x) - left.y, curve.p);
  return { x, y };
}

function multiplyEcPoint(scalar: bigint, curve: EcCurve): EcPoint {
  let result: EcPoint;
  let addend: EcPoint = { x: curve.gx, y: curve.gy };
  let remaining = scalar;
  while (remaining > 0n) {
    if ((remaining & 1n) !== 0n) result = addEcPoints(result, addend, curve);
    addend = addEcPoints(addend, addend, curve);
    remaining >>= 1n;
  }
  return result;
}

function encodeEcPoint(point: EcPoint, curve: EcCurve): string | undefined {
  if (!point) return undefined;
  return `04${point.x.toString(16).padStart(curve.size * 2, '0')}${point.y.toString(16).padStart(curve.size * 2, '0')}`;
}

function isValidEcPoint(value: Uint8Array, curve: EcCurve): boolean {
  if (value.length !== 1 + curve.size * 2 || value[0] !== 0x04) return false;
  const x = bytesToBigInt(value.slice(1, 1 + curve.size));
  const y = bytesToBigInt(value.slice(1 + curve.size));
  if (x >= curve.p || y >= curve.p) return false;
  return modulo(y * y, curve.p) === modulo(x * x * x - 3n * x + curve.b, curve.p);
}

function readDerElement(value: Uint8Array, offset = 0): DerElement | undefined {
  if (offset < 0 || offset + 2 > value.length) return undefined;
  const tag = value[offset]!;
  if ((tag & 0x1F) === 0x1F) return undefined;
  const firstLength = value[offset + 1]!;
  let lengthBytes = 0;
  let contentLength = firstLength;
  if ((firstLength & 0x80) !== 0) {
    lengthBytes = firstLength & 0x7F;
    if (lengthBytes < 1 || lengthBytes > 4 || offset + 2 + lengthBytes > value.length) {
      return undefined;
    }
    if (value[offset + 2] === 0) return undefined;
    contentLength = 0;
    for (let index = 0; index < lengthBytes; index++) {
      contentLength = contentLength * 256 + value[offset + 2 + index]!;
    }
    if (contentLength < 0x80) return undefined;
  }
  const contentStart = offset + 2 + lengthBytes;
  const contentEnd = contentStart + contentLength;
  if (!Number.isSafeInteger(contentEnd) || contentEnd > value.length) return undefined;
  return { start: offset, tag, contentStart, contentEnd, end: contentEnd };
}

function readDerChildren(value: Uint8Array, element: DerElement): DerElement[] | undefined {
  const children: DerElement[] = [];
  let offset = element.contentStart;
  while (offset < element.contentEnd) {
    const child = readDerElement(value, offset);
    if (!child || child.end > element.contentEnd) return undefined;
    children.push(child);
    offset = child.end;
  }
  return offset === element.contentEnd ? children : undefined;
}

function readSingleDer(value: Uint8Array, tag?: number): DerElement | undefined {
  const element = readDerElement(value);
  if (!element || element.end !== value.length || (tag !== undefined && element.tag !== tag)) {
    return undefined;
  }
  return element;
}

function readDerSequence(value: Uint8Array): DerElement[] | undefined {
  const sequence = readSingleDer(value, 0x30);
  return sequence ? readDerChildren(value, sequence) : undefined;
}

function isCanonicalDerInteger(value: Uint8Array, element: DerElement): boolean {
  if (element.tag !== 0x02 || element.contentStart >= element.contentEnd) return false;
  if (element.contentEnd - element.contentStart === 1) return true;
  const first = value[element.contentStart]!;
  const second = value[element.contentStart + 1]!;
  if (first === 0x00 && (second & 0x80) === 0) return false;
  if (first === 0xFF && (second & 0x80) !== 0) return false;
  return true;
}

function positiveDerIntegerHex(value: Uint8Array, element: DerElement): string | undefined {
  if (!isCanonicalDerInteger(value, element) || (value[element.contentStart]! & 0x80) !== 0) {
    return undefined;
  }
  let start = element.contentStart;
  while (start + 1 < element.contentEnd && value[start] === 0) start++;
  return bytesToHex(value.slice(start, element.contentEnd));
}

function derIntegerEquals(value: Uint8Array, element: DerElement, expected: number): boolean {
  const hex = positiveDerIntegerHex(value, element);
  if (hex === undefined || hex.length > 12) return false;
  return Number.parseInt(hex || '0', 16) === expected;
}

function positiveDerInteger(value: Uint8Array, element: DerElement): bigint | undefined {
  const hex = positiveDerIntegerHex(value, element);
  return hex === undefined ? undefined : BigInt(`0x${hex || '0'}`);
}

function hasValidObjectIdentifier(value: Uint8Array, element: DerElement): boolean {
  if (element.tag !== 0x06 || element.contentStart === element.contentEnd) return false;
  let componentLength = 0;
  let componentValue = 0;
  for (let index = element.contentStart; index < element.contentEnd; index++) {
    const byte = value[index]!;
    if (componentLength === 0 && byte === 0x80) return false;
    if (componentLength === 5 || componentValue >= 1 << 24) return false;
    componentLength++;
    componentValue = componentValue * 128 + (byte & 0x7F);
    if ((byte & 0x80) === 0) {
      componentLength = 0;
      componentValue = 0;
    }
  }
  return componentLength === 0;
}

function equalDerContents(value: Uint8Array, left: DerElement, right: DerElement): boolean {
  const leftLength = left.contentEnd - left.contentStart;
  if (leftLength !== right.contentEnd - right.contentStart) return false;
  for (let index = 0; index < leftLength; index++) {
    if (value[left.contentStart + index] !== value[right.contentStart + index]) return false;
  }
  return true;
}

function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): boolean {
  if (
    year < 0 || year > 9999 || month < 1 || month > 12 || day < 1
    || hour > 23 || minute > 59 || second > 59
  ) {
    return false;
  }
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  return day <= daysInMonth;
}

function hasValidTimeZone(value: string): boolean {
  if (value === 'Z') return true;
  const match = /^([+-])(\d{2})(\d{2})$/.exec(value);
  if (!match) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return hour <= 23 && minute <= 59 && (hour !== 0 || minute !== 0);
}

function hasValidDerTime(value: Uint8Array, element: DerElement): boolean {
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
      value.slice(element.contentStart, element.contentEnd)
    );
  } catch {
    return false;
  }
  if (element.tag === 0x17) {
    const match = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:(\d{2}))?(Z|[+-]\d{4})$/.exec(source);
    if (!match || !hasValidTimeZone(match[7]!)) return false;
    const shortYear = Number(match[1]);
    const year = shortYear >= 50 ? 1900 + shortYear : 2000 + shortYear;
    return isValidCalendarDate(
      year,
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0)
    );
  }
  if (element.tag === 0x18) {
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})$/.exec(source);
    if (!match || !hasValidTimeZone(match[7]!)) return false;
    return isValidCalendarDate(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6])
    );
  }
  return false;
}

function hasValidDerBitString(value: Uint8Array, element: DerElement): boolean {
  if (element.tag !== 0x03 || element.contentStart === element.contentEnd) return false;
  const paddingBits = value[element.contentStart]!;
  const dataLength = element.contentEnd - element.contentStart - 1;
  if (paddingBits > 7 || (dataLength === 0 && paddingBits !== 0)) return false;
  if (dataLength > 0 && paddingBits > 0) {
    const unusedMask = (1 << paddingBits) - 1;
    if ((value[element.contentEnd - 1]! & unusedMask) !== 0) return false;
  }
  return true;
}

function hasValidAsn1String(value: Uint8Array, element: DerElement): boolean {
  const bytes = value.slice(element.contentStart, element.contentEnd);
  if (element.tag === 0x14) return true;
  if (element.tag === 0x13) {
    return bytes.every(byte =>
      (byte >= 0x61 && byte <= 0x7A)
      || (byte >= 0x41 && byte <= 0x5A)
      || (byte >= 0x30 && byte <= 0x39)
      || (byte >= 0x27 && byte <= 0x29)
      || (byte >= 0x2B && byte <= 0x2F)
      || [0x20, 0x3A, 0x3D, 0x3F, 0x2A, 0x26].includes(byte)
    );
  }
  if (element.tag === 0x0C) {
    try {
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
      return true;
    } catch {
      return false;
    }
  }
  if (element.tag === 0x1E) {
    if (bytes.length % 2 !== 0) return false;
    let end = bytes.length;
    if (end >= 2 && bytes[end - 2] === 0 && bytes[end - 1] === 0) end -= 2;
    for (let index = 0; index < end; index += 2) {
      const point = bytes[index]! * 256 + bytes[index + 1]!;
      if (
        point === 0xFFFE || point === 0xFFFF
        || (point >= 0xFDD0 && point <= 0xFDEF)
        || (point >= 0xD800 && point <= 0xDFFF)
      ) {
        return false;
      }
    }
    return true;
  }
  if (element.tag === 0x16) return bytes.every(byte => byte <= 0x7F);
  if (element.tag === 0x12) {
    return bytes.every(byte => (byte >= 0x30 && byte <= 0x39) || byte === 0x20);
  }
  return false;
}

function hasValidX509Name(value: Uint8Array, element: DerElement): boolean {
  if (element.tag !== 0x30) return false;
  const rdns = readDerChildren(value, element);
  if (!rdns) return false;
  for (const rdn of rdns) {
    if (rdn.tag !== 0x31) return false;
    const attributes = readDerChildren(value, rdn);
    if (!attributes) return false;
    for (const attribute of attributes) {
      if (attribute.tag !== 0x30) return false;
      const fields = readDerChildren(value, attribute);
      if (!fields || fields.length < 2 || !hasValidObjectIdentifier(value, fields[0]!)) {
        return false;
      }
      if (!hasValidAsn1String(value, fields[1]!)) return false;
    }
  }
  return true;
}

function hasValidX509Extensions(value: Uint8Array, element: DerElement): boolean {
  if (element.tag !== 0xA3) return false;
  const wrappers = readDerChildren(value, element);
  if (!wrappers || wrappers.length !== 1 || wrappers[0]!.tag !== 0x30) return false;
  const extensions = readDerChildren(value, wrappers[0]!);
  if (!extensions) return false;
  const seen = new Set<string>();
  for (const extension of extensions) {
    if (extension.tag !== 0x30) return false;
    const fields = readDerChildren(value, extension);
    if (!fields || fields.length < 2 || !hasValidObjectIdentifier(value, fields[0]!)) {
      return false;
    }
    const oid = bytesToHex(value.slice(fields[0]!.contentStart, fields[0]!.contentEnd));
    if (seen.has(oid)) return false;
    seen.add(oid);
    let index = 1;
    if (fields[index]?.tag === 0x01) {
      const boolean = fields[index]!;
      if (
        boolean.contentEnd - boolean.contentStart !== 1
        || ![0x00, 0xFF].includes(value[boolean.contentStart]!)
      ) {
        return false;
      }
      index++;
    }
    if (fields[index]?.tag !== 0x04) return false;
  }
  return true;
}

function parseAlgorithmIdentifier(
  value: Uint8Array,
  element: DerElement
): { oid: string; parameters?: DerElement } | undefined {
  if (element.tag !== 0x30) return undefined;
  const children = readDerChildren(value, element);
  if (!children?.length || !hasValidObjectIdentifier(value, children[0]!)) {
    return undefined;
  }
  const oid = bytesToHex(value.slice(children[0]!.contentStart, children[0]!.contentEnd));
  return { oid, parameters: children[1] };
}

function parseSubjectPublicKeyInfo(
  value: Uint8Array,
  element: DerElement
): PemValidationResult {
  if (element.tag !== 0x30) return { valid: false };
  const children = readDerChildren(value, element);
  if (!children || children.length !== 2 || children[1]!.tag !== 0x03) {
    return { valid: false };
  }
  const algorithm = parseAlgorithmIdentifier(value, children[0]!);
  const bitString = children[1]!;
  if (!algorithm || !hasValidDerBitString(value, bitString)) {
    return { valid: false };
  }
  if (value[bitString.contentStart] !== 0) {
    return [OID_RSA_ENCRYPTION, OID_EC_PUBLIC_KEY, OID_ED25519, OID_DSA].includes(algorithm.oid)
      ? { valid: false }
      : { valid: true };
  }
  const keyBytes = value.slice(bitString.contentStart + 1, bitString.contentEnd);
  if (algorithm.oid === OID_RSA_ENCRYPTION) {
    if (
      !algorithm.parameters || algorithm.parameters.tag !== 0x05
      || algorithm.parameters.contentStart !== algorithm.parameters.contentEnd
    ) {
      return { valid: false };
    }
    const rsa = readDerSequence(keyBytes);
    if (!rsa || rsa.length !== 2) return { valid: false };
    const modulus = positiveDerIntegerHex(keyBytes, rsa[0]!);
    const exponent = positiveDerIntegerHex(keyBytes, rsa[1]!);
    if (!modulus || !exponent) return { valid: false };
    return { valid: true, publicKey: { algorithm: 'rsa', value: `${modulus}:${exponent}` } };
  }
  if (algorithm.oid === OID_EC_PUBLIC_KEY) {
    if (!algorithm.parameters || algorithm.parameters.tag !== 0x06 || keyBytes[0] !== 0x04) {
      return { valid: false };
    }
    const curve = bytesToHex(value.slice(
      algorithm.parameters.contentStart,
      algorithm.parameters.contentEnd
    ));
    const curveParameters = EC_CURVES[curve];
    if (!curveParameters || !isValidEcPoint(keyBytes, curveParameters)) return { valid: false };
    return {
      valid: true,
      publicKey: { algorithm: 'ec', parameters: curve, value: bytesToHex(keyBytes) }
    };
  }
  if (algorithm.oid === OID_ED25519) {
    if (algorithm.parameters || keyBytes.length !== 32) return { valid: false };
    return { valid: true, publicKey: { algorithm: 'ed25519', value: bytesToHex(keyBytes) } };
  }
  if (algorithm.oid === OID_DSA) {
    if (!algorithm.parameters || algorithm.parameters.tag !== 0x30) return { valid: false };
    const parameters = readDerChildren(value, algorithm.parameters);
    if (!parameters || parameters.length < 3) return { valid: false };
    const [p, q, g] = parameters.map(parameter => positiveDerInteger(value, parameter));
    if (!p || !q || !g) return { valid: false };
    const publicValue = readSingleDer(keyBytes, 0x02);
    const normalized = publicValue && positiveDerIntegerHex(keyBytes, publicValue);
    return normalized
      ? { valid: true, publicKey: { algorithm: 'dsa', value: normalized } }
      : { valid: false };
  }
  // Keep future/less common X.509 public-key algorithms pass-through compatible.
  // A matching key cannot be compared locally, but the official CLI still validates it.
  return { valid: true };
}

function parseX509Certificate(value: Uint8Array): PemValidationResult {
  const certificate = readSingleDer(value, 0x30);
  if (!certificate) return { valid: false };
  const top = readDerChildren(value, certificate);
  if (!top || top.length !== 3 || top[0]!.tag !== 0x30 || top[1]!.tag !== 0x30 || top[2]!.tag !== 0x03) {
    return { valid: false };
  }
  if (!parseAlgorithmIdentifier(value, top[1]!)) return { valid: false };
  const signature = top[2]!;
  if (!hasValidDerBitString(value, signature)) {
    return { valid: false };
  }
  const tbs = readDerChildren(value, top[0]!);
  if (!tbs) return { valid: false };
  let index = 0;
  let version = 0;
  if (tbs[index]?.tag === 0xA0) {
    const versionFields = readDerChildren(value, tbs[index]!);
    if (
      !versionFields || versionFields.length !== 1
      || (![0, 1, 2].some(candidate => derIntegerEquals(value, versionFields[0]!, candidate)))
    ) {
      return { valid: false };
    }
    const parsedVersion = positiveDerInteger(value, versionFields[0]!);
    if (parsedVersion === undefined) return { valid: false };
    version = Number(parsedVersion);
    index++;
  }
  const serial = tbs[index++];
  const signatureAlgorithm = tbs[index++];
  const issuer = tbs[index++];
  const validity = tbs[index++];
  const subject = tbs[index++];
  const publicKeyInfo = tbs[index++];
  if (
    !serial || positiveDerIntegerHex(value, serial) === undefined
    || !signatureAlgorithm || !parseAlgorithmIdentifier(value, signatureAlgorithm)
    || !issuer || !hasValidX509Name(value, issuer)
    || validity?.tag !== 0x30
    || !subject || !hasValidX509Name(value, subject)
    || publicKeyInfo?.tag !== 0x30
  ) {
    return { valid: false };
  }
  if (!equalDerContents(value, top[1]!, signatureAlgorithm)) return { valid: false };
  const validityFields = readDerChildren(value, validity);
  if (
    !validityFields || validityFields.length !== 2
    || ![0x17, 0x18].includes(validityFields[0]!.tag)
    || ![0x17, 0x18].includes(validityFields[1]!.tag)
    || !hasValidDerTime(value, validityFields[0]!)
    || !hasValidDerTime(value, validityFields[1]!)
  ) {
    return { valid: false };
  }
  if (version > 0 && tbs[index]?.tag === 0x81) index++;
  if (version > 0 && tbs[index]?.tag === 0x82) index++;
  if (version === 2 && tbs[index]?.tag === 0xA3 && !hasValidX509Extensions(value, tbs[index]!)) {
    return { valid: false };
  }
  return parseSubjectPublicKeyInfo(value, publicKeyInfo);
}

function decodePemBlocks(sourceValue: string): DecodedPemBlock[] {
  const source = sourceValue.replace(/\r\n/g, '\n');
  const decodedBlocks: DecodedPemBlock[] = [];
  const lines = source.split('\n');
  const pemLine = (line: string): string => line.replace(/[ \t]+$/, '');
  let pendingBeginIndex: number | undefined;
  let pendingLabel: string | undefined;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = pemLine(lines[lineIndex]!);
    if (line.startsWith('-----BEGIN ')) {
      pendingBeginIndex = lineIndex;
      pendingLabel = /^-----BEGIN (.*)-----$/.exec(line)?.[1];
      continue;
    }
    if (!line.startsWith('-----END ') || pendingBeginIndex === undefined) continue;

    const beginIndex = pendingBeginIndex;
    const label = pendingLabel;
    pendingBeginIndex = undefined;
    pendingLabel = undefined;
    const end = /^-----END (.*)-----$/.exec(line);
    if (label === undefined || end?.[1] !== label) continue;
    const endIndex = lineIndex;
    const contentLines = lines.slice(beginIndex + 1, endIndex);
    const headers: Record<string, string> = Object.create(null);
    let bodyIndex = 0;
    while (bodyIndex < contentLines.length) {
      const line = pemLine(contentLines[bodyIndex]!);
      const colon = line.indexOf(':');
      if (colon < 0) break;
      headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
      bodyIndex++;
    }
    const encoded = contentLines
      .slice(bodyIndex)
      .join('\n')
      .replace(/[ \t\r\n]/g, '');
    let bytes: Uint8Array | undefined;
    if (encoded === '') {
      bytes = new Uint8Array();
    } else if (/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) && encoded.length % 4 === 0) {
      try {
        const decoded = atob(encoded);
        bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
      } catch {}
    }
    if (!bytes) continue;
    decodedBlocks.push({
      block: { label, bytes, headers },
      consumesInput: endIndex === lines.length - 1
        || (endIndex === lines.length - 2 && lines[lines.length - 1] === '')
    });
  }
  return decodedBlocks;
}

function extractPemBlocks(
  values: string[],
  labels: ReadonlySet<string>,
  options: { labelSuffix?: string; includeAnyLabel?: boolean } = {}
): PemBlock[] | undefined {
  const blocks: PemBlock[] = [];
  for (const { block } of decodePemBlocks(values.join('\n'))) {
    const { label } = block;
    if (
      !options.includeAnyLabel
      && !labels.has(label)
      && !(options.labelSuffix && label.endsWith(options.labelSuffix))
    ) {
      continue;
    }
    blocks.push(block);
  }
  return blocks.length ? blocks : undefined;
}

export function validateSinglePemBlock(values: string[], label: string): boolean {
  const first = decodePemBlocks(values.join('\n'))[0];
  return Boolean(first && first.block.label === label && first.consumesInput);
}

function parseRsaPrivateKey(value: Uint8Array): PemValidationResult {
  const fields = readDerSequence(value);
  if (!fields || fields.length < 6 || fields.length > 10) {
    return { valid: false };
  }
  const version = derIntegerEquals(value, fields[0]!, 0)
    ? 0
    : derIntegerEquals(value, fields[0]!, 1)
    ? 1
    : undefined;
  if (version === undefined) return { valid: false };
  const required = fields.slice(1, 6).map(field => positiveDerInteger(value, field));
  if (required.some(integer => integer === undefined || integer <= 0n)) {
    return { valid: false };
  }
  const [modulus, exponent, privateExponent, primeP, primeQ] = required;
  if (primeP! <= 1n || primeQ! <= 1n) return { valid: false };

  const crtValues: bigint[] = [];
  let fieldIndex = 6;
  while (fieldIndex < fields.length && fields[fieldIndex]!.tag === 0x02 && crtValues.length < 3) {
    const parsed = positiveDerInteger(value, fields[fieldIndex]!);
    if (parsed === undefined || parsed <= 0n) return { valid: false };
    crtValues.push(parsed);
    fieldIndex++;
  }
  const primes = [primeP!, primeQ!];
  if (fieldIndex < fields.length) {
    const otherPrimeInfos = fields[fieldIndex++];
    if (otherPrimeInfos?.tag !== 0x30 || fieldIndex !== fields.length) return { valid: false };
    const otherPrimes = readDerChildren(value, otherPrimeInfos);
    if (!otherPrimes) return { valid: false };
    for (const info of otherPrimes) {
      if (info.tag !== 0x30) return { valid: false };
      const infoFields = readDerChildren(value, info);
      if (!infoFields || infoFields.length !== 3) return { valid: false };
      const prime = positiveDerInteger(value, infoFields[0]!);
      if (
        prime === undefined || prime <= 1n
        || !isCanonicalDerInteger(value, infoFields[1]!)
        || !isCanonicalDerInteger(value, infoFields[2]!)
      ) {
        return { valid: false };
      }
      primes.push(prime);
    }
  }
  if (exponent! < 3n || exponent! > 0x7FFFFFFFn || (exponent! & 1n) === 0n) {
    return { valid: false };
  }
  if (bitLength(modulus!) > 16_384 || primes.reduce((sum, prime) => sum + bitLength(prime), 0) > 16_384) {
    return {
      valid: true,
      runtimeValidation: true,
      publicKey: {
        algorithm: 'rsa',
        value: `${bigIntToEvenHex(modulus!)}:${bigIntToEvenHex(exponent!)}`
      }
    };
  }
  if (primes.reduce((product, prime) => product * prime, 1n) !== modulus) return { valid: false };
  if (primes.some(prime => modulo(privateExponent! * exponent!, prime - 1n) !== 1n)) {
    return { valid: false };
  }
  if (primes.length === 2 && crtValues.length === 3) {
    const [exponentP, exponentQ, coefficient] = crtValues;
    if (
      exponentP !== modulo(privateExponent!, primeP! - 1n)
      || exponentQ !== modulo(privateExponent!, primeQ! - 1n)
      || modulo(coefficient! * primeQ!, primeP!) !== 1n
    ) {
      return { valid: false };
    }
  }
  const modulusHex = bigIntToEvenHex(modulus!);
  const exponentHex = bigIntToEvenHex(exponent!);
  return {
    valid: true,
    runtimeValidation: true,
    publicKey: { algorithm: 'rsa', value: `${modulusHex}:${exponentHex}` }
  };
}

function parseEcPrivateKey(value: Uint8Array, curveOid?: string): PemValidationResult {
  const fields = readDerSequence(value);
  if (
    !fields || fields.length < 2 || !derIntegerEquals(value, fields[0]!, 1)
    || fields[1]!.tag !== 0x04 || fields[1]!.contentStart === fields[1]!.contentEnd
  ) {
    return { valid: false };
  }
  let parameters = curveOid;
  let optionalIndex = 2;
  if (fields[optionalIndex]?.tag === 0xA0) {
    const children = readDerChildren(value, fields[optionalIndex]!);
    if (!children || children.length !== 1 || children[0]!.tag !== 0x06) return { valid: false };
    if (!curveOid) {
      parameters = bytesToHex(value.slice(children[0]!.contentStart, children[0]!.contentEnd));
    }
    optionalIndex++;
  }
  if (fields[optionalIndex]?.tag === 0xA1) {
    const children = readDerChildren(value, fields[optionalIndex]!);
    if (
      !children || children.length !== 1 || children[0]!.tag !== 0x03
      || children[0]!.contentEnd - children[0]!.contentStart < 2
      || value[children[0]!.contentStart] !== 0
    ) {
      return { valid: false };
    }
  }
  const curve = parameters && EC_CURVES[parameters];
  if (!parameters || !curve) return { valid: false };
  let scalarStart = fields[1]!.contentStart;
  while (fields[1]!.contentEnd - scalarStart > curve.size) {
    if (value[scalarStart] !== 0) return { valid: false };
    scalarStart++;
  }
  const scalar = bytesToBigInt(value.slice(scalarStart, fields[1]!.contentEnd));
  if (scalar < 1n || scalar >= curve.n) return { valid: false };
  const publicPoint = encodeEcPoint(multiplyEcPoint(scalar, curve), curve);
  return publicPoint
    ? { valid: true, publicKey: { algorithm: 'ec', parameters, value: publicPoint } }
    : { valid: false };
}

function parseDsaPrivateKey(value: Uint8Array): PemValidationResult {
  const fields = readDerSequence(value);
  if (
    !fields || fields.length !== 6 || !derIntegerEquals(value, fields[0]!, 0)
    || fields.some(field => !isCanonicalDerInteger(value, field))
  ) {
    return { valid: false };
  }
  const parameters = fields.slice(1).map(field => positiveDerInteger(value, field));
  if (parameters.some(parameter => parameter === undefined)) return { valid: false };
  const [p, q, g, publicValue] = parameters as bigint[];
  const normalized = positiveDerIntegerHex(value, fields[4]!);
  return p && q && g && publicValue
    && bitLength(p) === 1024 && bitLength(q) === 160 && g < p && publicValue < p
    && normalized
    ? {
        valid: true,
        runtimeValidation: true,
        publicKey: { algorithm: 'dsa', value: normalized }
      }
    : { valid: false };
}

function parsePkcs8PrivateKey(value: Uint8Array): PemValidationResult {
  const fields = readDerSequence(value);
  if (
    !fields || fields.length < 3
    || (!derIntegerEquals(value, fields[0]!, 0) && !derIntegerEquals(value, fields[0]!, 1))
    || fields[1]!.tag !== 0x30 || fields[2]!.tag !== 0x04
  ) {
    return { valid: false };
  }
  const algorithm = parseAlgorithmIdentifier(value, fields[1]!);
  if (!algorithm) return { valid: false };
  const privateBytes = value.slice(fields[2]!.contentStart, fields[2]!.contentEnd);
  if (!privateBytes.length) return { valid: false };
  if (algorithm.oid === OID_RSA_ENCRYPTION) return parseRsaPrivateKey(privateBytes);
  if (algorithm.oid === OID_EC_PUBLIC_KEY) {
    const curve = algorithm.parameters
      && hasValidObjectIdentifier(value, algorithm.parameters)
      ? bytesToHex(value.slice(
          algorithm.parameters.contentStart,
          algorithm.parameters.contentEnd
        ))
      : undefined;
    return parseEcPrivateKey(privateBytes, curve);
  }
  if (algorithm.oid === OID_ED25519) {
    if (algorithm.parameters) return { valid: false };
    const nested = readSingleDer(privateBytes, 0x04);
    if (!nested || nested.contentEnd - nested.contentStart !== 32) return { valid: false };
    const publicKey = deriveEd25519PublicKey(
      privateBytes.slice(nested.contentStart, nested.contentEnd)
    );
    return publicKey
      ? { valid: true, publicKey: { algorithm: 'ed25519', value: publicKey } }
      : { valid: false };
  }
  return { valid: false };
}

function readSshUint32(value: Uint8Array, offset: number): number | undefined {
  if (offset + 4 > value.length) return undefined;
  return value[offset]! * 0x1000000
    + value[offset + 1]! * 0x10000
    + value[offset + 2]! * 0x100
    + value[offset + 3]!;
}

class SshMaterialCursor {
  private offset = 0;

  constructor(private readonly value: Uint8Array) {}

  readUint32(): number | undefined {
    const result = readSshUint32(this.value, this.offset);
    if (result === undefined) return undefined;
    this.offset += 4;
    return result;
  }

  readString(): Uint8Array | undefined {
    const length = this.readUint32();
    if (length === undefined || this.offset + length > this.value.length) return undefined;
    const result = this.value.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  remaining(): Uint8Array {
    return this.value.slice(this.offset);
  }
}

function sshPositiveBigInt(value: Uint8Array | undefined): bigint | undefined {
  if (!value || !value.length || (value[0]! & 0x80) !== 0) return undefined;
  return bytesToBigInt(value);
}

function validOpenSshPadding(value: Uint8Array): boolean {
  return value.every((byte, index) => byte === index + 1);
}

function parseUnencryptedOpenSshPrivateBlock(value: Uint8Array): boolean {
  const cursor = new SshMaterialCursor(value);
  const check1 = cursor.readUint32();
  const check2 = cursor.readUint32();
  const typeBytes = cursor.readString();
  if (check1 === undefined || check1 !== check2 || !typeBytes) return false;
  const keyType = new TextDecoder().decode(typeBytes);
  if (keyType === 'ssh-rsa') {
    const modulus = sshPositiveBigInt(cursor.readString());
    const exponent = sshPositiveBigInt(cursor.readString());
    const privateExponent = sshPositiveBigInt(cursor.readString());
    const coefficient = sshPositiveBigInt(cursor.readString());
    const primeP = sshPositiveBigInt(cursor.readString());
    const primeQ = sshPositiveBigInt(cursor.readString());
    if (
      !modulus || !exponent || !privateExponent || !coefficient || !primeP || !primeQ
      || exponent < 3n || (exponent & 1n) === 0n
    ) {
      return false;
    }
    if (
      bitLength(modulus) <= 16_384
      && (
        modulus !== primeP * primeQ
        || modulo(privateExponent * exponent, primeP - 1n) !== 1n
        || modulo(privateExponent * exponent, primeQ - 1n) !== 1n
      )
    ) {
      return false;
    }
  } else if (keyType === 'ssh-ed25519') {
    const publicKey = cursor.readString();
    const privateKey = cursor.readString();
    if (!publicKey || publicKey.length !== 32 || !privateKey || privateKey.length !== 64) {
      return false;
    }
  } else if ([
    'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521'
  ].includes(keyType)) {
    const curveNameBytes = cursor.readString();
    const encodedPoint = cursor.readString();
    const scalar = sshPositiveBigInt(cursor.readString());
    if (!curveNameBytes || !encodedPoint || !scalar) return false;
    const curveName = new TextDecoder().decode(curveNameBytes);
    const curveOid = curveName === 'nistp256'
      ? '2a8648ce3d030107'
      : curveName === 'nistp384'
      ? '2b81040022'
      : curveName === 'nistp521'
      ? '2b81040023'
      : undefined;
    const curve = curveOid && EC_CURVES[curveOid];
    if (
      !curve || scalar >= curve.n || !isValidEcPoint(encodedPoint, curve)
      || encodeEcPoint(multiplyEcPoint(scalar, curve), curve) !== bytesToHex(encodedPoint)
    ) {
      return false;
    }
  } else {
    return false;
  }
  if (cursor.readString() === undefined) return false;
  return validOpenSshPadding(cursor.remaining());
}

function parseOpenSshPrivateKey(value: Uint8Array): PemValidationResult {
  const magic = new TextEncoder().encode('openssh-key-v1\0');
  if (value.length < magic.length || magic.some((byte, index) => value[index] !== byte)) {
    return { valid: false };
  }
  let offset = magic.length;
  const readString = (): Uint8Array | undefined => {
    const length = readSshUint32(value, offset);
    if (length === undefined || offset + 4 + length > value.length) return undefined;
    offset += 4;
    const result = value.slice(offset, offset + length);
    offset += length;
    return result;
  };
  const cipher = readString();
  const kdf = readString();
  const kdfOptions = readString();
  const keyCount = readSshUint32(value, offset);
  if (!cipher || !kdf || !kdfOptions || keyCount !== 1) {
    return { valid: false };
  }
  offset += 4;
  const publicKey = readString();
  if (!publicKey) return { valid: false };
  const privateBlock = readString();
  if (!privateBlock?.length || offset !== value.length) return { valid: false };
  const decoder = new TextDecoder();
  const cipherName = decoder.decode(cipher);
  const kdfName = decoder.decode(kdf);
  if (cipherName === 'none' || kdfName === 'none') {
    if (cipherName !== 'none' || kdfName !== 'none' || kdfOptions.length !== 0) {
      return { valid: false };
    }
    return parseUnencryptedOpenSshPrivateBlock(privateBlock)
      ? { valid: true, encrypted: false, runtimeValidation: true }
      : { valid: false };
  }
  if (kdfName !== 'bcrypt' || !['aes256-ctr', 'aes256-cbc'].includes(cipherName)) {
    return { valid: false };
  }
  let kdfOffset = 0;
  const saltLength = readSshUint32(kdfOptions, kdfOffset);
  if (saltLength === undefined || kdfOffset + 4 + saltLength + 4 !== kdfOptions.length) {
    return { valid: false };
  }
  kdfOffset += 4 + saltLength;
  const rounds = readSshUint32(kdfOptions, kdfOffset);
  if (rounds === undefined || rounds === 0) return { valid: false };
  if (cipherName === 'aes256-cbc' && privateBlock.length % 16 !== 0) return { valid: false };
  return { valid: true, encrypted: true, runtimeValidation: true };
}

function parseLegacyEncryptedPrivateKey(block: PemBlock): PemValidationResult {
  if (!['RSA PRIVATE KEY', 'EC PRIVATE KEY', 'DSA PRIVATE KEY'].includes(block.label)) {
    return { valid: false };
  }
  if (block.headers['Proc-Type'] !== '4,ENCRYPTED') return { valid: false };
  const dekInfo = /^([A-Z0-9-]+),([0-9A-Fa-f]+)$/.exec(block.headers['DEK-Info'] || '');
  if (!dekInfo) return { valid: false };
  const cipherBlocks: Record<string, { iv: number; block: number }> = {
    'DES-CBC': { iv: 8, block: 8 },
    'DES-EDE3-CBC': { iv: 8, block: 8 },
    'AES-128-CBC': { iv: 16, block: 16 },
    'AES-192-CBC': { iv: 16, block: 16 },
    'AES-256-CBC': { iv: 16, block: 16 }
  };
  const cipher = cipherBlocks[dekInfo[1]!];
  if (
    !cipher || dekInfo[2]!.length !== cipher.iv * 2
    || !block.bytes.length || block.bytes.length % cipher.block !== 0
  ) {
    return { valid: false };
  }
  return { valid: true, encrypted: true, runtimeValidation: true };
}

function parsePrivateKeyBlock(block: PemBlock, allowOpenSsh: boolean): PemValidationResult {
  if ((block.headers['Proc-Type'] || '').includes('ENCRYPTED')) {
    return allowOpenSsh ? parseLegacyEncryptedPrivateKey(block) : { valid: false };
  }
  if (!allowOpenSsh) {
    for (const parser of [parseRsaPrivateKey, parsePkcs8PrivateKey, parseEcPrivateKey]) {
      const parsed = parser(block.bytes);
      if (parsed.valid) return parsed;
    }
    return { valid: false };
  }
  let parsed: PemValidationResult;
  switch (block.label) {
    case 'PRIVATE KEY':
      parsed = parsePkcs8PrivateKey(block.bytes);
      break;
    case 'RSA PRIVATE KEY':
      parsed = parseRsaPrivateKey(block.bytes);
      break;
    case 'EC PRIVATE KEY':
      parsed = parseEcPrivateKey(block.bytes);
      break;
    case 'DSA PRIVATE KEY':
      parsed = parseDsaPrivateKey(block.bytes);
      break;
    case 'OPENSSH PRIVATE KEY':
      return allowOpenSsh ? parseOpenSshPrivateKey(block.bytes) : { valid: false };
    default:
      return { valid: false };
  }
  if (
    allowOpenSsh && parsed.publicKey?.algorithm === 'ec'
    && parsed.publicKey.parameters === '2b81040021'
  ) {
    return { valid: false };
  }
  return parsed;
}

export function validateCertificatePem(
  values: string[],
  options: { usage?: 'tls-client' | 'trust' } = {}
): PemValidationResult {
  const blocks = extractPemBlocks(
    values,
    new Set(['CERTIFICATE'])
  );
  if (!blocks) return { valid: false };
  if (options.usage === 'trust') {
    for (const block of blocks) {
      if (Object.keys(block.headers).length > 0) continue;
      const parsed = parseX509Certificate(block.bytes);
      if (parsed.valid) return { ...parsed, runtimeValidation: true };
    }
    return { valid: false };
  }
  const parsed = parseX509Certificate(blocks[0]!.bytes);
  return parsed.valid ? { ...parsed, runtimeValidation: true } : parsed;
}

export function validatePrivateKeyPem(
  values: string[],
  labels: ReadonlySet<string>,
  allowOpenSsh = false
): PemValidationResult {
  const blocks = extractPemBlocks(
    values,
    labels,
    {
      labelSuffix: allowOpenSsh ? undefined : ' PRIVATE KEY',
      includeAnyLabel: allowOpenSsh
    }
  );
  if (!blocks) return { valid: false };
  if (allowOpenSsh && !labels.has(blocks[0]!.label)) return { valid: false };
  return parsePrivateKeyBlock(blocks[0]!, allowOpenSsh);
}

export function isValidX509CertificateBase64(value: string): boolean {
  const decoded = strictBase64Decode(value.replace(/\s+/g, ''));
  return Boolean(decoded && parseX509Certificate(decoded).valid);
}

export function publicKeyIdentitiesMatch(
  certificate: PublicKeyIdentity | undefined,
  privateKey: PublicKeyIdentity | undefined
): boolean | undefined {
  if (!certificate || !privateKey) return undefined;
  return certificate.algorithm === privateKey.algorithm
    && certificate.parameters === privateKey.parameters
    && certificate.value === privateKey.value;
}
