export default {
  keySigner: {
    privateKey: process.env.DFNS_PKEY,
    credId: process.env.DFNS_SERVICE_CREDID,
    appOrigin: process.env.DFNS_APP_ORIGIN
  },
  apiClient: {
    appId: process.env.DFNS_APP_ID,
    baseUrl: 'https://api.dfns.ninja',
    authToken: process.env.DFNS_SERVICE_AUTHTOKEN
  }
}