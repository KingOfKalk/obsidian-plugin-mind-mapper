import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

/**
 * CI job summaries and annotations, called from `.github/workflows/ci.yml`. Writes Markdown to
 * `$GITHUB_STEP_SUMMARY` (stdout when unset) and annotation commands to stdout.
 *
 *   node scripts/ci-summary.mjs lint --prettier <txt> --prettier-outcome <o>
 *       --eslint <json> --eslint-outcome <o> --tsc <txt> --tsc-outcome <o>
 *   node scripts/ci-summary.mjs coverage <coverage-summary.json>
 *   node scripts/ci-summary.mjs size <main.js> --sha <sha> --out <bundle-size.json>
 *   node scripts/ci-summary.mjs build --size <json> [--baseline <json>] --manifest <json>
 *       --event <event> [--artifact-name <n>] [--artifact-url <url>] [--retention-days <n>]
 *
 * Missing reports are shown in the summary instead of failing the step, so a crashed tool still
 * gets a readable summary.
 */

/** @typedef {'success' | 'failure' | 'cancelled' | 'skipped'} Outcome */
/** @typedef {{ file: string, line: number, column: number, severity: 'error' | 'warning', rule: string | null, message: string }} EslintFinding */
/** @typedef {{ file?: string, line?: number, column?: number, code: string, message: string }} TscError */
/** @typedef {{ level: 'error' | 'warning' | 'notice', message: string, file?: string, line?: number, col?: number, title?: string }} Annotation */
/** @typedef {{ bytes: number, gzipBytes: number, sha: string }} BundleSize */
/** @typedef {{ pct: number, covered: number, total: number }} CoverageMetric */

/** GitHub shows at most this many annotations per level and step. */
const ANNOTATIONS_PER_LEVEL = 10;
/** Findings listed per check in the job summary. */
const LIST_CAP = 50;
const COVERAGE_METRICS = /** @type {const} */ (['statements', 'branches', 'functions', 'lines']);

// --- Markdown helpers ---

