"use client";

import TalentIntelligenceDashboard from "@/components/recruiter-intelligence/TalentIntelligenceDashboard";
import { useTalentIntelligenceDashboard } from "@/lib/recruiter-intelligence/useTalentIntelligenceDashboard";

export default function RecruiterTalentIntelligencePage({ params }: { params: { candidateId: string } }) {
  const dashboard = useTalentIntelligenceDashboard(params.candidateId);
  return <TalentIntelligenceDashboard data={dashboard} />;
}
