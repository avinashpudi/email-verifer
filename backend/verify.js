const dns = require('dns').promises;
const { SMTPClient } = require('smtp-client');
const validator = require('validator');
const disposableDomains = require('./disposable-domains');
const roleEmails = ['admin', 'info', 'support', 'sales', 'help', 'contact'];

function isDisposable(domain) {
  return disposableDomains.includes(domain.toLowerCase());
}

function isRoleBased(email) {
  const local = email.split('@')[0].toLowerCase();
  return roleEmails.includes(local);
}

async function verifyEmail(email) {
  if (!validator.isEmail(email)) {
    return { status: 'invalid', reason: 'Invalid email syntax' };
  }

  const [_, domain] = email.split('@');

  if (isDisposable(domain)) {
    return { status: 'invalid', reason: 'Disposable email domain' };
  }

  if (isRoleBased(email)) {
    return { status: 'risky', reason: 'Role-based email address' };
  }

  let mxRecords;
  try {
    mxRecords = await dns.resolveMx(domain);
    if (mxRecords.length === 0) throw new Error('No MX records found');
    mxRecords.sort((a, b) => a.priority - b.priority);
  } catch (err) {
    return { status: 'invalid', reason: 'No valid MX records' };
  }

  for (let i = 0; i < mxRecords.length; i++) {
    const client = new SMTPClient({
      host: mxRecords[i].exchange,
      port: 25,
      timeout: 5000,
    });

    try {
      await client.connect();
      await client.greet({ hostname: 'yourdomain.com' });
      await client.mail({ from: 'verifier@yourdomain.com' });

      const fakeAddress = `random_${Date.now()}@${domain}`;
      let isCatchAll = false;
      try {
        await client.rcpt({ to: fakeAddress });
        isCatchAll = true;
      } catch (_) {
        isCatchAll = false;
      }

      const response = await client.rcpt({ to: email });
      await client.quit();

      return {
        status: isCatchAll ? 'catch_all' : 'valid',
        smtp: response,
        catchAll: isCatchAll,
      };
    } catch (err) {
      await client.quit().catch(() => {});
      const isLastServer = i === mxRecords.length - 1;
      if (err.code === 'SMTPError' && err.responseCode === 550) {
        return { status: 'invalid', reason: 'User not found (550)' };
      } else if (err.code === 'ETIMEDOUT') {
        if (isLastServer) return { status: 'greylisted', reason: 'Server timeout or greylisted' };
      } else if (err.code === 'ECONNREFUSED') {
        if (isLastServer) return { status: 'smtp_blocked', reason: 'SMTP connection refused' };
      } else {
        if (isLastServer) return { status: 'unknown', reason: 'SMTP check failed for unknown reasons' };
      }
    }
  }
}

module.exports = verifyEmail;