import { useEffect, useMemo, useState } from 'react';

export default function ReferralDashboard({ user }: { user: { email: string; referral_code: string; subscription_expires_at: string } }) {
  const [shareUrl, setShareUrl] = useState('');
  const expiresDate = useMemo(() => new Date(user.subscription_expires_at).toLocaleDateString(), [user.subscription_expires_at]);

  useEffect(() => {
    const url = `${window.location.origin}/?ref=${encodeURIComponent(user.referral_code)}`;
    setShareUrl(url);
  }, [user.referral_code]);

  async function renew() {
    const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email }) });
    const data = await res.json();
    if (data?.url) window.location.href = data.url; else alert('Checkout error');
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4">
        <div className="text-sm">PRO active until</div>
        <div className="text-xl font-semibold">{expiresDate}</div>
      </div>

      <div className="rounded-xl border p-4">
        <div className="text-sm mb-2">Your referral link</div>
        <div className="flex gap-2">
          <input className="flex-1 border rounded px-2 py-1" value={shareUrl} readOnly />
          <button className="border rounded px-3" onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy</button>
        </div>
        <div className="flex gap-3 mt-3 text-sm">
          <a href={`https://twitter.com/intent/tweet?text=Try%20HRKey&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">Share on X</a>
          <a href={`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">LinkedIn</a>
          <a href={`https://api.whatsapp.com/send?text=Try%20HRKey%20${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
      </div>

      <button className="w-full bg-black text-white py-2 rounded-xl" onClick={renew}>Renew $9.99/year</button>
    </div>
  );
}
