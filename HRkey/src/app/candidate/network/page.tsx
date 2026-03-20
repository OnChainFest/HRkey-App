"use client";

import { useCallback, useEffect, useState } from "react";
import CandidateRelationshipNetwork, {
  CandidateRelationshipVisualizationData,
} from "@/components/relationship-network/CandidateRelationshipNetwork";
import { ApiClientError, apiGet } from "@/lib/apiClient";
import { supabase } from "@/lib/supabaseClient";

export default function CandidateRelationshipNetworkPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CandidateRelationshipVisualizationData | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.user?.id) {
        setError("Please sign in to view your professional relationship network.");
        setData(null);
        return;
      }

      const candidateId = sessionData.session.user.id;
      const result = await apiGet<CandidateRelationshipVisualizationData & { ok: boolean }>(
        `/api/reputation-graph/candidate/${candidateId}/visualization`
      );
      setData(result);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401 || err.status === 403) {
          setError("You do not have permission to view this professional relationship network.");
        } else if (err.status === 404) {
          setError("Relationship network not found.");
        } else {
          setError(err.message || "Unable to load this relationship network right now.");
        }
      } else {
        setError("Unexpected error loading relationship network.");
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return <CandidateRelationshipNetwork data={data} loading={loading} error={error} onRefresh={load} />;
}
