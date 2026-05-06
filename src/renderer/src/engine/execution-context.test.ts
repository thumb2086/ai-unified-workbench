import { describe, expect, it } from 'vitest'
import { ExecutionContext, renderTemplate } from './execution-context'

describe('execution context templates', () => {
  it('renders variables and leaves unknown tokens untouched', () => {
    const context = new ExecutionContext()
    context.setVariable('name', 'Hermes')

    expect(renderTemplate('Hello {{ name }} from {{ missing }}', context)).toBe('Hello Hermes from {{ missing }}')
  })

  it('renders node output references and object properties', () => {
    const context = new ExecutionContext()
    context.setNodeOutput('node-1', { summary: 'done' })
    context.setNodeOutput('node-2', 'plain')

    expect(renderTemplate('{{ node-1.summary }} then {{ node-2.output }}', context)).toBe('done then plain')
  })
})
