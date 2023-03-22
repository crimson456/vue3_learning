import { TrackOpTypes, TriggerOpTypes } from './operations'
import { extend, isArray, isIntegerKey, isMap } from '@vue/shared'
import { EffectScope, recordEffectScope } from './effectScope'
import {
  createDep,
  Dep,
  finalizeDepMarkers,
  initDepMarkers,
  newTracked,
  wasTracked
} from './dep'
import { ComputedRefImpl } from './computed'

// The main WeakMap that stores {target -> key -> dep} connections.
// Conceptually, it's easier to think of a dependency as a Dep class
// which maintains a Set of subscribers, but we simply store them as
// raw Sets to reduce memory overhead.
type KeyToDepMap = Map<any, Dep>
// targetMap结构: targetMap = (WeakMap){ target:(Map){ key:(Set)dep } }
const targetMap = new WeakMap<any, KeyToDepMap>()

// The number of effects currently being tracked recursively.
let effectTrackDepth = 0

export let trackOpBit = 1

/**
 * The bitwise track markers support at most 30 levels of recursion.
 * This value is chosen to enable modern JS engines to use a SMI on all platforms.
 * When recursion depth is greater, fall back to using a full cleanup.
 */
const maxMarkerBits = 30

export type EffectScheduler = (...args: any[]) => any

export type DebuggerEvent = {
  effect: ReactiveEffect
} & DebuggerEventExtraInfo

export type DebuggerEventExtraInfo = {
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}

export let activeEffect: ReactiveEffect | undefined

export const ITERATE_KEY = Symbol(__DEV__ ? 'iterate' : '')
export const MAP_KEY_ITERATE_KEY = Symbol(__DEV__ ? 'Map key iterate' : '')

// 
export class ReactiveEffect<T = any> {
  active = true
  deps: Dep[] = []
  parent: ReactiveEffect | undefined = undefined

  /**
   * Can be attached after creation
   * @internal
   */
  computed?: ComputedRefImpl<T>
  /**
   * @internal
   */
  allowRecurse?: boolean
  /**
   * @internal
   */
  private deferStop?: boolean

  onStop?: () => void
  // dev only
  onTrack?: (event: DebuggerEvent) => void
  // dev only
  onTrigger?: (event: DebuggerEvent) => void

  // 构造函数中存入fn和scheduler
  constructor(
    public fn: () => T,
    public scheduler: EffectScheduler | null = null,
    scope?: EffectScope
  ) {
    recordEffectScope(this, scope)
  }

  // 执行effect
  run() {
    // 第一次只需要执行effect中的函数不需要收集依赖
    if (!this.active) {
      return this.fn()
    }

    let parent: ReactiveEffect | undefined = activeEffect
    // ???
    let lastShouldTrack = shouldTrack
    // ???
    while (parent) {
      if (parent === this) {
        return
      }
      parent = parent.parent
    }
    try {
      // 处理effect中递归调用effect函数的关系
      this.parent = activeEffect
      activeEffect = this
      shouldTrack = true
      // trackOpBit默认为1，effectTrackDepth默认为0
      // 初始化当前层所用的trackOpBit
      trackOpBit = 1 << ++effectTrackDepth
      // 此处主要进行的是分支切换(根据条件调整依赖)时候的清除依赖
      if (effectTrackDepth <= maxMarkerBits) {
        // 将所有依赖中w标志位的当前层级置1
        initDepMarkers(this)
      } 
      // 降级处理：清除所有的依赖
      else {
        cleanupEffect(this)
      }
      // 调用函数进行依赖收集
      return this.fn()
    } finally {
      if (effectTrackDepth <= maxMarkerBits) {
        finalizeDepMarkers(this)
      }
      // 将层级还原
      trackOpBit = 1 << --effectTrackDepth
      // 将activeEffect还原到上一次
      activeEffect = this.parent
      shouldTrack = lastShouldTrack
      this.parent = undefined

      if (this.deferStop) {
        this.stop()
      }
    }
  }

