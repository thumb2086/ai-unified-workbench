import { useState, useCallback } from 'react'
import { WorkflowDefinition, WorkflowExecutionResult, WorkflowContext } from '../../types/workflow'
import { executeWorkflow } from '../../engine/workflow-engine'
import { validateWorkflow } from '../../engine/dag-parser'
import { WorkflowVariableEditor } from './WorkflowVariableEditor'
import { WorkflowVisualEditor } from './WorkflowVisualEditor'
import './WorkflowRunner.css'

interface WorkflowRunnerProps {
  workflow: WorkflowDefinition | null
  onComplete?: (result: WorkflowExecutionResult) => void
}

export function WorkflowRunner({ workflow, onComplete }: WorkflowRunnerProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<WorkflowContext | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [result, setResult] = useState<WorkflowExecutionResult | null>(null)
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [activeView, setActiveView] = useState<'editor' | 'runner'>('editor')

  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
  }, [])

  const runWorkflow = useCallback(async () => {
    if (!workflow) return

    // Validate first
    const validation = validateWorkflow(workflow)
    if (!validation.valid) {
      addLog(`Validation failed: ${validation.errors.join(', ')}`)
      return
    }

    setIsRunning(true)
    setLogs([])
    setResult(null)
    addLog('Starting workflow execution...')

    const executionResult = await executeWorkflow(workflow, {
      variables,
      onNodeStart: (nodeId) => {
        addLog(`Node ${nodeId} started`)
      },
      onNodeComplete: (nodeId, result) => {
        addLog(`Node ${nodeId} completed`)
        console.log(`Node ${nodeId} result:`, result)
      },
      onNodeError: (nodeId, error) => {
        addLog(`Node ${nodeId} failed: ${error}`)
      },
      onProgress: (context) => {
        setProgress(context)
      }
    })

    setResult(executionResult)
    setIsRunning(false)

    if (executionResult.success) {
      addLog('Workflow completed successfully')
      addLog(`Final output: ${JSON.stringify(executionResult.finalOutput, null, 2).substring(0, 200)}...`)
    } else {
      addLog(`Workflow failed: ${executionResult.error}`)
    }

    onComplete?.(executionResult)
  }, [workflow, onComplete, addLog])

  const getNodeStatusCount = () => {
    if (!progress) return { pending: 0, running: 0, completed: 0, failed: 0, skipped: 0 }
    const counts = { pending: 0, running: 0, completed: 0, failed: 0, skipped: 0 }
    for (const status of progress.status.values()) {
      if (status in counts) {
        (counts as Record<string, number>)[status]++
      }
    }
    return counts
  }

  const statusCount = getNodeStatusCount()

  if (!workflow) {
    return (
      <div className="workflow-runner">
        <div className="empty-state">
          <p>沒有載入的 Workflow</p>
        </div>
      </div>
    )
  }

  return (
    <div className="workflow-runner">
      <div className="runner-header">
        <h3>{workflow.name}</h3>
        <div className="runner-actions">
          <div className="view-tabs">
            <button 
              className={activeView === 'editor' ? 'active' : ''}
              onClick={() => setActiveView('editor')}
            >
              🎨 Editor
            </button>
            <button 
              className={activeView === 'runner' ? 'active' : ''}
              onClick={() => setActiveView('runner')}
            >
              ▶️ Runner
            </button>
          </div>
          <button
            onClick={runWorkflow}
            disabled={isRunning}
            className="btn-run"
          >
            {isRunning ? '執行中...' : '執行 Workflow'}
          </button>
        </div>
      </div>

      {activeView === 'editor' ? (
        <WorkflowVisualEditor 
          workflow={workflow}
          onWorkflowChange={(w) => console.log('Workflow updated:', w)}
        />
      ) : (
        <>
          <WorkflowVariableEditor 
            workflow={workflow} 
            onVariablesChange={setVariables} 
          />

          <div className="runner-stats">
            <div className="stat">
              <span className="stat-label">待執行:</span>
              <span className="stat-value pending">{statusCount.pending}</span>
            </div>
            <div className="stat">
              <span className="stat-label">執行中:</span>
              <span className="stat-value running">{statusCount.running}</span>
            </div>
            <div className="stat">
              <span className="stat-label">已完成:</span>
              <span className="stat-value completed">{statusCount.completed}</span>
            </div>
            <div className="stat">
              <span className="stat-label">失敗:</span>
              <span className="stat-value failed">{statusCount.failed}</span>
            </div>
          </div>

      <div className="runner-logs">
        <h4>執行日誌</h4>
        <div className="logs-container">
          {logs.length === 0 ? (
            <p className="no-logs">尚未開始執行</p>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="log-line">
                {log}
              </div>
            ))
          )}
        </div>
      </div>

      {result && (
        <div className={`runner-result ${result.success ? 'success' : 'error'}`}>
          <h4>執行結果</h4>
          <p>{result.success ? '✅ 成功' : '❌ 失敗'}</p>
          {result.error && <p className="error-message">{result.error}</p>}
        </div>
      )}
        </>
      )}
    </div>
  )
}
