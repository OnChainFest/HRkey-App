import { buildVisualizationModel } from '../../controllers/reputationGraph.controller.js';

describe('reputation graph visualization view model', () => {
  test('builds truthful confirmed, inferred, and unresolved relationship sections', () => {
    const viewModel = buildVisualizationModel({
      candidateId: 'candidate-1',
      candidateProfile: { full_name: 'Casey Candidate', headline: 'Engineering Leader' },
      graph: {
        incomingEdges: [
          {
            edge_type: 'REFERENCED',
            reference_id: 'reference-1',
            metadata: { inferred_relationship_type: 'MANAGER_OF' },
            source: { entity_type: 'reference', entity_id: 'reference-1' }
          },
          {
            edge_type: 'REFERENCED',
            reference_id: 'reference-2',
            metadata: { inferred_relationship_type: 'PEER_OF' },
            source: { entity_type: 'reference', entity_id: 'reference-2' }
          },
          {
            edge_type: 'MANAGER_OF',
            reference_id: 'reference-1',
            metadata: { materialized_from: 'canonical_referee_identity' },
            source: { entity_type: 'referee', entity_id: 'referee-1' }
          }
        ]
      },
      references: [
        {
          id: 'reference-1',
          referrer_name: 'Morgan Manager',
          referrer_email: 'morgan@example.com',
          relationship: 'manager',
          created_at: '2026-03-18T00:00:00.000Z',
          status: 'approved',
          referee_id: 'referee-1',
          referee_resolution_confidence: 'high'
        },
        {
          id: 'reference-2',
          referrer_name: 'Pat Peer',
          referrer_email: 'pat@example.com',
          relationship: 'peer',
          created_at: '2026-03-17T00:00:00.000Z',
          status: 'approved',
          referee_id: 'referee-2',
          referee_resolution_confidence: 'high'
        },
        {
          id: 'reference-3',
          referrer_name: 'Taylor Unmatched',
          referrer_email: 'taylor@example.com',
          relationship: null,
          created_at: '2026-03-16T00:00:00.000Z',
          status: 'approved',
          referee_id: null,
          referee_resolution_confidence: null
        }
      ]
    });

    expect(viewModel.candidate).toMatchObject({ label: 'Casey Candidate' });
    expect(viewModel.summary).toMatchObject({
      refereeCount: 2,
      referenceCount: 3,
      confirmedRelationshipCount: 1,
      inferredRelationshipCount: 1,
      unresolvedReferenceCount: 1
    });
    expect(viewModel.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'Morgan Manager', relationshipStatus: 'confirmed', relationshipLabel: 'Manager' }),
        expect.objectContaining({ displayName: 'Pat Peer', relationshipStatus: 'inferred', relationshipLabel: 'Inferred peer relationship' })
      ])
    );
    expect(viewModel.unresolvedEvidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Taylor Unmatched', relationshipLabel: 'Referenced / unknown' })])
    );
  });
});
