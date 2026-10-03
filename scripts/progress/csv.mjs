/**
 * Leitor de CSV (RFC 4180) sem dependências.
 *
 * A folha do CNE exporta campos com quebras de linha dentro do valor
 * (`• Saúde\n• Atividade física`), o que exige um leitor que respeite as
 * aspas em vez de partir a linha.
 */

/**
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let started = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      started = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      started = true;
      continue;
    }
    if (char === '\r') continue;
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      started = false;
      continue;
    }
    field += char;
    started = true;
  }

  if (started || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Normaliza quebras de linha e espaços, para comparações e chaves estáveis. */
export function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

/** Divide um descritor multi-linha (`• a\n• b`) numa lista de itens. */
export function splitBullets(value) {
  return normalizeText(value)
    .split('\n')
    .map((line) => line.replace(/^[•·▪◦-]\s*/, '').trim())
    .filter(Boolean);
}