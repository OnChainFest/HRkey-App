"use client";

import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Section from "@/components/Section";
import { ApiClientError, apiPost } from "@/lib/apiClient";
import Link from "next/link";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Section from "@/components/Section";
import CTAButton from "@/components/CTAButton";

const PRICING = {
  payPerReference: 10,
  fullProfileAccess: 25,
  agencyMonthly: 50,
};

const steps = [
  {
    title: "Invite the candidate",
    description: "Send a quick invite so the candidate can share their references with you.",
  },
  {
    title: "Candidate grants consent",
    description: "Candidates approve access and keep full control over who can view their information.",
  },
  {
    title: "Access verified reference pack",
    description: "Review verified references and signals from a single, auditable workspace.",
  },
];

const faqs = [
  {
    question: "What do I receive?",
    answer:
      "A consolidated reference pack with verified submissions, context, and key signals so your team can move faster.",
  },
  {
    question: "How does consent work?",
    answer:
      "We only share references after the candidate approves your request. Access is logged for compliance and transparency.",
  },
  {
    question: "Can candidates earn revenue share?",
    answer: "Yes. Candidates can enable revenue sharing with referrers when they choose to.",
  },
  {
    question: "Can we export?",
    answer: "Exports are available so you can attach reference packs to your ATS or client reports.",
  },
  {
    question: "Billing questions",
    answer:
      "Pay-as-you-go and subscription options are available. You can manage billing anytime in your account settings.",
  },
];

const signupHref = "/dashboard?intent=company";

export const metadata: Metadata = {
  title: "HRKey for Companies | Verified references with consent",
  description:
    "Access verified professional references with candidate consent. Built for agencies and hiring teams that need speed and compliance.",
};

function B2BHero() {
  return (
    <div className="text-center py-16 sm:py-24">
      <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
        Verified Professional References, With Candidate Consent
      </h1>
      <p className="mt-4 text-lg text-slate-600">
        Give your team faster, compliant access to reference packs while candidates stay in control of their data.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
        <CTAButton href={signupHref}>Request Access / Sign Up</CTAButton>
        <Link
          href="#pricing"
          className="inline-block rounded-md border border-slate-200 px-6 py-3 text-slate-800 font-semibold hover:bg-slate-50"
        >
          View Pricing
        </Link>
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="grid gap-8 sm:grid-cols-3 py-12">
      {steps.map((step, index) => (
        <div key={step.title} className="rounded-lg border border-slate-200 p-6 text-left h-full">
          <div className="text-sm font-semibold text-slate-500">Step {index + 1}</div>
          <h3 className="mt-2 text-xl font-semibold">{step.title}</h3>
          <p className="mt-3 text-slate-600">{step.description}</p>
        </div>
      ))}
    </div>
  );
}

function Pricing() {
  return (
    <div id="pricing" className="py-12">
      <h2 className="text-3xl font-bold text-center">Simple pricing for teams</h2>
      <p className="mt-3 text-center text-slate-600">
        Choose the option that fits how your company or agency works today.
      </p>
      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-6 text-left flex flex-col">
          <h3 className="text-xl font-semibold">Pay per Reference</h3>
          <p className="mt-2 text-3xl font-bold">${PRICING.payPerReference} <span className="text-base font-normal text-slate-600">/ reference</span></p>
          <p className="mt-3 text-slate-600 flex-1">Perfect for occasional hires or ad-hoc requests.</p>
          <CTAButton href={signupHref}>Request Access / Sign Up</CTAButton>
        </div>
        <div className="rounded-lg border border-slate-200 p-6 text-left flex flex-col">
          <h3 className="text-xl font-semibold">Full Profile Access</h3>
          <p className="mt-2 text-3xl font-bold">${PRICING.fullProfileAccess} <span className="text-base font-normal text-slate-600">/ profile</span></p>
          <p className="mt-3 text-slate-600 flex-1">Ideal for deeper candidate evaluations with complete reference packs.</p>
          <CTAButton href={signupHref}>Request Access / Sign Up</CTAButton>
        </div>
        <div className="rounded-lg border border-slate-200 p-6 text-left flex flex-col">
          <h3 className="text-xl font-semibold">Agency Plan</h3>
          <p className="mt-2 text-3xl font-bold">${PRICING.agencyMonthly} <span className="text-base font-normal text-slate-600">/ month</span></p>
          <p className="mt-3 text-slate-600 flex-1">Built for recruiting firms managing multiple searches and clients.</p>
          <CTAButton href={signupHref}>Request Access / Sign Up</CTAButton>
        </div>
      </div>
    </div>
  );
}

function TrustCompliance() {
  return (
    <div className="py-12 grid gap-8 lg:grid-cols-2 items-center">
      <div>
        <h2 className="text-3xl font-bold">Compliance-first by design</h2>
        <p className="mt-3 text-slate-600">
          Every access request is controlled by the candidate. We maintain clear consent logs and a verified chain for each reference so you can demonstrate compliance to clients and stakeholders.
        </p>
        <ul className="mt-4 space-y-2 text-slate-700">
          <li>• Candidate consent captured before any sharing</li>
          <li>• Access logs that show who viewed each reference pack</li>
          <li>• Verified references consolidated in one place</li>
        </ul>
      </div>
      <div className="rounded-lg border border-slate-200 p-6 bg-slate-50">
        <h3 className="text-xl font-semibold">What your team sees</h3>
        <p className="mt-2 text-slate-600">
          Structured reference summaries, reviewer context, and visibility controls designed for hiring workflows.
        </p>
        <div className="mt-4 grid gap-3 text-sm text-slate-700">
          <div className="rounded-md bg-white border border-slate-200 p-3">Consent status and expiration</div>
          <div className="rounded-md bg-white border border-slate-200 p-3">Verified referee contact and relationship</div>
          <div className="rounded-md bg-white border border-slate-200 p-3">Downloadable reference pack and access history</div>
        </div>
      </div>
    </div>
  );
}

function FAQ() {
  return (
    <div className="py-12">
      <h2 className="text-3xl font-bold text-center">Frequently asked questions</h2>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {faqs.map((item) => (
          <div key={item.question} className="rounded-lg border border-slate-200 p-6 text-left">
            <h3 className="text-lg font-semibold">{item.question}</h3>
            <p className="mt-2 text-slate-600">{item.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinalCTA() {
  return (
    <div className="text-center py-16">
      <h2 className="text-3xl font-bold">Start faster, stay compliant</h2>
      <p className="mt-3 text-slate-600">
        Request access to HRKey and start receiving verified references with candidate consent.
      </p>
      <div className="mt-6 flex flex-col sm:flex-row justify-center gap-4">
        <CTAButton href={signupHref}>Request Access / Sign Up</CTAButton>
        <Link
          href="#pricing"
          className="inline-block rounded-md border border-slate-200 px-6 py-3 text-slate-800 font-semibold hover:bg-slate-50"
        >
          View Pricing
        </Link>
      </div>
    </div>
  );
}

export default function ForCompaniesPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <Section>
        <B2BHero />
      </Section>
      <Section>
        <HowItWorks />
      </Section>
      <Section>
        <Pricing />
      </Section>
      <Section>
        <TrustCompliance />
      </Section>
      <Section className="pb-16">
        <FAQ />
      </Section>
      <footer className="border-t">
        <Section>
          <FinalCTA />
          <div className="py-8 text-sm text-slate-500 border-t">© {new Date().getFullYear()} HRKey. All rights reserved.</div>
        </Section>
      </footer>
    </main>
  );
}
