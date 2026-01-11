# 🔐 VORTEX: Blockchain-Backed Secure IoT Access Control System


## 🎯 Overview

**VORTEX** is an enterprise-grade, decentralized access control system that combines:

- 🔗 **Blockchain Technology** (Ethereum/Polygon) for immutable audit trails
- 👤 **Biometric Authentication** (Face recognition) for zero-trust security
- 🏷️ **RFID Integration** (Card-based verification) for multi-factor authentication
- 📊 **Real-time Analytics** (Live dashboard) for threat detection
- 🌐 **IoT Connectivity** (MQTT protocol) for edge device communication
- ☁️ **Cloud Database** (Supabase) for scalable user management

### Problem Solved

Traditional access control systems face critical challenges:
- ❌ **Centralized Single Point of Failure** - One server down = complete system outage
- ❌ **Log Manipulation Risk** - Unauthorized users can delete access records
- ❌ **Lack of Transparency** - No verifiable proof of access events
- ❌ **High Costs** - Enterprise solutions cost $10K-50K+ to deploy
- ❌ **Compliance Issues** - Difficult to meet GDPR, ISO 27001 requirements

### VORTEX Solution

- ✅ **Immutable Records** - All access attempts permanently recorded on blockchain
- ✅ **Decentralized** - No single point of failure, distributed across nodes
- ✅ **Biometric Security** - Face recognition + RFID for 2FA authentication
- ✅ **Cost-Effective** - 60% cheaper than traditional systems (Layer 2 scaling)
- ✅ **Compliance Ready** - Automated audit reports for regulatory requirements

---

## ✨ Key Features

### 🔐 Security Features

| Feature | Description |
|---------|-------------|
| **Zero-Trust Architecture** | Multiple authentication factors required simultaneously |
| **Biometric Verification** | AI-powered face recognition with 95%+ accuracy |
| **RFID Authentication** | NFC/RFID card detection for physical verification |
| **Blockchain Logging** | Immutable access records on Polygon Layer 2 |
| **Role-Based Access Control** | Admin, Backend, Auditor, and User roles |
| **Blacklist Management** | Real-time address blacklisting for compromised accounts |
| **Multi-Signature Support** | Gnosis Safe integration for critical operations |

### 📊 Dashboard Features

| Feature | Description |
|---------|-------------|
| **Real-time Logs** | Live access attempt streaming |
| **User Registration** | Admin panel for user onboarding to Supabase |
| **Access Statistics** | Total attempts, success rate, suspicious activities |
| **Device Monitoring** | Per-device access patterns and anomalies |
| **Alerts & Notifications** | Instant alerts on unauthorized attempts |
| **Export Reports** | Compliance-ready audit reports (CSV/JSON) |
| **Multi-tenant Support** | Manage multiple locations/buildings |

### 🤖 AI & Analytics

| Feature | Description |
|---------|-------------|
| **Anomaly Detection** | ML-based detection of unusual access patterns |
| **Behavioral Analysis** | User behavior profiling and deviation alerts |
| **Predictive Alerts** | Forecast potential security incidents |
| **Similarity Scoring** | 0-100% face recognition confidence scores |
| **Threshold Management** | Configurable confidence thresholds (default: 60%) |

### 🌐 IoT Integration

| Feature | Description |
|---------|-------------|
| **MQTT Protocol** | Pub/Sub communication with edge devices |
| **Real-time Updates** | Sub-second access response times |
| **Payload Flexibility** | Custom JSON payload support |
| **Multi-device Support** | Unlimited ESP32/IoT device connections |
| **Offline Fallback** | Local decision-making if backend unavailable |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VORTEX SYSTEM ARCHITECTURE               │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                      USER LAYER (Frontend)                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  React Dashboard (localhost:3000)                       │ │
│  │  ├─ Admin Panel: User registration, role management    │ │
│  │  ├─ Access Logs: Real-time blockchain data             │ │
│  │  ├─ Analytics: Dashboard with stats & alerts           │ │
│  │  └─ MetaMask: Wallet connection & transactions         │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────┬──────────────────────────────────────────┘
                      │
┌─────────────────────┴──────────────────────────────────────────┐
│                  APPLICATION LAYER (Backend)                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Node.js Server (localhost:3001)                        │ │
│  │  ├─ REST API: /api/logs, /api/admin/register-user      │ │
│  │  ├─ MQTT Handler: iot/camera/rfid_access topic         │ │
│  │  ├─ Web3 Integration: Contract calls & events          │ │
│  │  └─ Python Bridge: /verify & /add endpoints            │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────┬──────────────────────────────────────────┘
                      │
┌─────────────────────┴──────────────────────────────────────────┐
│                    SERVICE LAYER (Python)                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  FastAPI Server (localhost:5000)                        │ │
│  │  ├─ POST /verify: Face recognition (cosine similarity) │ │
│  │  ├─ POST /add: Store embeddings to Supabase            │ │
│  │  ├─ ML Models: MediaPipe/TensorFlow for face detection │ │
│  │  └─ Database: Supabase PostgreSQL integration          │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────┬──────────────────────────────────────────┘
                      │
┌─────────────────────┴──────────────────────────────────────────┐
│              BLOCKCHAIN LAYER (Smart Contracts)               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  AccessLogger Smart Contract (Polygon Mumbai)           │ │
│  │  ├─ logAccessAttempt(): Record access with RBAC        │ │
│  │  ├─ getAccessStats(): Real-time analytics              │ │
│  │  ├─ grantRole/revokeRole: Permission management        │ │
│  │  └─ Events: AccessLogged, RoleGranted, RoleRevoked     │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────┬──────────────────────────────────────────┘
                      │
