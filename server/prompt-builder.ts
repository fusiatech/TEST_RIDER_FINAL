import type { AgentRole, CLIProvider, Settings } from '@/lib/types'

/* ── Stage-specific prompt builders ──────────────────────────── */

export function buildResearchPrompt(
  userPrompt: string,
  depth: Settings['researchDepth']
): string {
  const depthGuidance =
    depth === 'deep'
      ? '\nBe extremely thorough. Check documentation, tests, configs, and related modules.'
      : depth === 'shallow'
        ? '\nFocus on the most directly relevant files only.'
        : ''

  return [
    'You are a research agent. Your job is to thoroughly research and gather context for the following task.',
    `Research depth: ${depth}`,
    '',
    `Task: ${userPrompt}`,
    '',
    'Instructions:',
    '- Analyze the codebase structure and relevant files',
    '- Identify dependencies, patterns, and constraints',
    '- List all relevant files that need to be examined',
    '- Summarize your findings clearly',
    '- Do NOT make any code changes',
    depthGuidance,
  ]
    .join('\n')
    .trimEnd()
}

export function buildPlanPrompt(
  userPrompt: string,
  researchContext: string
): string {
  return [
    'You are a planning agent. Your job is to produce a structured implementation plan based on the research findings below.',
    '',
    '## Research Context',
    researchContext,
    '',
    `## Original Task`,
    userPrompt,
    '',
    '## Your Deliverables',
    '1. A step-by-step implementation plan with clear ordering',
    '2. Files to modify or create (with rationale)',
    '3. Risks and edge cases to watch for',
    '4. Testing approach and acceptance criteria',
    '',
    'Be specific and actionable. Reference exact file paths where possible.',
  ].join('\n')
}

export function buildCodePrompt(
  userPrompt: string,
  planContext: string,
  agentIndex: number,
  totalCoders: number
): string {
  let approachDirective: string
  if (totalCoders === 1) {
    approachDirective = 'Implement the solution as described in the plan.'
  } else if (agentIndex === 0) {
    approachDirective = 'Implement the primary approach as described in the plan.'
  } else if (agentIndex === 1) {
    approachDirective = 'Implement an alternative approach. Consider different patterns, data structures, or algorithms where applicable.'
  } else {
    approachDirective = `Implement approach ${agentIndex + 1}, focusing on a different strategy than the other agents.`
  }

  return [
    `You are a coding agent (${agentIndex + 1} of ${totalCoders}). Your job is to write production-quality code.`,
    '',
    '## Plan',
    planContext,
    '',
    '## Original Task',
    userPrompt,
    '',
    '## Approach Directive',
    approachDirective,
    '',
    '## Guidelines',
    '- Write clean, well-typed code',
    '- Follow existing project conventions',
    '- Handle errors gracefully',
    '- Include comments only where logic is non-obvious',
  ].join('\n')
}

export function buildValidatePrompt(
  userPrompt: string,
  codeOutputs: string[]
): string {
  const outputBlocks = codeOutputs
    .map(
      (output, i) =>
        `### Code Output ${i + 1}\n${output}`
    )
    .join('\n\n')

  return [
    'You are a validation agent. Your job is to review code changes and verify their correctness.',
    '',
    '## Original Task',
    userPrompt,
    '',
    '## Code Outputs to Review',
    outputBlocks,
    '',
    '## Your Checklist',
    '- Check for bugs, off-by-one errors, and logic mistakes',
    '- Verify edge cases are handled',
    '- Look for type errors or unsafe casts',
    '- Confirm the changes actually address the original request',
    '- Rate confidence in the solution: high / medium / low',
    '- List specific concerns with file and line references where possible',
  ].join('\n')
}

export function buildSecurityPrompt(
  userPrompt: string,
  codeOutputs: string[]
): string {
  const outputBlocks = codeOutputs
    .map(
      (output, i) =>
        `### Code Output ${i + 1}\n${output}`
    )
    .join('\n\n')

  return [
    'You are a security review agent. Your job is to identify security vulnerabilities in the proposed code changes.',
    '',
    '## Original Task',
    userPrompt,
    '',
    '## Code Outputs to Review',
    outputBlocks,
    '',
    '## Security Checklist',
    '- Check for injection vulnerabilities (SQL, XSS, command injection)',
    '- Review dependency safety (known CVEs, suspicious packages)',
    '- Check for exposed secrets, tokens, or credentials',
    '- Verify input validation and sanitization',
    '- Check for common security anti-patterns (eval, dangerouslySetInnerHTML, etc.)',
    '- Review authentication and authorization logic if present',
    '- Flag any use of deprecated or insecure APIs',
  ].join('\n')
}

export function buildSynthesizePrompt(
  userPrompt: string,
  allStageOutputs: string[],
  confidence: number
): string {
  const outputBlocks = allStageOutputs
    .map(
      (output, i) =>
        `### Stage Output ${i + 1}\n${output}`
    )
    .join('\n\n')

  return [
    'You are the synthesizer agent. Your job is to merge all previous agent outputs into a single, coherent, final response.',
    '',
    `## Confidence Score: ${confidence}/100`,
    '',
    '## Original Task',
    userPrompt,
    '',
    '## All Stage Outputs',
    outputBlocks,
    '',
    '## Your Deliverables',
    '- Merge the best parts of all agent outputs into one clean response',
    '- Resolve any disagreements between agents (prefer the majority view unless a minority view is clearly better-reasoned)',
    '- Produce a complete, ready-to-apply solution',
    '- Include a brief confidence assessment explaining the score',
    '- List sources and file references used',
  ].join('\n')
}

/* ── CLI adaptation ──────────────────────────────────────────── */

export function adaptPromptForCLI(
  prompt: string,
  provider: CLIProvider
): string {
  switch (provider) {
    case 'gemini':
      return `${prompt}\n\nRespond in plain text.`
    case 'copilot':
      return `-- ${prompt}`
    case 'cursor':
    case 'claude':
    case 'codex':
    case 'rovo':
    case 'custom':
      return prompt
  }
}

/* ── Master builder ──────────────────────────────────────────── */

export interface BuildStagePromptsParams {
  userPrompt: string
  role: AgentRole
  agentCount: number
  previousOutputs: string[]
  settings: Settings
  agentIndex?: number
}

export function buildStagePrompts(params: BuildStagePromptsParams): string[] {
  const { userPrompt, role, agentCount, previousOutputs, settings, agentIndex } = params
  const prompts: string[] = []

  for (let i = 0; i < agentCount; i++) {
    const idx = agentIndex ?? i
    let prompt: string

    switch (role) {
      case 'researcher':
        prompt = buildResearchPrompt(userPrompt, settings.researchDepth)
        break
      case 'planner':
        prompt = buildPlanPrompt(userPrompt, previousOutputs.join('\n\n'))
        break
      case 'coder':
        prompt = buildCodePrompt(
          userPrompt,
          previousOutputs.join('\n\n'),
          idx,
          agentCount
        )
        break
      case 'validator':
        prompt = buildValidatePrompt(userPrompt, previousOutputs)
        break
      case 'security':
        prompt = buildSecurityPrompt(userPrompt, previousOutputs)
        break
      case 'synthesizer':
        prompt = buildSynthesizePrompt(userPrompt, previousOutputs, 50)
        break
    }

    prompts.push(prompt)
  }

  return prompts
}
