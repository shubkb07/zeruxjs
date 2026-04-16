import { Subscriber } from "./types.js";

/**
 * @title Dependency Tracking
 * @description Manages the current active effect subscriber for dependency tracking.
 */

const subscriberStack: Subscriber[] = [];

/**
 * @description Get the current active subscriber.
 * @returns {Subscriber | undefined}
 */
export function getCurrentSubscriber(): Subscriber | undefined {
    return subscriberStack[subscriberStack.length - 1];
}

/**
 * @description Run an effect and track its dependencies.
 * @param {Subscriber} subscriber - The callback to run.
 */
export function effect(subscriber: Subscriber): void {
    const run = () => {
        subscriberStack.push(run);
        try {
            subscriber();
        } finally {
            subscriberStack.pop();
        }
    };
    run();
}
