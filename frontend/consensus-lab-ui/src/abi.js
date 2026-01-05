export const BLOCK_VOTING_ABI = [
    // --- Roles / config ---
    "function owner() view returns (address)",
    "function validatorCount() view returns (uint256)",
    "function quorum() view returns (uint256)",
    "function isValidator(address) view returns (bool)",

    // --- Proposals ---
    "function proposalCount() view returns (uint256)",
    "function proposals(uint256) view returns (uint8 proposalType, bytes32 blockHash, address validatorAddress, string summary, uint64 createdAt, uint64 deadline, uint8 status, uint32 yesVotes, uint32 noVotes)",

    // --- OWNER actions ---
    "function createProposal(bytes32 blockHash, string summary, uint64 durationSeconds) returns (uint256)",
    "function createAddValidatorProposal(address newValidator, string summary, uint64 durationSeconds) returns (uint256)",

    // --- VALIDATOR actions ---
    "function vote(uint256 proposalId, bool support)",

    // --- Events (optional but useful for UI / explorer) ---
    "event ProposalCreated(uint256 indexed proposalId, bytes32 blockHash, uint64 deadline, string summary)",
    "event ProposalFinalized(uint256 indexed proposalId, uint8 status, uint32 yesVotes, uint32 noVotes)",
    "event ValidatorAdded(address indexed validator)"
];