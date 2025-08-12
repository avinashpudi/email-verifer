const express = require('express');
const bodyParser = require('body-parser');
const verifyEmail = require('./verify');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('IntelSnap Email Verifier Backend is running.');
});

app.post('/api/verify-email', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ status: 'error', reason: 'Missing email field' });
  }

  try {
    const result = await verifyEmail(email);
    res.json(result);
  } catch (err) {
    console.error('Verification error:', err);
    res.status(500).json({ status: 'error', reason: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});