/** @param {string[]} header @param {string[][]} rows */
function table(header, rows) {
  /** @param {string[]} cells */
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

/** @param {number} count @param {string} word */
function plural(count, word) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

/** @param {number} value */
function formatInt(value) {
  return value.toLocaleString('en-US');
}

/** Escape text for Markdown prose: one line, no HTML, no formatting characters. @param {string} text */
function escapeText(text) {
  return text
    .replace(/\s*\r?\n\s*/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[|`*_[\]\\]/g, (m) => `\\${m}`);
}

/** @param {string | undefined} value @returns {Outcome} */
function toOutcome(value) {
  return value === 'success' || value === 'failure' || value === 'cancelled' ? value : 'skipped';
}

/** @param {Outcome} outcome */
function outcomeLabel(outcome) {
  return {
    success: '✅ passed',
    failure: '❌ failed',
    cancelled: '⚪ cancelled',
    skipped: '⏭️ not run',
  }[outcome];
}

/** @param {string} file @param {string} root */
function toRepoPath(file, root) {
  if (!isAbsolute(file)) return file.split(sep).join('/');
  const rel = relative(root, file);
  return rel.startsWith('..') || isAbsolute(rel) ? file : rel.split(sep).join('/');
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// --- Annotations ---

/** @param {string} value */
function escapeData(value) {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** @param {string} value */
function escapeProperty(value) {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

/** A GitHub Actions workflow command for one annotation. @param {Annotation} a */
export function formatAnnotation(a) {
  const props = [];
  if (a.file !== undefined) props.push(`file=${escapeProperty(a.file)}`);
  if (a.line !== undefined) props.push(`line=${a.line}`);
  if (a.col !== undefined) props.push(`col=${a.col}`);
  if (a.title !== undefined) props.push(`title=${escapeProperty(a.title)}`);
  const head = props.length > 0 ? `::${a.level} ${props.join(',')}` : `::${a.level}`;
  return `${head}::${escapeData(a.message)}`;
}

/**
 * Annotations for all lint findings, at most {@link ANNOTATIONS_PER_LEVEL} per level; a notice
 * points at the job summary for the rest.
 * @param {{ prettier: string[], eslint: EslintFinding[], tsc: TscError[] }} input
 */
export function lintAnnotations(input) {
  /** @type {Annotation[]} */
  const all = [
    ...input.prettier.map((file) => ({
      level: /** @type {const} */ ('error'),
      file,
      title: 'Prettier',
      message: 'File is not formatted. Run `npm run format`.',
    })),
    ...input.eslint.map((f) => ({
      level: f.severity,
      file: f.file,
      line: f.line,
      col: f.column,
      title: f.rule ? `ESLint (${f.rule})` : 'ESLint',
      message: f.message,
    })),
    ...input.tsc.map((e) => ({
      level: /** @type {const} */ ('error'),
      file: e.file,
      line: e.line,
      col: e.column,
      title: `tsc ${e.code}`,
      message: e.message,
    })),
  ];
  const counts = { error: 0, warning: 0, notice: 0 };
  const lines = [];
  let dropped = 0;
  for (const a of all) {
    if (counts[a.level]++ < ANNOTATIONS_PER_LEVEL) lines.push(formatAnnotation(a));
    else dropped++;
  }
  if (dropped > 0) {
    lines.push(
      formatAnnotation({
        level: 'notice',
        title: 'More findings',
        message: `${dropped} more finding(s) are not annotated. The job summary lists them.`,
      }),
    );
  }
  return lines;
}

// --- Lint ---

/** Files listed by `prettier --check` as not formatted. @param {string} text */
export function parsePrettierOutput(text) {
  const files = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\[(?:warn|error)\] (.+?)(?::.*)?$/.exec(line);
    if (m?.[1] && !/^Code style issues /.test(m[1])) files.push(m[1]);
  }
  return files;
}

/** @param {unknown} value */
function optionalNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Parse `eslint --format json` output. Throws on malformed input.
 * @param {string} json @param {string} root
 * @returns {EslintFinding[]}
 */
export function parseEslintReport(json, root) {
  /** @type {unknown} */
  const data = JSON.parse(json);
  if (!Array.isArray(data)) throw new Error('ESLint report is not a JSON array');
  /** @type {EslintFinding[]} */
  const findings = [];
  for (const result of /** @type {unknown[]} */ (data)) {
    if (!isRecord(result) || typeof result.filePath !== 'string') continue;
    const file = toRepoPath(result.filePath, root);
    for (const msg of Array.isArray(result.messages)
      ? /** @type {unknown[]} */ (result.messages)
      : []) {
      if (!isRecord(msg)) continue;
      findings.push({
        file,
        line: optionalNumber(msg.line) ?? 1,
        column: optionalNumber(msg.column) ?? 1,
        severity: msg.severity === 2 ? 'error' : 'warning',
        rule: typeof msg.ruleId === 'string' ? msg.ruleId : null,
        message: typeof msg.message === 'string' ? msg.message : '',
      });
    }
  }
  return findings;
}

/**
 * Parse `tsc --noEmit` output (not a TTY, so not pretty). Indented lines continue the previous
 * error's message.
 * @param {string} text
 * @returns {TscError[]}
 */
export function parseTscOutput(text) {
  /** @type {TscError[]} */
  const errors = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const fileError = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line);
    if (fileError) {
      const [, file = '', row, col, code = '', message = ''] = fileError;
      errors.push({ file, line: Number(row), column: Number(col), code, message });
      continue;
    }
    const globalError = /^error (TS\d+): (.*)$/.exec(line);
    if (globalError) {
      errors.push({ code: globalError[1] ?? '', message: globalError[2] ?? '' });
      continue;
    }
    const last = errors[errors.length - 1];
    if (last && line !== '' && /^\s/.test(raw)) last.message += `\n${line.trim()}`;
  }
  return errors;
}

/** @param {Outcome} outcome */
function missingReport(outcome) {
  return outcome === 'skipped' || outcome === 'cancelled' ? '—' : 'no report';
}

/** @param {string[]} items @param {string} hint */
function cappedList(items, hint) {
  const shown = items.slice(0, LIST_CAP).map((item) => `- ${item}`);
  if (items.length > LIST_CAP) shown.push(`- _…and ${items.length - LIST_CAP} more. ${hint}_`);
  return shown.join('\n');
}

/**
 * @param {{
 *   prettier: { outcome: Outcome, files: string[] | null },
 *   eslint: { outcome: Outcome, findings: EslintFinding[] | null },
 *   tsc: { outcome: Outcome, errors: TscError[] | null },
 * }} input
 */
export function renderLintSummary(input) {
  const { prettier, eslint, tsc } = input;
  const eslintErrors = eslint.findings?.filter((f) => f.severity === 'error').length ?? 0;
  const eslintWarnings = (eslint.findings?.length ?? 0) - eslintErrors;
  const overview = table(
    ['Check', 'Result', 'Details'],
    [
      [
        'Prettier',
        outcomeLabel(prettier.outcome),
        prettier.files
          ? `${plural(prettier.files.length, 'file')} not formatted`
          : missingReport(prettier.outcome),
      ],
      [
        'ESLint',
        outcomeLabel(eslint.outcome),
        eslint.findings
          ? `${plural(eslintErrors, 'error')}, ${plural(eslintWarnings, 'warning')}`
          : missingReport(eslint.outcome),
      ],
      [
        'TypeScript',
        outcomeLabel(tsc.outcome),
        tsc.errors ? plural(tsc.errors.length, 'error') : missingReport(tsc.outcome),
      ],
    ],
  );
  const parts = ['## Lint', overview];
  if (prettier.files?.length) {
    parts.push(
      '### Prettier',
      cappedList(
        prettier.files.map((f) => `\`${f}\``),
        'Run `npm run format:check` locally.',
      ),
      'Fix with `npm run format`.',
    );
  }
  if (eslint.findings?.length) {
    parts.push(
      '### ESLint',
      cappedList(
        eslint.findings.map(
          (f) =>
            `\`${f.file}:${f.line}:${f.column}\` ${f.severity} ${f.rule ? `\`${f.rule}\`` : '_(no rule)_'}: ${escapeText(f.message)}`,
        ),
        'Run `npm run lint` locally.',
      ),
    );
  }
  if (tsc.errors?.length) {
    parts.push(
      '### TypeScript',
      cappedList(
        tsc.errors.map(
          (e) =>
            `\`${e.file !== undefined ? `${e.file}(${e.line ?? 0},${e.column ?? 0})` : '(global)'}\` ${e.code}: ${escapeText(e.message)}`,
        ),
        'Run `npm run typecheck` locally.',
      ),
    );
  }
  return parts.join('\n\n');
}

