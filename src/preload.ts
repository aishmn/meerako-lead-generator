import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi } from './lib/ipc';

const api: AppApi = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },

  dashboard: {
    getMetrics: () => ipcRenderer.invoke('dashboard:getMetrics'),
  },

  leads: {
    list:         (params)      => ipcRenderer.invoke('leads:list', params),
    getById:      (id)          => ipcRenderer.invoke('leads:getById', id),
    create:       (payload)     => ipcRenderer.invoke('leads:create', payload),
    update:       (id, payload) => ipcRenderer.invoke('leads:update', id, payload),
    deleteMany:   (ids)         => ipcRenderer.invoke('leads:deleteMany', ids),
    bulkStatus:   (ids, status) => ipcRenderer.invoke('leads:bulkStatus', ids, status),
    exportCsv:    (ids)         => ipcRenderer.invoke('leads:exportCsv', ids),
    importCsv:    (rows)        => ipcRenderer.invoke('leads:importCsv', rows),
    searchGlobal: (query)       => ipcRenderer.invoke('leads:searchGlobal', query),
  },

  notes: {
    list:   (leadId)          => ipcRenderer.invoke('notes:list', leadId),
    add:    (leadId, content) => ipcRenderer.invoke('notes:add', leadId, content),
    remove: (noteId)          => ipcRenderer.invoke('notes:remove', noteId),
  },

  events: {
    list: (leadId) => ipcRenderer.invoke('events:list', leadId),
  },

  osm: {
    search:     (params) => ipcRenderer.invoke('osm:search', params),
    categories: ()       => ipcRenderer.invoke('osm:categories'),
  },

  jobs: {
    list:    ()   => ipcRenderer.invoke('jobs:list'),
    getById: (id) => ipcRenderer.invoke('jobs:getById', id),
    cancel:  (id) => ipcRenderer.invoke('jobs:cancel', id),
  },

  tags: {
    list:           ()                  => ipcRenderer.invoke('tags:list'),
    listForLead:    (leadId)            => ipcRenderer.invoke('tags:listForLead', leadId),
    addToLead:      (leadId, tagId)     => ipcRenderer.invoke('tags:addToLead', leadId, tagId),
    removeFromLead: (leadId, tagId)     => ipcRenderer.invoke('tags:removeFromLead', leadId, tagId),
  },

  settings: {
    get:    ()        => ipcRenderer.invoke('settings:get'),
    update: (payload) => ipcRenderer.invoke('settings:update', payload),
  },
};

contextBridge.exposeInMainWorld('leadforge', api);
