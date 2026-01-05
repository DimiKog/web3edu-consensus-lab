import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { CONFIG } from "./config";
import { BLOCK_VOTING_ABI } from "./abi";

export default function App() {
  const [account, setAccount] = useState("");
  const [chainOk, setChainOk] = useState(true);

  const [validatorCount, setValidatorCount] = useState(null);
  const [quorum, setQuorum] = useState(null);
  const [proposalCount, setProposalCount] = useState(null);
  const [error, setError] = useState("");

  const [owner, setOwner] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  const [proposalSummary, setProposalSummary] = useState("");
  const [proposalDuration, setProposalDuration] = useState(600);
  const [proposalType, setProposalType] = useState("BLOCK"); // BLOCK | ADD_VALIDATOR
  const [newValidatorAddress, setNewValidatorAddress] = useState("");
  const [txStatus, setTxStatus] = useState("");

  const [isValidator, setIsValidator] = useState(false);
  const [latestProposalId, setLatestProposalId] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [proposalActive, setProposalActive] = useState(true);

  const [proposalStatus, setProposalStatus] = useState("UNKNOWN");
  const [yesVotes, setYesVotes] = useState(0);
  const [noVotes, setNoVotes] = useState(0);
  const [currentProposalType, setCurrentProposalType] = useState(null); // 0=BLOCK, 1=ADD_VALIDATOR
  const [currentValidatorAddress, setCurrentValidatorAddress] = useState("");

  const readProvider = useMemo(() => new ethers.JsonRpcProvider(CONFIG.rpcUrl), []);
  const readContract = useMemo(
    () => new ethers.Contract(CONFIG.contractAddress, BLOCK_VOTING_ABI, readProvider),
    [readProvider]
  );


  // Refresh owner/validator roles for a given address
  const refreshRoles = async (address) => {
    const contractOwner = await readContract.owner();
    setOwner(contractOwner);
    setIsOwner(contractOwner.toLowerCase() === address.toLowerCase());

    const validator = await readContract.isValidator(address);
    setIsValidator(validator);
  };

  const connectWallet = async () => {
    try {
      setError("");
      if (!window.ethereum) {
        alert("MetaMask not detected");
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();

      setAccount(address);
      setChainOk(Number(network.chainId) === CONFIG.chainId);

      await refreshRoles(address);
    } catch (e) {
      setError(e?.message || String(e));
    }
  };
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        setAccount("");
        setIsOwner(false);
        setIsValidator(false);
        return;
      }
      const addr = accounts[0];
      setAccount(addr);
      setHasVoted(false);
      await refreshRoles(addr);
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, []);

  const loadChainState = async () => {
    try {
      setError("");
      const [vc, q, pc] = await Promise.all([
        readContract.validatorCount(),
        readContract.quorum(),
        readContract.proposalCount()
      ]);
      setValidatorCount(Number(vc));
      setQuorum(Number(q));
      setProposalCount(Number(pc));
      if (Number(pc) > 0) {
        const pid = Number(pc);
        setLatestProposalId(pid);

        const p = await readContract.proposals(pid);
        setCurrentProposalType(Number(p.proposalType));
        setCurrentValidatorAddress(p.validatorAddress);
        const status = Number(p.status); // 0=Active, 1=Accepted, 2=Rejected
        setProposalActive(status === 0);

        if (status === 0) setProposalStatus("Active");
        if (status === 1) setProposalStatus("Accepted");
        if (status === 2) setProposalStatus("Rejected");

        setYesVotes(Number(p.yesVotes));
        setNoVotes(Number(p.noVotes));
      } else {
        setLatestProposalId(null);
        setProposalActive(false);
      }
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const createProposal = async () => {
    try {
      setError("");
      setTxStatus("");

      if (!isOwner) {
        setError("Only contract owner can create proposals");
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        CONFIG.contractAddress,
        BLOCK_VOTING_ABI,
        signer
      );

      let tx;

      if (proposalType === "BLOCK") {
        const blockHash = ethers.keccak256(
          ethers.toUtf8Bytes(proposalSummary + Date.now())
        );

        tx = await contract.createProposal(
          blockHash,
          proposalSummary,
          proposalDuration
        );
      } else {
        if (!ethers.isAddress(newValidatorAddress)) {
          setError("Invalid validator address");
          return;
        }

        tx = await contract.createAddValidatorProposal(
          newValidatorAddress,
          proposalSummary,
          proposalDuration
        );
      }

      setTxStatus("Transaction sent. Waiting for confirmation...");
      await tx.wait();
      setTxStatus("Proposal created successfully");

      setProposalSummary("");
      setNewValidatorAddress("");
      await loadChainState();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const vote = async (support) => {
    try {
      setError("");
      setTxStatus("");

      if (!isValidator) {
        setError("Only validators can vote");
        return;
      }

      if (!latestProposalId) {
        setError("No active proposal to vote on");
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        CONFIG.contractAddress,
        BLOCK_VOTING_ABI,
        signer
      );

      const tx = await contract.vote(latestProposalId, support);
      setTxStatus("Vote submitted. Waiting for confirmation...");
      await tx.wait();
      setTxStatus("Vote recorded successfully");

      setHasVoted(true);
      await loadChainState();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  useEffect(() => {
    loadChainState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        padding: 40,
        fontFamily: "system-ui",
        backgroundColor: "#121212",
        color: "#eaeaea",
        minHeight: "100vh"
      }}
    >
      <h1>Consensus Lab – Block Voting</h1>

      {!account ? (
        <button onClick={connectWallet}>Connect MetaMask</button>
      ) : (
        <>
          <p>
            <b>Connected wallet:</b> {account}
          </p>
          {!chainOk && (
            <p style={{ color: "crimson" }}>
              Wrong network — switch MetaMask to chainId {CONFIG.chainId}
            </p>
          )}
        </>
      )}

      <hr />

      <p>
        <b>RPC:</b> <code><span style={{ color: "#93c5fd" }}>{CONFIG.rpcUrl}</span></code>
      </p>
      <p>
        <b>Contract:</b> <code><span style={{ color: "#93c5fd" }}>{CONFIG.contractAddress}</span></code>
      </p>

      {isOwner && (
        <div
          style={{
            marginTop: 30,
            padding: 16,
            border: "1px solid #333",
            borderRadius: 10,
            background: "#1e1e1e"
          }}
        >
          <h3>Create Proposal (Owner)</h3>

          <label style={{ fontSize: 12 }}>Proposal type</label>
          <select
            value={proposalType}
            onChange={(e) => setProposalType(e.target.value)}
            style={{
              width: "100%",
              padding: 8,
              marginBottom: 10,
              backgroundColor: "#2a2a2a",
              color: "#eaeaea",
              border: "1px solid #444"
            }}
          >
            <option value="BLOCK">🧱 Next Block</option>
            <option value="ADD_VALIDATOR">➕ Add Validator</option>
          </select>

          {latestProposalId && (
            <p style={{ fontSize: 12, color: "#9ca3af" }}>
              Latest proposal:{" "}
              <b>
                {proposalStatus} (
                {currentProposalType === 0 ? "Block" : "Add Validator"})
              </b>
            </p>
          )}

          <input
            type="text"
            placeholder="Proposal summary (e.g. Block #42 transactions)"
            value={proposalSummary}
            onChange={(e) => setProposalSummary(e.target.value)}
            style={{
              width: "100%",
              padding: 8,
              marginBottom: 10,
              backgroundColor: "#2a2a2a",
              color: "#eaeaea",
              border: "1px solid #444"
            }}
          />

          {proposalType === "ADD_VALIDATOR" && (
            <input
              type="text"
              placeholder="New validator wallet address (0x...)"
              value={newValidatorAddress}
              onChange={(e) => setNewValidatorAddress(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                marginBottom: 10,
                backgroundColor: "#2a2a2a",
                color: "#eaeaea",
                border: "1px solid #444"
              }}
            />
          )}

          <input
            type="number"
            value={proposalDuration}
            onChange={(e) => setProposalDuration(Number(e.target.value))}
            style={{
              width: 200,
              padding: 8,
              marginBottom: 10,
              backgroundColor: "#2a2a2a",
              color: "#eaeaea",
              border: "1px solid #444"
            }}
          />
          <div>Duration (seconds)</div>

          <button
            onClick={createProposal}
            disabled={
              !proposalSummary ||
              (proposalType === "ADD_VALIDATOR" && !newValidatorAddress)
            }
            style={{
              marginTop: 10,
              backgroundColor: "#3b82f6",
              color: "#ffffff",
              border: "none",
              padding: "8px 14px",
              borderRadius: 6
            }}
          >
            Create Proposal
          </button>

          {txStatus && (
            <p style={{ marginTop: 10 }}>
              <b>Status:</b> {txStatus}
            </p>
          )}
        </div>
      )}

      {latestProposalId && (
        <div
          style={{
            marginTop: 30,
            padding: 16,
            border: "1px solid #333",
            borderRadius: 10,
            background: "#1e1e1e"
          }}
        >
          <h3>{proposalActive ? "Validator Voting" : "Proposal Result"}</h3>
          <div
            style={{
              display: "inline-block",
              marginBottom: 10,
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 12,
              backgroundColor:
                proposalStatus === "Active"
                  ? "#2563eb"
                  : proposalStatus === "Accepted"
                    ? "#16a34a"
                    : "#dc2626",
              color: "#ffffff"
            }}
          >
            {proposalStatus}
          </div>
          <p>
            <b>Proposal ID:</b> {latestProposalId}
          </p>
          <p>
            <b>Proposal type:</b>{" "}
            {currentProposalType === 0 ? "🧱 Next Block" : "➕ Add Validator"}
          </p>
          {currentProposalType === 1 && (
            <p>
              <b>Proposed validator:</b>{" "}
              <code style={{ color: "#93c5fd" }}>{currentValidatorAddress}</code>
            </p>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
            <button
              onClick={() => vote(true)}
              disabled={!isValidator || hasVoted || !proposalActive}
              style={{
                backgroundColor: "#16a34a",
                color: "#ffffff",
                border: "none",
                padding: "8px 14px",
                borderRadius: 6,
                opacity: (!isValidator || hasVoted || !proposalActive) ? 0.4 : 1,
                cursor: (!isValidator || hasVoted || !proposalActive) ? "not-allowed" : "pointer"
              }}
            >
              Vote YES
            </button>

            <button
              onClick={() => vote(false)}
              disabled={!isValidator || hasVoted || !proposalActive}
              style={{
                backgroundColor: "#dc2626",
                color: "#ffffff",
                border: "none",
                padding: "8px 14px",
                borderRadius: 6,
                opacity: (!isValidator || hasVoted || !proposalActive) ? 0.4 : 1,
                cursor: (!isValidator || hasVoted || !proposalActive) ? "not-allowed" : "pointer"
              }}
            >
              Vote NO
            </button>
          </div>
          <p style={{ marginTop: 10 }}>
            <b>YES votes:</b> {yesVotes} &nbsp; | &nbsp;
            <b>NO votes:</b> {noVotes}
          </p>
          {!proposalActive && (
            <p style={{ marginTop: 12, fontWeight: "bold", color: "#a7f3d0" }}>
              Final decision: {proposalStatus}
            </p>
          )}
          {hasVoted && (
            <p style={{ marginTop: 10, color: "#fbbf24" }}>
              You have already voted on this proposal.
            </p>
          )}
          {!proposalActive && (
            <p style={{ marginTop: 10, color: "#fbbf24" }}>
              This proposal is no longer active.
            </p>
          )}
        </div>
      )}

      <button
        onClick={loadChainState}
        style={{
          backgroundColor: "#2d2d2d",
          color: "#eaeaea",
          border: "1px solid #444",
          padding: "6px 12px",
          borderRadius: 6,
          marginTop: 10
        }}
      >
        Refresh chain state
      </button>

      <div
        style={{
          marginTop: 20,
          padding: 16,
          border: "1px solid #333",
          borderRadius: 10,
          background: "#1e1e1e"
        }}
      >
        <h3>On-chain Consensus Parameters</h3>
        <p>
          <b>Validator count:</b> {validatorCount ?? "…"}
        </p>
        <p>
          <b>Quorum (≥2/3):</b> {quorum ?? "…"}
        </p>
        <p>
          <b>Proposals created:</b> {proposalCount ?? "…"}
        </p>
      </div>

      {error && (
        <div style={{ marginTop: 20, color: "crimson" }}>
          <b>Error:</b> {error}
        </div>
      )}

      <p style={{ marginTop: 30 }}>
        Next: create a proposal and enable validator voting.
      </p>
    </div>
  );
}