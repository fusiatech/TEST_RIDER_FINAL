import { getDb } from './storage'
import type { PRDVersion, PRDSection, PRDSectionLink } from '@/lib/types'
import { createLogger } from './logger'

const logger = createLogger('prd-versioning')

interface PRDVersioningData {
  versions: Record<string, PRDVersion[]>
  sectionLinks: PRDSectionLink[]
}

let prdData: PRDVersioningData = {
  versions: {},
  sectionLinks: [],
}

async function loadPRDData(): Promise<void> {
  const db = await getDb()
  const data = db.data as unknown as Record<string, unknown>
  if (data.prdVersions) {
    prdData.versions = data.prdVersions as Record<string, PRDVersion[]>
  }
  if (data.prdSectionLinks) {
    prdData.sectionLinks = data.prdSectionLinks as PRDSectionLink[]
  }
}

async function savePRDData(): Promise<void> {
  const db = await getDb()
  const data = db.data as unknown as Record<string, unknown>
  data.prdVersions = prdData.versions
  data.prdSectionLinks = prdData.sectionLinks
  await db.write()
}

function parsePRDSections(content: string): PRDSection[] {
  const sections: PRDSection[] = []
  const lines = content.split('\n')
  
  interface SectionMarker {
    title: string
    startIndex: number
  }
  
  let currentSection: SectionMarker | null = null
  
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const match = line.match(/^##\s+(.+)$/)
    if (match) {
      if (currentSection) {
        const sectionContent = lines.slice(currentSection.startIndex + 1, index).join('\n').trim()
        sections.push({
          id: crypto.randomUUID(),
          title: currentSection.title,
          content: sectionContent,
          type: inferSectionType(currentSection.title),
          linkedTicketIds: [],
          linkedEpicIds: [],
        })
      }
      currentSection = { title: match[1], startIndex: index }
    }
  }
  
  if (currentSection) {
    const sectionContent = lines.slice(currentSection.startIndex + 1).join('\n').trim()
    sections.push({
      id: crypto.randomUUID(),
      title: currentSection.title,
      content: sectionContent,
      type: inferSectionType(currentSection.title),
      linkedTicketIds: [],
      linkedEpicIds: [],
    })
  }
  
  return sections
}

function inferSectionType(title: string): PRDSection['type'] {
  const titleLower = title.toLowerCase()
  if (titleLower.includes('problem') || titleLower.includes('challenge')) return 'problem'
  if (titleLower.includes('solution') || titleLower.includes('approach')) return 'solution'
  if (titleLower.includes('requirement') || titleLower.includes('feature')) return 'requirements'
  if (titleLower.includes('metric') || titleLower.includes('success') || titleLower.includes('kpi')) return 'metrics'
  if (titleLower.includes('constraint') || titleLower.includes('limitation')) return 'constraints'
  if (titleLower.includes('assumption')) return 'assumptions'
  if (titleLower.includes('risk')) return 'risks'
  if (titleLower.includes('timeline') || titleLower.includes('schedule') || titleLower.includes('milestone')) return 'timeline'
  if (titleLower.includes('stakeholder') || titleLower.includes('team')) return 'stakeholders'
  if (titleLower.includes('scope') || titleLower.includes('boundary')) return 'scope'
  return 'custom'
}

export async function createVersion(
  projectId: string,
  content: string,
  author: string,
  changeLog?: string
): Promise<PRDVersion> {
  await loadPRDData()
  
  if (!prdData.versions[projectId]) {
    prdData.versions[projectId] = []
  }
  
  const existingVersions = prdData.versions[projectId]
  const newVersionNumber = existingVersions.length > 0 
    ? Math.max(...existingVersions.map(v => v.version)) + 1 
    : 1
  
  const sections = parsePRDSections(content)
  
  if (existingVersions.length > 0) {
    const latestVersion = existingVersions[existingVersions.length - 1]
    sections.forEach(newSection => {
      const matchingOldSection = latestVersion.sections.find(
        oldSection => oldSection.title.toLowerCase() === newSection.title.toLowerCase()
      )
      if (matchingOldSection) {
        newSection.linkedTicketIds = [...matchingOldSection.linkedTicketIds]
        newSection.linkedEpicIds = [...matchingOldSection.linkedEpicIds]
      }
    })
  }
  
  const newVersion: PRDVersion = {
    version: newVersionNumber,
    content,
    sections,
    author,
    createdAt: Date.now(),
    changeLog: changeLog || `Version ${newVersionNumber} created`,
  }
  
  prdData.versions[projectId].push(newVersion)
  await savePRDData()
  
  logger.info('Created PRD version', { projectId, version: newVersionNumber, author })
  
  return newVersion
}

