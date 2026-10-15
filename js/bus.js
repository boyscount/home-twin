// event bus เล็ก ๆ ให้แต่ละแท็บคุยกันโดยไม่ผูกกันตรง ๆ
const handlers = {};
export const bus = {
  on(evt, fn) { (handlers[evt] ||= []).push(fn); },
  emit(evt, data) { (handlers[evt] || []).forEach(fn => fn(data)); },
};

let toastTimer;
export function toast(msg, ms = 3200) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

export const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
};

export const nowStr = () => new Date().toLocaleTimeString('th-TH', { hour12: false });
