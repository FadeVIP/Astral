'use strict';
// Maintainer-only tool; not included in the desktop application's build.
const fs = require('node:fs/promises');
const path = require('node:path');
const { GoogleAuth } = require('../../node_modules/google-auth-library');
const project = 'astral-524a1';
async function client() {
  const auth = new GoogleAuth({ keyFile: path.resolve(__dirname, '../../serviceAccountKey.json'), scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'] });
  return auth.getClient();
}
async function audit() {
  const api = await client();
  for (const [name, url] of [
    ['databases', `https://firestore.googleapis.com/v1/projects/${project}/databases`],
    ['auth', `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`],
    ['rules', `https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`]
  ]) {
    try {
      const { data } = await api.request({ url });
      if (name === 'auth') console.log(name, JSON.stringify({ emailEnabled: data.signIn?.email?.enabled, anonymousEnabled: data.signIn?.anonymous?.enabled, authorizedDomains: data.authorizedDomains }));
      else if (name === 'databases') console.log(name, JSON.stringify(data.databases?.map(db => ({ name: db.name, location: db.locationId, type: db.type })) || []));
      else {
        const rules = await api.request({ url: 'https://firebaserules.googleapis.com/v1/' + data.rulesetName });
        await fs.mkdir(path.resolve(__dirname, '../.test-data'), { recursive: true });
        await fs.writeFile(path.resolve(__dirname, '../.test-data/firestore-before.json'), JSON.stringify({ release: data, rules: rules.data }, null, 2));
        console.log(name, JSON.stringify(rules.data.source));
      }
    } catch (error) { console.log(name, 'ERROR', error.response?.status, error.response?.data?.error?.message || error.message); }
  }
}
if (require.main === module) audit().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { client, project };
