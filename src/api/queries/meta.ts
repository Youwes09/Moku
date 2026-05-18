export const GET_META = `
  query GetMeta($key: String!) {
    meta(key: $key) {
      key value
    }
  }
`;

export const GET_METAS = `
  query GetMetas {
    metas {
      nodes { key value }
    }
  }
`;