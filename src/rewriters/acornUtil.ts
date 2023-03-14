// https://raw.githubusercontent.com/e9x/stomp-rewrite/master/src/acornUtil.ts

import type { Node as mNode } from 'meriyah/dist/src/estree';

// children of the node to replace a node must explicitly opt into being part of the result with
// result(node)

export const symbolNoResult = Symbol('symbolNoResult');
export const symbolResult = Symbol('symbolResult');

declare type NodeRange = [number, number];

export declare type Node =
  | {
    range?: NodeRange;
    [key: string | symbol]:
    | Node
    | Node[]
    | NodeRange
    | string
    | boolean
    | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }
  | mNode
  | any;

export function result(node: Node): Node {
  node[symbolResult] = true;
  return node;
}

export class AcornContext {
  node: Node;
  parent?: AcornContext;
  parentKey?: string | undefined;
  attached: boolean;
  root: boolean;
  stack: AcornContext[];
  entries: AcornContext[];
  constructor(
    node: Node,
    parent: AcornContext | undefined,
    parentKey: string | undefined,
    stack: AcornContext[],
    root = false
  ) {
    this.node = node;
    this.stack = stack;
    this.entries = [];

    if (parent) {
      this.parent = parent;
      this.parentKey = parentKey;
      this.attached = true;
    } else if (!root) {
      throw new TypeError('New parent isnt an instance of AcornContext.');
    } else {
      this.attached = false;
    }

    this.root = root;
  }
  // only used by array() and index()
  get parentObject(): Node | Node[] {
    if (!this.parent || !this.parentKey) {
      throw new Error('No parent');
    }

    return <Node | Node[]>this.parent.node[this.parentKey];
  }
  get parentIndex() {
    if (!(this.parentObject instanceof Array)) {
      throw new Error('Not an array');
    }

    return this.parentObject.indexOf(this.node);
  }
  detach() {
    if (this.root) {
      throw new RangeError('Cannot detach the root.');
    } else if (!this.attached) {
      throw new RangeError('Cannot detach a detached node.');
    }

    if (this.parentObject instanceof Array) {
      const place = this.parentObject.indexOf(this.node);
      if (place === -1) return false;
      this.parentObject.splice(place, 1);
    } else {
      delete this.parent!.node[this.parentKey!];
    }

    this.attached = false;

    return true;
  }
  // success = new AcornContext, failure = false
  replaceWith(node: Node) {
    if (this.root) {
      throw new RangeError('Cannot replace the root.');
    } else if (!this.attached) {
      throw new RangeError('Cannot replace a detached node.');
    }

    if (this.parentObject instanceof Array) {
      const place = this.parentObject.indexOf(this.node);

      if (place === -1) {
        return false;
      }

      this.parentObject.splice(place, 1, node);
    } else {
      delete this.parent!.node[this.parentKey!];
      this.parent!.node[this.parentKey!] = node;
    }

    this.attached = false;

    const created = new AcornContext(
      node,
      this.parent!,
      this.parentKey!,
      this.stack
    );

    delete this.parent;

    this.removeDescendantsFromStack();
    created.node[symbolNoResult] = true;
    this.stack.push(created);

    created.addEntriesToStack();

    for (const ctx of new AcornIterator(created.node)) {
      if (ctx.node[symbolResult]) {
        delete ctx.node[symbolResult];
        ctx.removeDescendantsFromStack();
      } else {
        ctx.node[symbolNoResult] = true;
      }
    }

    return created;
  }
  addEntriesToStack() {
    const entries: [string, Node][] = [];

    for (const key in this.node) {
      const value = this.node[key];

      if (typeof value !== 'object' || value === null) {
        continue;
      }

      if (value instanceof Array) {
        for (const sv of value) {
          if (typeof sv !== 'object' || sv === null) {
            continue;
          }

          if (typeof sv.type === 'string') {
            entries.push([key, sv]);
          }
        }
      } else if (typeof value.type === 'string') {
        entries.push([key, value]);
      }
    }

    const start = this.stack.length - 1;
    let length = entries.length;

    for (const [key, node] of entries) {
      const ctx = new AcornContext(node, this, key, this.stack);
      this.stack[start + length--] = ctx;
      this.entries.push(ctx);
    }
  }
  removeDescendantsFromStack() {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const stackI = this.stack.indexOf(entry);

      if (stackI !== -1) {
        this.stack.splice(stackI, 1);
      }

      entry.removeDescendantsFromStack();
    }
  }
}
export class AcornIterator {
  stack: AcornContext[];
  constructor(ast: Node) {
    this.stack = [];
    this.stack.push(
      new AcornContext(ast, undefined, undefined, this.stack, true)
    );
  }
  next() {
    while (true) {
      const context = this.stack.pop();

      if (context === undefined) {
        return { value: undefined, done: true };
      }

      context.addEntriesToStack();

      if (context.node[symbolNoResult]) {
        continue;
      }

      return { value: context, done: false };
    }
  }
  [Symbol.iterator](): Iterator<AcornContext> {
    return <Iterator<AcornContext>>this;
  }
}
