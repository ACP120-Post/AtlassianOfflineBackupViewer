import React from 'react';
import {de,en,es} from './messages.js';

// ponytail: English source strings are the keys — no key catalogue to keep in sync,
// and a missing translation falls back to readable English instead of "app.foo.bar".
// The en dict only holds the German strings the server still emits.
const dicts = {de,en,es};
export const languages = {de:'Deutsch', en:'English', es:'Español'};
const locales = {de:'de-DE', en:'en-GB', es:'es-ES'};

const detect = () => {
  const stored = localStorage.getItem('lang');
  if (dicts[stored]) return stored;
  for (const l of navigator.languages || [navigator.language || '']) if (dicts[l.slice(0,2)]) return l.slice(0,2);
  return 'de';
};
export const lang = detect();
export const locale = () => locales[lang];
document.documentElement.lang = lang;

export function t(text, vars) {
  const s = dicts[lang][text] ?? text;
  return vars ? s.replace(/\{(\w+)\}/g, (_,k) => vars[k] ?? '') : s;
}

// ponytail: switching language reloads instead of threading a context through every
// component — same trick the identity switcher already uses, and t() stays a plain function.
export function LangSwitcher() {
  return <select className="lang-switcher" aria-label={t('Language')} value={lang}
    onChange={e=>{localStorage.setItem('lang',e.target.value);window.location.reload();}}>
    {Object.entries(languages).map(([code,name])=><option key={code} value={code}>{name}</option>)}
  </select>;
}