export async function getVersions(projectId: string): Promise<PRDVersion[]> {
  await loadPRDData()
  return prdData.versions[projectId] || []
}

export async function getVersion(projectId: string, version: number): Promise<PRDVersion | null> {
  await loadPRDData()
  const versions = prdData.versions[projectId] || []
  return versions.find(v => v.version === version) || null
}

export async function getLatestVersion(projectId: string): Promise<PRDVersion | null> {
  await loadPRDData()
  const versions = prdData.versions[projectId] || []
  if (versions.length === 0) return null
  return versions.reduce((latest, current) => 
    current.version > latest.version ? current : latest
  )
}

export interface VersionDiff {
  added: string[]
  removed: string[]
  modified: Array<{
    sectionTitle: string
    oldContent: string
    newContent: string
  }>
}

export async function compareVersions(
  projectId: string,
  v1: number,
  v2: number
): Promise<VersionDiff | null> {
  const version1 = await getVersion(projectId, v1)
  const version2 = await getVersion(projectId, v2)
  
  if (!version1 || !version2) {
    return null
  }
  
  const diff: VersionDiff = {
    added: [],
    removed: [],
    modified: [],
  }
  
  const v1Sections = new Map(version1.sections.map(s => [s.title.toLowerCase(), s]))
  const v2Sections = new Map(version2.sections.map(s => [s.title.toLowerCase(), s]))
  
  for (const [title, section] of v2Sections) {
    if (!v1Sections.has(title)) {
      diff.added.push(section.title)
    }
  }
  
  for (const [title, section] of v1Sections) {
    if (!v2Sections.has(title)) {
      diff.removed.push(section.title)
    }
  }
  
  for (const [title, v1Section] of v1Sections) {
    const v2Section = v2Sections.get(title)
    if (v2Section && v1Section.content !== v2Section.content) {
      diff.modified.push({
        sectionTitle: v2Section.title,
        oldContent: v1Section.content,
        newContent: v2Section.content,
      })
    }
  }
  
  return diff
}

export async function rollbackToVersion(
  projectId: string,
  targetVersion: number,
  author: string
): Promise<PRDVersion | null> {
  const targetVersionData = await getVersion(projectId, targetVersion)
  
  if (!targetVersionData) {
    logger.error('Version not found for rollback', { projectId, targetVersion })
    return null
  }
  
  const newVersion = await createVersion(
    projectId,
    targetVersionData.content,
    author,
    `Rolled back to version ${targetVersion}`
  )
  
  logger.info('Rolled back PRD version', { projectId, from: targetVersion, to: newVersion.version })
  
  return newVersion
}

export async function linkSectionToTicket(
  projectId: string,
  sectionId: string,
  ticketId: string,
  linkedBy?: string
): Promise<boolean> {
  await loadPRDData()
  
  const versions = prdData.versions[projectId]
  if (!versions || versions.length === 0) {
    return false
  }
  
  const latestVersion = versions[versions.length - 1]
  const section = latestVersion.sections.find(s => s.id === sectionId)
  
  if (!section) {
    return false
  }
  
  if (!section.linkedTicketIds.includes(ticketId)) {
    section.linkedTicketIds.push(ticketId)
    
    prdData.sectionLinks.push({
      sectionId,
      ticketId,
      linkedAt: Date.now(),
      linkedBy,
    })
    
    await savePRDData()
    logger.info('Linked section to ticket', { projectId, sectionId, ticketId })
  }
  
  return true
}

