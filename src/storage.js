export const STORAGE_KEY = 'words.app.v1';

export function initialData() {
  return {
    version: 1,
    decks: [],
    progress: {},
    sessions: [],
    settings: {
      fontScale: 1,
      revealMs: 90,
      retryMode: 'multipleChoice',
      sessionCount: 'all',
      keys: { again: '1', hard: '2', good: '3', reveal: ' ' },
    },
    sync: { code: '', updatedAt: 0 },
  };
}

export function validateData(value) {
  if (!value || typeof value !== 'object') return null;
  const base = initialData();
  const decks = Array.isArray(value.decks) ? value.decks.filter(validateDeck) : [];
  const validCardIds = new Set(decks.flatMap(deck => deck.cards.map(card => card.id)));
  const progress = {};
  if (value.progress && typeof value.progress === 'object') {
    for (const [id, item] of Object.entries(value.progress)) {
      if (validCardIds.has(id) && item && typeof item === 'object') progress[id] = item;
    }
  }
  const settings = { ...base.settings, ...(value.settings && typeof value.settings === 'object' ? value.settings : {}) };
  settings.fontScale = Math.min(1.5, Math.max(0.8, Number(settings.fontScale) || 1));
  settings.revealMs = Math.min(1000, Math.max(20, Number(settings.revealMs) || 90));
  if (!['off','same','multipleChoice'].includes(settings.retryMode)) settings.retryMode = 'multipleChoice';
  settings.keys = { ...base.settings.keys, ...(settings.keys || {}) };
  return {
    ...base,
    decks,
    progress,
    sessions: Array.isArray(value.sessions) ? value.sessions : [],
    settings,
    sync: value.sync && typeof value.sync === 'object' ? { ...base.sync, ...value.sync } : base.sync,
  };
}

export function validateDeck(deck) {
  return Boolean(deck && typeof deck === 'object' && typeof deck.id === 'string' && typeof deck.name === 'string' && Array.isArray(deck.cards) && deck.cards.every(validateCard));
}

function validateCard(card) {
  return Boolean(card && typeof card === 'object' && typeof card.id === 'string' && typeof card.front === 'string' && typeof card.back === 'string');
}

export function loadData(storage = globalThis.localStorage) {
  if (!storage) return initialData();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? validateData(JSON.parse(raw)) || initialData() : initialData();
  } catch {
    return initialData();
  }
}

export function saveData(data, storage = globalThis.localStorage) {
  const valid = validateData(data);
  if (!valid) throw new Error('Invalid application data.');

  // Never discard historical study sessions during a save. This also protects
  // users migrating from older builds that kept only a recent session window.
  if (storage) {
    try {
      const existingRaw = storage.getItem(STORAGE_KEY);
      const existing = existingRaw ? validateData(JSON.parse(existingRaw)) : null;
      if (existing?.sessions?.length) valid.sessions = mergeSessions(existing.sessions, valid.sessions);
    } catch {
      // A corrupt previous value should not prevent saving the newly validated data.
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(valid));
  }
  return valid;
}

function mergeSessions(existing, incoming) {
  const merged = new Map();
  for (const session of [...existing, ...incoming]) {
    if (!session || typeof session !== 'object') continue;
    const key = typeof session.id === 'string' && session.id
      ? `id:${session.id}`
      : `legacy:${session.startedAt ?? ''}:${session.endedAt ?? ''}:${session.deckId ?? ''}:${session.mode ?? ''}`;
    merged.set(key, session);
  }
  return [...merged.values()].sort((a, b) => (Number(a.startedAt) || 0) - (Number(b.startedAt) || 0));
}

export function clearData(storage = globalThis.localStorage) {
  storage?.removeItem(STORAGE_KEY);
}

export function createDeck(name, cards = [], extra = {}) {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || 'Untitled deck',
    description: extra.description || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: { retryMode: 'inherit', rapidReveal: false, ...extra.settings },
    cards: cards.map(card => ({
      id: card.id || crypto.randomUUID(),
      front: String(card.front ?? '').trim(),
      back: String(card.back ?? '').trim(),
      note: String(card.note ?? '').trim(),
      tags: Array.isArray(card.tags) ? card.tags : [],
    })).filter(card => card.front && card.back),
  };
}
