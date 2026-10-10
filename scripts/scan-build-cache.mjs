// Scan build output for a credential value that escaped the N9 environment scrub.
//
// Counts and classifications only. A matched value is never read, printed or stored: the file
// name, a pattern name and an occurrence count are the entire output, so running this against a
// real cache cannot itself become a disclosure.
//
//   node scripts/scan-build-cache.mjs                  # the default build output locations
//   node scripts/scan-build-cache.mjs apps/cockpit/.next .turbo
//
// Exit 0 : no credential value found in this repository's own build output.
// Exit 1 : a credential value was found.
// Exit 2 : the scan could not be completed. NOT a pass.
//
// This is a build-output scanner, not a source scanner. Pointing it at `src/` reports source code,
// not leakage.
//
// Why it is shape-based and not name-based
// -------------------------------------------
// A first revision matched bare variable names and reported 15 "leaks" in a tree that held none.
// Every one was a false positive: `SHOPIFY_CLIENT_SECRET` occurs in the cockpit's Settings page as
// a configuration-field label, and `GITHUB_` occurs inside Next.js's vendored `ci-info` and
// `detect-agent` bundles, which carry a table of CI provider names. A name in a build cache is
// evidence of nothing.
//
// So a name is a finding only when followed by an assigned value, and a generic value shape is a
// finding on its own. Everything else is counted as NAME-ONLY, which is visible but cannot fail a
// build it has no business failing.
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { brotliDecompressSync, gunzipSync, zstdDecompressSync } from 'node:zlib';

const repoRoot = resolve(import.meta.dirname, '..');

// Value shapes. Each needs a long enough tail that a vendor's credential *detector* cannot match
// it by accident -- `detect-agent` lists `ghp_` as a prefix it looks for, with no token after it.
//
// `prefilter` is the literal text that must be present for the regex to have any chance of
// matching. It has to be spelled out: slicing `pattern.source` would produce a needle containing
// `[`, which never appears in the text and would silently skip every real match.
const valueShapes = [
  ['CANARY', /CANARY_[A-Za-z0-9_-]{4,}/g, ['CANARY_']],
  ['GITHUB_PAT', /github_pat_[A-Za-z0-9_]{40,}/g, ['github_pat_']],
  ['GITHUB_CLASSIC_PAT', /gh[pousr]_[A-Za-z0-9]{30,}/g, ['ghp_', 'gho_', 'ghs_', 'ghr_', 'ghu_']],
  ['ANTHROPIC_KEY', /sk-ant-[A-Za-z0-9_-]{40,}/g, ['sk-ant-']],
  ['OPENAI_STYLE_KEY', /sk-[A-Za-z0-9]{32,}/g, ['sk-']],
  ['GOOGLE_API_KEY', /AIza[0-9A-Za-z_-]{35}/g, ['AIza']],
  ['SLACK_TOKEN', /xox[abprs]-[A-Za-z0-9-]{20,}/g, ['xox']],
  ['PRIVATE_KEY', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g, ['-----BEGIN']],
];

// The credential names the scrub in dev-env.mjs is responsible for.
const credentialNames = [
  'GITHUB_MCP_TOKEN', 'GITHUB_PAT', 'GITHUB_TOKEN', 'GITHUB_APP_PRIVATE_KEY',
  'MCP_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', 'LITELLM_MASTER_KEY', 'LITELLM_ORCHESTRATOR_KEY',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SHOPIFY_CLIENT_SECRET',
  'KILL_SWITCH_OWNER_TOKEN', 'KILL_SWITCH_READ_TOKEN', 'KILL_SWITCH_DEMO_PASSWORD',
  'GUARDRAIL_DATABASE_URL', 'HOTL_INTERNAL_TOKEN', 'CONNECTOR_ENCRYPTION_KEY',
  'AGENT_JWT_SECRET', 'AGENT_JWT_MASTER_ORCHESTRATOR', 'TURBO_TOKEN',
  'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'VERCEL_TOKEN',
];

// Values that are present in source as documentation or placeholders and are not credentials.
const benignValues = new Set([
  '', 'undefined', 'null', 'none', 'true', 'false', '***', 'redacted',
  'placeholder', 'example', 'changeme', 'xxx', 'your-token-here',
]);

