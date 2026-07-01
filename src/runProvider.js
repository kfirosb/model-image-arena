export async function runOne(provider, prompt, timeoutMs = 60000) {
  // id/label are read defensively so a malformed provider never causes a
  // rejection below — runOne must always resolve.
  const id = provider?.id;
  const label = provider?.label;
  const limitMs = provider?.timeoutMs ?? timeoutMs;

  let timer;
  try {
    if (!provider.hasKey()) return { id, label, status: 'no_key' };

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), limitMs);
    });

    const out = await Promise.race([provider.generate(prompt), timeout]);
    return {
      id, label, status: 'done',
      type: out.type ?? 'image',
      image: out.image ?? null,
      video: out.video ?? null,
      ms: out.ms ?? null,
      cost: out.cost ?? 0,
    };
  } catch (err) {
    return { id, label, status: 'error', error: String(err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}
