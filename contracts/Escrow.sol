// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Escrow is Ownable {
    error Escrow__INVALID_PAYMENT_AMOUNT();
    error Escrow__NO_FUNDS_DEPOSITED();
    error Escrow__ERROR_WHILE_SENDING_ETH(address from_, address to_);
    error Escrow__INVALID_PRICE_VALUE(uint256 price_);
    error Escrow__INVALID_ADDRESS(address seller_, address escrowAgent_);
    error Escrow__ESCROW_AGENT_ONLY(address caller_);

    address public seller;
    uint256 public price = 0.005 ether;
    address public escrowAgent;
    bool public isFunded = false;
    uint256 public constant IDLength = 15;
    uint256 public nextID;

    event FundsDeposited(address indexed buyer_, uint256 amount_);
    event FundsReleased(
        address indexed buyer_,
        address indexed seller_,
        uint256 amount_
    );
    event TransactionCancelled(address indexed buyer_, uint256 amount_);
    event NewSaleMade(
        address indexed buyer_,
        address indexed seller_,
        uint256 funds_,
        string indexed salesId_
    );

    mapping(address => uint256) private s_buyerToAmountDeposited;
    mapping(address => string[]) private s_salesIDs;

    modifier onlyEscrowAgent() {
        if (msg.sender != escrowAgent) {
            revert Escrow__ESCROW_AGENT_ONLY(msg.sender);
        }
        _;
    }

    constructor(address _seller, address _escrowAgent) Ownable(msg.sender) {
        if (_seller == address(0) || _escrowAgent == address(0)) {
            revert Escrow__INVALID_ADDRESS(_seller, _escrowAgent);
        }
        seller = _seller;
        escrowAgent = _escrowAgent;
    }

    function setPrice(uint256 _price) external onlyOwner {
        if (_price <= 0) {
            revert Escrow__INVALID_PRICE_VALUE(_price);
        }
        price = _price;
    }

    function depositFunds() external payable {
        if (msg.value != price) {
            revert Escrow__INVALID_PAYMENT_AMOUNT();
        }

        s_buyerToAmountDeposited[msg.sender] += msg.value;
        emit FundsDeposited(msg.sender, msg.value);
    }

    function releaseFunds(address _buyer) external onlyEscrowAgent {
        uint256 funds = s_buyerToAmountDeposited[_buyer];
        if (funds == 0) {
            revert Escrow__NO_FUNDS_DEPOSITED();
        }
        (bool success, ) = seller.call{value: funds}("");
        if (!success) {
            revert Escrow__ERROR_WHILE_SENDING_ETH(_buyer, seller);
        }
        string memory newSalesId = generateUniqueID();
        s_salesIDs[_buyer].push(newSalesId);
        emit FundsReleased(_buyer, seller, funds);
        emit NewSaleMade(_buyer, seller, funds, newSalesId);
    }

    function cancelTransaction(address _buyer) external onlyEscrowAgent {
        uint256 funds = s_buyerToAmountDeposited[_buyer];
        if (funds == 0) {
            revert Escrow__NO_FUNDS_DEPOSITED();
        }

        (bool success, ) = _buyer.call{value: funds}("");
        if (!success) {
            revert Escrow__ERROR_WHILE_SENDING_ETH(_buyer, seller);
        }
        emit TransactionCancelled(_buyer, funds);
    }

    function generateUniqueID() internal returns (string memory) {
        bytes memory characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        bytes memory result = new bytes(IDLength);
        bool unique;
        uint256 attempts = 0;

        do {
            bytes32 hash = keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    msg.sender,
                    nextID,
                    attempts
                )
            );
            unique = true;

            for (uint256 i = 0; i < IDLength; i++) {
                uint256 randIndex = uint256(uint8(hash[i % 32])) %
                    characters.length;
                result[i] = characters[randIndex];
            }

            string memory newID = string(result);
            for (uint256 i = 0; i < s_salesIDs[msg.sender].length; i++) {
                if (
                    keccak256(abi.encodePacked(s_salesIDs[msg.sender][i])) ==
                    keccak256(abi.encodePacked(newID))
                ) {
                    unique = false;
                    break;
                }
            }

            attempts++;
        } while (!unique && attempts < 10);

        if (!unique) {
            revert("Failed to generate a unique ID after several attempts.");
        }
        nextID++;
        return string(result);
    }

    function getSellerAddress() public view returns (address) {
        return seller;
    }

    function getEscrowAddress() public view returns (address) {
        return escrowAgent;
    }

    function getCurrentPrice() public view returns (uint256) {
        return price;
    }

    function getBuyerToAmountDeposited(
        address _buyer
    ) public view returns (uint256) {
        return s_buyerToAmountDeposited[_buyer];
    }

    function getSalesIds(address _buyer) public view returns (string[] memory) {
        return s_salesIDs[_buyer];
    }
}
