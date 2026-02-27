import { z } from 'zod'

export const PRDTemplateType = z.enum(['feature', 'bug_fix', 'enhancement'])
export type PRDTemplateType = z.infer<typeof PRDTemplateType>

export const PRDSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  placeholder: z.string(),
  required: z.boolean(),
  aiPrompt: z.string(),
})
export type PRDSection = z.infer<typeof PRDSectionSchema>

export const PRDTemplateSchema = z.object({
  id: PRDTemplateType,
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  sections: z.array(PRDSectionSchema),
})
export type PRDTemplate = z.infer<typeof PRDTemplateSchema>

export const FEATURE_TEMPLATE: PRDTemplate = {
  id: 'feature',
  name: 'Feature Specification',
  description: 'Comprehensive template for new feature development',
  icon: 'Sparkles',
  sections: [
    {
      id: 'problem',
      title: 'Problem Statement',
      placeholder: 'Describe the problem this feature solves. What pain points exist for users?',
      required: true,
      aiPrompt: 'Generate a clear problem statement that identifies the user pain points and business need for this feature.',
    },
    {
      id: 'solution',
      title: 'Proposed Solution',
      placeholder: 'Describe the proposed solution at a high level. How will this feature address the problem?',
      required: true,
      aiPrompt: 'Generate a high-level solution overview that addresses the problem statement and outlines the key approach.',
    },
    {
      id: 'requirements',
      title: 'Functional Requirements',
      placeholder: 'List the functional requirements. What must the feature do?\n\n- FR1: \n- FR2: \n- FR3: ',
      required: true,
      aiPrompt: 'Generate a numbered list of specific, testable functional requirements for this feature.',
    },
    {
      id: 'non_functional',
      title: 'Non-Functional Requirements',
      placeholder: 'List non-functional requirements (performance, security, scalability, etc.)\n\n- NFR1: \n- NFR2: ',
      required: false,
      aiPrompt: 'Generate non-functional requirements covering performance, security, scalability, accessibility, and maintainability.',
    },
    {
      id: 'user_stories',
      title: 'User Stories',
      placeholder: 'As a [user type], I want [goal] so that [benefit].\n\n- US1: \n- US2: ',
      required: true,
      aiPrompt: 'Generate user stories in the format "As a [user type], I want [goal] so that [benefit]" covering the main use cases.',
    },
    {
      id: 'acceptance_criteria',
      title: 'Acceptance Criteria',
      placeholder: 'Define acceptance criteria for each requirement.\n\n- AC1: Given [context], when [action], then [result]\n- AC2: ',
      required: true,
      aiPrompt: 'Generate acceptance criteria in Given/When/Then format for the key requirements.',
    },
    {
      id: 'success_metrics',
      title: 'Success Metrics',
      placeholder: 'How will success be measured? Define KPIs and targets.\n\n- Metric 1: \n- Metric 2: ',
      required: true,
      aiPrompt: 'Generate quantifiable success metrics and KPIs to measure the feature\'s impact.',
    },
    {
      id: 'out_of_scope',
      title: 'Out of Scope',
      placeholder: 'What is explicitly NOT included in this feature?',
      required: false,
      aiPrompt: 'Identify items that are explicitly out of scope to set clear boundaries for this feature.',
    },
    {
      id: 'dependencies',
      title: 'Dependencies & Risks',
      placeholder: 'List any dependencies on other teams, systems, or features. Identify potential risks.',
      required: false,
      aiPrompt: 'Identify technical dependencies, external dependencies, and potential risks with mitigation strategies.',
    },
  ],
}

export const BUG_FIX_TEMPLATE: PRDTemplate = {
  id: 'bug_fix',
  name: 'Bug Report',
  description: 'Template for documenting and tracking bug fixes',
  icon: 'Bug',
  sections: [
    {
      id: 'problem',
      title: 'Bug Description',
      placeholder: 'Describe the bug in detail. What is happening that shouldn\'t be?',
      required: true,
      aiPrompt: 'Generate a clear bug description including the observed behavior and expected behavior.',
    },
    {
      id: 'reproduction',
      title: 'Steps to Reproduce',
      placeholder: '1. Go to...\n2. Click on...\n3. Observe...',
      required: true,
      aiPrompt: 'Generate clear, numbered steps to reproduce the bug consistently.',
    },
    {
      id: 'expected',
      title: 'Expected Behavior',
      placeholder: 'What should happen instead?',
      required: true,
      aiPrompt: 'Describe the expected behavior that should occur when the bug is fixed.',
    },
    {
      id: 'impact',
      title: 'Impact Assessment',
      placeholder: 'How does this bug affect users? What is the severity and scope?',
      required: true,
      aiPrompt: 'Assess the impact of this bug including affected users, severity level, and business impact.',
    },
    {
      id: 'solution',
      title: 'Proposed Fix',
      placeholder: 'Describe the proposed solution or fix approach.',
      required: false,
      aiPrompt: 'Suggest a technical approach to fix this bug based on the description.',
    },
    {
      id: 'requirements',
      title: 'Fix Requirements',
      placeholder: 'What needs to be done to fix this bug?\n\n- FR1: \n- FR2: ',
      required: true,
      aiPrompt: 'Generate specific requirements for the bug fix.',
    },
    {
      id: 'acceptance_criteria',
      title: 'Acceptance Criteria',
      placeholder: 'How will we verify the bug is fixed?\n\n- AC1: \n- AC2: ',
      required: true,
      aiPrompt: 'Generate acceptance criteria to verify the bug has been properly fixed.',
    },
    {
      id: 'success_metrics',
      title: 'Success Metrics',
      placeholder: 'How will we measure the fix was successful?',
      required: false,
      aiPrompt: 'Define metrics to confirm the bug fix is successful and hasn\'t introduced regressions.',
    },
  ],
}