// --- Coverage ---

/**
 * Totals from Vitest's `json-summary` report. Throws on malformed input.
 * @param {string} json
 * @returns {Record<(typeof COVERAGE_METRICS)[number], CoverageMetric>}
 */
export function parseCoverageSummary(json) {
  /** @type {unknown} */
  const data = JSON.parse(json);
  if (!isRecord(data) || !isRecord(data.total))
    throw new Error('coverage summary: missing "total"');
  const total = data.total;
  /** @param {(typeof COVERAGE_METRICS)[number]} metric @returns {CoverageMetric} */
  const read = (metric) => {
    const entry = total[metric];
    if (!isRecord(entry)) throw new Error(`coverage summary: missing "${metric}"`);
    const { pct, covered, total: count } = entry;
    if (typeof pct !== 'number' || typeof covered !== 'number' || typeof count !== 'number')
      throw new Error(`coverage summary: "${metric}" is not numeric`);
    return { pct, covered, total: count };
  };
  return {
    statements: read('statements'),
    branches: read('branches'),
    functions: read('functions'),
    lines: read('lines'),
  };
}

/** @param {ReturnType<typeof parseCoverageSummary>} totals */
export function renderCoverageSummary(totals) {
  const rows = COVERAGE_METRICS.map((metric) => {
    const { pct, covered, total } = totals[metric];
    const name = metric.charAt(0).toUpperCase() + metric.slice(1);
    return [name, `${pct.toFixed(2)}%`, `${formatInt(covered)} / ${formatInt(total)}`];
  });
  return [
    '## Coverage',
    table(['Metric', 'Coverage', 'Covered'], rows),
    'Unit tests (`npm run test:coverage`), files in `src/`. No threshold.',
  ].join('\n\n');
}

