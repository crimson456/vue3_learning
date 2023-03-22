import {reactiveMap
  reactive,
  readonly,
  toRaw,
  ReactiveFlags,
  Target,
  readonlyMap,
  reactiveMap,
  shallowReactiveMap,
  shallowReadonlyMap,
  isReadonly,
  isShallow
} from './reactive'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import {
  track,
  trigger,
  ITERATE_KEY,
  pauseTracking,
  resetTracking
} from './effect'
import {
  isObject,
  hasOwn,
  isSymbol,
  hasChanged,
  isArray,
  isIntegerKey,
  extend,
  makeMap
} from '@vue/shared'
import { isRef } from './ref'
import { warn } from './warning'

const isNonTrackableKeys = /*#__PURE__*/ makeMap(`__proto__,__v_isRef,__isVue`)

const builtInSymbols = new Set(
  /*#__PURE__*/
  Object.getOwnPropertyNames(Symbol)
    // ios10.x Object.getOwnPropertyNames(Symbol) can enumerate 'arguments' and 'caller'
    // but accessing them on Symbol leads to TypeError because Symbol is a strict mode
    // function
    .filter(key => key !== 'arguments' && key !== 'caller')
    .map(key => (Symbol as any)[key])
    .filter(isSymbol)
)

const get = /*#__PURE__*/ createGetter()
const shallowGet = /*#__PURE__*/ createGetter(false, true)
const readonlyGet = /*#__PURE__*/ createGetter(true)
const shallowReadonlyGet = /*#__PURE__*/ createGetter(true, true)

const arrayInstrumentations = /*#__PURE__*/ createArrayInstrumentations()

// proxy中setter对某些数组方法成员的处理
function createArrayInstrumentations() {
  const instrumentations: Record<string, Function> = {}
  // instrument identity-sensitive Array methods to account for possible reactive
  // values
  // 这几种方法要收集数组上的每一个值
  ;(['includes', 'indexOf', 'lastIndexOf'] as const).forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this) as any
      for (let i = 0, l = this.length; i < l; i++) {
        track(arr, TrackOpTypes.GET, i + '')
      }
      // we run the method using the original args first (which may be reactive)
      const res = arr[key](...args)
      if (res === -1 || res === false) {
        // if that didn't work, run it again using raw values.
        return arr[key](...args.map(toRaw))
      } else {
        return res
      }
    }
  })
  // instrument length-altering mutation methods to avoid length being tracked
  // which leads to infinite loops in some cases (#2137)
  // 这几种方法在调用时停止收集length，避免循环调用
  ;(['push', 'pop', 'shift', 'unshift', 'splice'] as const).forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      pauseTracking()
      const res = (toRaw(this) as any)[key].apply(this, args)
      resetTracking()
      return res
    }
  })
  return instrumentations
}

function hasOwnProperty(this: object, key: string) {
  const obj = toRaw(this)
  track(obj, TrackOpTypes.HAS, key)
  return obj.hasOwnProperty(key)
}

// 获取值时的拦截
function createGetter(isReadonly = false, shallow = false) {
  // 响应式对象下的get代理
  return function get(target: Target, key: string | symbol, receiver: object) {
    // 以下几个分支判断都是获取对应值时的返回值
    // __v_isReactive
    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } 
    // __v_isReadonly
    else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly
    } 
    // __v_isShallow
    else if (key === ReactiveFlags.IS_SHALLOW) {
      return shallow
    }
    // __v_raw
    else if ( key === ReactiveFlags.RAW &&
      // 从对应map上获取原值
      receiver === (isReadonly ? shallow ? shallowReadonlyMap : readonlyMap : shallow ? shallowReactiveMap : reactiveMap ).get(target) ) {
      return target
    }

    // 数组对象上索引敏感(includes, indexOf, lastIndexOf)和长度敏感(push, pop, shift, unshift, splice)的方法进行改写
    const targetIsArray = isArray(target)
    if (!isReadonly) {
      if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
        return Reflect.get(arrayInstrumentations, key, receiver)
      }
      if (key === 'hasOwnProperty') {
        return hasOwnProperty
      }
    }
    // 使用Reflect的原因：如在设置属性访问器属性时，将this置为代理对象
    const res = Reflect.get(target, key, receiver)

    // 对对象内置的symbol方法和__proto__,__v_isRef,__isVue几个属性进行忽略
    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res
    }

    // 主逻辑：跟踪依赖
    if (!isReadonly) {
      track(target, TrackOpTypes.GET, key)
    }

    // 浅响应式不递归直接返回
    if (shallow) {
      return res
    }

    // 如果目标不为数组且成员为ref对象，则进行拆解，提出value值
    // eg. reactive([ref(1),2,3]) 不进行拆解
    if (isRef(res)) {
      // ref unwrapping - skip unwrap for Array + integer key.
      return targetIsArray && isIntegerKey(key) ? res : res.value
    }

    // 深响应式，且成员为对象形式递归内部成员
    if (isObject(res)) {
      // Convert returned value into a proxy as well. we do the isObject check
      // here to avoid invalid value warning. Also need to lazy access readonly
      // and reactive here to avoid circular dependency.
      return isReadonly ? readonly(res) : reactive(res)
    }

    return res
  }
}

