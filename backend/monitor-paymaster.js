// DEPRECATED: This script relied on the Biconomy API. Use
// backend/monitor-paymaster-onchain.js for on-chain monitoring instead.

import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config({ path: '../.env' });

const { Pool } = pkg;

const PAYMASTER_API = "https://paymaster.biconomy.io/api/v2/8453/...";
const MIN_BALANCE = 0.02; // ETH
const HOUR_IN_MS = 60 * 60 * 1000;

const hasDbConfig =
  process.env.DB_HOST &&
  process.env.DB_NAME &&
  process.env.DB_USER &&
  process.env.DB_PASSWORD;

const pool = hasDbConfig
  ? new Pool({
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: 5432,
    })
  : null;

async function checkPaymasterBalance() {
  const res = await fetch(`${PAYMASTER_API}/balance`);
  const { balance } = await res.json();

  if (parseFloat(balance) < MIN_BALANCE) {
    await sendAlert(balance);
  }

  if (pool) {
    // Log en BD
    await pool.query(
      'INSERT INTO paymaster_balance_log (balance_eth) VALUES ($1)',
      [balance]
    );
  }
}

async function sendAlert(balance) {
  const nodemailerModule = await import('nodemailer').catch((error) => {
    console.error('Unable to load nodemailer. Skipping alert email.', error);
    return null;
  });

  if (!nodemailerModule) {
    return;
  }

  const nodemailer = nodemailerModule.default ?? nodemailerModule;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    to: 'admin@hrkey.com',
    subject: '🚨 Paymaster Low Balance Alert',
    text: `Paymaster balance: ${balance} ETH. Please refill immediately.`,
  });
}

checkPaymasterBalance().catch((error) => {
  console.error('Initial paymaster check failed:', error);
});

setInterval(() => {
  checkPaymasterBalance().catch((error) => {
    console.error('Scheduled paymaster check failed:', error);
  });
}, HOUR_IN_MS);