  // 停止effect的依赖收集
  stop() {
    // stopped while running itself - defer the cleanup
    if (activeEffect === this) {
      this.deferStop = true
    } else if (this.active) {
      cleanupEffect(this)
      if (this.onStop) {
        this.onStop()
      }
      this.active = false
    }
  }
}

// 双向清除依赖
function cleanupEffect(effect: ReactiveEffect) {
  const { deps } = effect
  if (deps.length) {
    // 从dep上清除ReactiveEffect实例
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    // 从ReactiveEffect实例上清除dep
    deps.length = 0
  }
}

export interface DebuggerOptions {
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
}

export interface ReactiveEffectOptions extends DebuggerOptions {
  lazy?: boolean
  scheduler?: EffectScheduler
  scope?: EffectScope
  allowRecurse?: boolean
  onStop?: () => void
}

export interface ReactiveEffectRunner<T = any> {
  (): T
  effect: ReactiveEffect
}

// effect副作用函数的主逻辑
export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions
): ReactiveEffectRunner {

  if ((fn as ReactiveEffectRunner).effect) {
    fn = (fn as ReactiveEffectRunner).effect.fn
  }
  // 创建实例
  const _effect = new ReactiveEffect(fn)
  // ?
  if (options) {
    extend(_effect, options)
    if (options.scope) recordEffectScope(_effect, options.scope)
  }
  // 不存在options.lazy字段的情况直接调用一次
  if (!options || !options.lazy) {
    _effect.run()
  }
  // 将再次调用的函数返回
  const runner = _effect.run.bind(_effect) as ReactiveEffectRunner
  runner.effect = _effect
  return runner
}

// 用于停止副作用函数的依赖收集
export function stop(runner: ReactiveEffectRunner) {
  runner.effect.stop()
}

export let shouldTrack = true
const trackStack: boolean[] = []

// 停止当前级依赖收集，堆栈一个布尔值
export function pauseTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

// 允许当前级依赖收集
export function enableTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

// 恢复上一级依赖收集
export function resetTracking() {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}

// track(target, TrackOpTypes.GET, key)
// 收集依赖，此函数中主要进行依赖图的创建
export function track(target: object, type: TrackOpTypes, key: unknown) {
  // targetMap = (WeakMap){ target:(Map){ key: dep(Set)  } }
  if (shouldTrack && activeEffect) {
    // target为需要访问的对象
    // targetMap为以target为成员名、depsMap为成员值的WeakMap
    // 将目标对象注册在targetMap上
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()))
    }
    // key为访问对象上的访问的成员名
    // depsMap为以key为成员名、dep(Set)为成员值的Map
    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = createDep()))
    }

    const eventInfo = __DEV__
      ? { effect: activeEffect, target, type, key }
      : undefined

    trackEffects(dep, eventInfo)
  }
}

// 收集依赖，此函数中主要进行依赖互相添加
export function trackEffects(
  dep: Dep,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo
) {
  let shouldTrack = false
  // ???
  if (effectTrackDepth <= maxMarkerBits) {
    // 判断在当前层在新一轮依赖收集中已经添加了该依赖
    if (!newTracked(dep)) {
      dep.n |= trackOpBit // set newly tracked
      // 判断在当前层在上一轮依赖收集中已经添加了该依赖
      shouldTrack = !wasTracked(dep)
    }
  } 
  // 降级处理：只添加没有的依赖
  else {
    // Full cleanup mode.
    shouldTrack = !dep.has(activeEffect!)
  }

  if (shouldTrack) {
    // 在key值对应的dep(Set)中添加当前执行的ReactiveEffect实例
    dep.add(activeEffect!)
    // 在当前执行的ReactiveEffect实例deps字段下添加dep(Set)
    activeEffect!.deps.push(dep)
    if (__DEV__ && activeEffect!.onTrack) {
      activeEffect!.onTrack({
        effect: activeEffect!,
        ...debuggerEventExtraInfo!
      })
    }
  }
}

