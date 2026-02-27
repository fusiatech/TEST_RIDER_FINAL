import type { TicketTemplate, TicketLevel, TicketTemplateCategory } from './types'

export const BUILT_IN_TEMPLATES: TicketTemplate[] = [
  {
    id: 'bug-report',
    name: 'Bug Report',
    description: 'Report a bug with reproduction steps and expected/actual behavior',
    level: 'task',
    category: 'bug',
    isDefault: true,
    requiredFields: ['title', 'description'],
    defaultFields: {
      complexity: 'M',
      assignedRole: 'coder',
      status: 'backlog',
      description: `## Bug Description
[Describe the bug clearly and concisely]

## Steps to Reproduce
1. [First step]
2. [Second step]
3. [Third step]

## Expected Behavior
[What you expected to happen]

## Actual Behavior
[What actually happened]

## Environment
- OS: 
- Browser: 
- Version: 

## Screenshots/Logs
[If applicable, add screenshots or error logs]`,
      acceptanceCriteria: [
        'Bug is reproducible with provided steps',
        'Root cause is identified',
        'Fix does not introduce regressions',
        'Unit tests cover the fix',
      ],
    },
    customFields: [
      {
        name: 'severity',
        type: 'select',
        label: 'Severity',
        required: true,
        options: ['critical', 'high', 'medium', 'low'],
        defaultValue: 'medium',
      },
      {
        name: 'affectedVersion',
        type: 'text',
        label: 'Affected Version',
        placeholder: 'e.g., 1.2.3',
      },
      {
        name: 'workaround',
        type: 'textarea',
        label: 'Workaround',
        placeholder: 'Describe any known workaround',
      },
    ],
  },
  {
    id: 'feature-request',
    name: 'Feature Request',
    description: 'Request a new feature using user story format',
    level: 'story',
    category: 'feature',
    isDefault: true,
    requiredFields: ['title', 'description'],
    defaultFields: {
      complexity: 'L',
      assignedRole: 'planner',
      status: 'backlog',
      description: `## User Story
As a [type of user],
I want [goal/desire],
So that [benefit/value].

## Background
[Provide context and motivation for this feature]

## Proposed Solution
[Describe the proposed solution or approach]

## Alternatives Considered
[List any alternative solutions or features you've considered]

## Additional Context
[Add any other context, mockups, or references]`,
      acceptanceCriteria: [
        'Feature meets the described user story',
        'UI/UX follows design guidelines',
        'Feature is documented',
        'Feature has test coverage',
      ],
    },
    customFields: [
      {
        name: 'userType',
        type: 'select',
        label: 'Target User',
        options: ['developer', 'admin', 'end-user', 'all'],
        defaultValue: 'end-user',
      },
      {
        name: 'priority',
        type: 'select',
        label: 'Business Priority',
        options: ['must-have', 'should-have', 'nice-to-have'],
        defaultValue: 'should-have',
      },
      {
        name: 'mockupUrl',
        type: 'url',
        label: 'Mockup/Design URL',
        placeholder: 'Link to Figma, sketch, or other design',
      },
    ],
  },
  {
    id: 'technical-debt',
    name: 'Technical Debt',
    description: 'Track and address technical debt with impact assessment',
    level: 'task',
    category: 'chore',
    isDefault: true,
    requiredFields: ['title', 'description'],
    defaultFields: {
      complexity: 'M',
      assignedRole: 'coder',
      status: 'backlog',
      description: `## Technical Debt Description
[Describe the technical debt item]

## Current State
[Describe the current implementation and its problems]

## Desired State
[Describe the ideal implementation]

## Impact Assessment
### Code Quality Impact
[How does this affect code maintainability?]

### Performance Impact
[Does this affect system performance?]

### Security Impact
[Are there security implications?]

### Developer Productivity Impact
[How does this affect development speed?]

## Proposed Approach
[Outline the steps to address this debt]

## Risks
[List potential risks of addressing or not addressing this debt]`,
      acceptanceCriteria: [
        'Technical debt is fully addressed',
        'No regressions introduced',
        'Code follows current best practices',
        'Documentation is updated',
      ],
    },
    customFields: [
      {
        name: 'debtType',
        type: 'select',
        label: 'Debt Type',
        required: true,
        options: ['architecture', 'code-quality', 'testing', 'documentation', 'dependencies', 'performance'],
        defaultValue: 'code-quality',
      },
      {
        name: 'impactScore',
        type: 'number',
        label: 'Impact Score (1-10)',
        defaultValue: 5,
      },
      {
        name: 'effortScore',
        type: 'number',
        label: 'Effort Score (1-10)',
        defaultValue: 5,
      },
      {
        name: 'affectedFiles',
        type: 'textarea',
        label: 'Affected Files/Modules',
        placeholder: 'List the files or modules affected',
      },
    ],
  },
  {
    id: 'security-issue',
    name: 'Security Issue',
    description: 'Report a security vulnerability with severity and CVE tracking',
    level: 'task',
    category: 'bug',
    isDefault: true,
    requiredFields: ['title', 'description'],
    defaultFields: {
      complexity: 'L',
      assignedRole: 'security',
      status: 'backlog',
      description: `## Security Issue Summary
[Brief description of the security issue]

## Vulnerability Details
### Type
[e.g., XSS, SQL Injection, CSRF, Authentication Bypass]

### Attack Vector
[How can this vulnerability be exploited?]

### Affected Components
[List affected components, endpoints, or features]

## Proof of Concept
[Provide steps to reproduce or demonstrate the vulnerability]
**WARNING: Do not include actual exploit code in public tickets**

## Impact Analysis
### Confidentiality Impact
[Can attackers access sensitive data?]

### Integrity Impact
[Can attackers modify data?]

### Availability Impact
[Can attackers disrupt service?]

## Recommended Fix
[Describe the recommended remediation approach]

## References
[Links to relevant security advisories, CVEs, or documentation]`,
      acceptanceCriteria: [
        'Vulnerability is fully patched',
        'Fix is verified by security review',
        'No new vulnerabilities introduced',
        'Security tests added',
        'Incident documented if applicable',
      ],
    },
    customFields: [
      {
        name: 'cvssScore',
        type: 'number',
        label: 'CVSS Score (0-10)',
        placeholder: 'Common Vulnerability Scoring System score',
      },
      {
        name: 'cveId',
        type: 'text',
        label: 'CVE ID',
        placeholder: 'e.g., CVE-2024-12345',
      },
      {
        name: 'severity',
        type: 'select',
        label: 'Severity',
        required: true,
        options: ['critical', 'high', 'medium', 'low', 'informational'],
        defaultValue: 'medium',
      },
      {
        name: 'isPublic',
        type: 'checkbox',
        label: 'Publicly Disclosed',
        defaultValue: false,
      },
      {
        name: 'disclosureDeadline',
        type: 'date',
        label: 'Disclosure Deadline',
      },
    ],
  },
  {
    id: 'performance-issue',
    name: 'Performance Issue',
    description: 'Track performance problems with metrics and benchmarks',
    level: 'task',
    category: 'bug',
    isDefault: true,
    requiredFields: ['title', 'description'],
    defaultFields: {
      complexity: 'M',
      assignedRole: 'coder',
      status: 'backlog',
      description: `## Performance Issue Summary
[Brief description of the performance problem]

## Current Metrics
| Metric | Current Value | Target Value |
|--------|---------------|--------------|
| Response Time | | |
| Throughput | | |
| Memory Usage | | |
| CPU Usage | | |

## Environment
- Environment: [production/staging/development]
- Load conditions: [normal/peak/stress test]
- Data volume: [approximate data size]

## Steps to Reproduce
1. [First step]
2. [Second step]
3. [Observe performance degradation]

## Profiling Results
[Include profiler output, flame graphs, or performance traces]

## Root Cause Analysis
[Initial analysis of what's causing the performance issue]

## Proposed Optimization
[Describe the proposed solution]

## Success Criteria
[Define measurable criteria for success]`,
      acceptanceCriteria: [
        'Performance meets target metrics',
        'No functional regressions',
        'Performance tests added',
        'Monitoring/alerting updated',
      ],
    },
    customFields: [
      {
        name: 'currentResponseTime',
        type: 'text',
        label: 'Current Response Time',
        placeholder: 'e.g., 2500ms',
      },
      {
        name: 'targetResponseTime',
        type: 'text',
        label: 'Target Response Time',
        placeholder: 'e.g., 500ms',
      },
      {
        name: 'affectedEndpoint',
        type: 'text',
        label: 'Affected Endpoint/Feature',
        placeholder: 'e.g., /api/users, Dashboard loading',
      },
      {
        name: 'percentileMetric',
        type: 'select',
        label: 'Percentile for Target',
        options: ['p50', 'p90', 'p95', 'p99'],
        defaultValue: 'p95',
      },
      {
        name: 'profileUrl',
        type: 'url',
        label: 'Profile/Trace URL',
        placeholder: 'Link to profiling results',
      },
    ],
  },
  {
    id: 'epic-template',
    name: 'Epic',
    description: 'Large feature or initiative spanning multiple stories',
    level: 'epic',
    category: 'feature',
    isDefault: true,
    requiredFields: ['title', 'description'],
    defaultFields: {
      complexity: 'XL',
      assignedRole: 'planner',
      status: 'backlog',
      description: `## Epic Overview
[High-level description of the epic]

## Business Value
[Describe the business value and impact]

## Success Metrics
- [ ] [Metric 1]
- [ ] [Metric 2]
- [ ] [Metric 3]

## Scope
### In Scope
- [Feature/capability 1]
- [Feature/capability 2]

### Out of Scope
- [Explicitly excluded item 1]
- [Explicitly excluded item 2]

## Dependencies
[List external dependencies or blockers]

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| | | | |

## Timeline
[High-level timeline or milestones]`,
      acceptanceCriteria: [
        'All child stories completed',
        'Success metrics achieved',
        'Documentation complete',
        'Stakeholder sign-off received',
      ],
    },
    customFields: [
      {
        name: 'businessOwner',
        type: 'text',
        label: 'Business Owner',
        placeholder: 'Name of business stakeholder',
      },
      {
        name: 'targetQuarter',
        type: 'select',
        label: 'Target Quarter',
        options: ['Q1', 'Q2', 'Q3', 'Q4'],
      },
      {
        name: 'estimatedStoryPoints',
        type: 'number',
        label: 'Estimated Story Points',
      },
    ],
  },
  {
    id: 'subtask-template',
    name: 'Subtask',
    description: 'Small, atomic unit of work within a task',
    level: 'subtask',
    category: 'chore',
    isDefault: true,
    requiredFields: ['title'],
    defaultFields: {
      complexity: 'S',
      assignedRole: 'coder',
      status: 'backlog',
      description: `## Subtask Description
[Brief description of what needs to be done]

## Implementation Notes
[Any specific implementation details or constraints]

## Files to Modify
- [ ] [File 1]
- [ ] [File 2]`,
      acceptanceCriteria: [
        'Implementation complete',
        'Code reviewed',
        'Tests pass',
      ],
    },
    customFields: [
      {
        name: 'estimatedHours',
        type: 'number',
        label: 'Estimated Hours',
        defaultValue: 2,
      },
    ],
  },
  {
    id: 'enhancement-template',
    name: 'Enhancement',
    description: 'Improve existing functionality',
    level: 'story',
    category: 'enhancement',
    isDefault: true,
    requiredFields: ['title', 'description'],
    defaultFields: {
      complexity: 'M',
      assignedRole: 'coder',
      status: 'backlog',
      description: `## Enhancement Summary
[Brief description of the enhancement]

## Current Behavior
[Describe how the feature currently works]

## Proposed Enhancement
[Describe the improved behavior]

## Motivation
[Why is this enhancement valuable?]

## Implementation Approach
[High-level approach to implementing this enhancement]`,
      acceptanceCriteria: [
        'Enhancement implemented as described',
        'Backward compatibility maintained',
        'Documentation updated',
        'Tests updated',
      ],
    },
    customFields: [
      {
        name: 'affectedFeature',
        type: 'text',
        label: 'Affected Feature',
        placeholder: 'Name of the feature being enhanced',
      },
      {
        name: 'breakingChange',
        type: 'checkbox',
        label: 'Breaking Change',
        defaultValue: false,
      },
    ],
  },
]

