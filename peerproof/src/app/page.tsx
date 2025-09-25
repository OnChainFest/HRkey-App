import Navbar from "@/components/Navbar";
import Section from "@/components/Section";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import Testimonial from "@/components/Testimonial";
import CreateRefButton from "@/components/CreateRefButton";


export default function Page() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <Section>
        <Hero />
      </Section>
      <Section className="pb-10">
        <Features />
      </Section>
      <Section className="pb-24">
        <Testimonial />
      </Section>
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-slate-500">
          © {new Date().getFullYear()} PeerProof. All rights reserved.
        </div>
        <CreateRefButton />
      </footer>
    </main>
  );
}
