import { UNDEFINABLE, GLOBAL_PROXY, ACCESS_KEY, GLOBAL_NAME } from "../rewriters/js";

export default function(apglobal: any) {

  const mod = {
    get2: (target: any, key: any): unknown => {
      // key = normalizeKey(key);
      return mod.get(target[key], key);
    },
    get: (object: any, key: any): any => {
      try {
        if (
          typeof key === 'string' &&
          UNDEFINABLE.includes(key) &&
          ((typeof object === 'object' && object !== null) ||
            typeof object === 'function') &&
          GLOBAL_PROXY in object
        ) {
          return object[GLOBAL_PROXY];
        }
      } catch (error) {
        // error was thrown during an accessor
        // should not be introduced into normal execution
      }

      return object;
    },
    set2: (
      target: any,
      key: any,
      operate: (target: any, property: any, value: any) => any,
      righthand: any
    ) => {
      // key = this.normalize_key(key);
      // possibly a context

      if (typeof key === 'string') {
        if (target === global) {
          if (key === 'location') {
            target = (location as any)[GLOBAL_PROXY];
            key = 'href';
          }
        } else if (
          ((typeof target === 'object' && target !== null) ||
            typeof target === 'function') &&
          ACCESS_KEY in target &&
          target[ACCESS_KEY]!.set2 !== mod.set2
        ) {
          return target[ACCESS_KEY]!.set2(target, key, operate);
        }
      }

      return operate(mod.get(target, key), key, righthand);
    },
    set1: (
      target: any,
      name: any,
      operate: any,
      set: any,
      righthand: any
    ) => {
      console.log(target, name, operate, set, righthand);
      // name = normalizeKey(name);
      const proxy = mod.get(target, name);

      const property = Symbol();
      const object = {
        [property]: proxy,
      };

      const result = operate(object, property, righthand);
      const value = object[property];

      if (
        typeof target === 'object' &&
        target !== null &&
        target[GLOBAL_NAME] === 'location'
      ) {
        console.log("will set location to " + value);
      } else {
        set(value);
      }

      return result;
    },
    new2: (target: any, key: any, args: any): any => {
      // key = normalizeKey(key);
      return Reflect.construct(mod.get(target[key], key), args);
    },
    call2: (target: any, key: any, args: any): any => {
      // key = normalizeKey(key);
      return Reflect.apply(mod.get(target[key], key), target, args);
    },
    evalScope: (code: unknown) => {
      return apglobal.jsRewrite(code)
      // return modifyJS(
      //   String(code),
      //   this.client.url,
      //   this.client.config,
      //   'generic'
      // );
    },
    // import: (baseURL: string | undefined, url: string): Promise<unknown> => {
    //   // @ts-ignore
    //   return import(
    //     /* webpackIgnore: true */
    //     routeJS(
    //       new StompURL(
    //         new URL(url, baseURL || this.client.url.toString()),
    //         this.client.url
    //       ),
    //       this.client.url,
    //       this.client.config,
    //       'genericModule'
    //     )
    //   );
    // },
  };
  return mod;
}
