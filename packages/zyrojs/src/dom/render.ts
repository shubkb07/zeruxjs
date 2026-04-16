import { effect } from "../reactivity/index.js";
import { VNode, VNodeChild } from "./vnode.js";

/**
 * @title Render Engine
 * @description Renders VNodes to the actual DOM and handles updates.
 */

export function mount(vnode: VNodeChild, container: Node): Node | undefined {
    if (vnode == null || typeof vnode === "boolean") return;

    if (typeof vnode === "string" || typeof vnode === "number") {
        const el = document.createTextNode(String(vnode));
        container.appendChild(el);
        return el;
    }

    if (typeof vnode === "function") {
        const el = document.createTextNode("");
        effect(() => {
            el.textContent = String(vnode());
        });
        container.appendChild(el);
        return el;
    }

    const vn = vnode as VNode;

    if (typeof vn.type === "string") {
        const el = document.createElement(vn.type);
        vn.el = el;

        Object.entries(vn.props).forEach(([key, value]) => {
            patchProp(el as HTMLElement, key, null, value);
        });

        vn.children.forEach(child => mount(child, el));
        container.appendChild(el);
        return el;
    }

    if (typeof vn.type === "function") {
        const componentVNode = vn.type(vn.props);
        return mount(componentVNode, container);
    }
}

function patchProp(el: HTMLElement, key: string, prevValue: any, nextValue: any) {
    if (key.startsWith("on")) {
        const eventName = key.slice(2).toLowerCase();
        if (prevValue) el.removeEventListener(eventName, prevValue);
        if (nextValue) el.addEventListener(eventName, nextValue);
    } else if (typeof nextValue === "function") {
        effect(() => {
            (el as any)[key] = nextValue();
        });
    } else {
        (el as any)[key] = nextValue;
    }
}

/**
 * @description Basic patch function for reconciliation.
 */
export function patch(container: Node, vnode: VNode, oldVNode?: VNode) {
    if (!oldVNode) {
        mount(vnode, container);
    } else if (vnode.type !== oldVNode.type) {
        // Replace
        const newEl = mount(vnode, container);
        if (oldVNode.el && oldVNode.el.parentNode) {
            oldVNode.el.parentNode.replaceChild(newEl!, oldVNode.el);
        }
    } else {
        // Patch attributes
        const el = vnode.el = oldVNode.el as HTMLElement;
        const oldProps = oldVNode.props;
        const newProps = vnode.props;

        for (const key in newProps) {
            if (newProps[key] !== oldProps[key]) {
                patchProp(el, key, oldProps[key], newProps[key]);
            }
        }
        for (const key in oldProps) {
            if (!(key in newProps)) {
                patchProp(el, key, oldProps[key], null);
            }
        }

        // Patch children (Simplified: just remount for now or implement list diff)
        // For simplicity in Phase 2, we just handle text/single children or clear/mount
        // A full list diff is complex.
    }
}

export function render(vnode: VNode, container: HTMLElement): void {
    const oldVNode = (container as any)._zyro_vnode;
    patch(container, vnode, oldVNode);
    (container as any)._zyro_vnode = vnode;
}
