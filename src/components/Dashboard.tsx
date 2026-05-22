'use client'

import { useState, useMemo } from 'react'
import { Project } from '@/types'
import { Search, RefreshCw, Star, Calendar } from 'lucide-react'
import { GithubIcon } from '@/components/icons/GithubIcon'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const mapTechToDevicon = (tech: string) => {
  const t = tech.toLowerCase()
  if (t.includes('react')) return 'devicon-react-original'
  if (t.includes('next')) return 'devicon-nextjs-original'
  if (t.includes('node') || t.includes('express')) return 'devicon-nodejs-plain'
  if (t.includes('typescript') || t === 'ts') return 'devicon-typescript-plain'
  if (t.includes('javascript') || t === 'js') return 'devicon-javascript-plain'
  if (t.includes('python')) return 'devicon-python-plain'
  if (t.includes('go')) return 'devicon-go-original-wordmark'
  if (t.includes('rust')) return 'devicon-rust-original'
  if (t.includes('postgres') || t.includes('sql')) return 'devicon-postgresql-plain'
  if (t.includes('tailwind')) return 'devicon-tailwindcss-original'
  if (t.includes('html')) return 'devicon-html5-plain'
  if (t.includes('css')) return 'devicon-css3-plain'
  return null
}

export default function Dashboard({ initialProjects }: { initialProjects: Project[] }) {
  const [projects] = useState<Project[]>(initialProjects)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'updated' | 'stars' | 'name'>('updated')
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)

  const handleSync = async () => {
    setIsSyncing(true)
    setSyncMessage('')
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncMessage(`Synced ${data.syncedCount} projects. Refreshing...`)
        // In a real app, we would re-fetch projects from Supabase here
        window.location.reload()
      } else {
        setSyncMessage(`Error: ${data.error}`)
      }
    } catch (e) {
      setSyncMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleAIProcess = async (projectId: string) => {
    setProcessingId(projectId)
    try {
      const res = await fetch('/api/process-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      if (res.ok) {
        window.location.reload()
      } else {
        const err = await res.json()
        alert('Failed to generate summary: ' + (err.error || err.message || 'Unknown error'))
      }
    } catch (e) {
      console.error(e)
      alert('Network error while processing.')
    } finally {
      setProcessingId(null)
    }
  }

  const filteredAndSorted = useMemo(() => {
    const result = projects.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (p.technologies || []).some(t => t.toLowerCase().includes(search.toLowerCase()))
    )

    result.sort((a, b) => {
      if (sort === 'updated') {
        const dateA = a.pushed_at || a.updated_at
        const dateB = b.pushed_at || b.updated_at
        return new Date(dateB).getTime() - new Date(dateA).getTime()
      }
      if (sort === 'stars') return b.stargazers_count - a.stargazers_count
      if (sort === 'name') return a.name.localeCompare(b.name)
      return 0
    })

    return result
  }, [projects, search, sort])

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-zinc-800">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
              Repfolio
            </h1>
            <p className="text-zinc-400 mt-2">Manage and query your GitHub portfolio.</p>
          </div>
          <div className="flex items-center gap-4">
            {syncMessage && <span className="text-sm text-zinc-400">{syncMessage}</span>}
            <Button
              onClick={handleSync}
              disabled={isSyncing}
              className="bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-500/20"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync GitHub
            </Button>
          </div>
        </header>

        {/* Controls Section */}
        <section className="flex flex-col md:flex-row gap-4 items-center justify-between bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50 backdrop-blur-sm">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search projects, technologies..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-zinc-600"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            <Button variant={sort === 'updated' ? 'default' : 'secondary'} onClick={() => setSort('updated')} className="rounded-xl whitespace-nowrap">
              Recently Updated
            </Button>
            <Button variant={sort === 'stars' ? 'default' : 'secondary'} onClick={() => setSort('stars')} className="rounded-xl whitespace-nowrap">
              Most Stars
            </Button>
            <Button variant={sort === 'name' ? 'default' : 'secondary'} onClick={() => setSort('name')} className="rounded-xl whitespace-nowrap">
              Alphabetical
            </Button>
          </div>
        </section>

        {/* Grid Section */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredAndSorted.map(project => (
            <div key={project.id} className="group flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300 relative overflow-hidden">

              {/* Background gradient effect on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <div className="relative z-10 flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <Link href={`/project/${project.id}`} className="text-xl font-bold hover:text-indigo-400 transition-colors">
                    {project.name}
                  </Link>
                  <a href={project.html_url} target="_blank" rel="noreferrer" className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-white">
                    <GithubIcon className="w-4 h-4" />
                  </a>
                </div>
                <div className="flex items-center gap-1 text-zinc-400 bg-zinc-950 px-2 py-1 rounded-md text-sm border border-zinc-800">
                  <Star className="w-3.5 h-3.5 text-yellow-500" /> {project.stargazers_count}
                </div>
              </div>

              {project.summary ? (
                <p className="text-zinc-300 text-sm leading-relaxed mb-6 flex-grow">
                  {project.summary}
                </p>
              ) : (
                <div className="mb-6 flex-grow flex flex-col justify-center items-start gap-2">
                  <p className="text-zinc-500 text-sm italic">{project.description || 'No description available.'}</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleAIProcess(project.id)} 
                    disabled={processingId === project.id}
                    className="text-xs mt-2 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    {processingId === project.id ? (
                      <><RefreshCw className="w-3 h-3 mr-2 animate-spin" /> Processing...</>
                    ) : (
                      <>✨ Generate AI Summary</>
                    )}
                  </Button>
                </div>
              )}

              <div className="mt-auto pt-4 border-t border-zinc-800/50 relative z-10">
                <div className="flex justify-between items-center">
                  <div className="flex flex-wrap gap-2">
                    {project.technologies && project.technologies.length > 0 ? (
                      project.technologies.slice(0, 5).map(tech => {
                        const iconClass = mapTechToDevicon(tech)
                        return (
                          <div key={tech} className="group/tooltip relative flex items-center justify-center w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition-colors">
                            {iconClass ? (
                              <i className={`${iconClass} text-lg`}></i>
                            ) : (
                              <span className="text-[10px] font-mono text-zinc-400">{tech.substring(0, 2).toUpperCase()}</span>
                            )}
                            {/* Tooltip */}
                            <span className="absolute -top-8 bg-zinc-800 text-xs px-2 py-1 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                              {tech}
                            </span>
                          </div>
                        )
                      })
                    ) : (
                      project.language && (
                        <div className="flex items-center gap-1 text-xs text-zinc-400">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          {project.language}
                        </div>
                      )
                    )}
                  </div>

                  <div className="flex items-center text-xs text-zinc-500">
                    <Calendar className="w-3.5 h-3.5 mr-1" />
                    {new Date(project.pushed_at || project.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

            </div>
          ))}

          {filteredAndSorted.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-center bg-zinc-900/30 border border-zinc-800 border-dashed rounded-2xl">
              <GithubIcon className="w-12 h-12 text-zinc-600 mb-4" />
              <h3 className="text-xl font-medium text-zinc-300">No projects found</h3>
              <p className="text-zinc-500 mt-2 max-w-md">Try syncing your GitHub account or adjusting your search filters to see your repositories.</p>
              <Button onClick={handleSync} variant="outline" className="mt-6 border-zinc-700">
                <RefreshCw className="w-4 h-4 mr-2" /> Sync Now
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
