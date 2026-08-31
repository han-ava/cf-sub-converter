import { strictBase64Decode } from '../../utils';

type ParsedPublicKey = {
  certificate: boolean;
};

type CurveParameters = {
  coordinateLength: number;
  prime: bigint;
  b: bigint;
};

const ECDSA_ALGORITHMS = new Set([
  'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521'
]);

const CERTIFICATE_ALGORITHMS: Readonly<Record<string, string>> = {
  'ssh-rsa-cert-v01@openssh.com': 'ssh-rsa',
  'ssh-dss-cert-v01@openssh.com': 'ssh-dss',
  'ecdsa-sha2-nistp256-cert-v01@openssh.com': 'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384-cert-v01@openssh.com': 'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521-cert-v01@openssh.com': 'ecdsa-sha2-nistp521',
  'sk-ecdsa-sha2-nistp256-cert-v01@openssh.com': 'sk-ecdsa-sha2-nistp256@openssh.com',
  'ssh-ed25519-cert-v01@openssh.com': 'ssh-ed25519',
  'sk-ssh-ed25519-cert-v01@openssh.com': 'sk-ssh-ed25519@openssh.com'
};

const SECURITY_KEY_SIGNATURE_ALGORITHMS = new Set([
  'sk-ecdsa-sha2-nistp256@openssh.com',
  'sk-ecdsa-sha2-nistp256-cert-v01@openssh.com',
  'sk-ssh-ed25519@openssh.com',
  'sk-ssh-ed25519-cert-v01@openssh.com'
]);

