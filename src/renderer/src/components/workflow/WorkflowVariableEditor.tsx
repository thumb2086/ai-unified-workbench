import { useState, useEffect } from 'react'
import { WorkflowDefinition } from '../../types/workflow'
import './WorkflowVariableEditor.css'

interface WorkflowVariableEditorProps {
  workflow: WorkflowDefinition | null
  onVariablesChange: (variables: Record<string, string>) => void
}

/**
 * Extract variables from workflow ({{variableName}} syntax)
 */
function extractVariables(workflow: WorkflowDefinition): string[] {
  const variables = new Set<string>()
  
  workflow.nodes.forEach(node => {
    // Extract from prompt
    if (node.prompt) {
      const matches = node.prompt.match(/\{\{(\w+)\}\}/g)
      if (matches) {
        matches.forEach(match => {
          const varName = match.replace(/\{\{|\}\}/g, '')
          variables.add(varName)
        })
      }
    }
    
    // Extract from tool params
    if (node.tool?.params) {
      const paramsStr = JSON.stringify(node.tool.params)
      const matches = paramsStr.match(/\{\{(\w+)\}\}/g)
      if (matches) {
        matches.forEach(match => {
          const varName = match.replace(/\{\{|\}\}/g, '')
          variables.add(varName)
        })
      }
    }
  })
  
  return Array.from(variables)
}

/**
 * Get default values for common variables
 */
function getDefaultValue(varName: string): string {
  const defaults: Record<string, string> = {
    filePath: './src/example.ts',
    outputPath: './output.txt',
    reviewFilePath: './review.md',
    topic: 'AI ethics',
    prompt: 'Write a short story about AI',
    code: '// Paste your code here',
    story: 'Once upon a time...',
    summary: 'Summary will appear here'
  }
  return defaults[varName] || ''
}

export function WorkflowVariableEditor({ workflow, onVariablesChange }: WorkflowVariableEditorProps) {
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [varList, setVarList] = useState<string[]>([])
  
  useEffect(() => {
    if (workflow) {
      const extracted = extractVariables(workflow)
      setVarList(extracted)
      
      // Initialize with defaults
      const initialVars: Record<string, string> = {}
      extracted.forEach(v => {
        initialVars[v] = variables[v] || getDefaultValue(v)
      })
      setVariables(initialVars)
      onVariablesChange(initialVars)
    }
  }, [workflow])
  
  const handleVariableChange = (name: string, value: string) => {
    const newVars = { ...variables, [name]: value }
    setVariables(newVars)
    onVariablesChange(newVars)
  }
  
  if (!workflow || varList.length === 0) {
    return (
      <div className="workflow-variable-editor">
        <p className="no-variables">此 Workflow 無需自定義變數</p>
      </div>
    )
  }
  
  return (
    <div className="workflow-variable-editor">
      <h4>Workflow 變數設定</h4>
      <div className="variables-list">
        {varList.map(varName => (
          <div key={varName} className="variable-input">
            <label htmlFor={`var-${varName}`}>{varName}</label>
            <input
              id={`var-${varName}`}
              type="text"
              value={variables[varName] || ''}
              onChange={(e) => handleVariableChange(varName, e.target.value)}
              placeholder={getDefaultValue(varName)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
