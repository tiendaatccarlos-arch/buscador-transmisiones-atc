// netlify/functions/lookup.js
// Esta función vive en el servidor. Los archivos data.json y products.json
// NUNCA se mandan al navegador del visitante — solo las respuestas puntuales
// a lo que se pregunta.

const DATA = require('./data.json');       // [marca, modelo, anios, motor, tipo, codigo]
const PRODUCTS = require('./products.json'); // { "CODIGO": [{slug,name}, ...] }
const PRODUCT_BASE_URL = 'https://transatc.com/productos/';

function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b, 'es'));
}

function expandYears(str) {
  const parts = str.split('-').map(p => parseInt(p, 10));
  const toFull = yy => (yy <= 30 ? 2000 + yy : 1900 + yy);
  const start = toFull(parts[0]);
  const end = parts.length > 1 ? toFull(parts[1]) : start;
  const out = [];
  for (let y = start; y <= end; y++) out.push(y);
  return out;
}

function getProductLinks(code) {
  const key = code.toUpperCase();
  for (const k in PRODUCTS) {
    if (k.toUpperCase() === key) {
      return PRODUCTS[k].map(p => ({ name: p.name, url: PRODUCT_BASE_URL + p.slug + '/' }));
    }
  }
  return null;
}

exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  const action = params.action;

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };

  try {
    if (action === 'brands') {
      const marcas = uniqueSorted(DATA.map(r => r[0]));
      return { statusCode: 200, headers, body: JSON.stringify({ marcas }) };
    }

    if (action === 'models') {
      const marca = params.marca || '';
      const modelos = uniqueSorted(
        DATA.filter(r => r[0] === marca).map(r => r[1])
      );
      return { statusCode: 200, headers, body: JSON.stringify({ modelos }) };
    }

    if (action === 'years') {
      const marca = params.marca || '';
      const modelo = params.modelo || '';
      const rows = DATA.filter(r => r[0] === marca && r[1] === modelo);
      const years = new Set();
      rows.forEach(r => expandYears(r[2]).forEach(y => years.add(y)));
      const sorted = Array.from(years).sort((a, b) => b - a);
      return { statusCode: 200, headers, body: JSON.stringify({ years: sorted }) };
    }

    if (action === 'vehicle') {
      const marca = params.marca || '';
      const modelo = params.modelo || '';
      const anio = parseInt(params.anio, 10);
      const rows = DATA.filter(r => {
        if (r[0] !== marca || r[1] !== modelo) return false;
        return expandYears(r[2]).indexOf(anio) !== -1;
      });
      const results = rows.map(r => {
        const codigo = r[5];
        const links = getProductLinks(codigo);
        return {
          codigo,
          motor: r[3] || null,
          tipo: r[4] || null,
          links: links,
        };
      });
      return { statusCode: 200, headers, body: JSON.stringify({ results }) };
    }

    if (action === 'code') {
      const q = (params.q || '').trim().toUpperCase();
      if (!q) return { statusCode: 200, headers, body: JSON.stringify({ results: [] }) };

      const exact = DATA.filter(r => r[5].toUpperCase() === q);
      const rows = exact.length ? exact : DATA.filter(r => r[5].toUpperCase().indexOf(q) !== -1);

      const byCode = {};
      rows.forEach(r => {
        const c = r[5];
        if (!byCode[c]) byCode[c] = { rows: [], motor: r[3], tipo: r[4] };
        byCode[c].rows.push(r);
      });

      const results = Object.keys(byCode).map(c => {
        const group = byCode[c];
        const apps = uniqueSorted(group.rows.map(r => r[0] + ' ' + r[1] + " '" + r[2]));
        const links = getProductLinks(c);
        return {
          codigo: c,
          motor: group.motor || null,
          tipo: group.tipo || null,
          apps,
          links,
        };
      });

      return { statusCode: 200, headers, body: JSON.stringify({ results }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'acción inválida' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'error interno' }) };
  }
};
