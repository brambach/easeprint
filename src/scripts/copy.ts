/** Copy buttons: put the exact value on the clipboard and say so. */
async function write(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

document.addEventListener('click', async (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-copy]');
  if (!button) return;
  const text = button.dataset.copy ?? '';
  const ok = await write(text);
  const status = button.parentElement?.querySelector<HTMLElement>('[data-copy-status]');
  if (status) {
    status.textContent = ok ? `Copied: ${text.split('\n')[0]}${text.includes('\n') ? ' …' : ''}` : 'Copy failed. Select the value above instead.';
    window.setTimeout(() => {
      if (status.textContent?.startsWith(ok ? 'Copied' : 'Copy failed')) status.textContent = '';
    }, 2400);
  }
});
