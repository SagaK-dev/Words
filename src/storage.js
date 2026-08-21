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
  const seenDeckIds = new Set();
  const seenCardIds = new Set();
  const decks = [];

  if (Array.isArray(value.decks)) {
    for (const candidate of value.decks) {
      const deck = normalizeDeck(candidate, seenDeckIds, seenCardIds);
      if (deck) decks.push(deck);
    }
  }

  const validCardIds = new Set(decks.flatMap(deck => deck.cards.map(card => card.id)));
  const progress = {};
  if (value.progress && typeof value.progress === 'object') {
    for (const [id, item] of Object.entries(value.progress)) {
      if (!validCardIds.has(id)) continue;
      const normalized = normalizeProgress(id, item);
      if (normalized) progress[id] = normalized;
    }
  }

  const settings = normalizeSettings(value.settings, base.settings);
  const sessions = Array.isArray(value.sessions)
    ? value.sessions.map(normalizeSession).filter(Boolean)
    : [];

  return {
    ...base,
    decks,
    progress,
    sessions,
    settings,
    sync: normalizeSync(value.sync),
  };
}

export function validateDeck(deck) {
  if (!deck || typeof deck !== 'object' || typeof deck.name !== 'string' || !Array.isArray(deck.cards)) return false;
  return deck.cards.every(card => card && typeof card === 'object' && typeof card.front === 'string' && typeof card.back === 'string');
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
  return writeData(data, storage, true);
}

export function replaceData(data, storage = globalThis.localStorage) {
  return writeData(data, storage, false);
}

function writeData(data, storage, mergeHistory) {
  const valid = validateData(data);
  if (!valid) throw new Error('Invalid application data.');

  if (storage) {
    if (mergeHistory) {
      try {
        const existingRaw = storage.getItem(STORAGE_KEY);
        const existing = existingRaw ? validateData(JSON.parse(existingRaw)) : null;
        if (existing?.sessions?.length) valid.sessions = mergeSessions(existing.sessions, valid.sessions);
      } catch {
        // A corrupt previous value should not prevent saving newly validated data.
      }
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(valid));
  }
  return valid;
}

function mergeSessions(existing, incoming) {
  const merged = new Map();
  for (const session of [...existing, ...incoming]) {
    const normalized = normalizeSession(session);
    if (!normalized) continue;
    const key = normalized.id
      ? `id:${normalized.id}`
      : `legacy:${normalized.startedAt}:${normalized.endedAt}:${normalized.deckId}:${normalized.mode}`;
    merged.set(key, normalized);
  }
  return [...merged.values()].sort((a, b) => a.startedAt - b.startedAt);
}

export function clearData(storage = globalThis.localStorage) {
  storage?.removeItem(STORAGE_KEY);
}

export function createDeck(name, cards = [], extra = {}) {
  return {
    id: newId(),
    name: String(name ?? '').trim() || 'Untitled deck',
    description: String(extra.description ?? ''),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      retryMode: ['inherit', 'off', 'same', 'multipleChoice'].includes(extra.settings?.retryMode) ? extra.settings.retryMode : 'inherit',
      rapidReveal: Boolean(extra.settings?.rapidReveal),
    },
    cards: cards.map(card => ({
      id: newId(),
      front: String(card?.front ?? '').trim(),
      back: String(card?.back ?? '').trim(),
      note: String(card?.note ?? '').trim(),
      tags: Array.isArray(card?.tags) ? card.tags.map(tag => String(tag)).filter(Boolean) : [],
    })).filter(card => card.front && card.back),
  };
}

function normalizeDeck(deck, seenDeckIds, seenCardIds) {
  if (!validateDeck(deck)) return null;
  let id = typeof deck.id === 'string' && deck.id.trim() ? deck.id : newId();
  if (seenDeckIds.has(id)) id = newId();
  seenDeckIds.add(id);

  const cards = [];
  for (const card of deck.cards) {
    let cardId = typeof card.id === 'string' && card.id.trim() ? card.id : newId();
    if (seenCardIds.has(cardId)) cardId = newId();
    seenCardIds.add(cardId);
    const front = String(card.front ?? '').trim();
    const back = String(card.back ?? '').trim();
    if (!front || !back) continue;
    cards.push({
      id: cardId,
      front,
      back,
      note: String(card.note ?? '').trim(),
      tags: Array.isArray(card.tags) ? card.tags.map(tag => String(tag)).filter(Boolean) : [],
    });
  }

  return {
    id,
    name: String(deck.name).trim() || 'Untitled deck',
    description: String(deck.description ?? ''),
    createdAt: finiteTimestamp(deck.createdAt, Date.now()),
    updatedAt: finiteTimestamp(deck.updatedAt, Date.now()),
    settings: {
      retryMode: ['inherit', 'off', 'same', 'multipleChoice'].includes(deck.settings?.retryMode) ? deck.settings.retryMode : 'inherit',
      rapidReveal: Boolean(deck.settings?.rapidReveal),
    },
    cards,
  };
}

