export const BLOCK_VOTING_ABI = [
    "function owner() view returns (address)",
    "function validatorCount() view returns (uint256)",
    "function quorum() view returns (uint256)",
    "function proposalCount() view returns (uint256)",
    "function proposals(uint256) view returns (bytes32 blockHash, string summary, uint64 createdAt, uint64 deadline, uint8 status, uint32 yesVotes, uint32 noVotes)",
    "function isValidator(address) view returns (bool)",
    "function vote(uint256 proposalId, bool support)"
];