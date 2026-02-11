import React, { useState, useEffect, useCallback } from 'react';
import Web3 from 'web3';
import './App.css';
import ABI from './ABI.json';

function App() {
  const [web3, setWeb3] = useState(null);
  const [account, setAccount] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminAddress, setAdminAddress] = useState(null);
  const [contract, setContract] = useState(null);
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [referenceImage, setReferenceImage] = useState(null);
  const [registering, setRegistering] = useState(false);

  // ✅ YOUR CONTRACT ADDRESS
  const CONTRACT_ADDRESS = "0xE38a19117595de3979A68D47a0c30fdd676AeA32";
  
  // ✅ INLINE ABI - NO IMPORT ERRORS


  // Web3 & MetaMask init
  useEffect(() => {
    const initWeb3 = async () => {
      if (window.ethereum) {
        try {
          const web3Instance = new Web3(window.ethereum);
          setWeb3(web3Instance);

          const accounts = await web3Instance.eth.getAccounts();
          if (accounts.length > 0) {
            setAccount(accounts[0]);
            await setupContract(web3Instance, accounts[0]);
          }

          window.ethereum.on('accountsChanged', async (accounts) => {
            if (accounts.length > 0) {
              setAccount(accounts[0]);
              await setupContract(web3Instance, accounts[0]);
            } else {
              setAccount(null);
              setIsAdmin(false);
            }
          });
        } catch (error) {
          console.error('Web3 init error:', error);
        }
      } else {
        alert('Please install MetaMask!');
      }
    };
    initWeb3();
  }, []);

  // ✅ useCallback: Fixes ESLint warning
  const setupContract = useCallback(async (web3Instance, userAccount) => {
    try {
      const contractInstance = new web3Instance.eth.Contract(ABI.abi, CONTRACT_ADDRESS);
      setContract(contractInstance);

      const adminAddr = await contractInstance.methods.getAdmin().call();
      setAdminAddress(adminAddr);

      const isUserAdmin = userAccount.toLowerCase() === adminAddr.toLowerCase();
      setIsAdmin(isUserAdmin);

      console.log('✓ Connected:', userAccount);
      console.log('✓ Admin:', adminAddr);
      console.log('✓ Is Admin:', isUserAdmin);

      await fetchLogs(contractInstance);
      if (isUserAdmin) await fetchUsers();
    } catch (error) {
      console.error('Contract setup error:', error);
    }
  }, [ABI, CONTRACT_ADDRESS]);

  const handleConnectWallet = async () => {
    try {
      if (web3) {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts'
        });
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          await setupContract(web3, accounts[0]);
        }
      }
    } catch (error) {
      alert('Failed to connect wallet');
    }
  };

  const handleDisconnect = () => {
    setAccount(null);
    setIsAdmin(false);
    setContract(null);
  };

  // ✅ useCallback: ESLint safe
  const fetchLogs = useCallback(async (contractInstance) => {
    setLoading(true);
    try {
      const logsData = await contractInstance.methods.getAllAccessLogs().call();
      const formatted = logsData.map((log) => ({
        userId: log.userId,
        deviceId: log.deviceId,
        time: new Date(Number(log.timestamp) * 1000).toLocaleString(),
        rfidMatched: log.rfidMatched,
        imageMatched: log.imageMatched,
        accessGranted: log.accessGranted
      }));
      setLogs(formatted.reverse());
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
    setLoading(false);
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3001/api/admin/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  }, []);

  function base64ToHex(base64DataUrl) {
  // Remove data:image/...;base64, prefix
  const base64 = base64DataUrl.split(",")[1];

  // Decode base64 to binary string
  const binary = atob(base64);

  // Convert binary string to hex
  let hex = "";
  for (let i = 0; i < binary.length; i++) {
    hex += binary.charCodeAt(i).toString(16).padStart(2, "0");
  }

  return hex;
}


  const handleRegisterUser = async () => {
    if (!newUserId || !referenceImage) {
      alert('Enter user ID and select image');
      return;
    }

    setRegistering(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Image = e.target.result;
        const res = await fetch('http://localhost:3001/api/admin/register-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: newUserId,
            referenceImage: base64Image,
            adminAddress: account
          })
        });

        const data = await res.json();
        if (data.success==1) {
          alert(`✅ User ${newUserId} registered in Supabase!`);
          setNewUserId('');
          setReferenceImage(null);
          fetchUsers();
          fetchLogs(contract);
        } else {
          alert(`❌ Error: ${data.error}`);
        }
        setRegistering(false);
      };
      reader.readAsDataURL(referenceImage);
    } catch (err) {
      console.error('Registration error:', err);
      alert('Error registering user');
      setRegistering(false);
    }
  };

  // ✅ FIXED: ESLint safe
  useEffect(() => {
    let interval;
    if (contract) {
      interval = setInterval(() => {
        fetchLogs(contract);
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [contract, fetchLogs]);

  const accountAddress = account ? 
    `${account.substring(0, 6)}...${account.substring(account.length - 4)}` : null;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1>VORTEX Access Logger</h1>
          {!account ? (
            <button className="connect-btn" onClick={handleConnectWallet}>
              🦊 Connect MetaMask
            </button>
          ) : (
            <div className="wallet-info">
              <div className="role">{isAdmin ? '👑 ADMIN' : '👤 Public User'}</div>
              <div className="address">{accountAddress}</div>
              <button className="disconnect-btn" onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="main">
        {!account && (
          <div className="connect-section">
            <div className="connect-icon">🦊</div>
            <h2>Connect Your MetaMask Wallet</h2>
            <p>Connect your wallet to access the VORTEX system. Deployer account has admin privileges.</p>
            <button className="connect-btn-large" onClick={handleConnectWallet}>
              🦊 Connect MetaMask
            </button>
          </div>
        )}

        {account && isAdmin && (
          <div className="admin-panels">
            <div className="panel register-panel">
              <h3>➕ Register New User</h3>
              <div className="info-box success">
                🔗 Python localhost:5000/add → Supabase DB
              </div>
              <div className="form-group">
                <label>User ID</label>
                <input
                  type="text"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  placeholder="USER_003"
                />
              </div>
              <div className="form-group">
                <label>Reference Face Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setReferenceImage(e.target.files[0])}
                />
                {referenceImage && <p className="file-name">✓ {referenceImage.name}</p>}
              </div>
              <button
                className="register-btn"
                disabled={registering || !newUserId || !referenceImage}
                onClick={handleRegisterUser}
              >
                {registering ? '🤖 Registering via Python...' : '✓ Register to Supabase'}
              </button>
            </div>

            {/* <div className="panel users-panel">
              <h3>👥 Registered Users ({users.length})</h3>
              <div className="users-info">
                Stored in Supabase<br/>
                Python service manages
              </div>
            </div> */}
          </div>
        )}

        {account && !isAdmin && (
          <div className="info-box info">
            ℹ️ <strong>Read-only view.</strong> Admin wallet: 
            <code>{adminAddress?.substring(0, 6)}...{adminAddress?.substring(adminAddress.length - 4)}</code> 
            manages users via Python/Supabase.
          </div>
        )}

        {/* Access Logs */}
        <div className="panel logs-panel">
          <div className="panel-header">
            <h3>📋 Access Logs ({logs.length})</h3>
            {account && (
              <button 
                className="refresh-btn" 
                onClick={() => fetchLogs(contract)} 
                disabled={loading}
              >
                🔄 Refresh
              </button>
            )}
          </div>

          {!account ? (
            <div className="empty-state">Connect wallet to view blockchain logs</div>
          ) : loading ? (
            <div className="loading-spinner">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="empty-state">No access attempts recorded yet</div>
          ) : (
            <div className="table-container">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User ID</th>
                    <th>Device</th>
                    <th>RFID</th>
                    <th>Image</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr key={idx}>
                      <td>{log.time}</td>
                      <td><span className="badge indigo">{log.userId}</span></td>
                      <td>{log.deviceId}</td>
                      <td className={`badge ${log.rfidMatched ? 'success' : 'danger'}`}>
                        {log.rfidMatched ? '✓' : '✗'}
                      </td>
                      <td className={`badge ${log.imageMatched ? 'success' : 'danger'}`}>
                        {log.imageMatched ? '✓' : '✗'}
                      </td>
                      <td className={`badge ${log.accessGranted ? 'success' : 'danger'}`}>
                        {log.accessGranted ? '✅ GRANT' : '❌ DENY'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
