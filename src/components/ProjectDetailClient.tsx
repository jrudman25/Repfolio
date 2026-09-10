'use client'

import { useState } from 'react'
import { Project, Todo, Milestone } from '@/types'
import { CheckCircle2, Circle, Plus, Trash2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

// We need an instance of supabase client here if we want to mutate data
import { createClient } from '@/utils/supabase/client'

export default function ProjectDetailClient({ 
  project, 
  initialMilestones, 
  initialTodos 
}: { 
  project: Project, 
  initialMilestones: Milestone[], 
  initialTodos: Todo[] 
}) {
  const supabase = createClient()
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones)
  
  const [newTodo, setNewTodo] = useState('')
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTodo.trim()) return
    
    const { data } = await supabase.from('todos').insert({
      project_id: project.id,
      task: newTodo
    }).select().single()
    
    if (data) {
      setTodos([...todos, data])
      setNewTodo('')
    }
  }

  const handleToggleTodo = async (id: string, isCompleted: boolean) => {
    const { error } = await supabase.from('todos').update({ is_completed: !isCompleted }).eq('id', id)
    if (!error) {
      setTodos(todos.map(t => t.id === id ? { ...t, is_completed: !isCompleted } : t))
    }
  }

  const handleDeleteTodo = async (id: string) => {
    const { error } = await supabase.from('todos').delete().eq('id', id)
    if (!error) {
      setTodos(todos.filter(t => t.id !== id))
    }
  }

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMilestoneTitle.trim()) return
    
    const { data } = await supabase.from('milestones').insert({
      project_id: project.id,
      title: newMilestoneTitle,
      status: 'pending'
    }).select().single()
    
    if (data) {
      setMilestones([...milestones, data])
      setNewMilestoneTitle('')
    }
  }

  const handleToggleMilestone = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    const { error } = await supabase.from('milestones').update({ status: newStatus }).eq('id', id)
    if (!error) {
      setMilestones(milestones.map(m => m.id === id ? { ...m, status: newStatus } : m))
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <Link href="/" className="inline-flex items-center text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>

        <header className="pb-6 border-b border-zinc-800">
          <h1 className="text-4xl font-bold">{project.name}</h1>
          <p className="text-zinc-400 mt-2">{project.description}</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Milestones */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-2xl font-semibold mb-6 flex items-center justify-between">
              Milestones
            </h2>
            
            <div className="space-y-4 mb-6">
              {milestones.length === 0 ? (
                <p className="text-zinc-500 italic">No milestones yet.</p>
              ) : (
                milestones.map(milestone => (
                  <div key={milestone.id} className="flex items-start gap-3 p-3 bg-zinc-950 rounded-xl border border-zinc-800/50">
                    <button aria-label={`Complete milestone: ${milestone.title}`} aria-pressed={milestone.status === 'completed'} onClick={() => handleToggleMilestone(milestone.id, milestone.status)} className="mt-1 flex-shrink-0">
                      {milestone.status === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-zinc-500 hover:text-indigo-400 transition-colors" />
                      )}
                    </button>
                    <div>
                      <h3 className={`font-medium ${milestone.status === 'completed' ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                        {milestone.title}
                      </h3>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form aria-label="Add milestone" onSubmit={handleAddMilestone} className="flex gap-2">
              <input 
                type="text" 
                aria-label="New milestone"
                placeholder="New milestone..." 
                value={newMilestoneTitle}
                onChange={e => setNewMilestoneTitle(e.target.value)}
                className="flex-1 px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <Button type="submit" variant="secondary">Add</Button>
            </form>
          </div>

          {/* Todos */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-2xl font-semibold mb-6 flex items-center justify-between">
              To-Do List
            </h2>
            
            <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto pr-2">
              {todos.length === 0 ? (
                <p className="text-zinc-500 italic">No tasks yet.</p>
              ) : (
                todos.map(todo => (
                  <div key={todo.id} className="flex items-center justify-between group p-2 hover:bg-zinc-950 rounded-lg transition-colors">
                    <div className="flex items-center gap-3">
                      <button aria-label={`Complete task: ${todo.task}`} aria-pressed={todo.is_completed} onClick={() => handleToggleTodo(todo.id, todo.is_completed)}>
                        {todo.is_completed ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <Circle className="w-5 h-5 text-zinc-500 hover:text-indigo-400" />
                        )}
                      </button>
                      <span className={`${todo.is_completed ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                        {todo.task}
                      </span>
                    </div>
                    <button 
                      aria-label={`Delete task: ${todo.task}`}
                      onClick={() => handleDeleteTodo(todo.id)}
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 p-1 text-zinc-500 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <form aria-label="Add task" onSubmit={handleAddTodo} className="flex gap-2">
              <input 
                type="text" 
                aria-label="New task"
                placeholder="New task..." 
                value={newTodo}
                onChange={e => setNewTodo(e.target.value)}
                className="flex-1 px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <Button type="submit" variant="secondary"><Plus className="w-4 h-4 mr-1" /> Add</Button>
            </form>
          </div>

        </div>
      </div>
    </div>
  )
}
