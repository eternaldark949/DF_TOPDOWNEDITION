// Preview saves and settings occupy their own namespace, even when both builds
// are served from the same origin. Existing application storage calls are routed
// here only by the --webgl build; the Canvas artifact uses its original keys.
const NativeWebGLStorage = {
    prefix: 'dfab_native_webgl:',
    getItem(key) { return window.localStorage.getItem(this.prefix+key); },
    setItem(key,value) { return window.localStorage.setItem(this.prefix+key,value); },
    removeItem(key) { return window.localStorage.removeItem(this.prefix+key); }
};
