#!/usr/bin/env node
/**
 * Script to fix all audit log calls in the codebase
 * Converts from old format: auditLog('ACTION', 'description', {...})
 * To new format: auditLog({ personelId, action, tableName, recordId, description, req })
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Map old action names to new enum values
const actionMap = {
    // Auth actions
    'AUTH_FAILED': 'LOGIN',
    'AUTH_SUCCESS': 'READ',
    'AUTH_ERROR': 'READ',
    'LOGIN_SUCCESS': 'LOGIN',
    'LOGIN_FAILED': 'LOGIN',
    'ACCESS_DENIED': 'READ',

    // CRUD operations
    'MATERIALS_VIEW': 'READ',
    'MATERIAL_CREATED': 'CREATE',
    'MATERIAL_UPDATED': 'UPDATE',
    'MATERIAL_DELETED': 'DELETE',
    'MATERIALS_API_ERROR': 'READ',

    'STOCK_VIEW': 'READ',
    'STOCK_MOVEMENT_CREATED': 'CREATE',
    'STOCK_LEVELS_UPDATED': 'UPDATE',
    'STOCK_API_ERROR': 'READ',

    'PRODUCTS_VIEW': 'READ',
    'PRODUCT_CREATED': 'CREATE',
    'PRODUCT_UPDATED': 'UPDATE',
    'PRODUCT_DELETED': 'DELETE',
    'PRODUCTS_API_ERROR': 'READ',

    'ORDER_DETAIL_VIEW': 'READ',
    'ORDER_CREATED': 'CREATE',
    'ORDER_UPDATED': 'UPDATE',
    'ORDER_DELETED': 'DELETE',
    'ORDER_DELIVERED': 'UPDATE',
    'ORDERS_VIEW': 'READ',
    'ORDERS_API_ERROR': 'READ',
    'ORDER_DETAIL_API_ERROR': 'READ',

    'PAYMENT_VIEW': 'READ',
    'PAYMENT_CREATED': 'CREATE',
    'PAYMENT_UPDATED': 'UPDATE',
    'PAYMENT_API_ERROR': 'READ',

    'DELIVERY_API_ERROR': 'READ',
    'TRANSFER_UPDATED': 'UPDATE',
    'TRANSFER_API_ERROR': 'READ',
    'BRANCH_TRANSFER_UPDATED': 'UPDATE',
    'BRANCH_TRANSFER_API_ERROR': 'READ',

    'CARGO_INFO_VIEW': 'READ',
    'CARGO_UPDATED': 'UPDATE',
    'CARGO_API_ERROR': 'READ',
    'CARGO_STATUS_ACCESS': 'READ',
    'CARGO_STATUS_UPDATED': 'UPDATE',
    'CARGO_STATUS_API_ERROR': 'READ',

    'RECIPES_VIEW': 'READ',
    'RECIPE_CREATED': 'CREATE',
    'RECIPE_UPDATED': 'UPDATE',
    'RECIPE_DELETED': 'DELETE',
    'RECIPES_API_ERROR': 'READ',
    'RECIPE_COST_VIEW': 'READ',
    'RECIPE_COST_CALCULATED': 'READ',
    'RECIPE_BULK_COST_RECALCULATED': 'UPDATE',
    'RECIPE_COST_API_ERROR': 'READ',

    'MATERIAL_PRICING_VIEW_SINGLE': 'READ',
    'MATERIAL_PRICING_VIEW_LIST': 'READ',
    'MATERIAL_PRICING_UPDATED': 'UPDATE',
    'MATERIAL_PRICING_BULK_UPDATED': 'UPDATE',
    'MATERIAL_PRICING_API_ERROR': 'READ',

    'PRODUCTION_QUEUE_ACCESS': 'READ',
    'PRODUCTION_STATUS_UPDATED': 'UPDATE',
    'PRODUCTION_QUEUE_API_ERROR': 'READ',

    'CUSTOMERS_VIEW': 'READ',
    'CUSTOMER_CREATED': 'CREATE',
    'CUSTOMERS_API_ERROR': 'READ',

    'PRICING_VIEW': 'READ',
    'PRICING_CREATED': 'CREATE',
    'PRICING_UPDATED': 'UPDATE',
    'PRICING_DELETED': 'DELETE',
    'PRICING_API_ERROR': 'READ',

    'USER_EXCEL_UPLOAD_ERROR': 'CREATE',
    'BULK_USER_UPLOAD': 'CREATE',
    'USER_TEMPLATE_ERROR': 'READ',
    'USER_TEMPLATE_DOWNLOAD': 'READ',

    'CUSTOMER_EXCEL_UPLOAD_ERROR': 'CREATE',
    'BULK_CUSTOMER_UPLOAD': 'CREATE',
    'CUSTOMER_TEMPLATE_ERROR': 'READ',
    'CUSTOMER_TEMPLATE_DOWNLOAD': 'READ',

    'DROPDOWN_DATA_ACCESS': 'READ',
    'DROPDOWN_API_ERROR': 'READ',

    'AUDIT_LOGS_ACCESSED': 'READ',
    'AUDIT_LOGS_EXPORT': 'EXPORT',
    'AUDIT_LOGS_PURGE': 'DELETE',

    'USERS_VIEW': 'READ',
    'USER_CREATED': 'CREATE',
    'USER_UPDATED': 'UPDATE',
    'USER_DELETED': 'DELETE',
    'USERS_API_ERROR': 'READ',

    'DB_ERROR': 'READ',
    'DB_TRANSACTION_SUCCESS': 'READ',
    'DB_TRANSACTION_ERROR': 'READ',

    'SQL_INJECTION_ATTEMPT': 'READ',
    'FILE_UPLOAD_REJECTED': 'CREATE',
    'REQUEST_TOO_LARGE': 'READ',
    'INPUT_VALIDATION_FAILED': 'CREATE',

    'API_ACCESS': 'READ',
    'API_ERROR': 'READ',

    'SALES_REPORTS_METADATA_VIEW': 'READ',
    'SALES_REPORT_GENERATED': 'READ',
    'SALES_REPORTS_API_ERROR': 'READ',

    'CRM_REPORTS_METADATA_VIEW': 'READ',
    'CRM_REPORT_GENERATED': 'READ',
    'CRM_REPORTS_API_ERROR': 'READ'
};

// Map actions to table names
const tableMap = {
    'MATERIALS': 'Material',
    'STOCK': 'StokHareket',
    'PRODUCTS': 'Urun',
    'ORDER': 'Siparis',
    'ORDERS': 'Siparis',
    'PAYMENT': 'Odeme',
    'DELIVERY': 'Siparis',
    'TRANSFER': 'Siparis',
    'BRANCH_TRANSFER': 'Siparis',
    'CARGO': 'Siparis',
    'RECIPES': 'Recete',
    'RECIPE': 'Recete',
    'MATERIAL_PRICING': 'Material',
    'PRODUCTION': 'Siparis',
    'CUSTOMERS': 'Cari',
    'CUSTOMER': 'Cari',
    'PRICING': 'Fiyat',
    'USER': 'User',
    'USERS': 'User',
    'DROPDOWN': 'API',
    'AUDIT_LOGS': 'AuditLog',
    'DB': 'Database',
    'API': 'API',
    'SALES': 'Report',
    'CRM': 'Report'
};

function getTableName(oldAction) {
    for (const [key, value] of Object.entries(tableMap)) {
        if (oldAction.includes(key)) {
            return value;
        }
    }
    return 'API';
}

function fixAuditLogCall(match, oldAction, description, params) {
    const newAction = actionMap[oldAction] || 'READ';
    const tableName = getTableName(oldAction);

    // Parse the params to extract useful info
    let personelId = 'req.user?.personelId || null';
    let recordId = 'req.url || "unknown"';

    // Try to extract userId or personelId from params
    if (params.includes('userId:')) {
        personelId = 'req.user?.personelId || null';
    }

    // Try to extract recordId from params
    const recordIdMatch = params.match(/id:\s*([^,}]+)/);
    if (recordIdMatch) {
        recordId = recordIdMatch[1].trim();
    }

    return `auditLog({
                personelId: ${personelId},
                action: '${newAction}',
                tableName: '${tableName}',
                recordId: String(${recordId}),
                description: ${description},
                req: req
            })`;
}

async function processFile(filePath) {
    console.log(`Processing: ${filePath}`);

    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Match old audit log pattern
    const pattern = /auditLog\('([^']+)',\s*'([^']+)',\s*\{([^}]+)\}\)/gs;

    content = content.replace(pattern, (match, oldAction, description, params) => {
        changed = true;
        return fixAuditLogCall(match, oldAction, `'${description}'`, params);
    });

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Fixed audit logs in: ${filePath}`);
    }
}

async function main() {
    console.log('🔧 Fixing audit log calls...\n');

    // Find all JS files that contain old audit log calls
    const files = glob.sync('backend/**/*.js', {
        ignore: ['**/node_modules/**', '**/fix-audit-logs.js']
    });

    let count = 0;
    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes("auditLog('")) {
            await processFile(file);
            count++;
        }
    }

    console.log(`\n✅ Fixed audit logs in ${count} files!`);
}

main().catch(console.error);