// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "http://localhost:3000", methods: ["GET","POST"] }
});

const STAFF_ROOM = 'staff_room';
const MAX_HISTORY = 100;

const BANNED_NAMES = ["hitler","admin","mod","foulword1","foulword2"];

const STAFF_LIST = [
    { loginName: "STAFF_CONTROLS-LIAM", displayName: "Liam Stern" },
    { loginName: "STAFF_CONTROLS-DIESEL", displayName: "Diesel Carter" },
    { loginName: "STAFF_CONTROLS-RICKY", displayName: "Ricky Martinez" },
    { loginName: "STAFF_CONTROLS-AARON", displayName: "Aaron Ortega" },
    { loginName: "STAFF_CONTROLS-DONOVAN", displayName: "Donovan Powell" }
];

const chatHistory = [];
const namesInUse = new Set();
const socketsMap = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

function isNameReserved(enteredUsername) {
    const checkName = enteredUsername.trim().toLowerCase();
    for (const bannedWord of BANNED_NAMES) if (checkName.includes(bannedWord.toLowerCase())) return true;
    return STAFF_LIST.some(staff => staff.loginName.toLowerCase() === checkName || staff.displayName.toLowerCase() === checkName);
}

function containsBannedWord(content) {
    const lowerContent = content.toLowerCase();
    for (const bannedWord of BANNED_NAMES) if (lowerContent.includes(bannedWord.toLowerCase())) return true;
    return false;
}

function getStaffDisplayInfo(enteredUsername) {
    const secureUsername = enteredUsername.trim();
    const staffMember = STAFF_LIST.find(staff => staff.loginName === secureUsername);
    if (staffMember) return { isAdmin: true, username: staffMember.displayName, secureName: staffMember.loginName };
    return { isAdmin: false, username: secureUsername, secureName: secureUsername };
}

function addSystemMessageToHistory(content, isAdmin = false, secureName) {
    const messageData = { username: "System", content, timestamp: new Date(), isAdmin, secureName: secureName || null };
    chatHistory.push(messageData);
    while (chatHistory.length > MAX_HISTORY) chatHistory.shift();
    return messageData;
}

function broadcastUserCount() { io.emit('user count', namesInUse.size); }

io.on('connection', (socket) => {
    console.log('A user connected');
    socket.emit('chat history', chatHistory);
    broadcastUserCount();

    socket.on('check_staff_status', (enteredName) => {
        const trimmedName = enteredName.trim();
        const lowerName = trimmedName.toLowerCase();

        if (namesInUse.has(lowerName)) { socket.emit('name_rejected', 'That name is already in use. Please choose another name.'); return; }

        if (isNameReserved(trimmedName)) {
            const staffMatch = STAFF_LIST.find(s => s.loginName.toLowerCase() === lowerName || s.displayName.toLowerCase() === lowerName);
            if (staffMatch) {
                if (staffMatch.loginName.toLowerCase() !== lowerName && staffMatch.displayName.toLowerCase() === lowerName) {
                    socket.emit('name_rejected', 'That name is reserved by staff. Please choose another name.'); return;
                }
                const staffInfo = getStaffDisplayInfo(trimmedName);
                const staffDisplayNameLower = staffInfo.username.toLowerCase();
               
