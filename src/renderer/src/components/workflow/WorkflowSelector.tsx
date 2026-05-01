import { useState, useEffect } from 'react'
import { WorkflowDefinition } from '../../types/workflow'
import './WorkflowSelector.css'

const SAMPLE_WORKFLOWS: WorkflowDefinition[] = [
  {
    id: 'simple-prompt',
    name: 'Simple Prompt Chain',
    version: '1.0',
    entryPoint: 'node-1',
    nodes: [
      {
        id: 'node-1',
        type: 'prompt',
        prompt: 'Write a short story about AI',
        outputVar: 'story'
      },
      {
        id: 'node-2',
        type: 'prompt',
        prompt: 'Summarize this story: {{story}}',
        dependsOn: ['node-1'],
        outputVar: 'summary'
      }
    ]
  },
  {
    id: 'multi-agent-debate',
    name: 'Multi-Agent Debate',
    version: '1.0',
    entryPoint: 'question',
    nodes: [
      {
        id: 'question',
        type: 'prompt',
        prompt: 'What are the ethical implications of AI?',
        outputVar: 'topic'
      },
      {
        id: 'gemini-view',
        type: 'agent',
        agent: { provider: 'gemini', role: 'proponent' },
        prompt: 'Argue FOR this topic: {{topic}}',
        dependsOn: ['question'],
        outputVar: 'gemini-argument'
      },
      {
        id: 'chatgpt-view',
        type: 'agent',
        agent: { provider: 'chatgpt', role: 'opponent' },
        prompt: 'Argue AGAINST this topic: {{topic}}',
        dependsOn: ['question'],
        outputVar: 'chatgpt-argument'
      },
      {
        id: 'merge',
        type: 'merge',
        dependsOn: ['gemini-view', 'chatgpt-view'],
        outputVar: 'combined'
      }
    ]
  },
  {
    id: 'code-review',
    name: 'Code Review Workflow',
    version: '1.0',
    entryPoint: 'read-file',
    nodes: [
      {
        id: 'read-file',
        type: 'tool',
        tool: { name: 'fsRead', params: { filePath: './src/example.ts' } },
        outputVar: 'code'
      },
      {
        id: 'analyze',
        type: 'agent',
        agent: { provider: 'claude', role: 'reviewer' },
        prompt: 'Review this code for bugs and improvements:\n{{code}}',
        dependsOn: ['read-file'],
        outputVar: 'review'
      },
      {
        id: 'save-review',
        type: 'tool',
        tool: { name: 'fsWrite', params: { filePath: './review.md', content: '{{review}}' } },
        dependsOn: ['analyze']
      }
    ]
  }
]

interface WorkflowSelectorProps {
  onSelect: (workflow: WorkflowDefinition) => void
  selected: WorkflowDefinition | null
}

export function WorkflowSelector({ onSelect, selected }: WorkflowSelectorProps) {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>(SAMPLE_WORKFLOWS)
  const [isLoading, setIsLoading] = useState(false)

  // Load workflows from IPC (would come from filesystem in production)
  useEffect(() => {
    const loadWorkflows = async () => {
      setIsLoading(true)
      try {
        const result = await window.aiWorkbench.listWorkflows()
        if (result.success && Array.isArray(result.data)) {
          // In a real implementation, we would load each workflow
          // For now, use the sample workflows
          console.log('Available workflows:', result.data)
        }
      } catch (e) {
        console.log('Using sample workflows')
      } finally {
        setIsLoading(false)
      }
    }

    loadWorkflows()
  }, [])

  return (
    <div className="workflow-selector">
      <h4>選擇 Workflow</h4>
      
      {isLoading ? (
        <p>載入中...</p>
      ) : (
        <div className="workflow-list">
          {workflows.map(workflow => (
            <div
              key={workflow.id}
              className={`workflow-item ${selected?.id === workflow.id ? 'selected' : ''}`}
              onClick={() => onSelect(workflow)}
            >
              <div className="workflow-name">{workflow.name}</div>
              <div className="workflow-meta">
                <span>{workflow.nodes.length} nodes</span>
                <span>v{workflow.version}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
