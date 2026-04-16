import { effect } from "./effect.js";
import { signal } from "./signal.js";
import { ReadonlySignal } from "./types.js";

/**
 * @title Computed Signal
 * @description Creates a read-only signal that derives its value from other signals.
 */

class ComputedImpl<T> implements ReadonlySignal<T> {
    private _signal = signal<T>(undefined as any);
    private _dirty = true;
    private _fn: () => T;

    constructor(fn: () => T) {
        this._fn = fn;
        effect(() => {
            this._dirty = true;
            // Optionally notify subscribers of this computed signal
            // For now, we simple trigger the function if anyone is listening
            this._signal.value = this.value; 
        });
    }

    get value(): T {
        if (this._dirty) {
            this._signal.value = this._fn();
            this._dirty = false;
        }
        return this._signal.value;
    }

    peek(): T {
        return this._signal.peek();
    }
}

/**
 * @description Create a computed signal.
 * @param {() => T} fn - The derivation function.
 * @returns {ReadonlySignal<T>}
 */
export function computed<T>(fn: () => T): ReadonlySignal<T> {
    return new ComputedImpl(fn);
}
