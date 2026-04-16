import { getCurrentSubscriber } from "./effect.js";
import { Signal, Subscriber } from "./types.js";

/**
 * @title Signal Implementation
 * @description Creates a reactive signal.
 */

let isBatching = false;
const pendingEffects = new Set<Subscriber>();

export function batch(fn: () => void) {
    isBatching = true;
    try {
        fn();
    } finally {
        isBatching = false;
        const effects = Array.from(pendingEffects);
        pendingEffects.clear();
        effects.forEach(effect => effect());
    }
}

class SignalImpl<T> implements Signal<T> {
    private _value: T;
    private _subscribers: Set<Subscriber> = new Set();

    constructor(initialValue: T) {
        this._value = initialValue;
    }

    get value(): T {
        const sub = getCurrentSubscriber();
        if (sub) {
            this._subscribers.add(sub);
        }
        return this._value;
    }

    set value(newValue: T) {
        if (this._value !== newValue) {
            this._value = newValue;
            this.notify();
        }
    }

    peek(): T {
        return this._value;
    }

    private notify(): void {
        this._subscribers.forEach(sub => {
            if (isBatching) {
                pendingEffects.add(sub);
            } else {
                sub();
            }
        });
    }
}

/**
 * @description Create a new signal.
 * @param {T} initialValue - The initial value.
 * @returns {Signal<T>}
 */
export function signal<T>(initialValue: T): Signal<T> {
    return new SignalImpl(initialValue);
}

/**
 * @description Create a reactive proxy for an object.
 * @param {T} target
 * @returns {T}
 */
export function reactive<T extends object>(target: T): T {
    const signals: Record<string | symbol, Signal<any>> = {};

    return new Proxy(target, {
        get(obj, prop) {
            if (!signals[prop]) {
                signals[prop] = signal((obj as any)[prop]);
            }
            return signals[prop].value;
        },
        set(obj, prop, value) {
            if (!signals[prop]) {
                signals[prop] = signal(value);
            }
            signals[prop].value = value;
            (obj as any)[prop] = value;
            return true;
        }
    }) as T;
}
