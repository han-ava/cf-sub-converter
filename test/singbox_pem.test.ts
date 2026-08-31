import { describe, expect, test } from 'bun:test';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adaptNodeToSingBox } from '../src/adapters/singbox';
import {
  isValidX509CertificateBase64,
  publicKeyIdentitiesMatch,
  validateCertificatePem,
  validatePrivateKeyPem
} from '../src/adapters/singbox/pem';
import { parseSingboxOutbound } from '../src/parsers/singbox';

const CERTIFICATE_ONE = `-----BEGIN CERTIFICATE-----
MIIBgDCCASegAwIBAgIUKddtW5br5t4L3YJE0Icw68hlK1kwCgYIKoZIzj0EAwIw
FjEUMBIGA1UEAwwLb25lLmV4YW1wbGUwHhcNMjYwODMwMjAxMzA4WhcNMzYwODI3
MjAxMzA4WjAWMRQwEgYDVQQDDAtvbmUuZXhhbXBsZTBZMBMGByqGSM49AgEGCCqG
SM49AwEHA0IABByNt+077yk+NEQEFJT4Cr4baT+rxNeks9c3Dt3DasKe05iUbMxR
NfW3RZseY14M/8Aux3/ROl2EeuaxcWk31u+jUzBRMB0GA1UdDgQWBBRnsQyb7Tho
wskOKh4P09mqj/+FqzAfBgNVHSMEGDAWgBRnsQyb7ThowskOKh4P09mqj/+FqzAP
BgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0cAMEQCICLDVuVRaYhZjU0ZpC4G
Ot/TK3iTyWym6pv6bG6V5+flAiA8Zf+kThCbDwVGIC+307DGhzuOXTNqiKt1x3Ln
Uk87Cw==
-----END CERTIFICATE-----`;

const PRIVATE_KEY_ONE = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg1YDge+uadbAAvaWz
FI1JHL3oJYPDqHIHIHPzdAlwVNmhRANCAAQcjbftO+8pPjREBBSU+Aq+G2k/q8TX
pLPXNw7dw2rCntOYlGzMUTX1t0WbHmNeDP/ALsd/0TpdhHrmsXFpN9bv
-----END PRIVATE KEY-----`;

const PRIVATE_KEY_TWO = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQghs5NSBAZW/ZhsrVt
NAZGu/3ouxS8ylPPZVVIjv3sYdWhRANCAATyNraCg5R9KqSZkPVZiTedAqy1qmic
1TPbFui20CjuJxZMTDGc9HkWEbxcoS0a7jn5V939tuK1ru+bbTfhiYEE
-----END PRIVATE KEY-----`;

const ED25519_CERTIFICATE_A = `-----BEGIN CERTIFICATE-----
MIIBOTCB7KADAgECAgFlMAUGAytlcDAcMRowGAYDVQQDDBFlZDI1NTE5LWEuZXhh
bXBsZTAeFw0yNjA4MzAyMDQwMzZaFw0zNjA4MjcyMDQwMzZaMBwxGjAYBgNVBAMM
EWVkMjU1MTktYS5leGFtcGxlMCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7h
cvPapiMlrwIaaPcHURqjUzBRMB0GA1UdDgQWBBRbJ6pViReXcOR1dbFiod7Ze4v8
bTAfBgNVHSMEGDAWgBRbJ6pViReXcOR1dbFiod7Ze4v8bTAPBgNVHRMBAf8EBTAD
AQH/MAUGAytlcANBAHVriXYriruVu/ZEozlcggAh0g/C0fMQxFOMTC6qjDW//Y6D
rxb5R8x/L0l9lEff8b/RgQtOh8KjegzNWTnIrwc=
-----END CERTIFICATE-----`;

const ED25519_PRIVATE_KEY_A = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIJ1hsZ3v/VpguoRK9JLsLMREScVpezJpGXA7rAMcrn9g
-----END PRIVATE KEY-----`;

const ED25519_CERTIFICATE_B = `-----BEGIN CERTIFICATE-----
MIIBOTCB7KADAgECAgFmMAUGAytlcDAcMRowGAYDVQQDDBFlZDI1NTE5LWIuZXhh
bXBsZTAeFw0yNjA4MzAyMDQwMzZaFw0zNjA4MjcyMDQwMzZaMBwxGjAYBgNVBAMM
EWVkMjU1MTktYi5leGFtcGxlMCowBQYDK2VwAyEAPUAXw+hDiVqStwqnTRt+vJyY
LM8uxJaMwM1V8Sr0ZgyjUzBRMB0GA1UdDgQWBBQT93JmnhUq5qYqYKNIim8pfQYT
3TAfBgNVHSMEGDAWgBQT93JmnhUq5qYqYKNIim8pfQYT3TAPBgNVHRMBAf8EBTAD
AQH/MAUGAytlcANBAHbgm517pJ05Of1KajvFubbB2R8H63aTaOxX/fKgp1Z9sMER
+yD3jckS6mellUB6Pkjl451Z8ifTsCoqwBcEkgQ=
-----END CERTIFICATE-----`;

const ED25519_PRIVATE_KEY_B = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIEzNCJso/5banbbDRuwRTg9bijGfNaumJNqM9u1PuKb7
-----END PRIVATE KEY-----`;

const ED25519_PUBLIC_KEY_A = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const ED25519_PUBLIC_KEY_B = '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c';
const ED25519_PRIVATE_KEY_A_WITH_RSA_LABEL = ED25519_PRIVATE_KEY_A
  .replaceAll('PRIVATE KEY', 'RSA PRIVATE KEY');
const ED25519_PRIVATE_KEY_A_WITH_CUSTOM_LABEL = ED25519_PRIVATE_KEY_A
  .replaceAll('PRIVATE KEY', 'CUSTOM PRIVATE KEY');
const ED25519_PRIVATE_KEY_A_WITH_HYPHEN_LABEL = ED25519_PRIVATE_KEY_A
  .replaceAll('PRIVATE KEY', 'FOO-BAR PRIVATE KEY');
const ED25519_PRIVATE_KEY_A_WITH_HEADER = ED25519_PRIVATE_KEY_A
  .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\nFoo: Bar\n');
const ED25519_PRIVATE_KEY_A_WITH_UNDERSCORE_HEADER = ED25519_PRIVATE_KEY_A
  .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\nFoo_Bar: Baz\n');
const ED25519_PRIVATE_KEY_A_WITH_PREFIXED_BEGIN = ED25519_PRIVATE_KEY_A
  .replace('-----BEGIN PRIVATE KEY-----', 'x-----BEGIN PRIVATE KEY-----');
