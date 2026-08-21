export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;

export function defaultProgress(cardId) {
  return {
    cardId,
    state: 'new',
    dueAt: 0,
    stabilityDays: 0.08,
    difficulty: 0.5,
    reviews: 0,
    lapses: 0,
    correctStreak: 0,
    lastReviewedAt: 0,
    lastRating: null,
    avgResponseMs: 0,
  };
}

export function effectiveState(progress, now = Date.now()) {
  if (!progress || progress.reviews === 0) return 'new';
  if (progress.dueAt <= now) return progress.stabilityDays >= 14 && progress.correctStreak >= 3 ? 'mastered-due' : 'due';
  return progress.stabilityDays >= 14 && progress.correctStreak >= 3 ? 'mastered' : 'learning';
}

export function scheduleReview(progressInput, rating, responseMs, now = Date.now()) {
  const progress = { ...defaultProgress(progressInput?.cardId || ''), ...progressInput };
  const clampedRating = Math.max(0, Math.min(2, Number(rating)));
  const speedFactor = responseMs <= 2500 ? 1.12 : responseMs >= 10_000 ? 0.88 : 1;
  const oldStability = Math.max(0.04, Number(progress.stabilityDays) || 0.08);
  let stability = oldStability;
  let dueAt;
  let difficulty = Number.isFinite(progress.difficulty) ? progress.difficulty : 0.5;
  let streak = progress.correctStreak || 0;
  let lapses = progress.lapses || 0;

  if (clampedRating === 0) {
    stability = Math.max(0.04, oldStability * 0.42);
    difficulty = Math.min(1, difficulty + 0.12);
    streak = 0;
    lapses += 1;
    dueAt = now + Math.min(12 * 60, Math.max(4, Math.round(stability * 24 * 60 * 0.12))) * MINUTE_MS;
  } else if (clampedRating === 1) {
    stability = Math.max(0.12, oldStability * (1.22 - difficulty * 0.12) * speedFactor);
    difficulty = Math.min(1, Math.max(0, difficulty + 0.03));
    streak += 1;
    dueAt = now + Math.max(20 * MINUTE_MS, stability * DAY_MS * 0.55);
  } else {
    const growth = 1.75 + streak * 0.16 - difficulty * 0.28;
    stability = Math.max(0.35, oldStability * growth * speedFactor + 0.25);
    difficulty = Math.max(0, difficulty - 0.055);
    streak += 1;
    dueAt = now + stability * DAY_MS;
  }

  const reviews = (progress.reviews || 0) + 1;
  const previousAvg = progress.avgResponseMs || 0;
  const avgResponseMs = previousAvg ? Math.round(previousAvg * 0.72 + responseMs * 0.28) : Math.round(responseMs);

  return {
    ...progress,
    state: stability >= 14 && streak >= 3 ? 'mastered' : 'learning',
    dueAt: Math.round(dueAt),
    stabilityDays: Number(stability.toFixed(3)),
    difficulty: Number(difficulty.toFixed(3)),
    reviews,
    lapses,
    correctStreak: streak,
    lastReviewedAt: now,
    lastRating: clampedRating,
    avgResponseMs,
  };
}

export function buildQueue(cards, progressById, { mode = 'study', count = 'all', now = Date.now(), newRatio = 0.35 } = {}) {
  const due = [];
  const fresh = [];
  const future = [];
  for (const card of cards) {
    const progress = progressById[card.id] || defaultProgress(card.id);
    const state = effectiveState(progress, now);
    if (state === 'new') fresh.push({ card, progress, score: Number.MAX_SAFE_INTEGER - fresh.length });
    else if (state === 'due' || state === 'mastered-due') {
      const overdue = Math.max(0, now - progress.dueAt) / DAY_MS;
      const fragility = 1 / Math.max(0.1, progress.stabilityDays);
      due.push({ card, progress, score: overdue * 10 + fragility + progress.lapses * 0.15 });
    } else future.push({ card, progress, score: -progress.dueAt });
  }
  due.sort((a, b) => b.score - a.score);
  fresh.sort(() => Math.random() - 0.5);
  future.sort((a, b) => b.score - a.score);

  let items;
  if (mode === 'review') {
    items = due;
  } else if (mode === 'test') {
    items = [...cards].sort(() => Math.random() - 0.5).map(card => ({ card, progress: progressById[card.id] || defaultProgress(card.id) }));
  } else {
    const mixed = [];
    let di = 0, ni = 0;
    while (di < due.length || ni < fresh.length) {
      const chooseNew = ni < fresh.length && (di >= due.length || Math.random() < newRatio);
      mixed.push(chooseNew ? fresh[ni++] : due[di++]);
    }
    items = mixed.length ? mixed : future;
  }

  const limit = count === 'all' ? items.length : Math.max(1, Number(count) || items.length);
  return items.slice(0, limit).map(item => item.card);
}

export function deckStats(cards, progressById, now = Date.now()) {
  const stats = { total: cards.length, new: 0, learning: 0, due: 0, mastered: 0 };
  for (const card of cards) {
    const state = effectiveState(progressById[card.id] || defaultProgress(card.id), now);
    if (state === 'new') stats.new += 1;
    else if (state === 'due' || state === 'mastered-due') stats.due += 1;
    else if (state === 'mastered') stats.mastered += 1;
    else stats.learning += 1;
  }
  return stats;
}
