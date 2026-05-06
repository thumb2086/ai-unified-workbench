import { describe, expect, it } from 'vitest'
import { parseWorkflow, validateWorkflow } from './dag-parser'
import type { WorkflowDefinition } from '../types/workflow'

function workflow(nodes: WorkflowDefinition['nodes']): WorkflowDefinition {
  return {
    id: 'wf',
    name: 'Test Workflow',
    version: '1.0',
    entryPoint: nodes[0]?.id ?? '',
    nodes,
  }
}

describe('dag parser validation', () => {
  it('rejects unknown dependencies with a focused error', () => {
    const definition = workflow([
      { id: 'start', type: 'prompt', prompt: 'start' },
      { id: 'next', type: 'prompt', prompt: 'next', dependsOn: ['missing'] },
    ])

    expect(() => parseWorkflow(definition)).toThrow("Node 'next' has unknown dependency 'missing'")
    expect(validateWorkflow(definition).errors).toContain("Node 'next' has unknown dependency 'missing'")
  })

  it('rejects cycles', () => {
    const definition = workflow([
      { id: 'a', type: 'prompt', prompt: 'a', dependsOn: ['b'] },
      { id: 'b', type: 'prompt', prompt: 'b', dependsOn: ['a'] },
    ])

    expect(() => parseWorkflow(definition)).toThrow(/circular dependencies/i)
    expect(validateWorkflow(definition).valid).toBe(false)
  })
})