// --- Build ---

/** @param {Buffer} content @param {string} sha @returns {BundleSize} */
export function measureBundle(content, sha) {
  return { bytes: content.length, gzipBytes: gzipSync(content, { level: 9 }).length, sha };
}

/** A `bundle-size.json`, or null when it is not a valid one. @param {string} json @returns {BundleSize | null} */
export function parseBundleSize(json) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  const { bytes, gzipBytes, sha } = data;
  if (typeof bytes !== 'number' || typeof gzipBytes !== 'number' || typeof sha !== 'string')
    return null;
  return { bytes, gzipBytes, sha };
}

/** @param {number} bytes */
function formatBytes(bytes) {
  return `${formatInt(bytes)} B (${(bytes / 1024).toFixed(1)} KiB)`;
}

/** @param {number} current @param {number} baseline */
export function formatDelta(current, baseline) {
  const diff = current - baseline;
  if (diff === 0) return '±0 B';
  const sign = diff > 0 ? '+' : '−';
  const pct = baseline === 0 ? '' : ` (${sign}${Math.abs((diff / baseline) * 100).toFixed(2)}%)`;
  return `${sign}${formatInt(Math.abs(diff))} B${pct}`;
}

/**
 * @param {{
 *   size: BundleSize,
 *   baseline: BundleSize | null,
 *   event: string,
 *   version: string | null,
 *   artifact: { name: string, url: string | null, retentionDays: number | null } | null,
 * }} input
 */
export function renderBuildSummary(input) {
  const { size, baseline, artifact } = input;
  const parts = [
    '## Build',
    `Manifest version: ${input.version ? `\`${input.version}\`` : '_unknown_'}`,
  ];
  parts.push('### Bundle size');
  if (baseline && input.event !== 'push') {
    parts.push(
      table(
        [
          'File',
          'This build',
          `Baseline (\`${baseline.sha.slice(0, 7)}\` on \`main\`)`,
          'Difference',
        ],
        [
          [
            '`main.js`',
            formatBytes(size.bytes),
            formatBytes(baseline.bytes),
            formatDelta(size.bytes, baseline.bytes),
          ],
          [
            '`main.js` (gzip)',
            formatBytes(size.gzipBytes),
            formatBytes(baseline.gzipBytes),
            formatDelta(size.gzipBytes, baseline.gzipBytes),
          ],
        ],
      ),
    );
  } else {
    parts.push(
      table(
        ['File', 'Size'],
        [
          ['`main.js`', formatBytes(size.bytes)],
          ['`main.js` (gzip)', formatBytes(size.gzipBytes)],
        ],
      ),
      input.event === 'push'
        ? `This run uploads \`bundle-size.json\` for \`${size.sha.slice(0, 7)}\` as the baseline for pull requests.`
        : '> No baseline yet: no `bundle-size.json` from a successful `main` run was found, so there is nothing to compare against.',
    );
  }
  if (artifact) {
    const link = artifact.url ? `[\`${artifact.name}\`](${artifact.url})` : `\`${artifact.name}\``;
    const kept = artifact.retentionDays ? ` Kept for ${artifact.retentionDays} days.` : '';
    parts.push(
      '### Plugin artifact',
      `${link} contains \`main.js\`, \`manifest.json\` and \`styles.css\`.${kept}`,
      'To try it: unzip the three files into `<vault>/.obsidian/plugins/mind-mapper/` of a test vault, then reload Obsidian.',
    );
  }
  return parts.join('\n\n');
}

// --- CLI ---