function normalizeProgress(cardId, item) {
  if (!item || typeof item !== 'object') return null;
  const reviews = nonNegativeInteger(item.reviews);
  const lapses = Math.min(reviews, nonNegativeInteger(item.lapses));
  const correctStreak = Math.min(reviews, nonNegativeInteger(item.correctStreak));
  const lastRating = [0, 1, 2].includes(Number(item.lastRating)) ? Number(item.lastRating) : null;
  const stabilityDays = clamp(finiteNumber(item.stabilityDays, 0.08), 0.04, 36500);
  return {
    cardId,
    state: stabilityDays >= 14 && correctStreak >= 3 ? 'mastered' : reviews ? 'learning' : 'new',
    dueAt: finiteTimestamp(item.dueAt, 0),
    stabilityDays,
    difficulty: clamp(finiteNumber(item.difficulty, 0.5), 0, 1),
    reviews,
    lapses,
    correctStreak,
    lastReviewedAt: finiteTimestamp(item.lastReviewedAt, 0),
    lastRating,
    avgResponseMs: Math.max(0, finiteNumber(item.avgResponseMs, 0)),
  };
}

function normalizeSession(session) {
  if (!session || typeof session !== 'object') return null;
  const startedAt = finiteTimestamp(session.startedAt, 0);
  const endedAt = finiteTimestamp(session.endedAt, startedAt);
  return {
    id: typeof session.id === 'string' ? session.id : '',
    deckId: typeof session.deckId === 'string' ? session.deckId : '',
    mode: ['study', 'review', 'test'].includes(session.mode) ? session.mode : 'study',
    startedAt,
    endedAt: Math.max(startedAt, endedAt),
    reviewed: nonNegativeInteger(session.reviewed),
    good: nonNegativeInteger(session.good),
    again: nonNegativeInteger(session.again),
    avgResponseMs: Math.max(0, finiteNumber(session.avgResponseMs, 0)),
  };
}

function normalizeSettings(settings, defaults) {
  const candidate = settings && typeof settings === 'object' ? settings : {};
  const keys = candidate.keys && typeof candidate.keys === 'object' ? candidate.keys : {};
  const normalizedKeys = {
    again: oneChar(keys.again, defaults.keys.again),
    hard: oneChar(keys.hard, defaults.keys.hard),
    good: oneChar(keys.good, defaults.keys.good),
    reveal: ' ',
  };
  if (new Set([normalizedKeys.again, normalizedKeys.hard, normalizedKeys.good]).size !== 3) {
    normalizedKeys.again = defaults.keys.again;
    normalizedKeys.hard = defaults.keys.hard;
    normalizedKeys.good = defaults.keys.good;
  }

  const sessionCount = candidate.sessionCount === 'all'
    ? 'all'
    : Math.max(1, Math.floor(finiteNumber(candidate.sessionCount, 0))) || 'all';

  return {
    fontScale: clamp(finiteNumber(candidate.fontScale, defaults.fontScale), 0.8, 1.5),
    revealMs: clamp(finiteNumber(candidate.revealMs, defaults.revealMs), 20, 1000),
    retryMode: ['off', 'same', 'multipleChoice'].includes(candidate.retryMode) ? candidate.retryMode : defaults.retryMode,
    sessionCount,
    keys: normalizedKeys,
  };
}

function normalizeSync(sync) {
  if (!sync || typeof sync !== 'object') return { code: '', updatedAt: 0 };
  return {
    code: typeof sync.code === 'string' ? sync.code.slice(0, 80) : '',
    updatedAt: finiteTimestamp(sync.updatedAt, 0),
  };
}

function oneChar(value, fallback) {
  return typeof value === 'string' && [...value].length === 1 ? value : fallback;
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function finiteTimestamp(value, fallback) {
  const numeric = finiteNumber(value, fallback);
  return numeric >= 0 ? numeric : fallback;
}

function nonNegativeInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `words-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