const ED25519_PRIVATE_KEY_A_WITH_HEADER_AFTER_BLANK = ED25519_PRIVATE_KEY_A
  .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n\nFoo: Bar');

const P224_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIBbzCCAR6gAwIBAgIUbrucLFTdtjUhU7DblJ13GC9NVGwwCgYIKoZIzj0EAwIw
FzEVMBMGA1UEAwwMcDIyNC5leGFtcGxlMB4XDTI2MDgzMDIwMzM0OVoXDTM2MDgy
NzIwMzM0OVowFzEVMBMGA1UEAwwMcDIyNC5leGFtcGxlME4wEAYHKoZIzj0CAQYF
K4EEACEDOgAE1xd4/tjEUV0+6bHDs7C15y9zBi7k9dH8e09p8YGSqlAVksW5ak8C
T0ge7lC3NwaY/KwUVbfySZmjUzBRMB0GA1UdDgQWBBSHWUqJH75JNWwpMyV2rM+9
K61uazAfBgNVHSMEGDAWgBSHWUqJH75JNWwpMyV2rM+9K61uazAPBgNVHRMBAf8E
BTADAQH/MAoGCCqGSM49BAMCAz8AMDwCHAD4NedQZ9MiYyYXE6kHl2AnrrNXpETL
U+HTVLECHBqaQ6DJFW5Cawk8NjogKdoFy+e/rfeEfm/6rwU=
-----END CERTIFICATE-----`;

const P224_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MHgCAQAwEAYHKoZIzj0CAQYFK4EEACEEYTBfAgEBBByAY99SjkrgQWx8dnXwt+hM
QPSVxKlFexpQy3cPoTwDOgAE1xd4/tjEUV0+6bHDs7C15y9zBi7k9dH8e09p8YGS
qlAVksW5ak8CT0ge7lC3NwaY/KwUVbfySZk=
-----END PRIVATE KEY-----`;

const P224_PRIVATE_KEY_WITH_INNER_CURVE = `-----BEGIN PRIVATE KEY-----
MIGBAgEAMBAGByqGSM49AgEGBSuBBAAhBGowaAIBAQQcgGPfUo5K4EFsfHZ18Lfo
TED0lcSpRXsaUMt3D6AHBgUrgQQAIaE8AzoABNcXeP7YxFFdPumxw7OwtecvcwYu
5PXR/HtPafGBkqpQFZLFuWpPAk9IHu5QtzcGmPysFFW38kmZ
-----END PRIVATE KEY-----`;

const PKCS8_EC_KEY_WITH_INNER_CURVE_ONLY = `-----BEGIN PRIVATE KEY-----
MIGJAgEAMAkGByqGSM49AgEEeTB3AgEBBCDFlaWqtr1dQDuNO1N2ehT3C2zyzbhv
EavtpGkV0u54D6AKBggqhkjOPQMBB6FEA0IABH2eV9GK38KeYkYKvD74zQspE1Ht
foqm3OYnwWqfyEtf3/UkK5HSkiM0iDMSd3384/1Cz/1wiO6IF8ZW99i4TME=
-----END PRIVATE KEY-----`;

const EC_KEY_WITH_REORDERED_OPTIONAL_FIELDS = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIPbwhHD6Fk+aHrVqRxyrBNXF7bBNhLRatnwl6rVGFCsioUQDQgAEFa4n
6z5D2OYpf88TtFnzRm9GNAyZgfmqWq6WY7SLsC/GWHuCGh55ialVfQCLmpRQ3HzN
NMYPfxrvUzy/pUoY26AKBggqhkjOPQMBBw==
-----END EC PRIVATE KEY-----`;

const EC_KEY_WITH_TRAILING_OPTIONAL_FIELD = `-----BEGIN EC PRIVATE KEY-----
MIGDAgEBBCD28IRw+hZPmh61akccqwTVxe2wTYS0WrZ8Jeq1RhQrIqAKBggqhkjO
PQMBB6FEA0IABBWuJ+s+Q9jmKX/PE7RZ80ZvRjQMmYH5qlqulmO0i7Avxlh7ghoe
eYmpVX0Ai5qUUNx8zTTGD38a71M8v6VKGNugCgYIKoZIzj0DAQc=
-----END EC PRIVATE KEY-----`;

const RSA_512_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIBPQIBAAJBAOFxTBC8wg3Hj6S+9em3uG/aW/FLFCf2CtV26tyteZfkJnExUnV2
RMVkpExG/ns2jfb+KfWhdk++ulCVVqC9nwECAwEAAQJBANTNA0YRRwOGyhpyfuH8
n8ZFUeB0RDRsVVGmDI/91/b8iVIgeaL4OX7xnK/zGjK2OslQUW+fMSJwEdXyvG0b
byECIQD48Ne4V6y62TWF6H+veZ/KkXCC3/42rBCXNZbAJrlUJQIhAOfV3y1dmXvK
MB0Iw01cJgGpn3PJf+viA4Qny7xK5BqtAiEA+KfpchLxT/niwo0H7Yj5GWfJEJEY
5hdcww0eNXT4rZkCIQDnqX9qBa3pVRDe8nK2Su5vmuALA78gJqj81gdwECX/wQIh
AKFN0rgFM/iuR4B4VlZoZqRFnvnfJTi5gHFur23wp14g
-----END RSA PRIVATE KEY-----`;
const RSA_512_PRIVATE_KEY_WITH_HEADER = RSA_512_PRIVATE_KEY
  .replace('-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\nFoo: Bar\n');

