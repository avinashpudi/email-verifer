const dns = require('dns').promises;
const { SMTPClient } = require('smtp-client');
const validator = require('validator');

async function verifyEmail(email) {
  // Step 1: Validate syntax
  if (!validator.isEmail(email)) {
    return { status: 'invalid', reason: 'Invalid email syntax' };
  }

  const domain = email.split('@')[1];

  // Step 2: Lookup MX records
  let mxRecords;
  try {
    mxRecords = await dns.resolveMx(domain);
    if (mxRecords.length === 0) throw new Error('No MX records found');
    // Prefer highest priority
    mxRecords.sort((a, b) => a.priority - b.priority);
  } catch (err) {
    return { status: 'invalid', reason: 'No valid MX records' };
  }

  // Step 3: SMTP check
  const client = new SMTPClient({
    host: mxRecords[0].exchange,
    port: 25,
    timeout: 5000,
  });

  try {
    await client.connect();
    await client.greet({ hostname: 'yourdomain.com' });
    await client.mail({ from: 'test@yourdomain.com' });
    const response = await client.rcpt({ to: email });
    await client.quit();

    return {
      status: 'valid',
      smtp: response,
    };
  } catch (err) {
    if (err.code === 'SMTPError' && err.responseCode === 550) {
      return { status: 'invalid', reason: 'User not found (550)' };
    }
    return { status: 'risky', reason: 'SMTP check failed or catch-all domain' };
  }
}

module.exports = verifyEmail;
