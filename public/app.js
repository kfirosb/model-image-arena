const form = document.getElementById('prompt-form');
const promptEl = document.getElementById('prompt');
const goBtn = document.getElementById('go');
const statusEl = document.getElementById('status');
const grid = document.getElementById('grid');

const tiles = new Map(); // id -> tile element

function tile(id, label) {
  let el = tiles.get(id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = `
      <div class="imgwrap"></div>
      <div class="meta">
        <div class="label"><span class="name"></span><button class="star" title="favorite">★</button></div>
        <div class="sub"></div>
      </div>`;
    el.querySelector('.star').addEventListener('click', (e) => {
      e.currentTarget.classList.toggle('on');
    });
    grid.appendChild(el);
    tiles.set(id, el);
  }
  el.querySelector('.name').textContent = label;
  return el;
}

function render(id, label, state) {
  const el = tile(id, label);
  const wrap = el.querySelector('.imgwrap');
  const sub = el.querySelector('.sub');
  el.className = `tile ${state.status}`;
  wrap.querySelectorAll('img').forEach((n) => n.remove());
  el.removeAttribute('data-error');
  if (state.status === 'done') {
    const img = document.createElement('img');
    img.src = state.image;
    img.alt = label;
    wrap.appendChild(img);
    const cost = state.cost ? `$${state.cost.toFixed(3)}` : '—';
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
  for (const p of providers) render(p.id, p.label, { status: p.status });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = promptEl.value.trim();
  if (!prompt) return;
  goBtn.disabled = true;
  statusEl.textContent = 'Generating…';
  // Set keyed tiles to loading; leave no_key tiles as-is.
  for (const [id, el] of tiles) {
    if (!el.classList.contains('no_key')) {
      render(id, el.querySelector('.name').textContent, { status: 'loading' });
    }
  }
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
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
