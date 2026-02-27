import { z } from 'zod'

export const PRD_TEMPLATE = `
# Product Requirements Document

## Overview
{{overview}}

## Problem Statement
{{problem}}

## Goals and Objectives
{{goals}}

## User Stories
{{userStories}}

## Functional Requirements
{{requirements}}

## Non-Functional Requirements
{{nonFunctionalRequirements}}

## Out of Scope
{{outOfScope}}

## Success Metrics
{{metrics}}

## Timeline
{{timeline}}
`

export const PRDInputSchema = z.object({
  projectName: z.string().min(1, 'Project name is required'),
  description: z.string().min(1, 'Description is required'),
  targetUsers: z.string().min(1, 'Target users is required'),
  keyFeatures: z.array(z.string()).min(1, 'At least one key feature is required'),
  constraints: z.string().optional(),
  existingContext: z.string().optional(),
})

export type PRDInput = z.infer<typeof PRDInputSchema>

export function generatePRDPrompt(input: PRDInput): string {
  const constraintsSection = input.constraints 
    ? `\nConstraints/Limitations: ${input.constraints}` 
    : ''
  
  const contextSection = input.existingContext
    ? `\nExisting Context/Background: ${input.existingContext}`
    : ''

  return `Generate a comprehensive Product Requirements Document for:

Project: ${input.projectName}
Description: ${input.description}
Target Users: ${input.targetUsers}
Key Features: ${input.keyFeatures.join(', ')}${constraintsSection}${contextSection}

Use the following structure:
${PRD_TEMPLATE}

Guidelines:
1. Be specific and actionable in all sections
2. Include measurable acceptance criteria where applicable
3. User stories should follow the format: "As a [user type], I want [goal] so that [benefit]"
4. Functional requirements should be numbered and testable
5. Non-functional requirements should cover performance, security, scalability, and usability
6. Success metrics should be quantifiable where possible
7. Timeline should include major milestones

Output the PRD in clean markdown format.`
}

export function generatePRDRefinementPrompt(existingPRD: string, feedback: string): string {
  return `Refine the following PRD based on the feedback provided:

## Current PRD:
${existingPRD}

## Feedback:
${feedback}

Please update the PRD to address the feedback while maintaining the same structure. Output the complete updated PRD in markdown format.`
}

export function validatePRDContent(prd: string): { valid: boolean; issues: string[] } {
  const issues: string[] = []
  
  const requiredSections = [
    'Overview',
    'Problem Statement',
    'Goals',
    'User Stories',
    'Functional Requirements',
    'Non-Functional Requirements',
  ]
  
  for (const section of requiredSections) {
    if (!prd.toLowerCase().includes(section.toLowerCase())) {
      issues.push(`Missing section: ${section}`)
    }
  }
  
  if (prd.length < 500) {
    issues.push('PRD seems too short. Consider adding more detail.')
  }
  
  return {
    valid: issues.length === 0,
    issues,
  }
}