export async function unlinkSectionFromTicket(
  projectId: string,
  sectionId: string,
  ticketId: string
): Promise<boolean> {
  await loadPRDData()
  
  const versions = prdData.versions[projectId]
  if (!versions || versions.length === 0) {
    return false
  }
  
  const latestVersion = versions[versions.length - 1]
  const section = latestVersion.sections.find(s => s.id === sectionId)
  
  if (!section) {
    return false
  }
  
  const ticketIndex = section.linkedTicketIds.indexOf(ticketId)
  if (ticketIndex > -1) {
    section.linkedTicketIds.splice(ticketIndex, 1)
    
    prdData.sectionLinks = prdData.sectionLinks.filter(
      link => !(link.sectionId === sectionId && link.ticketId === ticketId)
    )
    
    await savePRDData()
    logger.info('Unlinked section from ticket', { projectId, sectionId, ticketId })
  }
  
  return true
}

export async function linkSectionToEpic(
  projectId: string,
  sectionId: string,
  epicId: string
): Promise<boolean> {
  await loadPRDData()
  
  const versions = prdData.versions[projectId]
  if (!versions || versions.length === 0) {
    return false
  }
  
  const latestVersion = versions[versions.length - 1]
  const section = latestVersion.sections.find(s => s.id === sectionId)
  
  if (!section) {
    return false
  }
  
  if (!section.linkedEpicIds.includes(epicId)) {
    section.linkedEpicIds.push(epicId)
    await savePRDData()
    logger.info('Linked section to epic', { projectId, sectionId, epicId })
  }
  
  return true
}

export async function unlinkSectionFromEpic(
  projectId: string,
  sectionId: string,
  epicId: string
): Promise<boolean> {
  await loadPRDData()
  
  const versions = prdData.versions[projectId]
  if (!versions || versions.length === 0) {
    return false
  }
  
  const latestVersion = versions[versions.length - 1]
  const section = latestVersion.sections.find(s => s.id === sectionId)
  
  if (!section) {
    return false
  }
  
  const epicIndex = section.linkedEpicIds.indexOf(epicId)
  if (epicIndex > -1) {
    section.linkedEpicIds.splice(epicIndex, 1)
    await savePRDData()
    logger.info('Unlinked section from epic', { projectId, sectionId, epicId })
  }
  
  return true
}

export async function getTicketsBySection(
  projectId: string,
  sectionId: string
): Promise<string[]> {
  await loadPRDData()
  
  const versions = prdData.versions[projectId]
  if (!versions || versions.length === 0) {
    return []
  }
  
  const latestVersion = versions[versions.length - 1]
  const section = latestVersion.sections.find(s => s.id === sectionId)
  
  return section?.linkedTicketIds || []
}

export async function getSectionByTicket(
  projectId: string,
  ticketId: string
): Promise<PRDSection | null> {
  await loadPRDData()
  
  const versions = prdData.versions[projectId]
  if (!versions || versions.length === 0) {
    return null
  }
  
  const latestVersion = versions[versions.length - 1]
  
  for (const section of latestVersion.sections) {
    if (section.linkedTicketIds.includes(ticketId)) {
      return section
    }
  }
  
  return null
}

export async function getSectionsByTicket(
  projectId: string,
  ticketId: string
): Promise<PRDSection[]> {
  await loadPRDData()
  
  const versions = prdData.versions[projectId]
  if (!versions || versions.length === 0) {
    return []
  }
  
  const latestVersion = versions[versions.length - 1]
  
  return latestVersion.sections.filter(section => 
    section.linkedTicketIds.includes(ticketId)
  )
}

export async function getSection(
  projectId: string,
  sectionId: string
): Promise<PRDSection | null> {
  await loadPRDData()
  
  const versions = prdData.versions[projectId]
  if (!versions || versions.length === 0) {
    return null
  }
  
  const latestVersion = versions[versions.length - 1]
  return latestVersion.sections.find(s => s.id === sectionId) || null
}

export async function getAllSections(projectId: string): Promise<PRDSection[]> {
  await loadPRDData()
  
  const versions = prdData.versions[projectId]
  if (!versions || versions.length === 0) {
    return []
  }
  
  const latestVersion = versions[versions.length - 1]
  return latestVersion.sections
}
