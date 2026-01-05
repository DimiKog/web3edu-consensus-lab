// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * BlockVoting — didactic "consensus mirror" for labs.
 * - Instructor creates a proposal (blockHash + summary)
 * - Validators vote YES/NO
 * - Finalize when >= 2/3 quorum reached
 */
contract BlockVoting {
    // -------------------------
    // Roles
    // -------------------------
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // -------------------------
    // Validator set
    // -------------------------
    address[] private _validators;
    mapping(address => bool) public isValidator;

    // -------------------------
    // Proposal storage
    // -------------------------
    enum ProposalType {
        BLOCK,
        ADD_VALIDATOR
    }

    enum Status {
        Active,
        Accepted,
        Rejected,
        Expired
    }

    struct Proposal {
        ProposalType proposalType;
        bytes32 blockHash; // used for BLOCK proposals
        address validatorAddress; // used for ADD_VALIDATOR proposals
        string summary;
        uint64 createdAt;
        uint64 deadline;
        Status status;
        uint32 yesVotes;
        uint32 noVotes;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;

    // vote tracking: proposalId => voter => voted?
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    // vote choice: proposalId => voter => true/false
    mapping(uint256 => mapping(address => bool)) public voteChoice;

    // -------------------------
    // Events
    // -------------------------
    event ValidatorSetInitialized(address[] validators);
    event ProposalCreated(
        uint256 indexed proposalId,
        bytes32 indexed blockHash,
        uint64 deadline,
        string summary
    );
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support
    );
    event ProposalFinalized(
        uint256 indexed proposalId,
        Status status,
        uint32 yesVotes,
        uint32 noVotes
    );
    event ProposalExpired(uint256 indexed proposalId);
    event ValidatorAdded(address indexed validator);

    // -------------------------
    // Constructor
    // -------------------------
    constructor(address[] memory validators_) {
        require(validators_.length >= 3, "Need >= 3 validators");
        owner = msg.sender;

        for (uint256 i = 0; i < validators_.length; i++) {
            address v = validators_[i];
            require(v != address(0), "Zero address");
            require(!isValidator[v], "Duplicate validator");
            isValidator[v] = true;
            _validators.push(v);
        }

        emit ValidatorSetInitialized(_validators);
    }

    // -------------------------
    // View helpers
    // -------------------------
    function validatorCount() public view returns (uint256) {
        return _validators.length;
    }

    function validators() external view returns (address[] memory) {
        return _validators;
    }

    /// 2/3 quorum, rounded up. Example: n=3 => 2, n=4 => 3, n=5 => 4, n=7 => 5
    function quorum() public view returns (uint256) {
        uint256 n = _validators.length;
        return (2 * n + 2) / 3; // ceil(2n/3)
    }

    function isActive(uint256 proposalId) public view returns (bool) {
        Proposal memory p = proposals[proposalId];
        return (p.status == Status.Active && block.timestamp <= p.deadline);
    }

    // -------------------------
    // Owner actions
    // -------------------------
    function createProposal(
        bytes32 blockHash,
        string calldata summary,
        uint64 durationSeconds
    ) external onlyOwner returns (uint256) {
        require(durationSeconds >= 60, "Duration too short");
        proposalCount += 1;

        uint64 nowTs = uint64(block.timestamp);
        uint64 dl = nowTs + durationSeconds;

        proposals[proposalCount] = Proposal({
            proposalType: ProposalType.BLOCK,
            blockHash: blockHash,
            validatorAddress: address(0),
            summary: summary,
            createdAt: nowTs,
            deadline: dl,
            status: Status.Active,
            yesVotes: 0,
            noVotes: 0
        });

        emit ProposalCreated(proposalCount, blockHash, dl, summary);
        return proposalCount;
    }

    function createAddValidatorProposal(
        address newValidator,
        string calldata summary,
        uint64 durationSeconds
    ) external onlyOwner returns (uint256) {
        require(newValidator != address(0), "Zero address");
        require(!isValidator[newValidator], "Already validator");
        require(durationSeconds >= 60, "Duration too short");

        proposalCount += 1;

        uint64 nowTs = uint64(block.timestamp);
        uint64 dl = nowTs + durationSeconds;

        proposals[proposalCount] = Proposal({
            proposalType: ProposalType.ADD_VALIDATOR,
            blockHash: bytes32(0),
            validatorAddress: newValidator,
            summary: summary,
            createdAt: nowTs,
            deadline: dl,
            status: Status.Active,
            yesVotes: 0,
            noVotes: 0
        });

        emit ProposalCreated(proposalCount, bytes32(0), dl, summary);
        return proposalCount;
    }

    /// If a proposal passes its deadline while still Active, anyone can expire it.
    function expireIfNeeded(uint256 proposalId) public {
        Proposal storage p = proposals[proposalId];
        require(p.status == Status.Active, "Not active");
        require(block.timestamp > p.deadline, "Not expired yet");

        p.status = Status.Expired;
        emit ProposalExpired(proposalId);
        emit ProposalFinalized(proposalId, p.status, p.yesVotes, p.noVotes);
    }

    // -------------------------
    // Validator voting
    // -------------------------
    function vote(uint256 proposalId, bool support) external {
        require(isValidator[msg.sender], "Not validator");

        Proposal storage p = proposals[proposalId];
        require(p.createdAt != 0, "Unknown proposal");

        if (p.status == Status.Active && block.timestamp > p.deadline) {
            // auto-expire on interaction
            p.status = Status.Expired;
            emit ProposalExpired(proposalId);
            emit ProposalFinalized(proposalId, p.status, p.yesVotes, p.noVotes);
            return;
        }

        require(p.status == Status.Active, "Not active");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        hasVoted[proposalId][msg.sender] = true;
        voteChoice[proposalId][msg.sender] = support;

        if (support) p.yesVotes += 1;
        else p.noVotes += 1;

        emit VoteCast(proposalId, msg.sender, support);

        // finalize as soon as quorum reached
        uint256 q = quorum();

        if (p.yesVotes >= q) {
            p.status = Status.Accepted;

            // Apply governance decision
            if (p.proposalType == ProposalType.ADD_VALIDATOR) {
                address v = p.validatorAddress;
                if (!isValidator[v]) {
                    isValidator[v] = true;
                    _validators.push(v);
                    emit ValidatorAdded(v);
                }
            }

            emit ProposalFinalized(proposalId, p.status, p.yesVotes, p.noVotes);
        } else if (p.noVotes >= q) {
            p.status = Status.Rejected;
            emit ProposalFinalized(proposalId, p.status, p.yesVotes, p.noVotes);
        }
    }
}
