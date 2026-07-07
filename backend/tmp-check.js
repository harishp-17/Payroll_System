const { query } = require('./src/config/db');
const bcrypt = require('bcrypt');

(async () => {
  const hash = bcrypt.hashSync('Password@123', 10);
  const emails = ['admin@company.com', 'john.doe@company.com', 'jane.smith@company.com', 'robert.brown@company.com'];

  for (const email of emails) {
    await query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email]);
  }

  console.log('Updated demo user passwords');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
