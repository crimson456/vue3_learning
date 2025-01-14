import { getGlobalThis } from '@vue/shared'

/**
 * This is only called in esm-bundler builds.
 * It is called when a renderer is created, in `baseCreateRenderer` so that
 * importing runtime-core is side-effects free.
 *
 * istanbul-ignore-next
 */
// 初始化一些兼容性的标志位
export function initFeatureFlags() {
  const needWarn = []

  // vue2选项式api兼容的标志
  if (typeof __FEATURE_OPTIONS_API__ !== 'boolean') {
    __DEV__ && needWarn.push(`__VUE_OPTIONS_API__`)
    getGlobalThis().__VUE_OPTIONS_API__ = true
  }

  // ???
  if (typeof __FEATURE_PROD_DEVTOOLS__ !== 'boolean') {
    __DEV__ && needWarn.push(`__VUE_PROD_DEVTOOLS__`)
    getGlobalThis().__VUE_PROD_DEVTOOLS__ = false
  }

  if (__DEV__ && needWarn.length) {
    const multi = needWarn.length > 1
    console.warn(
      `Feature flag${multi ? `s` : ``} ${needWarn.join(', ')} ${
        multi ? `are` : `is`
      } not explicitly defined. You are running the esm-bundler build of Vue, ` +
        `which expects these compile-time feature flags to be globally injected ` +
        `via the bundler config in order to get better tree-shaking in the ` +
        `production bundle.\n\n` +
        `For more details, see https://link.vuejs.org/feature-flags.`
    )
  }
}
