targetScope = 'resourceGroup'

@description('A short lowercase resource prefix. Deploy only after checking regional quota and cost.')
@minLength(3)
@maxLength(20)
param name string = 'prism-demo-standard'
param location string = resourceGroup().location
@description('Preserve existing storage and identity locations when relocating stateless compute.')
param statefulLocation string = resourceGroup().location
@description('Use a fresh name for a regional replacement while the old environment finishes deletion.')
param environmentName string = '${name}-env'
@description('Public immutable image reference, preferably ghcr.io/owner/prism-ai@sha256:...')
param image string
param githubAppId string
param githubClientId string
param githubAppSlug string
@allowed(['gemini', 'groq', 'mistral', 'xai'])
param aiProvider string
param aiModel string
@allowed([0, 1])
@description('At most one transient provider retry, sharing the original request deadline.')
param aiMaxRetries int = 1
@allowed(['legacy', 'python-agent'])
@description('Explicit opt-in. Existing queued jobs retain their recorded engine.')
param reviewEngine string = 'legacy'
@description('Immutable Python image reference; required when reviewEngine is python-agent.')
param agentImage string = ''
@description('Explicit Gemini model for the Python service; no provider fallback.')
param agentModel string = ''
@secure()
param agentServiceToken string = ''
@secure()
param agentApiKey string = ''
@secure()
@description('Required keys: mongoUri, sessionEncryptionKey, githubPrivateKey, githubClientSecret, webhookSecret, aiApiKey. Never commit the parameter file.')
param credentials object

resource environment 'Microsoft.App/managedEnvironments@2026-07-01' = {
  name: environmentName
  location: location
  properties: {
    // Jobs require a standard environment; Express does not support them.
    environmentMode: 'WorkloadProfiles'
    // Omit log routing: the ARM API rejects the CLI's literal 'none' value.
    // No Log Analytics workspace or diagnostic settings are provisioned.
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'prism${uniqueString(resourceGroup().id)}'
  location: statefulLocation
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
  }
}
resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storage
  name: 'default'
}
resource queue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: 'prism-reviews'
}
resource apiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${name}-api'
  location: statefulLocation
}
resource workerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${name}-worker'
  location: statefulLocation
}
resource apiSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(queue.id, apiIdentity.id, 'sender')
  scope: queue
  properties: {
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'c6a89b2d-59bc-44d0-9896-0f6e12d7b80a')
  }
}
resource workerProcessor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(queue.id, workerIdentity.id, 'processor')
  scope: queue
  properties: {
    principalId: workerIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8a0f0c08-91a1-4084-bc3d-661d67233fed')
  }
}
resource scalerReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(queue.id, workerIdentity.id, 'reader')
  scope: queue
  properties: {
    principalId: workerIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '19e7f393-937e-4f77-808e-94535e297925')
  }
}

var origin = 'https://${name}-web.${environment.properties.defaultDomain}'
var commonEnv = [
  { name: 'NODE_ENV', value: 'production' }
  { name: 'APP_ORIGIN', value: origin }
  { name: 'REVIEW_EXECUTION', value: 'queue' }
  { name: 'REVIEW_ENGINE', value: reviewEngine }
  { name: 'AZURE_REVIEW_QUEUE_URL', value: '${storage.properties.primaryEndpoints.queue}${queue.name}' }
  { name: 'MONGODB_URI', secretRef: 'mongo' }
  { name: 'SESSION_ENCRYPTION_KEY', secretRef: 'session-key' }
  { name: 'GITHUB_APP_ID', value: githubAppId }
  { name: 'GITHUB_APP_SLUG', value: githubAppSlug }
  { name: 'GITHUB_APP_PRIVATE_KEY', secretRef: 'github-key' }
  { name: 'REVIEW_MONTHLY_LIMIT', value: '20' }
]
var commonSecrets = [
  { name: 'mongo', value: credentials.mongoUri }
  { name: 'session-key', value: credentials.sessionEncryptionKey }
  { name: 'github-key', value: credentials.githubPrivateKey }
]

