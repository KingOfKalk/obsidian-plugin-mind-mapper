import {
  formatAnnotation,
  formatDelta,
  lintAnnotations,
  measureBundle,
  parseBundleSize,
  parseCoverageSummary,
  parseEslintReport,
  parsePrettierOutput,
  parseTscOutput,
  renderBuildSummary,
  renderCoverageSummary,
  renderLintSummary,
} from '../../scripts/ci-summary.mjs';

const root = '/repo';

test('parsePrettierOutput lists the unformatted files only', () => {
  const output = [
    'Checking formatting...',
    '[warn] src/main.ts',
    '[warn] tests/a b.test.ts',
    '[warn] Code style issues found in 2 files. Run Prettier with --write to fix.',
  ].join('\n');
  expect(parsePrettierOutput(output)).toEqual(['src/main.ts', 'tests/a b.test.ts']);
  expect(
    parsePrettierOutput('Checking formatting...\nAll matched files use Prettier code style!'),
  ).toEqual([]);
});

test('parseEslintReport flattens messages with repo-relative paths', () => {
  const report = JSON.stringify([
    {
      filePath: '/repo/src/main.ts',
      messages: [
        { ruleId: 'no-var', severity: 2, message: 'Unexpected var.', line: 3, column: 1 },
        { ruleId: null, severity: 1, message: 'Unused directive.', line: 9, column: 2 },
      ],
    },
    { filePath: '/repo/src/clean.ts', messages: [] },
  ]);
  expect(parseEslintReport(report, root)).toEqual([
    {
      file: 'src/main.ts',
      line: 3,
      column: 1,
      severity: 'error',
      rule: 'no-var',
      message: 'Unexpected var.',
    },
    {
      file: 'src/main.ts',
      line: 9,
      column: 2,
      severity: 'warning',
      rule: null,
      message: 'Unused directive.',
    },
  ]);
});

test('parseTscOutput reads file errors, global errors and continuation lines', () => {
  const output = [
    "src/a.ts(4,7): error TS2322: Type 'string' is not assignable to type 'number'.",
    "  Type 'x' is not assignable.",
    'error TS5083: Cannot read file tsconfig.json.',
  ].join('\n');
  expect(parseTscOutput(output)).toEqual([
    {
      file: 'src/a.ts',
      line: 4,
      column: 7,
      code: 'TS2322',
      message: "Type 'string' is not assignable to type 'number'.\nType 'x' is not assignable.",
    },
    { code: 'TS5083', message: 'Cannot read file tsconfig.json.' },
  ]);
});

test('formatAnnotation escapes properties and data', () => {
  expect(
    formatAnnotation({
      level: 'error',
      file: 'src/a,b.ts',
      line: 2,
      col: 3,
      title: 'tsc TS1: x',
      message: '50% off\nnext',
    }),
  ).toBe('::error file=src/a%2Cb.ts,line=2,col=3,title=tsc TS1%3A x::50%25 off%0Anext');
});

test('lintAnnotations caps each level and adds a notice for the rest', () => {
  const findings = Array.from({ length: 12 }, (_, i) => ({
    file: 'src/a.ts',
    line: i + 1,
    column: 1,
    severity: 'error' as const,
    rule: 'r',
    message: `m${i}`,
  }));
  const lines = lintAnnotations({ prettier: [], eslint: findings, tsc: [] });
  expect(lines).toHaveLength(11);
  expect(lines[10]).toMatch(/^::notice title=More findings::2 more/);
});

test('lintAnnotations marks unformatted files', () => {
  expect(lintAnnotations({ prettier: ['src/a.ts'], eslint: [], tsc: [] })).toEqual([
    '::error file=src/a.ts,title=Prettier::File is not formatted. Run `npm run format`.',
  ]);
});

