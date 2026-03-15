// src/runtime/container.ts

export class Container {
    private services: Map<string, any>;

    constructor() {
        this.services = new Map();
    }

    register(name: string, value: any): void {
        this.services.set(name, value);
    }

    use<T = any>(name: string): T {
        const service = this.services.get(name);
        if (!service) {
            throw new Error(`Service "${name}" not registered`);
        }

        return service as T;
    }
}

sudo cloudflared service install eyJhIjoiMzE4ZjJiYThjMWIyOWFjMTZjMTE5NjYzYzA3OGE5OTciLCJ0IjoiZDQ0Y2JiNWItMmJhNi00YWQzLTk3ZGUtZDUzNDIyMjE1MzViIiwicyI6IlptRmlOV1ZpTTJJdFpUZzNOUzAwTkdFekxXSm1PRFF0TjJNMU1HWm1OamxtWm1RdyJ9
cloudflared tunnel run--token eyJhIjoiMzE4ZjJiYThjMWIyOWFjMTZjMTE5NjYzYzA3OGE5OTciLCJ0IjoiZDQ0Y2JiNWItMmJhNi00YWQzLTk3ZGUtZDUzNDIyMjE1MzViIiwicyI6IlptRmlOV1ZpTTJJdFpUZzNOUzAwTkdFekxXSm1PRFF0TjJNMU1HWm1OamxtWm1RdyJ9