// 派发更新
export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>
) {
  // 没有依赖直接返回
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    // never been tracked
    return
  }

  // 获取触发的dep(Set)
  let deps: (Dep | undefined)[] = []
  // 清除的情况：获取全部dep
  if (type === TriggerOpTypes.CLEAR) {
    // collection being cleared
    // trigger all effects for target
    deps = [...depsMap.values()]
  } 
  // 访问数组长度的情况:获取所有超过新长度和与length相关的dep
  else if (key === 'length' && isArray(target)) {
    const newLength = Number(newValue)
    depsMap.forEach((dep, key) => {
      if (key === 'length' || key >= newLength) {
        deps.push(dep)
      }
    })
  } 
  // 其他情况：获取直接依赖key的dep和间接触发的dep
  else {
    // schedule runs for SET | ADD | DELETE
    // 直接依赖的dep
    if (key !== void 0) {
      deps.push(depsMap.get(key))
    }

    // also run for iteration key on ADD | DELETE | Map.SET
    // 添加间接依赖的副作用函数，大概情况：(网络摘录)
    // 1. 新增数组新值索引大于数组长度时，会导致数组容量被扩充，length属性也会发生变化
    // 2. 新增或删除Set/WeakSet/Map/WeakMap元素时，需要触发依赖 迭代器 的副作用函数
    // 3. 新增或删除Map/WeakMap元素时，需要触发依赖 键迭代器 的副作用函数
    // 4. 设置Map/WeakMap元素的值时，需要触发依赖 迭代器 的副作用函数
    switch (type) {
      case TriggerOpTypes.ADD:
        // 获取迭代器的依赖
        if (!isArray(target)) {
          deps.push(depsMap.get(ITERATE_KEY))
          if (isMap(target)) {
            deps.push(depsMap.get(MAP_KEY_ITERATE_KEY))
          }
        } 
        // 获取数组length的依赖
        else if (isIntegerKey(key)) {
          // new index added to array -> length changes
          deps.push(depsMap.get('length'))
        }
        break
      case TriggerOpTypes.DELETE:
        // 获取迭代器的依赖
        if (!isArray(target)) {
          deps.push(depsMap.get(ITERATE_KEY))
          if (isMap(target)) {
            deps.push(depsMap.get(MAP_KEY_ITERATE_KEY))
          }
        }
        break
      case TriggerOpTypes.SET:
        // 获取键迭代器的依赖
        if (isMap(target)) {
          deps.push(depsMap.get(ITERATE_KEY))
        }
        break
    }
  }

  const eventInfo = __DEV__
    ? { target, type, key, newValue, oldValue, oldTarget }
    : undefined

  // 触发所有依赖的更新
  // 数组只有一项的情况，直接使用
  // 有多项的情况，将所有 存储依赖的dep(Set) 中的依赖 整理到一个 新数组effects 中并重新创建Set合并所有依赖项
  // 注意
  if (deps.length === 1) {
    if (deps[0]) {
      if (__DEV__) {
        triggerEffects(deps[0], eventInfo)
      } else {
        triggerEffects(deps[0])
      }
    }
  } else {
    const effects: ReactiveEffect[] = []
    for (const dep of deps) {
      if (dep) {
        effects.push(...dep)
      }
    }
    if (__DEV__) {
      triggerEffects(createDep(effects), eventInfo)
    } else {
      triggerEffects(createDep(effects))
    }
  }
}

// 触发dep中所有依赖
export function triggerEffects(
  dep: Dep | ReactiveEffect[],
  debuggerEventExtraInfo?: DebuggerEventExtraInfo
) {
  // spread into array for stabilization
  const effects = isArray(dep) ? dep : [...dep]
  for (const effect of effects) {
    if (effect.computed) {
      triggerEffect(effect, debuggerEventExtraInfo)
    }
  }
  for (const effect of effects) {
    if (!effect.computed) {
      triggerEffect(effect, debuggerEventExtraInfo)
    }
  }
}

// 触发单个依赖，默认重新执行，或执行调度器函数
function triggerEffect(
  effect: ReactiveEffect,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo
) {
  // 排除当前effect，防止死循环
  if (effect !== activeEffect || effect.allowRecurse) {
    if (__DEV__ && effect.onTrigger) {
      effect.onTrigger(extend({ effect }, debuggerEventExtraInfo))
    }
    if (effect.scheduler) {
      effect.scheduler()
    } else {
      effect.run()
    }
  }
}
