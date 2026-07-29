const REQUIRED_RECORD_PERMISSION_DESCRIPTION =
  '用于用户主动语音输入和为个人图卡录制声音'

export function findPrivacyPermissionIssues(permission) {
  const declaredPermissions =
    permission && typeof permission === 'object' ? permission : {}
  const issues = []

  for (const scope of Object.keys(declaredPermissions)) {
    if (scope !== 'scope.record') {
      issues.push(`unsupported permission ${scope}`)
    }
  }

  const recordPermission = declaredPermissions['scope.record']
  if (!recordPermission) {
    issues.push('missing required permission scope.record')
  } else if (
    String(recordPermission.desc || '').trim() !==
    REQUIRED_RECORD_PERMISSION_DESCRIPTION
  ) {
    issues.push(
      'scope.record must describe active voice input and personal tile recording'
    )
  }

  return issues
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^$(){}[\]\\]/g, '\\$&')
}

export function hasRuntimePluginUsage(pluginName, javascriptText) {
  const normalizedName = String(pluginName || '').trim()
  if (!normalizedName) return false

  const pluginPattern = new RegExp(
    'requirePlugin\\s*\\(\\s*(["\\\'])' +
      escapeRegExp(normalizedName) +
      '\\1\\s*\\)'
  )
  return pluginPattern.test(String(javascriptText || ''))
}

export function findUnusedDeclaredComponents(
  usingComponents,
  localWxml,
  globalWxml = ''
) {
  const componentNames = Object.keys(usingComponents || {})
  const searchableWxml =
    typeof localWxml === 'string' ? localWxml : String(globalWxml || '')

  return componentNames.filter(componentName => {
    const componentPattern = new RegExp(
      '<\\s*' + escapeRegExp(componentName) + '(?:\\s|/?>)'
    )
    return !componentPattern.test(searchableWxml)
  })
}

export function findWxmlDependencySources(wxml) {
  const dependencies = []
  const dependencyPattern =
    /<(?:import|include)\b[^>]*\bsrc=["']([^"']+)["'][^>]*\/?>/g
  let match

  while ((match = dependencyPattern.exec(String(wxml || '')))) {
    dependencies.push(match[1])
  }

  return dependencies
}
