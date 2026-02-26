import { runSwarmPipeline } from '../server/orchestrator'
import { DEFAULT_SETTINGS } from '../lib/types'

async function main() {
  console.log('=== SwarmUI Orchestrator E2E Test ===\n')
  
  // Test 1: Chat mode with custom CLI (echo)
  console.log('--- Test 1: Chat Mode with echo ---')
  const chatResult = await runSwarmPipeline({
    prompt: 'Hello World',
    settings: {
      ...DEFAULT_SETTINGS,
      enabledCLIs: ['custom'],
      customCLICommand: 'echo "Agent responding to: {PROMPT}"',
      parallelCounts: {
        researcher: 1, planner: 1, coder: 1,
        validator: 1, security: 1, synthesizer: 1,
      },
      maxRuntimeSeconds: 10,
    },
    projectPath: process.cwd(),
    mode: 'chat',
    onAgentOutput: (id, data) => {
      process.stdout.write(`  [${id}] ${data}`)
    },
    onAgentStatus: (id, status) => {
      console.log(`  [${id}] status: ${status}`)
    },
  })
  console.log('\nChat Result:', {
    output: chatResult.finalOutput.slice(0, 100),
    confidence: chatResult.confidence,
    agents: chatResult.agents.length,
    validation: chatResult.validationPassed,
  })
  
  // Test 2: Swarm mode with echo (2 parallel agents)
  console.log('\n--- Test 2: Swarm Mode with echo (2 coders) ---')
  const swarmResult = await runSwarmPipeline({
    prompt: 'Implement a hello world function',
    settings: {
      ...DEFAULT_SETTINGS,
      enabledCLIs: ['custom'],
      customCLICommand: 'echo "Agent output for: {PROMPT}"',
      parallelCounts: {
        researcher: 1, planner: 1, coder: 2,
        validator: 1, security: 1, synthesizer: 1,
      },
      maxRuntimeSeconds: 10,
      autoRerunThreshold: 80,
    },
    projectPath: process.cwd(),
    mode: 'swarm',
    onAgentOutput: (id, data) => {
      process.stdout.write(`  [${id}] ${data}`)
    },
    onAgentStatus: (id, status) => {
      console.log(`  [${id}] status: ${status}`)
    },
  })
  console.log('\nSwarm Result:', {
    output: swarmResult.finalOutput.slice(0, 200),
    confidence: swarmResult.confidence,
    agents: swarmResult.agents.length,
    sources: swarmResult.sources.length,
    validation: swarmResult.validationPassed,
  })
  
  // Test 3: Try with gemini CLI (will fail auth but proves the pipeline runs)
  console.log('\n--- Test 3: Chat Mode with gemini CLI (auth will fail) ---')
  try {
    const geminiResult = await runSwarmPipeline({
      prompt: 'What is 2+2?',
      settings: {
        ...DEFAULT_SETTINGS,
        enabledCLIs: ['gemini'],
        parallelCounts: {
          researcher: 1, planner: 1, coder: 1,
          validator: 1, security: 1, synthesizer: 1,
        },
        maxRuntimeSeconds: 10,
      },
      projectPath: process.cwd(),
      mode: 'chat',
      onAgentOutput: (id, data) => {
        process.stdout.write(`  [${id}] ${data}`)
      },
      onAgentStatus: (id, status) => {
        console.log(`  [${id}] status: ${status}`)
      },
    })
    console.log('\nGemini Result:', {
      output: geminiResult.finalOutput.slice(0, 200),
      confidence: geminiResult.confidence,
      agents: geminiResult.agents.length,
    })
  } catch (err) {
    console.log('Gemini test error (expected):', err instanceof Error ? err.message : String(err))
  }
  
  console.log('\n=== All tests complete ===')
}

main().catch(console.error)
