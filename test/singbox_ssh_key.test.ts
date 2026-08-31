import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hasValidAuthorizedSshKey,
  isValidSshPublicKeyBlob
} from '../src/adapters/singbox/ssh-key';

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([
    Math.floor(value / 0x1000000) & 0xff,
    Math.floor(value / 0x10000) & 0xff,
    Math.floor(value / 0x100) & 0xff,
    value & 0xff
  ]);
}

function uint64(value: bigint): Uint8Array {
  const result = new Uint8Array(8);
  for (let index = result.length - 1; index >= 0; index--) {
    result[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return result;
}

function sshString(value: string | Uint8Array): Uint8Array {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return concat(uint32(bytes.length), bytes);
}

function fromHex(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, '');
  const result = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < result.length; index++) {
    result[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
}

function base64(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function publicKey(algorithm: string, ...fields: Uint8Array[]): Uint8Array {
  return concat(sshString(algorithm), ...fields);
}

function authorizedKey(blob: Uint8Array, textualAlgorithm = 'ssh-ed25519'): string {
  return `${textualAlgorithm} ${base64(blob)} fixture`;
}

const ED25519_KEY = new Uint8Array(32);
const ED25519_BLOB = publicKey('ssh-ed25519', sshString(ED25519_KEY));
const RSA_FIELDS = [sshString(new Uint8Array([0x01, 0x00, 0x01])), sshString(new Uint8Array([0x01]))];

const DSA_P = new Uint8Array(129);
DSA_P[1] = 0x80;
const DSA_FIELDS = [
  sshString(DSA_P),
  sshString(new Uint8Array([0x01])),
  sshString(new Uint8Array([0x01])),
  sshString(new Uint8Array([0x01]))
];

const CURVE_POINTS: Readonly<Record<string, Uint8Array>> = {
  nistp256: concat(
    new Uint8Array([0x04]),
    fromHex('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
    fromHex('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')
  ),
  nistp384: concat(
    new Uint8Array([0x04]),
    fromHex('aa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7'),
    fromHex('3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5f')
  ),
  nistp521: concat(
    new Uint8Array([0x04]),
    fromHex('00c6858e06b70404e9cd9e3ecb662395b4429c648139053fb521f828af606b4d3dbaa14b5e77efe75928fe1dc127a2ffa8de3348b3c1856a429bf97e7e31c2e5bd66'),
    fromHex('011839296a789a3bc0045c8a5fb42c7d1bd998f54449579b446817afbd17273e662c97ee72995ef42640c550b9013fad0761353c7086a272c24088be94769fd16650')
  )
};

function ecdsaFields(curve: string): Uint8Array[] {
  return [sshString(curve), sshString(CURVE_POINTS[curve]!)];
}

function securityKeyEcdsaFields(): Uint8Array[] {
  return [...ecdsaFields('nistp256'), sshString('ssh:')];
}

function securityKeyEd25519Fields(): Uint8Array[] {
  return [sshString(ED25519_KEY), sshString('ssh:')];
}

const PLAIN_KEY_FIXTURES: ReadonlyArray<readonly [string, Uint8Array[]]> = [
  ['ssh-rsa', RSA_FIELDS],
  ['ssh-dss', DSA_FIELDS],
  ['ecdsa-sha2-nistp256', ecdsaFields('nistp256')],
  ['ecdsa-sha2-nistp384', ecdsaFields('nistp384')],
  ['ecdsa-sha2-nistp521', ecdsaFields('nistp521')],
  ['sk-ecdsa-sha2-nistp256@openssh.com', securityKeyEcdsaFields()],
  ['ssh-ed25519', [sshString(ED25519_KEY)]],
  ['sk-ssh-ed25519@openssh.com', securityKeyEd25519Fields()]
];

const CERTIFICATE_FIXTURES: ReadonlyArray<readonly [string, Uint8Array[]]> = [
  ['ssh-rsa-cert-v01@openssh.com', RSA_FIELDS],
  ['ssh-dss-cert-v01@openssh.com', DSA_FIELDS],
  ['ecdsa-sha2-nistp256-cert-v01@openssh.com', ecdsaFields('nistp256')],
  ['ecdsa-sha2-nistp384-cert-v01@openssh.com', ecdsaFields('nistp384')],
  ['ecdsa-sha2-nistp521-cert-v01@openssh.com', ecdsaFields('nistp521')],
  ['sk-ecdsa-sha2-nistp256-cert-v01@openssh.com', securityKeyEcdsaFields()],
  ['ssh-ed25519-cert-v01@openssh.com', [sshString(ED25519_KEY)]],
  ['sk-ssh-ed25519-cert-v01@openssh.com', securityKeyEd25519Fields()]
];

type CertificateOverrides = {
  principals?: Uint8Array;
  criticalOptions?: Uint8Array;
  extensions?: Uint8Array;
  signatureKey?: Uint8Array;
  signature?: Uint8Array;
};

function certificate(
  algorithm: string,
  keyFields: Uint8Array[],
  overrides: CertificateOverrides = {}
): Uint8Array {
  const principals = concat(sshString('host.example'), sshString('*.host.example'));
  const criticalOptions = concat(
    sshString('force-command'),
    sshString(sshString('/bin/true')),
    sshString('source-address'),
    sshString(sshString('127.0.0.1'))
  );
  const extensions = concat(sshString('permit-port-forwarding'), sshString(new Uint8Array()));
  const signature = concat(sshString('ssh-ed25519'), sshString(new Uint8Array(64)));

  return concat(
    sshString(algorithm),
    sshString(new Uint8Array([0x01, 0x02, 0x03])),
    ...keyFields,
    uint64(1n),
    uint32(2),
    sshString('fixture'),
    sshString(overrides.principals ?? principals),
    uint64(0n),
    uint64(0xffffffffffffffffn),
    sshString(overrides.criticalOptions ?? criticalOptions),
    sshString(overrides.extensions ?? extensions),
    sshString(new Uint8Array()),
    sshString(overrides.signatureKey ?? ED25519_BLOB),
    sshString(overrides.signature ?? signature)
  );
}

describe('Sing-box SSH public key wire validation', () => {
  test('accepts every plain key format supported by x/crypto/ssh v0.48.0', () => {
    for (const [algorithm, fields] of PLAIN_KEY_FIXTURES) {
      expect(isValidSshPublicKeyBlob(publicKey(algorithm, ...fields))).toBe(true);
    }
  });

  test('rejects an algorithm-only and a truncated RSA blob', () => {
    expect(isValidSshPublicKeyBlob(sshString('ssh-rsa'))).toBe(false);
    expect(isValidSshPublicKeyBlob(publicKey('ssh-rsa', RSA_FIELDS[0]!))).toBe(false);
  });

  test('enforces RSA exponent and DSA parameter semantics', () => {
    expect(isValidSshPublicKeyBlob(publicKey(
      'ssh-rsa',
      sshString(new Uint8Array([0x04])),
      sshString(new Uint8Array([0x01]))
    ))).toBe(false);

    const shortP = new Uint8Array(128);
    shortP[1] = 0x40;
    expect(isValidSshPublicKeyBlob(publicKey(
      'ssh-dss',
      sshString(shortP),
      ...DSA_FIELDS.slice(1)
    ))).toBe(false);
  });

  test('rejects invalid ECDSA points and trailing public-key data', () => {
    const invalidPoint = new Uint8Array(CURVE_POINTS.nistp256!.length);
    invalidPoint[0] = 0x04;
    expect(isValidSshPublicKeyBlob(publicKey(
      'ecdsa-sha2-nistp256',
      sshString('nistp256'),
      sshString(invalidPoint)
    ))).toBe(false);
    expect(isValidSshPublicKeyBlob(concat(ED25519_BLOB, new Uint8Array([0x00])))).toBe(false);
  });

  test('accepts all eight OpenSSH certificate formats and can forbid certificates', () => {
    for (const [algorithm, fields] of CERTIFICATE_FIXTURES) {
      const blob = certificate(algorithm, fields);
      expect(isValidSshPublicKeyBlob(blob)).toBe(true);
      expect(isValidSshPublicKeyBlob(blob, false)).toBe(false);
    }
    expect(isValidSshPublicKeyBlob(ED25519_BLOB, false)).toBe(true);
  });

  test('validates certificate principals, ordered tuples, signature key, and signature body', () => {
    const [algorithm, fields] = CERTIFICATE_FIXTURES[6]!;
    expect(isValidSshPublicKeyBlob(certificate(algorithm, fields, {
      principals: new Uint8Array([0x00, 0x00, 0x00, 0x02, 0x01])
    }))).toBe(false);

    const unorderedTuples = concat(
      sshString('z-option'), sshString(new Uint8Array()),
      sshString('a-option'), sshString(new Uint8Array())
    );
    expect(isValidSshPublicKeyBlob(certificate(algorithm, fields, {
      criticalOptions: unorderedTuples
    }))).toBe(false);

    expect(isValidSshPublicKeyBlob(certificate(algorithm, fields, {
      signatureKey: certificate(algorithm, fields)
    }))).toBe(false);

    const signatureWithJunk = concat(
      sshString('ssh-ed25519'),
      sshString(new Uint8Array(64)),
      new Uint8Array([0x00])
    );
    expect(isValidSshPublicKeyBlob(certificate(algorithm, fields, {
      signature: signatureWithJunk
    }))).toBe(false);
  });

  test('matches security-key certificate signature trailing-field behavior', () => {
    const [algorithm, fields] = CERTIFICATE_FIXTURES[7]!;
    const securityKeySignature = concat(
      sshString('sk-ssh-ed25519@openssh.com'),
      sshString(new Uint8Array(64)),
      new Uint8Array([0x01, 0x02, 0x03])
    );
    expect(isValidSshPublicKeyBlob(certificate(algorithm, fields, {
      signature: securityKeySignature
    }))).toBe(true);
  });

  test('accepted fixtures pass the configured official Sing-box check', () => {
    const singBoxBin = process.env.SING_BOX_BIN ?? 'sing-box';
    const availability = spawnSync(singBoxBin, ['version'], { encoding: 'utf8' });
    if (availability.error || availability.status !== 0) return;

    const hostKeys = [
      ...PLAIN_KEY_FIXTURES.map(([algorithm, fields]) => authorizedKey(publicKey(algorithm, ...fields), algorithm)),
      ...CERTIFICATE_FIXTURES.map(([algorithm, fields]) => authorizedKey(certificate(algorithm, fields), algorithm))
    ];
    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-ssh-key-'));
    const configPath = join(workDir, 'config.json');
    try {
      writeFileSync(configPath, JSON.stringify({
        log: { disabled: true },
        outbounds: [{
          type: 'ssh',
          tag: 'ssh-fixture',
          server: 'ssh.example.com',
          server_port: 22,
          password: 'secret',
          host_key: hostKeys
        }]
      }), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).not.toContain('FATAL');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});

describe('Sing-box authorized_keys parsing', () => {
  test('uses the blob algorithm instead of the textual key-type field', () => {
    expect(hasValidAuthorizedSshKey(authorizedKey(ED25519_BLOB, 'ssh-rsa'))).toBe(true);
  });

  test('accepts quoted options, comments, and a later valid line', () => {
    const encoded = base64(ED25519_BLOB);
    expect(hasValidAuthorizedSshKey(
      `command="echo hello",no-port-forwarding ignored-type ${encoded} user@example`
    )).toBe(true);
    expect(hasValidAuthorizedSshKey(
      `# comment\nssh-rsa not-base64 invalid\nssh-ed25519 ${encoded} valid`
    )).toBe(true);
  });

  test('rejects the truncated RSA regression through authorized_keys', () => {
    const truncated = publicKey('ssh-rsa', RSA_FIELDS[0]!);
    expect(hasValidAuthorizedSshKey(authorizedKey(truncated, 'ssh-rsa'))).toBe(false);
  });
});
