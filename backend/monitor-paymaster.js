const cron = require('node-cron');
const nodemailer = require('nodemailer');

const PAYMASTER_API = "https://paymaster.biconomy.io/api/v2/8453/...";
const MIN_BALANCE = 0.02; // ETH

async function checkPaymasterBalance() {
  const res = await fetch(`${PAYMASTER_API}/balance`);
  const { balance } = await res.json();
  
  if (parseFloat(balance) < MIN_BALANCE) {
    await sendAlert(balance);
  }
  
  // Log en BD
  await pool.query(
    'INSERT INTO paymaster_balance_log (balance_eth) VALUES ($1)',
    [balance]
  );
}

async function sendAlert(balance) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    to: 'admin@hrkey.com',
    subject: '🚨 Paymaster Low Balance Alert',
    text: `Paymaster balance: ${balance} ETH. Please refill immediately.`
  });
}

// Ejecutar cada hora
cron.schedule('0 * * * *', checkPaymasterBalance);