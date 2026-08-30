import type { ContentType } from '$lib/server-adapters/types'

export interface Source {
  id:              string
  name:            string
  lang:            string
  displayName:     string
  iconUrl:         string
  isNsfw:          boolean
  isConfigurable:  boolean
  supportsLatest:  boolean
  contentType:     ContentType
  extension?: { packageName: string }
}

export interface Extension {
  id:          string
  apkName:     string
  pkgName:     string
  name:        string
  lang:        string
  versionName: string
  isInstalled: boolean
  isObsolete:  boolean
  hasUpdate:   boolean
  iconUrl:     string
}