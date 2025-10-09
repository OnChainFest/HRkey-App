const KPI_DEFINITIONS = {
    'code-quality': 'Code Quality & Best Practices',
    'technical-leadership': 'Technical Leadership & Architecture',
    'stakeholder-management': 'Stakeholder Management',
    'team-performance': 'Team Performance Management',
    'communication': 'Communication Effectiveness',
    'problem-solving': 'Complex Problem Solving'
};

const KPI_BY_ROLE = {
    'software-engineer': ['code-quality', 'technical-leadership', 'problem-solving'],
    'product-manager': ['stakeholder-management', 'team-performance', 'communication'],
    'manager': ['team-performance', 'stakeholder-management', 'communication']
};

function generateDynamicKPIs(applicantRole, relationshipType) {
    let baseKPIs = KPI_BY_ROLE[applicantRole] || KPI_BY_ROLE['manager'];
    return baseKPIs.slice(0, 6);
}
