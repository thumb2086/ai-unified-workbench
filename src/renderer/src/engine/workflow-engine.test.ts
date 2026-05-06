import { describe, expect, it } from 'vitest'
import { WorkflowEngine } from './workflow-engine'
import type { WorkflowDefinition } from '../types/workflow'

describe('workflow engine outputVar chaining', () => {
  it('stores successful node results by node id and outputVar for later templates', async () => {
    const definition: WorkflowDefinition = {
      id: 'wf',
      name: 'Output Var Workflow',
      version: '1.0',
      entryPoint: 'first',
      nodes: [
        { id: 'first', type: 'prompt', prompt: 'alpha', outputVar: 'firstResult' },
        { id: 'second', type: 'prompt', prompt: 'chained {{ firstResult }}', dependsOn: ['first'], outputVar: 'secondResult' },
      ],
    }

    const engine = new WorkflowEngine({
      executors: {
        prompt: async (node) => node.prompt ?? '',
      },
    })

    const result = await engine.execute(definition)

    expect(result.success).toBe(true)
    expect(result.context.outputs.get('first')).toBe('alpha')
    expect(result.context.variables.get('firstResult')).toBe('alpha')
    expect(result.context.outputs.get('second')).toBe('chained alpha')
    expect(result.context.variables.get('secondResult')).toBe('chained alpha')
    expect(result.finalOutput).toBe('chained alpha')
  })
})
