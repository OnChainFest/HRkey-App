// HRKeyRegistry Contract ABI
const HRKEY_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "bytes32", "name": "refId", "type": "bytes32"},
      {"indexed": true, "internalType": "address", "name": "employee", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "reviewer", "type": "address"},
      {"indexed": false, "internalType": "bytes32", "name": "dataHash", "type": "bytes32"}
    ],
    "name": "ReferenceCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "bytes32", "name": "refId", "type": "bytes32"},
      {"indexed": false, "internalType": "uint8", "name": "newStatus", "type": "uint8"}
    ],
    "name": "ReferenceStatusChanged",
    "type": "event"
  },
  {
    "inputs": [
      {"internalType": "bytes32", "name": "refId", "type": "bytes32"},
      {"internalType": "address", "name": "employee", "type": "address"},
      {"internalType": "address", "name": "reviewer", "type": "address"},
      {"internalType": "bytes32", "name": "dataHash", "type": "bytes32"}
    ],
    "name": "createReference",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
    "name": "references",
    "outputs": [
      {"internalType": "address", "name": "employee", "type": "address"},
      {"internalType": "address", "name": "reviewer", "type": "address"},
      {"internalType": "bytes32", "name": "dataHash", "type": "bytes32"},
      {"internalType": "uint64", "name": "createdAt", "type": "uint64"},
      {"internalType": "uint8", "name": "status", "type": "uint8"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "refId", "type": "bytes32"}],
    "name": "revoke",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "refId", "type": "bytes32"}],
    "name": "suppress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

window.HRKEY_ABI = HRKEY_ABI;