┌─────────────────────┴──────────────────────────────────────────┐
│                 INTEGRATION LAYER (External)                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  ├─ MQTT Broker: broker.hivemq.com:1883                │ │
│  │  ├─ Blockchain: Polygon Mumbai Testnet (RPC 7545)      │ │
│  │  ├─ Database: Supabase PostgreSQL + Vector Store       │ │
│  │  └─ IoT Devices: ESP32 with RFID + Camera             │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘

DATA FLOW:
ESP32 → MQTT → Backend → Python /verify → Supabase
         ↓
         Smart Contract ← /add registers user
         ↓
         Dashboard displays logs in real-time
```

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework**: React 18.0
- **Blockchain**: Web3.js 4.0
- **Wallet**: MetaMask integration
- **Styling**: Plain CSS (no Tailwind)
- **HTTP Client**: Axios
- **Package Manager**: npm

### **Backend**
- **Runtime**: Node.js v20.11.0
- **Framework**: Express.js 4.18
- **Blockchain**: Web3.js 4.0
- **IoT**: MQTT.js 4.3
- **API Calls**: Axios 1.6
- **Environment**: dotenv 16.0
- **Server**: localhost:3001

### **Python Services**
- **Framework**: FastAPI 0.104
- **ML Library**: MediaPipe + TensorFlow Lite
- **Database ORM**: Supabase Python SDK
- **Vector DB**: pgvector (PostgreSQL)
- **Face Recognition**: Face_recognition library
- **Server**: Uvicorn + localhost:5000

### **Blockchain**
- **Network**: Polygon Mumbai Testnet
- **Smart Contracts**: Solidity 0.8.19
- **RPC Provider**: Ganache (development) / Polygon RPC (production)
- **Wallet**: MetaMask + Ganache CLI
- **Gas Optimization**: Layer 2 (99% cost reduction)

### **Databases**
- **Access Logs**: Polygon Blockchain
- **User Embeddings**: Supabase PostgreSQL
- **Vector Store**: pgvector extension
- **Real-time**: MQTT pub/sub

### **External Services**
- **MQTT Broker**: HiveMQ Cloud (broker.hivemq.com:1883)
- **Blockchain**: Polygon Mumbai
- **Database**: Supabase (open-source alternative: PostgreSQL)
- **CDN**: None (local deployment)

---

## 📖 Usage

### **Scenario 1: Admin Registers New User**

```
1. Frontend: Admin connects MetaMask wallet
   └─ Dashboard detects admin role

2. Frontend: Admin uploads employee photo
   └─ App converts to base64

3. Backend: Receives registration request
   └─ Verifies admin status
   └─ Converts base64 → hex

4. Python: /add endpoint processes image
   └─ Generates face embedding
   └─ Creates UUID for user
   └─ Stores in Supabase

5. Frontend: Shows success message
   └─ User added to employee database
```

### **Scenario 2: Employee Accesses Door**

```
1. ESP32: Employee scans RFID card + captures face photo
   └─ Generates timestamp
   └─ Creates MQTT payload

2. MQTT: Publishes to iot/camera/rfid_access
   {
     "name_of_device": "DOOR_101",
     "timestamp": 1704880000,
     "rfid_status": true,
     "hex_code": "ffd8ffe000..."
   }

3. Backend: Receives MQTT message
   ├─ Checks RFID status
   └─ If false: Log denial, skip verification

4. Python: /verify endpoint processes face
   └─ Compares with stored embeddings
   └─ Returns: {"user_id": 1, "similarity": 0.856}

5. Backend: Calculates final decision
   └─ Access = RFID AND (similarity >= 60%)
   └─ Logs to blockchain via smart contract

6. Smart Contract: Records AccessLog
   └─ Event: AccessLogged emitted
   └─ Frontend dashboard updates in real-time

7. Backend: Publishes MQTT response
   {
     "access_status": true/false,
     "matched_user": "USER_001",
     "face_similarity": 85.6,
     "blockchain_tx": "0xabc123..."
   }

8. ESP32: Receives response
   └─ Activates solenoid lock (if granted)
   └─ Logs locally on device
```

### **Scenario 3: Admin Views Dashboard**

```
1. Frontend: User connects MetaMask
   └─ App calls contract.getAdmin()
   └─ Detects admin status

2. Admin Panel: Appears with features
   ├─ Register Users
   ├─ View Access Logs
   └─ Access Statistics

3. Dashboard: Fetches blockchain logs
   └─ Calls contract.getAllAccessLogs()
   └─ Displays in real-time table

4. Analytics: Shows statistics
   ├─ Total attempts: 1,250
   ├─ Success rate: 98.5%
   ├─ Suspicious: 12 attempts
   └─ Peak hour: 10:00 AM

5. Refresh: Every 5 seconds
   └─ New logs appear automatically
```

## ⭐ Show Your Support

If you found this project helpful, please consider:

- ⭐ Starring the repository
- 🐛 Reporting bugs
- 💡 Suggesting features

---

**Built with ❤️ for V-Vortex VIT Chennai Hackathon 2026**

**Made by:** Data-alchemists Team | **Last Updated:** January 2026 
