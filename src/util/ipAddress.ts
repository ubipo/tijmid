/**
 * Adapted from https://github.com/silverwind/ip-bigint
 *
 * Copyright (c) silverwind All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 *
 * MIT License
 *
 * Copyright (c) Sindre Sorhus <sindresorhus@gmail.com>
 * (https://sindresorhus.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

interface Options {
  includeBoundaries?: boolean
  exact?: boolean
}

const word = '[a-fA-F\\d:]'

const boundary = (options: Options) => options && options.includeBoundaries
  ? `(?:(?<=\\s|^)(?=${word})|(?<=${word})(?=\\s|$))`
  : ''

const v4 = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}'

const v6segment = '[a-fA-F\\d]{1,4}'

const v6 = `
(?:
(?:${v6segment}:){7}(?:${v6segment}|:)|                                    // 1:2:3:4:5:6:7::  1:2:3:4:5:6:7:8
(?:${v6segment}:){6}(?:${v4}|:${v6segment}|:)|                             // 1:2:3:4:5:6::    1:2:3:4:5:6::8   1:2:3:4:5:6::8  1:2:3:4:5:6::1.2.3.4
(?:${v6segment}:){5}(?::${v4}|(?::${v6segment}){1,2}|:)|                   // 1:2:3:4:5::      1:2:3:4:5::7:8   1:2:3:4:5::8    1:2:3:4:5::7:1.2.3.4
(?:${v6segment}:){4}(?:(?::${v6segment}){0,1}:${v4}|(?::${v6segment}){1,3}|:)| // 1:2:3:4::        1:2:3:4::6:7:8   1:2:3:4::8      1:2:3:4::6:7:1.2.3.4
(?:${v6segment}:){3}(?:(?::${v6segment}){0,2}:${v4}|(?::${v6segment}){1,4}|:)| // 1:2:3::          1:2:3::5:6:7:8   1:2:3::8        1:2:3::5:6:7:1.2.3.4
(?:${v6segment}:){2}(?:(?::${v6segment}){0,3}:${v4}|(?::${v6segment}){1,5}|:)| // 1:2::            1:2::4:5:6:7:8   1:2::8          1:2::4:5:6:7:1.2.3.4
(?:${v6segment}:){1}(?:(?::${v6segment}){0,4}:${v4}|(?::${v6segment}){1,6}|:)| // 1::              1::3:4:5:6:7:8   1::8            1::3:4:5:6:7:1.2.3.4
(?::(?:(?::${v6segment}){0,5}:${v4}|(?::${v6segment}){1,7}|:))             // ::2:3:4:5:6:7:8  ::2:3:4:5:6:7:8  ::8             ::1.2.3.4
)(?:%[0-9a-zA-Z]{1,})?                                             // %eth0            %1
`.replace(/\s*\/\/.*$/gm, '').replace(/\n/g, '').trim()

// Pre-compile only the exact regexes because adding a global flag make regexes stateful
const v46Exact = new RegExp(`(?:^${v4}$)|(?:^${v6}$)`)
const v4exact = new RegExp(`^${v4}$`)
const v6exact = new RegExp(`^${v6}$`)

const ipRegex = (options: Options) => options && options.exact
  ? v46Exact
  : new RegExp(`(?:${boundary(options)}${v4}${boundary(options)})|(?:${boundary(options)}${v6}${boundary(options)})`, 'g')

ipRegex.v4 = (options: Options) => options && options.exact
  ? v4exact
  : new RegExp(`${boundary(options)}${v4}${boundary(options)}`, 'g')
ipRegex.v6 = (options: Options) => options && options.exact
  ? v6exact
  : new RegExp(`${boundary(options)}${v6}${boundary(options)}`, 'g')

export default ipRegex

export function getIpAddressVersion(ipAddress: string) {
  if (ipRegex.v4({exact: true}).test(ipAddress)) return 4;
  if (ipRegex.v6({exact: true}).test(ipAddress)) return 6;
  return null;
}

export function parseIpv6Address(ipAddress: string) {
  const ipv4mapped = ipAddress.includes(".")
  if (ipv4mapped) {
    ipAddress = ipAddress.split(":").map(part => {
          if (part.includes(".")) {
      const digits = part.split(".").map(str => Number(str).toString(16).padStart(2, "0"));
      return `${digits[0]}${digits[1]}:${digits[2]}${digits[3]}`;
          } else {
      return part;
          }
    }).join(":");
  }
  
  const scopeIdMatch = /(.+)%(.+)/.exec(ipAddress);
  let scopeid: string | undefined = undefined;
  if (scopeIdMatch != null) {
    [, ipAddress, scopeid] = scopeIdMatch
  }
  
  const parts = ipAddress.split(":");
  const index = parts.indexOf("");
  
  if (index !== -1) {
    while (parts.length < 8) {
      parts.splice(index, 0, "");
    }
  }

  let bigInt = 0n;
  let exp = 0n;
  
  for (const n of parts.map(part => part ? BigInt(parseInt(part, 16)) : 0n).reverse()) {
    bigInt += n * (2n ** exp);
    exp += 16n;
  }
  
  return { bigInt, version: 6, scopeid, ipv4mapped };
}

export function parseIpv4Address(ipAddress: string) {
  let bigInt = 0n;
  let exp = 0n;

  for (const n of ipAddress.split(".").map(BigInt).reverse()) {
    bigInt += n * (2n ** exp);
    exp += 8n;
  }

  return { bigInt, version: 4 }
}


export function parseIpAddress(ipAddress: string) {
  const version = getIpAddressVersion(ipAddress)
  if (!version) throw new Error(`Invalid IP address: ${ipAddress}`)
  return version === 4 ? parseIpv4Address(ipAddress) : parseIpv6Address(ipAddress)
}

export function ipv4AddressToBigInt(ipAddress: string) {
  return parseIpv4Address(ipAddress).bigInt;
}

export function ipv6AddressToBigInt(ipAddress: string) {
  return parseIpv6Address(ipAddress).bigInt;
}

export function ipAddressToBigInt(ipAddress: string) {
  return parseIpAddress(ipAddress).bigInt;
}