let customTemplates: TicketTemplate[] = []

export function getTemplate(id: string): TicketTemplate | undefined {
  return [...BUILT_IN_TEMPLATES, ...customTemplates].find(t => t.id === id)
}

export function getAllTemplates(): TicketTemplate[] {
  return [...BUILT_IN_TEMPLATES, ...customTemplates]
}

export function getTemplatesByLevel(level: TicketLevel): TicketTemplate[] {
  return getAllTemplates().filter(t => t.level === level)
}

export function getTemplatesByCategory(category: TicketTemplateCategory): TicketTemplate[] {
  return getAllTemplates().filter(t => t.category === category)
}

export function getDefaultTemplates(): TicketTemplate[] {
  return getAllTemplates().filter(t => t.isDefault)
}

export function getCustomTemplates(): TicketTemplate[] {
  return customTemplates
}

export function addCustomTemplate(template: TicketTemplate): void {
  const existingIndex = customTemplates.findIndex(t => t.id === template.id)
  if (existingIndex >= 0) {
    customTemplates[existingIndex] = template
  } else {
    customTemplates.push(template)
  }
}

export function updateCustomTemplate(id: string, updates: Partial<TicketTemplate>): TicketTemplate | undefined {
  const index = customTemplates.findIndex(t => t.id === id)
  if (index >= 0) {
    customTemplates[index] = { ...customTemplates[index], ...updates, updatedAt: Date.now() }
    return customTemplates[index]
  }
  return undefined
}

