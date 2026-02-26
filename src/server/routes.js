const express = require('express');
const router = express.Router();
const { readRecords } = require('../storage');
const routeConfig = require('../../routes.json');

// GET /api/routes — list all configured routes
router.get('/routes', (req, res) => {
  res.json(routeConfig.map((r) => ({ id: r.id, label: r.label })));
});

// GET /api/data/:routeId — all records for a route
router.get('/data/:routeId', (req, res) => {
  const records = readRecords(req.params.routeId);
  res.json(records);
});

// GET /api/data/:routeId/latest?n=100 — last N records
router.get('/data/:routeId/latest', (req, res) => {
  const n = parseInt(req.query.n) || 100;
  const records = readRecords(req.params.routeId);
  res.json(records.slice(-n));
});

module.exports = router;
