import { useEffect, useRef, useState } from 'react';

function parseUnifiedDiff(patch) {
  const lines = [];
  let hunk = null;
  let incomplete = false;
  let hasHunks = false;
  const sourceLines = patch.split(/\r?\n/);
  if (sourceLines.at(-1) === '') sourceLines.pop();

  for (const text of sourceLines) {
    const header = text.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/);
    if (header) {
      const [oldStart, oldCount, newStart, newCount] = [Number(header[1]), Number(header[2] ?? 1), Number(header[3]), Number(header[4] ?? 1)];
      if (![oldStart, oldCount, newStart, newCount, oldStart + oldCount, newStart + newCount].every(Number.isSafeInteger)
        || (oldCount > 0 && oldStart === 0) || (newCount > 0 && newStart === 0)) {
        incomplete = true;
        hunk = null;
        lines.push({ kind: 'meta', oldNumber: null, newNumber: null, text });
        continue;
      }
      if (hunk && (hunk.oldRemaining !== 0 || hunk.newRemaining !== 0)) incomplete = true;
      hunk = {
        oldNumber: Number(header[1]), newNumber: Number(header[3]),
        oldRemaining: Number(header[2] ?? 1), newRemaining: Number(header[4] ?? 1)
      };
      hasHunks = true;
      lines.push({ kind: 'hunk', oldNumber: null, newNumber: null, text });
      continue;
    }

    const kind = { '+': 'added', '-': 'deleted', ' ': 'context' }[text[0]];
    if (text.startsWith('\\ No newline at end of file')) {
      lines.push({ kind: 'meta', oldNumber: null, newNumber: null, text });
      continue;
    }

    const usesOld = kind === 'deleted' || kind === 'context';
    const usesNew = kind === 'added' || kind === 'context';
    if (hunk && kind && (!usesOld || hunk.oldRemaining > 0) && (!usesNew || hunk.newRemaining > 0)) {
      lines.push({ kind, oldNumber: usesOld ? hunk.oldNumber++ : null, newNumber: usesNew ? hunk.newNumber++ : null, text: text.slice(1) });
      if (usesOld) hunk.oldRemaining--;
      if (usesNew) hunk.newRemaining--;
    } else {
      // Once a hunk is malformed, wait for a real header before numbering again.
      if (hunk || text.startsWith('@@')) incomplete = true;
      hunk = null;
      lines.push({ kind: 'meta', oldNumber: null, newNumber: null, text });
    }
  }

  if (hunk && (hunk.oldRemaining !== 0 || hunk.newRemaining !== 0)) incomplete = true;
  return { lines, incomplete, hasHunks };
}

function findDiffLocation(files, location) {
  if (!location || !Number.isSafeInteger(location.lineNumber) || location.lineNumber < 1) return null;
  const file = files.find(file => file.path === location.filePath);
  if (typeof file?.patch !== 'string') return null;
  return parseUnifiedDiff(file.patch).lines.find(line => line.newNumber === location.lineNumber) || null;
}

