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

async function verifyEmail(email, options = { checkCatchAll: true }) {
  if (!validator.isEmail(email)) {
    return { status: 'invalid', reason: 'Invalid email syntax' };
  }

  const [local, domain] = email.split('@');

  // Step 1: Run disposable/role check and MX lookup in parallel
  const [precheck, mxRecords] = await Promise.all([
    (async () => {
      if (isDisposable(domain)) return { blocked: true, reason: 'Disposable email domain' };
      if (isRoleBased(email)) return { blocked: true, reason: 'Role-based email address', risky: true };
      return { blocked: false };
    })(),
    dns.resolveMx(domain).catch(() => null)
  ]);

  if (precheck.blocked) {
    return precheck.risky
      ? { status: 'risky', reason: precheck.reason }
      : { status: 'invalid', reason: precheck.reason };
  }

  if (!mxRecords || mxRecords.length === 0) {
    return { status: 'invalid', reason: 'No valid MX records' };
  }

  // Step 2: Sort and limit to top 2 MX records
  const sortedMx = mxRecords.sort((a, b) => a.priority - b.priority).slice(0, 2);

  for (let i = 0; i < sortedMx.length; i++) {
    const mx = sortedMx[i];
    const client = new SMTPClient({
      host: mx.exchange,
      port: 25,
      timeout: 5000,
    });

    try {
      await client.connect();
      await client.greet({ hostname: 'yourdomain.com' });
      await client.mail({ from: 'verifier@yourdomain.com' });

      // Optional: catch-all detection
      let isCatchAll = false;
      if (options.checkCatchAll) {
        const fakeAddress = `random_${Date.now()}@${domain}`;
        try {
          await client.rcpt({ to: fakeAddress });
          isCatchAll = true;
        } catch (_) {
          isCatchAll = false;
        }
      }

      // Actual RCPT TO check
      const smtpResponse = await client.rcpt({ to: email });
      await client.quit();

      return {
        status: isCatchAll ? 'catch_all' : 'valid',
        smtp: smtpResponse,
        catchAll: isCatchAll,
      };
    } catch (err) {
      await client.quit().catch(() => {});
      const isLast = i === sortedMx.length - 1;

      if (err.code === 'SMTPError' && err.responseCode === 550) {
        return { status: 'invalid', reason: 'User not found (550)' };
      } else if (err.code === 'ETIMEDOUT') {
        if (isLast) return { status: 'greylisted', reason: 'Server timeout or greylisted' };
      } else if (err.code === 'ECONNREFUSED') {
        if (isLast) return { status: 'smtp_blocked', reason: 'SMTP connection refused' };
      } else {
        if (isLast) return { status: 'unknown', reason: 'SMTP check failed for unknown reasons' };
      }
    }
  }

  // Fallback
  return { status: 'unknown', reason: 'All MX checks failed' };
}

module.exports = verifyEmail;
