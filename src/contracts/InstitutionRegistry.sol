// contracts/InstitutionRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract InstitutionRegistry {
    struct Institution {
        string institutionId;
        string name;
        string institutionType;
        string country;
        bool isActive;
        uint256 registrationDate;
    }
    
    mapping(address => Institution) private institutions;
    mapping(string => address) private institutionIdToAddress;
    
    address public admin;
    
    event InstitutionRegistered(
        address indexed institutionAddress,
        string institutionId,
        string name,
        uint256 registrationDate
    );
    
    event InstitutionStatusChanged(
        address indexed institutionAddress,
        bool isActive
    );
    
    constructor() {
        admin = msg.sender;
    }
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }
    
    function registerInstitution(
        address _institutionAddress,
        string memory _institutionId,
        string memory _name,
        string memory _institutionType,
        string memory _country
    ) public onlyAdmin {
        require(bytes(institutions[_institutionAddress].institutionId).length == 0, "Institution already registered");
        require(institutionIdToAddress[_institutionId] == address(0), "Institution ID already exists");
        
        institutions[_institutionAddress] = Institution({
            institutionId: _institutionId,
            name: _name,
            institutionType: _institutionType,
            country: _country,
            isActive: true,
            registrationDate: block.timestamp
        });
        
        institutionIdToAddress[_institutionId] = _institutionAddress;
        
        emit InstitutionRegistered(
            _institutionAddress,
            _institutionId,
            _name,
            block.timestamp
        );
    }
    
    function setInstitutionStatus(address _institutionAddress, bool _isActive) public onlyAdmin {
        require(bytes(institutions[_institutionAddress].institutionId).length != 0, "Institution not registered");
        
        institutions[_institutionAddress].isActive = _isActive;
        
        emit InstitutionStatusChanged(_institutionAddress, _isActive);
    }
    
    function isRegistered(address _institutionAddress) public view returns (bool) {
        return bytes(institutions[_institutionAddress].institutionId).length != 0 && 
               institutions[_institutionAddress].isActive;
    }
    
    function getInstitutionDetails(address _institutionAddress) public view returns (
        string memory institutionId,
        string memory name,
        string memory institutionType,
        string memory country,
        bool isActive,
        uint256 registrationDate
    ) {
        Institution memory inst = institutions[_institutionAddress];
        
        require(bytes(inst.institutionId).length != 0, "Institution not registered");
        
        return (
            inst.institutionId,
            inst.name,
            inst.institutionType,
            inst.country,
            inst.isActive,
            inst.registrationDate
        );
    }
    
    function getInstitutionByID(string memory _institutionId) public view returns (
        address institutionAddress,
        string memory name,
        string memory institutionType,
        string memory country,
        bool isActive,
        uint256 registrationDate
    ) {
        institutionAddress = institutionIdToAddress[_institutionId];
        
        require(institutionAddress != address(0), "Institution ID not found");
        
        Institution memory inst = institutions[institutionAddress];
        
        return (
            institutionAddress,
            inst.name,
            inst.institutionType,
            inst.country,
            inst.isActive,
            inst.registrationDate
        );
    }
}