const RSA_D_TOO_SMALL_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MBwCAQACAgDhAgEFAgEFAgEJAgEZAgEFAgEFAgEE
-----END RSA PRIVATE KEY-----`;

const RSA_PARTIAL_CRT_STALE_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIDnwIBAAKCAQEAwwamyB3fOgkuq2pyUOKJEi9YtdUvgbsnPK9t6ANnt1CExClgAdePVfaQRUPH3FSU8NRTrbFT3jI84pQoPsqKGqHIK/fgal2pOEIN5cESZxJu0qtjB93F60Q7riQ1mNE255r717CYY+j+QBfNdwxYR/A/NRDpHSc5J8YTMTElWJfyeP5/tqKhRfy7NSjJk/ywHLxjPl2DtTkPylbOYJShSFHuu1d9BlMA3V1LvHwZGC8z2TsCQAOuD4XOefRiaq+xA2HqQhWAQEoYPucdLqcnZgQQd+A9mJj2/vp6yZwlmp8BZqQSQC44d3wSrtu6vIWzkyqD7fG7xjKqn2o40wTxVQIDAQABAoIBABGkYeT7csyUtRCTngi8HWs0NkGoqdYCAKAoPHh/ClxWX9RA6+ruvYwotE9XvNYtHpYUlwdA4dXZVJGolmVrvAeBuBJmJ3pnw52PuCMfDpOdYsIS9+/nu3Y3Y3Cy3NhYoK9d4UdXNcnf81QH8zHAP6IuVQFvaK8W88Ap1mWeTQMQ/yVZzfHJtjQAcLnxpJA/U0WVVfHRxlD1LUM4WlNGgElFZIvRnCt4JyN/P2DuXuPDnc+D4odUfttAh6SdV3hx/UdyoWx+hi2x+O4Eu+HwpET+R7ZvZVt5LDUMS2d0rlR5V9KLD36ZQ5kx2mxWbgQWv5R6V8VqekCS1Q4Hz8+IcxcCgYEA9dskSNFdzhDYYqzOg6sR7EAYeelX0HBtqRkAItrEtuuAs9PRxyGS13Yt/IVoRmkfkL6aoBipQh1gyDpk4aV8nTh/VP2fQXydlLOg3tLVIVhI/a3yoH9w67Ecl3YAUUJgKVTj0N1qlEZd26bcUWDZR4Jv6G8tpJmdvgjsTE923G8CgYEAyxKd2xwftg0QRz5YexIYXRguvOnbyXm2pJ58Jjz+l3xrEjfwzO1lAF/ZUcFPuR1eB4mzqXVQ3tywPsmysSoCA4QSXmDxMkEAPKQNqKnThqQ8oTwCIjtPvdPWI5dQL2hCHO0/DjWK0/O87CsWvFoFbtc8h20jJZKolnJ8B+A7eHsCAQECgYBAZFXTvZY8luXbgWRzGejJ1Do1wv3jZAnLJ0n8ogikploZO83KXVhShxIU/3Q1IZ/IShzDFiUfleD49+IGlWhwDvf4H0s8ASp/EBIYskkVf4yOH8YZbq85ZSuYu4k8jxWvsHb3HXk4/iegx4T9Epp4bB2QX8XuSxPUKNc1dB/Hcw==
-----END RSA PRIVATE KEY-----`;

const RSA_MULTIPRIME_STALE_CRT_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEKgIBAQKCAQEAoAF3f2ygeZVXhrGSxrit7A3ySj88IdO33OvvFlM6Wr5Gk4/advXy40LA5Tt4vLhBYgsFBR6f0lxQZrD+UqVas5VZdDokpDrv5vWKfC900zlmirlIMlMMXj4i6UMWUm5VzTwfoCwzZmgkRC5A9Ff2LgRQrYGlF6oG3nLpEoc4SVITAA092+w/G27WdDuc5/VJLhkg0wChSIGVZLFZaDQ4uGGH3p8ySLLMUyvAF2+lpkSXrqi7OvXA6y10Ts+EmfI2irFG8tQ5i4Bk8JmraVz/68jNOX7U7fZKcXSivAEjLAiKdSqpL+P19M8y+zdCUnnVgYcU9JMs7sn80u2puGaJzQIDAQABAoIBAHayP9yWT8GCKQjxqAmlLNhlTC0KFeieL9JCb/2mxi5U4vRKje0b7Q/sED69TIbrRQ2fUR0IJ9Wcx8Q2XqQeqFd6Xn7bNx1h31/9HLudVNPwzAHzCvyOHn5+lX+UqY5G80S+34mYuqT4IG5siUQ1WEwvLYwqdZDaKjERjYsUWs62uLKV1nfxMv99gVPDvKRYDwqlzYQ9loibDP/Jb1TljR0+D8nkA2PSr9pL25L/RiKzR+LodnMCkqr2LRlCcVw5ZYPQx+XTdmOpH25sQbMH1gTfQ3XfChxxL03U/XwwFrEp3sOzG0YtP8TY4pLuMQ3lgjrucsgvQz5J/Ggum1xtsjECVgaQkgBq4SXDYwr6SUqWIGg4CjyC1yJtdAoSzT5i3kGtfWpc2zWqUc9fEESc0vTCNQpRs4hwdiBBHJ+agdGZsWF6hmGkb6FJB3B0sgeexQodK38CHT2dAlYGgaXS6X3pcIgEI87jtNhEGr34cOBCibZD5vZLR90xd4AIB9pQtt4YrHsvivsoMudUGHnXBk5N0M+mK1OfkBwNBMSqMc0U1bFPo1JBCwUseZpGGvm78wJWA2v3riAHmxds2Jv899OosKoFK+VHHbrPcTC7qnj+QF2dsYMU/7P3UI/MevcDPnC8FNThL4zvBYDq2oY+hHIH8zdaNCrxxK+8IPGymiY3rj3mHh2MAEECVW6VEsabrGbjMNsrviRgg0z/NcJQsToxVpq72U2hGsqjPmU/EkLBxgOVfheNCyMuBoBFfogVpMbrMk4IFDzeD+M0J1R9GBgD2JSwPk87/bLpEiRyVg8CVgXGhLFv+zY2qVS2F4bjVrzt/MDFt9FAXQFkhdCC2UtHSRzFOymHYrPFKO/wNedKxgEn8CCSdoZm4vw3L0yyWHp0foRapua2xhG8cUgPtc+cNsZdAW5lMGAwXgJWA77+Scrhryu/eSRD5yClzBP8WoxF37NiapkyOmTtNZQoQ1+N4kWqpQJ2z9rZyBgnV8ZeZmvu6KhsKTND3RGEsHibYhGC57xzyjxMNVeQEccHCCtrK4sCAQECAQE=
-----END RSA PRIVATE KEY-----`;

const ONE_BIT_DSA_PRIVATE_KEY = `-----BEGIN DSA PRIVATE KEY-----
MBICAQACAQECAQECAQECAQECAQE=
-----END DSA PRIVATE KEY-----`;

const ENCRYPTED_OPENSSH_PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAACmFlczI1Ni1jdHIAAAAGYmNyeXB0AAAAGAAAABCtngXXGx
623ztTMgX9o73gAAAAGAAAAAEAAAAzAAAAC3NzaC1lZDI1NTE5AAAAIHFrk1CltNOD1H0n
xiCCMk7LTHk7USmgyjpL5awAC1pjAAAAoCwkNfJbVilVKJansVNzz11QjPn+HJdoslhepH
R262RuoixymKsa6bl0pTCBi1b3VykTHp/X3WV9ec0s5CgU61nssMdVGXyGFEv4gQQe41Lm
EDXIb3wSRkyGWW7NfTT24tMP/PG6Cs05x+NM6sOuij9ywff03PcQ473u6dW2S7biVa/ZnT
XjUGLGvSutMjMCbCPDY0CCiEqZsDQnZu3wlak=
-----END OPENSSH PRIVATE KEY-----`;

