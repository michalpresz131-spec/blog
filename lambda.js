const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm')
const serverless = require('serverless-http')

const ssm = new SSMClient({})
let appHandlerPromise

async function createAppHandler(){
  const result = await ssm.send(new GetParameterCommand({
    Name: process.env.BLOG_CONFIG_PARAMETER,
    WithDecryption: true
  }))
  const settings = JSON.parse(result.Parameter.Value)
  const required = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'ADMIN_PASSWORD']
  const missing = required.filter(name => !settings[name])
  if(missing.length) throw new Error(`Missing required blog settings: ${missing.join(', ')}`)
  Object.assign(process.env, settings)
  const app = require('./server.js')
  return serverless(app, {binary: ['image/*']})
}

exports.handler = async (event, context) => {
  appHandlerPromise ||= createAppHandler()
  return (await appHandlerPromise)(event, context)
}
