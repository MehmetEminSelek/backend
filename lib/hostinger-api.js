/**
 * 🚀 Hostinger API Integration Helper
 * Domain, DNS, SSL ve Server Management için
 */

const axios = require('axios');

class HostingerAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://api.hostinger.com/v1';
        this.headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * 🌐 Domain Management
     */
    async getDomains() {
        try {
            const response = await axios.get(`${this.baseURL}/domains`, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API Domain Error:', error.message);
            throw error;
        }
    }

    async getDomainDetails(domain) {
        try {
            const response = await axios.get(`${this.baseURL}/domains/${domain}`, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API Domain Details Error:', error.message);
            throw error;
        }
    }

    /**
     * 📡 DNS Management
     */
    async getDNSRecords(domain) {
        try {
            const response = await axios.get(`${this.baseURL}/domains/${domain}/dns`, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API DNS Error:', error.message);
            throw error;
        }
    }

    async createDNSRecord(domain, record) {
        try {
            const response = await axios.post(`${this.baseURL}/domains/${domain}/dns`, record, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API DNS Create Error:', error.message);
            throw error;
        }
    }

    async updateDNSRecord(domain, recordId, record) {
        try {
            const response = await axios.put(`${this.baseURL}/domains/${domain}/dns/${recordId}`, record, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API DNS Update Error:', error.message);
            throw error;
        }
    }

    /**
     * 🔒 SSL Certificate Management
     */
    async getSSLCertificates(domain) {
        try {
            const response = await axios.get(`${this.baseURL}/domains/${domain}/ssl`, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API SSL Error:', error.message);
            throw error;
        }
    }

    async orderSSLCertificate(domain, sslData) {
        try {
            const response = await axios.post(`${this.baseURL}/domains/${domain}/ssl`, sslData, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API SSL Order Error:', error.message);
            throw error;
        }
    }

    /**
     * 🖥️ Server Management (VPS)
     */
    async getServers() {
        try {
            const response = await axios.get(`${this.baseURL}/vps`, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API VPS Error:', error.message);
            throw error;
        }
    }

    async getServerDetails(serverId) {
        try {
            const response = await axios.get(`${this.baseURL}/vps/${serverId}`, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API VPS Details Error:', error.message);
            throw error;
        }
    }

    async restartServer(serverId) {
        try {
            const response = await axios.post(`${this.baseURL}/vps/${serverId}/restart`, {}, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API VPS Restart Error:', error.message);
            throw error;
        }
    }

    /**
     * 📊 Server Monitoring
     */
    async getServerStats(serverId) {
        try {
            const response = await axios.get(`${this.baseURL}/vps/${serverId}/stats`, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API VPS Stats Error:', error.message);
            throw error;
        }
    }

    /**
     * 💾 Backup Management
     */
    async getBackups(serverId) {
        try {
            const response = await axios.get(`${this.baseURL}/vps/${serverId}/backups`, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API Backup Error:', error.message);
            throw error;
        }
    }

    async createBackup(serverId, backupName) {
        try {
            const response = await axios.post(`${this.baseURL}/vps/${serverId}/backups`, {
                name: backupName
            }, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API Backup Create Error:', error.message);
            throw error;
        }
    }

    async restoreBackup(serverId, backupId) {
        try {
            const response = await axios.post(`${this.baseURL}/vps/${serverId}/backups/${backupId}/restore`, {}, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API Backup Restore Error:', error.message);
            throw error;
        }
    }

    /**
     * 🔔 Webhook Management
     */
    async createWebhook(url, events) {
        try {
            const response = await axios.post(`${this.baseURL}/webhooks`, {
                url: url,
                events: events
            }, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error('Hostinger API Webhook Error:', error.message);
            throw error;
        }
    }

    /**
     * 🎯 Utility Functions
     */
    async healthCheck() {
        try {
            const response = await axios.get(`${this.baseURL}/ping`, {
                headers: this.headers
            });
            return { status: 'success', data: response.data };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }

    // DNS Record helper
    createARecord(name, ip, ttl = 3600) {
        return {
            type: 'A',
            name: name,
            content: ip,
            ttl: ttl
        };
    }

    createCNAMERecord(name, target, ttl = 3600) {
        return {
            type: 'CNAME',
            name: name,
            content: target,
            ttl: ttl
        };
    }

    createMXRecord(name, priority, target, ttl = 3600) {
        return {
            type: 'MX',
            name: name,
            content: target,
            priority: priority,
            ttl: ttl
        };
    }
}

module.exports = HostingerAPI; 