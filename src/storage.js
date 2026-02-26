const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getFilePath(routeId) {
  return path.join(DATA_DIR, `${routeId}.json`);
}

function readRecords(routeId) {
  ensureDataDir();
  const fp = getFilePath(routeId);
  if (!fs.existsSync(fp)) return [];
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch {
    return [];
  }
}

function appendRecord(routeId, record) {
  ensureDataDir();
  const records = readRecords(routeId);
  records.push(record);
  fs.writeFileSync(getFilePath(routeId), JSON.stringify(records, null, 2));
}

module.exports = { readRecords, appendRecord };
