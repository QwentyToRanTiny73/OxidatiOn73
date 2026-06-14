// CRUD для образцов, анализов, добавок SO₂ на localStorage.
// Совместимый контракт с будущей версией на Supabase.

const DATA_KEYS = {
  samples:  'oxidation73:samples',
  analyses: 'oxidation73:analyses',
  doses:    'oxidation73:so2_doses',
};

function _read(key)        { try { return JSON.parse(localStorage.getItem(key)) ?? []; } catch { return []; } }
function _write(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
function _newId()          { return crypto.randomUUID?.() ?? ('id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)); }
function _currentWineryId(){ const s = JSON.parse(localStorage.getItem('oxidation73:session') || 'null'); return s ? s.wineryId : null; }

// --- Образцы -----------------------------------------------------------

async function listSamples(filters = {}) {
  const w = _currentWineryId();
  let list = _read(DATA_KEYS.samples).filter(s => s.winery_id === w);

  if (filters.wineType) list = list.filter(s => s.wine_type === filters.wineType);
  if (filters.vintage)  list = list.filter(s => String(s.vintage) === String(filters.vintage));
  if (filters.stage)    list = list.filter(s => s.stage === filters.stage);

  const analyses = _read(DATA_KEYS.analyses);
  return list.map(s => {
    const sampleA = analyses.filter(a => a.sample_id === s.id);
    const last    = sampleA.sort((a, b) => new Date(b.analyzed_at) - new Date(a.analyzed_at))[0];
    return { ...s, last_analyzed_at: last ? last.analyzed_at : null, analyses_count: sampleA.length };
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function getSample(id) {
  return _read(DATA_KEYS.samples).find(s => s.id === id && s.winery_id === _currentWineryId()) || null;
}

async function createSample(payload) {
  const w = _currentWineryId();
  if (!w) throw new Error('Нет сессии');
  if (!payload.sample_code) throw new Error('Код образца обязателен');

  const samples = _read(DATA_KEYS.samples);
  if (samples.some(s => s.winery_id === w && s.sample_code === payload.sample_code))
    throw new Error('Образец с таким кодом уже существует');

  const sample = {
    id: _newId(),
    winery_id: w,
    created_at: new Date().toISOString(),
    sample_code:   payload.sample_code,
    variety:       payload.variety ?? null,
    vintage:       payload.vintage ? Number(payload.vintage) : null,
    wine_type:     payload.wine_type ?? null,
    vessel:        payload.vessel ?? null,
    volume_liters: payload.volume_liters ? Number(payload.volume_liters) : null,
    stage:         payload.stage ?? null,
    notes:         payload.notes ?? null,
  };
  samples.push(sample);
  _write(DATA_KEYS.samples, samples);
  return sample;
}

async function updateSample(id, patch) {
  const samples = _read(DATA_KEYS.samples);
  const i = samples.findIndex(s => s.id === id && s.winery_id === _currentWineryId());
  if (i === -1) throw new Error('Образец не найден');
  samples[i] = { ...samples[i], ...patch };
  _write(DATA_KEYS.samples, samples);
  return samples[i];
}

// --- Анализы -----------------------------------------------------------

async function listAnalyses(sampleId) {
  return _read(DATA_KEYS.analyses)
    .filter(a => a.sample_id === sampleId)
    .sort((a, b) => new Date(a.analyzed_at) - new Date(b.analyzed_at));
}

async function createAnalysis(payload) {
  if (!payload.sample_id) throw new Error('Не выбран образец');
  if (payload.ph == null || payload.free_so2 == null)
    throw new Error('pH и свободный SO₂ — обязательные поля');

  const analysis = {
    id: _newId(),
    sample_id:          payload.sample_id,
    analyzed_at:        payload.analyzed_at || new Date().toISOString(),
    ph:                 _num(payload.ph),
    titratable_acidity: _num(payload.titratable_acidity),
    volatile_acidity:   _num(payload.volatile_acidity),
    alcohol:            _num(payload.alcohol),
    residual_sugar:     _num(payload.residual_sugar),
    free_so2:           _num(payload.free_so2),
    total_so2:          _num(payload.total_so2),
    temperature:        _num(payload.temperature),
    density:            _num(payload.density),
    malic_acid:         _num(payload.malic_acid),
    lactic_acid:        _num(payload.lactic_acid),
    analyst_name:       payload.analyst_name ?? null,
    notes:              payload.notes ?? null,
    created_at:         new Date().toISOString(),
  };
  // Молекулярный SO₂ считается клиентом (в Supabase будет генерируемая колонка).
  if (analysis.free_so2 != null && analysis.ph != null) {
    analysis.molecular_so2 = analysis.free_so2 / (1 + Math.pow(10, analysis.ph - 1.81));
  }
  const list = _read(DATA_KEYS.analyses);
  list.push(analysis);
  _write(DATA_KEYS.analyses, list);
  return analysis;
}

async function listRecentAnalyses(limit = 10) {
  const w = _currentWineryId();
  const samples = _read(DATA_KEYS.samples).filter(s => s.winery_id === w);
  const ids = new Set(samples.map(s => s.id));
  return _read(DATA_KEYS.analyses)
    .filter(a => ids.has(a.sample_id))
    .sort((a, b) => new Date(b.analyzed_at) - new Date(a.analyzed_at))
    .slice(0, limit)
    .map(a => ({ ...a, sample: samples.find(s => s.id === a.sample_id) }));
}

// --- Алерты ------------------------------------------------------------

// Защитный минимум молекулярного SO₂ по типам вин (мг/л).
// Дублирует so2-logic.js, чтобы алерты считались даже без window.SO2.
const OXIDATION_FLOORS = {
  white: 0.5, 'white-sweet': 0.8, red: 0.3,
  rose: 0.5, sparkling: 0.4, orange: 0.3, 'pet-nat': 0.3,
};

async function getAlerts() {
  const w = _currentWineryId();
  const samples = _read(DATA_KEYS.samples).filter(s => s.winery_id === w);
  const allAnalyses = _read(DATA_KEYS.analyses);
  const alerts = [];

  for (const sample of samples) {
    const latest = allAnalyses
      .filter(a => a.sample_id === sample.id)
      .sort((a, b) => new Date(b.analyzed_at) - new Date(a.analyzed_at))[0];
    if (!latest) continue;

    // Риск окисления: молекулярный SO₂ ниже защитного минимума для типа вина.
    if (latest.molecular_so2 != null) {
      const floor = OXIDATION_FLOORS[sample.wine_type] ?? 0.5;
      if (latest.molecular_so2 < floor) {
        alerts.push({
          type: 'oxidation', severity: 'red', sample,
          message: `Молекулярный SO₂ ${latest.molecular_so2.toFixed(2)} мг/л — риск окисления (защитный минимум ${floor.toFixed(1)}).`,
        });
      }
    }
    // Летучая кислотность
    if (latest.volatile_acidity != null) {
      if (latest.volatile_acidity > 0.7) {
        alerts.push({
          type: 'va', severity: 'red', sample,
          message: `Летучая кислотность ${latest.volatile_acidity.toFixed(2)} г/л — повышенный риск порчи.`,
        });
      } else if (latest.volatile_acidity > 0.6) {
        alerts.push({
          type: 'va', severity: 'yellow', sample,
          message: `Летучая кислотность ${latest.volatile_acidity.toFixed(2)} г/л — близко к порогу.`,
        });
      }
    }
  }
  return alerts;
}

// --- Добавки SO₂ -------------------------------------------------------

async function listSO2Doses(sampleId) {
  return _read(DATA_KEYS.doses)
    .filter(d => d.sample_id === sampleId)
    .sort((a, b) => new Date(b.added_at) - new Date(a.added_at));
}

async function addSO2Dose(payload) {
  if (!payload.sample_id) throw new Error('Не выбран образец');
  const dose = {
    id: _newId(),
    sample_id:      payload.sample_id,
    added_at:       payload.added_at || new Date().toISOString(),
    so2_added_mg_l: _num(payload.so2_added_mg_l),
    kmbs_dose_g:    _num(payload.kmbs_dose_g),
    reason:         payload.reason ?? null,
    notes:          payload.notes ?? null,
    created_at:     new Date().toISOString(),
  };
  const list = _read(DATA_KEYS.doses);
  list.push(dose);
  _write(DATA_KEYS.doses, list);
  return dose;
}

// --- Утилиты -----------------------------------------------------------

function _num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// --- Сид демо-данных ---------------------------------------------------

async function seedDemoData(wineryId) {
  const now = Date.now();
  const day = 86_400_000;

  const s1 = {
    id: _newId(), winery_id: wineryId, sample_code: '2024-CS-01',
    variety: 'Каберне Совиньон', vintage: 2024, wine_type: 'red',
    vessel: 'Дубовая бочка №3', volume_liters: 225, stage: 'aging',
    notes: 'Малолактика завершена. SO₂ поддерживается на выдержке.',
    created_at: new Date(now - 90*day).toISOString(),
  };
  const s2 = {
    id: _newId(), winery_id: wineryId, sample_code: '2025-RR-04',
    variety: 'Рислинг', vintage: 2025, wine_type: 'white',
    vessel: 'Бак №7 (нерж.)', volume_liters: 800, stage: 'post-fermentation',
    notes: 'Без МЛБ, кислотность сохранена. SO₂ просел — требует подкормки.',
    created_at: new Date(now - 30*day).toISOString(),
  };
  const s3 = {
    id: _newId(), winery_id: wineryId, sample_code: '2024-OR-02',
    variety: 'Ркацители', vintage: 2024, wine_type: 'orange',
    vessel: 'Квеври №1', volume_liters: 350, stage: 'aging',
    notes: 'Мацерация 4 месяца на мезге. Рост летучей кислотности.',
    created_at: new Date(now - 60*day).toISOString(),
  };
  // Append, не перезаписываем — у пользователя могут быть свои данные.
  _write(DATA_KEYS.samples, [..._read(DATA_KEYS.samples), s1, s2, s3]);

  const mol = (free, ph) => free / (1 + Math.pow(10, ph - 1.81));
  // o = необязательные поля { rs, malic, lactic }
  const mk = (sample_id, daysAgo, ph, free, va, alcohol, ta, o = {}) => ({
    id: _newId(), sample_id,
    analyzed_at: new Date(now - daysAgo*day).toISOString(),
    ph, free_so2: free, total_so2: Math.round(free * 2.3), volatile_acidity: va,
    alcohol, residual_sugar: o.rs ?? 1.8, titratable_acidity: ta,
    malic_acid: o.malic ?? null, lactic_acid: o.lactic ?? null,
    temperature: 14, molecular_so2: mol(free, ph),
    analyst_name: 'Демо-аналитик', created_at: new Date(now - daysAgo*day).toISOString(),
  });

  _write(DATA_KEYS.analyses, [..._read(DATA_KEYS.analyses),
    // Каберне (красное) — ЗДОРОВОЕ: молек. SO₂ держится у 0.55–0.65, МЛБ завершена.
    mk(s1.id, 80, 3.62, 45, 0.42, 13.8, 5.6, { malic: 0.1, lactic: 1.6 }),  // 0.69
    mk(s1.id, 55, 3.64, 42, 0.45, 13.8, 5.5, { malic: 0.1, lactic: 1.7 }),  // 0.61
    mk(s1.id, 30, 3.65, 40, 0.47, 13.8, 5.4, { malic: 0.1, lactic: 1.8 }),  // 0.57
    mk(s1.id, 10, 3.65, 40, 0.48, 13.8, 5.4, { malic: 0.1, lactic: 1.8 }),  // 0.57 — норма
    // Рислинг (белое) — ОКИСЛЕНИЕ: свободный SO₂ постепенно упал, молек. ушёл ниже 0.5.
    mk(s2.id, 25, 3.10, 16, 0.26, 11.5, 7.9, { malic: 2.6 }),  // 0.78 — норма
    mk(s2.id, 14, 3.12, 11, 0.30, 11.5, 7.8, { malic: 2.5 }),  // 0.51 — на нижней границе
    mk(s2.id,  3, 3.15, 6,  0.34, 11.5, 7.7, { malic: 2.5 }),  // 0.26 — КРАСНЫЙ алерт окисления
    // Ркацители (оранж) — ПОРЧА: летучая кислотность растёт выше порога 0.7.
    mk(s3.id, 50, 3.55, 25, 0.52, 13.2, 5.9),  // 0.56 / VA ok
    mk(s3.id, 25, 3.58, 22, 0.66, 13.2, 5.8),  // 0.37 / VA жёлтый
    mk(s3.id,  5, 3.60, 20, 0.78, 13.2, 5.7),  // 0.32 / VA КРАСНЫЙ алерт
  ]);

  _write(DATA_KEYS.doses, [..._read(DATA_KEYS.doses),
    { id: _newId(), sample_id: s1.id, added_at: new Date(now - 75*day).toISOString(),
      so2_added_mg_l: 20, kmbs_dose_g: (20 * 225) / 570, reason: 'routine',
      notes: 'Плановая защита перед выдержкой.', created_at: new Date(now - 75*day).toISOString() },
    { id: _newId(), sample_id: s2.id, added_at: new Date(now - 15*day).toISOString(),
      so2_added_mg_l: 25, kmbs_dose_g: (25 * 800) / 570, reason: 'after-racking',
      notes: 'После переливки.', created_at: new Date(now - 15*day).toISOString() },
  ]);
}