export function deleteCustomTemplate(id: string): boolean {
  const index = customTemplates.findIndex(t => t.id === id)
  if (index >= 0) {
    customTemplates.splice(index, 1)
    return true
  }
  return false
}

export function setCustomTemplates(templates: TicketTemplate[]): void {
  customTemplates = templates
}

export interface ApplyTemplateResult {
  title: string
  description: string
  complexity: string
  assignedRole: string
  status: string
  acceptanceCriteria: string[]
  level?: string
  customFieldValues: Record<string, unknown>
}

export function applyTemplate(
  templateId: string,
  overrides: Partial<ApplyTemplateResult> = {}
): ApplyTemplateResult | undefined {
  const template = getTemplate(templateId)
  if (!template) return undefined

  const defaults = template.defaultFields
  const customFieldValues: Record<string, unknown> = {}

  for (const field of template.customFields) {
    if (field.defaultValue !== undefined) {
      customFieldValues[field.name] = field.defaultValue
    }
  }

  return {
    title: overrides.title ?? '',
    description: overrides.description ?? defaults.description ?? '',
    complexity: overrides.complexity ?? defaults.complexity ?? 'M',
    assignedRole: overrides.assignedRole ?? defaults.assignedRole ?? 'coder',
    status: overrides.status ?? defaults.status ?? 'backlog',
    acceptanceCriteria: overrides.acceptanceCriteria ?? defaults.acceptanceCriteria ?? [],
    level: overrides.level ?? template.level,
    customFieldValues: { ...customFieldValues, ...overrides.customFieldValues },
  }
}

export function validateTemplateRequiredFields(
  template: TicketTemplate,
  values: Record<string, unknown>
): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = []

  for (const fieldName of template.requiredFields) {
    const value = values[fieldName]
    if (value === undefined || value === null || value === '') {
      missingFields.push(fieldName)
    }
  }

  for (const customField of template.customFields) {
    if (customField.required) {
      const value = values[customField.name]
      if (value === undefined || value === null || value === '') {
        missingFields.push(customField.name)
      }
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  }
}
