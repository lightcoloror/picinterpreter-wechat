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
