'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { 
  Link2, 
  Unlink, 
  ExternalLink, 
  FileText, 
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Ticket,
  FolderKanban,
} from 'lucide-react'
import type { PRDSection, Ticket as TicketType, Epic } from '@/lib/types'
import { cn } from '@/lib/utils'

interface PRDSectionLinksProps {
  projectId: string
  sections?: PRDSection[]
  tickets?: TicketType[]
  epics?: Epic[]
  onNavigateToTicket?: (ticketId: string) => void
  onNavigateToEpic?: (epicId: string) => void
  className?: string
}

export function PRDSectionLinks({
  projectId,
  sections: initialSections,
  tickets: initialTickets,
  epics: initialEpics,
  onNavigateToTicket,
  onNavigateToEpic,
  className,
}: PRDSectionLinksProps) {
  const [sections, setSections] = useState<PRDSection[]>(initialSections || [])
  const [tickets, setTickets] = useState<TicketType[]>(initialTickets || [])
  const [epics, setEpics] = useState<Epic[]>(initialEpics || [])
  const [loading, setLoading] = useState(!initialSections)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [linkingSection, setLinkingSection] = useState<string | null>(null)
  const [linkType, setLinkType] = useState<'ticket' | 'epic'>('ticket')

  const fetchData = useCallback(async () => {
    if (initialSections && initialTickets && initialEpics) return
    
    try {
      setLoading(true)
      
      const [sectionsRes, projectRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/prd/sections`),
        fetch(`/api/projects/${projectId}`),
      ])
      
      if (sectionsRes.ok) {
        const sectionsData = await sectionsRes.json()
        setSections(sectionsData.sections || [])
      }
      
      if (projectRes.ok) {
        const projectData = await projectRes.json()
        setTickets(projectData.tickets || [])
        setEpics(projectData.epics || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [projectId, initialSections, initialTickets, initialEpics])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (initialSections) setSections(initialSections)
    if (initialTickets) setTickets(initialTickets)
    if (initialEpics) setEpics(initialEpics)
  }, [initialSections, initialTickets, initialEpics])

  const handleLinkTicket = async (sectionId: string, ticketId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/prd/sections/${sectionId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      })
      
      if (!res.ok) throw new Error('Failed to link ticket')
      
      setSections(prev => prev.map(section => {
        if (section.id === sectionId) {
          return {
            ...section,
            linkedTicketIds: [...section.linkedTicketIds, ticketId],
          }
        }
        return section
      }))
      
      setLinkingSection(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link ticket')
    }
  }

  const handleUnlinkTicket = async (sectionId: string, ticketId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/prd/sections/${sectionId}/unlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      })
      
      if (!res.ok) throw new Error('Failed to unlink ticket')
      
      setSections(prev => prev.map(section => {
        if (section.id === sectionId) {
          return {
            ...section,
            linkedTicketIds: section.linkedTicketIds.filter(id => id !== ticketId),
          }
        }
        return section
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink ticket')
    }
  }

  const handleLinkEpic = async (sectionId: string, epicId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/prd/sections/${sectionId}/link-epic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicId }),
      })
      
      if (!res.ok) throw new Error('Failed to link epic')
      
      setSections(prev => prev.map(section => {
        if (section.id === sectionId) {
          return {
            ...section,
            linkedEpicIds: [...section.linkedEpicIds, epicId],
          }
        }
        return section
      }))
      
      setLinkingSection(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link epic')
    }
  }

  const handleUnlinkEpic = async (sectionId: string, epicId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/prd/sections/${sectionId}/unlink-epic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicId }),
      })
      
      if (!res.ok) throw new Error('Failed to unlink epic')
      
      setSections(prev => prev.map(section => {
        if (section.id === sectionId) {
          return {
            ...section,
            linkedEpicIds: section.linkedEpicIds.filter(id => id !== epicId),
          }
        }
        return section
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink epic')
    }
  }

  const toggleSectionExpanded = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const getTicketById = (id: string) => tickets.find(t => t.id === id)
  const getEpicById = (id: string) => epics.find(e => e.id === id)

  const getUnlinkedTickets = (section: PRDSection) => 
    tickets.filter(t => !section.linkedTicketIds.includes(t.id))

  const getUnlinkedEpics = (section: PRDSection) => 
    epics.filter(e => !section.linkedEpicIds.includes(e.id))

  const getSectionTypeColor = (type: PRDSection['type']) => {
    const colors: Record<PRDSection['type'], string> = {
      problem: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
      solution: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
      requirements: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
      metrics: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
      constraints: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
      assumptions: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400',
      risks: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
      timeline: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400',
      stakeholders: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-400',
      scope: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400',
      custom: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    }
    return colors[type] || colors.custom
  }

  if (loading) {
    return (
      <div className={cn('p-4', className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="h-24 bg-muted rounded" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('p-4 text-destructive', className)}>
        {error}
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          PRD Section Links
        </h3>
        <span className="text-sm text-muted-foreground">
          {sections.length} section{sections.length !== 1 ? 's' : ''}
        </span>
      </div>

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No PRD sections found. Create a PRD to see sections here.
        </p>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => {
            const isExpanded = expandedSections.has(section.id)
            const linkedTicketCount = section.linkedTicketIds.length
            const linkedEpicCount = section.linkedEpicIds.length
            const totalLinks = linkedTicketCount + linkedEpicCount
            
            return (
              <div
                key={section.id}
                className="border rounded-lg overflow-hidden"
              >
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
                  onClick={() => toggleSectionExpanded(section.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{section.title}</span>
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded capitalize',
                          getSectionTypeColor(section.type)
                        )}>
                          {section.type}
                        </span>
                      </div>
                      {totalLinks > 0 && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          {linkedTicketCount > 0 && (
                            <span className="flex items-center gap-1">
                              <Ticket className="h-3 w-3" />
                              {linkedTicketCount} ticket{linkedTicketCount !== 1 ? 's' : ''}
                            </span>
                          )}
                          {linkedEpicCount > 0 && (
                            <span className="flex items-center gap-1">
                              <FolderKanban className="h-3 w-3" />
                              {linkedEpicCount} epic{linkedEpicCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation()
                      setLinkingSection(section.id)
                      setLinkType('ticket')
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Link
                  </Button>
                </div>

                {isExpanded && (
                  <div className="border-t p-3 bg-muted/30 space-y-4">
                    <div className="text-sm text-muted-foreground line-clamp-3">
                      {section.content || 'No content'}
                    </div>

                    {linkedTicketCount > 0 && (
                      <div>
                        <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Ticket className="h-4 w-4" />
                          Linked Tickets
                        </h5>
                        <div className="space-y-2">
                          {section.linkedTicketIds.map((ticketId) => {
                            const ticket = getTicketById(ticketId)
                            if (!ticket) return null
                            
                            return (
                              <div
                                key={ticketId}
                                className="flex items-center justify-between p-2 bg-background rounded border"
                              >
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    'text-xs px-2 py-0.5 rounded',
                                    ticket.status === 'done' && 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
                                    ticket.status === 'in_progress' && 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
                                    ticket.status === 'backlog' && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                                  )}>
                                    {ticket.status}
                                  </span>
                                  <span className="text-sm font-medium">{ticket.title}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onNavigateToTicket?.(ticketId)}
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleUnlinkTicket(section.id, ticketId)}
                                  >
                                    <Unlink className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {linkedEpicCount > 0 && (
                      <div>
                        <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <FolderKanban className="h-4 w-4" />
                          Linked Epics
                        </h5>
                        <div className="space-y-2">
                          {section.linkedEpicIds.map((epicId) => {
                            const epic = getEpicById(epicId)
                            if (!epic) return null
                            
                            return (
                              <div
                                key={epicId}
                                className="flex items-center justify-between p-2 bg-background rounded border"
                              >
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    'text-xs px-2 py-0.5 rounded',
                                    epic.status === 'completed' && 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
                                    epic.status === 'active' && 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
                                    epic.status === 'draft' && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                                  )}>
                                    {epic.status}
                                  </span>
                                  <span className="text-sm font-medium">{epic.title}</span>
                                  <span className="text-xs text-muted-foreground">
                                    ({epic.ticketIds.length} tickets)
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onNavigateToEpic?.(epicId)}
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleUnlinkEpic(section.id, epicId)}
                                  >
                                    <Unlink className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {totalLinks === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No linked items. Click "Link" to connect tickets or epics.
                      </p>
                    )}
                  </div>
                )}

                {linkingSection === section.id && (
                  <div className="border-t p-3 bg-primary/5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Link to:</span>
                        <select
                          className="bg-background border rounded px-2 py-1 text-sm"
                          value={linkType}
                          onChange={(e) => setLinkType(e.target.value as 'ticket' | 'epic')}
                        >
                          <option value="ticket">Ticket</option>
                          <option value="epic">Epic</option>
                        </select>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setLinkingSection(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {linkType === 'ticket' ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {getUnlinkedTickets(section).length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            All tickets are already linked to this section.
                          </p>
                        ) : (
                          getUnlinkedTickets(section).map((ticket) => (
                            <div
                              key={ticket.id}
                              className="flex items-center justify-between p-2 bg-background rounded border hover:bg-muted/50 cursor-pointer"
                              onClick={() => handleLinkTicket(section.id, ticket.id)}
                            >
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  'text-xs px-2 py-0.5 rounded',
                                  ticket.complexity === 'S' && 'bg-green-100 text-green-700',
                                  ticket.complexity === 'M' && 'bg-blue-100 text-blue-700',
                                  ticket.complexity === 'L' && 'bg-amber-100 text-amber-700',
                                  ticket.complexity === 'XL' && 'bg-red-100 text-red-700'
                                )}>
                                  {ticket.complexity}
                                </span>
                                <span className="text-sm">{ticket.title}</span>
                              </div>
                              <Plus className="h-4 w-4 text-muted-foreground" />
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {getUnlinkedEpics(section).length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            All epics are already linked to this section.
                          </p>
                        ) : (
                          getUnlinkedEpics(section).map((epic) => (
                            <div
                              key={epic.id}
                              className="flex items-center justify-between p-2 bg-background rounded border hover:bg-muted/50 cursor-pointer"
                              onClick={() => handleLinkEpic(section.id, epic.id)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{epic.title}</span>
                                <span className="text-xs text-muted-foreground">
                                  ({epic.ticketIds.length} tickets)
                                </span>
                              </div>
                              <Plus className="h-4 w-4 text-muted-foreground" />
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
