import CTAButton from "./CTAButton";

export default function Hero() {
  return (
    <div className="text-center py-16 sm:py-24">
      <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
        Own Your <span className="whitespace-nowrap">Professional Story</span>
      </h1>
      <p className="mt-4 text-lg text-slate-600">
        Collect, verify, and share peer-powered references — all under your control.
      </p>
      <div className="mt-8 flex justify-center">
        <CTAButton href="/dashboard">Start Now</CTAButton>
      </div>
    </div>
  );
}
