function Feature({title, desc, icon}:{title:string; desc:string; icon:React.ReactNode}) {
  return (
    <div className="rounded-2xl p-5 border">
      <div className="mb-3">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-slate-600">{desc}</p>
    </div>
  );
}
export default function Features() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <Feature
        title="Secure"
        desc="Blockchain-backed verification."
        icon={<div className="h-9 w-9 rounded-lg bg-[#FF6B35]/10 flex items-center justify-center">
          <span className="text-[#FF6B35]">🔒</span>
        </div>}
      />
      <Feature
        title="Peer-Driven"
        desc="Build credibility with colleagues."
        icon={<div className="h-9 w-9 rounded-lg bg-[#FF6B35]/10 flex items-center justify-center">
          <span className="text-[#FF6B35]">🤝</span>
        </div>}
      />
      <Feature
        title="Share anywhere"
        desc="Export and share with employers globally."
        icon={<div className="h-9 w-9 rounded-lg bg-[#FF6B35]/10 flex items-center justify-center">
          <span className="text-[#FF6B35]">🌍</span>
        </div>}
      />
    </div>
  );
}
