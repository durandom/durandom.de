import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINKS, displayUrl, escapeHtml, renderLinks } from '../src/links.ts';

test('link list has exactly the four agreed URLs', () => {
  assert.deepEqual(
    LINKS.map((l) => l.href),
    [
      'https://github.com/durandom/',
      'https://www.linkedin.com/in/marcelhild/',
      'https://b4mad.technology/',
      'https://web.b4mad.net/',
    ],
  );
});

test('every link is https and has a label', () => {
  for (const link of LINKS) {
    assert.equal(new URL(link.href).protocol, 'https:');
    assert.ok(link.label.trim().length > 0);
  }
});

test('displayUrl drops scheme and trailing slash', () => {
  assert.equal(displayUrl('https://github.com/durandom/'), 'github.com/durandom');
  assert.equal(displayUrl('https://web.b4mad.net/'), 'web.b4mad.net');
});

test('renderLinks emits one anchor per link', () => {
  const html = renderLinks();
  assert.equal(html.match(/<a /g)?.length, LINKS.length);
  for (const link of LINKS) assert.ok(html.includes(`href="${link.href}"`));
});

test('renderLinks skips the URL hint when the label is the URL', () => {
  const html = renderLinks([{ label: 'web.b4mad.net', href: 'https://web.b4mad.net/' }]);
  assert.ok(!html.includes('class="url"'));
  assert.ok(renderLinks([{ label: 'GitHub', href: 'https://github.com/durandom/' }]).includes('class="url"'));
});

test('renderLinks escapes labels and URLs', () => {
  const html = renderLinks([{ label: '<b>&"x"', href: 'https://example.com/?a=1&b="2"' }]);
  assert.ok(html.includes('&lt;b&gt;&amp;&quot;x&quot;'));
  assert.ok(!html.includes('<b>'));
  assert.equal(escapeHtml(`'`), '&#39;');
});
