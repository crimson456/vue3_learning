



|packages
|  |
|  |--reactivity                 响应式核心
|  |--compiler-core              与平台无关的编译器核心
|  |--compiler-dom               针对于浏览器的编辑模块
|  |--runtime-core               与平台无关的运行时的核心（可以创建针对特定平台的运行时-自定义渲染器）
|  |--runtime-dom                针对浏览器运行时，包括DOM API属性，事件处理等
|
|  |--runtime-test               用于测试
|  |--reactivity-transform
|  |--server-renderer            用于服务器端渲染
|  |--compiler-ssr               针对于服务器端渲染的编译模块
|  |--compiler-sfc               针对单文件解析
|  |--sfc-playground
|  |--size-check                 用来测试代码体积
|  |--template-explorer          用于调试编译器输出的开发工具
|  |--shared                     多个包之间的共享内容
|  |--vue                        完整版本，包括运行时和编译器
|  |--vue-compat











|reactivity/src
|  |
|  |--index                        入口，方法的暴露
|  |--reactive                     reactive响应式对象入口
|  |--baseHandlers                 基本对象、数组的代理handlers
|  |--collectionHandlers           集合的代理handlers
|  |--effect                       ReactiveEffect类定义
|  |--dep                          dep(Set中保存effect实例)
|  |--ref                          ref相关
|  |--computed                     计算属性
|  |--effectScope                  
|  |--deferredComputed             
|  |--operations                   track和trigger操作的类型的定义
|  |--warning                      控制台警告字符














|runtime-dom/src
|  |
|  |--index                       
|  |--nodeOps                     
|  |--patchProp                   
|  |--apiCustomElement            自定义元素 ???
|  |
|  |--components                  
|  |  |--Transition               
|  |  |--TransitionGroup          
|  |
|  |--directives                  
|  |  |--vModel                   
|  |  |--vOn                      
|  |  |--vShow                    
|  |
|  |--modules                     更改属性(patch)的dom操作
|  |  |--attrs                    
|  |  |--class                    
|  |  |--events                   
|  |  |--props                    
|  |  |--style                    
|  |
|  |--helpers                     
|  |  |--useCssModule             
|  |  |--useCssVars               


|runtime-core/src
|  |
|  |--index                       入口
|  |--renderer                    render函数
|  |--apiCreateApp                createApp函数
|  |--vnode                       虚拟节点相关操作
|  |--h                           h函数定义(本质为createVNode)
|  |--scheduler                   effect更新和nextTick的任务队列

|  |--apiComputed                 computed方法
|  |--apiInject                   provide、inject方法

|  |--enums                       生命周期的缩写枚举值
|  |--apiLifecycle                生命周期钩子定义(包装和挂载在实例的对应缩写字段)

|  |--apiAsyncComponent           
|  |--apiDefineComponent          


|  |--apiSetupHelpers             
|  |--apiWatch                    
|  |--component                   
|  |--componentEmits              
|  |--componentOptions            
|  |--componentProps              
|  |--componentPublicInstance     
|  |--componentRenderContext      
|  |--componentRenderUtils        
|  |--componentSlots              
|  |--customFormater              
|  |--devtools                    
|  |--directives                  

|  |--rendererTemplateRef         ref(获取实例的方法)

|  |--errorHandling               错误处理
|  |--featureFlags                兼容性的全局标志的初始化

|  |--hmr                         
|  |--hydration                   
|  |--profiling                   通过window.performance计算各个部分花费的时间


|  |--warning                     警告处理
|  |
|  |--compat
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |
|  |--components
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |
|  |--helpers
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--
|  |  |--






























|compiler-dom/src
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--






|compiler-core/src
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--







|compiler-sfc/src
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--
|  |--












































