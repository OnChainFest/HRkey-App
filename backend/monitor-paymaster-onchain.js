import 'dotenv/config';
import { ethers } from 'ethers';

const {
  RPC_URL,
  PAYMASTER_ADDRESS,
  MIN_BALANCE_ETH = '0.05',
  ALERT_TO,
  ALERT_FROM,
  SMTP_HOST,
  SMTP_PORT = '587',
  SMTP_USER,
  SMTP_PASS,
  MONITOR_CRON_EXPRESSION,
  MOCK_BALANCE_ETH,
} = process.env;

function logInfo(message) {
  const timestamp = new Date().toISOString();
  console.log(`[monitor] ${timestamp} ${message}`);
}

function logError(message, error) {
  const timestamp = new Date().toISOString();
  console.error(`[monitor] ${timestamp} ${message}`);
  if (error) {
    console.error(error);
  }
}

let nodemailer;
try {
  const nodemailerModule = await import('nodemailer');
  nodemailer = nodemailerModule.default ?? nodemailerModule;
} catch (error) {
  logError('Nodemailer is not available. Email alerts will be disabled.', error);
}

if (!RPC_URL) {
  console.error('RPC_URL is not defined. Please set it in your environment variables.');
  process.exitCode = 1;
}

if (!PAYMASTER_ADDRESS) {
  console.error('PAYMASTER_ADDRESS is not defined. Please set it in your environment variables.');
  process.exitCode = 1;
}

const provider = RPC_URL ? new ethers.JsonRpcProvider(RPC_URL) : null;
const minBalanceWei = ethers.parseEther(MIN_BALANCE_ETH);

let transporter;
function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (!nodemailer) {
    throw new Error('nodemailer module is unavailable.');
  }

  if (SMTP_HOST && SMTP_HOST.toLowerCase() === 'json') {
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
    return transporter;
  }

  if (!SMTP_HOST) {
    throw new Error('SMTP_HOST is not defined. Cannot send email alerts.');
  }

  const port = Number.parseInt(SMTP_PORT, 10) || 587;
  const secure = port === 465;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure,
    auth:
      SMTP_USER && SMTP_PASS
        ? {
            user: SMTP_USER,
            pass: SMTP_PASS,
          }
        : undefined,
  });

  return transporter;
}

async function sendLowBalanceAlert(balanceEth) {
  if (!ALERT_FROM || !ALERT_TO) {
    logError(
      'ALERT_FROM or ALERT_TO is not configured. Skipping email notification.'
    );
    return;
  }

  try {
    const activeTransporter = getTransporter();

    const mailOptions = {
      from: ALERT_FROM,
      to: ALERT_TO,
      subject: '🚨 Paymaster Low Balance Alert',
      text: `Paymaster balance is ${balanceEth} ETH (threshold ${MIN_BALANCE_ETH} ETH). Please top up.`,
    };

    const info = await activeTransporter.sendMail(mailOptions);

    if (SMTP_HOST && SMTP_HOST.toLowerCase() === 'json') {
      logInfo(`Email alert (json transport): ${JSON.stringify(info.message)}`);
    } else {
      logInfo(`Email alert sent: ${info.messageId ?? 'no message id available'}`);
    }
  } catch (error) {
    logError('Failed to send low balance email alert.', error);
  }
}

async function resolveBalanceWei() {
  if (MOCK_BALANCE_ETH) {
    return ethers.parseEther(MOCK_BALANCE_ETH);
  }

  if (!provider) {
    throw new Error('Provider is not configured.');
  }

  return provider.getBalance(PAYMASTER_ADDRESS);
}

async function checkBalance() {
  if (!RPC_URL || !PAYMASTER_ADDRESS) {
    return;
  }

  try {
    const balanceWei = await resolveBalanceWei();
    const balanceEth = ethers.formatEther(balanceWei);

    if (balanceWei < minBalanceWei) {
      logInfo(
        `Balance below threshold: ${balanceEth} ETH (threshold ${MIN_BALANCE_ETH} ETH).`
      );
      await sendLowBalanceAlert(balanceEth);
    } else {
      logInfo(`Balance OK: ${balanceEth} ETH (threshold ${MIN_BALANCE_ETH} ETH).`);
    }

    return balanceEth;
  } catch (error) {
    logError('Failed to check paymaster balance.', error);
    throw error;
  }
}

async function main() {
  await checkBalance();

  if (!MONITOR_CRON_EXPRESSION) {
    return;
  }

  try {
    const { default: cron } = await import('node-cron');
    cron.schedule(MONITOR_CRON_EXPRESSION, () => {
      checkBalance().catch((error) => {
        logError('Scheduled paymaster balance check failed.', error);
      });
    });
    logInfo(`Cron schedule initialized with expression: ${MONITOR_CRON_EXPRESSION}`);
  } catch (error) {
    logError('Failed to initialize cron schedule.', error);
  }
}

main().catch((error) => {
  logError('Unexpected error in monitor.', error);
  process.exitCode = 1;
});