const CURVES: Readonly<Record<string, CurveParameters>> = {
  nistp256: {
    coordinateLength: 32,
    prime: BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
    b: BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b')
  },
  nistp384: {
    coordinateLength: 48,
    prime: BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffff'),
    b: BigInt('0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aef')
  },
  nistp521: {
    coordinateLength: 66,
    prime: BigInt('0x01ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
    b: BigInt('0x0051953eb9618e1c9a1f929a21a0b68540eea2da725b99b315f3b8b489918ef109e156193951ec7e937b1652c0bd3bb1bf073573df883d2c34f1ef451fd46b503f00')
  }
};

class SshCursor {
  private offset = 0;

  constructor(private readonly data: Uint8Array) {}

  get done(): boolean {
    return this.offset === this.data.length;
  }

  skip(length: number): boolean {
    if (this.offset + length > this.data.length) return false;
    this.offset += length;
    return true;
  }

  readUint32(): number | null {
    if (this.offset + 4 > this.data.length) return null;
    const value = (
      this.data[this.offset]! * 0x1000000
      + this.data[this.offset + 1]! * 0x10000
      + this.data[this.offset + 2]! * 0x100
      + this.data[this.offset + 3]!
    );
    this.offset += 4;
    return value;
  }

  readString(): Uint8Array | null {
    const length = this.readUint32();
    if (length === null || this.offset + length > this.data.length) return null;
    const value = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
}

function asciiString(value: Uint8Array): string | null {
  let result = '';
  for (const byte of value) {
    if (byte > 0x7f) return null;
    result += String.fromCharCode(byte);
  }
  return result;
}

function unsignedBigInt(value: Uint8Array): bigint {
  let result = 0n;
  for (const byte of value) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

function positiveMpintNumber(value: Uint8Array): number | null {
  if (value.length > 0 && (value[0]! & 0x80) !== 0) return null;
  let first = 0;
  while (first < value.length && value[first] === 0) first++;
  if (value.length - first > 3) return null;

  let result = 0;
  for (; first < value.length; first++) {
    result = result * 0x100 + value[first]!;
  }
  return result;
}

function mpintBitLength(value: Uint8Array): number {
  let magnitude = value;
  if (value.length > 0 && (value[0]! & 0x80) !== 0) {
    magnitude = new Uint8Array(value.length);
    let carry = 1;
    for (let index = value.length - 1; index >= 0; index--) {
      const next = (value[index]! ^ 0xff) + carry;
      magnitude[index] = next & 0xff;
      carry = next > 0xff ? 1 : 0;
    }
  }

  let first = 0;
  while (first < magnitude.length && magnitude[first] === 0) first++;
  if (first === magnitude.length) return 0;
  return (magnitude.length - first - 1) * 8 + (32 - Math.clz32(magnitude[first]!));
}

function modulo(value: bigint, modulus: bigint): bigint {
  const result = value % modulus;
  return result < 0n ? result + modulus : result;
}

function hasValidCurvePoint(value: Uint8Array, curve: CurveParameters): boolean {
  if (value.length !== 1 + curve.coordinateLength * 2 || value[0] !== 0x04) return false;
  const x = unsignedBigInt(value.subarray(1, 1 + curve.coordinateLength));
  const y = unsignedBigInt(value.subarray(1 + curve.coordinateLength));
  if (x >= curve.prime || y >= curve.prime) return false;

  const left = modulo(y * y, curve.prime);
  const right = modulo(x * x * x - 3n * x + curve.b, curve.prime);
  return left === right;
}

function parseRsaFields(cursor: SshCursor): boolean {
  const exponentBytes = cursor.readString();
  const modulusBytes = cursor.readString();
  if (exponentBytes === null || modulusBytes === null) return false;
  const exponent = positiveMpintNumber(exponentBytes);
  return exponent !== null && exponent >= 3 && exponent % 2 === 1;
}

function parseDsaFields(cursor: SshCursor): boolean {
  const p = cursor.readString();
  const q = cursor.readString();
  const g = cursor.readString();
  const y = cursor.readString();
  return p !== null && q !== null && g !== null && y !== null && mpintBitLength(p) === 1024;
}

function parseEcdsaFields(cursor: SshCursor): boolean {
  const curveNameBytes = cursor.readString();
  const point = cursor.readString();
  if (curveNameBytes === null || point === null) return false;
  const curveName = asciiString(curveNameBytes);
  const curve = curveName === null ? undefined : CURVES[curveName];
  return curve !== undefined && hasValidCurvePoint(point, curve);
}

function parseSecurityKeyEcdsaFields(cursor: SshCursor): boolean {
  const curveNameBytes = cursor.readString();
  const point = cursor.readString();
  const application = cursor.readString();
  if (curveNameBytes === null || point === null || application === null) return false;
  return asciiString(curveNameBytes) === 'nistp256' && hasValidCurvePoint(point, CURVES.nistp256!);
}

function parseEd25519Fields(cursor: SshCursor): boolean {
  const key = cursor.readString();
  return key !== null && key.length === 32;
}

function parseSecurityKeyEd25519Fields(cursor: SshCursor): boolean {
  const key = cursor.readString();
  const application = cursor.readString();
  return key !== null && key.length === 32 && application !== null;
}

function parsePlainKeyFields(cursor: SshCursor, algorithm: string): boolean {
  if (algorithm === 'ssh-rsa') return parseRsaFields(cursor);
  if (algorithm === 'ssh-dss') return parseDsaFields(cursor);
  if (ECDSA_ALGORITHMS.has(algorithm)) return parseEcdsaFields(cursor);
  if (algorithm === 'sk-ecdsa-sha2-nistp256@openssh.com') return parseSecurityKeyEcdsaFields(cursor);
  if (algorithm === 'ssh-ed25519') return parseEd25519Fields(cursor);
  if (algorithm === 'sk-ssh-ed25519@openssh.com') return parseSecurityKeyEd25519Fields(cursor);
  return false;
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return left.length - right.length;
}

function hasValidStringSequence(value: Uint8Array): boolean {
  const cursor = new SshCursor(value);
  while (!cursor.done) {
    if (cursor.readString() === null) return false;
  }
  return true;
}

function hasValidOptionTuples(value: Uint8Array): boolean {
  const cursor = new SshCursor(value);
  let previousKey: Uint8Array | null = null;
  while (!cursor.done) {
    const key = cursor.readString();
    const encodedValue = cursor.readString();
    if (key === null || encodedValue === null) return false;
    if (previousKey !== null && compareBytes(key, previousKey) <= 0) return false;
    previousKey = key;

    if (encodedValue.length > 0) {
      const valueCursor = new SshCursor(encodedValue);
      if (valueCursor.readString() === null || !valueCursor.done) return false;
    }
  }
  return true;
}

function hasValidSignatureBody(value: Uint8Array): boolean {
  const cursor = new SshCursor(value);
  const formatBytes = cursor.readString();
  const signature = cursor.readString();
  if (formatBytes === null || signature === null) return false;
  const format = asciiString(formatBytes);
  return format !== null && SECURITY_KEY_SIGNATURE_ALGORITHMS.has(format) ? true : cursor.done;
}

function parseCertificate(cursor: SshCursor, underlyingAlgorithm: string): boolean {
  if (cursor.readString() === null || !parsePlainKeyFields(cursor, underlyingAlgorithm)) return false;
  if (!cursor.skip(8) || !cursor.skip(4)) return false;

  const keyId = cursor.readString();
  const principals = cursor.readString();
  if (keyId === null || principals === null || !hasValidStringSequence(principals)) return false;
  if (!cursor.skip(8) || !cursor.skip(8)) return false;

  const criticalOptions = cursor.readString();
  const extensions = cursor.readString();
  const reserved = cursor.readString();
  const signatureKeyBytes = cursor.readString();
  const signature = cursor.readString();
  if (
    criticalOptions === null
    || extensions === null
    || reserved === null
    || signatureKeyBytes === null
    || signature === null
    || !cursor.done
    || !hasValidOptionTuples(criticalOptions)
    || !hasValidOptionTuples(extensions)
  ) {
    return false;
  }

  const signatureKey = parsePublicKeyBlob(signatureKeyBytes);
  return signatureKey !== null && !signatureKey.certificate && hasValidSignatureBody(signature);
}

function parsePublicKeyBlob(value: Uint8Array): ParsedPublicKey | null {
  const cursor = new SshCursor(value);
  const algorithmBytes = cursor.readString();
  if (algorithmBytes === null) return null;
  const algorithm = asciiString(algorithmBytes);
  if (algorithm === null) return null;

  const underlyingAlgorithm = CERTIFICATE_ALGORITHMS[algorithm];
  if (underlyingAlgorithm !== undefined) {
    return parseCertificate(cursor, underlyingAlgorithm) ? { certificate: true } : null;
  }
  return parsePlainKeyFields(cursor, algorithm) && cursor.done ? { certificate: false } : null;
}

export function isValidSshPublicKeyBlob(value: Uint8Array, allowCertificate = true): boolean {
  const parsed = parsePublicKeyBlob(value);
  return parsed !== null && (allowCertificate || !parsed.certificate);
}

function indexOfFieldSeparator(value: string, start = 0): number {
  for (let index = start; index < value.length; index++) {
    if (value[index] === ' ' || value[index] === '\t') return index;
  }
  return -1;
}

function tokenAfter(value: string, separator: number): string | null {
  let start = separator;
  while (start < value.length && (value[start] === ' ' || value[start] === '\t')) start++;
  if (start === value.length) return null;
  const end = indexOfFieldSeparator(value, start);
  return value.slice(start, end === -1 ? value.length : end);
}

function optionsFieldEnd(value: string): number {
  let quoted = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!;
    if (character === '"' && (index === 0 || value[index - 1] !== '\\')) quoted = !quoted;
    if (!quoted && (character === ' ' || character === '\t')) return index;
  }
  return -1;
}

function authorizedKeyCandidates(line: string): string[] {
  const candidates: string[] = [];
  const firstSeparator = indexOfFieldSeparator(line);
  if (firstSeparator === -1) return candidates;

  const directCandidate = tokenAfter(line, firstSeparator);
  if (directCandidate !== null) candidates.push(directCandidate);

  const optionEnd = optionsFieldEnd(line);
  if (optionEnd === -1) return candidates;
  let algorithmStart = optionEnd;
  while (algorithmStart < line.length && (line[algorithmStart] === ' ' || line[algorithmStart] === '\t')) {
    algorithmStart++;
  }
  const algorithmEnd = indexOfFieldSeparator(line, algorithmStart);
  if (algorithmEnd === -1) return candidates;
  const optionCandidate = tokenAfter(line, algorithmEnd);
  if (optionCandidate !== null && optionCandidate !== directCandidate) candidates.push(optionCandidate);
  return candidates;
}

/**
 * Match golang.org/x/crypto/ssh ParseAuthorizedKey for Sing-box host_key values.
 * The textual key type is advisory; the algorithm encoded in the wire blob is authoritative.
 */
export function hasValidAuthorizedSshKey(value: string): boolean {
  if (!value) return false;
  for (const sourceLine of value.split('\n')) {
    const carriageReturn = sourceLine.indexOf('\r');
    const line = (carriageReturn === -1 ? sourceLine : sourceLine.slice(0, carriageReturn)).trim();
    if (!line || line.startsWith('#')) continue;

    for (const candidate of authorizedKeyCandidates(line)) {
      const decoded = strictBase64Decode(candidate);
      if (decoded !== null && isValidSshPublicKeyBlob(decoded)) return true;
    }
  }
  return false;
}
