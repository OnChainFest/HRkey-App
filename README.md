# HRKey Paymaster Tooling

## Paymaster On-Chain Monitor

The repository includes a Node.js helper that checks the on-chain balance of the HRKey paymaster and alerts the team when the threshold is crossed.

### 1. Configure environment variables

Create a `.env` file at the repository root. You can start from `.env.example`:

```bash
cp .env.example .env
```

Then edit the values:

- `RPC_URL` – HTTPS endpoint for the Base network.
- `PAYMASTER_ADDRESS` – Paymaster address to monitor.
- `MIN_BALANCE_ETH` – Alert threshold in ETH (defaults to `0.05`).
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` – SMTP credentials for sending alerts. Set `SMTP_HOST=json` to log email payloads locally without sending.
- `ALERT_FROM`, `ALERT_TO` – Sender and recipient addresses for the alert email.
- `MONITOR_CRON_EXPRESSION` *(optional)* – Cron expression for recurring checks (e.g. `*/10 * * * *` for every 10 minutes).

### 2. Install dependencies

```bash
npm install
```

This pulls the required packages (`ethers`, `nodemailer`, and `node-cron` when using scheduling).

### 3. Run the monitor

Run a single balance check:

```bash
npm run monitor:onchain
```

If `MONITOR_CRON_EXPRESSION` is provided, the script performs one check immediately and then continues using the cron schedule. Consider running it under a process manager such as PM2 for long-lived workers.

### Local testing tips

Set `SMTP_HOST=json` to inspect the email payload without connecting to a mail server. You can also provide `MOCK_BALANCE_ETH` to simulate the balance branch logic without making RPC calls (useful in restricted environments).

## Serverless variant (optional)

To run the monitor as a serverless function (e.g. Vercel or AWS Lambda), create `api/monitor-paymaster-onchain.js` that imports the same helper logic and returns JSON with the balance status. Schedule it via Vercel cron (`cron.json`) or GitHub Actions for periodic execution.
