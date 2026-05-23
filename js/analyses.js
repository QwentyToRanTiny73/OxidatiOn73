// CRUD для образцов и анализов. Полная реализация — шаг 4.

async function listSamples({ wineType, vintage, stage } = {}) {
  // TODO шаг 4
  return [];
}

async function getSample(sampleId) {
  // TODO шаг 4
  return null;
}

async function createSample(payload) {
  // TODO шаг 4
}

async function listAnalyses(sampleId) {
  // TODO шаг 4
  return [];
}

async function createAnalysis(payload) {
  // TODO шаг 4 — поле molecular_so2 считается клиентом из so2-logic.js
}

async function listRecentAnalyses(limit = 10) {
  // TODO шаг 4
  return [];
}

async function getAlerts() {
  // TODO шаг 5: образцы с риском окисления / высокой VA
  return [];
}

async function addSO2Dose(payload) {
  // TODO шаг 4
}
