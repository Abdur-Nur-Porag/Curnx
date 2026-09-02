// ============================================================
//  CURNX v1.3 — src/app.js
//  Main UI / App Logic
//  Handles editor, output rendering, run button, samples, and
//  the v1.3 virtual memory viewer panel.
//  Drives the engine entirely through the public Curnx API
//  (engine/curnx.js) rather than touching the parser/interpreter
//  directly — this is how user code is expected to call it too.
// ============================================================

let outputLines = [];

// ── Output helpers ────────────────────────────────────────────
function addLine(text, cls = 'out-stdout') {
  outputLines.push({ text, cls });
  renderOutput();
}

function renderOutput() {
  const wrap = document.getElementById('output-wrap');
  wrap.innerHTML = outputLines
    .map(l => `<div class="out-line ${l.cls}">${escHtml(l.text)}</div>`)
    .join('');
  wrap.scrollTop = wrap.scrollHeight;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function clearOutput() {
  outputLines = [];
  renderOutput();
  document.getElementById('status').textContent = 'Cleared';
  resetMemoryPanel();
}

// ── v1.3 — Memory viewer panel ───────────────────────────────
// Renders result.memory (from Curnx.execute()) — the global
// variables and allocator stats from the run that just finished.
// Local/stack variables aren't shown here: by the time a program
// finishes, their stack frames have really been popped, exactly
// like on a real machine — there's nothing left to inspect.
function toggleMemoryPanel() {
  const panel = document.getElementById('memory-panel');
  const btn   = document.getElementById('memory-toggle');
  const open  = panel.classList.toggle('open');
  btn.classList.toggle('btn-active', open);
}

function resetMemoryPanel() {
  document.getElementById('memory-panel-body').innerHTML =
    '<div class="mem-empty">Run a program to inspect its virtual memory here.</div>';
}

function fmtMemValue(v) {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(6);
  return escHtml(String(v));
}

function renderMemoryPanel(mem) {
  const body = document.getElementById('memory-panel-body');
  if (!mem) { resetMemoryPanel(); return; }

  const globalsRows = mem.globals.length
    ? mem.globals.map(g => `
        <tr>
          <td>${escHtml(g.name)}</td>
          <td class="mem-addr">${escHtml(g.address)}</td>
          <td class="mem-type">${escHtml(g.type)}</td>
          <td class="mem-value">${fmtMemValue(g.value)}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="mem-empty">no global variables</td></tr>`;

  const s = mem.stats;
  body.innerHTML = `
    <h4>Global / Data Segment</h4>
    <table>
      <thead><tr><th>Name</th><th>Address</th><th>Type</th><th>Value</th></tr></thead>
      <tbody>${globalsRows}</tbody>
    </table>
    <h4>Allocator Stats</h4>
    <div class="mem-stats">
      data segment: <b>${s.dataUsed}</b> bytes used &nbsp;·&nbsp;
      heap: <b>${s.heapLiveBlocks}</b> live block${s.heapLiveBlocks === 1 ? '' : 's'}
      (<b>${s.heapLiveBytes}</b> bytes), <b>${s.heapBumpUsed}</b> bytes ever allocated &nbsp;·&nbsp;
      stack: peak <b>${s.stackPeakUsed}</b> bytes used
    </div>`;
}

// ── Run pipeline, via Curnx.execute() ────────────────────────
async function runCode() {
  outputLines = [];
  const src    = document.getElementById('editor').value;
  const status = document.getElementById('status');
  const start  = performance.now();

  let outBuf = '';
  const flushBuf = () => {
    if (outBuf) { addLine(outBuf, 'out-stdout'); outBuf = ''; }
  };

  status.textContent = 'Compiling & running...';

  try {
    const result = await Curnx.execute(src, {
      basePath: 'examples/', // where "#include" user/.jh headers resolve from
      onOutput: (text) => {
        outBuf += text;
        const lines = outBuf.split('\n');
        outBuf = lines.pop();
        lines.forEach(l => addLine(l, 'out-stdout'));
      }
    });

    flushBuf();
    const elapsed = (performance.now() - start).toFixed(1);

    if (result.error) {
      addLine(`Error: ${result.error}`, 'out-err');
      status.textContent = `Error: ${result.error.slice(0, 60)}`;
    } else {
      addLine(`— exited with code ${result.exitCode} in ${elapsed}ms —`, 'out-info');
      status.textContent = `Done in ${elapsed}ms · ${result.steps.toLocaleString()} steps`;
    }
    renderMemoryPanel(result.memory);

  } catch (e) {
    flushBuf();
    addLine(`Error: ${e.message}`, 'out-err');
    status.textContent = `Error: ${e.message.slice(0, 60)}`;
    resetMemoryPanel();
  }
}

// ── Sample buttons ────────────────────────────────────────────
function loadSamples() {
  const container = document.getElementById('samples');
  SAMPLES.forEach(s => {
    const btn       = document.createElement('button');
    btn.className   = 'btn btn-sample';
    btn.textContent = s.label;
    btn.onclick     = () => {
      document.getElementById('editor').value = s.code;
      document.getElementById('status').textContent = `Loaded: ${s.label}`;
    };
    container.appendChild(btn);
  });
}

// ── Keyboard shortcuts ────────────────────────────────────────
function initEditor() {
  const editor = document.getElementById('editor');

  // Ctrl/Cmd + Enter → Run
  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runCode();
    }
    // Tab → 4 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = editor.selectionStart;
      editor.value = editor.value.slice(0, s) + '    ' + editor.value.slice(editor.selectionEnd);
      editor.selectionStart = editor.selectionEnd = s + 4;
    }
  });

  // Load default sample
  editor.value = SAMPLES[0].code;
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSamples();
  initEditor();
  renderOutput();
});
