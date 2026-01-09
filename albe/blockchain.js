// backend/blockchain.js
// NO file dependencies - manually enter contract address and ABI

const Web3 = require("web3");

const ABI = require("./AccessLogger.json");

const web3 = new Web3("http://127.0.0.1:7545"); // Ganache RPC

// ===== MANUAL CONFIGURATION =====
// Copy these from Truffle migration output
const CONTRACT_ADDRESS = "0x3623F5631A2aB636c4cde28502E818A3aD5F5f8b"; // from "AccessLogger deployed at: 0x..."
const BACKEND_ACCOUNT = "0xCC75dAb4C88De5257a84c7F182c7A9B41CE2d41F";

// Copy ABI from build/contracts/AccessLogger.json -> "abi" array

// ===== PRIVATE KEY (for signing transactions) =====
// In Ganache GUI: Accounts tab → Copy private key of account[0]
// Or use Ganache CLI default private key
const PRIVATE_KEY = "0xf27dcebd5cc9b0bb442064f6bfe04d7b37a0029c01bd7de974b4dd9c4ccf2543"; // from Ganache account[0]

let accessLogger;
let backendAccount;

async function initBlockchain() {
  // Use account with private key
  const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
  backendAccount = account.address;
  web3.eth.accounts.wallet.add(account);

  console.log("Backend account:", backendAccount);

  // Create contract instance
  accessLogger = new web3.eth.Contract(ABI.abi, CONTRACT_ADDRESS);

  console.log("AccessLogger at:", CONTRACT_ADDRESS);
  console.log("✅ Blockchain initialized");
}

// ===== WRITE: Log a verified access attempt =====
async function writeAccessLog({ userId, deviceId, granted }) {
  console.log(`📝 Logging: ${userId} → ${deviceId} → ${granted ? "GRANTED" : "DENIED"}`);

  const tx = await accessLogger.methods
    .logVerifiedAccess(userId, deviceId, granted)
    .send({ 
      from: backendAccount, 
      gas: 300000 
    });

  console.log("✅ Tx hash:", tx.transactionHash);
  return tx.transactionHash;
}

// ===== READ: Get all access logs =====
async function readAllAccessLogs() {
  console.log("📖 Reading access logs...");
  const logs = await accessLogger.methods.getAllAccessLogs().call();

  // Convert raw Solidity return to clean JSON
  return logs.map((log, index) => ({
    id: index + 1,  // 1-based for display
    userId: log.userId,
    deviceId: log.deviceId,
    timestamp: Number(log.timestamp) * 1000, // convert to JS timestamp
    granted: log.granted,
    time: new Date(Number(log.timestamp) * 1000).toLocaleString()
  }));
}

module.exports = {
  initBlockchain,
  writeAccessLog,
  readAllAccessLogs
};