function DiffViewer({ files = [], focusLocation = null }) {
  const [selectedPath, setSelectedPath] = useState(() => findDiffLocation(files, focusLocation) ? focusLocation.filePath : null);
  const focusedRow = useRef(null);
  const selectedFile = files.find((file) => file.path === selectedPath) || files[0];
  const patch = typeof selectedFile?.patch === 'string' ? selectedFile.patch : '';
  const diff = parseUnifiedDiff(patch);
  const isBinary = /^(Binary files .* differ|GIT binary patch)\r?$/m.test(patch);
  const countMismatch = diff.hasHunks && (
    (Number.isFinite(selectedFile.additions) && diff.lines.filter((line) => line.kind === 'added').length !== selectedFile.additions) ||
    (Number.isFinite(selectedFile.deletions) && diff.lines.filter((line) => line.kind === 'deleted').length !== selectedFile.deletions)
  );

  useEffect(() => {
    if (findDiffLocation(files, focusLocation)) setSelectedPath(focusLocation.filePath);
  }, [files, focusLocation]);

  useEffect(() => {
    if (focusedRow.current) {
      focusedRow.current.scrollIntoView({ block: 'center', inline: 'nearest' });
      focusedRow.current.focus({ preventScroll: true });
    }
  }, [selectedFile?.path, focusLocation]);

  return (
    <section className="diff-section" aria-labelledby="diff-title">
      <div className="section-heading">
        <div><p className="section-label">Code changes</p><h2 id="diff-title">Changed files</h2></div>
        <span className="history-count">{files.length} files</span>
      </div>
      {files.length === 0 ? <p className="muted-text">No changed files are available in this saved analysis.</p> : (
        <div className="diff-workspace">
          <nav className="diff-file-list" aria-label="Changed files">
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                className="diff-file-button"
                aria-pressed={selectedFile === file}
                aria-controls="selected-file-diff"
                onClick={() => setSelectedPath(file.path)}
              >
                <span className="diff-file-path">{file.path}</span>
                <span className="diff-file-meta">
                  <span>{file.status === 'removed' ? 'deleted' : file.status || 'unknown'}</span>
                  {Number.isFinite(file.additions) && <span className="diff-additions">+{file.additions}</span>}
                  {Number.isFinite(file.deletions) && <span className="diff-deletions">−{file.deletions}</span>}
                </span>
              </button>
            ))}
          </nav>
          <div className="diff-file-panel" id="selected-file-diff">
            <h3 className="diff-selected-path">{selectedFile.path}</h3>
            {selectedFile.previousPath && <p className="diff-message">Renamed from <code>{selectedFile.previousPath}</code></p>}
            {!patch.trim() ? (
              <p className="diff-message">No text patch was saved for this file. It may be binary or unavailable from GitHub. This does not mean there were no changes.</p>
            ) : isBinary ? (
              <p className="diff-message">This is a binary diff. Text lines and line numbers are not available.</p>
            ) : (
              <>
                {(diff.incomplete || countMismatch) && <p className="diff-warning" role="status">This saved patch is incomplete or inconsistent with the reported changes. Only available lines are shown; malformed lines remain unnumbered.</p>}
                {!diff.hasHunks && <p className="diff-warning">No valid unified diff hunk headers were saved. Line numbers are unavailable.</p>}
                <div className="diff-scroll" role="region" aria-label={`Diff for ${selectedFile.path}`} tabIndex={0}>
                  <table className="diff-table" aria-label="Unified diff">
                    <thead><tr><th scope="col">Old</th><th scope="col">New</th><th scope="col" aria-label="Change type">±</th><th scope="col">Code</th></tr></thead>
                    <tbody>
                      {diff.lines.map((line, index) => (
                        <tr key={index}
                          ref={focusLocation?.filePath === selectedFile.path && focusLocation?.lineNumber === line.newNumber ? focusedRow : null}
                          tabIndex={focusLocation?.filePath === selectedFile.path && focusLocation?.lineNumber === line.newNumber ? -1 : undefined}
                          className={`diff-line diff-line-${line.kind}${focusLocation?.filePath === selectedFile.path && focusLocation?.lineNumber === line.newNumber ? ' diff-line-focused' : ''}`}>
                          {line.kind === 'hunk' || line.kind === 'meta' ? <td colSpan={4}><code>{line.text}</code></td> : (
                            <>
                              <td className="diff-line-number">{line.oldNumber}</td>
                              <td className="diff-line-number">{line.newNumber}</td>
                              <td className="diff-marker">{line.kind === 'added' ? '+' : line.kind === 'deleted' ? '-' : ' '}</td>
                              <td className="diff-code"><code>{line.text}</code></td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export { parseUnifiedDiff, findDiffLocation };
export default DiffViewer;
