// Dependency-free: also used by the trusted CI comment job, which never loads
// modules or Markdown supplied by a pull request.
const cell = (value) =>
  String(value)
    .slice(0, 500)
    .replace(/[&<>|`\r\n@[\]\\!*_~]/g, (character) => `&#${character.charCodeAt(0)};`);
const signed = (value) => `${value > 0 ? '+' : ''}${value}`;
const uncovered = (value) => (value?.status === 'measured' ? value.uncovered : '?');
const percent = (coverage) =>
  coverage?.status !== 'measured'
    ? 'unknown'
    : coverage.percent === null
      ? 'n/a'
      : `${coverage.percent.toFixed(1)}%${coverage.partial ? '*' : ''}`;

function currentRiskIcon(row) {
  let level = row.after > 100 ? 3 : row.after > 50 ? 2 : row.after > 15 ? 1 : 0;
  const coverage = row.coverage?.after;
  if (coverage?.status === 'measured' && coverage.percent != null && coverage.percent < 50) {
    level = Math.min(3, level + 1);
  }
  return ['🟢', '🟠', '🔴', '🟣'][level];
}

function complexityCoverageIcon(row) {
  const coverageDelta = row.coverage?.change?.percentagePoints;
  if (row.before == null || row.delta == null || coverageDelta == null) return currentRiskIcon(row);

  // Normalize the two different units before balancing mixed changes.
  // The five-point floor keeps tiny complexity changes from looking drastic.
  const complexityWorsening = row.delta / Math.max(5, row.before * 0.2);
  const coverageWorsening = -coverageDelta / 10;
  if (
    complexityWorsening <= 0 &&
    coverageWorsening <= 0 &&
    (complexityWorsening < 0 || coverageWorsening < 0)
  )
    return '🟢';
  if (complexityWorsening >= 1 && coverageWorsening >= 1) return '🟣';
  return complexityWorsening + coverageWorsening >= 1 ? '🔴' : '🟠';
}

export function changeIcon(row) {
  const icon = complexityCoverageIcon(row);
  const { after, change } = row.coverage ?? {};
  const weakCoverage = after?.status === 'measured' && after.percent != null && after.percent < 50;
  const regressingCoverage = change?.percentagePoints < 0 || change?.uncovered > 0;
  // Keep improvements green. Coupling amplifies an existing warning, not debt alone.
  if (icon !== '🟢' && row.dependentFiles > 10 && (weakCoverage || regressingCoverage)) {
    return icon === '🟠' ? '🔴' : '🟣';
  }
  return icon;
}

function renderRows(rows) {
  return [
    '| | File / function | Complexity | Δ | Branch coverage | Δ | Uncovered branches | Depending files |',
    '| --- | --- | ---: | ---: | --- | ---: | ---: | ---: |',
    ...rows.slice(0, 20).map((row) => {
      const { before, after, change } = row.coverage ?? {};
      const coverage = `${percent(before)} → ${percent(after)}`;
      const delta = change?.percentagePoints;
      return `| ${changeIcon(row)} | ${cell(`${row.path}:${row.line} — ${row.function}`)} | ${row.before ?? '—'} → ${row.after} | ${row.delta === null ? '—' : signed(row.delta)} | ${coverage} | ${delta == null ? '—' : signed(Number(delta.toFixed(1)))} | ${uncovered(before)} → ${uncovered(after)} | ${row.dependentFiles ?? 'unknown'} |`;
    }),
    ...(rows.length > 20
      ? [`\nShowing 20 of ${rows.length}; the JSON report contains every result.`]
      : []),
  ].join('\n');
}

export function renderComparison(report) {
  const lines = [
    '# Complexity and test coverage',
    '',
    `Merge base \`${cell(report.mergeBase)}\` → head \`${cell(report.head)}\`.`,
    `Analyzed ${report.files.length} source files with source or coverage changes. Advisory threshold: ${report.analyzer.threshold}.`,
    '',
    `${report.findings.length} new/unmatched or worsening functions above the threshold.`,
  ];
  for (const note of report.coverageNotes ?? []) lines.push('', cell(note));
  if (report.dependencyNote) lines.push('', cell(report.dependencyNote));
  if (report.findings.length) lines.push('', renderRows(report.findings));
  if (report.improvements.length) {
    lines.push(
      '',
      `## Complexity improvements (${report.improvements.length})`,
      '',
      renderRows(report.improvements),
    );
  }
  lines.push(
    '',
    'With comparable data: 🟢 Improving without either metric worsening · 🟠 Mixed or small changes · 🔴 Large net regression · 🟣 Both worsen substantially.',
    'Without comparable data: use current complexity—🟢 ≤15, 🟠 >15, 🔴 >50, 🟣 >100. Measured head coverage below 50% raises the color one level; unknown coverage leaves it unchanged.',
    'Depending files = direct production importers of the file at PR head (backend only; excludes tests and AWS/external callers). More than 10 raises an existing warning one level, capped at purple, when coverage is below 50% or regresses. Improvements stay green.',
    'Comparison scale: complexity Δ / max(5, 20% of base complexity), minus coverage Δ / 10 percentage points. Net ≥ 1 is red; both worsening by ≥ 1 unit is purple. Icons are review heuristics, not correctness guarantees; * measurements also make the icon provisional.',
    'Review order: coverage regressions first, then uncovered branch count, then complexity increase.',
    'Branch coverage uses backend Vitest/V8 outcomes assigned to the innermost function. * = measured with failing or interrupted tests; coverage and deltas may be incomplete. Frontend and missing data are unknown; n/a means no measured outcomes. Coverage Δ is measured in percentage points.',
    'Unchanged existing complexity is omitted unless coverage regresses. Improvements do not offset findings.',
    'New or unmatched means no confident function match was found; no increase is inferred.',
    'Advisory review aid, not a correctness guarantee or merge gate.',
    '',
  );
  return lines.join('\n');
}
