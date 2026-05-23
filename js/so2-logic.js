// Логика SO2 — чистые функции, без сетевых вызовов.
// Подключается на страницах нового анализа и калькулятора.

// Целевые диапазоны молекулярного SO2 (мг/л) по типам вин.
const SO2_TARGETS = {
  white:     { min: 0.5, max: 0.8, label: 'Белые сухие' },
  'white-sweet': { min: 0.8, max: 1.5, label: 'Белые сладкие' },
  red:       { min: 0.5, max: 0.6, label: 'Красные сухие' },
  rose:      { min: 0.5, max: 0.7, label: 'Розовые' },
  sparkling: { min: 0.4, max: 0.6, label: 'Игристые перед тиражом' },
  orange:    { min: 0.3, max: 0.5, label: 'Натуральные / оранжевые' },
  'pet-nat': { min: 0.3, max: 0.5, label: 'Pet-nat' },
};

// Молекулярный SO2 из свободного SO2 и pH.
// molecular_so2 = free_so2 / (1 + 10^(pH − 1.81))
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
// 1 г чистого KMBS даёт 570 мг SO2.
function kmbsGrams(deltaMgL, volumeLiters) {
  if (deltaMgL == null || volumeLiters == null) return null;
  if (deltaMgL <= 0 || volumeLiters <= 0) return 0;
  return (deltaMgL * volumeLiters) / 570;
}

// Статус молекулярного SO2 относительно целевого диапазона для типа вина.
// Возвращает 'ok' | 'warn' | 'bad' | 'unknown'.
function so2Status(molecular, wineType) {
  const t = SO2_TARGETS[wineType];
  if (!t || molecular == null) return 'unknown';
  if (molecular < t.min * 0.75) return 'bad';          // явный риск окисления
  if (molecular < t.min) return 'warn';                // ниже нормы
  if (molecular > t.max * 1.5) return 'bad';           // передозировка
  if (molecular > t.max) return 'warn';                // выше нормы
  return 'ok';
}

// Статус летучей кислотности (г/л в пересчёте на уксусную).
function vaStatus(va) {
  if (va == null || isNaN(va)) return 'unknown';
  if (va > 0.9) return 'bad';
  if (va > 0.6) return 'warn';
  return 'ok';
}

// Экспорт для использования в инлайн-скриптах страниц.
window.SO2 = {
  TARGETS: SO2_TARGETS,
  molecular: molecularSO2,
  freeForMolecular: freeSO2ForMolecular,
  kmbsGrams,
  status: so2Status,
  vaStatus,
};
