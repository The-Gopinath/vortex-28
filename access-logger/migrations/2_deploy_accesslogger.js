const AccessLogger = artifacts.require("AccessLogger");

module.exports = async function (deployer, network, accounts) {
  // ✅ Ganache Account #0 (has 100 ETH)
  const backendAddress = accounts[0]; 
  
  console.log("🚀 Deploying with backend:", backendAddress);
  
  await deployer.deploy(AccessLogger, backendAddress);
  
  console.log("✅ AccessLogger deployed!");
  console.log("📍 CONTRACT ADDRESS:", AccessLogger.address);
  console.log("🔑 BACKEND WALLET:", backendAddress);
  console.log("👑 ADMIN (deployer):", accounts[0]);
  console.log("💰 Funds:", web3.utils.fromWei(await web3.eth.getBalance(backendAddress), 'ether'), "ETH");
};
