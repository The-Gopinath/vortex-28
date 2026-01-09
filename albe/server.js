require("dotenv").config();
const express = require("express");
const mqtt = require("mqtt");
const { Web3 } = require("web3"); // ✅ FIXED: Destructuring import
const cors = require("cors");
const ABI = require("../access-logger/build/contracts/AccessLogger.json").abi ; 

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ===== BLOCKCHAIN SETUP =====
const web3 = new Web3("http://127.0.0.1:7545"); // ✅ Now works!
const CONTRACT_ADDRESS ="0xE38a19117595de3979A68D47a0c30fdd676AeA32";
const PRIVATE_KEY = "0xe7a3bb0596a4ca2f3331150bb84b8ba4e1939404c65386e51b0e93fb65e42c89";



let accessLogger;
let backendAccount;

async function initBlockchain() {
  try {
    const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
    backendAccount = account.address;
    web3.eth.accounts.wallet.add(account);
    accessLogger = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    
    console.log("✓ Backend account:", backendAccount);
    console.log("✓ Contract address:", CONTRACT_ADDRESS);
    console.log("💰 Balance:", web3.utils.fromWei(await web3.eth.getBalance(backendAccount), 'ether'), "ETH");
  } catch (error) {
    console.error("❌ Blockchain init failed:", error.message);
    process.exit(1);
  }
}

// ===== PYTHON API INTEGRATION =====
const axios = require("axios");

// ===== FIXED: Python /verify (only img_hex) =====
async function verifyFaceWithPython(liveImageHex) {
  try {
    console.log("🔗 Calling Python /verify...");
    
    const response = await axios.post("http://localhost:5000/verify", {
      img_hex: liveImageHex
    }, { 
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000 
    });

    // ✅ FIXED: Python returns "score", backend expects "similarity"
    const { user_id, score } = response.data;
    const similarity = score * 100; // ✅ Convert 0.85 → 85%
    
    console.log(`   Python: user_id=${user_id}, similarity=${similarity.toFixed(1)}%`);

    if (user_id !== -1 && similarity >= 60) {
      return {
        matched: true,
        userId: `USER_${user_id.toString().padStart(3, '0')}`,
        similarity: similarity
      };
    } else {
      return {
        matched: false,
        userId: "UNKNOWN_USER",
        similarity: similarity
      };
    }
  } catch (error) {
    console.error("❌ Python /verify failed:", error.response?.data || error.message);
    return { matched: false, userId: "PYTHON_ERROR", similarity: 0 };
  }
}


async function registerUserWithPython(userId, referenceImageHex) {
  try {
    console.log(`🔗 Calling Python /add for ${userId}...`);
    
    // ✅ FIXED: Matches VerifyRequest (img_hex only)
    const response = await axios.post("http://localhost:5000/add", {
      img_hex: referenceImageHex  // ← Single field (Python ignores user_id)
    }, { 
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000 
    });

    console.log("✓ Python /add success:", response.data);
    return response.data.success;  // ✅ Use Python response
  } catch (error) {
    console.error("❌ Python /add failed:", error.response?.data || error.message);
    return false;
  }
}


// ===== MQTT HANDLER =====
const BROKER = "broker.hivemq.com";
const PORT_1 = 8883;
const TOPIC = "iot/camera/rfid_access";

const mqttClient = mqtt.connect(`mqtt://${BROKER}:${PORT_1}`);

mqttClient.on("connect", () => {
  console.log(`✓ MQTT Connected: ${BROKER}:${PORT_1}`);
  mqttClient.subscribe(TOPIC);  // Your topic
  console.log(`📡 Subscribed: ${TOPIC}`);
});