// A dotted property-access chain is source code, never a serialized credential: `process.env.X`
// and `source.SHOPIFY_CLIENT_SECRET` survive compilation whenever a module reads a variable,
// while a value a bundler writes into a cache is a flat literal. The dot is required, so a bare
// token that happens to look like an identifier is still reported.
const codeReference = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/;

// A value beginning with the literal marker `CANARY` is synthetic by construction -- that is the
// whole point of the marker, and it is what separates the N9 drills from a real credential. No real
// token starts with those letters, so this cannot hide a real one.
//
// It is still a LEAK when it turns up in build output, because that is the proof the build
// serialized the injected value. It is not counted a second time through the name-assignment path,
// and a documentation snippet that shows the method (`GITHUB_MCP_TOKEN=CANARY_…`) is not a finding
// at all. The elision character matters: `docs/FULL_PROGRAM_CHECKPOINT.md:1374` writes the value as
// `CANARY_…`, and a stricter pattern turned that into a false positive.
const syntheticCanary = /^CANARY/;

const namePattern = (name) => new RegExp(name, 'g');
const assignmentPattern = (name) => new RegExp(`${name}\\s*[:=]\\s*["'\`]?([^\\s"'\`,;)}\\]]{8,})`, 'g');

// Turbo stores each task's cached outputs and log as one compressed tar. A byte scan of the
// archive cannot see inside it, so these are inflated before scanning.
const isArchive = (file) => /\.(zst|tgz|gz|br)$/i.test(file);
const decompressors = { '.zst': zstdDecompressSync, '.gz': gunzipSync, '.tgz': gunzipSync, '.br': brotliDecompressSync };

// Limits, not skips. A file that cannot be processed inside them is reported as unscanned, because
// a scan that quietly gives up on a large file would convert an unknown result into a green one.
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_INFLATED_BYTES = 768 * 1024 * 1024;

// Turbo's archives inflate to hundreds of megabytes and Node's maximum string length is smaller
// than that, so buffers are scanned in slices. The slice overlap only has to cover the longest
// pattern, which is far below 4 KB.
const SLICE_BYTES = 8 * 1024 * 1024;
const SLICE_OVERLAP = 4096;

function inflateArchive(buffer, file) {
  const suffix = extname(file).toLowerCase();
  const inflate = decompressors[suffix];
  if (!inflate) return buffer;
  if (typeof inflate !== 'function') {
    throw new Error(`${file} is ${suffix} but this Node build cannot inflate it`);
  }
  try {
    return inflate(buffer, { maxOutputLength: MAX_INFLATED_BYTES });
  } catch (error) {
    throw new Error(`${file} could not be inflated within ${MAX_INFLATED_BYTES} bytes: ${error.message}`);
  }
}

// Vendor code is excluded from the verdict, not hidden. `.next/standalone` ships whole copies of
// third-party packages, and those legitimately contain credential *detectors* and OpenSSL test
// vectors -- a `-----BEGIN ... PRIVATE KEY-----` string inside libvips is not this repository's
// leak. A value that the build serialized is written into this repository's own compiled output,
// which is never under a `node_modules` path.
//
// Inside a turbo cache archive the same distinction has to be made per tar member, because the
// archive contains both this repository's compiled output and whole copies of vendored packages.
const isVendor = (path) => /(^|[\\/])node_modules[\\/]/.test(path);

function createAccumulator() {
  return { leaks: new Map(), nameOnly: new Map(), lastEnd: new Map() };
}

const bump = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);