const set = /*#__PURE__*/ createSetter()
const shallowSet = /*#__PURE__*/ createSetter(true)

// 设置值时的拦截
function createSetter(shallow = false) {
  return function set(target: object,key: string | symbol,value: unknown,receiver: object): boolean {
    // 获取旧值
    let oldValue = (target as any)[key]
    // 旧值为只读的ref，新值不为ref，则设置失败
    if (isReadonly(oldValue) && isRef(oldValue) && !isRef(value)) {
      return false
    }

    // 深代理的情况
    if (!shallow) {
      // 新值不为浅代理且不是只读，将新旧值进行解包
      if (!isShallow(value) && !isReadonly(value)) {
        oldValue = toRaw(oldValue)
        value = toRaw(value)
      }

      // 不是数组，旧值为ref，新值不为ref
      // 直接修改旧值，在ref对象中完成响应式
      if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
        oldValue.value = value
        // setter中返回true表示设置成功
        return true
      }
    } else {
      // in shallow mode, objects are set as-is regardless of reactive or not
    }

    // 判断设定的值是否存在原值
    const hadKey =isArray(target) && isIntegerKey(key)
        ? Number(key) < target.length
        : hasOwn(target, key)
    // 获取新值
    const result = Reflect.set(target, key, value, receiver)
    // don't trigger if target is something up in the prototype chain of original
    // 判断是否触发为原对象(如果当前目标在某个响应式对象的原型链上，此响应式对象通过原型链设置当前目标的值时，则不会触发)
    if (target === toRaw(receiver)) {
      // 设置新值
      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, value)
      } 
      // 更改旧值
      else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }
    return result
  }
}

function deleteProperty(target: object, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = (target as any)[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}

function has(target: object, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  if (!isSymbol(key) || !builtInSymbols.has(key)) {
    track(target, TrackOpTypes.HAS, key)
  }
  return result
}

function ownKeys(target: object): (string | symbol)[] {
  track(target, TrackOpTypes.ITERATE, isArray(target) ? 'length' : ITERATE_KEY)
  return Reflect.ownKeys(target)
}

export const mutableHandlers: ProxyHandler<object> = {
  get,
  set,
  deleteProperty,
  has,
  ownKeys
}

export const readonlyHandlers: ProxyHandler<object> = {
  get: readonlyGet,
  set(target, key) {
    if (__DEV__) {
      warn(
        `Set operation on key "${String(key)}" failed: target is readonly.`,
        target
      )
    }
    return true
  },
  deleteProperty(target, key) {
    if (__DEV__) {
      warn(
        `Delete operation on key "${String(key)}" failed: target is readonly.`,
        target
      )
    }
    return true
  }
}

export const shallowReactiveHandlers = /*#__PURE__*/ extend(
  {},
  mutableHandlers,
  {
    get: shallowGet,
    set: shallowSet
  }
)

// Props handlers are special in the sense that it should not unwrap top-level
// refs (in order to allow refs to be explicitly passed down), but should
// retain the reactivity of the normal readonly object.
export const shallowReadonlyHandlers = /*#__PURE__*/ extend(
  {},
  readonlyHandlers,
  {
    get: shallowReadonlyGet
  }
)
