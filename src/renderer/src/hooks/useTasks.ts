import { useCallback } from 'react'
import type { Task, TaskResponse } from '../types'
import { uid, now } from '../utils/helpers'

export function useTasks(tasks: Task[], setTasks: React.Dispatch<React.SetStateAction<Task[]>>, selectedTaskId: string | null) {
  const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? tasks[0] ?? null

  const createTask = useCallback((title: string, prompt: string, mode: Task['mode'], providerIds: string[]) => {
    const timestamp = now()
    const task: Task = {
      id: uid('task'),
      title: title.trim() || '未命名任務',
      prompt: prompt.trim(),
      mode,
      status: 'active',
      providerIds,
      createdAt: timestamp,
      updatedAt: timestamp,
      responses: [],
      summary: '',
    }
    setTasks(prev => [task, ...prev])
    return task.id
  }, [setTasks])

  const updateTask = useCallback((taskId: string, updater: (task: Task) => Task) => {
    setTasks(prev => prev.map(t => t.id === taskId ? updater(t) : t))
  }, [setTasks])

  const saveResponse = useCallback((taskId: string, providerId: string, content: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t
      const responses = t.responses.filter(r => r.providerId !== providerId)
      return {
        ...t,
        responses: [...responses, { providerId, content, updatedAt: now() }],
        updatedAt: now(),
      }
    }))
  }, [setTasks])

  const deleteTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }, [setTasks])

  const setTaskStatus = useCallback((taskId: string, status: Task['status']) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status, updatedAt: now() } : t))
  }, [setTasks])

  return {
    selectedTask,
    createTask,
    updateTask,
    saveResponse,
    deleteTask,
    setTaskStatus,
  }
}