// Scan one slice of one buffer. `text` starts at absolute offset `sliceStart`.
//
// Overlapping slices must not double count a match. For a given pattern the matches cannot
// overlap one another, so "this match ends after the last counted match ended" identifies a
// genuinely new occurrence and skips the one repeated by the overlap.
function scanSlice(accumulator, text, sliceStart) {
  // Records the end offset of the last match counted for `key` and reports whether this match is
  // new. A repeated match in the overlap region has already been counted.
  const fresh = (key, absoluteEnd) => {
    if (absoluteEnd <= (accumulator.lastEnd.get(key) ?? 0)) return false;
    accumulator.lastEnd.set(key, absoluteEnd);
    return true;
  };
  const addLeak = (key, absoluteEnd) => {
    if (!fresh(key, absoluteEnd)) return false;
    bump(accumulator.leaks, key);
    return true;
  };

  for (const [key, pattern, prefilter] of valueShapes) {
    // Cheap native pre-filter: running every regex over every slice of a multi-hundred-megabyte
    // archive is not affordable, and `includes` is far faster than the regex engine.
    if (!prefilter.some((needle) => text.includes(needle))) continue;
    pattern.lastIndex = 0;
    for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
      addLeak(key, sliceStart + m.index + m[0].length);
    }
  }

  for (const name of credentialNames) {
    if (!text.includes(name)) continue;

    let assigned = 0;
    const assign = assignmentPattern(name);
    for (let m = assign.exec(text); m; m = assign.exec(text)) {
      const value = m[1];
      if (benignValues.has(value.toLowerCase())) continue;
      if (syntheticCanary.test(value)) continue; // reported once, by the CANARY value shape
      if (codeReference.test(value)) continue;
      if (addLeak(`${name}(assigned)`, sliceStart + m.index + m[0].length)) assigned += 1;
    }

    // Every occurrence of the name, including the ones just counted as assigned. The difference is
    // what gets reported: a bare occurrence is a label, an assignment is a value.
    let bare = 0;
    const plain = namePattern(name);
    for (let m = plain.exec(text); m; m = plain.exec(text)) {
      if (fresh(`bare:${name}`, sliceStart + m.index + m[0].length)) bare += 1;
    }
    bump(accumulator.nameOnly, name, Math.max(0, bare - assigned));
  }
}

// Scan a whole buffer in slices. A turbo archive inflates past Node's maximum string length, so
// the buffer is never converted in one piece.
function scanBuffer(buffer) {
  const accumulator = createAccumulator();
  let from = 0;
  while (from < buffer.length) {
    const end = Math.min(from + SLICE_BYTES, buffer.length);
    const start = Math.max(0, from - SLICE_OVERLAP);
    // latin1 maps every byte to exactly one character, so offsets stay aligned with the buffer and
    // a UTF-8 continuation byte cannot be read as part of a match.
    scanSlice(accumulator, buffer.toString('latin1', start, end), start);
    if (end === buffer.length) break;
    from = end;
  }
  return accumulator;
}

