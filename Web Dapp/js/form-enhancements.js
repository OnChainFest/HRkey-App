// Mapa de KPIs por tipo de posición
const KPI_BY_ROLE = {
    'software-engineer': [
        'code-quality', 'technical-leadership', 'problem-solving', 'delivery-speed',
        'system-design', 'debugging-skills', 'code-reviews', 'technical-documentation'
    ],
    'product-manager': [
        'stakeholder-management', 'roadmap-planning', 'user-research', 'data-analysis',
        'cross-team-collaboration', 'product-launch', 'feature-prioritization', 'metrics-tracking'
    ],
    'marketing-manager': [
        'campaign-performance', 'brand-awareness', 'lead-generation', 'content-strategy',
        'market-research', 'budget-management', 'roi-optimization', 'customer-acquisition'
    ],
    'sales-representative': [
        'quota-achievement', 'client-relationships', 'pipeline-management', 'negotiation-skills',
        'prospect-conversion', 'customer-retention', 'territory-growth', 'deal-closing'
    ],
    'data-scientist': [
        'model-accuracy', 'data-insights', 'statistical-analysis', 'visualization-quality',
        'research-methodology', 'experiment-design', 'business-impact', 'technical-communication'
    ],
    'designer': [
        'design-quality', 'user-experience', 'creative-solutions', 'stakeholder-feedback',
        'design-systems', 'user-testing', 'visual-consistency', 'design-iteration'
    ],
    'manager': [
        'team-performance', 'leadership-effectiveness', 'strategic-planning', 'talent-development',
        'goal-achievement', 'team-satisfaction', 'decision-making', 'conflict-resolution'
    ],
    'consultant': [
        'client-satisfaction', 'project-delivery', 'business-impact', 'recommendation-quality',
        'stakeholder-management', 'analysis-depth', 'presentation-skills', 'problem-solving'
    ]
};

// Función para obtener KPIs dinámicos
function getDynamicKPIs(applicantRole, relationshipType) {
    let baseKPIs = KPI_BY_ROLE[applicantRole] || KPI_BY_ROLE['manager'];
    
    // Ajustar KPIs según la relación
    if (relationshipType === 'supervisor') {
        baseKPIs = baseKPIs.concat(['leadership-skills', 'mentoring-ability', 'delegation']);
    } else if (relationshipType === 'peer') {
        baseKPIs = baseKPIs.concat(['collaboration', 'knowledge-sharing', 'peer-support']);
    }
    
    return baseKPIs;
}
