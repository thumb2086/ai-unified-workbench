import { WorkflowDefinition, WorkflowNode } from '../types/workflow'

/**
 * DAG Parser - Parses workflow definitions and performs topological sorting
 */

export interface ParsedWorkflow {
  definition: WorkflowDefinition
  executionOrder: string[]  // Ordered node ids
  levels: Map<string, number>  // node id -> execution level (for parallel execution)
  dependencies: Map<string, Set<string>>  // node id -> set of dependency ids
  dependents: Map<string, Set<string>>  // node id -> set of dependent ids
}

/**
 * Parse a workflow definition and compute execution order
 */
export function parseWorkflow(definition: WorkflowDefinition): ParsedWorkflow {
  const nodes = new Map(definition.nodes.map(n => [n.id, n]))
  const dependencies = new Map<string, Set<string>>()
  const dependents = new Map<string, Set<string>>()

  // Build dependency graph
  for (const node of definition.nodes) {
    const deps = new Set(node.dependsOn || [])
    dependencies.set(node.id, deps)

    // Track reverse dependencies
    for (const depId of deps) {
      if (!dependents.has(depId)) {
        dependents.set(depId, new Set())
      }
      dependents.get(depId)!.add(node.id)
    }
  }

  // Topological sort with Kahn's algorithm
  const inDegree = new Map<string, number>()
  for (const [nodeId, deps] of dependencies) {
    inDegree.set(nodeId, deps.size)
  }

  const queue: string[] = []
  const levels = new Map<string, number>()

  // Start with nodes that have no dependencies
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId)
      levels.set(nodeId, 0)
    }
  }

  const executionOrder: string[] = []

  while (queue.length > 0) {
    const currentId = queue.shift()!
    executionOrder.push(currentId)

    const currentLevel = levels.get(currentId)!

    // Update in-degrees of dependents
    const deps = dependents.get(currentId)
    if (deps) {
      for (const dependentId of deps) {
        const newDegree = (inDegree.get(dependentId) || 0) - 1
        inDegree.set(dependentId, newDegree)

        if (newDegree === 0) {
          queue.push(dependentId)
          // Level is max of all dependencies + 1
          const parentLevel = levels.get(currentId)!
          levels.set(dependentId, Math.max(
            levels.get(dependentId) || 0,
            parentLevel + 1
          ))
        }
      }
    }
  }

  // Check for cycles
  if (executionOrder.length !== definition.nodes.length) {
    const remaining = definition.nodes
      .map(n => n.id)
      .filter(id => !executionOrder.includes(id))
    throw new Error(`Workflow has circular dependencies. Unable to order: ${remaining.join(', ')}`)
  }

  return {
    definition,
    executionOrder,
    levels,
    dependencies,
    dependents
  }
}

/**
 * Get nodes that can execute in parallel at a given level
 */
export function getNodesAtLevel(parsed: ParsedWorkflow, level: number): string[] {
  const nodes: string[] = []
  for (const [nodeId, nodeLevel] of parsed.levels) {
    if (nodeLevel === level) {
      nodes.push(nodeId)
    }
  }
  return nodes
}

/**
 * Get the maximum execution level
 */
export function getMaxLevel(parsed: ParsedWorkflow): number {
  let max = 0
  for (const level of parsed.levels.values()) {
    max = Math.max(max, level)
  }
  return max
}

/**
 * Get immediate dependencies of a node
 */
export function getImmediateDependencies(parsed: ParsedWorkflow, nodeId: string): string[] {
  const deps = parsed.dependencies.get(nodeId)
  return deps ? Array.from(deps) : []
}

/**
 * Get all transitive dependencies of a node
 */
export function getAllDependencies(parsed: ParsedWorkflow, nodeId: string): string[] {
  const visited = new Set<string>()
  const stack: string[] = [nodeId]

  while (stack.length > 0) {
    const current = stack.pop()!
    if (visited.has(current)) continue
    visited.add(current)

    const deps = parsed.dependencies.get(current)
    if (deps) {
      for (const dep of deps) {
        if (!visited.has(dep)) {
          stack.push(dep)
        }
      }
    }
  }

  visited.delete(nodeId)
  return Array.from(visited)
}

/**
 * Validate a workflow definition
 */
export function validateWorkflow(definition: WorkflowDefinition): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const nodeIds = new Set(definition.nodes.map(n => n.id))

  // Check entry point exists
  if (!nodeIds.has(definition.entryPoint)) {
    errors.push(`Entry point '${definition.entryPoint}' not found in nodes`)
  }

  // Check all dependencies exist
  for (const node of definition.nodes) {
    for (const depId of node.dependsOn || []) {
      if (!nodeIds.has(depId)) {
        errors.push(`Node '${node.id}' has unknown dependency '${depId}'`)
      }
    }
  }

  // Check for cycles
  try {
    parseWorkflow(definition)
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.message)
    }
  }

  // Validate node-specific requirements
  for (const node of definition.nodes) {
    if (node.type === 'agent' && !node.agent) {
      errors.push(`Node '${node.id}' of type 'agent' missing agent configuration`)
    }
    if (node.type === 'prompt' && !node.prompt) {
      errors.push(`Node '${node.id}' of type 'prompt' missing prompt text`)
    }
    if (node.type === 'tool' && !node.tool) {
      errors.push(`Node '${node.id}' of type 'tool' missing tool configuration`)
    }
    if (node.type === 'condition' && !node.condition) {
      errors.push(`Node '${node.id}' of type 'condition' missing condition configuration`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Create a simple linear workflow from prompts
 */
export function createLinearWorkflow(
  name: string,
  prompts: Array<{ prompt: string; provider?: string }>
): WorkflowDefinition {
  const nodes: WorkflowNode[] = prompts.map((p, index) => ({
    id: `node-${index}`,
    type: p.provider ? 'agent' : 'prompt',
    prompt: p.prompt,
    agent: p.provider ? { provider: p.provider } : undefined,
    dependsOn: index > 0 ? [`node-${index - 1}`] : undefined,
    outputVar: `output-${index}`
  }))

  return {
    id: `workflow-${Date.now()}`,
    name,
    version: '1.0',
    nodes,
    entryPoint: nodes[0]?.id || ''
  }
}
