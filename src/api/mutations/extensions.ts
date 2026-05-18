export const FETCH_EXTENSIONS = `
  mutation FetchExtensions {
    fetchExtensions(input: {}) {
      extensions {
        apkName pkgName name lang versionName
        isInstalled isObsolete hasUpdate iconUrl
      }
    }
  }
`;

export const UPDATE_EXTENSION = `
  mutation UpdateExtension($id: String!, $install: Boolean, $uninstall: Boolean, $update: Boolean) {
    updateExtension(input: { id: $id, patch: { install: $install, uninstall: $uninstall, update: $update } }) {
      extension { apkName pkgName name isInstalled hasUpdate }
    }
  }
`;

export const UPDATE_EXTENSIONS = `
  mutation UpdateExtensions($ids: [String!]!, $install: Boolean, $uninstall: Boolean, $update: Boolean) {
    updateExtensions(input: { ids: $ids, patch: { install: $install, uninstall: $uninstall, update: $update } }) {
      extensions { apkName pkgName name isInstalled hasUpdate }
    }
  }
`;

export const INSTALL_EXTERNAL_EXTENSION = `
  mutation InstallExternalExtension($url: String!) {
    installExternalExtension(input: { extensionUrl: $url }) {
      extension { apkName pkgName name isInstalled }
    }
  }
`;

export const UPDATE_SOURCE_PREFERENCE = `
  mutation UpdateSourcePreference($source: LongString!, $change: SourcePreferenceChangeInput!) {
    updateSourcePreference(input: { source: $source, change: $change }) {
      source { id displayName }
    }
  }
`;

export const SET_SOURCE_METAS = `
  mutation SetSourceMetas($input: SetSourceMetasInput!) {
    setSourceMetas(input: $input) {
      metas { sourceId key value }
    }
  }
`;

export const DELETE_SOURCE_METAS = `
  mutation DeleteSourceMetas($input: DeleteSourceMetasInput!) {
    deleteSourceMetas(input: $input) {
      metas { sourceId key value }
    }
  }
`;

export const UPDATE_SOURCE_METADATA = `
  mutation UpdateSourceMetadata(
    $preUpdateDeleteInput: DeleteSourceMetasInput!
    $hasPreUpdateDeletions: Boolean!
    $updateInput: SetSourceMetasInput!
    $hasUpdates: Boolean!
    $postUpdateDeleteInput: DeleteSourceMetasInput!
    $hasPostUpdateDeletions: Boolean!
    $migrateInput: SetSourceMetasInput!
    $isMigration: Boolean!
  ) {
    preUpdateDeletedMeta: deleteSourceMetas(input: $preUpdateDeleteInput) @include(if: $hasPreUpdateDeletions) {
      metas { sourceId key value }
    }
    updatedMeta: setSourceMetas(input: $updateInput) @include(if: $hasUpdates) {
      metas { sourceId key value }
    }
    postUpdateDeletedMeta: deleteSourceMetas(input: $postUpdateDeleteInput) @include(if: $hasPostUpdateDeletions) {
      metas { sourceId key value }
    }
    migrationMeta: setSourceMetas(input: $migrateInput) @include(if: $isMigration) {
      metas { sourceId key value }
    }
  }
`;

export const SET_SOURCE_META = `
  mutation SetSourceMeta($sourceId: LongString!, $key: String!, $value: String!) {
    setSourceMeta(input: { meta: { sourceId: $sourceId, key: $key, value: $value } }) {
      meta { key value }
    }
  }
`;

export const DELETE_SOURCE_META = `
  mutation DeleteSourceMeta($sourceId: LongString!, $key: String!) {
    deleteSourceMeta(input: { sourceId: $sourceId, key: $key }) {
      meta { key value }
    }
  }
`;

export const SET_CATEGORY_META = `
  mutation SetCategoryMeta($categoryId: Int!, $key: String!, $value: String!) {
    setCategoryMeta(input: { meta: { categoryId: $categoryId, key: $key, value: $value } }) {
      meta { key value }
    }
  }
`;

export const DELETE_CATEGORY_META = `
  mutation DeleteCategoryMeta($categoryId: Int!, $key: String!) {
    deleteCategoryMeta(input: { categoryId: $categoryId, key: $key }) {
      meta { key value }
    }
  }
`;

export const SET_GLOBAL_META = `
  mutation SetGlobalMeta($key: String!, $value: String!) {
    setGlobalMeta(input: { meta: { key: $key, value: $value } }) {
      meta { key value }
    }
  }
`;

export const DELETE_GLOBAL_META = `
  mutation DeleteGlobalMeta($key: String!) {
    deleteGlobalMeta(input: { key: $key }) {
      meta { key value }
    }
  }
`;

export const CLEAR_CACHED_IMAGES = `
  mutation ClearCachedImages($cachedPages: Boolean, $cachedThumbnails: Boolean, $downloadedThumbnails: Boolean) {
    clearCachedImages(input: {
      cachedPages: $cachedPages
      cachedThumbnails: $cachedThumbnails
      downloadedThumbnails: $downloadedThumbnails
    }) {
      cachedPages cachedThumbnails downloadedThumbnails
    }
  }
`;

export const RESET_SETTINGS = `
  mutation ResetSettings {
    resetSettings(input: {}) {
      settings { extensionRepos }
    }
  }
`;

export const SET_EXTENSION_REPOS = `
  mutation SetExtensionRepos($repos: [String!]!) {
    setSettings(input: { settings: { extensionRepos: $repos } }) {
      settings { extensionRepos }
    }
  }
`;

export const SET_SERVER_AUTH = `
  mutation SetServerAuth($authMode: AuthMode!, $authUsername: String!, $authPassword: String!) {
    setSettings(input: { settings: { authMode: $authMode, authUsername: $authUsername, authPassword: $authPassword } }) {
      settings { authMode authUsername }
    }
  }
`;

export const SET_SOCKS_PROXY = `
  mutation SetSocksProxy(
    $socksProxyEnabled: Boolean!
    $socksProxyHost: String!
    $socksProxyPort: String!
    $socksProxyVersion: Int!
    $socksProxyUsername: String!
    $socksProxyPassword: String!
  ) {
    setSettings(input: { settings: {
      socksProxyEnabled: $socksProxyEnabled
      socksProxyHost: $socksProxyHost
      socksProxyPort: $socksProxyPort
      socksProxyVersion: $socksProxyVersion
      socksProxyUsername: $socksProxyUsername
      socksProxyPassword: $socksProxyPassword
    }}) {
      settings { socksProxyEnabled socksProxyHost socksProxyPort socksProxyVersion socksProxyUsername }
    }
  }
`;

export const SET_FLARESOLVERR = `
  mutation SetFlareSolverr(
    $flareSolverrEnabled: Boolean!
    $flareSolverrUrl: String!
    $flareSolverrTimeout: Int!
    $flareSolverrSessionName: String!
    $flareSolverrSessionTtl: Int!
    $flareSolverrAsResponseFallback: Boolean!
  ) {
    setSettings(input: { settings: {
      flareSolverrEnabled: $flareSolverrEnabled
      flareSolverrUrl: $flareSolverrUrl
      flareSolverrTimeout: $flareSolverrTimeout
      flareSolverrSessionName: $flareSolverrSessionName
      flareSolverrSessionTtl: $flareSolverrSessionTtl
      flareSolverrAsResponseFallback: $flareSolverrAsResponseFallback
    }}) {
      settings {
        flareSolverrEnabled flareSolverrUrl flareSolverrTimeout
        flareSolverrSessionName flareSolverrSessionTtl flareSolverrAsResponseFallback
      }
    }
  }
`;