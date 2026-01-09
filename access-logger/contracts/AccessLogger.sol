// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract AccessLogger {
    /**
     * @title VORTEX - Blockchain-Backed Secure IoT Access Control System
     * @notice Complete smart contract for immutable access logging with admin management
     * @dev Production-ready for Polygon/Ganache deployment
     */
    
    struct AccessLog {
        string userId;          // "USER_001", "UNKNOWN_USER", "NO_RFID_CARD", "PYTHON_ERROR"
        string deviceId;        // "DOOR_101", "GATE_001"
        uint256 timestamp;      // block.timestamp (immutable)
        bool rfidMatched;       // RFID card detected
        bool imageMatched;      // Python /verify result
        bool accessGranted;     // Final decision (RFID AND image)
    }

    // State variables
    AccessLog[] public accessLogs;
    address public backend;       // ✅ FIXED: Mutable (admin can update if compromised)
    address public immutable admin;       // Admin wallet (deployment address)
    uint256 public totalLogs;             // Log counter
    mapping(string => uint256[]) public userLogs;  // userId → log indices
    mapping(string => uint256[]) public deviceLogs; // deviceId → log indices

    // Events for frontend indexing
    event AccessLogged(
        string indexed userId,
        string indexed deviceId,
        bool rfidMatched,
        bool imageMatched,
        bool accessGranted,
        uint256 timestamp,
        uint256 indexed logId
    );
    event BackendUpdated(address oldBackend, address newBackend);
    event AdminVerified(address indexed wallet, bool isAdmin);

    /**
     * @dev Constructor sets backend and admin addresses
     * @param _backend Node.js backend server address
     */
    constructor(address _backend) {
        require(_backend != address(0), "Invalid backend address");
        backend = _backend;
        admin = msg.sender;  // Deployer becomes admin
    }

    modifier onlyBackend() {
        require(msg.sender == backend, "Only backend server allowed");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin allowed");
        _;
    }

    /**
     * @notice Core function: Backend calls this after RFID + Python face verification
     * @param _userId Matched user or "UNKNOWN_USER"/"NO_RFID_CARD"
     * @param _deviceId IoT device identifier
     * @param _rfidMatched RFID card detected
     * @param _imageMatched Python /verify result (similarity >= 70%)
     * @param _accessGranted Final decision (RFID && image)
     */
    function logAccessAttempt(
        string memory _userId,
        string memory _deviceId,
        bool _rfidMatched,
        bool _imageMatched,
        bool _accessGranted
    ) external onlyBackend {
        uint256 logId = totalLogs;
        
        AccessLog memory log = AccessLog({
            userId: _userId,
            deviceId: _deviceId,
            timestamp: block.timestamp,
            rfidMatched: _rfidMatched,
            imageMatched: _imageMatched,
            accessGranted: _accessGranted
        });

        accessLogs.push(log);
        totalLogs++;

        // Index for efficient queries
        userLogs[_userId].push(logId);
        deviceLogs[_deviceId].push(logId);

        emit AccessLogged(
            _userId,
            _deviceId,
            _rfidMatched,
            _imageMatched,
            _accessGranted,
            block.timestamp,
            logId
        );
    }

    /**
     * @notice Frontend calls this to verify admin status
     * @return adminAddress Admin wallet address
     */
    function getAdmin() external view returns (address adminAddress) {
        return admin;
    }

    /**
     * @notice Get all access logs (for dashboard)
     * @return allLogs Array of all AccessLog structs
     */
    function getAllAccessLogs() external view returns (AccessLog[] memory allLogs) {
        return accessLogs;
    }

    /**
     * @notice Get total number of logs
     * @return logCount Total log entries
     */
    function getLogCount() external view returns (uint256 logCount) {
        return totalLogs;
    }

    /**
     * @notice Get recent logs (last N logs for dashboard pagination)
     * @param _count Number of recent logs to return
     * @return recentLogs Recent AccessLog array
     */
    function getRecentLogs(uint256 _count) external view returns (AccessLog[] memory recentLogs) {
        require(_count <= 50, "Max 50 recent logs");
        uint256 startIndex = totalLogs > _count ? totalLogs - _count : 0;
        
        recentLogs = new AccessLog[](_count);
        uint256 index = 0;
        
        for (uint256 i = startIndex; i < totalLogs && index < _count; i++) {
            recentLogs[index] = accessLogs[i];
            index++;
        }
    }

    /**
     * @notice Get logs for specific user (efficient indexing)
     * @param _userId User identifier
     * @return userAccessLogs User-specific AccessLog array
     */
    function getLogsByUser(string memory _userId) external view returns (AccessLog[] memory userAccessLogs) {
        uint256[] memory indices = userLogs[_userId];
        userAccessLogs = new AccessLog[](indices.length);
        
        for (uint256 i = 0; i < indices.length; i++) {
            userAccessLogs[i] = accessLogs[indices[i]];
        }
    }

    /**
     * @notice Get logs for specific device (efficient indexing)
     * @param _deviceId Device identifier
     * @return deviceAccessLogs Device-specific AccessLog array
     */
    function getLogsByDevice(string memory _deviceId) external view returns (AccessLog[] memory deviceAccessLogs) {
        uint256[] memory indices = deviceLogs[_deviceId];
        deviceAccessLogs = new AccessLog[](indices.length);
        
        for (uint256 i = 0; i < indices.length; i++) {
            deviceAccessLogs[i] = accessLogs[indices[i]];
        }
    }

    /**
     * @notice Get suspicious activity logs (RFID match but image fail)
     * @return suspiciousAccessLogs Suspicious AccessLog array
     */
    function getSuspiciousLogs() external view returns (AccessLog[] memory suspiciousAccessLogs) {
        uint256 count = 0;
        for (uint256 i = 0; i < totalLogs; i++) {
            if (accessLogs[i].rfidMatched && !accessLogs[i].imageMatched) {
                count++;
            }
        }
        
        suspiciousAccessLogs = new AccessLog[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < totalLogs; i++) {
            if (accessLogs[i].rfidMatched && !accessLogs[i].imageMatched) {
                suspiciousAccessLogs[index] = accessLogs[i];
                index++;
            }
        }
    }

    /**
     * @notice Get access statistics (for analytics dashboard)
     * @return totalAttempts Total access attempts
     * @return successfulAccess Successful grants
     * @return failedAccess Failed attempts
     * @return suspiciousAttempts RFID match + image fail
     * @return avgAccessTime Average access time (placeholder)
     */
    function getAccessStats() external view returns (
        uint256 totalAttempts,
        uint256 successfulAccess,
        uint256 failedAccess,
        uint256 suspiciousAttempts,
        uint256 avgAccessTime
    ) {
        totalAttempts = totalLogs;
        uint256 successCount = 0;
        uint256 suspiciousCount = 0;

        for (uint256 i = 0; i < totalLogs; i++) {
            if (accessLogs[i].accessGranted) {
                successCount++;
            }
            if (accessLogs[i].rfidMatched && !accessLogs[i].imageMatched) {
                suspiciousCount++;
            }
        }

        successfulAccess = successCount;
        failedAccess = totalAttempts - successCount;
        suspiciousAttempts = suspiciousCount;
        avgAccessTime = 0;
    }

    /**
     * @notice Emergency function: Admin can update backend address
     * @dev Use only if backend key is compromised
     * @param _newBackend New backend address
     */
    function updateBackend(address _newBackend) external onlyAdmin {
        require(_newBackend != address(0), "Invalid backend");
        address oldBackend = backend;
        backend = _newBackend;
        emit BackendUpdated(oldBackend, _newBackend);
    }

    /**
     * @notice Get contract deployment info
     * @return backendAddr Backend server address
     * @return adminAddr Admin wallet address
     * @return totalLogCount Total log entries
     * @return firstLogTime First log timestamp
     * @return lastLogTime Last log timestamp
     */
    function getContractInfo() external view returns (
        address backendAddr,
        address adminAddr,
        uint256 totalLogCount,
        uint256 firstLogTime,
        uint256 lastLogTime
    ) {
        backendAddr = backend;
        adminAddr = admin;
        totalLogCount = totalLogs;
        firstLogTime = totalLogs > 0 ? accessLogs[0].timestamp : 0;
        lastLogTime = totalLogs > 0 ? accessLogs[totalLogs - 1].timestamp : 0;
    }
}
