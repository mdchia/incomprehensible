// The papers: the logbook and the Standard, typed out.
//
// Both are kept as Markdown in the repository so that they can be read
// and written without a browser. This turns them into pages. It knows
// only as much Markdown as the papers use: headings, paragraphs, lists,
// tables, fenced code, quotations, rules, and bold, italic, code and
// links within a line. Anything else comes out as it was typed.

const el = (tag, props, ...kids) => {
  const node = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null) node.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined) node.append(kid);
  return node;
};

// Papers that have a page of their own.
const PAGES = { 'LOGBOOK.md': 'logbook.html', 'STANDARD.md': 'standard.html' };

function href(url) {
  if (PAGES[url]) return PAGES[url];
  if (/^(https?:\/\/|mailto:|#)/i.test(url)) return url;
  if (/^[\w./?=&%#:-]+$/.test(url) && !/^[a-z][a-z0-9+.-]*:/i.test(url)) return url; // a path within the site
  return null;
}

// ---- within a line -------------------------------------------------------

const INLINE = /(`[^`]+`)|(\*\*[^*]+(?:\*[^*]+)*\*\*)|(\*[^*\s](?:[^*]*[^*\s])?\*)|(\[[^\]]+\]\([^)\s]+\))/g;

export function inline(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const s = m[0];
    if (m[1]) out.push(el('code', null, s.slice(1, -1)));
    else if (m[2]) out.push(el('strong', null, inline(s.slice(2, -2))));
    else if (m[3]) out.push(el('em', null, inline(s.slice(1, -1))));
    else {
      const cut = s.indexOf('](');
      const to = href(s.slice(cut + 2, -1));
      const label = inline(s.slice(1, cut));
      out.push(to ? el('a', { href: to }, label) : label);
    }
    last = m.index + s.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ---- blocks --------------------------------------------------------------

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const isRule = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
const bullet = (line) => /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);

export function blocks(lines) {
  const out = [];
  let i = 0;
  const blank = (s) => s.trim() === '';

  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) {
      i++;
      continue;
    }

    // Fenced code.
    const fence = /^\s*```/.exec(line);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      const indent = Math.min(...body.filter((b) => b.trim()).map((b) => b.length - b.trimStart().length), 99);
      out.push(el('pre', null, el('code', null, body.map((b) => b.slice(Math.min(indent, b.length))).join('\n'))));
      continue;
    }

    // Heading.
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      out.push(el(`h${h[1].length}`, { id: slug(h[2]) }, inline(h[2])));
      i++;
      continue;
    }

    // Rule.
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push(el('hr'));
      i++;
      continue;
    }

    // Table.
    if (line.trim().startsWith('|') && i + 1 < lines.length && isRule(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      out.push(
        el(
          'div',
          { class: 'scroll' },
          el(
            'table',
            null,
            el('thead', null, el('tr', null, head.map((c) => el('th', { scope: 'col' }, inline(c))))),
            el('tbody', null, rows.map((r) => el('tr', null, head.map((_, k) => el('td', null, inline(r[k] ?? '')))))),
          ),
        ),
      );
      continue;
    }

    // Quotation.
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(el('blockquote', null, blocks(body)));
      continue;
    }

    // List. An item owns the lines after it that are indented under its text.
    const first = bullet(line);
    if (first) {
      const ordered = /\d/.test(first[2]);
      const base = first[1].length;
      const items = [];
      while (i < lines.length) {
        const b = bullet(lines[i]);
        if (!b || b[1].length !== base || /\d/.test(b[2]) !== ordered) break;
        const under = b[1].length + b[2].length + 1;
        const body = [b[3]];
        i++;
        while (i < lines.length) {
          const next = lines[i];
          if (blank(next)) {
            // A blank line stays in the item only if what follows is still under it.
            let j = i;
            while (j < lines.length && blank(lines[j])) j++;
            if (j < lines.length && lines[j].length - lines[j].trimStart().length >= under) {
              body.push('');
              i++;
              continue;
            }
            break;
          }
          if (next.length - next.trimStart().length < under) break;
          body.push(next.slice(under));
          i++;
        }
        const made = blocks(body);
        // An item that is one paragraph is just its text.
        items.push(el('li', null, made.length === 1 && made[0].tagName === 'P' ? [...made[0].childNodes] : made));
      }
      out.push(el(ordered ? 'ol' : 'ul', null, items));
      continue;
    }

    // Paragraph: everything up to a blank line or the start of something else.
    const para = [line.trim()];
    i++;
    while (i < lines.length && !blank(lines[i]) && !/^(#{1,4}\s|\s*```|\s*>|\s*\|)/.test(lines[i]) && !bullet(lines[i])) para.push(lines[i++].trim());
    out.push(el('p', null, inline(para.join(' '))));
  }
  return out;
}

export const render = (markdown) => blocks(markdown.replace(/\r\n?/g, '\n').split('\n'));

// ---- the logbook ---------------------------------------------------------

// A report in the logbook gives a time and a frequency, and the band can
// be put back to any moment. So each report's time becomes a link that
// opens the receiver then and there.
function replay(sheet) {
  let date = null;
  for (const node of sheet.children) {
    if (node.tagName === 'H2') date = null;
    if (node.tagName === 'UL') {
      for (const li of node.children) {
        const m = /^Date:\s*(\d{4}-\d{2}-\d{2})\b/.exec(li.textContent);
        if (m) date = m[1];
      }
    }
    const table = node.querySelector?.('table');
    if (!table || !date) continue;
    const head = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim().toLowerCase());
    const when = head.indexOf('utc');
    const where = head.indexOf('khz');
    if (when < 0 || where < 0) continue;
    for (const row of table.querySelectorAll('tbody tr')) {
      const t = row.children[when];
      const f = row.children[where];
      const hhmm = /^(\d{2})(\d{2})$/.exec(t?.textContent.trim() ?? '');
      const kHz = Number(f?.textContent.trim());
      if (!hhmm || !(kHz >= 6000 && kHz <= 6500)) continue;
      const link = el('a', { href: `./?at=${date}T${hhmm[1]}:${hhmm[2]}:00Z#${kHz.toFixed(2)}`, title: 'Listen to it again' }, t.textContent.trim());
      t.replaceChildren(link);
    }
  }
}

// ---- the page ------------------------------------------------------------

async function fill(sheet) {
  const source = sheet.dataset.source;
  try {
    const res = await fetch(source, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    sheet.replaceChildren(...render(await res.text()));
    if (sheet.dataset.kind === 'logbook') replay(sheet);
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  } catch {
    sheet.replaceChildren(
      el('p', null, 'This paper could not be fetched. It is kept in the repository as ', el('a', { href: source }, source), ', and reads well enough as it is.'),
    );
  }
}

if (typeof document !== 'undefined') {
  for (const sheet of document.querySelectorAll('[data-source]')) fill(sheet);
}
