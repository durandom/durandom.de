export interface Link {
  label: string;
  href: string;
}

export const LINKS: readonly Link[] = [
  { label: 'GitHub', href: 'https://github.com/durandom/' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/marcelhild/' },
  { label: 'b4mad.technology', href: 'https://b4mad.technology/' },
  { label: 'web.b4mad.net', href: 'https://web.b4mad.net/' },
];

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** Shows the URL without scheme and trailing slash, like a terminal path. */
export function displayUrl(href: string): string {
  const url = new URL(href);
  return (url.host + url.pathname).replace(/\/$/, '');
}

/** Static HTML for the link list. It is baked into index.html at build time, so links work without JS. */
export function renderLinks(links: readonly Link[] = LINKS): string {
  const items = links.map((link) => {
    const url = displayUrl(link.href);
    // Skip the URL hint when the label already is the URL.
    const hint = url === link.label ? '' : `<span class="url">${escapeHtml(url)}</span>`;
    return `<li><a href="${escapeHtml(link.href)}" rel="me"><span class="label">${escapeHtml(link.label)}</span>${hint}</a></li>`;
  });
  return `<ul class="links">\n${items.join('\n')}\n</ul>`;
}
