export const GET_ABOUT_SERVER = `
  query GetAboutServer {
    aboutServer {
      name version buildType buildTime github discord
    }
  }
`;

export const GET_ABOUT_WEBUI = `
  query GetAboutWebUI {
    aboutWebUI {
      channel tag updateTimestamp
    }
  }
`;

export const CHECK_FOR_SERVER_UPDATES = `
  query CheckForServerUpdates {
    checkForServerUpdates {
      channel tag url
    }
  }
`;