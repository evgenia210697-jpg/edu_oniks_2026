// crypto для браузера: случайные числа из Web Crypto
const wc = globalThis.crypto;
function randomBytes(n) {
  const a = new Uint8Array(n);
  wc.getRandomValues(a);
  a.toString = (enc) => (enc === 'hex' ? Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('') : Uint8Array.prototype.toString.call(a));
  return a;
}
function randomInt(min, max) {
  if (max === undefined) { max = min; min = 0; }
  const range = max - min;
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / range) * range;
  do wc.getRandomValues(buf); while (buf[0] >= limit);
  return min + (buf[0] % range);
}
const randomUUID = () => (wc.randomUUID ? wc.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (wc.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
module.exports = { randomBytes, randomInt, randomUUID, getRandomValues: (a) => wc.getRandomValues(a) };
