'use strict';

const express = require('express');
const db = require('../db');
const { ah } = require('../util');
const { requireAuth, requireRole } = require('../auth');
const events = require('../event');

const router = express.Router();

/** Публичный статус: нужен странице входа и кабинетам без токена. */
router.get('/', ah(async (req, res) => {
  const flags = await events.readFlags();
  const row = await db.one(
    `SELECT (SELECT COUNT(*) FROM users WHERE role = 'participant') AS participants,
            (SELECT COUNT(*) FROM users WHERE role = 'volunteer') AS volunteers`
  );
  res.json({
    active: flags.active,
    registrationOpen: flags.registrationOpen,
    participants: Number(row.participants),
    volunteers: Number(row.volunteers),
    serverTime: Date.now(),
  });
}));

/** Переключение мероприятия и регистрации — только администратор. */
router.put('/', requireAuth, requireRole('admin'), ah(async (req, res) => {
  if (req.body.active !== undefined) {
    await events.setFlag(events.KEY_ACTIVE, Boolean(req.body.active));
  }
  if (req.body.registrationOpen !== undefined) {
    await events.setFlag(events.KEY_REGISTER, Boolean(req.body.registrationOpen));
  }

  const flags = await events.readFlags();
  res.json({ active: flags.active, registrationOpen: flags.registrationOpen });
}));

module.exports = router;