mqttClient.on("message", async (topic, message) => {
  try {
    console.log(`\n📨 MQTT [${new Date().toISOString()}]`);
    const data = JSON.parse(message.toString());
    
    // ✅ NEW PAYLOAD FORMAT
    const { name_of_device, timestamp, rfid_status, hex_code } = data;
    const deviceId = name_of_device;
    const liveImageHex = hex_code;
    const rfidMatched = rfid_status;

    console.log(`   Device: ${deviceId} | RFID: ${rfidMatched}`);

    // RFID check
    if (!rfidMatched) {
      console.log("❌ No RFID");
      const tx = await accessLogger.methods
        .logAccessAttempt("NO_RFID_CARD", deviceId, false, false, false)
        .send({ from: backendAccount, gas: 500000 });
      
      mqttClient.publish(`${TOPIC}/response/${deviceId}`, JSON.stringify({
        granted: false, 
        userId: "NO_RFID_CARD", 
        reason: "RFID missing",
        txHash: tx.transactionHash, 
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // Python face verification
    const matchResult = await verifyFaceWithPython(liveImageHex);
    const imageMatched = matchResult.matched;
    const accessGranted = rfidMatched && imageMatched;

    console.log(`   Face: ${matchResult.userId} (${matchResult.similarity}%)`);
    console.log(`   Access: ${accessGranted ? "✅ GRANTED" : "❌ DENIED"}`);

    // Blockchain log
    const tx = await accessLogger.methods
      .logAccessAttempt(matchResult.userId, deviceId, rfidMatched, imageMatched, accessGranted)
      .send({ from: backendAccount, gas: 500000 });

    console.log(`✓ TX: ${tx.transactionHash}`);

    // Response back to device (NEW format)
    mqttClient.publish(`${TOPIC}/response/${deviceId}`, JSON.stringify({
      access_status: accessGranted,           // ✅ Your format
      matched_user: matchResult.userId,       // ✅ Your format
      face_similarity: matchResult.similarity,
      rfid_status: rfidMatched,
      face_status: imageMatched,
      blockchain_tx: tx.transactionHash,
      timestamp: new Date().toISOString()
    }));
  } catch (err) {
    console.error("❌ MQTT Error:", err.message);
  }
});


// ===== API ENDPOINTS =====
app.get("/api/logs", async (req, res) => {
  try {
    const logs = await accessLogger.methods.getAllAccessLogs().call();
    const formatted = logs.map(log => ({
      userId: log.userId,
      deviceId: log.deviceId,
      time: new Date(Number(log.timestamp) * 1000).toLocaleString(),
      rfidMatched: log.rfidMatched,
      imageMatched: log.imageMatched,
      accessGranted: log.accessGranted
    }));
    res.json({ success: true, logs: formatted.reverse() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// app.post("/api/admin/register-user", async (req, res) => {
//   try {
//     const { userId, referenceImage, adminAddress } = req.body;

//     if (!userId || !referenceImage || !adminAddress) {
//       return res.status(400).json({ error: "Missing data" });
//     }

//     // Admin verification
//     const contractAdmin = await accessLogger.methods.getAdmin().call();
//     if (adminAddress.toLowerCase() !== contractAdmin.toLowerCase()) {
//       return res.status(403).json({ error: "Admin only" });
//     }

//     // Base64 → Hex
//     const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, "");
//     const buffer = Buffer.from(base64Data, 'base64');
//     const imageHex = buffer.toString('hex');

//     // Python registration
//     const success = await registerUserWithPython(userId, imageHex);
//     if (!success) {
//       return res.status(500).json({ error: "Python registration failed" });
//     }

//     res.json({ 
//       success: true, 
//       message: `User ${userId} registered in Supabase!` 
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });
//   }
// });

app.post("/api/admin/register-user", async (req, res) => {
  try {
    const { userId, referenceImage, adminAddress } = req.body;
    console.log("🆕 Register attempt:", { userId, adminAddress }); // ✅ DEBUG

    if (!userId || !referenceImage || !adminAddress) {
      console.log("❌ Missing fields");
      return res.status(400).json({ error: "Missing userId/image/adminAddress" });
    }

    // Admin verification
    const contractAdmin = await accessLogger.methods.getAdmin().call();
    console.log("🔑 Contract admin:", contractAdmin);
    console.log("👤 Request admin:", adminAddress);
    
    if (adminAddress.toLowerCase() !== contractAdmin.toLowerCase()) {
      console.log("❌ Admin mismatch");
      return res.status(403).json({ error: "Only admin can register users" });
    }

    // ✅ FIXED: Safe Base64 → Hex
    let imageHex;
    try {
      const base64Data = referenceImage.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      imageHex = buffer.toString('hex');
      console.log("📸 Image hex length:", imageHex.length);
    } catch (hexError) {
      console.error("❌ Hex conversion failed:", hexError.message);
      return res.status(500).json({ error: "Invalid image format" });
    }

    // Python registration
    const pythonSuccess = await registerUserWithPython(userId, imageHex);
    if (!pythonSuccess) {
      console.error("❌ Python failed");
      return res.status(500).json({ error: "Supabase registration failed" });
    }

    console.log("✅ User registered:", userId);
    res.json({ 
      success: true, 
      message: `User ${userId} registered successfully!`,
      userId,
      python: true
    });
  } catch (err) {
    console.error("💥 FULL ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/admin/users", (req, res) => {
  res.json({ 
    success: true, 
    message: "Users in Python/Supabase", 
    users: [],
    python: "localhost:5000/add"
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  await initBlockchain();
  console.log(`\n✅ Backend: http://localhost:${PORT}`);
  console.log(`🔗 Python: localhost:5000/verify,/add`);
});