const OPENSSH_RSA_STALE_IQMP_PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABFwAAAAdzc2gtcnNhAAAAAwEAAQAAAQEAvqwNQgMSJw7sXcD7Ta0T5nf3lPGIYF/o/ie8ZIipGu5XAx00wnYxzYGkzXBfCpJDRDYD/7Gh58KMsBk/3YW8wGzsS+afw5nshMMLTVd5l1AQvsrNBq+NfX1aIpuHTMBNC9DQRzcGi1LQU/1Tm7DbrYpbS6dAxnkl8+mF8QVG9WaOx2DklMMYqi8U4HiWMdERNa6WZhSxBk+YQrZv90UDOchuWfwwucLHHhRg+dimHc98fQ0Bqo8AT2m1Vo0DQVG7QmCNoytuD1gsx0XrBo6FFtzCKuOxP4LNMBKXZ8ZUWIiW3TD5u7/XQrXAAMBH5F16pnsUp10BcQov5cDtsWd3cQAAA0jwvp968L6fegAAAAdzc2gtcnNhAAABAQC+rA1CAxInDuxdwPtNrRPmd/eU8YhgX+j+J7xkiKka7lcDHTTCdjHNgaTNcF8KkkNENgP/saHnwoywGT/dhbzAbOxL5p/DmeyEwwtNV3mXUBC+ys0Gr419fVoim4dMwE0L0NBHNwaLUtBT/VObsNutiltLp0DGeSXz6YXxBUb1Zo7HYOSUwxiqLxTgeJYx0RE1rpZmFLEGT5hCtm/3RQM5yG5Z/DC5wsceFGD52KYdz3x9DQGqjwBPabVWjQNBUbtCYI2jK24PWCzHResGjoUW3MIq47E/gs0wEpdnxlRYiJbdMPm7v9dCtcAAwEfkXXqmexSnXQFxCi/lwO2xZ3dxAAAAAwEAAQAAAQEAuu48tToDgu1bh/LZrWaAuxNkU86UMD/3UaytQzbD61Y9Uh1BC2ELJHn0k0CWvOt2LRpzwytoGqoeecrXVRt3WIOxChyZBxAR1HrPysx2tYTWVebHKMXVhnDtfD5UYEergWj/uMHWlaLkAWO7o0i5piKdrMbVd39wWPfZy9irn4tyITv66LHOIpfGumm7QO3ngC0bqxOcDRzu/CTJeELXwtsU9ZoPfa+3eOSQ7enfVB+w7AsManeIHaBGjWdE6X2zq3hNoFv02OH4VUe/yZT7YeX1Z6KF2wnhZ/WQKCpGxaAo6pLKo1nn1EV8hKR69FY9Uhw6mfesr4pQyTHBorIk0QAAAAEBAAAAgQDh6Y+VNoXP75qQKy5hDeF+zTB99HCZUPhisZR3cC9MG4Ub64r4IhSZkojTicYCZwiQe8+X8i3AzyS5g5KNDJ33rtS8I4Z1yPfuzYFJnb6YAnX14/3Fr0Mw35Iqu/7elKR308nmTi0AsAGQylH3C2Tyo8Z/PWnWB2f9OAFno0oszQAAAIEA2BD7A48JgwbPPif2WYwE3NkQi7YLKfMuo9SGemoBcFEtCcL9mBte/u3ychdTXmHEMD0BcDd5QGemAaeQuicAYPx/qFx98CW9nG2gGPaVykzySSMLBEfA/EVRURijcxJ4n+mQjm3Wn6TOvbml95gk8EGe1oy0WGlKeghnBf7c9TUAAAAQaGFuQEhILU1CUC5sb2NhbAE=
-----END OPENSSH PRIVATE KEY-----`;

const CERTIFICATE_ONE_WITH_HEADER = CERTIFICATE_ONE.replace(
  '-----BEGIN CERTIFICATE-----\n',
  '-----BEGIN CERTIFICATE-----\nComment: ignored by x509.CertPool\n\n'
);
const MALFORMED_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MAMCAQE=
-----END CERTIFICATE-----`;

const PRIVATE_KEY_LABELS = new Set(['PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY']);
const singBoxBin = process.env.SING_BOX_BIN ?? 'sing-box';

function replacePemBytes(
  pem: string,
  expectedHex: string,
  replacementHex: string,
  occurrence = 1
): string {
  const match = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(pem);
  if (!match) throw new Error('invalid PEM test fixture');
  const bytes = Buffer.from(match[2]!.replace(/\s+/g, ''), 'base64');
  const expected = Buffer.from(expectedHex, 'hex');
  const replacement = Buffer.from(replacementHex, 'hex');
  if (expected.length !== replacement.length) throw new Error('replacement must preserve DER length');
  let offset = -1;
  for (let index = 0; index < occurrence; index++) {
    offset = bytes.indexOf(expected, offset + 1);
    if (offset < 0) throw new Error('expected DER bytes are missing from test fixture');
  }
  replacement.copy(bytes, offset);
  const body = bytes.toString('base64').match(/.{1,64}/g)?.join('\n');
  if (!body) throw new Error('failed to encode PEM test fixture');
  return `-----BEGIN ${match[1]}-----\n${body}\n-----END ${match[1]}-----`;
}

