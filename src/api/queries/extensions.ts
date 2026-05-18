export const GET_LOCAL_MANGA = `
  query GetLocalManga {
    mangas(condition: { sourceId: "0" }) {
      nodes { id title thumbnailUrl inLibrary }
    }
  }
`;

export const GET_EXTENSIONS = `
  query GetExtensions {
    extensions {
      nodes {
        apkName pkgName name lang versionName
        isInstalled isObsolete hasUpdate iconUrl
      }
    }
  }
`;

export const GET_SOURCES = `
  query GetSources {
    sources {
      nodes {
        id name lang displayName iconUrl isNsfw
        isConfigurable supportsLatest
        extension { pkgName }
      }
    }
  }
`;

export const GET_SOURCE_SETTINGS = `
  query GetSourceSettings($id: LongString!) {
    source(id: $id) {
      id
      displayName
      preferences {
        ... on CheckBoxPreference {
          type: __typename
          CheckBoxTitle: title
          CheckBoxSummary: summary
          CheckBoxDefault: default
          CheckBoxCurrentValue: currentValue
          key
        }
        ... on SwitchPreference {
          type: __typename
          SwitchPreferenceTitle: title
          SwitchPreferenceSummary: summary
          SwitchPreferenceDefault: default
          SwitchPreferenceCurrentValue: currentValue
          key
        }
        ... on ListPreference {
          type: __typename
          ListPreferenceTitle: title
          ListPreferenceSummary: summary
          ListPreferenceDefault: default
          ListPreferenceCurrentValue: currentValue
          entries
          entryValues
          key
        }
        ... on EditTextPreference {
          type: __typename
          EditTextPreferenceTitle: title
          EditTextPreferenceSummary: summary
          EditTextPreferenceDefault: default
          EditTextPreferenceCurrentValue: currentValue
          dialogTitle
          dialogMessage
          key
        }
        ... on MultiSelectListPreference {
          type: __typename
          MultiSelectListPreferenceTitle: title
          MultiSelectListPreferenceSummary: summary
          MultiSelectListPreferenceDefault: default
          MultiSelectListPreferenceCurrentValue: currentValue
          entries
          entryValues
          key
        }
      }
    }
  }
`;

export const GET_MIGRATABLE_SOURCES = `
  query GetMigratableSources {
    mangas(condition: { inLibrary: true }) {
      nodes {
        sourceId
        source {
          id name lang displayName iconUrl isNsfw isConfigurable supportsLatest
        }
      }
    }
  }
`;

export const GET_SETTINGS = `
  query GetSettings {
    settings { extensionRepos }
  }
`;

export const GET_SERVER_SECURITY = `
  query GetServerSecurity {
    settings {
      authMode authUsername
      socksProxyEnabled socksProxyHost socksProxyPort socksProxyVersion socksProxyUsername
      flareSolverrEnabled flareSolverrUrl flareSolverrTimeout
      flareSolverrSessionName flareSolverrSessionTtl flareSolverrAsResponseFallback
    }
  }
`;