/** @param {string | undefined} path */
function readIfExists(path) {
  return path && existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * Parse a report, or warn and return null when it is missing or broken.
 * @template T
 * @param {string | undefined} path
 * @param {(text: string) => T} parse
 * @returns {T | null}
 */
function parseReport(path, parse) {
  const text = readIfExists(path);
  if (text === null) return null;
  try {
    return parse(text);
  } catch (error) {
    process.stderr.write(`ci-summary: cannot parse ${path}: ${String(error)}\n`);
    return null;
  }
}

/** @param {string} markdown */
function writeSummary(markdown) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) appendFileSync(target, `${markdown}\n`);
  else process.stdout.write(`${markdown}\n`);
}

/** @param {string[]} args */
function lintCommand(args) {
  const root = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const { values } = parseArgs({
    args,
    options: Object.fromEntries(
      ['prettier', 'eslint', 'tsc'].flatMap((tool) => [
        [tool, { type: 'string' }],
        [`${tool}-outcome`, { type: 'string' }],
      ]),
    ),
  });
  /** @param {string} key */
  const str = (key) => {
    const value = values[key];
    return typeof value === 'string' ? value : undefined;
  };
  const prettier = parseReport(str('prettier'), parsePrettierOutput);
  const eslint = parseReport(str('eslint'), (t) => parseEslintReport(t, root));
  const tsc = parseReport(str('tsc'), parseTscOutput);
  const lines = lintAnnotations({ prettier: prettier ?? [], eslint: eslint ?? [], tsc: tsc ?? [] });
  if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`);
  writeSummary(
    renderLintSummary({
      prettier: { outcome: toOutcome(str('prettier-outcome')), files: prettier },
      eslint: { outcome: toOutcome(str('eslint-outcome')), findings: eslint },
      tsc: { outcome: toOutcome(str('tsc-outcome')), errors: tsc },
    }),
  );
}

/** @param {string[]} args */
function coverageCommand(args) {
  const totals = parseReport(args[0], parseCoverageSummary);
  writeSummary(
    totals
      ? renderCoverageSummary(totals)
      : `## Coverage\n\n_No coverage summary at \`${args[0] ?? ''}\`. See the test step log._`,
  );
}

/** @param {string[]} args */
function sizeCommand(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { sha: { type: 'string' }, out: { type: 'string' } },
  });
  const [file] = positionals;
  if (!file || !values.out) throw new Error('size: need <file> and --out');
  const result = measureBundle(readFileSync(file), values.sha ?? 'unknown');
  writeFileSync(values.out, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${file}: ${result.bytes} bytes, ${result.gzipBytes} bytes gzipped\n`);
}

/** @param {string[]} args */
function buildCommand(args) {
  const { values } = parseArgs({
    args,
    options: {
      size: { type: 'string' },
      baseline: { type: 'string' },
      manifest: { type: 'string' },
      event: { type: 'string' },
      'artifact-name': { type: 'string' },
      'artifact-url': { type: 'string' },
      'retention-days': { type: 'string' },
    },
  });
  const size = parseReport(values.size, parseBundleSize);
  if (!size) throw new Error(`build: no valid bundle size at ${values.size ?? '(none)'}`);
  /** @type {unknown} */
  const manifest = parseReport(values.manifest, (t) => /** @type {unknown} */ (JSON.parse(t)));
  const name = values['artifact-name'];
  writeSummary(
    renderBuildSummary({
      size,
      baseline: parseReport(values.baseline, parseBundleSize),
      event: values.event ?? process.env.GITHUB_EVENT_NAME ?? '',
      version: isRecord(manifest) && typeof manifest.version === 'string' ? manifest.version : null,
      artifact: name
        ? {
            name,
            url: values['artifact-url'] || null,
            retentionDays: Number(values['retention-days'] ?? 0) || null,
          }
        : null,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...rest] = process.argv.slice(2);
  /** @type {Record<string, (args: string[]) => void>} */
  const commands = {
    lint: lintCommand,
    coverage: coverageCommand,
    size: sizeCommand,
    build: buildCommand,
  };
  const run = command ? commands[command] : undefined;
  if (!run) {
    process.stderr.write(
      `ci-summary: unknown command "${command ?? ''}" (lint, coverage, size, build)\n`,
    );
    process.exit(1);
  }
  try {
    run(rest);
  } catch (error) {
    process.stderr.write(`ci-summary: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
