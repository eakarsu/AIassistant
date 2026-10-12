const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const router = express.Router();

const demoCredentialPairs = () => [
  [process.env.DEMO_EMAIL, process.env.DEMO_PASSWORD],
  [process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD],
  [process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD],
  [process.env.DEFAULT_EMAIL, process.env.DEFAULT_PASSWORD],
];

// Local-only credential fill for the existing configured demo account.
router.get('/demo-credentials', (_req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEMO_CREDENTIAL_AUTOFILL !== 'true') {
    return res.status(404).json({ error: 'Demo credential filling is disabled' });
  }
  const credentials = demoCredentialPairs().find(([email, password]) => email && password);
  if (!credentials) return res.status(503).json({ error: 'Demo credentials are not configured' });
  res.set('Cache-Control', 'no-store');
  return res.json({ email: credentials[0], password: credentials[1] });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id,email,name,role FROM users WHERE id=$1', [req.user.id]);
    if (!result.rows.length) return res.status(401).json({ error: 'Session user no longer exists' });
    res.json(result.rows[0]);
  } catch (_) { res.status(500).json({ error: 'Unable to verify persisted session' }); }
});

module.exports = router;
