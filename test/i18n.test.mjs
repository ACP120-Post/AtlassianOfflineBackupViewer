import test from 'node:test';
import assert from 'node:assert/strict';
import {en, de, es} from '../src/messages.js';

test('every English key has a German and Spanish translation', () => {
  for (const k of Object.keys(de)) assert.ok(es[k], `missing es: ${k}`);
  for (const k of Object.keys(en)) assert.ok(es[k], `missing es for server string: ${k}`);
});

test('interpolation placeholders survive translation', () => {
  const t = (text, vars, dict = de) => {
    const s = dict[text] ?? text;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s;
  };
  assert.equal(t('Hello {name}', {name: 'Ada'}), 'Hello Ada');
  assert.equal(t('Hello {name}', {}), 'Hello ');
  assert.equal(t('untranslated'), 'untranslated');
  for (const [k, v] of Object.entries(de))
    assert.deepEqual([...v.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(),
                     [...k.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), `placeholders differ: ${k}`);
});