function checkWithOfficialCli(outbound: Record<string, unknown>): {
  status: number | null;
  stderr: string;
  error: Error | undefined;
} | undefined {
  const availability = spawnSync(singBoxBin, ['version'], { encoding: 'utf8' });
  if (availability.error || availability.status !== 0) return undefined;

  const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-pem-'));
  const configPath = join(workDir, 'config.json');
  try {
    writeFileSync(configPath, JSON.stringify({ outbounds: [outbound] }), 'utf8');
    const checked = spawnSync(
      singBoxBin,
      ['check', '--disable-color', '-D', workDir, '-c', configPath],
      { encoding: 'utf8' }
    );
    return { status: checked.status, stderr: checked.stderr, error: checked.error };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

describe('Sing-box inline certificate and private-key validation', () => {
  test('accepts a real X.509/PKCS#8 pair and detects a mismatched private key', () => {
    const certificate = validateCertificatePem([CERTIFICATE_ONE]);
    const matchingKey = validatePrivateKeyPem([PRIVATE_KEY_ONE], PRIVATE_KEY_LABELS);
    const mismatchedKey = validatePrivateKeyPem([PRIVATE_KEY_TWO], PRIVATE_KEY_LABELS);

    expect(certificate.valid).toBe(true);
    expect(matchingKey.valid).toBe(true);
    expect(mismatchedKey.valid).toBe(true);
    expect(publicKeyIdentitiesMatch(certificate.publicKey, matchingKey.publicKey)).toBe(true);
    expect(publicKeyIdentitiesMatch(certificate.publicKey, mismatchedKey.publicKey)).toBe(false);
  });

  test('derives RFC 8032 Ed25519 identities from fixed PKCS#8 seeds', () => {
    const certificateA = validateCertificatePem([ED25519_CERTIFICATE_A]);
    const keyA = validatePrivateKeyPem([ED25519_PRIVATE_KEY_A], new Set(['PRIVATE KEY']));
    const certificateB = validateCertificatePem([ED25519_CERTIFICATE_B]);
    const keyB = validatePrivateKeyPem([ED25519_PRIVATE_KEY_B], new Set(['PRIVATE KEY']));

    expect(certificateA).toMatchObject({
      valid: true,
      publicKey: { algorithm: 'ed25519', value: ED25519_PUBLIC_KEY_A }
    });
    expect(keyA).toMatchObject({
      valid: true,
      publicKey: { algorithm: 'ed25519', value: ED25519_PUBLIC_KEY_A }
    });
    expect(certificateB).toMatchObject({
      valid: true,
      publicKey: { algorithm: 'ed25519', value: ED25519_PUBLIC_KEY_B }
    });
    expect(keyB).toMatchObject({
      valid: true,
      publicKey: { algorithm: 'ed25519', value: ED25519_PUBLIC_KEY_B }
    });
    expect(publicKeyIdentitiesMatch(certificateA.publicKey, keyA.publicKey)).toBe(true);
    expect(publicKeyIdentitiesMatch(certificateB.publicKey, keyB.publicKey)).toBe(true);
    expect(publicKeyIdentitiesMatch(certificateA.publicKey, keyB.publicKey)).toBe(false);
  });

  test('emits a matching Ed25519 pair accepted by sing-box 1.13.21', () => {
    const node = parseSingboxOutbound({
      type: 'http', tag: 'ed25519-match', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        client_certificate: ED25519_CERTIFICATE_A,
        client_key: ED25519_PRIVATE_KEY_A
      }
    }, 'ed25519-match');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: true, fatal: false });

    const checked = checkWithOfficialCli(result.config);
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.stderr).toBe('');
    expect(checked.status).toBe(0);
  });

  test('rejects a mismatched Ed25519 certificate and PKCS#8 key', () => {
    const node = parseSingboxOutbound({
      type: 'http', tag: 'ed25519-mismatch', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        client_certificate: ED25519_CERTIFICATE_A,
        client_key: ED25519_PRIVATE_KEY_B
      }
    }, 'ed25519-mismatch');
    expect(node).not.toBeNull();

    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: false, fatal: true });
    expect(result.unsupportedParams).toContain('tls.client_key');
  });

  test('accepts a trust bundle when at least one headerless certificate is valid', () => {
    const node = parseSingboxOutbound({
      type: 'http', tag: 'mixed-trust-bundle', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        certificate: [
          CERTIFICATE_ONE_WITH_HEADER,
          MALFORMED_CERTIFICATE,
          CERTIFICATE_ONE
        ]
      }
    }, 'mixed-trust-bundle');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);

    expect(result).toMatchObject({ emitted: true, fatal: false });
    expect(result.warnings).toContainEqual(expect.objectContaining({
      level: 'warn', field: 'tls.certificate'
    }));
    expect(result.unsupportedParams).not.toContain('tls.certificate');

    const checked = checkWithOfficialCli(result.config);
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.stderr).toBe('');
    expect(checked.status).toBe(0);
  });

  test('rejects a trust bundle containing only a certificate with PEM headers', () => {
    const node = parseSingboxOutbound({
      type: 'http', tag: 'header-only-trust', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, certificate: CERTIFICATE_ONE_WITH_HEADER }
    }, 'header-only-trust');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);

    expect(result).toMatchObject({ emitted: false, fatal: true });
    expect(result.unsupportedParams).toContain('tls.certificate');

    const checked = checkWithOfficialCli({
      type: 'http', tag: 'header-only-trust', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, certificate: CERTIFICATE_ONE_WITH_HEADER }
    });
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.status).not.toBe(0);
  });

  test('accepts PKCS#8 key DER under a mismatched PEM private-key label', () => {
    const key = validatePrivateKeyPem(
      [ED25519_PRIVATE_KEY_A_WITH_RSA_LABEL],
      new Set(['RSA PRIVATE KEY'])
    );
    expect(key).toMatchObject({
      valid: true,
      publicKey: { algorithm: 'ed25519', value: ED25519_PUBLIC_KEY_A }
    });

    const node = parseSingboxOutbound({
      type: 'http', tag: 'mislabeled-client-key', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        client_certificate: ED25519_CERTIFICATE_A,
        client_key: ED25519_PRIVATE_KEY_A_WITH_RSA_LABEL
      }
    }, 'mislabeled-client-key');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: true, fatal: false });

    const checked = checkWithOfficialCli(result.config);
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.stderr).toBe('');
    expect(checked.status).toBe(0);
  });

  test('accepts any TLS PEM label ending in PRIVATE KEY', () => {
    for (const [tag, privateKey] of [
      ['custom-client-key-label', ED25519_PRIVATE_KEY_A_WITH_CUSTOM_LABEL],
      ['hyphen-client-key-label', ED25519_PRIVATE_KEY_A_WITH_HYPHEN_LABEL]
    ] as const) {
      const key = validatePrivateKeyPem([privateKey], PRIVATE_KEY_LABELS);
      expect(key).toMatchObject({
        valid: true,
        publicKey: { algorithm: 'ed25519', value: ED25519_PUBLIC_KEY_A }
      });

      const node = parseSingboxOutbound({
        type: 'http', tag, server: 'http.example.com', server_port: 443,
        tls: {
          enabled: true,
          client_certificate: ED25519_CERTIFICATE_A,
          client_key: privateKey
        }
      }, tag);
      expect(node).not.toBeNull();
      const result = adaptNodeToSingBox(node!);
      expect(result).toMatchObject({ emitted: true, fatal: false });

      const checked = checkWithOfficialCli(result.config);
      if (!checked) continue;
      expect(checked.error).toBeUndefined();
      expect(checked.stderr).toBe('');
      expect(checked.status).toBe(0);
    }
  });

  test('ignores non-encryption PEM headers for TLS and SSH private keys', () => {
    const tlsNode = parseSingboxOutbound({
      type: 'http', tag: 'header-client-key', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        client_certificate: ED25519_CERTIFICATE_A,
        client_key: ED25519_PRIVATE_KEY_A_WITH_HEADER
      }
    }, 'header-client-key');
    const sshNode = parseSingboxOutbound({
      type: 'ssh', tag: 'header-ssh-key', server: 'ssh.example.com', server_port: 22,
      private_key: RSA_512_PRIVATE_KEY_WITH_HEADER
    }, 'header-ssh-key');
    expect(tlsNode).not.toBeNull();
    expect(sshNode).not.toBeNull();
    const tlsResult = adaptNodeToSingBox(tlsNode!);
    const sshResult = adaptNodeToSingBox(sshNode!);
    expect(tlsResult).toMatchObject({ emitted: true, fatal: false });
    expect(sshResult).toMatchObject({ emitted: true, fatal: false });

    for (const result of [tlsResult, sshResult]) {
      const checked = checkWithOfficialCli(result.config);
      if (!checked) continue;
      expect(checked.error).toBeUndefined();
      expect(checked.stderr).toBe('');
      expect(checked.status).toBe(0);
    }
  });

  test('uses Go PEM line and consecutive-header envelope rules', () => {
    const acceptedNode = parseSingboxOutbound({
      type: 'http', tag: 'underscore-pem-header', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        client_certificate: ED25519_CERTIFICATE_A,
        client_key: ED25519_PRIVATE_KEY_A_WITH_UNDERSCORE_HEADER
      }
    }, 'underscore-pem-header');
    expect(acceptedNode).not.toBeNull();
    const accepted = adaptNodeToSingBox(acceptedNode!);
    expect(accepted).toMatchObject({ emitted: true, fatal: false });

    for (const [tag, privateKey] of [
      ['prefixed-pem-begin', ED25519_PRIVATE_KEY_A_WITH_PREFIXED_BEGIN],
      ['pem-header-after-blank', ED25519_PRIVATE_KEY_A_WITH_HEADER_AFTER_BLANK]
    ] as const) {
      const node = parseSingboxOutbound({
        type: 'http', tag, server: 'http.example.com', server_port: 443,
        tls: {
          enabled: true,
          client_certificate: ED25519_CERTIFICATE_A,
          client_key: privateKey
        }
      }, tag);
      expect(node).not.toBeNull();
      const result = adaptNodeToSingBox(node!);
      expect(result).toMatchObject({ emitted: false, fatal: true });
      expect(result.unsupportedParams).toContain('tls.client_key');

      const checked = checkWithOfficialCli({
        type: 'http', tag, server: 'http.example.com', server_port: 443,
        tls: {
          enabled: true,
          client_certificate: ED25519_CERTIFICATE_A,
          client_key: privateKey
        }
      });
      if (!checked) continue;
      expect(checked.error).toBeUndefined();
      expect(checked.status).not.toBe(0);
    }

    const checked = checkWithOfficialCli(accepted.config);
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.stderr).toBe('');
    expect(checked.status).toBe(0);
  });

  test('requires the first SSH PEM block to be a supported private key', () => {
    const node = parseSingboxOutbound({
      type: 'ssh', tag: 'prefixed-ssh-key', server: 'ssh.example.com', server_port: 22,
      private_key: `${CERTIFICATE_ONE}\n${RSA_512_PRIVATE_KEY}`
    }, 'prefixed-ssh-key');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: false, fatal: true });
    expect(result.unsupportedParams).toContain('private_key');
  });

  test('defers incomplete RSA arithmetic validation with an explicit SSH warning', () => {
    const node = parseSingboxOutbound({
      type: 'ssh', tag: 'rsa-runtime-validation', server: 'ssh.example.com', server_port: 22,
      private_key: RSA_D_TOO_SMALL_PRIVATE_KEY
    }, 'rsa-runtime-validation');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: true, fatal: false, lossy: true });
    expect(result.warnings).toContainEqual(expect.objectContaining({
      level: 'warn', field: 'private_key'
    }));
    expect(result.unsupportedParams).not.toContain('private_key');

    const checked = checkWithOfficialCli(result.config);
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.status).not.toBe(0);
  });

  test('accepts a PKCS#8 EC key whose curve is declared only by inner SEC1', () => {
    const key = validatePrivateKeyPem(
      [PKCS8_EC_KEY_WITH_INNER_CURVE_ONLY],
      new Set(['PRIVATE KEY']),
      true
    );
    expect(key.valid).toBe(true);

    const node = parseSingboxOutbound({
      type: 'ssh', tag: 'inner-curve-only', server: 'ssh.example.com', server_port: 22,
      private_key: PKCS8_EC_KEY_WITH_INNER_CURVE_ONLY
    }, 'inner-curve-only');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: true, fatal: false });

    const checked = checkWithOfficialCli(result.config);
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.stderr).toBe('');
    expect(checked.status).toBe(0);
  });

  test('uses the first SEC1 optional field when resolving an inner EC curve', () => {
    expect(validatePrivateKeyPem(
      [EC_KEY_WITH_REORDERED_OPTIONAL_FIELDS],
      new Set(['EC PRIVATE KEY']),
      true
    ).valid).toBe(false);

    const node = parseSingboxOutbound({
      type: 'ssh', tag: 'ec-reordered-optionals', server: 'ssh.example.com', server_port: 22,
      private_key: EC_KEY_WITH_REORDERED_OPTIONAL_FIELDS
    }, 'ec-reordered-optionals');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: false, fatal: true });
    expect(result.unsupportedParams).toContain('private_key');

    const checked = checkWithOfficialCli({
      type: 'ssh', tag: 'ec-reordered-optionals', server: 'ssh.example.com', server_port: 22,
      private_key: EC_KEY_WITH_REORDERED_OPTIONAL_FIELDS
    });
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.status).not.toBe(0);
  });

  test('ignores trailing SEC1 optional fields like Go ASN.1 decoding', () => {
    expect(validatePrivateKeyPem(
      [EC_KEY_WITH_TRAILING_OPTIONAL_FIELD],
      new Set(['EC PRIVATE KEY']),
      true
    ).valid).toBe(true);

    const node = parseSingboxOutbound({
      type: 'ssh', tag: 'ec-trailing-optional', server: 'ssh.example.com', server_port: 22,
      private_key: EC_KEY_WITH_TRAILING_OPTIONAL_FIELD
    }, 'ec-trailing-optional');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: true, fatal: false });

    const checked = checkWithOfficialCli(result.config);
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.stderr).toBe('');
    expect(checked.status).toBe(0);
  });

  test('marks native and cross-format v2ray-plugin certRaw for runtime validation', () => {
    const certRaw = CERTIFICATE_ONE
      .replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, '');
    const nativeNode = parseSingboxOutbound({
      type: 'shadowsocks', tag: 'native-cert-raw', server: 'ss.example.com', server_port: 443,
      method: 'aes-128-gcm', password: 'password', plugin: 'v2ray-plugin',
      plugin_opts: `mode=websocket;tls;certRaw=${certRaw}`
    }, 'native-cert-raw');
    expect(nativeNode).not.toBeNull();
    const crossNode = {
      name: 'cross-cert-raw',
      server: 'ss.example.com',
      port: 443,
      protocol: 'ss',
      source: { format: 'clash' as const, raw: '' },
      protocolData: {
        cipher: 'aes-128-gcm', password: 'password', plugin: 'v2ray-plugin',
        'plugin-opts': { mode: 'websocket', tls: true, certRaw }
      }
    };

    for (const node of [nativeNode!, crossNode]) {
      const result = adaptNodeToSingBox(node);
      expect(result).toMatchObject({ emitted: true, fatal: false, lossy: true });
      expect(result.warnings).toContainEqual(expect.objectContaining({
        level: 'warn', field: 'plugin_opts.certRaw'
      }));
      expect(result.unsupportedParams).not.toContain('plugin_opts.certRaw');
    }
  });

  test('emits an encrypted OpenSSH key with a runtime warning when a passphrase is present', () => {
    const node = parseSingboxOutbound({
      type: 'ssh', tag: 'encrypted-ssh-key', server: 'ssh.example.com', server_port: 22,
      private_key: ENCRYPTED_OPENSSH_PRIVATE_KEY,
      private_key_passphrase: 'test-passphrase'
    }, 'encrypted-ssh-key');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);

    expect(result).toMatchObject({ emitted: true, fatal: false });
    expect(result.warnings).toContainEqual(expect.objectContaining({
      level: 'warn', field: 'private_key_passphrase'
    }));
    expect(result.unsupportedParams).not.toContain('private_key_passphrase');

    const checked = checkWithOfficialCli(result.config);
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.stderr).toBe('');
    expect(checked.status).toBe(0);
  });

  test('rejects an encrypted OpenSSH key without its passphrase', () => {
    const node = parseSingboxOutbound({
      type: 'ssh', tag: 'encrypted-ssh-key-no-passphrase',
      server: 'ssh.example.com', server_port: 22,
      private_key: ENCRYPTED_OPENSSH_PRIVATE_KEY
    }, 'encrypted-ssh-key-no-passphrase');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);

    expect(result).toMatchObject({ emitted: false, fatal: true });
    expect(result.unsupportedParams).toContain('private_key_passphrase');
  });

  test('rejects shallow DER/OpenSSH lookalikes that the official parser rejects', () => {
    const fakeDer = 'MAMCAQE=';
    const fakeCertificate = `-----BEGIN CERTIFICATE-----\n${fakeDer}\n-----END CERTIFICATE-----`;
    const fakePkcs8 = `-----BEGIN PRIVATE KEY-----\n${fakeDer}\n-----END PRIVATE KEY-----`;
    const fakeOpenSsh = `-----BEGIN OPENSSH PRIVATE KEY-----\n${btoa('openssh-key-v1\0')}\n-----END OPENSSH PRIVATE KEY-----`;

    expect(isValidX509CertificateBase64(fakeDer)).toBe(false);
    expect(validateCertificatePem([fakeCertificate]).valid).toBe(false);
    expect(validatePrivateKeyPem([fakePkcs8], PRIVATE_KEY_LABELS).valid).toBe(false);
    expect(validatePrivateKeyPem(
      [fakeOpenSsh],
      new Set(['OPENSSH PRIVATE KEY']),
      true
    ).valid).toBe(false);
  });

  test('rejects malformed X.509 time and a negative serial number', () => {
    const malformedTime = replacePemBytes(
      CERTIFICATE_ONE,
      '3236303833303230313330385a',
      '3236313333303230313330385a'
    );
    const negativeSerial = replacePemBytes(
      CERTIFICATE_ONE,
      '29d76d5b96ebe6de0bdd8244d08730ebc8652b59',
      'a9d76d5b96ebe6de0bdd8244d08730ebc8652b59'
    );

    expect(validateCertificatePem([malformedTime]).valid).toBe(false);
    expect(validateCertificatePem([negativeSerial]).valid).toBe(false);
  });

  test('rejects mismatched signature identifiers and a malformed issuer RDN tag', () => {
    const mismatchedSignatureAlgorithm = replacePemBytes(
      CERTIFICATE_ONE,
      '06082a8648ce3d040302',
      '06082a8648ce3d040303',
      2
    );
    const malformedIssuer = replacePemBytes(
      CERTIFICATE_ONE,
      '30163114301206035504030c0b6f6e652e6578616d706c65',
      '30163014301206035504030c0b6f6e652e6578616d706c65'
    );

    expect(validateCertificatePem([mismatchedSignatureAlgorithm]).valid).toBe(false);
    expect(validateCertificatePem([malformedIssuer]).valid).toBe(false);
  });

  test('accepts a 512-bit RSA private key for SSH like sing-box 1.13.21', () => {
    const key = validatePrivateKeyPem(
      [RSA_512_PRIVATE_KEY],
      new Set(['RSA PRIVATE KEY']),
      true
    );
    expect(key.valid).toBe(true);

    const node = parseSingboxOutbound({
      type: 'ssh', tag: 'rsa-512', server: 'ssh.example.com', server_port: 22,
      private_key: RSA_512_PRIVATE_KEY
    }, 'rsa-512');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: true, fatal: false });

    const checked = checkWithOfficialCli(result.config);
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.stderr).toBe('');
    expect(checked.status).toBe(0);
  });

  test('accepts RSA CRT compatibility encodings handled by Go 1.26', () => {
    for (const [tag, privateKey] of [
      ['rsa-partial-crt', RSA_PARTIAL_CRT_STALE_PRIVATE_KEY],
      ['rsa-multiprime-stale-crt', RSA_MULTIPRIME_STALE_CRT_PRIVATE_KEY]
    ] as const) {
      expect(validatePrivateKeyPem(
        [privateKey],
        new Set(['RSA PRIVATE KEY']),
        true
      )).toMatchObject({ valid: true, runtimeValidation: true });

      const node = parseSingboxOutbound({
        type: 'ssh', tag, server: 'ssh.example.com', server_port: 22,
        private_key: privateKey
      }, tag);
      expect(node).not.toBeNull();
      const result = adaptNodeToSingBox(node!);
      expect(result).toMatchObject({ emitted: true, fatal: false, lossy: true });
      expect(result.warnings).toContainEqual(expect.objectContaining({
        level: 'warn', field: 'private_key'
      }));

      const checked = checkWithOfficialCli(result.config);
      if (!checked) continue;
      expect(checked.error).toBeUndefined();
      expect(checked.stderr).toBe('');
      expect(checked.status).toBe(0);
    }
  });

  test('accepts an OpenSSH RSA key whose stale Iqmp is recomputed by Go', () => {
    expect(validatePrivateKeyPem(
      [OPENSSH_RSA_STALE_IQMP_PRIVATE_KEY],
      new Set(['OPENSSH PRIVATE KEY']),
      true
    )).toMatchObject({ valid: true, runtimeValidation: true });

    const node = parseSingboxOutbound({
      type: 'ssh', tag: 'openssh-stale-iqmp', server: 'ssh.example.com', server_port: 22,
      private_key: OPENSSH_RSA_STALE_IQMP_PRIVATE_KEY
    }, 'openssh-stale-iqmp');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: true, fatal: false, lossy: true });
    expect(result.warnings).toContainEqual(expect.objectContaining({
      level: 'warn', field: 'private_key'
    }));

    const checked = checkWithOfficialCli(result.config);
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.stderr).toBe('');
    expect(checked.status).toBe(0);
  });

  test('uses the PKCS#8 outer EC curve and accepts P-224 for TLS', () => {
    const conflictingInnerCurveKey = replacePemBytes(
      P224_PRIVATE_KEY_WITH_INNER_CURVE,
      '06052b81040021',
      '06052b81040022',
      2
    );
    const certificate = validateCertificatePem([P224_CERTIFICATE]);
    const key = validatePrivateKeyPem(
      [conflictingInnerCurveKey],
      new Set(['PRIVATE KEY'])
    );

    expect(certificate.valid).toBe(true);
    expect(key.valid).toBe(true);
    expect(publicKeyIdentitiesMatch(certificate.publicKey, key.publicKey)).toBe(true);

    const node = parseSingboxOutbound({
      type: 'http', tag: 'p224-tls', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        client_certificate: P224_CERTIFICATE,
        client_key: conflictingInnerCurveKey
      }
    }, 'p224-tls');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: true, fatal: false });

    const checked = checkWithOfficialCli(result.config);
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.stderr).toBe('');
    expect(checked.status).toBe(0);
  });

  test('rejects a P-224 private key in SSH context', () => {
    const key = validatePrivateKeyPem(
      [P224_PRIVATE_KEY],
      new Set(['PRIVATE KEY']),
      true
    );
    expect(key.valid).toBe(false);

    const node = parseSingboxOutbound({
      type: 'ssh', tag: 'p224-ssh', server: 'ssh.example.com', server_port: 22,
      private_key: P224_PRIVATE_KEY
    }, 'p224-ssh');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: false, fatal: true });
    expect(result.unsupportedParams).toContain('private_key');

    const checked = checkWithOfficialCli({
      type: 'ssh', tag: 'p224-ssh', server: 'ssh.example.com', server_port: 22,
      private_key: P224_PRIVATE_KEY
    });
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.status).not.toBe(0);
    expect(checked.stderr).toContain('only P-256, P-384 and P-521 EC keys are supported');
  });

  test('rejects a one-bit DSA private key in SSH context', () => {
    const key = validatePrivateKeyPem(
      [ONE_BIT_DSA_PRIVATE_KEY],
      new Set(['DSA PRIVATE KEY']),
      true
    );
    expect(key.valid).toBe(false);

    const node = parseSingboxOutbound({
      type: 'ssh', tag: 'dsa-one-bit', server: 'ssh.example.com', server_port: 22,
      private_key: ONE_BIT_DSA_PRIVATE_KEY
    }, 'dsa-one-bit');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: false, fatal: true });
    expect(result.unsupportedParams).toContain('private_key');

    const checked = checkWithOfficialCli({
      type: 'ssh', tag: 'dsa-one-bit', server: 'ssh.example.com', server_port: 22,
      private_key: ONE_BIT_DSA_PRIVATE_KEY
    });
    if (!checked) return;
    expect(checked.error).toBeUndefined();
    expect(checked.status).not.toBe(0);
  });

  test('rejects a mismatched native TLS client pair before emission', () => {
    const node = parseSingboxOutbound({
      type: 'http', tag: 'mismatched-client-key', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        client_certificate: CERTIFICATE_ONE,
        client_key: PRIVATE_KEY_TWO
      }
    }, 'pem-mismatch');
    expect(node).not.toBeNull();

    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: false, fatal: true });
    expect(result.unsupportedParams).toContain('tls.client_key');
  });

  test('emits a matching pair accepted by the pinned official CLI', () => {
    const node = parseSingboxOutbound({
      type: 'http', tag: 'matching-client-key', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        client_certificate: CERTIFICATE_ONE,
        client_key: PRIVATE_KEY_ONE
      }
    }, 'pem-match');
    expect(node).not.toBeNull();
    const result = adaptNodeToSingBox(node!);
    expect(result).toMatchObject({ emitted: true, fatal: false });

    const availability = spawnSync(singBoxBin, ['version'], { encoding: 'utf8' });
    if (availability.error || availability.status !== 0) return;

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-pem-'));
    const configPath = join(workDir, 'config.json');
    try {
      writeFileSync(configPath, JSON.stringify({ outbounds: [result.config] }), 'utf8');
      const checked = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(checked.error).toBeUndefined();
      expect(checked.stderr).toBe('');
      expect(checked.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
