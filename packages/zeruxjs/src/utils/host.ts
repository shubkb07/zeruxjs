import { networkInterfaces } from "node:os";

const getLocalIps = () => {
    const interfaces = networkInterfaces();
    const ips = new Set<string>(["127.0.0.1", "::1", "localhost"]);
    
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name] || []) {
            ips.add(net.address);
        }
    }
    
    return ips;
};

const LOCAL_IPS = getLocalIps();

export const isLocalHost = (host: string) => {
    const hostname = host.split(":")[0].toLowerCase();
    
    if (LOCAL_IPS.has(hostname)) return true;
    if (hostname.endsWith(".localhost")) return true;
    
    // Check for common local IP ranges if not already in LOCAL_IPS
    if (
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        (hostname.startsWith("172.") && 
         Number.parseInt(hostname.split(".")[1]) >= 16 && 
         Number.parseInt(hostname.split(".")[1]) <= 31)
    ) {
        return true;
    }
    
    return false;
};

const matchWildcard = (pattern: string, host: string) => {
    if (pattern === host) return true;
    if (pattern.startsWith("*.")) {
        const domain = pattern.slice(2);
        return host === domain || host.endsWith(`.${domain}`);
    }
    return false;
};

export const isAllowedHost = (
    host: string, 
    allowedDomains: string | string[] = [], 
    allowedDevDomain?: string
) => {
    const hostname = host.split(":")[0].toLowerCase();
    
    if (isLocalHost(hostname)) return true;
    
    if (allowedDevDomain && hostname === allowedDevDomain.toLowerCase()) {
        return true;
    }
    
    const domains = Array.isArray(allowedDomains) ? allowedDomains : [allowedDomains];
    for (const pattern of domains) {
        if (matchWildcard(pattern.toLowerCase(), hostname)) {
            return true;
        }
    }
    
    return false;
};
