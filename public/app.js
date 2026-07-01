const form = document.getElementById('prompt-form');
const promptEl = document.getElementById('prompt');
const goBtn = document.getElementById('go');
const statusEl = document.getElementById('status');
const estimateEl = document.getElementById('estimate');
const grid = document.getElementById('grid');
const tabsEl = document.getElementById('tabs');

const tiles = new Map();     // id -> tile element
const meta = new Map();      // id -> { kind, cost, status }
let activeKind = 'image';    // 'image' | 'video' — which tab is showing

function tile(id, label) {
  let el = tiles.get(id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = `
      <div class="imgwrap"></div>
      <div class="meta">
        <div class="label">
          <label class="pick"><input type="checkbox" class="run" /> <span class="name"></span></label>
          <button class="star" title="favorite">★</button>
        </div>
        <div class="sub"></div>
      </div>`;
    el.querySelector('.star').addEventListener('click', (e) => e.currentTarget.classList.toggle('on'));
    el.querySelector('.run').addEventListener('change', updateEstimate);
    grid.appendChild(el);
    tiles.set(id, el);
  }
  el.querySelector('.name').textContent = label;
  return el;
}

// Only the checked tiles belonging to the active tab count.
function selectedIds() {
  const ids = [];
  for (const [id, el] of tiles) {
    if (el.querySelector('.run').checked && meta.get(id)?.kind === activeKind) ids.push(id);
  }
  return ids;
}

function updateEstimate() {
  const ids = selectedIds();
  let total = 0;
  for (const id of ids) total += (meta.get(id)?.cost || 0);
  const n = ids.length;
  const noun = activeKind === 'video' ? 'video' : 'image';
  estimateEl.textContent = `Estimated: $${total.toFixed(3)} for ${n} ${noun} model${n === 1 ? '' : 's'}`;
}

function setTab(kind) {
  activeKind = kind;
  grid.dataset.kind = kind;               // CSS hides the other kind's tiles
  for (const btn of tabsEl.querySelectorAll('.tab')) {
    btn.classList.toggle('active', btn.dataset.kind === kind);
  }
  statusEl.textContent = '';
  updateEstimate();
}

function render(id, label, state) {
  const el = tile(id, label);
  const wrap = el.querySelector('.imgwrap');
  const sub = el.querySelector('.sub');
  // status drives the tile class; visibility is handled by grid[data-kind] CSS
  el.className = `tile ${state.status}`;
  wrap.querySelectorAll('img,video').forEach((n) => n.remove());
  el.removeAttribute('data-error');
  if (state.status === 'done') {
    if (state.type === 'video' && state.video) {
      const v = document.createElement('video');
      v.src = state.video; v.controls = true; v.loop = true; v.muted = true; v.playsInline = true;
      wrap.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = state.image; img.alt = label;
      wrap.appendChild(img);
    }
    const cost = state.cost != null ? `$${state.cost.toFixed(3)}` : '—';
    sub.textContent = `${state.ms ?? '?'} ms · ${cost}`;
  } else if (state.status === 'error') {
    el.setAttribute('data-error', state.error || 'error');
    sub.textContent = 'failed';
  } else if (state.status === 'no_key') {
    sub.textContent = 'add key in .env to enable';
  } else {
    sub.textContent = '';
  }
}

async function loadProviders() {
  const res = await fetch('/api/providers');
  const { providers } = await res.json();
  grid.innerHTML = '';
  tiles.clear();
  meta.clear();
  for (const p of providers) {
    meta.set(p.id, { kind: p.kind, cost: p.cost, status: p.status });
    render(p.id, p.label, { status: p.status });
    const el = tiles.get(p.id);
    el.dataset.kind = p.kind;             // used by the tab-filtering CSS
    const box = el.querySelector('.run');
    box.disabled = p.status !== 'ready';
    // default: image models checked, video models unchecked
    box.checked = p.status === 'ready' && p.kind !== 'video';
    const costLabel = p.cost ? ` · ~$${Number(p.cost).toFixed(3)}` : '';
    el.querySelector('.sub').textContent =
      (p.status === 'no_key' ? 'add key in .env to enable' : (p.kind === 'video' ? 'video' : 'image')) + costLabel;
  }
  setTab(activeKind);
}

tabsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (btn) setTab(btn.dataset.kind);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = promptEl.value.trim();
  if (!prompt) return;
  const ids = selectedIds();
  if (!ids.length) { statusEl.textContent = `Select at least one ${activeKind} model.`; return; }
  goBtn.disabled = true;
  statusEl.textContent = 'Generating…';
  for (const id of ids) {
    render(id, tiles.get(id).querySelector('.name').textContent, { status: 'loading' });
  }
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, ids }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'request failed');
    for (const r of data.results) render(r.id, r.label, r);
    statusEl.textContent = `Done: "${data.prompt}"`;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    goBtn.disabled = false;
  }
});

loadProviders();