export const ENHANCEMENT_TEMPLATE: PRDTemplate = {
  id: 'enhancement',
  name: 'Enhancement Request',
  description: 'Template for improving existing functionality',
  icon: 'TrendingUp',
  sections: [
    {
      id: 'problem',
      title: 'Current State',
      placeholder: 'Describe the current functionality and its limitations.',
      required: true,
      aiPrompt: 'Describe the current state of the functionality and identify its limitations or areas for improvement.',
    },
    {
      id: 'motivation',
      title: 'Motivation',
      placeholder: 'Why is this enhancement needed? What value does it provide?',
      required: true,
      aiPrompt: 'Explain the business and user value of this enhancement.',
    },
    {
      id: 'solution',
      title: 'Proposed Enhancement',
      placeholder: 'Describe the proposed enhancement in detail.',
      required: true,
      aiPrompt: 'Generate a detailed description of the proposed enhancement and how it improves the current state.',
    },
    {
      id: 'requirements',
      title: 'Enhancement Requirements',
      placeholder: 'List the requirements for this enhancement.\n\n- ER1: \n- ER2: ',
      required: true,
      aiPrompt: 'Generate specific, testable requirements for this enhancement.',
    },
    {
      id: 'user_stories',
      title: 'User Stories',
      placeholder: 'As a [user type], I want [enhancement] so that [benefit].',
      required: false,
      aiPrompt: 'Generate user stories describing how users will benefit from this enhancement.',
    },
    {
      id: 'acceptance_criteria',
      title: 'Acceptance Criteria',
      placeholder: 'Define acceptance criteria for the enhancement.\n\n- AC1: \n- AC2: ',
      required: true,
      aiPrompt: 'Generate acceptance criteria to verify the enhancement meets requirements.',
    },
    {
      id: 'success_metrics',
      title: 'Success Metrics',
      placeholder: 'How will success be measured?\n\n- Metric 1: \n- Metric 2: ',
      required: true,
      aiPrompt: 'Generate quantifiable metrics to measure the enhancement\'s impact.',
    },
    {
      id: 'migration',
      title: 'Migration & Compatibility',
      placeholder: 'Are there any migration steps or backward compatibility concerns?',
      required: false,
      aiPrompt: 'Identify any migration requirements or backward compatibility considerations.',
    },
  ],
}

export const PRD_TEMPLATES: Record<PRDTemplateType, PRDTemplate> = {
  feature: FEATURE_TEMPLATE,
  bug_fix: BUG_FIX_TEMPLATE,
  enhancement: ENHANCEMENT_TEMPLATE,
}

export function getTemplate(type: PRDTemplateType): PRDTemplate {
  return PRD_TEMPLATES[type]
}

export function getRequiredSections(type: PRDTemplateType): PRDSection[] {
  return PRD_TEMPLATES[type].sections.filter((s) => s.required)
}

export function validatePRDSections(
  type: PRDTemplateType,
  content: Record<string, string>
): { valid: boolean; missingRequired: string[] } {
  const template = PRD_TEMPLATES[type]
  const missingRequired: string[] = []

  for (const section of template.sections) {
    if (section.required && (!content[section.id] || !content[section.id].trim())) {
      missingRequired.push(section.title)
    }
  }

  return {
    valid: missingRequired.length === 0,
    missingRequired,
  }
}

export function generateMarkdownFromSections(
  type: PRDTemplateType,
  title: string,
  content: Record<string, string>
): string {
  const template = PRD_TEMPLATES[type]
  const lines: string[] = []

  lines.push(`# ${title}`)
  lines.push('')
  lines.push(`**Type:** ${template.name}`)
  lines.push(`**Generated:** ${new Date().toISOString().split('T')[0]}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const section of template.sections) {
    const sectionContent = content[section.id]
    if (sectionContent && sectionContent.trim()) {
      lines.push(`## ${section.title}`)
      lines.push('')
      lines.push(sectionContent.trim())
      lines.push('')
    }
  }

  return lines.join('\n')
}

export function generateAIPromptForSection(
  type: PRDTemplateType,
  sectionId: string,
  context: {
    title: string
    description: string
    existingSections: Record<string, string>
  }
): string {
  const template = PRD_TEMPLATES[type]
  const section = template.sections.find((s) => s.id === sectionId)

  if (!section) {
    throw new Error(`Section ${sectionId} not found in template ${type}`)
  }

  const existingContext = Object.entries(context.existingSections)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => {
      const sec = template.sections.find((s) => s.id === key)
      return sec ? `### ${sec.title}\n${value}` : ''
    })
    .filter(Boolean)
    .join('\n\n')

  return `You are helping create a ${template.name} document.

**Document Title:** ${context.title}
**Description:** ${context.description}

${existingContext ? `**Existing Content:**\n${existingContext}\n\n` : ''}

**Task:** ${section.aiPrompt}

**Section:** ${section.title}

Please generate content for this section. Be specific, actionable, and professional. Use bullet points or numbered lists where appropriate. Do not include the section title in your response - just the content.`
}

export function generateFullPRDPrompt(
  type: PRDTemplateType,
  context: {
    title: string
    description: string
    additionalContext?: string
  }
): string {
  const template = PRD_TEMPLATES[type]

  const sectionPrompts = template.sections
    .map((s) => `- **${s.title}**: ${s.aiPrompt}`)
    .join('\n')

  return `Generate a comprehensive ${template.name} document.

**Title:** ${context.title}
**Description:** ${context.description}
${context.additionalContext ? `**Additional Context:** ${context.additionalContext}` : ''}

Create content for each of the following sections:
${sectionPrompts}

Output the document in clean markdown format with proper headings (##) for each section. Be specific, actionable, and professional throughout.`
}