test('renderLintSummary shows each check with its result and findings', () => {
  const md = renderLintSummary({
    prettier: { outcome: 'failure', files: ['src/a.ts'] },
    eslint: {
      outcome: 'success',
      findings: [
        { file: 'src/b.ts', line: 1, column: 2, severity: 'warning', rule: 'r', message: 'w' },
      ],
    },
    tsc: { outcome: 'success', errors: [] },
  });
  expect(md).toContain('## Lint');
  expect(md).toContain('| Prettier | ❌ failed | 1 file not formatted |');
  expect(md).toContain('| ESLint | ✅ passed | 0 errors, 1 warning |');
  expect(md).toContain('| TypeScript | ✅ passed | 0 errors |');
  expect(md).toContain('`src/a.ts`');
  expect(md).toContain('`src/b.ts:1:2` warning `r`: w');
});

test('renderLintSummary says when a report is missing', () => {
  const md = renderLintSummary({
    prettier: { outcome: 'success', files: [] },
    eslint: { outcome: 'failure', findings: null },
    tsc: { outcome: 'success', errors: [] },
  });
  expect(md).toContain('| ESLint | ❌ failed | no report |');
});

const coverageJson = JSON.stringify({
  total: {
    lines: { total: 200, covered: 150, skipped: 0, pct: 75 },
    statements: { total: 210, covered: 155, skipped: 0, pct: 73.81 },
    functions: { total: 40, covered: 30, skipped: 0, pct: 75 },
    branches: { total: 100, covered: 60, skipped: 0, pct: 60 },
  },
});

test('coverage summary renders a table of the totals', () => {
  const md = renderCoverageSummary(parseCoverageSummary(coverageJson));
  expect(md).toContain('## Coverage');
  expect(md).toContain('| Statements | 73.81% | 155 / 210 |');
  expect(md).toContain('| Branches | 60.00% | 60 / 100 |');
});

test('parseCoverageSummary rejects a report without totals', () => {
  expect(() => parseCoverageSummary('{}')).toThrow(/total/);
});

test('measureBundle and parseBundleSize round-trip', () => {
  const size = measureBundle(Buffer.from('x'.repeat(1000)), 'abcdef1234');
  expect(size.bytes).toBe(1000);
  expect(size.gzipBytes).toBeLessThan(100);
  expect(parseBundleSize(JSON.stringify(size))).toEqual(size);
  expect(parseBundleSize('{"bytes":"1"}')).toBeNull();
  expect(parseBundleSize('not json')).toBeNull();
});

test('formatDelta signs the difference', () => {
  expect(formatDelta(1100, 1000)).toBe('+100 B (+10.00%)');
  expect(formatDelta(900, 1000)).toBe('−100 B (−10.00%)');
  expect(formatDelta(1000, 1000)).toBe('±0 B');
});

const size = { bytes: 2048, gzipBytes: 1024, sha: 'aaaaaaa1111' };
const artifact = { name: 'mind-mapper-aaaaaaa', url: 'https://example.test/a', retentionDays: 14 };

test('build summary on a pull request compares with the main baseline', () => {
  const md = renderBuildSummary({
    size,
    baseline: { bytes: 1024, gzipBytes: 1024, sha: 'bbbbbbb2222' },
    event: 'pull_request',
    version: '1.4.0',
    artifact,
  });
  expect(md).toContain('## Build');
  expect(md).toContain('`1.4.0`');
  expect(md).toContain('`bbbbbbb` on `main`');
  expect(md).toContain('+1,024 B (+100.00%)');
  expect(md).toContain('[`mind-mapper-aaaaaaa`](https://example.test/a)');
  expect(md).toContain('14 days');
});

test('build summary without a baseline says so', () => {
  const md = renderBuildSummary({
    size,
    baseline: null,
    event: 'pull_request',
    version: '1.4.0',
    artifact,
  });
  expect(md).toContain('No baseline yet');
});

test('build summary on a push to main says it uploads the baseline', () => {
  const md = renderBuildSummary({
    size,
    baseline: null,
    event: 'push',
    version: '1.4.0',
    artifact: null,
  });
  expect(md).toContain('baseline for pull requests');
  expect(md).not.toContain('No baseline yet');
});