resource api 'Microsoft.App/containerApps@2025-07-01' = {
  name: '${name}-web'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${apiIdentity.id}': {} }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, targetPort: 5000, transport: 'auto', allowInsecure: false }
      secrets: concat(commonSecrets, [
        { name: 'oauth-secret', value: credentials.githubClientSecret }
        { name: 'webhook-secret', value: credentials.webhookSecret }
      ])
    }
    template: {
      containers: [{
        name: 'api'
        image: image
        command: ['node', 'server/src/server.js']
        // A modest active allocation reduces startup work while keeping the idle minimum at zero.
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: concat(commonEnv, [
          { name: 'AZURE_CLIENT_ID', value: apiIdentity.properties.clientId }
          { name: 'PORT', value: '5000' }
          { name: 'GITHUB_APP_CLIENT_ID', value: githubClientId }
          { name: 'GITHUB_APP_CLIENT_SECRET', secretRef: 'oauth-secret' }
          { name: 'GITHUB_WEBHOOK_SECRET', secretRef: 'webhook-secret' }
        ])
        probes: [
          { type: 'Startup', httpGet: { path: '/api/health', port: 5000 }, periodSeconds: 1, failureThreshold: 150 }
          { type: 'Readiness', httpGet: { path: '/api/health', port: 5000 }, periodSeconds: 2, failureThreshold: 3 }
          { type: 'Liveness', httpGet: { path: '/api/health', port: 5000 }, periodSeconds: 30, failureThreshold: 3 }
        ]
      }]
      scale: {
        minReplicas: 0
        maxReplicas: 1
        cooldownPeriod: 900
        rules: [{ name: 'http', http: { metadata: { concurrentRequests: '10' } } }]
      }
    }
  }
  dependsOn: [apiSender]
}

var providerKeyNames = { gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY', mistral: 'MISTRAL_API_KEY', xai: 'XAI_API_KEY' }
var providerModelNames = { gemini: 'GEMINI_MODEL', groq: 'GROQ_MODEL', mistral: 'MISTRAL_MODEL', xai: 'XAI_MODEL' }
var enableAgent = reviewEngine == 'python-agent'
var agentUrl = 'https://${name}-agent.internal.${environment.properties.defaultDomain}'

// Private inference boundary: no Mongo/GitHub credentials or durable state.
resource agent 'Microsoft.App/containerApps@2025-07-01' = if (enableAgent) {
  name: '${name}-agent'
  location: location
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: false, targetPort: 8090, transport: 'http', allowInsecure: false }
      secrets: [
        { name: 'agent-token', value: agentServiceToken }
        { name: 'gemini-key', value: agentApiKey }
      ]
    }
    template: {
      containers: [{
        name: 'agent'
        image: agentImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [
          { name: 'PRISM_AGENT_SERVICE_TOKEN', secretRef: 'agent-token' }
          { name: 'GEMINI_API_KEY', secretRef: 'gemini-key' }
          { name: 'PRISM_AGENT_MODEL', value: agentModel }
        ]
        probes: [
          { type: 'Startup', httpGet: { path: '/health', port: 8090 }, periodSeconds: 2, failureThreshold: 60 }
          { type: 'Readiness', httpGet: { path: '/health', port: 8090 }, periodSeconds: 5, failureThreshold: 3 }
        ]
      }]
      scale: { minReplicas: 0, maxReplicas: 1, rules: [{ name: 'http', http: { metadata: { concurrentRequests: '1' } } }] }
    }
  }
}

resource worker 'Microsoft.App/jobs@2025-07-01' = {
  name: '${name}-worker'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${workerIdentity.id}': {} }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Event'
      replicaTimeout: 600
      replicaRetryLimit: 0
      secrets: concat(commonSecrets, [{ name: 'ai-key', value: credentials.aiApiKey }], enableAgent ? [{ name: 'agent-token', value: agentServiceToken }] : [])
      eventTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
        scale: {
          minExecutions: 0
          // This caps starts per polling interval, not total concurrent jobs.
          maxExecutions: 1
          pollingInterval: 30
          rules: [{
            name: 'reviews'
            type: 'azure-queue'
            identity: workerIdentity.id
            metadata: { accountName: storage.name, queueName: queue.name, queueLength: '1' }
          }]
        }
      }
    }
    template: {
      containers: [{
        name: 'worker'
        image: image
        command: ['node', 'server/scripts/review-worker.js']
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: concat(commonEnv, [
          { name: 'AZURE_CLIENT_ID', value: workerIdentity.properties.clientId }
          { name: 'AI_PROVIDER', value: aiProvider }
          { name: providerKeyNames[aiProvider], secretRef: 'ai-key' }
          { name: providerModelNames[aiProvider], value: aiModel }
          { name: 'AI_MAX_RETRIES', value: string(aiMaxRetries) }
          { name: 'GEMINI_TIMEOUT_MS', value: '120000' }
        ], enableAgent ? [
          { name: 'PRISM_AGENT_URL', value: agentUrl }
          { name: 'PRISM_AGENT_SERVICE_TOKEN', secretRef: 'agent-token' }
        ] : [])
      }]
    }
  }
  // Provision the private inference boundary before a newly enabled worker can call it.
  dependsOn: [workerProcessor, scalerReader, agent]
}

output appOrigin string = origin
output apiName string = api.name
output workerName string = worker.name
output agentName string = enableAgent ? '${name}-agent' : ''
