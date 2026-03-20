import { render, screen } from '@testing-library/react';
import CandidateRelationshipNetwork, {
  CandidateRelationshipVisualizationData,
} from '@/components/relationship-network/CandidateRelationshipNetwork';

const baseData: CandidateRelationshipVisualizationData = {
  candidate: {
    id: 'candidate-1',
    label: 'Casey Candidate',
    headline: 'Staff Product Designer',
  },
  summary: {
    refereeCount: 2,
    referenceCount: 3,
    unresolvedReferenceCount: 1,
    distinctRelationshipTypeCount: 2,
    confirmedRelationshipCount: 1,
    inferredRelationshipCount: 1,
    networkStrengthBand: 'medium',
    evidenceCoverage: 'moderate',
  },
  relationships: [
    {
      refereeId: 'referee-1',
      displayName: 'Morgan Manager',
      relationshipLabel: 'Manager',
      relationshipType: 'manager',
      relationshipStatus: 'confirmed',
      supportingReferenceCount: 2,
      evidenceCount: 2,
      confirmedRelationshipTypes: ['Manager'],
      inferredRelationshipTypes: [],
      resolutionConfidence: 'high',
      evidenceHint: '2 supporting references',
      evidence: [
        {
          referenceId: 'reference-1',
          relationshipLabel: 'Manager',
          relationshipType: 'manager',
          status: 'approved',
          createdAt: '2026-03-18T00:00:00.000Z',
          sourceType: 'signal',
        },
      ],
    },
    {
      refereeId: 'referee-2',
      displayName: 'Pat Peer',
      relationshipLabel: 'Inferred peer relationship',
      relationshipType: 'peer',
      relationshipStatus: 'inferred',
      supportingReferenceCount: 1,
      evidenceCount: 1,
      confirmedRelationshipTypes: [],
      inferredRelationshipTypes: ['Peer'],
      resolutionConfidence: 'high',
      evidenceHint: 'Relationship inferred from 1 reference',
      evidence: [
        {
          referenceId: 'reference-2',
          relationshipLabel: 'Peer',
          relationshipType: 'peer',
          status: 'approved',
          createdAt: '2026-03-17T00:00:00.000Z',
          sourceType: 'signal',
        },
      ],
    },
  ],
  unresolvedEvidence: [
    {
      referenceId: 'reference-3',
      label: 'Taylor Unresolved',
      relationshipLabel: 'Referenced / unknown',
      relationshipType: 'referenced / unknown',
      createdAt: '2026-03-16T00:00:00.000Z',
      sourceType: 'referenced',
    },
  ],
};

describe('CandidateRelationshipNetwork', () => {
  it('renders a candidate-centered network with canonical referees', () => {
    render(<CandidateRelationshipNetwork data={baseData} />);

    expect(screen.getByText('Professional Relationship Network')).toBeInTheDocument();
    expect(screen.getByText('Casey Candidate')).toBeInTheDocument();
    expect(screen.getByText('Morgan Manager')).toBeInTheDocument();
    expect(screen.getByText('Pat Peer')).toBeInTheDocument();
  });

  it('distinguishes confirmed and inferred relationship labels', () => {
    render(<CandidateRelationshipNetwork data={baseData} />);

    expect(screen.getAllByText('Manager').length).toBeGreaterThan(0);
    expect(screen.getByText('Inferred peer relationship')).toBeInTheDocument();
    expect(screen.getByText('Confirmed graph relationship')).toBeInTheDocument();
    expect(screen.getByText('Inferred from reference evidence')).toBeInTheDocument();
  });

  it('shows network strength indicators and unresolved evidence', () => {
    render(<CandidateRelationshipNetwork data={baseData} />);

    expect(screen.getByText('Network strength: medium')).toBeInTheDocument();
    expect(screen.getByText('Evidence coverage: moderate')).toBeInTheDocument();
    expect(screen.getByText('1 unresolved reference')).toBeInTheDocument();
    expect(screen.getByText('Reference evidence awaiting canonical matching')).toBeInTheDocument();
  });

  it('handles sparse graph empty state', () => {
    render(
      <CandidateRelationshipNetwork
        data={{
          ...baseData,
          summary: {
            ...baseData.summary,
            refereeCount: 0,
            referenceCount: 0,
            unresolvedReferenceCount: 0,
            distinctRelationshipTypeCount: 0,
            confirmedRelationshipCount: 0,
            inferredRelationshipCount: 0,
            networkStrengthBand: 'low',
            evidenceCoverage: 'limited',
          },
          relationships: [],
          unresolvedEvidence: [],
        }}
      />
    );

    expect(screen.getByText('This network is still growing')).toBeInTheDocument();
  });

  it('handles loading and error states', () => {
    const { rerender } = render(<CandidateRelationshipNetwork loading />);
    expect(screen.getByText('Loading relationship network…')).toBeInTheDocument();

    rerender(<CandidateRelationshipNetwork error="Unable to load network" />);
    expect(screen.getByText('Unable to load network')).toBeInTheDocument();
  });
});