// Minimal POSIX tar reader: a 512-byte header, then `size` bytes of data padded to 512. Turbo
// writes plain ustar entries. A member whose name cannot be read is reported by offset rather
// than skipped, so an unreadable entry can never silently become a clean result.
function* tarMembers(buffer) {
  let offset = 0;
  let index = 0;
  while (offset + 512 <= buffer.length) {
    const name = buffer.toString('utf8', offset, offset + 100).replace(/\0.*$/, '').trim();
    if (!name) return; // two zero blocks terminate the archive
    const size = Number.parseInt(buffer.toString('utf8', offset + 124, offset + 136).replace(/\0.*$/, '').trim() || '0', 8);
    if (!Number.isFinite(size) || size < 0) throw new Error(`unreadable tar header at offset ${offset}`);
    const type = String.fromCharCode(buffer[offset + 156] || 0x30);
    const dataStart = offset + 512;
    index += 1;
    // '0' and '\0' are regular files. '5' is a directory, 'L' a GNU long name and 'x' a pax
    // header; their payload is metadata, so it is skipped rather than scanned.
    if (type === '0' || type === '\0') {
      yield { name: name || `member-${index}`, data: buffer.subarray(dataStart, dataStart + size) };
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
}

async function scanFile(file) {
  const size = (await stat(file)).size;
  if (size > MAX_FILE_BYTES) throw new Error(`${file} is ${size} bytes, over the scan limit`);
  const buffer = inflateArchive(await readFile(file), file);
  if (!isArchive(file)) {
    return { compressed: size, entries: [{ label: '', vendor: isVendor(file), accumulator: scanBuffer(buffer) }] };
  }
  const entries = [];
  for (const member of tarMembers(buffer)) {
    entries.push({ label: member.name, vendor: isVendor(member.name), accumulator: scanBuffer(member.data) });
  }
  return { compressed: size, entries };
}

const defaultTargets = [
  'apps/cockpit/.next',
  'apps/storefront/.next',
  'apps/commerce-core/medusa/.medusa',
  'apps/commerce-core/medusa/node_modules/.cache',
  '.turbo',
];

async function scan(target) {
  const root = resolve(repoRoot, target);
  let info;
  try {
    info = await stat(root);
  } catch {
    // A path that does not exist is not a finding and not a failure: a clean tree has no .next.
    return { target, files: 0, bytes: 0, leaks: [], vendor: [], nameOnly: new Map() };
  }
  if (!info.isDirectory()) throw new Error(`${target} is not a directory`);

  let files = 0;
  let bytes = 0;
  const leaks = [];
  const vendor = [];
  const nameOnly = new Map();
  for await (const file of walk(root)) {
    files += 1;
    const { entries, compressed } = await scanFile(file);
    bytes += compressed;
    const name = relative(root, file);
    for (const entry of entries) {
      if (entry.accumulator.leaks.size) {
        const label = entry.label ? `${name}!${entry.label}` : name;
        (entry.vendor ? vendor : leaks).push({ file: label, found: mapToObject(entry.accumulator.leaks) });
      }
      for (const [key, count] of entry.accumulator.nameOnly) if (count > 0) bump(nameOnly, key, count);
    }
  }
  return { target, files, bytes, leaks, vendor, nameOnly };
}

const mapToObject = (map) => Object.fromEntries([...map].sort((a, b) => b[1] - a[1]));

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    throw new Error(`cannot read ${dir}: ${error.code ?? error.message}`);
  }
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

const selected = process.argv.slice(2);
const targets = selected.length ? selected : defaultTargets;

// A vendored package inside a turbo archive can hold thousands of members, so only the first few
// are printed. The counts above them are the real ones.
const MAX_LISTED = 10;

let leakFiles = 0;
let vendorFiles = 0;
let nameOnlyTotal = 0;
for (const target of targets) {
  try {
    const { files, bytes, leaks, vendor, nameOnly } = await scan(target);
    leakFiles += leaks.length;
    vendorFiles += vendor.length;
    const names = [...nameOnly].sort((a, b) => b[1] - a[1]);
    nameOnlyTotal += names.reduce((sum, [, count]) => sum + count, 0);
    console.log(
      `${String(files).padStart(7)} files ${(bytes / 1024 / 1024).toFixed(1).padStart(9)} MB  ` +
      `${String(leaks.length).padStart(4)} repo file(s) with a credential VALUE   ${target}`,
    );
    for (const hit of leaks.slice(0, MAX_LISTED)) {
      const detail = Object.entries(hit.found).map(([k, c]) => `${k}=${c}`).join(' ');
      console.log(`             LEAK    ${hit.file}  ${detail}`);
    }
    if (leaks.length > MAX_LISTED) console.log(`             ... and ${leaks.length - MAX_LISTED} more`);
    for (const hit of vendor.slice(0, MAX_LISTED)) {
      const detail = Object.entries(hit.found).map(([k, c]) => `${k}=${c}`).join(' ');
      console.log(`             VENDOR  ${hit.file}  ${detail}`);
    }
    if (vendor.length > MAX_LISTED) console.log(`             ... and ${vendor.length - MAX_LISTED} more vendored`);
    if (names.length) {
      console.log(`             NAME-ONLY ${names.map(([k, c]) => `${k}=${c}`).join(' ')}`);
    }
  } catch (error) {
    console.error(`SCAN FAILED ${target}: ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.exitCode === 2) {
  console.error('\nScan incomplete. An incomplete scan is not a pass.');
} else if (leakFiles > 0) {
  console.error(`\n${leakFiles} file(s) contain a credential value. The environment scrub was bypassed.`);
  process.exitCode = 1;
} else {
  console.log(
    `\nNo credential value in this repository's build output. ` +
    `${nameOnlyTotal} bare name occurrence(s) NAME-ONLY; ${vendorFiles} vendored file(s) with ` +
    'third-party credential-shaped constants, excluded from the verdict.',
  );
}