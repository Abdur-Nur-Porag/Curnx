// ============================================================
//  CURNX v1.1 — src/app.js
//  Main UI / App Logic
//  Handles editor, output rendering, run button, samples.
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

  } catch (e) {
    flushBuf();
    addLine(`Error: ${e.message}`, 'out-err');
    status.textContent = `Error: ${e.message.slice(0, 60)}`;
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
