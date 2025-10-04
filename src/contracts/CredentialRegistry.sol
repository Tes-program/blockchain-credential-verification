// contracts/CredentialRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./InstitutionRegistry.sol";

contract CredentialRegistry {
    InstitutionRegistry public institutionRegistry;
    
    struct Credential {
        string credentialId;
        address issuer;
        string recipientId;
        string credentialHash;
        string ipfsHash;
        uint256 issueDate;
        uint256 expiryDate;
        bool isRevoked;
        uint256 revokedDate;
    }
    
    mapping(string => Credential) private credentials;
    
    event CredentialIssued(
        string credentialId,
        address indexed issuer,
        string recipientId,
        string credentialHash,
        string ipfsHash,
        uint256 issueDate
    );
    
    event CredentialRevoked(
        string credentialId,
        uint256 revokedDate
    );
    
    constructor(address _institutionRegistryAddress) {
        institutionRegistry = InstitutionRegistry(_institutionRegistryAddress);
    }
    
    modifier onlyRegisteredInstitution() {
        require(institutionRegistry.isRegistered(msg.sender), "Caller is not a registered institution");
        _;
    }
    
    function issueCredential(
        string memory _credentialId,
        string memory _recipientId,
        string memory _credentialHash,
        string memory _ipfsHash,
        uint256 _expiryDate
    ) public onlyRegisteredInstitution {
        require(bytes(credentials[_credentialId].credentialId).length == 0, "Credential ID already exists");
        
        credentials[_credentialId] = Credential({
            credentialId: _credentialId,
            issuer: msg.sender,
            recipientId: _recipientId,
            credentialHash: _credentialHash,
            ipfsHash: _ipfsHash,
            issueDate: block.timestamp,
            expiryDate: _expiryDate,
            isRevoked: false,
            revokedDate: 0
        });
        
        emit CredentialIssued(
            _credentialId,
            msg.sender,
            _recipientId,
            _credentialHash,
            _ipfsHash,
            block.timestamp
        );
    }
    
    function revokeCredential(string memory _credentialId) public {
        Credential storage credential = credentials[_credentialId];
        
        require(bytes(credential.credentialId).length != 0, "Credential does not exist");
        require(credential.issuer == msg.sender, "Only issuer can revoke credential");
        require(!credential.isRevoked, "Credential is already revoked");
        
        credential.isRevoked = true;
        credential.revokedDate = block.timestamp;
        
        emit CredentialRevoked(_credentialId, block.timestamp);
    }
    
    function verifyCredential(string memory _credentialId) public view returns (
        bool isValid,
        address issuer,
        string memory recipientId,
        string memory ipfsHash,
        uint256 issueDate,
        bool isRevoked
    ) {
        Credential memory credential = credentials[_credentialId];
        
        require(bytes(credential.credentialId).length != 0, "Credential does not exist");
        
        // Check if expired
        bool isExpired = false;
        if (credential.expiryDate > 0) {
            isExpired = block.timestamp > credential.expiryDate;
        }
        
        isValid = !credential.isRevoked && !isExpired;
        
        return (
            isValid,
            credential.issuer,
            credential.recipientId,
            credential.ipfsHash,
            credential.issueDate,
            credential.isRevoked
        );
    }
    
    function getCredentialHash(string memory _credentialId) public view returns (string memory) {
        return credentials[_credentialId].credentialHash;
    }
}