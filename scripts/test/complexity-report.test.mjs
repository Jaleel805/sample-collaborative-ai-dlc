import assert from 'node:assert/strict';
import test from 'node:test';
import { changeIcon, renderComparison } from '../complexity-report.mjs';

const row = (before, after, coverageDelta) => ({
  path: 'lambda/demo/index.js',
  line: 1,
  function: 'run',
  before,
  after,
  delta: before === null ? null : after - before,
  coverage: { change: { percentagePoints: coverageDelta } },
});

test('green requires improvement without a worsening metric', () => {
  assert.equal(changeIcon(row(50, 40, 10)), '🟢');
  assert.equal(changeIcon(row(50, 40, 0)), '🟢');
  assert.equal(changeIcon(row(50, 50, 5)), '🟢');
  assert.equal(changeIcon(row(50, 40, -1)), '🟠');
  assert.equal(changeIcon(row(50, 51, 30)), '🟠');
  assert.equal(changeIcon(row(50, 50, 0)), '🟠');
});

test('purple requires both metrics to cross their substantial-regression thresholds', () => {
  assert.equal(changeIcon(row(50, 60, -10)), '🟣');
  assert.equal(changeIcon(row(50, 59, -10)), '🔴');
  assert.equal(changeIcon(row(50, 60, -9)), '🔴');
  assert.equal(changeIcon(row(100, 120, -20)), '🟣');
});

test('mixed changes are balanced using relative complexity and coverage percentage points', () => {
  assert.equal(changeIcon(row(50, 55, -5)), '🔴');
  assert.equal(changeIcon(row(50, 54, -5)), '🟠');
  assert.equal(changeIcon(row(50, 60, 5)), '🟠');
  assert.equal(changeIcon(row(50, 70, 5)), '🔴');
  assert.equal(changeIcon(row(100, 110, -5)), '🔴');
  assert.equal(changeIcon(row(50, 40, -20)), '🔴');
});

test('a five-point floor avoids exaggerating tiny complexity increases', () => {
  assert.equal(changeIcon(row(1, 2, -10)), '🔴');
  assert.equal(changeIcon(row(1, 6, -10)), '🟣');
  assert.equal(changeIcon(row(0, 5, -10)), '🟣');
});

test('missing comparisons use current complexity, with strict threshold boundaries', () => {
  for (const [score, icon] of [
    [15, '🟢'],
    [16, '🟠'],
    [50, '🟠'],
    [51, '🔴'],
    [100, '🔴'],
    [101, '🟣'],
  ]) {
    assert.equal(changeIcon(row(null, score, null)), icon, `complexity ${score}`);
  }
  assert.equal(changeIcon(row(50, 70, null)), '🔴');
  assert.equal(changeIcon({ ...row(50, 70, -20), coverage: undefined }), '🔴');
});

test('low measured head coverage escalates current risk, but unknown and branchless coverage do not', () => {
  const current = (score, percent, status = 'measured') => ({
    ...row(null, score, null),
    coverage: { after: { status, percent } },
  });
  assert.equal(changeIcon(current(20, 49.9)), '🔴');
  assert.equal(changeIcon(current(70, 0)), '🟣');
  assert.equal(changeIcon(current(101, 0)), '🟣');
  assert.equal(changeIcon(current(20, 50)), '🟠');
  assert.equal(changeIcon(current(70, 100)), '🔴');
  assert.equal(changeIcon(current(20, null)), '🟠');
  assert.equal(changeIcon(current(70, null, 'unknown')), '🔴');
});

test('Markdown uses a leading icon instead of the Signal column, with an explanatory legend', () => {
  const report = {
    mergeBase: 'a'.repeat(40),
    head: 'b'.repeat(40),
    analyzer: { threshold: 15 },
    files: [],
    findings: [{ ...row(50, 60, -10), dependentFiles: 12 }],
    improvements: [row(50, 40, 10)],
  };
  const markdown = renderComparison(report);
  assert.match(markdown, /\| 🟣 \| lambda\/demo\/index.js/);
  assert.match(markdown, /\| 🟢 \| lambda\/demo\/index.js/);
  assert.doesNotMatch(markdown, /\| Signal \|/);
  assert.match(markdown, /Without comparable data: use current complexity/);
  assert.match(markdown, /Icons are review heuristics/);
  assert.match(markdown, /\| Depending files \|/);
  assert.match(markdown, /\| 12 \|/);
  assert.match(markdown, /\| unknown \|/);
});

test('high usage amplifies coverage risk one level, but preserves green improvements', () => {
  const risk = (count, delta, percent = 80) => ({
    ...row(50, 52, delta),
    dependentFiles: count,
    coverage: { after: { status: 'measured', percent }, change: { percentagePoints: delta } },
  });
  assert.equal(changeIcon(risk(10, -1)), '🟠');
  assert.equal(changeIcon(risk(11, -1)), '🔴');
  assert.equal(changeIcon(risk(11, -10)), '🟣');
  assert.equal(changeIcon(risk(11, 0, 49.9)), '🔴');
  assert.equal(changeIcon(risk(11, 0, 50)), '🟠');
  assert.equal(changeIcon(risk(null, -1)), '🟠');
  assert.equal(changeIcon({ ...row(null, 20, null), dependentFiles: 50 }), '🟠');
  assert.equal(
    changeIcon({
      ...row(50, 40, 5),
      dependentFiles: 50,
      coverage: { after: { status: 'measured', percent: 40 }, change: { percentagePoints: 5 } },
    }),
    '🟢',
  );
  assert.equal(changeIcon({ ...row(50, 60, -10), dependentFiles: 50 }), '🟣');
  assert.equal(
    changeIcon({
      ...row(50, 52, 0),
      dependentFiles: 11,
      coverage: { change: { percentagePoints: 0, uncovered: 1 } },
    }),
    '🔴',
  );
});
