// lib/socket.js - ES6 module version for custom server
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io;

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:3000"],
            methods: ["GET", "POST", "PUT", "DELETE"],
            credentials: true
        }
    });

    // Socket authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.id;
            socket.userRole = decoded.rol;
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`✅ User connected: ${socket.userId} (${socket.userRole})`);

        // Join user to their role-based room
        socket.join(`role_${socket.userRole}`);
        socket.join(`user_${socket.userId}`);

        // Real-time sipariş takibi
        socket.on('join_order_room', (orderId) => {
            socket.join(`order_${orderId}`);
            console.log(`User ${socket.userId} joined order room: ${orderId}`);
        });

        // Real-time stok takibi
        socket.on('join_stock_room', () => {
            socket.join('stock_updates');
            console.log(`User ${socket.userId} joined stock updates room`);
        });

        // Kargo durumu takibi
        socket.on('join_cargo_room', () => {
            socket.join('cargo_updates');
            console.log(`User ${socket.userId} joined cargo updates room`);
        });

        socket.on('disconnect', () => {
            console.log(`❌ User disconnected: ${socket.userId}`);
        });
    });

    return io;
};

const getSocket = () => {
    if (!io) {
        console.warn('Socket.io not initialized!');
        return null;
    }
    return io;
};

// Real-time notification helpers
const notifyOrderUpdate = (orderId, data) => {
    const socket = getSocket();
    if (socket) {
        socket.to(`order_${orderId}`).emit('order_updated', {
            orderId,
            timestamp: new Date(),
            ...data
        });
        socket.to('role_GENEL_MUDUR').emit('order_notification', {
            type: 'order_update',
            orderId,
            data
        });
    }
};

const notifyStockUpdate = (stockData) => {
    const socket = getSocket();
    if (socket) {
        socket.to('stock_updates').emit('stock_updated', {
            timestamp: new Date(),
            ...stockData
        });
        if (stockData.isLowStock) {
            socket.to('role_GENEL_MUDUR').emit('low_stock_alert', stockData);
        }
    }
};

const notifyCargoUpdate = (cargoData) => {
    const socket = getSocket();
    if (socket) {
        socket.to('cargo_updates').emit('cargo_updated', {
            timestamp: new Date(),
            ...cargoData
        });
    }
};

const notifyNewOrder = (orderData) => {
    const socket = getSocket();
    if (socket) {
        socket.to('role_GENEL_MUDUR').emit('new_order', {
            timestamp: new Date(),
            ...orderData
        });
        console.log('🔔 New order notification sent:', orderData.orderId);
    } else {
        console.log('📵 Socket.IO not available for notification');
    }
};

export {
    initSocket,
    getSocket,
    notifyOrderUpdate,
    notifyStockUpdate,
    notifyCargoUpdate,
    notifyNewOrder
}; 