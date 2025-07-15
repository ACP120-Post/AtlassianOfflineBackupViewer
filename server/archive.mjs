import yauzl from 'yauzl';
import { parse } from 'csv-parse';
import { compose } from 'node:stream';
import { createGunzip, zstdDecompressSync } from 'node:zlib';

export function validEntry(name) {
  return typeof name === 'string' && name.length > 0 && !/^[\/]|[\\:\x00-\x1f\x7f]/.test(name)
    && !name.split('/').some(part => part === '..' || part === '.');
}

export async function openArchive(filename) {
  const zip = await new Promise((resolve, reject) => yauzl.open(filename,
    { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (error, value) => error ? reject(error) : resolve(value)));
  const entries = new Map();
  try {
    await new Promise((resolve, reject) => {
      zip.on('error', reject);
      zip.on('entry', entry => {
        if (!validEntry(entry.fileName) || entries.has(entry.fileName)) {
          reject(new Error(`Ungültiger oder doppelter Archiveintrag: ${entry.fileName}`));
          return;
        }
        entries.set(entry.fileName, entry);
        zip.readEntry();
      });
      zip.once('end', resolve);
      zip.readEntry();
    });
  } catch (error) { zip.close(); throw error; }
  return {
    entries,
    close: () => zip.close(),
    stream(name) {
      if (!validEntry(name) || !entries.has(name) || name.endsWith('/')) throw new Error('Archiveintrag nicht vorhanden');
      return new Promise((resolve, reject) => zip.openReadStream(entries.get(name),
        (error, stream) => error ? reject(error) : resolve(stream)));
    },
  };
}

export function csvParser(documentExport = false) {
  return parse({ columns: headers => headers.map(h => h.toLowerCase()), bom: true, skip_empty_lines: true, max_record_size: 64 * 1024 * 1024,
    relax_column_count: documentExport,
    on_record: (row, context) => {
      // The document export ends with the two-column marker 000000,1.
      if (documentExport && row.contentid === '000000' && row.documentid === '1' && Object.keys(row).length === 2) return null;
      if (context.error) throw context.error;
      return row;
    },
  });
}

export async function* archiveRows(archive, name) {
  if (!archive.entries.has(name)) return;
  const source = await archive.stream(name);
  const parser = csvParser(name.startsWith('whiteboards/data/'));
  const stream = name.endsWith('.gz') ? compose(source, createGunzip(), parser) : compose(source, parser);
  yield* stream;
}

export function decodeBody(value) {
  if (!value) return '';
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) throw new Error('Ungültiger Base64-Seiteninhalt');
  const bytes = Buffer.from(value, 'base64');
  return zstdDecompressSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }).toString('utf8');
}
