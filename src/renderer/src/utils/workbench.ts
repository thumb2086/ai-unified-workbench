import type { ProviderConfig } from '../types'
import type { AiNode, WorkflowBlueprint, BlueprintNode } from '../types/workbench'
import type { WorkflowDefinition, WorkflowNode } from '../types/workflow'

export function toProviderConfig(node: AiNode): ProviderConfig {
  return {
    id: node.id,
    name: node.name,
    type: node.kind,
    apiFormat: node.apiFormat,
    apiKey: node.apiKey,
    baseUrl: node.baseUrl,
    model: node.model,
    headers: node.headers,
    webUrl: node.webUrl,
  }
}

export function toWorkflowDefinition(workflow: WorkflowBlueprint): WorkflowDefinition {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    version: workflow.version,
    entryPoint: workflow.entryPoint,
    nodes: workflow.nodes.map(toWorkflowNode),
  }
}

export function toWorkflowNode(node: BlueprintNode): WorkflowNode {
  return {
    id: node.id,
    type: node.type,
    name: node.title,
    description: node.description,
    prompt: node.prompt,
    dependsOn: node.dependsOn,
    outputVar: node.outputVar,
    position: node.position,
    aiNodeId: node.aiNodeId,
    agent: node.type === 'agent'
      ? {
          aiNodeId: node.aiNodeId,
          provider: undefined,
          role: node.title,
        }
      : undefined,
    tool: node.tool,
    condition: node.condition,
  }
}
