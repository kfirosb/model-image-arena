export async function runOne(provider, prompt, timeoutMs = 60000) {
  // id/label are read defensively so a malformed provider never causes a
  // rejection below — runOne must always resolve.
  const id = provider?.id;
  const label = provider?.label;

  let timer;
  try {
    if (!provider.hasKey()) return { id, label, status: 'no_key' };

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), timeoutMs);
    });

    const out = await Promise.race([provider.generate(prompt), timeout]);
    return {
      id, label, status: 'done',
      image: out.image,
      ms: out.ms ?? null,
      cost: out.cost ?? 0,
    };
  } catch (err) {
    return { id, label, status: 'error', error: String(err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}
