const fs = require('fs')
const path = require('path')
const _ = require('lodash')

/* eslint camelcase: "off" */

const create_event_table = getTemplate('create_event_table')
const create_id_map_table = getTemplate('create_id_map_table')
const create_eventpack_table = getTemplate('create_eventpack_table')
const create_search_table = getTemplate('create_search_table')
const create_snapshot_table = getTemplate('create_snapshot_table')
const insert_event = getTemplate('insert_event')
const insert_eventpack = getTemplate('insert_eventpack')
const insert_snapshot = getTemplate('insert_snapshot')
const select_aggregate_id = getTemplate('select_aggregate_id')
const select_eventpack = getTemplate('select_eventpack')
const select_events_since_date = getTemplate('select_events_since_date')
const select_events_since_id = getTemplate('select_events_since_id')
const select_snapshot = getTemplate('select_snapshot')
const select_snapshot_by_lastEventDate = getTemplate('select_snapshot_baseline_by_lastevent_date')
const select_snapshot_by_lastEventId = getTemplate('select_snapshot_baseline_by_lastevent_id')
const select_system_id = getTemplate('select_system_id')
const set_id_map = getTemplate('set_id_map')
const set_search_fields = getTemplate('set_search_fields')

const templates = {
  create_event_table,
  create_eventpack_table,
  create_id_map_table,
  create_search_table,
  create_snapshot_table,
  insert_event,
  insert_eventpack,
  insert_snapshot,
  select_aggregate_id,
  select_eventpack,
  select_events_since_date,
  select_events_since_id,
  select_snapshot,
  select_snapshot_by_lastEventDate,
  select_snapshot_by_lastEventId,
  select_system_id,
  set_id_map,
  set_search_fields
}

function getTemplate (name) {
  return _.template(fs.readFileSync(path.join(__dirname, './sql', `${name}.sql`)))
}

module.exports = function resolveTemplate (name, entity) {
  return templates[ name ]({ entity: entity })
}
