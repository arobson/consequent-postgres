import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function interpolateTemplate(template: string, entity: string): string {
  return template.replace(/<%=\s*entity\s*%>/g, entity)
}

const templateCache = new Map<string, string>()

const templateNames = [
  'create_event_table',
  'create_eventpack_table',
  'create_id_map_table',
  'create_search_table',
  'create_snapshot_table',
  'insert_event',
  'insert_eventpack',
  'insert_snapshot',
  'select_aggregate_id',
  'select_eventpack',
  'select_events_since_date',
  'select_events_since_id',
  'select_snapshot',
  'select_snapshot_baseline_by_lastevent_date',
  'select_snapshot_baseline_by_lastevent_id',
  'select_system_id',
  'set_id_map',
  'set_search_fields'
] as const

// Pre-load all templates at module initialization
for (const name of templateNames) {
  const templatePath = path.join(__dirname, 'sql', `${name}.sql`)
  templateCache.set(name, fs.readFileSync(templatePath, 'utf-8'))
}

export type TemplateName = typeof templateNames[number]

export function resolveTemplate(name: TemplateName, entity: string): string {
  const template = templateCache.get(name)
  if (!template) {
    throw new Error(`Template '${name}' not found`)
  }
  return interpolateTemplate(template, entity)
}
