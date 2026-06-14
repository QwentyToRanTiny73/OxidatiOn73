// Логика SO2 — чистые функции, без сетевых вызовов.
// Подключается на страницах нового анализа и калькулятора.
//
// Энологическая модель:
//   • target.min / target.max — рекомендуемый рабочий диапазон молекулярного SO2;
//   • target.floor — защитный минимум: ниже него реальный риск окисления/микробиологии.
// Для красных и натуральных/оранжевых вин floor ниже, т.к. фенольные соединения
// дают часть антиоксидантной защиты и эти стили намеренно ведут на низком SO2.

const SO2_TARGETS = {
  white:         { min: 0.5, max: 0.8, floor: 0.5, label: 'Белые сухие' },
  'white-sweet': { min: 0.8, max: 1.5, floor: 0.8, label: 'Белые сладкие' },
  red:           { min: 0.5, max: 0.6, floor: 0.3, label: 'Красные сухие' },
  rose:          { min: 0.5, max: 0.7, floor: 0.5, label: 'Розовые' },
  sparkling:     { min: 0.4, max: 0.6, floor: 0.4, label: 'Игристые перед тиражом' },
  orange:        { min: 0.3, max: 0.5, floor: 0.3, label: 'Натуральные / оранжевые' },
  'pet-nat':     { min: 0.3, max: 0.5, floor: 0.3, label: 'Pet-nat' },
};

// Молекулярный SO2 из свободного SO2 и pH.
// molecular_so2 = free_so2 / (1 + 10^(pH − 1.81))
// 1.81 — pKa1 сернистой кислоты при ~20 °C.
function molecularSO2(freeSO2, ph) {
  if (freeSO2 == null || ph == null || isNaN(freeSO2) || isNaN(ph)) return null;
  const denom = 1 + Math.pow(10, ph - 1.81);
  return freeSO2 / denom;
}

// Обратная формула: требуемый свободный SO2 для заданного молекулярного при pH.
function freeSO2ForMolecular(molecularTarget, ph) {
  if (molecularTarget == null || ph == null) return null;
  return molecularTarget * (1 + Math.pow(10, ph - 1.81));
}

// Граммы KMBS (метабисульфит калия) для добавления N мг/л SO2 в V литров.
// 1 г чистого KMBS даёт ~570 мг SO2 (≈57 % по массе).
function kmbsGrams(deltaMgL, volumeLiters) {
  if (deltaMgL == null || volumeLiters == null) return null;
  if (deltaMgL <= 0 || volumeLiters <= 0) return 0;
  return (deltaMgL * volumeLiters) / 570;
}

// Защитный минимум молекулярного SO2 для типа вина (мг/л).
function oxidationFloor(wineType) {
  const t = SO2_TARGETS[wineType];
  return t ? (t.floor ?? t.min) : 0.5;
}

// Статус молекулярного SO2 относительно диапазона для типа вина.
// 'ok' | 'warn' | 'bad' | 'unknown'.
function so2Status(molecular, wineType) {
  const t = SO2_TARGETS[wineType];
  if (!t || molecular == null) return 'unknown';
  const floor = t.floor ?? t.min;
  if (molecular < floor)        return 'bad';   // ниже защитного минимума — риск окисления
  if (molecular < t.min)        return 'warn';  // ниже рекомендуемого диапазона
  if (molecular <= t.max)       return 'ok';    // в норме
  if (molecular <= t.max * 1.5) return 'warn';  // выше нормы — возможен сенсорный порог SO2
  return 'bad';                                 // явная передозировка
}

// Статус летучей кислотности (г/л в пересчёте на уксусную).
function vaStatus(va) {
  if (va == null || isNaN(va)) return 'unknown';
  if (va > 0.7) return 'bad';   // повышенный риск порчи
  if (va > 0.6) return 'warn';  // приближается к порогу
  return 'ok';
}

// Экспорт для использования в инлайн-скриптах страниц.
window.SO2 = {
  TARGETS: SO2_TARGETS,
  molecular: molecularSO2,
  freeForMolecular: freeSO2ForMolecular,
  kmbsGrams,
  floor: oxidationFloor,
  status: so2Status,
  vaStatus,
};
