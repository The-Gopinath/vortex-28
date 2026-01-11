require("dotenv").config();

const express = require("express");
const mqtt = require("mqtt");
const { Web3 } = require("web3");
const cors = require("cors");
const axios = require("axios");

const ABI = require("../access-logger/build/contracts/AccessLogger.json").abi;

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const fs = require("fs");
const path = require("path");

// ======================================================
// BLOCKCHAIN SETUP
// ======================================================
const web3 = new Web3("http://127.0.0.1:7545"); // Ganache
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY;

let accessLogger;
let backendAccount;

async function initBlockchain() {
  try {
    const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
    backendAccount = account.address;
    web3.eth.accounts.wallet.add(account);

    accessLogger = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

    console.log("✓ Backend account:", backendAccount);
    console.log("✓ Contract:", CONTRACT_ADDRESS);
    console.log(
      "💰 Balance:",
      web3.utils.fromWei(await web3.eth.getBalance(backendAccount), "ether"),
      "ETH"
    );
  } catch (err) {
    console.error("❌ Blockchain init failed:", err.message);
    process.exit(1);
  }
}


// ======================================================
// PYTHON FACE API
// ======================================================
async function verifyFaceWithPython(imgId, maxWaitMs = 20000, pollIntervalMs = 500) {
  const start = Date.now();

  try {
    // 1️⃣ WAIT until Python confirms image exists
    while (Date.now() - start < maxWaitMs) {
      const statusRes = await axios.get(
        `http://localhost:5000/status/${imgId}`,
        { timeout: 5000 }
      );

      const { exists } = statusRes.data;

      if (exists) {
        console.log(`✅ Image ${imgId} exists in Python`);
        break;
      }

      console.log(`⏳ Waiting for Python image ${imgId}...`);
      await new Promise(res => setTimeout(res, pollIntervalMs));
    }

    // Final check
    const finalStatus = await axios.get(
      `http://localhost:5000/status/${imgId}`,
      { timeout: 5000 }
    );

    if (!finalStatus.data.exists) {
      console.log(`❌ Image ${imgId} still not found after waiting`);
      return {
        matched: false,
        userId: "IMAGE_TIMEOUT",
        similarity: 0
      };
    }

    // 2️⃣ Verify face (Python reads image itself)
    const verifyRes = await axios.post(
      "http://localhost:5000/verify",
      { img_id: imgId },
      { timeout: 15000 }
    );

    const { user_id, score } = verifyRes.data;
    const similarity = (score || 0) * 100;

    if (user_id !== -1 && similarity >= 60) {
      return {
        matched: true,
        userId: `USER_${user_id.toString().padStart(3, "0")}`,
        similarity
      };
    }

    return {
      matched: false,
      userId: "UNKNOWN_USER",
      similarity
    };

  } catch (err) {
    console.error("❌ Python verify flow failed:", err.message);
    return {
      matched: false,
      userId: "PYTHON_ERROR",
      similarity: 0
    };
  }
}



async function registerUserWithPython(imageHex) {
  try {
    const res = await axios.post(
      "http://localhost:5000/add",
      { img_id: imageHex },
      { timeout: 10000 }
    );
    return res.data.success === true;
  } catch (err) {
    console.error("❌ Python /add failed:", err.message);
    return false;
  }
}

// ======================================================
// MQTT (HIVEMQ CLOUD – TLS)
// ======================================================
const MQTT_BROKER = process.env.MQTT_BROKER;
const MQTT_PORT = process.env.MQTT_PORT;
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const TOPIC = "iot/camera/rfid_access";

const mqttClient = mqtt.connect({
  host: MQTT_BROKER,
  port: MQTT_PORT,
  protocol: "mqtts",
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  rejectUnauthorized: true,
});

mqttClient.on("connect", () => {
  console.log(`✓ MQTT Connected (TLS): ${MQTT_BROKER}:${MQTT_PORT}`);
  mqttClient.subscribe(TOPIC);
});

mqttClient.on("error", (err) => {
  console.error("❌ MQTT Error:", err.message);
});

async function imagePathToHex(imgId, retries = 10, delayMs = 300) {
  const baseDir = path.resolve(__dirname, "..", "backend_py", "images");
  const exts = [".jpg", ".jpeg", ".png"];

  for (let attempt = 1; attempt <= retries; attempt++) {
    for (const ext of exts) {
      const fullPath = path.join(baseDir, imgId + ext);
      if (fs.existsSync(fullPath)) {
        console.log("📸 Image found:", fullPath);
        return fs.readFileSync(fullPath).toString("hex");
      }
    }

    console.log(`⏳ Waiting for image ${imgId} (attempt ${attempt}/${retries})`);
    await new Promise(res => setTimeout(res, delayMs));
  }

  throw new Error(`Image not found after waiting: ${imgId}`);
}


mqttClient.on("message", async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    const { name_of_device, rfid_status, img_id } = data;

    const deviceId = name_of_device;
    const rfidMatched = rfid_status;

    if (!rfidMatched) {
      const tx = await accessLogger.methods
        .logAccessAttempt("NO_RFID_CARD", deviceId, false, false, false)
        .send({ from: backendAccount, gas: 500000 });

      mqttClient.publish(
        `${TOPIC}/response/${deviceId}`,
        JSON.stringify({
          access_status: false,
          reason: "RFID missing",
          blockchain_tx: tx.transactionHash,
        })
      );
      return;
    }

    const faceResult = await verifyFaceWithPython(img_id);
    const accessGranted = rfidMatched && faceResult.matched;

    const tx = await accessLogger.methods
      .logAccessAttempt(
        faceResult.userId,
        deviceId,
        rfidMatched,
        faceResult.matched,
        accessGranted
      )
      .send({ from: backendAccount, gas: 500000 });

    mqttClient.publish(
      `${TOPIC}/response/${deviceId}`,
      JSON.stringify({
        access_status: accessGranted,
        matched_user: faceResult.userId,
        face_similarity: faceResult.similarity,
        rfid_status: rfidMatched,
        face_status: faceResult.matched,
        blockchain_tx: tx.transactionHash,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (err) {
    console.error("❌ MQTT Message Error:", err.message);
  }
});

// ======================================================
// API ROUTES
// ======================================================
app.get("/api/logs", async (req, res) => {
  try {
    const logs = await accessLogger.methods.getAllAccessLogs().call();
    const formatted = logs.map((l) => ({
      userId: l.userId,
      deviceId: l.deviceId,
      time: new Date(Number(l.timestamp) * 1000).toLocaleString(),
      rfidMatched: l.rfidMatched,
      imageMatched: l.imageMatched,
      accessGranted: l.accessGranted,
    }));
    res.json({ success: true, logs: formatted.reverse() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/register-user", async (req, res) => {
  try {
    const { referenceImage, adminAddress } = req.body;

    const contractAdmin = await accessLogger.methods.getAdmin().call();
    if (adminAddress.toLowerCase() !== contractAdmin.toLowerCase()) {
      return res.status(403).json({ error: "Admin only" });
    }

    const base64 = referenceImage.replace(/^data:image\/\w+;base64,/, "");
    const imageHex = Buffer.from(base64, "base64").toString("hex");

    const success = await registerUserWithPython(imageHex);
    if (!success) {
      return res.status(500).json({ error: "Python registration failed" });
    }

    res.json({ success: 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  await initBlockchain();
  console.log(`✅ Backend running: http://localhost:${PORT}`);
});