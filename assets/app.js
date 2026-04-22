async function fetchText(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return res.text();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some(value => value.trim() !== '')) rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows.map(cols => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header.trim()] = (cols[i] || '').trim();
    });
    return obj;
  });
}

async function fetchCsv(path) {
  return parseCsv(await fetchText(path));
}

function numberOrZero(value) {
  const n = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function getParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function slugToTitle(slug) {
  return String(slug || '').replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
}

function groupBy(items, getKey) {
  const map = new Map();

  items.forEach((item) => {
    const key = getKey(item);
    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(item);
  });

  return Array.from(map, ([category, groupItems]) => ({
    category,
    items: groupItems
  }));
}
